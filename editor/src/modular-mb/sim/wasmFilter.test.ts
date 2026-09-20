// De wasm-filters (tp_mmb_vcf, tp_mmb_ms20) doorgemeten.
//
// Dit is het enige stuk van de simulator dat zonder oren te controleren is:
// de .wasm laadt gewoon in node, dus we sturen er sinussen doorheen en kijken
// wat eruit komt. Dat vangt precies de fouten die je anders pas hoort — een
// filter dat niets doet, een CV die de verkeerde kant op werkt, of een
// poort-id dat niet bij de moduledefinitie past (dan koppelt de worklet hem
// niet en blijft de module stil).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeAll } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';

const project = seedInternals(emptyModularProject());

interface Mod {
  ex: any; rate: number; block: number;
  inputs: string[]; outputs: string[]; controls: string[];
  inBuf(i: number): Float32Array;
  outBuf(i: number): Float32Array;
  setCtl(id: string, v: number): void;
  setIn(id: string, v: number, connected?: boolean): void;
}

async function load(typeId: string): Promise<Mod> {
  const path = fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url));
  const mod = await WebAssembly.compile(readFileSync(path));
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
  ex.mmb_init();
  const inputs: string[] = [], outputs: string[] = [], controls: string[] = [];
  const inPtr: number[] = [], outPtr: number[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  { inputs.push(cstr(ex.mmb_input_id(i)));  inPtr.push(ex.mmb_input_ptr(i)); }
  for (let i = 0; i < ex.mmb_num_outputs(); i++) { outputs.push(cstr(ex.mmb_output_id(i))); outPtr.push(ex.mmb_output_ptr(i)); }
  for (let i = 0; i < ex.mmb_num_controls(); i++) controls.push(cstr(ex.mmb_control_id(i)));
  return {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(), inputs, outputs, controls,
    inBuf:  (i) => new Float32Array(ex.memory.buffer, inPtr[i]!, 256),
    outBuf: (i) => new Float32Array(ex.memory.buffer, outPtr[i]!, 256),
    setCtl: (id, v) => { const i = controls.indexOf(id); if (i >= 0) ex.mmb_set_control(i, v); },
    setIn:  (id, v, connected = true) => {
      const i = inputs.indexOf(id);
      if (i < 0) return;
      new Float32Array(ex.memory.buffer, inPtr[i]!, 256).fill(v);
      ex.mmb_input_connected(i, connected ? 1 : 0);
    },
  };
}

/** RMS van de uitgang bij een sinus van `hz` op de audio-ingang (amplitude 1). */
function rms(m: Mod, hz: number, seconds = 0.2): number {
  const total = Math.round(m.rate * seconds);
  const settle = Math.round(m.rate * 0.06);      // insteltijd van de smoothing
  let ph = 0, sum = 0, n = 0, t = 0;
  while (t < total) {
    const b = m.inBuf(0);
    for (let k = 0; k < m.block; k++) { b[k] = Math.sin(ph); ph += 2 * Math.PI * hz / m.rate; }
    m.ex.mmb_input_connected(0, 1);
    m.ex.mmb_render(m.block);
    const o = m.outBuf(0);
    if (t >= settle) for (let k = 0; k < m.block; k++) { sum += o[k]! * o[k]!; n++; }
    t += m.block;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/** Poort- en control-ids van het moduletype uit de catalogus. */
function catalog(typeId: string): { ports: string[]; controls: string[] } {
  const t = project.moduleTypes.find((x) => x.id === typeId)!;
  return { ports: t.ports.map((p) => p.id), controls: t.controls.map((c) => c.id) };
}

describe('tp_mmb_vcf (wasm)', () => {
  let m: Mod;
  beforeAll(async () => { m = await load('tp_mmb_vcf'); });

  it('draagt dezelfde poorten en controls als de moduledefinitie', () => {
    const cat = catalog('tp_mmb_vcf');
    expect([...m.inputs, ...m.outputs].sort()).toEqual([...cat.ports].sort());
    expect([...m.controls].sort()).toEqual([...cat.controls].sort());
    expect(m.rate).toBe(44100);
    // Klein blok: de worklet moet zoveel invoer vooruit bufferen als één blok
    // beslaat, dus 128 zou de latency verdubbelen zonder dat het iets oplevert.
    expect(m.block).toBe(32);
  });

  it('laat als lowpass de lage tonen door en de hoge niet', () => {
    m.setCtl('type', 0); m.setCtl('q', 0.7); m.setCtl('cutoff', 1000);
    const low = rms(m, 200), high = rms(m, 8000);
    expect(low).toBeGreaterThan(0.5);            // ≈ 0,707 = sinus ongemoeid
    expect(high).toBeLessThan(low * 0.1);
  });

  it('draait om als highpass, en pakt in bandpass de band eruit', () => {
    m.setCtl('type', 1); m.setCtl('cutoff', 1000);
    expect(rms(m, 8000)).toBeGreaterThan(rms(m, 200) * 5);
    m.setCtl('type', 2); m.setCtl('cutoff', 1000);
    const band = rms(m, 1000);
    expect(band).toBeGreaterThan(rms(m, 60) * 3);
    expect(band).toBeGreaterThan(rms(m, 16000) * 3);
  });

  it('schuift de cutoff met de CV, in octaven', () => {
    m.setCtl('type', 0); m.setCtl('q', 0.7); m.setCtl('cutoff', 500); m.setCtl('cv_amt', 2);
    m.setIn('cv', 0, false);
    const dicht = rms(m, 3000);                  // ruim boven 500 Hz → weg
    m.setIn('cv', 1);                            // +2 octaven → 2 kHz
    const open = rms(m, 3000);
    expect(open).toBeGreaterThan(dicht * 4);
    m.setIn('cv', 0, false);
  });

  it('maakt resonantie op de cutoff, en de Q-CV telt daarbij op', () => {
    m.setCtl('type', 0); m.setCtl('cutoff', 1000); m.setCtl('cv_amt', 1);
    m.setCtl('q', 0.7);
    const vlak = rms(m, 1000);
    m.setCtl('q', 5);
    const piek = rms(m, 1000);
    expect(piek).toBeGreaterThan(vlak * 1.5);
    // Q terug naar vlak, maar nu via de CV omhoog — zelfde richting.
    m.setCtl('q', 0.7); m.setCtl('q_cv_amt', 4);
    m.setIn('q_cv', 1);
    expect(rms(m, 1000)).toBeGreaterThan(vlak * 1.5);
    m.setIn('q_cv', 0, false);
  });
});

describe('tp_mmb_ms20 (wasm)', () => {
  let m: Mod;
  beforeAll(async () => { m = await load('tp_mmb_ms20'); });

  it('draagt dezelfde poorten en controls als de moduledefinitie', () => {
    const cat = catalog('tp_mmb_ms20');
    expect([...m.inputs, ...m.outputs].sort()).toEqual([...cat.ports].sort());
    expect([...m.controls].sort()).toEqual([...cat.controls].sort());
    expect(m.rate).toBe(44100);
    expect(m.block).toBe(32);
  });

  it('filtert als lowpass (12 dB) en als highpass (6 dB)', () => {
    m.setCtl('q', 0.1); m.setCtl('drive', 1); m.setCtl('type', 0); m.setCtl('cutoff', 1000);
    const low = rms(m, 200), high = rms(m, 8000);
    expect(low).toBeGreaterThan(0.4);
    expect(high).toBeLessThan(low * 0.2);
    m.setCtl('type', 1);
    // 6 dB/oct: minder steil dan de VCF, dus een ruimere marge.
    expect(rms(m, 8000)).toBeGreaterThan(rms(m, 100) * 3);
  });

  it('schuift de cutoff met de CV, in octaven', () => {
    m.setCtl('type', 0); m.setCtl('q', 0.1); m.setCtl('cutoff', 500); m.setCtl('cv_amt', 2);
    m.setIn('cv', 0, false);
    const dicht = rms(m, 3000);
    m.setIn('cv', 1);
    const open = rms(m, 3000);
    expect(open).toBeGreaterThan(dicht * 4);
    m.setIn('cv', 0, false);
  });

  it('gaat schreeuwen bij hoge resonantie', () => {
    m.setCtl('type', 0); m.setCtl('cutoff', 1000); m.setCtl('drive', 1);
    m.setCtl('q', 0.1);
    const vlak = rms(m, 1000);
    m.setCtl('q', 0.95);
    expect(rms(m, 1000)).toBeGreaterThan(vlak * 1.5);
  });

  it('blijft begrensd als drive en resonantie samen opengaan', () => {
    m.setCtl('type', 0); m.setCtl('cutoff', 800); m.setCtl('q', 1); m.setCtl('drive', 10);
    const out = rms(m, 800);
    expect(Number.isFinite(out)).toBe(true);
    expect(out).toBeLessThanOrEqual(1.0);        // tanh + clamp, geen omvouwen
    expect(out).toBeGreaterThan(0.05);           // en het zwijgt niet
  });
});
