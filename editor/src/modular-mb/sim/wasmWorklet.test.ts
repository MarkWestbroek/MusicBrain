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
  async function run(typeId: string, ctls: Record<string, number>, hz = HZ): Promise<number> {
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
      for (let k = 0; k < QUANTUM; k++) { inBuf[0]![0]![k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * hz / CTX; }
      p.process(inBuf, outBuf, {});
      rec.set(outBuf[0]![0]!, w); w += QUANTUM;
    }
    return toneSnr(rec, hz, CTX, Math.round(CTX * 0.2));
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

  it('houdt ook hoge tonen schoon (daar faalt lineair interpoleren)', async () => {
    // De fout van een interpolator groeit met de frequentie. Op 5 kHz haalde
    // lineair ~34 dB en de cubic in de host ~49 dB; op 2 kHz is het verschil
    // ~50 tegen ~79. Deze grens valt dus precies tussen de twee methodes in.
    const dry = { time: 0.35, feedback: 0, mix: 0 };
    expect(await run('tp_mmb_tape_echo', dry, 2000)).toBeGreaterThan(65);
    expect(await run('tp_mmb_tape_echo', dry, 5000)).toBeGreaterThan(42);
  });
});

describe('mmb-worklet: twee kabels op één cv-ingang', () => {
  const CTX = 48000;
  beforeAll(async () => { await loadHost(CTX); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('de laatste verandering wint, zoals de CvGraph — niet de som', async () => {
    // CvMath (som, gain 1): out = a. Twee kabels op `a`: de engine geeft de
    // tweede een eigen worklet-ingang `a@2` (WasmModule.addFeeder).
    const bytes = wasmBytes('tp_mmb_cvmath');
    const inputs = ['a', 'a@2', 'b', 'c'];
    const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs: ['out'] } });
    p.port.send({ t: 'cabled', id: 'a', on: true });
    p.port.send({ t: 'cabled', id: 'a@2', on: true });
    const inBuf = inputs.map(() => [new Float32Array(QUANTUM)]);
    const outBuf = [[new Float32Array(QUANTUM)]];
    const at: Record<string, number> = {};
    const blocks = Math.round(CTX / QUANTUM);
    for (let b = 0; b < blocks; b++) {
      const t = b * QUANTUM / CTX;
      inBuf[0]![0]!.fill(t < 0.3 ? 0.3 : 0.1);         // kabel 1 verandert op 0,3 s
      inBuf[1]![0]!.fill(t < 0.6 ? 0.7 : 0.9);         // kabel 2 verandert op 0,6 s
      p.process(inBuf, outBuf, {});
      for (const probe of [0.2, 0.5, 0.8]) if (Math.abs(t - probe) < QUANTUM / CTX / 2) at[probe] = outBuf[0]![0]![64]!;
    }
    expect(at[0.2]).toBeCloseTo(0.7, 5);   // bij de start veranderen ze allebei; de laatste in de rij wint
    expect(at[0.5]).toBeCloseTo(0.1, 5);   // kabel 1 veranderde net
    expect(at[0.8]).toBeCloseTo(0.9, 5);   // en nu kabel 2
  });
});

describe('mmb-worklet: herstel na een crash', () => {
  // Gooit process() een fout, dan zet Web Audio de processor voorgoed stil
  // — "worklet-processor gecrasht", en alleen een herlaad hielp. De host
  // vangt de fout nu zelf op, begint met een verse wasm-instantie en vraagt
  // de hoofdthread de toestand opnieuw te sturen.
  const CTX = 48000;
  beforeAll(async () => { await loadHost(CTX); });
  afterAll(() => { vi.unstubAllGlobals(); });

  /** Processor met een logboek van wat hij terugstuurt; `renderBlock`
   *  is de plek waar de wasm rendert, dus dáár laten we hem vallen. */
  async function crashable(wasm: Uint8Array | WebAssembly.Module) {
    const bytes = wasmBytes('tp_mmb_vcf');
    const { inputs, outputs } = await portsOf(bytes);
    const p = new Processor!({ processorOptions: { wasm, inputs, outputs } }) as Proc & {
      ex: object | null; renderBlock?: () => void; alive: boolean;
    };
    const sent: Array<Record<string, unknown>> = [];
    p.port.postMessage = (m: unknown) => { sent.push(m as Record<string, unknown>); };
    p.port.send({ t: 'ctl', id: 'cutoff', v: 18000 });
    p.port.send({ t: 'cabled', id: inputs[0], on: true });
    const inBuf = inputs.map(() => [new Float32Array(QUANTUM)]);
    const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
    return { p, sent, inBuf, outBuf };
  }

  it('vangt de fout op, rendert door op een verse instantie en meldt het', async () => {
    const { p, sent, inBuf, outBuf } = await crashable(wasmBytes('tp_mmb_vcf'));
    for (let b = 0; b < 8; b++) p.process(inBuf, outBuf, {});
    const before = p.ex;
    p.renderBlock = () => { throw new WebAssembly.RuntimeError('memory access out of bounds'); };
    outBuf[0]![0]!.fill(1);
    expect(p.process(inBuf, outBuf, {})).toBe(true);        // blijft leven
    expect(Math.max(...outBuf[0]![0]!)).toBe(0);             // stilte, geen rommel
    const crashed = sent.find((m) => m.t === 'crashed');
    expect(crashed).toMatchObject({ fatal: false, crashes: 1 });
    expect(String(crashed!.message)).toContain('memory access out of bounds');
    expect(p.ex).not.toBe(before);                           // verse instantie

    // Daarna gewoon weer geluid: een sinus komt er als sinus uit.
    delete p.renderBlock;
    const blocks = Math.round(CTX / QUANTUM);
    const rec = new Float32Array(blocks * QUANTUM);
    let ph = 0;
    for (let b = 0; b < blocks; b++) {
      for (let k = 0; k < QUANTUM; k++) { inBuf[0]![0]![k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * 220 / CTX; }
      p.process(inBuf, outBuf, {});
      rec.set(outBuf[0]![0]!, b * QUANTUM);
    }
    expect(toneSnr(rec, 220, CTX, Math.round(CTX * 0.2))).toBeGreaterThan(40);
  });

  it('geeft op als hij blijft vallen, en zegt dat', async () => {
    const { p, sent, inBuf, outBuf } = await crashable(wasmBytes('tp_mmb_vcf'));
    for (let b = 0; b < 8; b++) p.process(inBuf, outBuf, {});
    p.renderBlock = () => { throw new Error('unreachable'); };
    // Na elk herstel bouwt hij eerst weer een voorsprong op (primeLeft), dus
    // niet elke aanroep rendert: ruim de tijd nemen.
    let alive = true;
    for (let i = 0; i < 60 && alive; i++) alive = p.process(inBuf, outBuf, {});
    expect(alive).toBe(false);
    const fatal = sent.filter((m) => m.t === 'crashed' && m.fatal);
    expect(fatal).toHaveLength(1);
    expect(sent.filter((m) => m.t === 'crashed' && !m.fatal).length).toBeGreaterThan(1);
  });

  it('parkeren en resetten: zelfde instantie, geheugen weer als nieuw', async () => {
    const { p, inBuf, outBuf } = await crashable(wasmBytes('tp_mmb_vcf'));
    const exBefore = p.ex as { memory: WebAssembly.Memory; mmb_control_value(i: number): number };
    const cutoffIdx = 0;                                   // eerste control van de VCF
    expect(exBefore.mmb_control_value(cutoffIdx)).toBe(18000);
    for (let b = 0; b < 8; b++) p.process(inBuf, outBuf, {});

    p.port.send({ t: 'park' });
    outBuf[0]![0]!.fill(1);
    expect(p.process(inBuf, outBuf, {})).toBe(true);      // leeft, rendert niet
    expect(outBuf[0]![0]![0]).toBe(1);                     // raakt de uitgang niet aan

    p.port.send({ t: 'reset' });
    expect(p.ex).toBe(exBefore);                           // geen nieuwe instantie
    expect(exBefore.mmb_control_value(cutoffIdx)).toBe(2000);   // fabrieksstand terug
    p.port.send({ t: 'ctl', id: 'cutoff', v: 18000 });
    p.port.send({ t: 'cabled', id: 'in', on: true });
    const blocks = Math.round(CTX / QUANTUM);
    const rec = new Float32Array(blocks * QUANTUM);
    let ph = 0;
    for (let b = 0; b < blocks; b++) {
      for (let k = 0; k < QUANTUM; k++) { inBuf[0]![0]![k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * 220 / CTX; }
      p.process(inBuf, outBuf, {});
      rec.set(outBuf[0]![0]!, b * QUANTUM);
    }
    expect(toneSnr(rec, 220, CTX, Math.round(CTX * 0.2))).toBeGreaterThan(40);
  });

  it('een module die heap gebruikt groeit niet bij elke reset verder (STK)', async () => {
    // Na een reset denkt malloc dat er nog niets is uitgedeeld; wasi-libc
    // neemt dan alles tot de huidige geheugengrootte als heap, dus de
    // eerder bijgegroeide pagina's worden hergebruikt in plaats van dat er
    // telkens nieuwe bijkomen.
    const bytes = wasmBytes('tp_mmb_stk_sound');
    const { inputs, outputs } = await portsOf(bytes);
    const p = new Processor!({ processorOptions: { wasm: bytes, inputs, outputs } }) as Proc & { ex: { memory: WebAssembly.Memory } };
    p.port.postMessage = () => { /* stil */ };
    const inBuf = inputs.map(() => [new Float32Array(QUANTUM)]);
    const outBuf = outputs.map(() => [new Float32Array(QUANTUM)]);
    const cycle = (): number => {
      for (const sound of [2, 4, 7, 8]) {                  // Bowed, Brass, BandedWG, Mandolin: elk een verse alloc
        p.port.send({ t: 'ctl', id: 'sound', v: sound });
        for (let b = 0; b < 4; b++) p.process(inBuf, outBuf, {});
      }
      p.port.send({ t: 'park' });
      p.port.send({ t: 'reset' });
      return p.ex.memory.buffer.byteLength;
    };
    const first = cycle();
    const second = cycle();
    let last = second;
    for (let i = 0; i < 6; i++) last = cycle();
    expect(last).toBe(second);                             // na de eerste ronde stabiel
    expect(last).toBeLessThanOrEqual(first * 2);
  });

  it('neemt ook een al gecompileerde module aan (één compilatie per type)', async () => {
    const mod = await WebAssembly.compile(wasmBytes('tp_mmb_vcf'));
    const { p, inBuf, outBuf } = await crashable(mod);
    for (let b = 0; b < 8; b++) expect(p.process(inBuf, outBuf, {})).toBe(true);
  });
});
