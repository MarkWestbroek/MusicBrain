import { describe, it, expect } from 'vitest';
import { describeMidi, formatBytes, noteName, MidiMonitor } from './midiMonitor';

describe('describeMidi', () => {
  it('kanaalberichten', () => {
    expect(describeMidi([0x90, 60, 100])).toMatchObject({ type: 'Note On', channel: 1, text: 'C4 vel 100' });
    expect(describeMidi([0x91, 60, 0]).type).toBe('Note Off');
    expect(describeMidi([0xD0, 93])).toMatchObject({ type: 'Aftertouch', text: 'druk 93' });
    expect(describeMidi([0xA2, 64, 10])).toMatchObject({ type: 'Poly AT', channel: 3, text: 'E4 druk 10' });
    expect(describeMidi([0xB0, 1, 64]).text).toBe('1 Modwheel = 64');
    expect(describeMidi([0xE0, 0, 64]).text).toBe('0');
    expect(describeMidi([0xE0, 0x7F, 0x7F]).text).toBe('+8191');
    expect(describeMidi([0xC0, 0]).text).toBe('1 (0)');
  });
  it('systeem en realtime', () => {
    expect(describeMidi([0xF8])).toMatchObject({ type: 'Clock', channel: null, realtime: true });
    expect(describeMidi([0xFE]).realtime).toBe(true);
    expect(describeMidi([0xFA]).realtime).toBe(false);
  });
  it('noteName en formatBytes', () => {
    expect(noteName(21)).toBe('A0');
    expect(formatBytes([0x90, 60, 100], true)).toBe('90 3C 64');
    expect(formatBytes([0x90, 60, 100], false)).toBe('144  60 100');
  });
});

describe('MidiMonitor', () => {
  it('patch-stroom houdt activiteit bij; ringbuffer; engine-tap', () => {
    const m = new MidiMonitor();
    let fn: ((s: number, a: number, b: number) => void) | null = null;
    m.attachEngine({ onMidi: (f) => { fn = f; return () => {}; } });
    fn!(0x90, 60, 100);
    fn!(0xD0, 80, 0);
    expect(m.list().map((e) => e.bytes)).toEqual([[0x90, 60, 100], [0xD0, 80]]);
    expect(m.activity.held.has(60)).toBe(true);
    expect(m.activity.press?.value).toBe(80);
    fn!(0x80, 60, 0);
    expect(m.activity.held.size).toBe(0);
    m.push('in', 'KeyStep', [0xF8]);
    expect(m.activity.noteOff?.note).toBe(60);
    for (let i = 0; i < 2500; i++) m.push('in', 'x', [0xF8]);
    expect(m.list().length).toBe(2000);
    m.clear();
    expect(m.list().length).toBe(0);
  });
});
