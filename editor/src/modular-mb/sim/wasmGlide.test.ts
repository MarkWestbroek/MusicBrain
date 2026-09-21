// Glide voor wasm-stemmen, gelopen door de worklet-host.
//
// De Teensy glijdt: MidiInModule::tick() schuift elke stem per milliseconde
// met een vaste stap naar zijn doelnoot (glide = ms per octaaf). De sim deed
// dat alleen voor de Tone-VCO's; een wasm-module als Elements kreeg zijn
// V/Oct als vaste waarde en sprong. Nu loopt de host de handmatige ingang met
// dezelfde vaste snelheid naar het doel, per sample in de audiothread.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 48000;                    // Plaits draait native op 48 kHz: tijd = tijd

class FakePort {
  private fn: ((e: { data: unknown }) => void) | null = null;
  postMessage(): void { /* 'ready' doet hier niet ter zake */ }
  set onmessage(fn: ((e: { data: unknown }) => void) | null) { this.fn = fn; }
  get onmessage(): ((e: { data: unknown }) => void) | null { return this.fn; }
  send(m: unknown): void { this.fn?.({ data: m }); }
}
interface Input { id: string; manual: number }
interface Proc {
  port: FakePort;
  ins: Input[];
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: unknown): boolean;
}
type ProcCtor = new (o: { processorOptions: unknown }) => Proc;
let Processor: ProcCtor | null = null;

const INPUTS  = ['voct', 'gate'];
const OUTPUTS = ['out_l', 'out_r'];

function host(): { p: Proc; run: (ms: number) => void; voct: () => number } {
  const wasm = new Uint8Array(readFileSync(
    fileURLToPath(new URL('../../../public/wasm/tp_mmb_plaits.wasm', import.meta.url))));
  const p = new Processor!({ processorOptions: { wasm, inputs: INPUTS, outputs: OUTPUTS } });
  const inBuf  = INPUTS.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = OUTPUTS.map(() => [new Float32Array(QUANTUM)]);
  const run = (ms: number): void => {
    for (let b = 0; b < Math.round(CTX * ms / 1000 / QUANTUM); b++) p.process(inBuf, outBuf, {});
  };
  const voct = (): number => p.ins.find((x) => x.id === 'voct')!.manual;
  return { p, run, voct };
}

describe('glide op een handmatige ingang', () => {
  beforeAll(async () => {
    vi.stubGlobal('sampleRate', CTX);
    vi.stubGlobal('AudioWorkletProcessor', class { port = new FakePort(); });
    vi.stubGlobal('registerProcessor', (_n: string, cls: ProcCtor) => { Processor = cls; });
    const url = new URL('../../../public/wasm/mmb-worklet.js', import.meta.url).href;
    await import(/* @vite-ignore */ `${url}?glide`);
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('springt zonder slew, zoals altijd', () => {
    const { p, run, voct } = host();
    p.port.send({ t: 'in', id: 'voct', v: 1 });
    run(5);
    expect(voct()).toBe(1);
  });

  it('loopt met slew in een rechte lijn naar de noot, zoals de firmware', () => {
    // Glide 500 ms per octaaf → 2 V/s. Een octaaf omhoog duurt dus 500 ms.
    const { p, run, voct } = host();
    p.port.send({ t: 'in', id: 'voct', v: 1, slew: 1000 / 500 });
    run(250);
    // De host rendert een paar blokken vooruit; ruim binnen een halve toon.
    expect(voct()).toBeGreaterThan(0.45);
    expect(voct()).toBeLessThan(0.55);
    run(300);
    expect(voct()).toBe(1);                       // aangekomen, niet voorbij
  });

  it('glijdt ook omlaag, en vanaf waar hij halverwege was', () => {
    const { p, run, voct } = host();
    p.port.send({ t: 'in', id: 'voct', v: 1, slew: 2 });
    run(250);
    const halverwege = voct();
    p.port.send({ t: 'in', id: 'voct', v: 0, slew: 2 });   // nieuwe noot tijdens de glide
    run(100);
    expect(voct()).toBeLessThan(halverwege);
    expect(halverwege - voct()).toBeCloseTo(0.2, 1);        // 100 ms × 2 V/s
  });
});
