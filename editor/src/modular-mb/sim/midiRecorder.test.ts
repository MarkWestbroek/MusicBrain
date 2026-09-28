import { describe, it, expect } from 'vitest';
import { encodeSmf, MidiRecorder, siblingName, patchSnapshot, SMF_PPQ } from './midiRecorder';
import { emptyModularProject } from '../types';
import { seedInternals, seedPolyVoicePatch } from '../seedModules';

/** Minimale SMF-lezer: geeft [absTick, status, d1, d2?][] uit track 1. */
function readSmf(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset);
  expect(String.fromCharCode(...b.slice(0, 4))).toBe('MThd');
  expect(dv.getUint16(8)).toBe(0);
  expect(dv.getUint16(12)).toBe(SMF_PPQ);
  expect(String.fromCharCode(...b.slice(14, 18))).toBe('MTrk');
  const len = dv.getUint32(18);
  expect(b.length).toBe(22 + len);
  let p = 22, tick = 0; const ev: number[][] = []; let ended = false;
  const vl = () => { let v = 0, c; do { c = b[p++]!; v = (v << 7) | (c & 0x7F); } while (c & 0x80); return v; };
  while (p < 22 + len) {
    tick += vl();
    const s = b[p++]!;
    if (s === 0xFF) { const type = b[p++]!; const n = vl(); if (type === 0x2F) { ended = true; ev.push([tick, 0xFF]); } p += n; continue; }
    const two = (s & 0xF0) !== 0xC0 && (s & 0xF0) !== 0xD0;
    ev.push(two ? [tick, s, b[p]!, b[p + 1]!] : [tick, s, b[p]!]); p += two ? 2 : 1;
  }
  expect(ended).toBe(true);
  return ev;
}

describe('encodeSmf', () => {
  it('tijden in ticks (0,96 per ms), aftertouch 1 databyte, einde op de audiolengte', () => {
    const b = encodeSmf([
      { t: 0, status: 0x90, d1: 60, d2: 100 },
      { t: 500, status: 0xD0, d1: 127, d2: 0 },
      { t: 1000, status: 0x80, d1: 60, d2: 0 },
      { t: 250, status: 0xE0, d1: 0, d2: 64 },
    ], { lengthMs: 2000, name: 'test' });
    const ev = readSmf(b);
    expect(ev).toEqual([[0, 0x90, 60, 100], [240, 0xE0, 0, 64], [480, 0xD0, 127], [960, 0x80, 60, 0], [1920, 0xFF]]);
  });

  it('lengte-codering voor grote delta’s', () => {
    const ev = readSmf(encodeSmf([{ t: 100_000, status: 0x90, d1: 1, d2: 1 }]));
    expect(ev[0]).toEqual([96_000, 0x90, 1, 1]);
  });
});

describe('MidiRecorder', () => {
  it('tijd relatief aan start, hangende noten krijgen een noot-uit', () => {
    const r = new MidiRecorder();
    r.record(0x90, 60, 100, 5);          // vóór start: genegeerd
    r.start(1000);
    r.record(0x90, 60, 100, 1010);
    r.record(0x90, 64, 100, 1020);
    r.record(0x80, 60, 0, 1500);
    const ev = r.stop(3000);
    expect(ev.map((e) => [e.t, e.status, e.d1])).toEqual([[10, 0x90, 60], [20, 0x90, 64], [500, 0x80, 60], [3000, 0x80, 64]]);
    expect(r.active).toBe(false);
  });
});

describe('bestanden', () => {
  it('siblingName', () => {
    expect(siblingName('mmb-x-20260928-101500.wav', '.mid')).toBe('mmb-x-20260928-101500.mid');
  });
  it('patchSnapshot houdt alleen deze patch en zijn racks', () => {
    let p = seedPolyVoicePatch(seedInternals(emptyModularProject()), 2);
    p = seedPolyVoicePatch(p, 4);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const s = patchSnapshot(p, patch);
    expect(s.patches).toHaveLength(1);
    expect(s.racks.map((r) => r.id)).toEqual(patch.rackIds);
    const ids = new Set(s.modules.map((m) => m.id));
    for (const c of patch.connections) expect(ids.has(c.from.moduleId) && ids.has(c.to.moduleId)).toBe(true);
    expect(s.modules.length).toBeLessThan(p.modules.length);
  });
});

describe('tempo van een take', () => {
  it('MIDI-clock wint, dan de klok in de patch, anders null', async () => {
    const { takeTempo } = await import('./midiRecorder');
    const clock96 = Array.from({ length: 60 }, (_, i) => i * (60_000 / 96 / 24));
    expect(takeTempo(clock96, 120)).toEqual({ bpm: 96, from: 'clock' });
    expect(takeTempo(clock96.slice(0, 10), 110)).toEqual({ bpm: 110, from: 'patch' });
    expect(takeTempo([], null)).toBeNull();
  });
  it('encodeSmf met ander tempo houdt de tijden exact', () => {
    const b = encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 1000, status: 0x80, d1: 60, d2: 0 }], { lengthMs: 2000, bpm: 90 });
    const ev = readSmf(b);
    expect(ev[1]).toEqual([720, 0x80, 60, 0]);            // 1 s bij 90 BPM, 480 PPQ = 720 ticks
  });
});
