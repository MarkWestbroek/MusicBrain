// Opto-compressor (LA-2A-stijl, tp_mmb_opto_comp) door de worklet-host heen;
// de kern mmb_dsp::OptoComp is dezelfde als op de Teensy. De tests leggen vast
// wat doc/plans/vintage-compressors.md belooft: ~3:1 in Comp en harder in
// Limit, Peak Reduction als drempel, en vooral de lichtcel — loslaten in twee
// fasen, en trager naarmate hij langer heeft gewerkt.

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
  await import(/* @vite-ignore */ `${url}?opto`);
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
  const bytes = wasmBytes('tp_mmb_opto_comp');
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

describe('Opto-compressor (LA-2A-stijl)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('laat signalen onder de drempel met rust', async () => {
    // Peak Reduction 40 → drempel −18 dBFS; een sinus van −40 blijft eronder.
    const o = await level({ peak: 40, gain: 0 }, -40);
    expect(o).toBeCloseTo(-40 - 3.01, 0);
  }, 30_000);

  it('comprimeert ~3:1 in Comp en harder in Limit', async () => {
    const comp = await level({ peak: 40, mode: 0 }, -6) - await level({ peak: 40, mode: 0 }, -12);
    const lim  = await level({ peak: 40, mode: 1 }, -6) - await level({ peak: 40, mode: 1 }, -12);
    expect(comp).toBeGreaterThan(6 / 3 - 0.8);
    expect(comp).toBeLessThan(6 / 3 + 0.8);
    expect(lim).toBeLessThan(comp - 1);
  }, 60_000);

  it('grijpt harder in naarmate Peak Reduction hoger staat', async () => {
    const a = await run({ peak: 20 }, 0.8, sine(-12));
    const b = await run({ peak: 60 }, 0.8, sine(-12));
    expect(b.gr[b.gr.length - 1]!).toBeGreaterThan(a.gr[a.gr.length - 1]! + 0.1);
  }, 30_000);

  it('laat in twee fasen los: de helft snel, de rest traag', async () => {
    // Een halve seconde geluid, dan stil; kijk hoe de gain reduction wegloopt.
    const burst = (t: number) => (t < 0.6 ? sine(-3)(t) : 0);
    const o = await run({ peak: 60 }, 3.0, burst);
    const at = (t: number): number => o.gr[Math.min(o.gr.length - 1, Math.round(t * CTX))]!;
    const top = at(0.55);
    expect(top).toBeGreaterThan(0.1);
    // Na ~150 ms is ruwweg de helft weg (de snelle helft, 60 ms).
    expect(at(0.75)).toBeLessThan(0.65 * top);
    expect(at(0.75)).toBeGreaterThan(0.3 * top);
    // En na een seconde hangt er nog een staart: dat is de trage helft.
    expect(at(1.6)).toBeGreaterThan(0.05 * top);
    expect(at(2.9)).toBeLessThan(0.3 * top);
  }, 30_000);

  it('laat trager los naarmate de cel langer heeft gewerkt', async () => {
    const tail = async (secs: number): Promise<number> => {
      const o = await run({ peak: 60 }, secs + 1.2, (t) => (t < secs ? sine(-3)(t) : 0));
      const top = o.gr[Math.round((secs - 0.02) * CTX)]!;
      return o.gr[Math.round((secs + 1.0) * CTX)]! / top;   // wat er na 1 s nog staat
    };
    const kort = await tail(0.3);
    const lang = await tail(3.0);
    expect(lang).toBeGreaterThan(kort * 1.3);
  }, 60_000);

  it('regelt de verzadiging met Color en laat Bypass droog door', async () => {
    const from = Math.round(0.5 * CTX);
    const thd = async (color: number): Promise<number> =>
      thdDb((await run({ peak: 70, color }, 0.8, sine(-6, 441))).l, 441, from);
    expect(await thd(0)).toBeLessThan(-50);
    expect(await thd(2)).toBeGreaterThan(await thd(0) + 20);

    const o = await run({ peak: 70, bypass: 1 }, 0.3, sine(-6));
    const x = sine(-6);
    const err = (d: number) => { let e = 0; for (let i = 2000; i < 2200; i++) e += Math.abs(o.l[i]! - x((i - d) / CTX)); return e; };
    let best = 0; for (let d = 1; d < 1024; d++) if (err(d) < err(best)) best = d;
    for (let i = 2000; i < 2100; i++) expect(o.l[i]!).toBeCloseTo(x((i - best) / CTX), 5);
  }, 60_000);

  it('blijft binnen ±1', async () => {
    const o = await run({ peak: 100, gain: 20 }, 0.5, sine(0, 110));
    let pk = 0; for (const v of o.l) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 30_000);
});
