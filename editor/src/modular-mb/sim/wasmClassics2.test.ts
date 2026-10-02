// Tweede ronde klassiekers (2026-10-02), doorgemeten in node: SEM-filter,
// complex-oscillator, wah, ensemble en elektrische piano. Dezelfde
// mmb_dsp-kernels als op de Teensy, via de wasm-gastheer (kernel_host.h).
//
// Per module: dragen poorten en controls de namen van de catalogus, en doet
// hij aantoonbaar wat het paneel belooft. Geen klankoordeel.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, peak, rms, toneLevel } from './wasmTestHost';

const sine = (hz: number, amplitude = 0.25, port = 'in') => {
  let phase = 0;
  return (_t: number, m: Mod): void => {
    const buffer = m.inBuf(port);
    for (let k = 0; k < m.block; k++) { buffer[k] = amplitude * Math.sin(phase); phase += 2 * Math.PI * hz / m.rate; }
  };
};
const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));
const finite = (a: Float32Array): boolean => a.every(Number.isFinite);
const at = (seconds: number, m: Mod): number => Math.round(seconds * m.rate);

/** Versterking in dB van `type` op `hz`, met `set` als instelling. */
const gain = async (type: string, set: (m: Mod) => void, hz: number, output = 'out', port = 'in'): Promise<number> => {
  const m = await load(type);
  set(m);
  return db(toneLevel(m.render(0.6, sine(hz, 0.25, port))[output]!, hz, m.rate, 8000) / 0.25);
};

describe('tp_mmb_sem', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_sem'); });

  const flat = (mode: number) => (m: Mod): void => { m.setCtl('mode', mode); m.setCtl('level', 1); m.setCtl('drive', 0); m.setCtl('res', 0.2); };

  it('Mode loopt van laagdoorlaat via notch naar hoogdoorlaat, 12 dB per octaaf', async () => {
    // Cutoff 1 kHz.
    expect(Math.abs(await gain('tp_mmb_sem', flat(0), 100))).toBeLessThan(0.5);
    const lowAt2k = await gain('tp_mmb_sem', flat(0), 2000), lowAt8k = await gain('tp_mmb_sem', flat(0), 8000);
    expect(lowAt2k - lowAt8k).toBeGreaterThan(20);            // twee octaven: ~24 dB
    expect(lowAt2k - lowAt8k).toBeLessThan(28);
    expect(Math.abs(await gain('tp_mmb_sem', flat(1), 10000))).toBeLessThan(0.5);
    expect(await gain('tp_mmb_sem', flat(1), 100)).toBeLessThan(-36);
    // Notch: laag en hoog blijven staan, de cutoff verdwijnt.
    expect(Math.abs(await gain('tp_mmb_sem', flat(0.5), 100))).toBeLessThan(0.5);
    expect(Math.abs(await gain('tp_mmb_sem', flat(0.5), 10000))).toBeLessThan(0.5);
    expect(await gain('tp_mmb_sem', flat(0.5), 1000)).toBeLessThan(-25);
  });

  it('de bandpass piekt op de cutoff; resonantie geeft een piek maar zingt niet zelf', async () => {
    const set = (m: Mod): void => { m.setCtl('level', 1); m.setCtl('drive', 0); m.setCtl('res', 0.6); };
    const centre = await gain('tp_mmb_sem', set, 1000, 'bp');
    expect(centre).toBeGreaterThan(await gain('tp_mmb_sem', set, 250, 'bp') + 15);
    expect(centre).toBeGreaterThan(await gain('tp_mmb_sem', set, 4000, 'bp') + 15);
    const peakAt = (res: number): Promise<number> => gain('tp_mmb_sem', (m) => { m.setCtl('level', 1); m.setCtl('drive', 0); m.setCtl('res', res); }, 1000);
    expect(await peakAt(1)).toBeGreaterThan(await peakAt(0) + 10);
    const m = await load('tp_mmb_sem');
    m.setCtl('res', 1); m.setCtl('drive', 1);
    const out = m.render(1, (t, mm) => { const buffer = mm.inBuf('in'); buffer.fill(0); if (t < 0.001) buffer[0] = 1; }).out!;
    expect(rms(out, at(0.5, m))).toBeLessThan(1e-6);          // een tik sterft uit
  });

  it('F CV verschuift de cutoff in octaven; Mode-CV telt op; onzin blijft eindig', async () => {
    // -0,5 maal 4 octaven: cutoff 250 Hz, dus 1 kHz ligt twee octaven boven de knik.
    const shifted = await gain('tp_mmb_sem', (m) => { m.setCtl('level', 1); m.setCtl('drive', 0); m.setIn('cutoff_cv', -0.5); }, 1000);
    expect(shifted).toBeLessThan(-20);
    const high = await gain('tp_mmb_sem', (m) => { m.setCtl('level', 1); m.setCtl('drive', 0); m.setIn('mode_cv', 1); }, 100);
    expect(high).toBeLessThan(-36);
    const wild = await load('tp_mmb_sem');
    wild.setCtl('cutoff', Number.NaN); wild.setIn('cutoff_cv', Number.POSITIVE_INFINITY);
    const o = wild.render(0.2, (t, m) => m.inBuf('in').fill(t < 0.1 ? 1e9 : Number.NaN));
    expect(finite(o.out!) && finite(o.bp!)).toBe(true);
  });
});

describe('tp_mmb_complex', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_complex'); });

  const F0 = 261.6256;
  const run = async (set: (m: Mod) => void): Promise<{ m: Mod; o: Record<string, Float32Array> }> => {
    const m = await load('tp_mmb_complex');
    m.setCtl('level', 1);
    set(m);
    return { m, o: m.render(1, (_t, mm) => mm.setIn('voct', 0)) };
  };
  const harmonic = (r: { m: Mod; o: Record<string, Float32Array> }, n: number): number => db(toneLevel(r.o.out!, F0 * n, r.m.rate, 8000));

  it('Timbre 0 is een zuivere sinus op de toonhoogte van V/Oct; open vouwt hij oneven boventonen erbij', async () => {
    const pure = await run((m) => m.setCtl('timbre', 0));
    expect(harmonic(pure, 1)).toBeGreaterThan(-0.5);
    expect(harmonic(pure, 2)).toBeLessThan(-80);
    expect(harmonic(pure, 3)).toBeLessThan(-80);
    const folded = await run((m) => m.setCtl('timbre', 0.6));
    expect(harmonic(folded, 3)).toBeGreaterThan(-20);
    expect(harmonic(folded, 7)).toBeGreaterThan(-20);
    expect(harmonic(folded, 2)).toBeLessThan(-80);
    const skewed = await run((m) => { m.setCtl('timbre', 0.6); m.setCtl('symmetry', 0.5); });
    expect(harmonic(skewed, 2)).toBeGreaterThan(-40);
  });

  it('FM met een hele Ratio blijft harmonisch; de modulator komt apart naar buiten', async () => {
    const fm = await run((m) => { m.setCtl('timbre', 0); m.setCtl('fm', 0.5); m.setCtl('ratio', 2); });
    expect(harmonic(fm, 3)).toBeGreaterThan(-20);              // zijband op f0 + 2 f0
    expect(harmonic(fm, 2)).toBeLessThan(-80);                 // niets tussen de zijbanden
    expect(db(toneLevel(fm.o.mod!, F0 * 2, fm.m.rate, 8000))).toBeGreaterThan(-3);
    // FM-CV telt op bij de knop.
    const viaCv = await load('tp_mmb_complex');
    viaCv.setCtl('level', 1); viaCv.setCtl('timbre', 0);
    const o = viaCv.render(1, (_t, m) => { m.setIn('voct', 0); m.setIn('fm_cv', 0.5); });
    expect(db(toneLevel(o.out!, F0 * 3, viaCv.rate, 8000))).toBeGreaterThan(-20);
  });

  it('blijft eindig en binnen ±1 met alles open', async () => {
    const wild = await run((m) => {
      for (const id of ['timbre', 'fm', 'am', 'tmod', 'symmetry']) m.setCtl(id, 1);
      m.setCtl('ratio', 7.3); m.setCtl('mod_wave', 2);
    });
    for (const name of ['out', 'mod']) { expect(finite(wild.o[name]!)).toBe(true); expect(peak(wild.o[name]!)).toBeLessThanOrEqual(1); }
  });
});

describe('tp_mmb_wah', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_wah'); });

  const pedal = (type: number, position: number) => (m: Mod): void => { m.setCtl('type', type); m.setCtl('pedal', position); m.setCtl('level', 1); };

  it('de piek schuift met het pedaal van 400 Hz naar 2,2 kHz', async () => {
    expect(await gain('tp_mmb_wah', pedal(0, 0), 400)).toBeGreaterThan(await gain('tp_mmb_wah', pedal(0, 0), 2200) + 20);
    expect(await gain('tp_mmb_wah', pedal(0, 1), 2200)).toBeGreaterThan(await gain('tp_mmb_wah', pedal(0, 1), 400) + 15);
    expect(await gain('tp_mmb_wah', pedal(0, 0), 400)).toBeGreaterThan(3);         // een piek, geen demping
    // Pedaal-CV telt op bij de knop.
    expect(await gain('tp_mmb_wah', (m) => { pedal(0, 0)(m); m.setIn('pedal_cv', 1); }, 2200)).toBeGreaterThan(3);
  });

  it('Vowel zet twee formanten neer: IE heeft een lage en een hoge piek met een gat ertussen', async () => {
    const low = await gain('tp_mmb_wah', pedal(1, 1), 270), high = await gain('tp_mmb_wah', pedal(1, 1), 2290);
    const middle = await gain('tp_mmb_wah', pedal(1, 1), 900);
    expect(low).toBeGreaterThan(middle + 20);
    expect(high).toBeGreaterThan(middle + 15);
    // A (midden van het pedaal): de pieken liggen bij 730 en 1090 Hz.
    expect(await gain('tp_mmb_wah', pedal(1, 0.5), 730)).toBeGreaterThan(await gain('tp_mmb_wah', pedal(1, 0.5), 270) + 15);
  });

  it('Auto opent met het niveau van het spel, Auto↓ sluit; Env geeft de volger', async () => {
    const auto = async (mode: number, rest: number, amplitude: number): Promise<{ g: number; env: number }> => {
      const m = await load('tp_mmb_wah');
      m.setCtl('mode', mode); m.setCtl('pedal', rest); m.setCtl('level', 1);
      const o = m.render(0.6, sine(2200, amplitude));
      return { g: db(toneLevel(o.out!, 2200, m.rate, at(0.3, m)) / amplitude), env: o.env![o.env!.length - 1]! };
    };
    const soft = await auto(1, 0, 0.02), loud = await auto(1, 0, 0.5), down = await auto(2, 1, 0.5);
    expect(loud.g).toBeGreaterThan(soft.g + 15);
    expect(down.g).toBeLessThan(loud.g - 15);
    expect(loud.env).toBeGreaterThan(0.3);
    expect(soft.env).toBeLessThan(0.05);
  });

  it('LFO beweegt de piek zelf; Mix 0 is droog', async () => {
    const m = await load('tp_mmb_wah');
    m.setCtl('mode', 3); m.setCtl('pedal', 0); m.setCtl('rate', 2); m.setCtl('level', 1);
    const out = m.render(2, sine(2200, 0.25)).out!;
    const loud = rms(out, at(0.2, m), at(0.3, m)), quiet = rms(out, at(0.45, m), at(0.55, m));   // halve periode verder
    expect(Math.max(loud, quiet) / Math.min(loud, quiet)).toBeGreaterThan(3);
    expect(Math.abs(await gain('tp_mmb_wah', (x) => { x.setCtl('mix', 0); x.setCtl('level', 1); }, 1000))).toBeLessThan(0.1);
  });
});

describe('tp_mmb_ensemble', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_ensemble'); });

  it('maakt van mono een stereobeeld dat nergens stilvalt', async () => {
    const m = await load('tp_mmb_ensemble');
    m.setCtl('mix', 1); m.setCtl('level', 1);
    const o = m.render(4, sine(440, 0.5, 'in_l'));
    let difference = 0;
    for (let i = at(0.5, m); i < o.out_l!.length; i++) difference += Math.abs(o.out_l![i]! - o.out_r![i]!);
    expect(difference / (o.out_l!.length - at(0.5, m))).toBeGreaterThan(0.1);
    // De toon is verstemd: de energie zit naast 440 Hz, niet erop.
    expect(db(toneLevel(o.out_l!, 440, m.rate, at(0.5, m)) / 0.5)).toBeLessThan(-12);
    // Geen moment van stilte: elk kwart seconde klinkt het.
    for (let start = 0.5; start < 3.75; start += 0.25) expect(rms(o.out_l!, at(start, m), at(start + 0.25, m))).toBeGreaterThan(0.1);
    expect(peak(o.out_l!)).toBeLessThanOrEqual(1);
  });

  it('Depth 0 laat de toon staan; Mix 0 is droog; beide ingangen worden gesommeerd', async () => {
    const still = await load('tp_mmb_ensemble');
    still.setCtl('depth', 0); still.setCtl('mix', 1); still.setCtl('level', 1); still.setCtl('tone', 1);
    const o = still.render(1, sine(440, 0.5, 'in_l'));
    expect(Math.abs(db(toneLevel(o.out_l!, 440, still.rate, at(0.3, still)) / 0.5))).toBeLessThan(1);
    const deep = await load('tp_mmb_ensemble');
    deep.setCtl('depth', 0); deep.setCtl('mix', 1); deep.setCtl('level', 1); deep.setIn('depth_cv', 1);
    expect(db(toneLevel(deep.render(4, sine(440, 0.5, 'in_l')).out_l!, 440, deep.rate, at(0.5, deep)) / 0.5)).toBeLessThan(-5);   // met CV wél verstemd
    expect(Math.abs(await gain('tp_mmb_ensemble', (m) => { m.setCtl('mix', 0); m.setCtl('level', 1); }, 440, 'out_l', 'in_l'))).toBeLessThan(0.1);
    expect(Math.abs(await gain('tp_mmb_ensemble', (m) => { m.setCtl('mix', 0); m.setCtl('level', 1); }, 440, 'out_r', 'in_r'))).toBeLessThan(0.1);
  });
});

describe('tp_mmb_epiano', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_epiano'); });

  const F0 = 261.6256;
  const play = async (set: (m: Mod) => void, velocity: number, hold = 1, seconds = 2): Promise<{ m: Mod; out: Float32Array; right: Float32Array }> => {
    const m = await load('tp_mmb_epiano');
    m.setCtl('tremolo', 0);
    set(m);
    const o = m.render(seconds, (t, mm) => { mm.setIn('voct_1', 0); mm.setIn('vel_1', velocity); mm.setIn('gate_1', t < hold ? 1 : 0); });
    return { m, out: o.out_l!, right: o.out_r! };
  };
  const partial = (r: { m: Mod; out: Float32Array }, n: number, from = 0.05, to = 0.3): number =>
    db(toneLevel(r.out, F0 * n, r.m.rate, at(from, r.m), at(to, r.m)));

  it('een toets klinkt op de toonhoogte, sterft uit en dempt bij loslaten', async () => {
    const r = await play(() => {}, 0.8);
    expect(partial(r, 1)).toBeGreaterThan(-20);
    expect(partial(r, 1, 0.7, 0.95)).toBeLessThan(partial(r, 1));          // sterft uit terwijl de toets vast is
    expect(rms(r.out, at(1.4, r.m), at(1.7, r.m))).toBeLessThan(rms(r.out, at(0.7, r.m), at(0.95, r.m)) * 0.02);
    expect(peak(r.out)).toBeLessThanOrEqual(1);
    // De bel: een niet-harmonische boventoon die alleen in de aanslag zit.
    const bellEarly = db(toneLevel(r.out, F0 * 6.267, r.m.rate, 0, at(0.1, r.m)));
    const bellLate = db(toneLevel(r.out, F0 * 6.267, r.m.rate, at(0.6, r.m), at(0.9, r.m)));
    expect(bellEarly).toBeGreaterThan(bellLate + 15);
  });

  it('Timbre is de plek voor de pickup: recht ervoor klinkt het octaaf, ernaast de grondtoon', async () => {
    const centred = await play((m) => m.setCtl('timbre', 0), 0.8);
    expect(partial(centred, 2)).toBeGreaterThan(partial(centred, 1) + 40);
    const offAxis = await play((m) => m.setCtl('timbre', 1), 0.8);
    expect(partial(offAxis, 1)).toBeGreaterThan(partial(offAxis, 2) + 10);
  });

  it('harder aanslaan is luider en helderder; zonder velocity-kabel een gemiddelde aanslag', async () => {
    const soft = await play(() => {}, 0.25), hard = await play(() => {}, 1);
    expect(rms(hard.out, 2000, 12000)).toBeGreaterThan(rms(soft.out, 2000, 12000) * 3);
    expect(partial(hard, 3) - partial(hard, 1)).toBeGreaterThan(partial(soft, 3) - partial(soft, 1) + 15);
    const m = await load('tp_mmb_epiano');
    const o = m.render(0.5, (_t, mm) => { mm.setIn('voct_1', 0); mm.setIn('gate_1', 1); });
    expect(rms(o.out_l!, 2000, 12000)).toBeGreaterThan(rms(soft.out, 2000, 12000));
  });

  it('Reed klinkt anders en korter dan Tine; tremolo wiegt tussen links en rechts', async () => {
    const tine = await play(() => {}, 0.8), reed = await play((m) => m.setCtl('type', 1), 0.8);
    const fade = (r: { m: Mod; out: Float32Array }): number => partial(r, 1, 0.7, 0.95) - partial(r, 1);
    expect(fade(reed)).toBeLessThan(fade(tine) - 1.5);
    const wide = await play((m) => { m.setCtl('tremolo', 1); m.setCtl('trem_rate', 4); }, 0.8);
    // Kwart periode na elkaar: eerst links luid, dan rechts.
    const balance = (from: number): number => rms(wide.out, at(from, wide.m), at(from + 0.05, wide.m)) / rms(wide.right, at(from, wide.m), at(from + 0.05, wide.m));
    const a = balance(0.2875), b = balance(0.4125);
    expect(Math.max(a, b) / Math.min(a, b)).toBeGreaterThan(3);
  });

  it('twaalf toetsen hard aangeslagen blijven eindig en binnen ±1', async () => {
    const m = await load('tp_mmb_epiano');
    m.setCtl('drive', 1); m.setCtl('bell', 1); m.setCtl('level', 1);
    const o = m.render(1.5, (t, mm) => {
      for (let k = 1; k <= 12; k++) { mm.setIn(`voct_${k}`, -2 + k * 0.3); mm.setIn(`vel_${k}`, 1); mm.setIn(`gate_${k}`, t > 0.02 * k && t < 1 ? 1 : 0); }
    });
    for (const name of ['out_l', 'out_r']) { expect(finite(o[name]!)).toBe(true); expect(peak(o[name]!)).toBeLessThanOrEqual(1); }
  });
});
