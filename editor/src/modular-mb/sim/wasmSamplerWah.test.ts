// Auto-wah van de sampler: env_k → cutoff_k, door de worklet-host heen.
//
// De kabel op de master-cel is er altijd geweest (polySim vouwt hem netjes uit
// naar alle stemmen), maar je hóórde hem niet: de follower meet gewoon het
// niveau van de stem, en een keurig uitgestuurd sample komt niet verder dan
// een env van 0,1 à 0,2. Met `cv_amt` op 4 octaven is dat nog geen halve —
// een kiertje, geen wah. Daarom `env_sens` (dB) op de follower.
//
// Tegelijk vangt deze test de tweede helft van dezelfde bug: een stem die
// uitgestorven is slaat `Process` over, en dan bleef `env_k` voorgoed staan op
// de waarde van vlak vóór het uitsterven — het filter zakte nooit meer dicht.

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
  await import(/* @vite-ignore */ `${url}?wah`);
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

/** Spectraal zwaartepunt tot 8 kHz — één getal voor "hoe open staat het". */
function centroid(x: Float32Array, rate: number): number {
  let num = 0, den = 0;
  for (let b = 1; b <= 64; b++) {
    const f = b * 125;
    let re = 0, im = 0;
    for (let i = 0; i < x.length; i += 2) {
      const w = 2 * Math.PI * f * i / rate;
      re += x[i]! * Math.cos(w); im += x[i]! * Math.sin(w);
    }
    const m = Math.hypot(re, im);
    num += m * f; den += m;
  }
  return den > 0 ? num / den : 0;
}

interface Run { centroid: number; envPeak: number; envTail: number }

/**
 * Speelt één noot op cel 1 met een MS-20 in de stem. `wah` sluit de kabel
 * env_1 → cutoff_1: net als de engine loopt het signaal één render-quantum
 * achter (daar een Tone.Delay, hier het vorige blok).
 */
async function play(wah: boolean, sens: number): Promise<Run> {
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
    filter: 2, cutoff: 300, q: 0.55, fmode: 0, drive: 1.5,
    cv_amt: 4, env_rel: 150, level: 0.8, env_sens: sens,
  })) p.port.send({ t: 'ctl', id, v });
  p.port.send({ t: 'in', id: 'voct_1', v: 0 });
  p.port.send({ t: 'in', id: 'vel_1',  v: 0.9 });
  p.port.send({ t: 'in', id: 'gate_1', v: 1 });
  if (wah) p.port.send({ t: 'cabled', id: 'cutoff_1', on: true });

  const inBuf  = inputs.map(() => [new Float32Array(QUANTUM)]);
  const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
  const cutoffCh = inBuf[inputs.indexOf('cutoff_1')]![0]!;
  const envCh    = outBuf[outputs.indexOf('env_1')]![0]!;
  const outCh    = outBuf[outputs.indexOf('out_l')]![0]!;

  const blocks = Math.round(CTX * 0.4 / QUANTUM);
  const rec = new Float32Array(blocks * QUANTUM);
  let w = 0, envPeak = 0;
  for (let b = 0; b < blocks; b++) {
    p.process(inBuf, outBuf, {});
    rec.set(outCh, w); w += QUANTUM;
    for (const v of envCh) if (v > envPeak) envPeak = v;
    if (wah) cutoffCh.set(envCh);              // kabel met één quantum vertraging
  }
  // Noot los, en dan lang genoeg stil om de follower te laten terugzakken.
  p.port.send({ t: 'in', id: 'gate_1', v: 0 });
  for (let b = 0; b < Math.round(CTX * 2.0 / QUANTUM); b++) {
    p.process(inBuf, outBuf, {});
    if (wah) cutoffCh.set(envCh);
  }
  // De eerste quanta zijn de aanloop van de host (voorsprong opbouwen).
  return { centroid: centroid(rec.subarray(QUANTUM * 20), CTX), envPeak, envTail: envCh[QUANTUM - 1]! };
}

describe('sampler auto-wah (env_k → cutoff_k)', () => {
  beforeAll(async () => { await loadHost(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('tilt de follower ver genoeg op om het filter te sturen', async () => {
    // Kaal meet de follower het niveau van de stem: een sample dat netjes
    // onder vol staat blijft rond 0,15 hangen, en dat is met cv_amt = 4 nog
    // geen halve octaaf. Met +12 dB haalt dezelfde noot ruim de helft van de
    // CV-schaal, dus ruim twee octaven.
    expect((await play(true, 0)).envPeak).toBeLessThan(0.25);
    expect((await play(true, 12)).envPeak).toBeGreaterThan(0.5);
  }, 30_000);

  it('opent het filter hoorbaar met de follower erop', async () => {
    const dicht = await play(false, 12);
    const wah   = await play(true, 12);
    const halveTonen = 12 * Math.log2(wah.centroid / dicht.centroid);
    expect(halveTonen).toBeGreaterThan(3);
  }, 30_000);

  it('laat env_k terugzakken als de stem is uitgestorven', async () => {
    const wah = await play(true, 12);
    expect(wah.envTail).toBeLessThan(0.01);
  }, 30_000);
});
