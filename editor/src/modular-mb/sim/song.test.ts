// Het zuivere deel van de overdub (doc/plans/overdub.md): regio-rekensom,
// knippen op de regio, mix, MIDI naar regio-tijd, de exportset en de
// rondreis door de opslagvorm.

import { describe, expect, it } from 'vitest';

import {
  countInMs, cutRegion, emptyTrack, exportFiles, midiToRegion, mixdown, newSong, panGains, regionFrames, regionMs, schedule,
  withTrack, withoutTrack, type Song,
} from './song';
import { fromStored, summaryOf, toStored } from './songStore';

const song = (bpm = 120, bars = 2): Song => ({ ...newSong(bpm, bars), id: 's1' });

describe('regio', () => {
  it('twee maten op 120 bpm zijn vier seconden; het aftellen één maat', () => {
    expect(regionMs(song())).toBe(4000);
    expect(countInMs(song())).toBe(2000);
    expect(regionFrames(song(), 48000)).toBe(192000);
    expect(regionFrames(song(90, 1), 44100)).toBe(Math.round((4 * 60000 / 90) / 1000 * 44100));
  });

  it('plant aftellen, regio en eind achter elkaar op contexttijd', () => {
    const s = schedule(song(), 10);
    expect(s).toEqual({ countIn: 10, region: 12, end: 16 });
  });

  it('bpm en maten blijven binnen de grenzen', () => {
    expect(newSong(1000, 99).bpm).toBe(240);
    expect(newSong(1000, 99).bars).toBe(16);
    expect(newSong(NaN, NaN)).toMatchObject({ bpm: 120, bars: 2 });
  });
});

describe('cutRegion', () => {
  it('knipt vanaf het startframe, vult te kort aan met nullen en fadet de naden', () => {
    const src = new Float32Array(1000).fill(1);
    const [out] = cutRegion([src], 600, 600, 10);
    expect(out!.length).toBe(600);
    expect(out![300]).toBe(1);            // midden: onaangeroerd
    expect(out![0]).toBe(0);              // fade-in begint op 0
    expect(out![5]).toBeCloseTo(0.5, 5);
    expect(out![399]).toBe(1);            // laatste echte sample vóór de nullen
    expect(out![450]).toBe(0);            // aangevuld
  });

  it('knipt niet vóór het begin', () => {
    const src = new Float32Array([1, 2, 3, 4]);
    const [out] = cutRegion([src], -5, 4, 0);
    expect([...out!]).toEqual([1, 2, 3, 4]);
  });
});

describe('mixdown', () => {
  it('equal-power pan: midden verdeelt gelijk, hard links laat rechts leeg', () => {
    const [l, r] = panGains(0);
    expect(l).toBeCloseTo(r, 6);
    expect(panGains(-1)).toEqual([1, expect.closeTo(0, 6)]);
  });

  it('telt sporen op met gain en pan, en slaat gedempte over', () => {
    const mono = { channels: [new Float32Array(4).fill(0.5)], sampleRate: 48000 };
    const a = { ...emptyTrack('a'), audio: mono, gain: 1, pan: 0 };
    const b = { ...emptyTrack('b'), audio: mono, gain: 1, pan: -1 };
    const m = { ...emptyTrack('m'), audio: mono, gain: 1, pan: 0, mute: true };
    const [l, r] = mixdown([a, b, m], 4);
    // a: 0,5·cos45°·√2 = 0,5 per kant; b: 0,5·√2 links, 0 rechts.
    expect(l![0]).toBeCloseTo(0.5 + 0.5 * Math.SQRT2, 5);
    expect(r![0]).toBeCloseTo(0.5, 5);
  });
});

describe('midiToRegion', () => {
  it('een noot uit het aftellen die nog klinkt begint op 0', () => {
    const ev = [
      { t: 1500, status: 0x90, d1: 60, d2: 100 },   // in het aftellen, niet losgelaten
      { t: 2500, status: 0x80, d1: 60, d2: 0 },
    ];
    expect(midiToRegion(ev, 2000, 4000).map((e) => [e.t, e.status, e.d1])).toEqual([[0, 0x90, 60], [500, 0x80, 60]]);
    // Alleen noot-aan in het aftellen en nooit los: aan op 0, uit op het eind.
    expect(midiToRegion(ev.slice(0, 1), 2000, 4000).map((e) => [e.t, e.status])).toEqual([[0, 0x90], [4000, 0x80]]);
  });

  it('verschuift naar regio-tijd, laat wat ervoor of erna valt weg, en sluit hangende noten', () => {
    const ev = [
      { t: 1500, status: 0x90, d1: 60, d2: 100 },   // in het aftellen
      { t: 1900, status: 0x80, d1: 60, d2: 0 },
      { t: 2100, status: 0x90, d1: 62, d2: 100 },   // 100 ms in de regio
      { t: 2600, status: 0x80, d1: 62, d2: 0 },
      { t: 5000, status: 0x90, d1: 64, d2: 100 },   // nog aan op het eind
      { t: 6500, status: 0x80, d1: 64, d2: 0 },     // na het eind
    ];
    const out = midiToRegion(ev, 2000, 4000);
    expect(out.map((e) => [e.t, e.status, e.d1])).toEqual([
      [100, 0x90, 62], [600, 0x80, 62], [3000, 0x90, 64], [4000, 0x80, 64],
    ]);
  });
});

describe('sporen en export', () => {
  const audio = { channels: [new Float32Array(192000), new Float32Array(192000)], sampleRate: 48000 };
  const withThree = (): Song => {
    let s = song();
    s = withTrack(s, 0, { ...emptyTrack('Ritmebox'), audio, patch: { name: 'x' } as never });
    s = withTrack(s, 1, { ...emptyTrack('SID bas'), audio, midi: [{ t: 10, status: 0x90, d1: 36, d2: 90 }, { t: 400, status: 0x80, d1: 36, d2: 0 }], patch: { name: 'y' } as never });
    s = withTrack(s, 2, { ...emptyTrack('E-piano'), audio, patch: { name: 'z' } as never });
    return s;
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

  it('overleeft de rondreis door de opslagvorm', () => {
    const s = withThree();
    const back = fromStored(toStored(s, 123));
    expect(back.tracks.length).toBe(3);
    expect(back.tracks[1]!.midi.length).toBe(2);
    expect(back.tracks[1]!.patch).toEqual({ name: 'y' });
    expect(back.tracks[0]!.audio!.channels[0]!.length).toBe(192000);
    expect(summaryOf(toStored(s, 123))).toEqual({ id: 's1', name: '', bpm: 120, bars: 2, tracks: 3, savedAt: 123 });
    // Een kapotte patch-string of ontbrekende velden breken het laden niet.
    const stored = toStored(s);
    stored.tracks[0]!.patch = '{nee';
    expect(fromStored({ ...stored, bpm: NaN, tracks: [stored.tracks[0]!] }).tracks[0]!.patch).toBeNull();
  });
});
