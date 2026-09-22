// FET-compressor (1176-stijl, tp_mmb_fet_comp) door de worklet-host heen: de
// kern mmb_dsp::FetComp is dezelfde als op de Teensy. De tests leggen het
// karakter vast dat doc/plans/vintage-compressors.md belooft: de ratio's, alle
// knoppen harder dan 20:1, de aanvalstijd, vervorming die meegroeit met het
// ingrijpen, Mix en een uitgang die binnen ±1 blijft.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;
const CTX = 44100;          // gelijk aan de native rate: geen resampling in de meting

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
  await import(/* @vite-ignore */ `${url}?fet`);
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
  const bytes = wasmBytes('tp_mmb_fet_comp');
  const { inputs, outputs } = await portsOf(bytes);
  const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } });
  for (const [id, v] of Object.entries(ctl)) p.port.send({ t: 'ctl', id, v });
  p.port.send({ t: 'cabled', id: 'in_l', on: true });
  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  const inL = inBuf[inputs.indexOf('in_l')]![0]!;
  const oL  = outBuf[outputs.indexOf('out_l')]![0]!;
  const oGr = outBuf[outputs.indexOf('gr')]![0]!;
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

describe('FET-compressor (1176-stijl)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('laat zachte signalen onder de drempel met rust', async () => {
    const o = await level({ ratio: 0 }, -40);
    expect(o).toBeCloseTo(-40 - 3.01, 0);          // RMS van een sinus = piek − 3 dB
  }, 30_000);

  it('comprimeert boven de drempel met de gekozen ratio', async () => {
    // Van −12 naar −6 dBFS (ruim boven de drempel van −18): 6 dB erbij in,
    // 6/R dB erbij uit.
    for (const [sel, r] of [[0, 4], [1, 8], [3, 20]] as const) {
      const a = await level({ ratio: sel }, -12);
      const b = await level({ ratio: sel }, -6);
      expect(b - a).toBeGreaterThan(6 / r - 0.6);
      expect(b - a).toBeLessThan(6 / r + 0.6);
    }
  }, 60_000);

  it('grijpt met alle knoppen harder in dan 20:1: harder erin wordt zachter eruit', async () => {
    const a = await level({ ratio: 4 }, -6);
    const b = await level({ ratio: 4 }, 0);
    expect(b).toBeLessThan(a);
  }, 30_000);

  it('slaat op Attack 7 veel sneller aan dan op Attack 1', async () => {
    // Stap van stilte naar −6 dBFS; GR na 0,3 ms.
    const step = (t: number) => (t < 0.1 ? 0 : sine(-6)(t));
    // De host loopt een paar samples achter: meet vanaf het eerste ingrijpen.
    const snel = await run({ attack: 7 }, 0.15, step);
    const traag = await run({ attack: 1 }, 0.15, step);
    const onset = snel.gr.findIndex((v) => v > 0.005);
    expect(onset).toBeGreaterThan(0);
    const at = onset + Math.round(0.0003 * CTX);
    const eind = snel.gr[snel.gr.length - 1]!;
    expect(snel.gr[at]!).toBeGreaterThan(0.6 * eind);
    expect(traag.gr[at]!).toBeLessThan(0.5 * snel.gr[at]!);
  }, 30_000);

  it('vervormt meer naarmate hij harder ingrijpt', async () => {
    const from = Math.round(0.5 * CTX);
    const licht = await run({ input: 0,  output: 0 }, 0.8, sine(-30, 441));
    const zwaar = await run({ input: 30, output: -10 }, 0.8, sine(-30, 441));
    expect(zwaar.gr[zwaar.gr.length - 1]!).toBeGreaterThan(0.5);   // > 10 dB GR
    expect(thdDb(zwaar.l, 441, from)).toBeGreaterThan(thdDb(licht.l, 441, from) + 10);
  }, 30_000);

  it('laat met Mix 0 het droge signaal door', async () => {
    const o = await run({ input: 30, mix: 0 }, 0.3, sine(-6));
    const x = sine(-6);
    // De host loopt een paar samples achter: zoek die vertraging, dan exact gelijk.
    const err = (d: number) => { let e = 0; for (let i = 2000; i < 2200; i++) e += Math.abs(o.l[i]! - x((i - d) / CTX)); return e; };
    let best = 0; for (let d = 1; d < 1024; d++) if (err(d) < err(best)) best = d;
    for (let i = 2000; i < 2100; i++) expect(o.l[i]!).toBeCloseTo(x((i - best) / CTX), 5);
  }, 30_000);

  it('laat met Bypass het droge signaal door, maar blijft meten', async () => {
    const o = await run({ input: 30, bypass: 1 }, 0.3, sine(-6));
    const x = sine(-6);
    const err = (d: number) => { let e = 0; for (let i = 2000; i < 2200; i++) e += Math.abs(o.l[i]! - x((i - d) / CTX)); return e; };
    let best = 0; for (let d = 1; d < 1024; d++) if (err(d) < err(best)) best = d;
    for (let i = 2000; i < 2100; i++) expect(o.l[i]!).toBeCloseTo(x((i - best) / CTX), 5);
    // De detector loopt door, zodat terugschakelen niet knalt.
    expect(o.gr[o.gr.length - 1]!).toBeGreaterThan(0.2);
  }, 30_000);

  it('blijft binnen ±1, ook met alles open', async () => {
    const o = await run({ input: 36, output: 12, ratio: 4 }, 0.5, sine(0, 110));
    let pk = 0; for (const v of o.l) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 30_000);
});
