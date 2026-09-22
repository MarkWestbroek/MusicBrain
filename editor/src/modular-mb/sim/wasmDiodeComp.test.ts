// Diodebrug-compressor (Neve-33609-stijl, tp_mmb_diode_comp) door de
// worklet-host heen; de kern mmb_dsp::DiodeComp is dezelfde als op de Teensy.
// Vastgelegd: ratio's, dat de vervorming vooral oneven is en meegroeit met het
// ingrijpen, de programma-afhankelijke release (A1), Bypass en ±1.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 44100;          // gelijk aan de native rate: geen resampling in de meting

const TYPE = 'tp_mmb_diode_comp';

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
  await import(/* @vite-ignore */ `${url}?diode`);
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

/** Niveau (dB) van de 2e en 3e harmonische t.o.v. de grondtoon. */
function harmDb(x: Float32Array, f: number, from: number, h: number): number {
  return 20 * Math.log10(magAt(x, f * h, from) / magAt(x, f, from));
}

describe('Diodebrug-compressor (Neve-stijl)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('laat zachte signalen en het hoog met rust', async () => {
    expect(await level({ threshold: -20, color: 0 }, -40)).toBeCloseTo(-40 - 3.01, 0);
    for (const f of [1000, 8000, 16000]) {
      const o = await run({ threshold: 0, color: 0 }, 0.4, sine(-40, f));
      expect(rmsDb(o.l, Math.round(0.2 * CTX))).toBeCloseTo(-40 - 3.01, 1);
    }
  }, 30_000);

  it('comprimeert met 1,5:1 tot 6:1', async () => {
    for (const [sel, r] of [[0, 1.5], [2, 3], [4, 6]] as const) {
      const ctl = { threshold: -34, ratio: sel, attack: 0, release: 1, color: 0 };
      const d = await level(ctl, -6) - await level(ctl, -12);
      expect(d).toBeGreaterThan(6 / r - 0.6);
      expect(d).toBeLessThan(6 / r + 0.6);
    }
  }, 60_000);

  it('vervormt vooral oneven, en meer naarmate hij harder ingrijpt', async () => {
    const from = Math.round(0.5 * CTX);
    const licht = (await run({ threshold: -16, ratio: 3, release: 1, color: 1 }, 0.8, sine(-12, 441))).l;
    const zwaar = (await run({ threshold: -40, ratio: 3, release: 1, color: 1 }, 0.8, sine(-12, 441))).l;
    const h3z = harmDb(zwaar, 441, from, 3), h2z = harmDb(zwaar, 441, from, 2);
    expect(h3z).toBeGreaterThan(h2z + 20);                        // oneven overheerst
    expect(h3z).toBeGreaterThan(harmDb(licht, 441, from, 3) + 10); // groeit met de GR
  }, 30_000);

  it('laat op A1 langer los na aanhoudend materiaal dan na een korte piek', async () => {
    const na = async (secs: number): Promise<number> => {
      const o = await run({ threshold: -30, release: 4, color: 0 }, secs + 1.5, (t) => (t < secs ? sine(-6)(t) : 0));
      const top = o.gr[Math.round((secs - 0.01) * CTX)]!;
      return o.gr[Math.round((secs + 1.0) * CTX)]! / top;
    };
    expect(await na(3.0)).toBeGreaterThan(3 * await na(0.1));
  }, 60_000);

  it('laat met Bypass droog door en blijft binnen ±1', async () => {
    expectDry((await run({ threshold: -40, bypass: 1 }, 0.3, sine(-6))).l, sine(-6));
    const o = await run({ threshold: 0, makeup: 20, color: 2 }, 0.5, sine(0, 110));
    let pk = 0; for (const v of o.l) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 30_000);
});
