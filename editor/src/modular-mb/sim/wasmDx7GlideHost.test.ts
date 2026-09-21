// DX7 met glide door de hele sim-keten: worklet-host, het `in`-bericht met
// `slew` dat de engine bij een aanslag stuurt, en de DX7-wasm.
//
// wasmDx7Glide.test.ts stuurt de kern rechtstreeks aan. Deze test doet het
// zoals de sim het echt doet, en bewijst dat die keten glijdt. Een opname die
// per noot op een vaste, verkeerde toon blijft hangen, komt dus niet uit deze
// code — bij de eerste melding bleek de browser nog de oude DX7-wasm uit zijn
// cache te draaien (zie WasmModule.loadWasm, `cache: 'no-cache'`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 48000;

class FakePort {
  private fn: ((e: { data: unknown }) => void) | null = null;
  postMessage(): void { /* 'ready' doet hier niet ter zake */ }
  set onmessage(fn: ((e: { data: unknown }) => void) | null) { this.fn = fn; }
  get onmessage(): ((e: { data: unknown }) => void) | null { return this.fn; }
  send(m: unknown): void { this.fn?.({ data: m }); }
}
interface Proc {
  port: FakePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: unknown): boolean;
}
type ProcCtor = new (o: { processorOptions: unknown }) => Proc;
let Processor: ProcCtor | null = null;

/** Autocorrelatie met parabolische verfijning (zie wasmDx7Glide.test.ts). */
function midiAt(x: number[], start: number): number {
  const W = Math.round(0.04 * CTX);
  const corr = (lag: number): number => {
    let c = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < W; i++) {
      const a = x[start + i]!, b = x[start + i + lag]!;
      c += a * b; e1 += a * a; e2 += b * b;
    }
    return c / Math.sqrt(e1 * e2 + 1e-12);
  };
  let best = 0, lag = 0;
  for (let l = Math.round(CTX / 1200); l < Math.round(CTX / 60); l++) {
    const r = corr(l);
    if (r > best + 0.02) { best = r; lag = l; }
  }
  while (corr(lag + 1) > corr(lag)) lag++;
  while (corr(lag - 1) > corr(lag)) lag--;
  const a = corr(lag - 1), b = corr(lag), c = corr(lag + 1);
  const hz = CTX / (lag + (a - c) / (2 * (a - 2 * b + c)));
  return 69 + 12 * Math.log2(hz / 440);
}

describe('DX7 glijdt door de worklet-host zoals de engine hem aanstuurt', () => {
  beforeAll(async () => {
    vi.stubGlobal('sampleRate', CTX);
    vi.stubGlobal('AudioWorkletProcessor', class { port = new FakePort(); });
    vi.stubGlobal('registerProcessor', (_n: string, cls: ProcCtor) => { Processor = cls; });
    const url = new URL('../../../public/wasm/mmb-worklet.js', import.meta.url).href;
    await import(/* @vite-ignore */ `${url}?dx7host`);
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('komt bij elke noot van de toonladder op zijn doel uit', () => {
    const wasm = new Uint8Array(readFileSync(
      fileURLToPath(new URL('../../../public/wasm/tp_mmb_dx7.wasm', import.meta.url))));
    const inputs = ['voct', 'gate', 'vel'];
    const p = new Processor!({ processorOptions: { wasm, inputs, outputs: ['out'] } });
    const inBuf = inputs.map(() => [new Float32Array(QUANTUM)]);
    const outBuf = [[new Float32Array(QUANTUM)]];
    const rec: number[] = [];
    const run = (ms: number): void => {
      for (let b = 0; b < Math.round(CTX * ms / 1000 / QUANTUM); b++) {
        p.process(inBuf, outBuf, {});
        rec.push(...outBuf[0]![0]!);
      }
    };

    // C3 D3 E3 F3 G3 met glide 180 ms/oct: eerste noot zonder slew (de
    // firmware zet de eerste noot van een stem meteen goed), daarna met.
    const slew = 1000 / 180;
    const notes = [48, 50, 52, 53, 55];
    const onsets: number[] = [];
    notes.forEach((m, i) => {
      onsets.push(rec.length);
      p.port.send(i ? { t: 'in', id: 'voct', v: (m - 60) / 12, slew } : { t: 'in', id: 'voct', v: (m - 60) / 12 });
      p.port.send({ t: 'in', id: 'vel', v: 0.8 });
      p.port.send({ t: 'in', id: 'gate', v: 1 });
      run(300);
      p.port.send({ t: 'in', id: 'gate', v: 0 });
      run(100);
    });

    notes.forEach((m, i) => {
      // Na 60 ms is een glide van twee halve tonen (33 ms) allang klaar.
      expect(Math.abs(midiAt(rec, onsets[i]! + Math.round(0.06 * CTX)) - m)).toBeLessThan(0.1);
      expect(Math.abs(midiAt(rec, onsets[i]! + Math.round(0.25 * CTX)) - m)).toBeLessThan(0.1);
    });
  });
});
