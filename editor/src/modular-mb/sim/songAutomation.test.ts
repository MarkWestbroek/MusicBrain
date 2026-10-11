// Automation in de sporen (ED-SM-10 stap 2 en 3) en de song als bestand op schijf.

import { describe, expect, it } from 'vitest';

import { automationLanes, automationToRegion, buildAutomationFile, spliceAutomation, type AutomationEvent } from '../automation';
import { catalogMenu } from '../patchCatalog';
import { seedInternals } from '../seedModules';
import { emptyModularProject, resolveControls } from '../types';
import { encodeSmf, patchSnapshot } from './midiRecorder';
import { emptyTrack, exportFiles, newSong, withTrack, type Song } from './song';
import { SongFileError, songFromFile, songToFile, unzipStore } from './songFile';
import { fromStored, toStored } from './songStore';
import { encodeWav } from './wavRecorder';

const ev = (t: number, value: number, controlId = 'cut'): AutomationEvent => ({ t, moduleId: 'm', controlId, value });

describe('automation naar songtijd', () => {
  it('de stand van vóór het stuk komt op het begin; erna valt weg', () => {
    const got = automationToRegion([ev(0, 0.2), ev(500, 0.4), ev(1500, 0.6), ev(4000, 0.9)], 1000, 2000, 300);
    expect(got.map((e) => [e.t, e.value])).toEqual([[300, 0.4], [800, 0.6]]);
  });
});

describe('drop-in van automation', () => {
  it('vervangt de regio en zet de knop daarna terug op de stand van het spoor', () => {
    const base = [ev(0, 0.1), ev(1000, 0.3), ev(2500, 0.5), ev(5000, 0.7)];
    const piece = [ev(2000, 0.8), ev(2600, 0.9)];
    const got = spliceAutomation(base, piece, 2000, 4000);
    expect(got.map((e) => [e.t, e.value])).toEqual([[0, 0.1], [1000, 0.3], [2000, 0.8], [2600, 0.9], [4000, 0.5], [5000, 0.7]]);
  });
  it('een knop die alleen in de oude regio bewoog gaat aan het eind ook terug', () => {
    const base = [ev(0, 0.1, 'drive'), ev(2500, 0.9, 'drive')];
    const got = spliceAutomation(base, [], 2000, 4000);
    expect(got.map((e) => [e.t, e.value])).toEqual([[0, 0.1], [4000, 0.9]]);
  });
  it('een knop die het spoor nooit had: na de regio terug naar waar het stuk begon', () => {
    const got = spliceAutomation([], [ev(2000, 0.2), ev(2500, 0.6)], 2000, 4000);
    expect(got.map((e) => [e.t, e.value])).toEqual([[2000, 0.2], [2500, 0.6], [4000, 0.2]]);
  });
});

/** Een basisset-patch met een knop, als momentopname zoals een spoor hem heeft. */
function snapshotWithKnob() {
  const base = seedInternals(emptyModularProject());
  const project = catalogMenu('basisset')[0]!.build(base);
  const patch = project.patches.find((x) => x.id === project.activePatchId)!;
  for (const rid of patch.rackIds) for (const s of project.racks.find((r) => r.id === rid)!.slots) {
    const m = project.modules.find((x) => x.id === s.moduleId)!;
    const c = resolveControls(m, project.moduleTypes).find((x) => x.kind === 'knob');
    if (c && c.kind === 'knob') return { snap: patchSnapshot(project, patch), moduleId: m.id, controlId: c.id, min: c.min, max: c.max };
  }
  throw new Error('geen knop');
}

describe('lijnen', () => {
  it('alleen bewogen knoppen, genormaliseerd op het bereik van de knop', () => {
    const { snap, moduleId, controlId, min, max } = snapshotWithKnob();
    const patch = snap.patches[0]!;
    const f = buildAutomationFile(snap, patch, [
      { t: 0, moduleId, controlId, value: min }, { t: 100, moduleId, controlId, value: max },
    ], 1000);
    const lanes = automationLanes(f);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.points.map((p) => [p.t, p.y])).toEqual([[0, 0], [100, 1]]);
    expect(automationLanes(buildAutomationFile(snap, patch, [{ t: 0, moduleId, controlId, value: min }], 1000))).toEqual([]);
  });
});

function demoSong(): Song {
  const { snap, moduleId, controlId } = snapshotWithKnob();
  const rate = 48000;
  const ch = (v: number): Float32Array => new Float32Array(rate).map((_, i) => (i % 100) / 100 * v);
  let s: Song = { ...newSong(100), id: 'orig', name: 'Mijn song', loop: { from: 0, to: 1 } };
  s = withTrack(s, 0, {
    ...emptyTrack('Koper'), gain: 0.6, pan: -0.5, mute: false,
    audio: { channels: [ch(0.5), ch(-0.5)], sampleRate: rate },
    midi: [{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 500, status: 0x80, d1: 60, d2: 0 }],
    automation: [{ t: 0, moduleId, controlId, value: 0.2 }, { t: 250, moduleId, controlId, value: 0.8 }],
    patch: snap,
  });
  s = withTrack(s, 1, { ...emptyTrack('Bas'), audio: { channels: [ch(0.25), ch(0.25)], sampleRate: rate } });
  return s;
}

describe('song als bestand', () => {
  it('heen en terug: sporen, MIDI, knopbewegingen, mix en lus blijven', () => {
    const s = demoSong();
    const back = songFromFile(songToFile(s, 42), () => 'nieuw');
    expect(back.id).toBe('nieuw');
    expect(back).toMatchObject({ name: 'Mijn song', bpm: 100, beatsPerBar: 4, loop: { from: 0, to: 1 } });
    expect(back.tracks).toHaveLength(2);
    const [a, b] = back.tracks;
    expect(a).toMatchObject({ name: 'Koper', gain: 0.6, pan: -0.5, midi: s.tracks[0]!.midi, automation: s.tracks[0]!.automation });
    expect(a!.patch?.patches[0]?.id).toBe(s.tracks[0]!.patch!.patches[0]!.id);
    // 24 bit: op 1/2^23 na gelijk.
    const src = s.tracks[0]!.audio!.channels[1]!, got = a!.audio!.channels[1]!;
    expect(got.length).toBe(src.length);
    let worst = 0;
    for (let i = 0; i < src.length; i++) worst = Math.max(worst, Math.abs(got[i]! - src[i]!));
    expect(worst).toBeLessThan(1e-6);
    expect(b!.automation).toEqual([]);
  });

  it('de zip heeft per spoor wav, mid en (met bewegingen) auto.json naast song.json', () => {
    const names = [...unzipStore(songToFile(demoSong())).keys()];
    expect(names).toEqual(['song.json', '1-Koper.wav', '1-Koper.mid', '1-Koper.auto.json', '2-Bas.wav', '2-Bas.mid']);
  });

  it('geen song: duidelijke fout', () => {
    expect(() => songFromFile(new Uint8Array([1, 2, 3]), () => 'x')).toThrowError(SongFileError);
  });
});

describe('opslag en export met automation', () => {
  it('de browseropslag bewaart de knopbewegingen; een oude song zonder krijgt een lege lijst', () => {
    const s = demoSong();
    expect(fromStored(toStored(s)).tracks[0]!.automation).toEqual(s.tracks[0]!.automation);
    const old = toStored(s);
    delete old.tracks[0]!.automation;
    expect(fromStored(old).tracks[0]!.automation).toEqual([]);
  });

  it('export: auto.json per spoor met bewegingen, gebonden knop als CC in de .mid', async () => {
    const s = demoSong();
    const t = s.tracks[0]!;
    const { moduleId, controlId } = t.automation[0]!;
    const files = exportFiles(s, { wav: (c, r) => encodeWav(c, r), smf: (e, o) => encodeSmf(e, o) }, false,
      [{ ch: 1, cc: 74, mod: moduleId, ctrl: controlId, min: 0, max: 1 }]);
    const names = files.map((f) => f.name);
    expect(names).toContain('Mijn-song-1.auto.json');
    expect(names).not.toContain('Mijn-song-2.auto.json');
    const mid = new Uint8Array(await files.find((f) => f.name === 'Mijn-song-1.mid')!.blob.arrayBuffer());
    expect([...mid].join(',')).toContain([0xB0, 74].join(','));
  });
});
