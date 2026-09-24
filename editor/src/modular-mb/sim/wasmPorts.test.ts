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
  // LED's en displays zijn uitlezingen op het paneel, geen controls voor de firmware.
  const echte = t!.controls.filter((c) => !['led', 'display'].includes(String((c as { kind?: string }).kind)));
  expect([...m.controls].sort()).toEqual(echte.map((c) => c.id).sort());
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

describe('tp_mmb_echo (Teensy-graaf nagebootst)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_echo'); });

  /** Eén klik op t = 0, dan stilte; geeft de uitgang terug. */
  const impulse = async (time: number, fbk: number): Promise<Float32Array> => {
    const m = await load('tp_mmb_echo');
    m.setCtl('time', time); m.setCtl('feedback', fbk); m.setCtl('mix', 1);
    return m.render(1.5, (t, mm) => mm.setIn('in', t === 0 ? 1 : 0))[0]!;
  };
  const firstAbove = (a: Float32Array, from: number, thr = 0.01): number => {
    for (let i = from; i < a.length; i++) if (Math.abs(a[i]!) > thr) return i;
    return -1;
  };

  it('eerste echo op time, de tweede op 2·time + 128 (feedback één Teensy-blok later)', async () => {
    // De klik vult het eerste blok van 32; de flank ligt op sample 0.
    const out = await impulse(0.1, 0.5);
    expect(firstAbove(out, 1)).toBe(4410);
    expect(firstAbove(out, 4410 + 32)).toBe(2 * 4410 + 128);
  });

  it('elke herhaling is feedback × de vorige', async () => {
    const out = await impulse(0.1, 0.5);
    const a = peak(out, 4410, 4410 + 32), b = peak(out, 8948, 8948 + 32);
    expect(b / a).toBeCloseTo(0.5, 3);
  });

  it('time klemt op 500 ms, zoals EchoModule::kMaxDelayMs', async () => {
    const out = await impulse(2.0, 0);
    expect(firstAbove(out, 1)).toBe(22050);
  });
});

describe('tp_mmb_phaser (mmb_dsp::Phaser, gedeeld met de firmware)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_phaser'); });

  /** Sinus van `hz` door de phaser; rms per venster van 50 ms. */
  const sweep = async (hz: number, set: (m: Mod) => void): Promise<number[]> => {
    const m = await load('tp_mmb_phaser');
    set(m);
    const out = m.render(2.0, (t, mm) => {
      const b = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) b[k] = 0.5 * Math.sin(2 * Math.PI * hz * (t + k / mm.rate));
    })[0]!;
    const win = 2205, r: number[] = [];
    for (let i = 0; i + win <= out.length; i += win) r.push(rms(out, i, i + win));
    return r;
  };

  it('mix 0 en feedback 0 laten het droge signaal door', async () => {
    const r = await sweep(1000, (m) => { m.setCtl('mix', 0); m.setCtl('feedback', 0); });
    for (const v of r.slice(2)) expect(v).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  it('het droge pad zit ná de feedback — mix 0 is dus niet helemaal droog (zoals de firmware)', async () => {
    // PhaserModule telt fbState·feedback op bij x en mengt daarna x met y.
    const r = await sweep(1000, (m) => { m.setCtl('mix', 0); m.setCtl('feedback', 0.9); });
    const dev = Math.max(...r.slice(2).map((v) => Math.abs(v - 0.5 / Math.SQRT2)));
    expect(dev).toBeGreaterThan(0.01);
  });

  it('de notch zwaait: het niveau van een vaste toon ademt mee met de LFO', async () => {
    const r = await sweep(1000, (m) => { m.setCtl('rate', 1); m.setCtl('depth', 1); m.setCtl('mix', 0.5); });
    const lo = Math.min(...r.slice(2)), hi = Math.max(...r.slice(2));
    expect(hi / lo).toBeGreaterThan(2);
  });

  it('rate_cv stelt de LFO in (Hz), net als de knop', async () => {
    // Met rate 0 staat de LFO stil; rate_cv 1 laat hem weer lopen.
    const stil = await sweep(1000, (m) => { m.setCtl('rate', 0); m.setCtl('depth', 1); });
    const loopt = await sweep(1000, (m) => { m.setCtl('rate', 0); m.setCtl('depth', 1); m.setIn('rate_cv', 1); });
    const spread = (r: number[]): number => Math.max(...r.slice(2)) / Math.min(...r.slice(2));
    expect(spread(stil)).toBeLessThan(1.05);
    expect(spread(loopt)).toBeGreaterThan(2);
  });
});

describe('tp_mmb_ladder (AudioFilterLadder overgeschreven)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_ladder'); });

  const sine = (hz: number, amp = 0.5) => (t: number, m: Mod): void => {
    const b = m.inBuf('in');
    for (let k = 0; k < m.block; k++) b[k] = amp * Math.sin(2 * Math.PI * hz * (t + k / m.rate));
  };
  const gainAt = async (hz: number): Promise<number> => {
    const m = await load('tp_mmb_ladder');
    m.setCtl('cutoff', 1000); m.setCtl('q', 0);
    const out = m.render(0.5, sine(hz))[0]!;
    return rms(out, 11025) / (0.5 / Math.SQRT2);
  };
  /** Zelfoscillatie: toonhoogte via nuldoorgangen, na een tikje. */
  const selfOsc = async (cutoff: number, set?: (m: Mod) => void): Promise<number> => {
    const m = await load('tp_mmb_ladder');
    m.setCtl('cutoff', cutoff); m.setCtl('q', 1.8);
    set?.(m);
    const out = m.render(1.0, (t, mm) => mm.setIn('in', t === 0 ? 0.5 : 0))[0]!;
    let n = 0;
    for (let i = 22050; i < 44100; i++) if (out[i - 1]! < 0 && out[i]! >= 0) n++;
    return n * 2;                                        // halve seconde → Hz
  };

  it('is een laagdoorlaat van 24 dB/oct', async () => {
    const laag = await gainAt(100), hoog = await gainAt(8000);
    // passbandGain 0,5 is de standaard: de doorlaat staat op −6 dB.
    expect(laag).toBeGreaterThan(0.4);
    expect(hoog).toBeLessThan(0.01);
  });

  it('oscilleert zelf bij Q 1,8, rond de cutoff', async () => {
    const f = await selfOsc(1000);
    expect(f).toBeGreaterThan(700);
    expect(f).toBeLessThan(1300);
  });

  it('cv × cv_amt is octaven: cv 0,5 bij 2 oct is één octaaf hoger', async () => {
    const f0 = await selfOsc(500), f1 = await selfOsc(500, (m) => m.setIn('cv', 0.5));
    expect(f1 / f0).toBeGreaterThan(1.85);
    expect(f1 / f0).toBeLessThan(2.15);
  });
});

describe('tp_mmb_octa_vcf (AudioFilterStateVariable overgeschreven)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_octa_vcf'); });

  /** Versterking van cel `cell` voor een sinus van `hz` (0,5 amplitude). */
  const gain = async (hz: number, set?: (m: Mod) => void, cell = 1): Promise<number> => {
    const m = await load('tp_mmb_octa_vcf');
    set?.(m);
    const out = m.render(0.5, (t, mm) => {
      const b = mm.inBuf(`in_${cell}`);
      for (let k = 0; k < mm.block; k++) b[k] = 0.5 * Math.sin(2 * Math.PI * hz * (t + k / mm.rate));
    })[cell - 1]!;
    return rms(out, 11025) / (0.5 / Math.SQRT2);
  };

  it('LP (type 0) laat laag door en dempt hoog met 12 dB/oct', async () => {
    expect(await gain(100)).toBeGreaterThan(0.9);
    const g4 = await gain(6400), g8 = await gain(12800);
    expect(g4).toBeLessThan(0.05);
    expect(g4 / g8).toBeGreaterThan(3);                  // ~4× per octaaf
  });

  it('HP (type 2) doet het omgekeerde', async () => {
    const hp = (m: Mod): void => m.setCtl('type', 2);
    expect(await gain(100, hp)).toBeLessThan(0.05);
    expect(await gain(8000, hp)).toBeGreaterThan(0.9);
  });

  it('cv_N × cv_amt is octaven, bovenop de gedeelde cv', async () => {
    // Twee octaven boven de cutoff: 12 dB/oct → een octaaf opschuiven ≈ 4×.
    const zonder = await gain(3200);
    const cel = await gain(3200, (m) => m.setIn('cv_1', 0.5));          // +1 oct
    const beide = await gain(3200, (m) => { m.setIn('cv_1', 0.25); m.setIn('cv', 0.25); });
    expect(cel / zonder).toBeGreaterThan(3);
    expect(beide / cel).toBeCloseTo(1, 1);
  });

  it('een cel zonder audiokabel zwijgt, de andere cellen spelen', async () => {
    const m = await load('tp_mmb_octa_vcf');
    const outs = m.render(0.2, (t, mm) => {
      const b = mm.inBuf('in_3');
      for (let k = 0; k < mm.block; k++) b[k] = 0.5 * Math.sin(2 * Math.PI * 200 * (t + k / mm.rate));
    });
    expect(peak(outs[2]!)).toBeGreaterThan(0.3);
    expect(peak(outs[0]!)).toBe(0);
  });
});

/** Frequentie via opgaande nuldoorgangen over een seconde signaal. */
const hzOf = (a: Float32Array, rate: number): number => {
  let first = -1, last = -1, n = 0;
  for (let i = 1; i < a.length; i++) if (a[i - 1]! < 0 && a[i]! >= 0) { if (first < 0) first = i; last = i; n++; }
  return n > 1 ? (n - 1) * rate / (last - first) : 0;
};

describe('tp_mmb_octa_vco (AudioSynthWaveform overgeschreven)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_octa_vco'); });

  it('staat op C4 bij 0 V, en V/Oct per cel', async () => {
    const m = await load('tp_mmb_octa_vco');
    m.setCtl('wave', 0);
    m.setIn('voct_2', 1); m.setIn('voct_3', -1);
    const outs = m.render(1.0);
    expect(hzOf(outs[0]!, m.rate)).toBeCloseTo(261.63, 0);
    expect(hzOf(outs[1]!, m.rate)).toBeCloseTo(523.25, 0);
    expect(hzOf(outs[2]!, m.rate)).toBeCloseTo(130.81, 0);
  });

  it('sinuspiek volgt level (magnitude = level · 65536)', async () => {
    const m = await load('tp_mmb_octa_vco');
    m.setCtl('wave', 0); m.setCtl('level', 0.5);
    expect(peak(m.render(0.2)[0]!)).toBeCloseTo(0.5, 2);
  });

  it('detune spreidt de cellen symmetrisch: cel 1 laagst, cel 8 hoogst', async () => {
    const m = await load('tp_mmb_octa_vco');
    m.setCtl('wave', 0); m.setCtl('detune', 50);
    const outs = m.render(1.0);
    const f1 = hzOf(outs[0]!, m.rate), f8 = hzOf(outs[7]!, m.rate);
    expect(1200 * Math.log2(f8 / f1)).toBeCloseTo(50, 0);
  });

  it('alle vier de golfvormen klinken', async () => {
    for (const w of [0, 1, 2, 3]) {
      const m = await load('tp_mmb_octa_vco');
      m.setCtl('wave', w);
      expect(peak(m.render(0.1)[0]!), `wave ${w}`).toBeGreaterThan(0.3);
    }
  });
});

describe('tp_mmb_wt_vco (AudioSynthWaveform arbitrary + fillBank)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_wt_vco'); });

  it('staat op C4 bij 0 V en volgt V/Oct', async () => {
    const m = await load('tp_mmb_wt_vco');
    m.setCtl('bank', 2);                                  // driehoek: schone nuldoorgangen
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(261.63, 0);
    m.setIn('voct', 1);
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(523.25, 0);
  });

  it('elke bank geeft een andere golfvorm op dezelfde piek', async () => {
    const vormen: Float32Array[] = [];
    for (let b = 0; b < 6; b++) {
      const m = await load('tp_mmb_wt_vco');
      m.setCtl('bank', b);
      const out = m.render(0.1)[0]!;
      expect(peak(out), `bank ${b}`).toBeGreaterThan(0.75);
      vormen.push(out);
    }
    for (let b = 1; b < 6; b++) expect(rms(vormen[b]!), `bank ${b}`).not.toBeCloseTo(rms(vormen[0]!), 3);
  });
});

describe('tp_mmb_draw_vco (getekende golf via blob-slot 0)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_draw_vco'); });

  /** Zoals mmb-worklet.js 'blob' afhandelt. */
  const blob = (m: Mod, data: Int16Array): void => {
    const p = m.ex.mmb_blob_ptr(0, data.byteLength);
    expect(p).not.toBe(0);
    new Uint8Array(m.ex.memory.buffer).set(new Uint8Array(data.buffer), p);
    m.ex.mmb_blob_commit(0, data.length, 44100, 1);
  };

  it('speelt een driehoek op C4 zolang er niets getekend is', async () => {
    const m = await load('tp_mmb_draw_vco');
    const out = m.render(1.0)[0]!;
    expect(hzOf(out, m.rate)).toBeCloseTo(261.63, 0);
    // Driehoek: rms = piek / √3.
    expect(rms(out) / peak(out)).toBeCloseTo(1 / Math.sqrt(3), 1);
  });

  it('neemt een tekening over, geresampled naar 256 punten', async () => {
    const m = await load('tp_mmb_draw_vco');
    // Blokgolf van 64 punten: rms = piek.
    blob(m, Int16Array.from({ length: 64 }, (_, i) => (i < 32 ? 32767 : -32767)));
    const out = m.render(0.5)[0]!;
    expect(rms(out, 2205) / peak(out)).toBeGreaterThan(0.95);
    expect(hzOf(out, m.rate)).toBeCloseTo(261.63, 0);
  });
});

describe('tp_mmb_noise (mmb_dsp::Noise, gedeeld met de firmware)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_noise'); });

  /** Verhouding hoog/laag: energie van het verschilsignaal t.o.v. het signaal. */
  const tilt = async (color: number): Promise<{ r: number; diff: number }> => {
    const m = await load('tp_mmb_noise');
    m.setCtl('color', color); m.setCtl('level', 1);
    const out = m.render(1.0)[0]!;
    const d = new Float32Array(out.length - 1);
    for (let i = 1; i < out.length; i++) d[i - 1] = out[i]! - out[i - 1]!;
    return { r: rms(out), diff: rms(d) / rms(out) };
  };

  it('wit, roze en bruin worden steeds donkerder', async () => {
    const w = await tilt(0), p = await tilt(1), b = await tilt(2);
    // Wit: verschil-rms ≈ √2 × rms. Hoe donkerder, hoe kleiner.
    expect(w.diff).toBeCloseTo(Math.SQRT2, 1);
    expect(p.diff).toBeLessThan(w.diff * 0.8);
    expect(b.diff).toBeLessThan(p.diff * 0.5);
    for (const x of [w, p, b]) expect(x.r).toBeGreaterThan(0.1);
  });

  it('level schaalt, en de reeks is deterministisch (zelfde seed als de firmware)', async () => {
    const a = await load('tp_mmb_noise'), b = await load('tp_mmb_noise');
    a.setCtl('level', 0.5); b.setCtl('level', 1);
    const ya = a.render(0.1)[0]!, yb = b.render(0.1)[0]!;
    for (let i = 0; i < ya.length; i += 101) expect(ya[i]!).toBeCloseTo(yb[i]! * 0.5, 6);
  });
});

// ── Stap 6, fase A: de modules achter de noot-dispatcher ─────────────────────

describe('tp_mmb_vco (VcoModule, AudioSynthWaveform)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_vco'); });

  it('zaagtand op C4, amplitude 0,9 — zoals de constructor', async () => {
    const m = await load('tp_mmb_vco');
    const out = m.render(1.0)[0]!;
    expect(hzOf(out, m.rate)).toBeCloseTo(261.63, 0);
    expect(peak(out)).toBeCloseTo(0.9, 2);
  });

  it('coarse telt pas mee bij de volgende voct-schrijf (firmware-eigenaardigheid)', async () => {
    const m = await load('tp_mmb_vco');
    m.setCtl('wave', 0);
    m.setIn('voct', 0);
    m.render(0.05);
    m.setCtl('coarse', 12);
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(261.63, 0);   // nog niets
    m.setIn('voct', 0.0001);                                            // nieuwe schrijf
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(523.3, 0);
  });
});

describe('tp_mmb_fm_vco (AudioSynthWaveformModulated)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_fm_vco'); });

  it('fm × fm_amt is octaven: +0,25 bij 4 oct is één octaaf hoger', async () => {
    const m = await load('tp_mmb_fm_vco');
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(261.63, 0);
    m.setCtl('fm_amt', 4);
    m.setIn('fm', 0.25);
    expect(hzOf(m.render(1.0)[0]!, m.rate)).toBeCloseTo(523.25, -1);
  });
});

describe('tp_mmb_vca (AudioEffectMultiply + DC-proxy)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_vca'); });

  const feed = (t: number, mm: Mod): void => {
    const b = mm.inBuf('in');
    for (let k = 0; k < mm.block; k++) b[k] = 0.8 * Math.sin(2 * Math.PI * 220 * (t + k / mm.rate));
  };

  it('is dicht zonder CV-kabel, wat gain ook zegt', async () => {
    const m = await load('tp_mmb_vca');
    m.setCtl('gain', 1);
    expect(peak(m.render(0.2, feed)[0]!)).toBe(0);
  });

  it('cv is de versterking, met 2 ms slew', async () => {
    const m = await load('tp_mmb_vca');
    m.setIn('cv', 0.5);
    const out = m.render(0.2, feed)[0]!;
    expect(peak(out, 441)).toBeCloseTo(0.4, 2);
    expect(peak(out, 0, 20)).toBeLessThan(0.4 * 0.5);                   // nog aan het opengaan
  });
});

describe('tp_mmb_ahdsr (mb::runtime::Ahdsr zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_ahdsr'); });

  it('een vastgehouden gate slaat één keer aan en blijft op sustain', async () => {
    const m = await load('tp_mmb_ahdsr');
    m.setCtl('attack', 10); m.setCtl('decay', 50); m.setCtl('sustain', 0.5); m.setCtl('release', 100);
    m.setIn('gate', 1);
    const [env] = m.render(0.5);
    expect(peak(env!, 0, 20)).toBeGreaterThan(0.95);                   // attack gehaald
    // Zou elke tick de gate opnieuw geschreven worden, dan sloeg hij telkens
    // opnieuw aan en haalde hij sustain nooit.
    expect(env![400]!).toBeCloseTo(0.5, 2);
  });

  it('loslaten zet de release in', async () => {
    const m = await load('tp_mmb_ahdsr');
    m.setCtl('release', 100);
    const [env] = m.render(1.0, (t, mm) => mm.setIn('gate', t < 0.5 ? 1 : 0));
    expect(env![499]!).toBeGreaterThan(0.6);
    expect(env![700]!).toBe(0);
  });

  it('loop komt als bool binnen — en loopt één keer, dan hangt hij op sustain (zoals de firmware)', async () => {
    // Ahdsr::advancePhase: Release → Attack bij loop, maar Decay → Sustain
    // wacht op een dalende gate die niet meer komt. Het paneel belooft een
    // quasi-LFO; de hardware doet dit (zie de Teensy-todo).
    const m = await load('tp_mmb_ahdsr');
    m.setCtl('attack', 20); m.setCtl('decay', 20); m.setCtl('sustain', 0.5); m.setCtl('release', 20); m.setCtl('loop', 1);
    const [env] = m.render(1.0, (t, mm) => mm.setIn('gate', t < 0.01 ? 1 : 0));
    expect(peak(env!, 20, 100)).toBeGreaterThan(0.95);                // de lus sloeg opnieuw aan
    expect(env![900]!).toBeCloseTo(0.5, 3);                              // en blijft op sustain
    // Zonder loop (bool genegeerd) was hij na de release op 0 gebleven.
  });
});

describe('tp_mmb_cvmath (mb::runtime::CvMath zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_cvmath'); });

  it('som: a·ga + b·gb + c·gc + offset; product: (a·ga)·(b·gb)', async () => {
    const m = await load('tp_mmb_cvmath');
    m.setCtl('gain_a', 0.5); m.setCtl('offset', 0.1);
    m.setIn('a', 0.8); m.setIn('b', 0.2); m.setIn('c', -0.1);
    expect(m.render(0.01)[0]![5]).toBeCloseTo(0.4 + 0.2 - 0.1 + 0.1, 5);
    m.setCtl('mode', 1);
    expect(m.render(0.01)[0]![5]).toBeCloseTo(0.4 * 0.2, 2);
  });
});

describe('tp_mmb_seq8 (mb::runtime::Seq16 zelf)', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_seq8'); });

  it('loopt op rate, zet de stap-cv en meldt de stap via telemetrie', async () => {
    const m = await load('tp_mmb_seq8');
    m.setCtl('rate', 4); m.setCtl('length', 4); m.setCtl('s2', 12);
    const [cv, gate] = m.render(2.0);
    let flanken = 0;
    for (let i = 1; i < gate!.length; i++) if (gate![i - 1]! < 0.5 && gate![i]! >= 0.5) flanken++;
    expect(flanken).toBeGreaterThanOrEqual(7);
    expect(flanken).toBeLessThanOrEqual(8);
    expect(Math.max(...cv!)).toBeCloseTo(1, 5);                            // s2 = +12 = +1 V
    expect(m.ex.mmb_telemetry()).toBeGreaterThanOrEqual(0);
    expect(m.ex.mmb_telemetry()).toBeLessThan(4);
  });
});

describe('tp_mmb_midiin (MidiInModule zelf)', () => {
  const idx = (m: Mod, id: string): number => m.outputs.indexOf(id);

  it('heeft de catalogus-poorten plus pitchK/gateK/velK per stem', async () => {
    const m = await load('tp_mmb_midiin');
    for (const id of ['pitch', 'gate', 'vel', 'cv_mod', 'cv_bend', 'cv_cc1', 'cv_cc2', 'pitch16', 'gate16', 'vel16'])
      expect(m.outputs).toContain(id);
    const t = project.moduleTypes.find((x) => x.id === 'tp_mmb_midiin')!;
    const echte = t.controls.filter((c) => !['led', 'display'].includes(String((c as { kind?: string }).kind)));
    for (const c of echte) expect(m.controls, c.id).toContain(c.id);
    expect(m.controls).toContain('voiceCount');
  });

  it('mono: noot 72 geeft pitch +1 V en gate; loslaten sluit', async () => {
    const m = await load('tp_mmb_midiin');
    m.ex.mmb_midi(0x90, 72, 100);
    let o = m.render(0.01);
    expect(o[idx(m, 'pitch')]![5]).toBeCloseTo(1, 5);
    expect(o[idx(m, 'gate')]![5]).toBe(1);
    expect(o[idx(m, 'vel')]![5]).toBeCloseTo(100 / 127, 5);
    m.ex.mmb_midi(0x80, 72, 0);
    o = m.render(0.01);
    expect(o[idx(m, 'gate')]![5]).toBe(0);
  });

  it('poly: drie noten landen op drie stemmen', async () => {
    const m = await load('tp_mmb_midiin');
    m.setCtl('voiceCount', 4);
    for (const n of [60, 64, 67]) m.ex.mmb_midi(0x90, n, 90);
    const o = m.render(0.01);
    const toonhoogtes = [1, 2, 3].map((k) => Math.round(o[idx(m, `pitch${k}`)]![5]! * 12)).sort((a, b) => a - b);
    expect(toonhoogtes).toEqual([0, 4, 7]);
    for (const k of [1, 2, 3]) expect(o[idx(m, `gate${k}`)]![5]).toBe(1);
    expect(o[idx(m, 'gate4')]![5]).toBe(0);
  });

  it('pitch-bend en mod-wiel komen op cv_bend en cv_mod', async () => {
    const m = await load('tp_mmb_midiin');
    m.ex.mmb_midi(0xE0, 0, 127);                                       // bijna maximaal omhoog
    m.ex.mmb_midi(0xB0, 1, 127);
    const o = m.render(0.01);
    expect(o[idx(m, 'cv_bend')]![5]).toBeCloseTo(2 / 12, 2);          // bendRange 2
    expect(o[idx(m, 'cv_mod')]![5]).toBeCloseTo(1, 5);
  });

  it('bendPitch vouwt de bend in pitch en pitchK; uit = alleen op cv_bend', async () => {
    const m = await load('tp_mmb_midiin');
    m.setCtl('voiceCount', 2);
    m.ex.mmb_midi(0x90, 60, 100);
    m.ex.mmb_midi(0x90, 72, 100);
    m.ex.mmb_midi(0xE0, 0, 127);
    let o = m.render(0.01);
    expect(o[idx(m, 'pitch')]![5]).toBeCloseTo(0, 5);
    expect(o[idx(m, 'pitch2')]![5]).toBeCloseTo(1, 5);
    m.setCtl('bendPitch', 1);
    m.setCtl('bendRange', 12);
    o = m.render(0.01);
    // 0xE0 0 127 = 16256/8192 → 0,984 V bij 12 st: net geen hele octaaf.
    expect(o[idx(m, 'pitch')]![5]).toBeCloseTo(0.984, 2);               // 60 + bend
    expect(o[idx(m, 'pitch2')]![5]).toBeCloseTo(1.984, 2);
    expect(o[idx(m, 'cv_bend')]![5]).toBeCloseTo(0.984, 2);             // cv_bend blijft ook
  });
});
