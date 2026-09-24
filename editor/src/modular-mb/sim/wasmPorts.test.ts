// De modules die in september 2026 naar wasm gingen, doorgemeten in node.
//
// Per module twee vragen. Eén: dragen de poorten en controls exact dezelfde
// namen als de moduledefinitie? Zo niet, dan koppelt de worklet ze niet en
// blijft de module stil zonder foutmelding — de meest voorkomende fout bij
// een nieuwe wrapper. Twee: doet hij zijn werk? Daarvoor krijgt elke module
// een eigen proef, geen klankoordeel maar een gedrag dat er aantoonbaar moet
// zijn (een galmstaart, een vermenigvuldiging, een toonhoogte die klopt).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';

const project = seedInternals(emptyModularProject());

interface Mod {
  ex: any; rate: number; block: number;
  inputs: string[]; outputs: string[]; controls: string[];
  setCtl(id: string, v: number): void;
  /** Vaste waarde op een ingang (cv/gate), of los (`connected` false). */
  setIn(id: string, v: number, connected?: boolean): void;
  /** Rendert `seconds`; `feed(t)` vult per blok de ingangen, geeft per
   *  uitgang de samples terug. */
  render(seconds: number, feed?: (t: number, m: Mod) => void): Float32Array[];
  inBuf(id: string): Float32Array;
}

async function load(typeId: string): Promise<Mod> {
  const bytes = readFileSync(fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url)));
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as any;
  // Het geheugen kan groeien (STK alloceert); dus elke keer opnieuw pakken.
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  ex.mmb_init();
  const inputs: string[] = [], outputs: string[] = [], controls: string[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  inputs.push(cstr(ex.mmb_input_id(i)));
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outputs.push(cstr(ex.mmb_output_id(i)));
  for (let i = 0; i < ex.mmb_num_controls(); i++) controls.push(cstr(ex.mmb_control_id(i)));
  const inView = (i: number): Float32Array => new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256);
  const m: Mod = {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(), inputs, outputs, controls,
    setCtl: (id, v) => { const i = controls.indexOf(id); if (i < 0) throw new Error(`geen control ${id}`); ex.mmb_set_control(i, v); },
    setIn: (id, v, connected = true) => {
      const i = inputs.indexOf(id);
      if (i < 0) throw new Error(`geen ingang ${id}`);
      inView(i).fill(v);
      ex.mmb_input_connected(i, connected ? 1 : 0);
    },
    inBuf: (id) => {
      const i = inputs.indexOf(id);
      if (i < 0) throw new Error(`geen ingang ${id}`);
      ex.mmb_input_connected(i, 1);
      return inView(i);
    },
    render(seconds, feed) {
      const n = Math.round(this.rate * seconds);
      const out = outputs.map(() => new Float32Array(n));
      for (let t = 0; t < n; t += this.block) {
        feed?.(t / this.rate, this);
        ex.mmb_render(this.block);
        for (let o = 0; o < outputs.length; o++) {
          const b = new Float32Array(ex.memory.buffer, ex.mmb_output_ptr(o), 256);
          for (let k = 0; k < this.block && t + k < n; k++) out[o]![t + k] = b[k]!;
        }
      }
      return out;
    },
  };
  return m;
}

const peak = (a: Float32Array, from = 0, to = a.length): number => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i]!));
  return p;
};
const rms = (a: Float32Array, from = 0, to = a.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};

/** Poort- en control-namen moeten exact die van de catalogus zijn. */
async function expectMatchesCatalog(typeId: string): Promise<Mod> {
  const m = await load(typeId);
  const t = project.moduleTypes.find((x) => x.id === typeId);
  expect(t, `${typeId} staat niet in de catalogus`).toBeTruthy();
  expect([...m.inputs, ...m.outputs].sort()).toEqual(t!.ports.map((p) => p.id).sort());
  expect([...m.controls].sort()).toEqual(t!.controls.map((c) => c.id).sort());
  return m;
}

describe('tp_mmb_elements_reverb', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_elements_reverb'); });

  it('laat een galmstaart na als de invoer stopt', async () => {
    const m = await load('tp_mmb_elements_reverb');
    m.setCtl('amount', 0.6); m.setCtl('time', 0.7);
    let ph = 0;
    // 50 ms toon, dan stilte; de galm moet daarna nog doorklinken.
    const [l, r] = m.render(1.0, (t, mm) => {
      const bl = mm.inBuf('in_l'), br = mm.inBuf('in_r');
      for (let k = 0; k < mm.block; k++) {
        const v = t < 0.05 ? 0.5 * Math.sin(ph) : 0;
        bl[k] = v; br[k] = v; ph += 2 * Math.PI * 440 / mm.rate;
      }
    });
    const staart = Math.round(m.rate * 0.4), eind = Math.round(m.rate * 0.6);
    expect(rms(l!, staart, eind)).toBeGreaterThan(0.002);
    expect(rms(r!, staart, eind)).toBeGreaterThan(0.002);
    // Stereo: links en rechts zijn niet hetzelfde signaal.
    let diff = 0;
    for (let i = staart; i < eind; i++) diff += Math.abs(l![i]! - r![i]!);
    expect(diff).toBeGreaterThan(0);
  });

  it('laat droog door zonder galm bij amount 0', async () => {
    const m = await load('tp_mmb_elements_reverb');
    m.setCtl('amount', 0);
    const [l] = m.render(0.6, (t, mm) => {
      const bl = mm.inBuf('in_l'); mm.inBuf('in_r').fill(0);
      for (let k = 0; k < mm.block; k++) bl[k] = t < 0.05 ? 0.5 : 0;
    });
    expect(peak(l!, Math.round(m.rate * 0.2))).toBeLessThan(0.001);
  });
});


describe('tp_mmb_octa_vca', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_octa_vca'); });

  it('vermenigvuldigt elke cel met zijn eigen CV × Level', async () => {
    const m = await load('tp_mmb_octa_vca');
    m.setCtl('level', 0.5);
    for (let c = 1; c <= 8; c++) m.setIn(`in_${c}`, 0.8);
    m.setIn('cv_3', 1.0);
    m.setIn('cv_5', 0.5);
    const out = m.render(0.05);
    const eind = out[0]!.length - 1;
    expect(out[2]![eind]).toBeCloseTo(0.8 * 1.0 * 0.5, 4);   // cel 3
    expect(out[4]![eind]).toBeCloseTo(0.8 * 0.5 * 0.5, 4);   // cel 5
    // Zonder CV-kabel blijft een cel dicht, zoals op de Teensy.
    expect(out[0]![eind]).toBe(0);
  });

  it('slewt de gain in ~2 ms in plaats van te springen (geen klik)', async () => {
    const m = await load('tp_mmb_octa_vca');
    m.setIn('in_1', 1); m.setIn('cv_1', 1);
    const [o] = m.render(0.01);
    // Na één sample nog lang niet open, na 3 ms helemaal.
    expect(o![1]!).toBeLessThan(0.1);
    expect(o![Math.round(m.rate * 0.003)]!).toBeCloseTo(1, 4);
  });
});

describe('tp_mmb_stereo_vca', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_stereo_vca'); });

  it('pant met equal power: midden −3 dB per kant, zijkanten één kant open', async () => {
    const eindOf = async (pan: number): Promise<[number, number]> => {
      const m = await load('tp_mmb_stereo_vca');
      m.setCtl('vol', 1); m.setCtl('pan', pan);
      m.setIn('in', 1);
      const [l, r] = m.render(0.01);
      return [l![l!.length - 1]!, r![r!.length - 1]!];
    };
    const [ml, mr] = await eindOf(0);
    expect(ml).toBeCloseTo(Math.SQRT1_2, 4);
    expect(mr).toBeCloseTo(Math.SQRT1_2, 4);
    expect(ml * ml + mr * mr).toBeCloseTo(1, 4);            // vermogen constant
    const [ll, lr] = await eindOf(-1);
    expect(ll).toBeCloseTo(1, 4); expect(lr).toBeCloseTo(0, 4);
    const [rl, rr] = await eindOf(1);
    expect(rl).toBeCloseTo(0, 4); expect(rr).toBeCloseTo(1, 4);
  });

  it('laat de CV de knop overnemen zolang de kabel erin zit', async () => {
    const m = await load('tp_mmb_stereo_vca');
    m.setCtl('vol', 1); m.setCtl('pan', 0);
    m.setIn('in', 1); m.setIn('vol_cv', 0.25);
    const [l] = m.render(0.01);
    expect(l![l!.length - 1]!).toBeCloseTo(0.25 * Math.SQRT1_2, 4);
  });
});
