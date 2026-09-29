import { describe, it, expect } from 'vitest';
import { parseWav, wavPeaks, cropWav, cropMidi, wavDurationMs, WavError } from './takeEdit';
import { encodeWav } from './wavRecorder';
import { encodeSmf } from './midiRecorder';
import { parseSmf } from '../../take-player/smf';

const ramp = (n: number): Float32Array => Float32Array.from({ length: n }, (_, i) => (i / n) * 0.9);

describe('parseWav', () => {
  it('leest terug wat encodeWav schreef (16/24/32f, stereo)', () => {
    for (const fmt of ['i16', 'i24', 'f32'] as const) {
      const L = ramp(1000), R = ramp(1000).map((v) => -v);
      const w = parseWav(new Uint8Array(encodeWav([L, R], 48000, fmt)));
      expect(w.sampleRate).toBe(48000);
      expect(w.channels).toHaveLength(2);
      expect(w.channels[0]!.length).toBe(1000);
      expect(w.channels[0]![500]).toBeCloseTo(0.45, 3);
      expect(w.channels[1]![999]).toBeCloseTo(-0.8991, 3);
    }
    expect(() => parseWav(new Uint8Array([1, 2, 3]))).toThrowError(WavError);
  });
  it('peaks en duur', () => {
    const w = parseWav(new Uint8Array(encodeWav([ramp(4800)], 48000, 'f32')));
    expect(wavDurationMs(w)).toBe(100);
    const p = wavPeaks(w, 4);
    expect(p.length).toBe(8);
    expect(p[7]).toBeGreaterThan(0.8);
  });
});

describe('cropWav', () => {
  it('knipt sample-precies met fades', () => {
    const w = { sampleRate: 1000, channels: [new Float32Array(1000).fill(1)], bits: 24, float: false };
    const c = cropWav(w, 200, 700, 10);
    expect(c.channels[0]!.length).toBe(500);
    expect(c.channels[0]![0]).toBe(0);
    expect(c.channels[0]![250]).toBe(1);
    expect(c.channels[0]![499]).toBe(0);
  });
});

describe('cropMidi', () => {
  const f = parseSmf(encodeSmf([
    { t: 0, status: 0xB0, d1: 1, d2: 90 },          // modwheel vóór de start → chase
    { t: 100, status: 0x90, d1: 60, d2: 100 },      // klinkt over de start → afgekapt op 0
    { t: 600, status: 0x80, d1: 60, d2: 0 },
    { t: 700, status: 0x90, d1: 64, d2: 80 },       // klinkt over het einde → uit op einde
    { t: 1500, status: 0x80, d1: 64, d2: 0 },
    { t: 1600, status: 0x90, d1: 67, d2: 80 },      // na het einde → weg
    { t: 1700, status: 0x80, d1: 67, d2: 0 },
  ], { lengthMs: 2000 }));
  it('afkappen, chase, einde, verschoven tijden', () => {
    const c = cropMidi(f, 500, 1000);
    expect(c.lengthMs).toBe(500);
    expect(c.events.map((e) => [Math.round(e.t), e.status, e.d1])).toEqual([
      [0, 0xB0, 1], [0, 0x90, 60], [100, 0x80, 60], [200, 0x90, 64], [500, 0x80, 64],
    ]);
  });
  it('maatraster blijft op de muziek liggen; lus schuift mee en wordt afgekapt', () => {
    const c = cropMidi(f, 500, 1500, { tel1Ms: 0, barMs: 2000, loop: { start: 400, end: 900 } });
    expect(c.tel1Ms).toBe(1500);                     // volgende maatstreep ligt 1500 ms na het nieuwe begin
    expect(c.loop).toEqual({ start: 0, end: 400 });
    const onBar = cropMidi(f, 0, 1000, { tel1Ms: 0, barMs: 2000 });
    expect(onBar.tel1Ms).toBeUndefined();           // al op de maatstreep
  });
});
