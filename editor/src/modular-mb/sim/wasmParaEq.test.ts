// Para-EQ (SSL/API-stijl, tp_mmb_para_eq) door de worklet-host heen; de kern
// mmb_dsp::ParamEq is dezelfde als op de Teensy. Vastgelegd: vlak, bell/shelf
// op LF en HF, de Q van de middenbanden, de proportionele Q, HPF/LPF met de
// uit-stand, Bypass en ±1.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 44100;          // gelijk aan de native rate: geen resampling in de meting

const TYPE = 'tp_mmb_para_eq';

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
  await import(/* @vite-ignore */ `${url}?para`);
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

interface Out { l: Float32Array; gr: Float32Array }

/**
 * Stuurt `sig(t)` (seconden → sample) door de compressor en geeft L en GR
 * terug. `ctl` zet de knoppen.
 */
async function run(ctl: Record<string, number>, secs: number, sig: (t: number) => number): Promise<Out> {
  const bytes = wasmBytes(TYPE);
  const { inputs, outputs } = await portsOf(bytes);
  const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } });
  for (const [id, v] of Object.entries(ctl)) p.port.send({ t: 'ctl', id, v });
  p.port.send({ t: 'cabled', id: 'in_l', on: true });
  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  const inL = inBuf[inputs.indexOf('in_l')]![0]!;
  const oL  = outBuf[outputs.indexOf('out_l')]![0]!;
  const oGr = outBuf[outputs.indexOf('gr')]?.[0] ?? new Float32Array(QUANTUM);  // EQ heeft geen GR
  const blocks = Math.ceil(secs * CTX / QUANTUM);
  const l = new Float32Array(blocks * QUANTUM), gr = new Float32Array(blocks * QUANTUM);
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < QUANTUM; i++) inL[i] = sig((b * QUANTUM + i) / CTX);
    p.process(inBuf, outBuf, {});
    l.set(oL, b * QUANTUM); gr.set(oGr, b * QUANTUM);
  }
  return { l, gr };
}

const sine = (db: number, f = 1000) => (t: number) => 10 ** (db / 20) * Math.sin(2 * Math.PI * f * t);
const rmsDb = (x: Float32Array, from: number) => {
  let s = 0; for (let i = from; i < x.length; i++) s += x[i]! * x[i]!;
  return 10 * Math.log10(s / (x.length - from));
};
/** Uitgangsniveau (dB RMS) van een sinus van `db` dBFS, na het inschakelen. */
async function level(ctl: Record<string, number>, db: number): Promise<number> {
  const o = await run(ctl, 0.8, sine(db));
  return rmsDb(o.l, Math.round(0.5 * CTX));
}
/** Vervorming: energie in de 2e t/m 5e harmonische t.o.v. de grondtoon (dB). */
function thdDb(x: Float32Array, f: number, from: number): number {
  const mag = (h: number) => {
    let re = 0, im = 0;
    for (let i = from; i < x.length; i++) {
      const w = 2 * Math.PI * f * h * i / CTX;
      re += x[i]! * Math.cos(w); im += x[i]! * Math.sin(w);
    }
    return re * re + im * im;
  };
  let harm = 0; for (let h = 2; h <= 5; h++) harm += mag(h);
  return 10 * Math.log10(harm / mag(1));
}


/** Als run(), maar met een eigen signaal op in_r; geeft L en R terug. */
async function runStereo(ctl: Record<string, number>, secs: number,
  sigL: (t: number) => number, sigR: (t: number) => number): Promise<{ l: Float32Array; r: Float32Array }> {
  const bytes = wasmBytes(TYPE);
  const { inputs, outputs } = await portsOf(bytes);
  const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } });
  for (const [id, v] of Object.entries(ctl)) p.port.send({ t: 'ctl', id, v });
  p.port.send({ t: 'cabled', id: 'in_l', on: true });
  p.port.send({ t: 'cabled', id: 'in_r', on: true });
  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  const iL = inBuf[inputs.indexOf('in_l')]![0]!, iR = inBuf[inputs.indexOf('in_r')]![0]!;
  const oL = outBuf[outputs.indexOf('out_l')]![0]!, oR = outBuf[outputs.indexOf('out_r')]![0]!;
  const blocks = Math.ceil(secs * CTX / QUANTUM);
  const l = new Float32Array(blocks * QUANTUM), r = new Float32Array(blocks * QUANTUM);
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < QUANTUM; i++) { const t = (b * QUANTUM + i) / CTX; iL[i] = sigL(t); iR[i] = sigR(t); }
    p.process(inBuf, outBuf, {});
    l.set(oL, b * QUANTUM); r.set(oR, b * QUANTUM);
  }
  return { l, r };
}
/** Amplitude van één frequentie (Goertzel-achtig) vanaf `from`. */
function magAt(x: Float32Array, f: number, from: number): number {
  let re = 0, im = 0;
  for (let i = from; i < x.length; i++) { const w = 2 * Math.PI * f * i / CTX; re += x[i]! * Math.cos(w); im += x[i]! * Math.sin(w); }
  return 2 * Math.hypot(re, im) / (x.length - from);
}
/** Droog doorlaten, met de vertraging van de host eruit gezocht. */
function expectDry(o: Float32Array, x: (t: number) => number): void {
  const err = (d: number) => { let e = 0; for (let i = 2000; i < 2200; i++) e += Math.abs(o[i]! - x((i - d) / CTX)); return e; };
  let best = 0; for (let d = 1; d < 1024; d++) if (err(d) < err(best)) best = d;
  for (let i = 2000; i < 2100; i++) expect(o[i]!).toBeCloseTo(x((i - best) / CTX), 5);
}

/** Versterking (dB) op `f`: een sinus van −24 dBFS erdoor, Color 0. */
async function gainAt(ctl: Record<string, number>, f: number): Promise<number> {
  const x = sine(-24, f);
  const o = await run({ color: 0, ...ctl }, 0.6, x);
  const from = Math.round(0.3 * CTX);
  const ref = new Float32Array(o.l.length);
  for (let i = 0; i < ref.length; i++) ref[i] = x(i / CTX);
  return rmsDb(o.l, from) - rmsDb(ref, from);
}

describe('Para-EQ (SSL/API-stijl)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('is vlak met alle knoppen op 0', async () => {
    for (const f of [50, 300, 1000, 5000, 12000]) expect(Math.abs(await gainAt({}, f))).toBeLessThan(0.2);
  }, 60_000);

  it('LF en HF schakelen tussen bell en shelf', async () => {
    const shelf = { lf_freq: 100, lf_gain: 10, lf_shelf: 1 };
    const bell  = { lf_freq: 100, lf_gain: 10, lf_shelf: 0 };
    expect(await gainAt(shelf, 30)).toBeGreaterThan(9);        // shelf: eronder alles omhoog
    expect(await gainAt(bell, 30)).toBeLessThan(5);            // bell: eronder zakt het terug
    expect(await gainAt(bell, 100)).toBeGreaterThan(9);
    const hshelf = { hf_freq: 8000, hf_gain: 10, hf_shelf: 1 };
    expect(await gainAt(hshelf, 16000)).toBeGreaterThan(8.5);
  }, 60_000);

  it('zet een middenbell met de ingestelde Q', async () => {
    const smal = { hmf_freq: 2500, hmf_gain: 12, hmf_q: 4 };
    const breed = { hmf_freq: 2500, hmf_gain: 12, hmf_q: 0.4 };
    expect(await gainAt(smal, 2500)).toBeGreaterThan(11);
    expect(await gainAt(smal, 5000)).toBeLessThan(2);
    expect(await gainAt(breed, 5000)).toBeGreaterThan(6);
  }, 60_000);

  it('maakt met Prop.Q een kleine boost breder en een grote smaller', async () => {
    const rel = async (gain: number, prop: number): Promise<number> =>
      (await gainAt({ hmf_freq: 2500, hmf_gain: gain, hmf_q: 2, prop_q: prop }, 5000))
      / (await gainAt({ hmf_freq: 2500, hmf_gain: gain, hmf_q: 2, prop_q: prop }, 2500));
    expect(await rel(3, 1)).toBeGreaterThan(await rel(3, 0) * 1.3);   // klein: breder dan vaste Q
    expect(await rel(15, 1)).toBeCloseTo(await rel(15, 0), 1);         // vol: gelijk aan vaste Q
  }, 60_000);

  it('heeft HPF en LPF van 12 dB/oct, uit op de uiterste stand', async () => {
    expect(Math.abs(await gainAt({ hpf: 16 }, 40))).toBeLessThan(0.3);
    expect(await gainAt({ hpf: 200 }, 50)).toBeLessThan(-20);
    expect(await gainAt({ hpf: 200 }, 100) - await gainAt({ hpf: 200 }, 50)).toBeGreaterThan(9);
    expect(await gainAt({ lpf: 5000 }, 16000)).toBeLessThan(-15);
    expect(Math.abs(await gainAt({ lpf: 20000 }, 16000))).toBeLessThan(0.3);
  }, 60_000);

  it('laat met Bypass droog door en blijft binnen ±1', async () => {
    expectDry((await run({ lf_gain: 10, bypass: 1 }, 0.3, sine(-6))).l, sine(-6));
    const o = await run({ lf_gain: 15, lmf_gain: 15, lmf_freq: 300, output: 12 }, 0.5, sine(0, 110));
    let pk = 0; for (const v of o.l) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 60_000);
});
