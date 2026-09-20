// De worklet-host (public/wasm/mmb-worklet.js) doorgemeten in node.
//
// Hij resamplet van de native rate van een module naar de contextrate. Ging
// dat mis, dan bleef de staart van elk blok op de laatste invoersample staan
// en klonk álles korrelig en overstuurd — met een sinus erdoor was er meer
// vuil dan signaal. Deze test stuurt een zuivere toon door een wijd open
// filter en eist dat er aan de andere kant nog steeds een zuivere toon staat.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const QUANTUM = 128;                 // Web Audio rendert altijd per 128 samples

/** Minimale AudioWorkletGlobalScope, genoeg om de host te laden. */
class FakePort {
  private fn: ((e: { data: unknown }) => void) | null = null;
  postMessage(): void { /* 'ready' interesseert ons hier niet */ }
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

async function loadHost(contextRate: number): Promise<void> {
  vi.stubGlobal('sampleRate', contextRate);
  vi.stubGlobal('AudioWorkletProcessor', class { port = new FakePort(); });
  vi.stubGlobal('registerProcessor', (_n: string, cls: ProcCtor) => { Processor = cls; });
  const url = new URL('../../../public/wasm/mmb-worklet.js', import.meta.url).href;
  await import(/* @vite-ignore */ `${url}?rate=${contextRate}`);
}

function wasmBytes(typeId: string): Uint8Array {
  return new Uint8Array(readFileSync(
    fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url))));
}

/** Poort-ids uit de wasm zelf (de editor haalt ze uit de catalogus; gelijk). */
async function portsOf(bytes: Uint8Array): Promise<{ inputs: string[]; outputs: string[] }> {
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as any;
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  const inputs: string[] = [], outputs: string[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  inputs.push(cstr(ex.mmb_input_id(i)));
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outputs.push(cstr(ex.mmb_output_id(i)));
  return { inputs, outputs };
}

/**
 * Een sinus van `hz` door de module heen, en dan: hoeveel van de energie zit
 * er werkelijk op die frequentie? Het venster telt een heel aantal perioden,
 * dus zonder vervorming blijft er niets over. Uitkomst in dB.
 */
function toneSnr(rec: Float32Array, hz: number, rate: number, skip: number): number {
  let re = 0, im = 0, tot = 0;
  for (let i = skip; i < rec.length; i++) {
    const t = 2 * Math.PI * hz * i / rate;
    re += rec[i]! * Math.cos(t); im += rec[i]! * Math.sin(t); tot += rec[i]! * rec[i]!;
  }
  const n = rec.length - skip;
  const fund = 2 * (re * re + im * im) / (n * n);
  const junk = Math.max(tot / n - fund, 1e-20);
  return 10 * Math.log10(fund / junk);
}

describe('mmb-worklet resampling', () => {
  const CTX = 48000;                 // de gangbare contextrate; modules zijn 44,1k
  const HZ = 220;                    // 220 × 0,8 s × … = heel aantal perioden

  beforeAll(async () => { await loadHost(CTX); });
  afterAll(() => { vi.unstubAllGlobals(); });

  /** Rendert één seconde sinus door `typeId` en geeft de SNR terug. */
  async function run(typeId: string, ctls: Record<string, number>): Promise<number> {
    const bytes = wasmBytes(typeId);
    const { inputs, outputs } = await portsOf(bytes);
    const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } });
    for (const [id, v] of Object.entries(ctls)) p.port.send({ t: 'ctl', id, v });
    p.port.send({ t: 'cabled', id: inputs[0], on: true });

    const blocks = Math.round(CTX / QUANTUM);
    const inBuf = inputs.map(() => [new Float32Array(QUANTUM)]);
    const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
    const rec = new Float32Array(blocks * QUANTUM);
    let ph = 0, w = 0;
    for (let b = 0; b < blocks; b++) {
      for (let k = 0; k < QUANTUM; k++) { inBuf[0]![0]![k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * HZ / CTX; }
      p.process(inBuf, outBuf, {});
      rec.set(outBuf[0]![0]!, w); w += QUANTUM;
    }
    return toneSnr(rec, HZ, CTX, Math.round(CTX * 0.2));
  }

  it('laat een zuivere toon zuiver door het VCF', async () => {
    // Wijd open, geen resonantie: wat er dan bij komt, komt van de resampling.
    const snr = await run('tp_mmb_vcf', { cutoff: 18000, q: 0.7, cv_amt: 1, type: 0 });
    expect(snr).toBeGreaterThan(40);
  });

  it('doet dat ook voor een module die er al langer in zit', async () => {
    const snr = await run('tp_mmb_tape_echo', { time: 0.35, feedback: 0, mix: 0 });
    expect(snr).toBeGreaterThan(40);
  });
});
