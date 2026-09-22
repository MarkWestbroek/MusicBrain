// Limiter op de som van de sampler. Een zingende MS-20 houdt per stem rond de
// ±1, en een paar stemmen samen liggen daar ruim boven; tussen modules wordt
// dat hard afgeknipt (op de Teensy is het 16 bits), en dat hoor je als
// digitale overdrive. Met `limit` aan blijft de som binnen ±1 zonder platte
// toppen; uit geeft het oude harde knippen.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 48000;

class FakePort {
  private fn: ((e: { data: unknown }) => void) | null = null;
  postMessage(): void { /* de 'ready' van de host interesseert ons niet */ }
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

async function loadHost(): Promise<void> {
  vi.stubGlobal('sampleRate', CTX);
  vi.stubGlobal('AudioWorkletProcessor', class { port = new FakePort(); });
  vi.stubGlobal('registerProcessor', (_n: string, cls: ProcCtor) => { Processor = cls; });
  const url = new URL('../../../public/wasm/mmb-worklet.js', import.meta.url).href;
  await import(/* @vite-ignore */ `${url}?limit`);
}

const wasmBytes = (typeId: string): Uint8Array => new Uint8Array(readFileSync(
  fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url))));

/** Poort-ids uit de wasm zelf (de catalogus noemt dezelfde). */
async function portsOf(bytes: Uint8Array): Promise<{ inputs: string[]; outputs: string[] }> {
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as Record<string, never> & {
    memory: WebAssembly.Memory;
  };
  const call = (n: string, ...a: number[]): number =>
    (ex as unknown as Record<string, (...x: number[]) => number>)[n]!(...a);
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  const inputs: string[] = [], outputs: string[] = [];
  for (let i = 0; i < call('mmb_num_inputs'); i++)  inputs.push(cstr(call('mmb_input_id', i)));
  for (let i = 0; i < call('mmb_num_outputs'); i++) outputs.push(cstr(call('mmb_output_id', i)));
  return { inputs, outputs };
}

/** Zaagtand van 110 Hz: genoeg boventonen om een filter te horen bewegen. */
function sawSample(frames: number): Int16Array {
  const data = new Int16Array(frames);
  let ph = 0;
  for (let i = 0; i < frames; i++) { data[i] = Math.round(11000 * (2 * (ph % 1) - 1)); ph += 110 / 44100; }
  return data;
}

interface Run { peak: number; flat: number }

/** Zes stemmen, MS-20 op hoge resonantie: de som zingt ver boven ±1. */
async function play(limit: number): Promise<Run> {
  const bytes = wasmBytes('tp_mmb_sampler');
  const { inputs, outputs } = await portsOf(bytes);
  const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } });

  const frames = 44100;
  p.port.send({ t: 'blob', slot: 0, rate: 44100, channels: 1, data: sawSample(frames) });
  p.port.send({ t: 'zones', zones: [{
    slot: 0, lowKey: 0, highKey: 127, lowVel: 1, highVel: 127, root: 45, tuneCents: 0,
    gain: 1, pan: 0, loopMode: 2, loopStart: 0, loopEnd: frames - 1,
    decay: 0, release: 0.2, velTrack: 0, attack: 0,
  }] });
  for (const [id, v] of Object.entries({
    filter: 2, cutoff: 600, q: 0.9, fmode: 0, drive: 1.5, level: 0.8, limit,
  })) p.port.send({ t: 'ctl', id, v });
  const notes = [0, 4, 7, 12, 16, 19];
  notes.forEach((n, i) => {
    p.port.send({ t: 'in', id: `voct_${i + 1}`, v: n / 12 });
    p.port.send({ t: 'in', id: `vel_${i + 1}`,  v: 1 });
    p.port.send({ t: 'in', id: `gate_${i + 1}`, v: 1 });
  });

  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  const outCh  = outBuf[outputs.indexOf('out_l')]![0]!;
  let peak = 0, flat = 0, n = 0;
  for (let b = 0; b < Math.round(CTX * 1.0 / QUANTUM); b++) {
    p.process(inBuf, outBuf, {});
    if (b < 20) continue;                          // aanloop van de host
    for (const v of outCh) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) flat++;
      n++;
    }
  }
  return { peak, flat: flat / n };
}

describe('sampler limiter (limit)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('knipt zonder limiter hard af op ±1', async () => {
    const hard = await play(0);
    // De host resamplet 44,1 → 48 kHz; die interpolatie schiet net over een
    // geknipte top heen, dus 'rond 1' en niet precies 1.
    expect(hard.peak).toBeGreaterThan(0.99);
    expect(hard.flat).toBeGreaterThan(0.01);      // platte toppen
  }, 30_000);

  it('houdt de som met limiter binnen ±1, zonder platte toppen', async () => {
    const lim = await play(1);
    expect(lim.peak).toBeLessThanOrEqual(1);
    expect(lim.flat).toBeLessThan(0.0005);
  }, 30_000);
});
