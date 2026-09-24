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

describe('tp_mmb_resonator', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_resonator'); });

  /** Eén klap in, alleen nat eruit; geeft de uitgang terug. */
  const klap = async (root: number): Promise<Float32Array> => {
    const m = await load('tp_mmb_resonator');
    m.setCtl('mix', 1); m.setCtl('decay', 0.95); m.setCtl('structure', 0);
    m.setCtl('scale', 3);                     // kwint/octaaf: weinig slijtage
    m.setCtl('root', root);
    const [o] = m.render(0.8, (t, mm) => {
      const b = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) b[k] = t === 0 && k === 0 ? 1 : 0;
    });
    return o!;
  };

  it('blijft natrillen na één klap', async () => {
    const o = await klap(0);
    expect(rms(o, Math.round(44100 * 0.4), Math.round(44100 * 0.6))).toBeGreaterThan(0.001);
  });

  it('stemt een octaaf hoger als de grondtoon 12 halve tonen stijgt', async () => {
    // Op de harmonische schaal (4) zijn de twaalf snaren boventonen van de
    // grondtoon, dus de som herhaalt zich met díe periode. Autocorrelatie
    // vindt hem; een octaaf hoger moet de periode halveren.
    const periode = async (root: number): Promise<number> => {
      const m = await load('tp_mmb_resonator');
      m.setCtl('mix', 1); m.setCtl('decay', 0.95); m.setCtl('structure', 0);
      m.setCtl('scale', 4); m.setCtl('root', root);
      const [o] = m.render(0.8, (t, mm) => {
        const b = mm.inBuf('in');
        for (let k = 0; k < mm.block; k++) b[k] = t === 0 && k === 0 ? 1 : 0;
      });
      const a = o!.slice(15000, 30000);
      let mean = 0; for (const v of a) mean += v; mean /= a.length;
      for (let i = 0; i < a.length; i++) a[i] = a[i]! - mean;
      let best = 0, bestLag = 0;
      for (let lag = 150; lag < 1500; lag++) {
        let c = 0;
        for (let i = 0; i + lag < a.length; i++) c += a[i]! * a[i + lag]!;
        if (c > best) { best = c; bestLag = lag; }
      }
      return bestLag;
    };
    // C2 = 65,4 Hz → ~674 samples; C3 → ~337.
    const laag = await periode(0), hoog = await periode(12);
    expect(laag / hoog).toBeGreaterThan(1.8);
    expect(laag / hoog).toBeLessThan(2.2);
    expect(Math.abs(laag - 44100 / 65.41)).toBeLessThan(20);
  });
});

describe('tp_mmb_cr78', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_cr78'); });

  it('slaat elke drum aan op een stijgende gate en klinkt dan uit', async () => {
    const stil: string[] = [];
    const namen = ['Kick','Snare','Rim','Claves','Cowbell','HiHat','Cymbal','Maracas','Guiro','Bongo','Conga','Tamb'];
    for (let d = 0; d < 12; d++) {
      const m = await load('tp_mmb_cr78');
      m.setCtl('drum', d);
      const [o] = m.render(1.5, (t, mm) => mm.setIn('gate', t < 0.01 ? 1 : 0));
      const kop = peak(o!, 0, Math.round(44100 * 0.2));
      const staart = peak(o!, Math.round(44100 * 1.3));
      if (kop < 0.02) stil.push(`${namen[d]} (piek ${kop.toFixed(4)})`);
      expect(staart, namen[d]).toBeLessThan(kop * 0.1);   // hij sterft uit
    }
    expect(stil).toEqual([]);
  });

  it('zwijgt zonder aanslag', async () => {
    const m = await load('tp_mmb_cr78');
    const [o] = m.render(0.3);
    expect(peak(o!)).toBe(0);
  });

  it('slaat harder aan met accent', async () => {
    const meet = async (acc: number): Promise<number> => {
      const m = await load('tp_mmb_cr78');
      m.setIn('accent_cv', acc);
      const [o] = m.render(0.2, (t, mm) => mm.setIn('gate', t < 0.01 ? 1 : 0));
      return peak(o!);
    };
    expect(await meet(1)).toBeGreaterThan(await meet(0) * 1.3);
  });
});

describe('tp_mmb_comp', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_comp'); });

  /** RMS van de uitgang bij een sinus met amplitude `amp`, na insteltijd. */
  const uit = async (amp: number, ctl: Record<string, number>): Promise<number> => {
    const m = await load('tp_mmb_comp');
    for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
    let ph = 0;
    const [o] = m.render(0.5, (_t, mm) => {
      const b = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) { b[k] = amp * Math.sin(ph); ph += 2 * Math.PI * 220 / mm.rate; }
    });
    return rms(o!, Math.round(44100 * 0.3));
  };

  it('drukt harde signalen meer in dan zachte', async () => {
    const ctl = { threshold: -30, ratio: 8, drive: 0, makeup: 0 };
    const zacht = await uit(0.01, ctl), hard = await uit(0.8, ctl);
    // Ingang 38 dB uit elkaar; na een 8:1-compressor boven −30 dB veel minder.
    const inVerschil = 20 * Math.log10(0.8 / 0.01);
    const uitVerschil = 20 * Math.log10(hard / zacht);
    expect(uitVerschil).toBeLessThan(inVerschil - 20);
  });

  it('laat alles door bij ratio 1 zonder drive', async () => {
    const r = await uit(0.5, { threshold: -30, ratio: 1, drive: 0, makeup: 0 });
    expect(r).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });
});
