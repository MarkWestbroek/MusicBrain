// De MIDI-export van een stijl: dezelfde noten als de patch speelt. De
// Grids-port is los tegen de wasm-module gelegd (8 standen × 32 stappen × 3
// instrumenten, 0 afwijkingen, 2026-10-27); hier de structuur van de song.
import { describe, expect, it } from 'vitest';

import { parseSmf } from '../take-player/smf';
import { DEFAULT_FORM, encodeSongMidi, gridsHit, SONG_PPQ, songNotes } from './songMidi';
import { DARK, STYLES } from './style';

const S16 = SONG_PPQ / 4, BAR = 16 * S16;
const inBar = <T extends { t: number }>(notes: T[], bar: number): T[] => notes.filter((n) => n.t >= bar * BAR && n.t < (bar + 1) * BAR);
const six = (n: { t: number }): number => (n.t % BAR) / S16;

describe('songMidi', () => {
  const song = songNotes(DARK);

  it('volgt de liedvorm: 84 maten, een marker per sectie', () => {
    expect(song.bars).toBe(DEFAULT_FORM.reduce((n, p) => n + p.bars, 0));
    expect(song.markers.map((m) => m.text.split(' ')[0])).toEqual(['INTRO', 'VERSE', 'HOOK', 'VERSE', 'HOOK', 'BREAK', 'VERSE', 'HOOK', 'OUTRO']);
  });

  it('respecteert de stems per sectie: intro zonder bas en snare, break zonder kick en bas', () => {
    for (let b = 0; b < 4; b++) { expect(inBar(song.BASS, b)).toEqual([]); expect(inBar(song.SNARE, b)).toEqual([]); }
    for (let b = 52; b < 56; b++) { expect(inBar(song.KICK, b)).toEqual([]); expect(inBar(song.BASS, b)).toEqual([]); }
    expect(inBar(song.KICK, 4).length).toBeGreaterThan(0);
    expect(inBar(song.SNARE, 5).length).toBeGreaterThan(0);
  });

  it('dark trap, vers A: de glijder gebonden (overlap), de octaaf liggend tot de rij loslaat', () => {
    const a = inBar(song.BASS, 4);
    expect(a.map(six)).toEqual([0, 1, 2, 4, 12, 13, 14]);
    expect(a.map((n) => n.note)).toEqual([33, 32, 30, 45, 32, 31, 30]);
    // 0 → 1 → 2 gebonden: elke noot loopt iets in de volgende door.
    expect(a[0]!.dur).toBeGreaterThan(S16); expect(a[1]!.dur).toBeGreaterThan(S16);
    // De A2 ligt van 4 tot de rij op 11 loslaat (slagen 5–10 in de boog doen niets).
    expect(a[3]!.dur).toBe(7 * S16);
    // F♯1 op 2 laat op 3 los (rij laag): precies één zestiende.
    expect(a[2]!.dur).toBe(S16);
  });

  it('dark trap, vers B: tresillo achter de tel, de laatste slag een korte stoot naar C♯1', () => {
    const b = inBar(song.BASS, 5);
    // Slag 12 is dezelfde A2 in de boog: geen nieuwe noot, de A2 van 9 loopt door tot 15.
    expect(b.map(six)).toEqual([1, 4, 7, 9, 15]);
    expect(b[3]!.note).toBe(45); expect(b[3]!.dur).toBe(6 * S16);
    expect(b[4]!.note).toBe(25);
    expect(b[4]!.dur).toBeLessThan(S16);
  });

  it('dark trap: de riff op het dubbele tresillo in A, vier stoten achter de tel en dalend in B', () => {
    expect(inBar(song.KEYS, 4).map(six)).toEqual([0, 3, 6, 8, 11, 14]);
    expect(inBar(song.KEYS, 5).map(six)).toEqual([1, 5, 9, 13]);
    expect(inBar(song.KEYS, 5).map((n) => n.note)).toEqual([54, 52, 50, 49]);
  });

  it('dark trap: de strijkers als akkoord op F♯3, mineur in A en kwint in B, één aanzet per twee maten', () => {
    const a = inBar(song.PAD, 4);
    expect(a.map((n) => n.note).sort((x, y) => x - y)).toEqual([54, 57, 61, 66]);
    expect(inBar(song.PAD, 5).map((n) => n.note)).toEqual([73]);           // de C♯5 van de kwint komt erbij; de rest loopt door
    expect(a.find((n) => n.note === 54)!.dur).toBe(29 * S16);              // Div 32 × 0,9
  });

  it('dark trap: de roffels van RATCHET in de hats: 3:2 op 14–15 in A, de fill-maat vol triolen', () => {
    const a = inBar(song.HATS, 4).filter((n) => six(n) >= 14);
    expect(a.map((n) => Math.round(six(n) * 100) / 100)).toEqual([14, 14.67, 15.33]);
    expect(a.map((n) => n.vel)).toEqual([79, 101, 123]);                 // base 0,45 → 0,95
    expect(inBar(song.HATS, 5).filter((n) => six(n) % 1 !== 0)).toEqual([]);   // B: geen roffel
    expect(inBar(song.HATS, 19).length).toBeGreaterThanOrEqual(24);      // fill: acht 3:2's
  });

  it('zet de fill in de laatste maat van een sectie', () => {
    expect(inBar(song.SNARE, 19).length).toBeGreaterThan(inBar(song.SNARE, 17).length);
  });

  it('Grids: de kaart slaat op stap 0 met een lage density en zwijgt met density 0', () => {
    expect(gridsHit(0, 0, 0.3, 0.2, 0.45)).toBeGreaterThan(0);
    expect(gridsHit(0, 0, 0.3, 0.2, 0)).toBe(0);
  });

  it('schrijft een SMF type 1 die de eigen lezer terugleest, voor elke stijl', () => {
    for (const style of STYLES) {
      const p = parseSmf(encodeSongMidi(style));
      expect(p.tracks).toBe(7);
      expect(Math.round(p.bpm)).toBe(style.bpm);
      const bars = DEFAULT_FORM.reduce((n, x) => n + x.bars, 0);
      expect(Math.round(p.durationMs)).toBe(Math.round((bars * 4 * 60_000) / style.bpm));
      expect(p.events.some((e) => (e.bytes[0]! & 0xF0) === 0x90)).toBe(true);
    }
  });
});
