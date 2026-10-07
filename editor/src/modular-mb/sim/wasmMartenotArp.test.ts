// ARP (arpeggiator), MARTENOT (Ondes Martenot-stem) en DIFFUSEUR (de
// luidsprekers), doorgemeten in node. ARP is de firmware-CvModule via
// cvhost.h (1 kHz, blok 1); MARTENOT en DIFFUSEUR zijn mmb_dsp-kernels
// (44,1 kHz). Wat hier slaagt is de code die ook op de Teensy draait.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, peak, risingEdges, rms, toneLevel } from './wasmTestHost';

const on = (m: Mod, note: number, vel = 100): void => m.ex.mmb_midi(0x90, note, vel);
const off = (m: Mod, note: number): void => m.ex.mmb_midi(0x80, note, 0);
/** De noten (MIDI) op elke stijgende gate-flank. */
const notesAt = (o: Record<string, Float32Array>): number[] =>
  risingEdges(o.gate!).map((i) => Math.round(60 + o.pitch![i]! * 12));

describe('tp_mmb_arp', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_arp'); });

  it('Up: de vastgehouden toetsen laag naar hoog, de eerste meteen', async () => {
    const m = await load('tp_mmb_arp');                    // 120 bpm, zestienden = 125 ms
    on(m, 67); on(m, 60); on(m, 64);
    const o = m.render(1);
    const edges = risingEdges(o.gate!);
    expect(edges[0]).toBeLessThanOrEqual(1);              // uit stilstand: meteen
    expect(Math.abs(edges[1]! - edges[0]! - 125)).toBeLessThanOrEqual(1);
    expect(notesAt(o)).toEqual([60, 64, 67, 60, 64, 67, 60, 64]);
    expect(o.vel![edges[0]! + 1]).toBeCloseTo(100 / 127, 3);
  });

  it('Down, Up/Down, Played en twee octaven', async () => {
    const down = await load('tp_mmb_arp');
    down.setCtl('mode', 1); on(down, 60); on(down, 64); on(down, 67);
    expect(notesAt(down.render(0.8))).toEqual([67, 64, 60, 67, 64, 60, 67]);

    const ud = await load('tp_mmb_arp');
    ud.setCtl('mode', 2); on(ud, 60); on(ud, 64); on(ud, 67);
    expect(notesAt(ud.render(1))).toEqual([60, 64, 67, 64, 60, 64, 67, 64]);

    const played = await load('tp_mmb_arp');
    played.setCtl('mode', 4); on(played, 67); on(played, 60); on(played, 64);
    expect(notesAt(played.render(0.5))).toEqual([67, 60, 64, 67]);

    const oct = await load('tp_mmb_arp');
    oct.setCtl('octaves', 2); on(oct, 60); on(oct, 67);
    expect(notesAt(oct.render(0.6))).toEqual([60, 67, 72, 79, 60]);
  });

  it('Random: nooit twee keer dezelfde, en alleen vastgehouden noten', async () => {
    const m = await load('tp_mmb_arp');
    m.setCtl('mode', 3); on(m, 60); on(m, 63); on(m, 67); on(m, 70);
    const notes = notesAt(m.render(3));
    expect(notes.length).toBeGreaterThan(20);
    for (let i = 1; i < notes.length; i++) expect(notes[i]).not.toBe(notes[i - 1]);
    expect(new Set(notes)).toEqual(new Set([60, 63, 67, 70]));
  });

  it('loslaten stopt; met latch speelt hij door tot een nieuwe aanslag een nieuwe reeks begint', async () => {
    const m = await load('tp_mmb_arp');
    on(m, 60); on(m, 64); m.render(0.3);
    off(m, 60); off(m, 64);
    const after = m.render(0.5);
    expect(risingEdges(after.gate!)).toHaveLength(0);

    const l = await load('tp_mmb_arp');
    l.setCtl('latch', 1);
    on(l, 60); on(l, 64); l.render(0.3); off(l, 60); off(l, 64);
    expect(notesAt(l.render(0.5)).length).toBeGreaterThanOrEqual(4);   // speelt door (een nog hoge gate telt mee)
    on(l, 72);                                             // alles was los: nieuwe reeks
    expect(new Set(notesAt(l.render(0.5)))).toEqual(new Set([72]));
  });

  it('gate is de nootlengte; ook op 1 valt de gate tussen twee stappen', async () => {
    const half = await load('tp_mmb_arp');
    on(half, 60);
    const g = half.render(0.5).gate!;
    let high = 0; for (let i = 0; i < 125; i++) high += g[i]!;
    expect(Math.abs(high - 62)).toBeLessThanOrEqual(2);

    const full = await load('tp_mmb_arp');
    full.setCtl('gate', 1); on(full, 60);
    expect(risingEdges(full.render(1).gate!)).toHaveLength(8);   // elke stap opnieuw aan
  });

  it('tempo en deling; externe klok; all notes off', async () => {
    const eighths = await load('tp_mmb_arp');
    eighths.setCtl('division', 1); on(eighths, 60);
    expect(risingEdges(eighths.render(2).gate!)).toHaveLength(8);   // 120 bpm, achtsten

    const ext = await load('tp_mmb_arp');
    ext.setCtl('extclock', 1); on(ext, 60); on(ext, 62);
    const o = ext.render(1, (t, mm) => mm.setIn('clock', Math.floor(t * 20 + 1e-6) % 2 === 0 ? 1 : 0));  // 10 flanken/s
    expect(notesAt(o).length).toBeGreaterThanOrEqual(10);
    expect(notesAt(o).length).toBeLessThanOrEqual(11);              // + de eerste aanslag zelf

    const p = await load('tp_mmb_arp');
    on(p, 60); p.render(0.2);
    p.ex.mmb_midi(0xB0, 123, 0);
    expect(risingEdges(p.render(0.5).gate!)).toHaveLength(0);
  });

  it('het kanaalfilter laat andere kanalen door noch toe', async () => {
    const m = await load('tp_mmb_arp');
    m.setCtl('channel', 2);
    m.ex.mmb_midi(0x90, 60, 100);                          // kanaal 1
    expect(risingEdges(m.render(0.3).gate!)).toHaveLength(0);
    m.ex.mmb_midi(0x91, 60, 100);                          // kanaal 2
    expect(risingEdges(m.render(0.3).gate!).length).toBeGreaterThan(0);
  });
});

describe('tp_mmb_martenot', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_martenot'); });

  it('klavier: de toets maakt het geluid; los = stil', async () => {
    const m = await load('tp_mmb_martenot');
    m.setIn('voct', 0); m.setIn('vel', 0.8); m.setIn('gate', 1);
    const held = m.render(0.5).out!;
    expect(rms(held, 11025)).toBeGreaterThan(0.1);
    expect(toneLevel(held, 261.63, m.rate, 11025)).toBeGreaterThan(5 * toneLevel(held, 523.25, m.rate, 11025));
    m.setIn('gate', 0);
    const gone = m.render(2).out!;
    expect(rms(gone, 44100)).toBeLessThan(0.002);
  });

  it('touche: zonder druk niets, de druk is het volume, ook zonder toets', async () => {
    const m = await load('tp_mmb_martenot');
    m.setCtl('touche', 1);
    m.setIn('voct', 0); m.setIn('gate', 1); m.setIn('press', 0);
    expect(rms(m.render(0.5).out!, 11025)).toBeLessThan(0.002);
    m.setIn('press', 0.3);
    const soft = rms(m.render(0.5).out!, 11025);
    m.setIn('press', 1);
    const loud = rms(m.render(0.5).out!, 11025);
    expect(soft).toBeGreaterThan(0.01);
    expect(loud).toBeGreaterThan(2 * soft);
    m.setIn('gate', 0);                                    // toets los, druk blijft: klinkt door
    expect(rms(m.render(0.5).out!, 11025)).toBeGreaterThan(0.5 * loud);
  });

  it('de tiroir: 8 zet het octaaf erbij, C geeft oneven boventonen', async () => {
    const tone = async (ctl: Record<string, number>): Promise<{ m: Mod; out: Float32Array }> => {
      const m = await load('tp_mmb_martenot');
      for (const [k, v] of Object.entries({ onde: 0, vib: 0, souffle: 0, bright: 1, ...ctl })) m.setCtl(k, v);
      m.setIn('voct', -1); m.setIn('vel', 1); m.setIn('gate', 1);     // 130,8 Hz
      return { m, out: m.render(1).out! };
    };
    const f = 130.81;
    const oct = await tone({ octaviant: 1 });
    expect(toneLevel(oct.out, 2 * f, oct.m.rate, 11025)).toBeGreaterThan(3 * toneLevel(oct.out, f, oct.m.rate, 11025));
    const creux = await tone({ creux: 1 });
    expect(toneLevel(creux.out, 3 * f, creux.m.rate, 11025)).toBeGreaterThan(5 * toneLevel(creux.out, 2 * f, creux.m.rate, 11025));
    for (const r of [oct, creux]) expect(peak(r.out)).toBeLessThan(1);
  });

  it('vibrato: het modwiel zet er meer bij', async () => {
    // Toonhoogte schatten uit nuldoorgangen per 50 ms.
    const spread = async (vibCv: number): Promise<number> => {
      const m = await load('tp_mmb_martenot');
      m.setCtl('vib', 1); m.setCtl('souffle', 0);
      m.setIn('voct', 0); m.setIn('vel', 1); m.setIn('gate', 1); m.setIn('vib_cv', vibCv);
      const out = m.render(1.5).out!;
      const hz: number[] = [];
      const win = 2205;
      for (let s = 22050; s + win < out.length; s += win) {
        let z = 0; for (let i = s + 1; i < s + win; i++) if (out[i - 1]! < 0 && out[i]! >= 0) z++;
        hz.push(z * 20);
      }
      return Math.max(...hz) - Math.min(...hz);
    };
    expect(await spread(1)).toBeGreaterThan(1.8 * await spread(0));
  });
});

describe('tp_mmb_diffuseur', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_diffuseur'); });

  /** Een halve seconde sinus op `hz`, dan stilte; geeft de uitgang. */
  const burst = async (ctl: Record<string, number>, hz: number): Promise<{ m: Mod; out: Float32Array }> => {
    const m = await load('tp_mmb_diffuseur');
    for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
    const out = m.render(1.5, (t, mm) => {
      const b = mm.inBuf('in');
      for (let k = 0; k < mm.block; k++) {
        const tt = t + k / mm.rate;
        b[k] = tt < 0.5 ? 0.4 * Math.sin(2 * Math.PI * hz * tt) : 0;
      }
    }).out!;
    return { m, out };
  };

  it('Principal laat door en klinkt niet na', async () => {
    const { out } = await burst({ type: 0 }, 440);
    expect(rms(out, 4410, 22050)).toBeGreaterThan(0.15);
    expect(rms(out, 26460)).toBeLessThan(0.001);
  });

  it('Palme: de snaren zingen na, op hun eigen toon', async () => {
    const { m, out } = await burst({ type: 1, mix: 0.7, ring: 0.7 }, 130.81);   // C3 = de laagste snaar
    const tail = rms(out, 30870, 52920);                   // 0,2–0,7 s na het einde
    expect(tail).toBeGreaterThan(0.01);
    expect(toneLevel(out, 130.81, m.rate, 30870, 52920)).toBeGreaterThan(3 * toneLevel(out, 155.56, m.rate, 30870, 52920));
    expect(peak(out)).toBeLessThan(1.2);
  });

  it('Métallique: de gong zingt op zijn eigen toon, niet op die van de noot', async () => {
    const { m, out } = await burst({ type: 2, mix: 0.8, ring: 0.8, gong: 196 }, 440);
    const from = 24255, to = 35280;                        // 0,05–0,3 s na het einde
    expect(rms(out, from, to)).toBeGreaterThan(0.002);
    expect(toneLevel(out, 196, m.rate, from, to)).toBeGreaterThan(toneLevel(out, 440, m.rate, from, to));
    expect(peak(out)).toBeLessThan(1.2);
  });
});
