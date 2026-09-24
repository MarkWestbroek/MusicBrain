// Gedeelde `bend`-ingang van de sampler: één V/Oct-kabel (MidiIn.Bend, of een
// LFO) bovenop de V/Oct van élke cel, ook in een PolyGroup. De nootkeuze bij
// gate-op blijft op de kale voct_k; de bend is modulatie en verschuift alleen
// de afspeelsnelheid. Meting: tel de stijgende nuldoorgangen van een
// zaagtand-sample — 1 V op `bend` moet de frequentie verdubbelen.

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
  await import(/* @vite-ignore */ `${url}?bend`);
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

/** Zaagtand van 110 Hz op root 45 (A2): unity pitch op midi 45. */
function sawSample(frames: number): Int16Array {
  const data = new Int16Array(frames);
  let ph = 0;
  for (let i = 0; i < frames; i++) { data[i] = Math.round(11000 * (2 * (ph % 1) - 1)); ph += 110 / 44100; }
  return data;
}

/** Grondtoon uit de stijgende nuldoorgangen (zaagtand: één per periode). */
function fundamental(x: Float32Array, rate: number): number {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) n++;
  return n * rate / x.length;
}

/**
 * Speelt midi 45 (voct_1 = -15/12 V) op cel 1 met `bend` als constante CV,
 * en meet de grondtoon over 0,4 s (na de aanloop van de host).
 */
async function play(bend: number, cabled: boolean): Promise<number> {
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
  for (const [id, v] of Object.entries({ filter: 0, level: 0.8, limit: 0 })) p.port.send({ t: 'ctl', id, v });
  p.port.send({ t: 'in', id: 'voct_1', v: -15 / 12 });
  p.port.send({ t: 'in', id: 'vel_1',  v: 0.9 });
  p.port.send({ t: 'in', id: 'gate_1', v: 1 });
  if (cabled) p.port.send({ t: 'cabled', id: 'bend', on: true });

  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  inBuf[inputs.indexOf('bend')]![0]!.fill(bend);
  const outCh = outBuf[outputs.indexOf('out_l')]![0]!;

  const blocks = Math.round(CTX * 0.5 / QUANTUM);
  const rec = new Float32Array(blocks * QUANTUM);
  let w = 0;
  for (let b = 0; b < blocks; b++) {
    p.process(inBuf, outBuf, {});
    rec.set(outCh, w); w += QUANTUM;
  }
  return fundamental(rec.subarray(QUANTUM * 30), CTX);
}

describe('sampler bend-ingang (gedeeld, V/Oct)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('staat de sampler-wasm op het paneel als `bend`', async () => {
    const { inputs } = await portsOf(wasmBytes('tp_mmb_sampler'));
    expect(inputs).toContain('bend');
  });

  it('zonder bend klinkt midi 45 op 110 Hz', async () => {
    expect(await play(0, true)).toBeCloseTo(110, -1);
  });

  it('1 V op bend = een octaaf omhoog, -1 V = een octaaf omlaag', async () => {
    expect(await play(1, true)).toBeCloseTo(220, -1);
    expect(await play(-1, true)).toBeCloseTo(55, -1);
  });

  it('een losse (niet-bekabelde) bend-jack doet niets', async () => {
    expect(await play(1, false)).toBeCloseTo(110, -1);
  });
});
