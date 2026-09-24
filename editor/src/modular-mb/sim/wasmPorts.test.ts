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

describe('tp_mmb_comb', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_comb'); });

  /** Lusperiode na één klap, via autocorrelatie van de natte staart. */
  const lusperiode = async (coarse: number): Promise<number> => {
    const m = await load('tp_mmb_comb');
    m.setCtl('mix', 1); m.setCtl('feedback', 0.95); m.setCtl('coarse', coarse);
    const [o] = m.render(0.5, (t, mm) => {
      const b = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) b[k] = t === 0 && k === 0 ? 1 : 0;
    });
    const a = o!.slice(2000, 12000);
    let best = 0, bestLag = 0;
    for (let lag = 50; lag < 1500; lag++) {
      let c = 0;
      for (let i = 0; i + lag < a.length; i++) c += a[i]! * a[i + lag]!;
      if (c > best) { best = c; bestLag = lag; }
    }
    return bestLag;
  };

  it('resoneert zoals de hardware: lus = vertraging + één Teensy-blok', async () => {
    // Deze test legt hardwaregedrag vast dat ik voor een firmware-fout houd:
    // de feedback loopt door de Teensy-audiograaf en komt daardoor 128
    // samples te laat. Bij C4 is de vertraging 169 samples, de lus dus 297 —
    // 148 Hz in plaats van 262. Wordt de firmware ooit rechtgezet (een kernel
    // met een lus van één sample), dan hoort deze test mee te veranderen.
    expect(await lusperiode(0)).toBe(169 + 128);
    // Een octaaf hoger halveert alleen de vertraging, niet het blok erbij:
    // C5 = 1,911 ms → 84 samples, lus 84 + 128 = 212. De comb volgt V/Oct
    // dus niet: de toon gaat 297/212 = 1,4× omhoog in plaats van 2×.
    expect(await lusperiode(12)).toBe(84 + 128);
  });

  it('laat droog door bij mix 0', async () => {
    const m = await load('tp_mmb_comb');
    m.setCtl('mix', 0);
    m.setIn('in', 0.5);
    const [o] = m.render(0.05);
    expect(o![o!.length - 1]!).toBeCloseTo(0.5, 5);
  });
});

describe('tp_mmb_quant (firmwareklasse zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_quant'); });

  it('klikt een ruwe CV vast op de dichtstbijzijnde noot van de schaal', async () => {
    const m = await load('tp_mmb_quant');
    m.setCtl('scale', 1); m.setCtl('root', 0); m.setCtl('glide', 0);   // majeur
    m.setIn('in', 1.56 / 12);                    // 1,56 halve toon → D (2)
    let [o] = m.render(0.05);
    expect(o![o!.length - 1]!).toBeCloseTo(2 / 12, 4);
    m.setIn('in', 4.8 / 12);                     // 4,8 → F (5), niet E
    [o] = m.render(0.05);
    expect(o![o!.length - 1]!).toBeCloseTo(5 / 12, 4);
  });

  it('vuurt een trig bij elke nootwissel', async () => {
    const m = await load('tp_mmb_quant');
    m.setCtl('scale', 0);                        // chromatisch
    const [, trig] = m.render(1.0, (t, mm) => mm.setIn('in', Math.floor(t * 5) / 12));
    let flanken = 0;
    for (let i = 1; i < trig!.length; i++) if (trig![i - 1]! < 0.5 && trig![i]! >= 0.5) flanken++;
    expect(flanken).toBeGreaterThanOrEqual(4);  // vijf noten → vier wissels (+ de eerste)
  });
});

describe('tp_mmb_chord (firmwareklasse zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_chord'); });

  it('bouwt een majeur- en een mineurdrieklank op de grondtoon', async () => {
    const stemmen = async (chord: number): Promise<number[]> => {
      const m = await load('tp_mmb_chord');
      m.setCtl('chord', chord); m.setCtl('inv', 0); m.setCtl('spread', 0);
      m.setIn('voct', 0);
      const outs = m.render(0.01);
      return outs.map((o) => Math.round(o[o.length - 1]! * 12 * 100) / 100);
    };
    const maj = await stemmen(0), min = await stemmen(1);
    expect(maj.slice(0, 3)).toEqual([0, 4, 7]);
    expect(min.slice(0, 3)).toEqual([0, 3, 7]);
  });
});

describe('tp_mmb_grids (firmwareklasse zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_grids'); });

  it('speelt een patroon op een externe klok', async () => {
    const m = await load('tp_mmb_grids');
    m.setCtl('extclock', 1);
    // 16e noten op 120 BPM = 8 per seconde; 10 ms hoog.
    const outs = m.render(4.0, (t, mm) => mm.setIn('clock', (t * 8) % 1 < 0.08 ? 1 : 0));
    const flanken = (a: Float32Array): number => {
      let n = 0;
      for (let i = 1; i < a.length; i++) if (a[i - 1]! < 0.5 && a[i]! >= 0.5) n++;
      return n;
    };
    const [bd, sd, hh] = outs.map(flanken);
    expect(bd).toBeGreaterThan(0);
    expect(sd).toBeGreaterThan(0);
    expect(hh).toBeGreaterThan(0);
    // Niet elke tel slaat alles: het is een patroon, geen klok-doorgifte.
    expect(bd).toBeLessThan(32);
  });

  it('loopt op zijn eigen tempo zonder externe klok, en sneller bij een hoger tempo', async () => {
    const tel = async (bpm: number): Promise<number> => {
      const m = await load('tp_mmb_grids');
      m.setCtl('extclock', 0); m.setCtl('tempo', bpm); m.setCtl('hh', 1);
      const outs = m.render(4.0);
      let n = 0;
      const hh = outs[2]!;
      for (let i = 1; i < hh.length; i++) if (hh[i - 1]! < 0.5 && hh[i]! >= 0.5) n++;
      return n;
    };
    const langzaam = await tel(60), snel = await tel(180);
    expect(langzaam).toBeGreaterThan(0);
    expect(snel).toBeGreaterThan(langzaam * 2);
  });
});

describe('tp_mmb_lfo (firmwareklasse zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_lfo'); });

  /** Aantal opgaande nuldoorgangen — voor een sinus: aantal periodes. */
  const cycles = (a: Float32Array): number => {
    let n = 0;
    for (let i = 1; i < a.length; i++) if (a[i - 1]! < 0 && a[i]! >= 0) n++;
    return n;
  };

  it('geeft een sinus van 1 Hz op ±depth, en out_inv is het spiegelbeeld', async () => {
    const m = await load('tp_mmb_lfo');
    m.setCtl('rate', 1); m.setCtl('depth', 0.5);
    const [out, inv] = m.render(4.0);
    expect(cycles(out!)).toBeGreaterThanOrEqual(3);
    expect(cycles(out!)).toBeLessThanOrEqual(4);
    expect(peak(out!)).toBeCloseTo(0.5, 2);
    for (let i = 0; i < out!.length; i += 97) expect(inv![i]).toBeCloseTo(-out![i]!, 6);
  });

  it('bipolar uit geeft 0..depth — de toggle komt als bool binnen, zoals op de Teensy', async () => {
    // Lfo::setControl leest `bipolar` als bool of int, niet als float. Kreeg
    // hij een float, dan bleef hij bipolair en zakte dit onder nul.
    const m = await load('tp_mmb_lfo');
    m.setCtl('bipolar', 0);
    const [out] = m.render(2.0);
    let lo = Infinity, hi = -Infinity;
    for (const v of out!) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(lo).toBeLessThan(0.01);
    expect(hi).toBeGreaterThan(0.99);
  });

  it('rate_cv is exponentieel: +0,25 is één octaaf sneller', async () => {
    const m = await load('tp_mmb_lfo');
    m.setCtl('rate', 2);
    m.setIn('rate_cv', 0.25);
    const [out] = m.render(4.0);
    expect(cycles(out!)).toBeGreaterThanOrEqual(15);
    expect(cycles(out!)).toBeLessThanOrEqual(16);
  });

  it('een reset-flank zet de fase terug op nul', async () => {
    const m = await load('tp_mmb_lfo');
    m.setCtl('rate', 1); m.setCtl('wave', 2);           // zaagtand: fase is direct af te lezen
    m.setIn('reset', 0);
    const [out] = m.render(0.6, (t, mm) => mm.setIn('reset', t >= 0.5 ? 1 : 0));
    expect(out![499]!).toBeGreaterThan(-0.05);          // halverwege: rond 0
    expect(out![505]!).toBeLessThan(-0.95);             // na de reset: weer onderaan
  });
});

describe('tp_mmb_string (AudioSynthKarplusStrong overgeschreven)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_string'); });

  /** Lag met de hoogste autocorrelatie tussen `lo` en `hi`. */
  const period = (a: Float32Array, from: number, lo: number, hi: number): number => {
    let best = lo, bestR = -Infinity;
    for (let lag = lo; lag <= hi; lag++) {
      let r = 0;
      for (let i = from; i < from + 4096; i++) r += a[i]! * a[i + lag]!;
      if (r > bestR) { bestR = r; best = lag; }
    }
    return best;
  };

  const pluck = async (voct: number, level = 0.8): Promise<Float32Array> => {
    const m = await load('tp_mmb_string');
    m.setCtl('level', level);
    m.setIn('voct', voct);
    m.setIn('gate', 0);
    return m.render(1.0, (t, mm) => mm.setIn('gate', t >= 0.1 ? 1 : 0))[0]!;
  };

  it('zwijgt tot de gate opgaat, en slaat dan aan op een Teensy-blokgrens', async () => {
    const out = await pluck(0);
    expect(peak(out, 0, 4410)).toBe(0);
    let first = -1;
    for (let i = 0; i < out.length; i++) if (out[i] !== 0) { first = i; break; }
    expect(first).toBeGreaterThanOrEqual(4410);
    expect(first % 128).toBe(0);
    expect(peak(out)).toBeGreaterThan(0.3);
  });

  it('klinkt op 44100 / (len + ½): C4 = 169 samples, een octaaf hoger 84', async () => {
    const c4 = await pluck(0), c5 = await pluck(1);
    // Een halve sample valt tussen twee lags in: len of len + 1.
    expect([169, 170]).toContain(period(c4, 6000, 100, 250));
    expect([84, 85]).toContain(period(c5, 6000, 60, 120));
  });

  it('sterft uit', async () => {
    const out = await pluck(0);
    expect(rms(out, 36000, 44100)).toBeLessThan(rms(out, 5000, 13000) * 0.5);
  });

  it('gaat niet lager dan 536 samples (~82 Hz), zoals de Teensy-buffer', async () => {
    const out = await pluck(-2);                        // C2 zou 674 samples zijn
    expect([536, 537]).toContain(period(out, 6000, 400, 800));
  });

  it('level 0 is stil', async () => {
    expect(peak(await pluck(0, 0))).toBe(0);
  });
});
