import { describe, it, expect } from 'vitest';
import { buildRpp } from './exportRpp';

describe('buildRpp', () => {
  it('tempo, lus, audiotrack en MIDI-track met ticks op 960 PPQ', () => {
    const rpp = buildRpp({
      name: 'koper', bpm: 120, beatsPerBar: 4, lengthMs: 2000, wavFile: 'koper.wav',
      midi: [{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 500, status: 0x80, d1: 60, d2: 0 }, { t: 750, status: 0xD0, d1: 64, d2: 0 }],
      loop: { start: 500, end: 1500 },
    });
    expect(rpp).toContain('TEMPO 120 4 4');
    expect(rpp).toContain('LOOP 1');
    expect(rpp).toContain('SELECTION 0.500000 1.500000');
    expect(rpp).toContain('FILE "koper.wav"');
    expect(rpp).toContain('HASDATA 1 960 QN');
    expect(rpp).toContain('E 0 90 3c 64');
    expect(rpp).toContain('E 960 80 3c 00');       // 500 ms bij 120 BPM = één kwart
    expect(rpp).toContain('E 480 d0 40 00');
    expect(rpp).toContain('E 2400 b0 7b 00');      // tot 2000 ms = 3840 ticks
    // haakjes kloppen
    const open = (rpp.match(/^\s*</gm) ?? []).length, close = (rpp.match(/^\s*>\s*$/gm) ?? []).length;
    expect(open).toBe(close);
  });
  it('zonder wav geen audiotrack, zonder MIDI geen MIDI-track', () => {
    expect(buildRpp({ name: 'x', bpm: 100, beatsPerBar: 3, lengthMs: 1000, midi: [] })).not.toContain('<TRACK');
    expect(buildRpp({ name: 'x', bpm: 100, beatsPerBar: 3, lengthMs: 1000, wavFile: 'a.wav' })).toContain('TEMPO 100 3 4');
  });
});
