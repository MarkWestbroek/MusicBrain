// Console-EQ (1073-stijl, tp_mmb_console_eq) door de worklet-host heen; de
// kern mmb_dsp::ConsoleEq is dezelfde als op de Teensy. Vastgelegd: vlak, de
// hoogdoorlaat van 18 dB/oct, de low shelf met bult, de bell die smaller wordt
// bij meer gain, de high shelf, Color, Bypass en ±1.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 44100;          // gelijk aan de native rate: geen resampling in de meting

const TYPE = 'tp_mmb_console_eq';

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
  await import(/* @vite-ignore */ `${url}?console`);
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

describe('Console-EQ (1073-stijl)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('is vlak met alle knoppen op 0', async () => {
    for (const f of [50, 300, 1000, 5000, 12000]) expect(Math.abs(await gainAt({}, f))).toBeLessThan(0.2);
  }, 60_000);

  it('filtert het laag weg met ~18 dB per octaaf', async () => {
    const ctl = { hpf: 4 };                                   // 300 Hz
    const g150 = await gainAt(ctl, 150), g75 = await gainAt(ctl, 75);
    expect(g150).toBeLessThan(-12);
    expect(g150 - g75).toBeGreaterThan(14);                    // een octaaf lager: nog ~18 dB minder
    expect(g150 - g75).toBeLessThan(22);
  }, 60_000);

  it('tilt het laag op met een shelf en een lichte bult', async () => {
    const ctl = { low_freq: 1, low_gain: 10 };                // 60 Hz
    expect(await gainAt(ctl, 30)).toBeGreaterThan(9.5);
    expect(await gainAt(ctl, 30)).toBeLessThan(11);            // de bult, niet meer dan ~1 dB
    expect(Math.abs(await gainAt(ctl, 500))).toBeLessThan(0.5);
  }, 60_000);

  it('zet een middenbell die bij meer gain wat smaller wordt', async () => {
    const f = 1600;
    const klein = { mid_freq: 2, mid_gain: 3 }, groot = { mid_freq: 2, mid_gain: 12 };
    expect(await gainAt(groot, f)).toBeGreaterThan(11);
    // Relatieve breedte: gain een octaaf hoger t.o.v. de top.
    const relKlein = (await gainAt(klein, 2 * f)) / (await gainAt(klein, f));
    const relGroot = (await gainAt(groot, 2 * f)) / (await gainAt(groot, f));
    expect(relGroot).toBeLessThan(relKlein);
  }, 60_000);

  it('heeft een high shelf op 12 kHz', async () => {
    expect(await gainAt({ high_gain: 10 }, 16000)).toBeGreaterThan(8);
    expect(await gainAt({ high_gain: -10 }, 16000)).toBeLessThan(-8);
    expect(Math.abs(await gainAt({ high_gain: 10 }, 2000))).toBeLessThan(0.5);
  }, 60_000);

  it('regelt de kleur met Color en laat Bypass droog door', async () => {
    const from = Math.round(0.5 * CTX);
    const thd = async (color: number): Promise<number> =>
      thdDb((await run({ color }, 0.8, sine(-6, 441))).l, 441, from);
    expect(await thd(0)).toBeLessThan(-50);
    expect(await thd(2)).toBeGreaterThan(await thd(0) + 15);
    expectDry((await run({ low_gain: 10, bypass: 1 }, 0.3, sine(-6))).l, sine(-6));
    const o = await run({ low_freq: 3, low_gain: 16, mid_gain: 18, output: 12 }, 0.5, sine(0, 110));
    let pk = 0; for (const v of o.l) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 60_000);
});
