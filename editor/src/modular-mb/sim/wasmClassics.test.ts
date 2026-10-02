// West Coast, pedalen en klassiekers (2026-10-02), doorgemeten in node:
// wavefolder, low-pass gate, drive, frequency shifter, acid-basstem, rungler
// en tonewheel-orgel. Dezelfde mmb_dsp-kernels als op de Teensy; hier via de
// wasm-gastheer (kernel_host.h), op 44,1 kHz in blokken van 32.
//
// Per module: dragen poorten en controls de namen van de catalogus, en doet
// hij aantoonbaar wat het paneel belooft. Geen klankoordeel.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, peak, rms, risingEdges, toneLevel } from './wasmTestHost';

/** Vult `in` met een sinus die over de blokken heen doorloopt. */
const sine = (hz: number, amplitude = 0.5, port = 'in') => {
  let phase = 0;
  return (_t: number, m: Mod): void => {
    const buffer = m.inBuf(port);
    for (let k = 0; k < m.block; k++) { buffer[k] = amplitude * Math.sin(phase); phase += 2 * Math.PI * hz / m.rate; }
  };
};
const both = (...feeds: ((t: number, m: Mod) => void)[]) => (t: number, m: Mod): void => feeds.forEach((f) => f(t, m));
const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));
const finite = (a: Float32Array): boolean => a.every(Number.isFinite);
const at = (seconds: number, m: Mod): number => Math.round(seconds * m.rate);

describe('tp_mmb_folder', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_folder'); });

  it('laat zonder vouwen het signaal vrijwel ongemoeid door (oversampler vlak tot 16 kHz)', async () => {
    for (const hz of [1000, 10000, 16000]) {
      const m = await load('tp_mmb_folder');
      m.setCtl('fold', 0); m.setCtl('type', 1); m.setCtl('level', 1);
      const out = m.render(0.5, sine(hz)).out!;
      expect(Math.abs(db(toneLevel(out, hz, m.rate, 4000) / 0.5)), `${hz} Hz`).toBeLessThan(0.1);
    }
  });

  it('vouwen maakt oneven boventonen; Symmetry voegt even boventonen toe; elk type blijft binnen ±1', async () => {
    for (const type of [0, 1, 2]) {
      const m = await load('tp_mmb_folder');
      m.setCtl('type', type); m.setCtl('fold', 0.6); m.setCtl('level', 1);
      const out = m.render(1, sine(220, 0.8)).out!;
      expect(peak(out), `type ${type}`).toBeLessThanOrEqual(1);
      const odd = toneLevel(out, 220 * 5, m.rate, 4000), even = toneLevel(out, 220 * 4, m.rate, 4000);
      expect(db(odd), `type ${type} h5`).toBeGreaterThan(-30);
      expect(db(even), `type ${type} h4`).toBeLessThan(-80);
      const skew = await load('tp_mmb_folder');
      skew.setCtl('type', type); skew.setCtl('fold', 0.6); skew.setCtl('symmetry', 0.5);
      const skewed = skew.render(1, sine(220, 0.8)).out!;
      expect(db(toneLevel(skewed, 220 * 4, skew.rate, 4000)), `type ${type} h4 met symmetry`).toBeGreaterThan(-40);
    }
  });

  it('Fold-CV telt op bij de knop; Mix 0 geeft het droge signaal; onzin blijft eindig', async () => {
    const quiet = await load('tp_mmb_folder'), driven = await load('tp_mmb_folder');
    quiet.setCtl('fold', 0); driven.setCtl('fold', 0); driven.setIn('fold_cv', 0.7);
    const a = quiet.render(0.5, sine(220, 0.8)).out!, b = driven.render(0.5, sine(220, 0.8)).out!;
    expect(db(toneLevel(b, 220 * 7, driven.rate, 4000))).toBeGreaterThan(db(toneLevel(a, 220 * 7, quiet.rate, 4000)) + 20);
    const dry = await load('tp_mmb_folder');
    dry.setCtl('fold', 1); dry.setCtl('mix', 0); dry.setCtl('level', 1);
    const d = dry.render(0.5, sine(220, 0.5)).out!;
    expect(db(toneLevel(d, 220 * 3, dry.rate, 4000))).toBeLessThan(-80);
    expect(toneLevel(d, 220, dry.rate, 4000)).toBeCloseTo(0.5, 2);
    const wild = await load('tp_mmb_folder');
    wild.setCtl('fold', Number.NaN); wild.setIn('sym_cv', Number.POSITIVE_INFINITY);
    expect(finite(wild.render(0.2, (t, m) => m.inBuf('in').fill(t < 0.1 ? 1e9 : Number.NaN)).out!)).toBe(true);
  });
});

describe('tp_mmb_lpg', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_lpg'); });

  const ping = (t: number, m: Mod): void => m.setIn('trig', t > 0.1 && t < 0.11 ? 1 : 0);

  it('is dicht zonder sturing en een ping geeft een tik die uitsterft en doffer wordt', async () => {
    const m = await load('tp_mmb_lpg');
    let phase = 0;
    const saw = (_t: number, mm: Mod): void => {
      const buffer = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) { buffer[k] = 0.8 * (2 * phase - 1); phase += 110 / mm.rate; phase -= Math.floor(phase); }
    };
    const o = m.render(1.5, both(saw, ping));
    expect(rms(o.out!, 0, at(0.09, m))).toBeLessThan(1e-4);
    const early = rms(o.out!, at(0.105, m), at(0.14, m)), later = rms(o.out!, at(0.3, m), at(0.4, m)), tail = rms(o.out!, at(1.2, m), at(1.5, m));
    expect(early).toBeGreaterThan(0.1);
    expect(later).toBeLessThan(early * 0.5);
    expect(tail).toBeLessThan(early * 0.02);
    // Doffer: de verhouding hoog/laag zakt naarmate de vactrol uitdooft.
    const ratio = (from: number, to: number): number =>
      db(toneLevel(o.out!, 2200, m.rate, at(from, m), at(to, m)) / toneLevel(o.out!, 110, m.rate, at(from, m), at(to, m)));
    expect(ratio(0.2, 0.3)).toBeLessThan(ratio(0.105, 0.15) - 10);
    // Env: vlug op, traag terug.
    expect(o.env![at(0.11, m)]).toBeGreaterThan(0.85);
    expect(o.env![at(0.3, m)]).toBeGreaterThan(0.15);
    expect(o.env![at(0.3, m)]).toBeLessThan(0.6);
  });

  it('CV opent de gate; VCA-stand filtert niet, LP-stand dempt niet', async () => {
    const open = await load('tp_mmb_lpg');
    open.setIn('cv', 1);
    const o = open.render(0.5, sine(440, 0.5)).out!;
    expect(toneLevel(o, 440, open.rate, at(0.2, open))).toBeGreaterThan(0.35);
    const half = async (mode: number, hz: number): Promise<number> => {
      const m = await load('tp_mmb_lpg');
      m.setCtl('mode', mode); m.setCtl('offset', 0.5); m.setCtl('level', 1);
      return toneLevel(m.render(0.5, sine(hz, 0.5)).out!, hz, m.rate, at(0.2, m)) / 0.5;
    };
    // Halfopen (cutoff ~630 Hz): LP laat laag vol door en dempt hoog; VCA dempt alles evenveel.
    expect(await half(0, 100)).toBeGreaterThan(0.9);
    expect(await half(0, 5000)).toBeLessThan(0.05);
    const vcaLow = await half(2, 100), vcaHigh = await half(2, 5000);
    expect(vcaLow).toBeCloseTo(0.25, 1);
    expect(Math.abs(db(vcaHigh / vcaLow))).toBeLessThan(1.5);
  });
});

describe('tp_mmb_drive', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_drive'); });

  it('elke stand vervormt meer naarmate Drive verder open staat en blijft begrensd', async () => {
    for (const mode of [0, 1, 2]) {
      const third = async (drive: number): Promise<number> => {
        const m = await load('tp_mmb_drive');
        m.setCtl('mode', mode); m.setCtl('drive', drive);
        const out = m.render(0.6, sine(220, 0.25)).out!;
        expect(peak(out), `mode ${mode}`).toBeLessThanOrEqual(1);
        expect(finite(out)).toBe(true);
        return db(toneLevel(out, 660, m.rate, 8000) / toneLevel(out, 220, m.rate, 8000));
      };
      const low = await third(0), high = await third(1);
      expect(high, `mode ${mode}`).toBeGreaterThan(low + 6);
      expect(high, `mode ${mode}`).toBeGreaterThan(-20);
    }
  });

  it('de overdrive laat het laag schoon door en vervormt het midden (mid-hump)', async () => {
    const thd = async (hz: number): Promise<number> => {
      const m = await load('tp_mmb_drive');
      m.setCtl('mode', 0); m.setCtl('drive', 0.6);
      const out = m.render(0.8, sine(hz, 0.25)).out!;
      return db(toneLevel(out, hz * 3, m.rate, 8000) / toneLevel(out, hz, m.rate, 8000));
    };
    expect(await thd(80)).toBeLessThan(await thd(1000) - 8);
  });

  it('Drive-CV telt op, Mix 0 is droog, Tone maakt de distortion doffer', async () => {
    const base = await load('tp_mmb_drive'), pushed = await load('tp_mmb_drive');
    base.setCtl('drive', 0); pushed.setCtl('drive', 0); pushed.setIn('drive_cv', 0.8);
    const h3 = (m: Mod, out: Float32Array): number => db(toneLevel(out, 660, m.rate, 8000));
    expect(h3(pushed, pushed.render(0.6, sine(220, 0.25)).out!)).toBeGreaterThan(h3(base, base.render(0.6, sine(220, 0.25)).out!) + 20);
    const dry = await load('tp_mmb_drive');
    dry.setCtl('drive', 1); dry.setCtl('mix', 0);
    const d = dry.render(0.6, sine(220, 0.25)).out!;
    expect(db(toneLevel(d, 660, dry.rate, 8000))).toBeLessThan(-80);
    const tone = async (value: number): Promise<number> => {
      const m = await load('tp_mmb_drive');
      m.setCtl('mode', 1); m.setCtl('drive', 0.8); m.setCtl('tone', value);
      return db(toneLevel(m.render(0.6, sine(220, 0.25)).out!, 220 * 15, m.rate, 8000));
    };
    expect(await tone(0)).toBeLessThan(await tone(1) - 12);
  });
});

describe('tp_mmb_freqshift', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_freqshift'); });

  it('schuift hertz op in plaats van te vermenigvuldigen, met de andere zijband ruim 40 dB lager', async () => {
    for (const hz of [60, 1000, 12000]) {
      const m = await load('tp_mmb_freqshift');
      m.setCtl('shift', 0.2); m.setCtl('range', 2); m.setCtl('level', 1);    // 0,2 x 500 = +100 Hz
      const o = m.render(1.5, sine(hz));
      const from = at(0.5, m);
      const up = toneLevel(o.out!, hz + 100, m.rate, from), upLeak = toneLevel(o.out!, Math.abs(hz - 100), m.rate, from);
      const down = toneLevel(o.down!, Math.abs(hz - 100), m.rate, from), downLeak = toneLevel(o.down!, hz + 100, m.rate, from);
      expect(Math.abs(db(up / 0.5)), `${hz} up`).toBeLessThan(0.5);
      expect(Math.abs(db(down / 0.5)), `${hz} down`).toBeLessThan(0.5);
      expect(db(upLeak / up), `${hz} lek omhoog`).toBeLessThan(-40);
      expect(db(downLeak / down), `${hz} lek omlaag`).toBeLessThan(-40);
    }
  });

  it('negatieve Shift en Shift-CV keren de richting om; Shift 0 laat de toon staan', async () => {
    const m = await load('tp_mmb_freqshift');
    m.setCtl('shift', 0); m.setCtl('range', 2); m.setCtl('level', 1); m.setIn('shift_cv', -0.2);
    const o = m.render(1.5, sine(1000));
    expect(db(toneLevel(o.out!, 900, m.rate, at(0.5, m)) / 0.5)).toBeGreaterThan(-0.5);
    expect(db(toneLevel(o.down!, 1100, m.rate, at(0.5, m)) / 0.5)).toBeGreaterThan(-0.5);
    const still = await load('tp_mmb_freqshift');
    still.setCtl('shift', 0); still.setCtl('level', 1);
    expect(db(toneLevel(still.render(1, sine(1000)).out!, 1000, still.rate, at(0.5, still)) / 0.5)).toBeGreaterThan(-0.5);
  });

  it('feedback maakt een rij zijbanden en blijft begrensd', async () => {
    const m = await load('tp_mmb_freqshift');
    m.setCtl('shift', 0.2); m.setCtl('range', 2); m.setCtl('fbk', 0.8); m.setCtl('level', 1);
    const out = m.render(2, sine(1000, 0.4)).out!;
    expect(finite(out)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1);
    expect(db(toneLevel(out, 1200, m.rate, at(1, m)))).toBeGreaterThan(-30);   // tweede ronde
    expect(db(toneLevel(out, 1300, m.rate, at(1, m)))).toBeGreaterThan(-40);   // derde ronde
  });
});

describe('tp_mmb_acid', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_acid'); });

  const note = (voct: number, from: number, to: number, extra?: (t: number, m: Mod) => void) => (t: number, m: Mod): void => {
    m.setIn('voct', voct);
    extra?.(t, m);
    m.setIn('gate', t >= from && t < to ? 1 : 0);
  };

  it('speelt de toonhoogte van V/Oct, wordt doffer met de envelope en zwijgt na de gate', async () => {
    const m = await load('tp_mmb_acid');
    const o = m.render(1.2, note(-1, 0, 0.5));
    const hz = 130.8128;
    expect(toneLevel(o.out!, hz, m.rate, at(0.05, m), at(0.45, m))).toBeGreaterThan(0.15);
    expect(toneLevel(o.out!, hz * 1.06, m.rate, at(0.05, m), at(0.45, m))).toBeLessThan(0.03);
    const bright = (from: number, to: number): number =>
      db(toneLevel(o.out!, hz * 8, m.rate, at(from, m), at(to, m)) / toneLevel(o.out!, hz, m.rate, at(from, m), at(to, m)));
    expect(bright(0.35, 0.45)).toBeLessThan(bright(0.01, 0.08) - 6);
    expect(o.env![at(0.01, m)]).toBeGreaterThan(0.9);
    expect(o.env![at(0.45, m)]).toBeLessThan(0.45);
    expect(rms(o.out!, at(0.6, m), at(0.7, m))).toBeLessThan(1e-3);
    expect(peak(o.out!)).toBeLessThanOrEqual(1);
  });

  it('een accent is luider en opent het filter verder', async () => {
    const run = async (accent: number): Promise<{ loud: number; high: number }> => {
      const m = await load('tp_mmb_acid');
      m.setCtl('level', 0.3); m.setCtl('res', 0.3);
      const out = m.render(0.3, note(-2, 0, 0.3, (_t, mm) => mm.setIn('accent', accent))).out!;
      return { loud: rms(out, at(0.02, m), at(0.12, m)), high: db(toneLevel(out, 65.4064 * 32, m.rate, 2000, 6000)) };
    };
    const plain = await run(0), accented = await run(1);
    expect(accented.loud).toBeGreaterThan(plain.loud * 1.15);
    expect(accented.high).toBeGreaterThan(plain.high + 5);
  });

  it('Slide laat de toonhoogte glijden en bindt de noot (geen nieuwe aanslag)', async () => {
    const m = await load('tp_mmb_acid');
    const o = m.render(1, (t, mm) => {
      mm.setIn('voct', t < 0.4 ? -1 : 0);
      mm.setIn('slide', t > 0.3 && t < 0.7 ? 1 : 0);
      mm.setIn('gate', t < 0.38 || (t > 0.4 && t < 0.8) ? 1 : 0);
    });
    // Geen nieuwe aanslag: de envelope loopt gewoon door.
    expect(o.env![at(0.42, m)]).toBeLessThan(0.5);
    // Tijdens de slide klinkt de stem door (de gate was even laag).
    expect(rms(o.out!, at(0.385, m), at(0.4, m))).toBeGreaterThan(0.05);
    // Aan het eind van de glijbaan staat de nieuwe toon.
    expect(toneLevel(o.out!, 261.6256, m.rate, at(0.6, m), at(0.75, m))).toBeGreaterThan(0.1);
    // Zonder slide slaat dezelfde tweede noot wél opnieuw aan.
    const hard = await load('tp_mmb_acid');
    const h = hard.render(0.6, (t, mm) => { mm.setIn('voct', t < 0.4 ? -1 : 0); mm.setIn('gate', t < 0.38 || t > 0.4 ? 1 : 0); });
    expect(h.env![at(0.42, hard)]).toBeGreaterThan(0.9);
  });

  it('resonantie geeft een flinke piek maar het filter gaat niet zelf zingen; uitersten blijven eindig', async () => {
    const peakAt = async (res: number): Promise<number> => {
      const m = await load('tp_mmb_acid');
      m.setCtl('res', res); m.setCtl('envmod', 0); m.setCtl('cutoff', 0.62); m.setCtl('level', 0.3);
      const out = m.render(1, note(-2.2516, 0, 1)).out!;       // ~55 Hz, cutoff ~940 Hz
      const f0 = 261.6256 * 2 ** -2.2516;
      let best = -200;
      for (let n = 14; n <= 24; n++) best = Math.max(best, db(toneLevel(out, f0 * n, m.rate, 8000)));
      return best;
    };
    expect(await peakAt(1)).toBeGreaterThan(await peakAt(0) + 12);
    const wild = await load('tp_mmb_acid');
    wild.setCtl('res', 1); wild.setCtl('cutoff', 1); wild.setCtl('envmod', 1); wild.setCtl('accent', 1);
    const o = wild.render(1.5, (t, mm) => {
      mm.setIn('voct', t < 0.5 ? 9 : Number.NaN); mm.setIn('cutoff_cv', 5); mm.setIn('accent', 1);
      mm.setIn('gate', t < 1 && Math.floor(t * 40) % 2 === 0 ? 1 : 0);
    });
    expect(finite(o.out!)).toBe(true);
    expect(peak(o.out!)).toBeLessThanOrEqual(1);
    expect(rms(o.out!, at(1.3, wild), at(1.5, wild))).toBeLessThan(1e-3);   // dicht = stil, ook met volle resonantie
  });
});

describe('tp_mmb_rungler', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_rungler'); });

  /** De rungler-waarde (0..7) op elke klok van B. */
  const steps = (o: Record<string, Float32Array>): number[] =>
    risingEdges(o.pulse_b!).map((index) => Math.round(o.rungler![Math.min(index + 64, o.rungler!.length - 1)]! * 7));

  it('Loop herhaalt elke acht klokken; Chaos gebruikt alle niveaus en herhaalt niet', async () => {
    const looped = await load('tp_mmb_rungler');
    looped.setCtl('loop', 1); looped.setCtl('freq_b', 20);
    const a = steps(looped.render(6));
    expect(a.length).toBeGreaterThan(60);
    for (let k = 20; k < 50; k++) expect(a[k]).toBe(a[k + 8]);
    expect(new Set(a.slice(20, 28)).size).toBeGreaterThan(2);
    const chaos = await load('tp_mmb_rungler');
    chaos.setCtl('loop', 0); chaos.setCtl('freq_b', 20);
    const b = steps(chaos.render(6));
    expect(new Set(b).size).toBeGreaterThanOrEqual(6);
    expect(b.slice(20, 60).some((v, i) => v !== b[20 + i + 8])).toBe(true);
  });

  it('klinkt, blijft begrensd en de rungler verstemt oscillator A', async () => {
    const m = await load('tp_mmb_rungler');
    const o = m.render(3);
    for (const name of ['out', 'pwm', 'tri_a']) {
      expect(rms(o[name]!), name).toBeGreaterThan(0.05);
      expect(peak(o[name]!), name).toBeLessThanOrEqual(1);
    }
    expect(peak(o.rungler!)).toBeLessThanOrEqual(1);
    // Zonder Run A staat A stil op zijn toon; met Run A springt hij.
    const pure = await load('tp_mmb_rungler');
    pure.setCtl('run_a', 0);
    const p = pure.render(2).tri_a!;
    const stable = toneLevel(p, 110, pure.rate, at(0.5, pure));
    const jumpy = toneLevel(o.tri_a!, 110, m.rate, at(0.5, m));
    expect(stable).toBeGreaterThan(0.4);
    expect(jumpy).toBeLessThan(stable * 0.5);
  });

  it('blijft eindig met alles open', async () => {
    const m = await load('tp_mmb_rungler');
    for (const id of ['run_a', 'run_b', 'cross_a', 'cross_b', 'sweep', 'res']) m.setCtl(id, 1);
    m.setCtl('freq_a', 5000); m.setCtl('freq_b', 2000);
    const o = m.render(2, (t, mm) => { mm.setIn('voct', 5); mm.setIn('cutoff_cv', t < 1 ? 2 : Number.NaN); mm.setIn('rate_cv', 2); });
    for (const name of ['out', 'pwm', 'tri_a']) { expect(finite(o[name]!), name).toBe(true); expect(peak(o[name]!), name).toBeLessThanOrEqual(1); }
  });
});

describe('tp_mmb_organ', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_organ'); });

  const BARS = ['d16', 'd513', 'd8', 'd4', 'd223', 'd2', 'd135', 'd113', 'd1'];
  /** Een orgel met alle trekstangen dicht, zonder click en lek, zacht (ver onder de begrenzer). */
  const bare = async (set: (m: Mod) => void): Promise<Mod> => {
    const m = await load('tp_mmb_organ');
    for (const id of BARS) m.setCtl(id, 0);
    m.setCtl('click', 0); m.setCtl('leak', 0); m.setCtl('level', 0.3);
    set(m);
    return m;
  };
  const key = (cell: number, voct: number, from = 0, to = 99) => (t: number, m: Mod): void => {
    m.setIn(`voct_${cell}`, voct);
    m.setIn(`gate_${cell}`, t >= from && t < to ? 1 : 0);
  };
  const level = (m: Mod, out: Float32Array, hz: number, from = 0.2, to = 0.9): number => toneLevel(out, hz, m.rate, at(from, m), at(to, m));

  it('een toets tapt per trekstang één wiel af: zuivere sinussen op de voetmaten', async () => {
    const m = await bare((x) => { x.setCtl('d16', 8); x.setCtl('d8', 8); x.setCtl('d4', 8); });
    const out = m.render(1, key(1, 0.75)).out!;                    // A4
    const base = level(m, out, 440);
    expect(base).toBeGreaterThan(0.03);
    expect(level(m, out, 220)).toBeCloseTo(base, 3);
    expect(level(m, out, 880)).toBeCloseTo(base, 3);
    // 5 1/3' staat dicht en de wielen zijn sinussen: wat er op 660 en 1320 Hz
    // staat is alleen de zachte begrenzer aan de uitgang (de voorversterker).
    expect(db(level(m, out, 660) / base)).toBeLessThan(-50);
    expect(db(level(m, out, 1320) / base)).toBeLessThan(-50);
    const half = await bare((x) => x.setCtl('d8', 4));
    const single = await bare((x) => x.setCtl('d8', 8));
    const ratio = level(half, half.render(1, key(1, 0.75)).out!, 440) / level(single, single.render(1, key(1, 0.75)).out!, 440);
    expect(db(ratio)).toBeCloseTo(-12, 0);                         // vier standen van 3 dB
  });

  it('twee toetsen op hetzelfde wiel tellen in fase op; bovenin vouwt de voetmaat terug', async () => {
    const one = await bare((x) => x.setCtl('d8', 8)), two = await bare((x) => x.setCtl('d8', 8));
    const a = level(one, one.render(1, key(1, 0.75)).out!, 440);
    const b = level(two, two.render(1, both(key(1, 0.75), key(2, 0.75))).out!, 440);
    expect(b / a).toBeGreaterThan(1.95);
    // Een octaaf hoger met 16' tapt hetzelfde wiel af als deze toets met 8'.
    const mixed = await bare((x) => { x.setCtl('d8', 8); x.setCtl('d16', 8); });
    const c = level(mixed, mixed.render(1, both(key(1, 0.75), key(2, 1.75))).out!, 440);
    expect(c / a).toBeGreaterThan(1.95);
    // C7 met 1' zou C10 zijn; het hoogste wiel is F#8, dus hij vouwt naar C8 (4186 Hz).
    const top = await bare((x) => x.setCtl('d1', 8));
    const out = top.render(1, key(1, 3)).out!;
    expect(level(top, out, 4186.01)).toBeGreaterThan(0.03);
    expect(db(level(top, out, 8372.02) / level(top, out, 4186.01))).toBeLessThan(-60);
  });

  it('percussie slaat alleen aan op de eerste toets en sterft uit', async () => {
    const m = await bare((x) => { x.setCtl('d8', 8); x.setCtl('perc', 1); x.setCtl('perc_soft', 1); });
    const out = m.render(2, both(key(1, 0, 0.1, 0.9), key(2, 0.25, 0.5, 0.9), key(3, 0.5, 1.2, 1.8))).out!;
    const first = level(m, out, 523.2511, 0.1, 0.16);              // 2e harmonische van C4
    expect(first).toBeGreaterThan(0.01);
    expect(level(m, out, 523.2511, 0.35, 0.45)).toBeLessThan(first * 0.45);
    // Legato: Eb4 krijgt geen nieuwe tik, alleen de rest van de envelope die al uitsterft.
    expect(level(m, out, 622.254, 0.5, 0.56)).toBeLessThan(first * 0.25);
    expect(level(m, out, 739.9888, 1.2, 1.26)).toBeGreaterThan(first * 0.7);  // alles los geweest: F#4 weer wel
  });

  it('key click, vibrato en swell doen wat ze zeggen; loslaten is stil', async () => {
    const roughness = (m: Mod, out: Float32Array, from: number, to: number): number => {
      let sum = 0;
      for (let i = at(from, m) + 1; i < at(to, m); i++) sum += (out[i]! - out[i - 1]!) ** 2;
      return Math.sqrt(sum);
    };
    const clicky = await bare((x) => { x.setCtl('d8', 8); x.setCtl('click', 1); });
    const clean = await bare((x) => x.setCtl('d8', 8));
    const withClick = clicky.render(1, key(1, 0, 0.2, 0.6)).out!, without = clean.render(1, key(1, 0, 0.2, 0.6)).out!;
    expect(roughness(clicky, withClick, 0.2, 0.205)).toBeGreaterThan(roughness(clean, without, 0.2, 0.205) * 3);
    expect(rms(withClick, at(0.7, clicky), at(1, clicky))).toBeLessThan(1e-5);
    const vib = await bare((x) => { x.setCtl('d8', 8); x.setCtl('vib', 3); });
    const v = vib.render(2, key(1, 0.75)).out!;
    expect(level(vib, v, 446.87, 0.5, 1.9)).toBeGreaterThan(level(vib, v, 440, 0.5, 1.9) * 0.3);   // zijband op de scannerfrequentie
    const swell = await bare((x) => { x.setCtl('d8', 8); x.setCtl('level', 0); });
    expect(peak(swell.render(0.5, key(1, 0.75)).out!)).toBe(0);
    const pedal = swell.render(0.5, both(key(1, 0.75), (_t, m) => m.setIn('swell', 0.3))).out!;
    expect(level(swell, pedal, 440, 0.2, 0.45)).toBeGreaterThan(0.03);
  });

  it('twaalf toetsen met alle trekstangen open blijven binnen ±1', async () => {
    const m = await load('tp_mmb_organ');
    for (const id of BARS) m.setCtl(id, 8);
    m.setCtl('perc', 2); m.setCtl('vib', 6); m.setCtl('level', 1); m.setCtl('click', 1); m.setCtl('leak', 1);
    const out = m.render(1, (t, mm) => { for (let k = 1; k <= 12; k++) key(k, -2 + k * 0.25, 0.05 * k, 0.9)(t, mm); }).out!;
    expect(finite(out)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1);
    expect(rms(out, at(0.7, m), at(0.85, m))).toBeGreaterThan(0.3);
  });
});
