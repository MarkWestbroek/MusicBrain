// Het zuivere deel van de overdub (doc/plans/overdub.md): maten en regio,
// knippen, drop-in met kruisfade, mix, MIDI naar songtijd, de exportset en
// de rondreis door de opslagvorm.

import { describe, expect, it } from 'vitest';

import {
  barMs, clampRegion, cutRegion, emptyTrack, exportFiles, loopMs, midiToRegion, mixdown, newSong, panGains, punchIn, songBars, songMs,
  spliceMidi, withTrack, withoutTrack, type Song,
} from './song';
import { fromStored, summaryOf, toStored } from './songStore';

const song = (bpm = 120): Song => ({ ...newSong(bpm), id: 's1' });
const audio = (seconds: number, rate = 48000, value = 0): { channels: Float32Array[]; sampleRate: number } =>
  ({ channels: [new Float32Array(Math.round(seconds * rate)).fill(value), new Float32Array(Math.round(seconds * rate)).fill(value)], sampleRate: rate });

describe('maten en regio', () => {
  it('een maat op 120 bpm is twee seconden; de song is zo lang als het langste spoor', () => {
    expect(barMs(song())).toBe(2000);
    let s = withTrack(song(), 0, { ...emptyTrack('a'), audio: audio(5) });
    s = withTrack(s, 1, { ...emptyTrack('b'), audio: audio(7.5) });
    expect(songMs(s)).toBe(7500);
    expect(songBars(s)).toBe(4);           // 7,5 s = 3,75 maten → 4
    expect(songBars(song())).toBe(0);
  });

  it('begrenst de regio op de song en rekent de lus in ms', () => {
    const s = withTrack(song(), 0, { ...emptyTrack('a'), audio: audio(7.5) });
    expect(clampRegion(s, { from: 1, to: 3 })).toEqual({ from: 1, to: 3 });
    expect(clampRegion(s, { from: -2, to: 99 })).toEqual({ from: 0, to: 4 });
    expect(clampRegion(s, { from: 3, to: 3 })).toEqual({ from: 3, to: 4 });
    expect(clampRegion(song(), { from: 0, to: 1 })).toBeNull();
    expect(loopMs({ ...s, loop: { from: 1, to: 3 } })).toEqual({ start: 2000, end: 6000 });
    expect(loopMs({ ...s, loop: { from: 3, to: 4 } })).toEqual({ start: 6000, end: 7500 });   // de song is korter dan de maat
    expect(loopMs(s)).toEqual({ start: 0, end: 7500 });
  });

  it('bpm blijft binnen het bereik van de ritmebox (30–300) en volgt een knop tot op 0,1', () => {
    expect(newSong(1000).bpm).toBe(300);
    expect(newSong(10).bpm).toBe(30);
    expect(newSong(89.99999999999997).bpm).toBe(90);
    expect(newSong(94.25).bpm).toBe(94.3);
    expect(newSong(NaN).bpm).toBe(120);
  });
});

describe('cutRegion en punchIn', () => {
  it('knipt vanaf het startframe, vult te kort aan met nullen en fadet de naden', () => {
    const src = new Float32Array(1000).fill(1);
    const [out] = cutRegion([src], 600, 600, 10);
    expect(out!.length).toBe(600);
    expect(out![300]).toBe(1);
    expect(out![0]).toBe(0);
    expect(out![5]).toBeCloseTo(0.5, 5);
    expect(out![399]).toBe(1);
    expect(out![450]).toBe(0);
  });

  it('drop-in vervangt het stuk met een kruisfade en laat het spoor groeien als het moet', () => {
    const base = [new Float32Array(100).fill(1)];
    const piece = [new Float32Array(40).fill(-1)];
    const [out] = punchIn(base, piece, 30, 10);
    expect(out!.length).toBe(100);
    expect(out![20]).toBe(1);               // ervoor: oud
    expect(out![50]).toBe(-1);              // midden: nieuw
    expect(out![35]).toBeCloseTo(0, 5);     // halverwege de fade-in: 1·0,5 + (−1)·0,5
    expect(out![80]).toBe(1);               // erna: oud
    const [grown] = punchIn(base, piece, 90, 0);
    expect(grown!.length).toBe(130);
    expect(grown![120]).toBe(-1);
  });
});

describe('mixdown', () => {
  it('equal-power pan: midden verdeelt gelijk, hard links laat rechts leeg', () => {
    const [l, r] = panGains(0);
    expect(l).toBeCloseTo(r, 6);
    expect(panGains(-1)).toEqual([1, expect.closeTo(0, 6)]);
  });

  it('telt sporen op met gain en pan, slaat gedempte over, en vult korte sporen aan', () => {
    const mono = { channels: [new Float32Array(4).fill(0.5)], sampleRate: 48000 };
    const a = { ...emptyTrack('a'), audio: mono, gain: 1, pan: 0 };
    const b = { ...emptyTrack('b'), audio: mono, gain: 1, pan: -1 };
    const m = { ...emptyTrack('m'), audio: mono, gain: 1, pan: 0, mute: true };
    const [l, r] = mixdown([a, b, m], 6);
    expect(l![0]).toBeCloseTo(0.5 + 0.5 * Math.SQRT2, 5);
    expect(r![0]).toBeCloseTo(0.5, 5);
    expect(l![5]).toBe(0);
  });
});

describe('MIDI', () => {
  it('naar songtijd: wat ervoor of erna valt gaat weg, hangende noten sluiten, een noot uit het aftellen begint op het begin', () => {
    const ev = [
      { t: 1500, status: 0x90, d1: 60, d2: 100 },   // in het aftellen, nog aan bij het begin
      { t: 2500, status: 0x80, d1: 60, d2: 0 },
      { t: 2100, status: 0x90, d1: 62, d2: 100 },
      { t: 2600, status: 0x80, d1: 62, d2: 0 },
      { t: 5000, status: 0x90, d1: 64, d2: 100 },   // nog aan op het eind
      { t: 6500, status: 0x80, d1: 64, d2: 0 },     // na het eind
    ];
    expect(midiToRegion(ev, 2000, 4000).map((e) => [e.t, e.status, e.d1])).toEqual([
      [0, 0x90, 60], [500, 0x80, 60], [100, 0x90, 62], [600, 0x80, 62], [3000, 0x90, 64], [4000, 0x80, 64],
    ]);
    // Met een offset (drop-in op maat 2): alles 2000 ms verder.
    expect(midiToRegion(ev.slice(2, 4), 2000, 4000, 2000).map((e) => e.t)).toEqual([2100, 2600]);
  });

  it('drop-in vervangt de events in het stuk en houdt de rest, gesorteerd', () => {
    const base = [{ t: 100, status: 0x90, d1: 60, d2: 1 }, { t: 2500, status: 0x90, d1: 61, d2: 1 }, { t: 5000, status: 0x90, d1: 62, d2: 1 }];
    const piece = [{ t: 3000, status: 0x90, d1: 70, d2: 1 }];
    expect(spliceMidi(base, piece, 2000, 4000).map((e) => [e.t, e.d1])).toEqual([[100, 60], [3000, 70], [5000, 62]]);
  });
});

describe('sporen, export en opslag', () => {
  const withThree = (): Song => {
    let s = song();
    s = withTrack(s, 0, { ...emptyTrack('Ritmebox'), audio: audio(8), patch: { name: 'x' } as never });
    s = withTrack(s, 1, { ...emptyTrack('SID bas'), audio: audio(6), midi: [{ t: 10, status: 0x90, d1: 36, d2: 90 }, { t: 400, status: 0x80, d1: 36, d2: 0 }], patch: { name: 'y' } as never });
    s = withTrack(s, 2, { ...emptyTrack('E-piano'), audio: audio(8), patch: { name: 'z' } as never });
    return { ...s, loop: { from: 1, to: 3 } };
  };

  it('zeven bestanden bij drie sporen: de mix, en per spoor mid en patch; stems als optie', () => {
    const enc = { wav: () => new Uint8Array(new ArrayBuffer(4)), smf: () => new Uint8Array(new ArrayBuffer(4)) };
    const names = exportFiles({ ...withThree(), name: 'Mijn song' }, enc).map((f) => f.name);
    expect(names).toEqual([
      'Mijn-song-mix.wav', 'Mijn-song-1.mid', 'Mijn-song-1.patch.json', 'Mijn-song-2.mid', 'Mijn-song-2.patch.json',
      'Mijn-song-3.mid', 'Mijn-song-3.patch.json',
    ]);
    expect(exportFiles(withThree(), enc, true).map((f) => f.name)).toContain('song-2.wav');
  });

  it('withTrack vult tot de plek, withoutTrack schuift op; nooit meer dan vier', () => {
    let s = withTrack(song(), 2, emptyTrack('c'));
    expect(s.tracks.map((t) => t.name)).toEqual(['', '', 'c']);
    s = withTrack(s, 5, emptyTrack('x'));
    expect(s.tracks.length).toBe(4);
    expect(withoutTrack(s, 0).tracks.map((t) => t.name)).toEqual(['', 'c', '']);
  });

  it('overleeft de rondreis door de opslagvorm, met de regio', () => {
    const s = withThree();
    const back = fromStored(toStored(s, 123));
    expect(back.tracks.length).toBe(3);
    expect(back.tracks[1]!.midi.length).toBe(2);
    expect(back.tracks[1]!.patch).toEqual({ name: 'y' });
    expect(back.tracks[0]!.audio!.channels[0]!.length).toBe(8 * 48000);
    expect(back.loop).toEqual({ from: 1, to: 3 });
    expect(summaryOf(toStored(s, 123))).toEqual({ id: 's1', name: '', bpm: 120, tracks: 3, savedAt: 123 });
    // Een kapotte patch-string of ontbrekende velden breken het laden niet; een regio buiten de song krimpt.
    const stored = toStored(s);
    stored.tracks[0]!.patch = '{nee';
    const one = fromStored({ ...stored, bpm: NaN, loop: { from: 7, to: 9 }, tracks: [stored.tracks[0]!] });
    expect(one.tracks[0]!.patch).toBeNull();
    expect(one.loop).toEqual({ from: 3, to: 4 });
  });
});
