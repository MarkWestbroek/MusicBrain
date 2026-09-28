import { describe, it, expect } from 'vitest';
import { parseSmf, MidiFileSource, toMidiEvent, SmfError } from './midiFilePlayer';
import { encodeSmf } from './midiRecorder';
import type { MidiEvent } from './MidiSource';

/** Handgemaakte SMF type 1: spoor 0 tempo 60 BPM (1 s per kwart), spoor 1 noten met running status. */
function type1(): Uint8Array {
  const trk = (d: number[]) => [0x4D, 0x54, 0x72, 0x6B, 0, 0, (d.length >> 8) & 0xFF, d.length & 0xFF, ...d];
  const t0 = [0x00, 0xFF, 0x51, 0x03, 0x0F, 0x42, 0x40, 0x00, 0xFF, 0x2F, 0x00];
  // 0: note on C4; 96 ticks (=1 kwart bij ppq 96): note on E4 (running status); 96: beide uit (vel 0), einde
  const t1 = [0x00, 0x90, 60, 100, 0x60, 64, 90, 0x60, 60, 0, 0x00, 64, 0, 0x00, 0xFF, 0x2F, 0x00];
  return new Uint8Array([0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0, 96, ...trk(t0), ...trk(t1)]);
}

describe('parseSmf', () => {
  it('type 1 met tempokaart en running status', () => {
    const f = parseSmf(type1());
    expect(f.tracks).toBe(2);
    expect(f.events.map((e) => [Math.round(e.t), ...e.bytes])).toEqual([
      [0, 0x90, 60, 100], [1000, 0x90, 64, 90], [2000, 0x90, 60, 0], [2000, 0x90, 64, 0],
    ]);
    expect(f.durationMs).toBeCloseTo(2000);
  });
  it('rondreis met de opname-encoder (120 BPM, 480 PPQ)', () => {
    const f = parseSmf(encodeSmf([
      { t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 750, status: 0xD0, d1: 64, d2: 0 }, { t: 1500, status: 0x80, d1: 60, d2: 0 },
    ], { lengthMs: 2000, name: 'koper' }));
    expect(f.name).toBe('koper');
    expect(f.events.map((e) => Math.round(e.t))).toEqual([0, 750, 1500]);
    expect(f.events[1]!.bytes).toEqual([0xD0, 64]);
    expect(Math.round(f.durationMs)).toBe(2000);
  });
  it('geen MIDI → SmfError', () => {
    expect(() => parseSmf(new Uint8Array([1, 2, 3]))).toThrowError(SmfError);
  });
});

describe('MidiFileSource', () => {
  it('speelt op tijd, loopt, en laat hangende noten los bij stop', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);   // timer doet niets; wij pompen zelf
    const got: string[] = [];
    src.subscribe((e: MidiEvent) => got.push(`${now}:${e.kind}${'note' in e ? e.note : ''}`));
    src.load(parseSmf(type1()), 'test.mid');
    src.start();                                     // pompt t=0
    now = 999; src.pump();
    now = 1000; src.pump();
    now = 2000; src.pump();                          // einde → lus: t0 += 2000
    now = 2001; src.pump();                          // begin opnieuw: C4 aan
    expect(got).toEqual(['0:noteOn60', '1000:noteOn64', '2000:noteOff60', '2000:noteOff64', '2001:noteOn60']);
    src.stop();
    expect(got.at(-1)).toBe('2001:noteOff60');
    expect(src.state().playing).toBe(false);
  });
  it('zonder lus stopt hij aan het eind', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    src.setLoop(false);
    src.load(parseSmf(type1()), 't.mid');
    src.start(); now = 2500; src.pump();
    expect(src.state().playing).toBe(false);
  });
  it('toMidiEvent', () => {
    expect(toMidiEvent([0xE0, 0, 64])).toEqual({ kind: 'pitchBend', value: 8192 });
    expect(toMidiEvent([0xF8])).toBeNull();
  });
});
