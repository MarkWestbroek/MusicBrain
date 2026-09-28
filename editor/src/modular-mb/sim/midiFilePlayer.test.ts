import { describe, it, expect } from 'vitest';
import { parseSmf, MidiFileSource, toMidiEvent, SmfError, noteSpans, controllerSeries } from './midiFilePlayer';
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

describe('seek, lusvenster en pianorol', () => {
  // 120 BPM (encoder), noten op 0/500/1000/1500 ms, elk 400 ms lang; CC1 op 700 ms, bend op 900 ms.
  const file = () => parseSmf(encodeSmf([
    { t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 400, status: 0x80, d1: 60, d2: 0 },
    { t: 500, status: 0x90, d1: 62, d2: 90 }, { t: 900, status: 0x80, d1: 62, d2: 0 },
    { t: 700, status: 0xB0, d1: 1, d2: 99 }, { t: 900, status: 0xE0, d1: 0, d2: 80 },
    { t: 1000, status: 0x90, d1: 64, d2: 80 }, { t: 1400, status: 0x80, d1: 64, d2: 0 },
    { t: 1500, status: 0x90, d1: 65, d2: 70 }, { t: 1900, status: 0x80, d1: 65, d2: 0 },
  ], { lengthMs: 2000 }));

  it('noteSpans en tempo', () => {
    const f = file();
    expect(Math.round(f.bpm)).toBe(120);
    expect(f.beatsPerBar).toBe(4);
    expect(noteSpans(f).map((n) => [n.note, Math.round(n.start), Math.round(n.end)])).toEqual([[60, 0, 400], [62, 500, 900], [64, 1000, 1400], [65, 1500, 1900]]);
  });

  it('seek tijdens spelen: noten los, controllers nagezonden, verder vanaf daar', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    const got: string[] = [];
    src.subscribe((e: MidiEvent) => got.push(e.kind === 'cc' ? `cc${e.controller}=${e.value}` : e.kind === 'pitchBend' ? `bend${e.value}` : `${e.kind}${'note' in e ? e.note : ''}`));
    src.load(file(), 'x.mid');
    src.start();                                  // noot 60 aan
    now = 100; src.seek(1000);                    // 60 los, cc1 en bend nagezonden
    expect(got).toEqual(['noteOn60', 'noteOff60', 'cc1=99', `bend${80 << 7}`]);
    now = 101; src.pump();                        // t=1001: noot 64 aan
    expect(got.at(-1)).toBe('noteOn64');
    expect(Math.round(src.position())).toBe(1001);
    src.stop();
  });

  it('pauze houdt de plek vast, rewind gaat naar het begin van het venster', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    src.load(file(), 'x.mid');
    src.start();
    now = 1200; src.pump();
    src.pause();
    expect(src.state()).toMatchObject({ playing: false, posMs: 1200 });
    now = 5000;
    src.start();                                     // verder vanaf 1200
    expect(Math.round(src.position())).toBe(1200);
    src.setRegion({ start: 500, end: 1500 });
    src.rewind();
    expect(src.state()).toMatchObject({ playing: false, posMs: 500 });
  });

  it('seek in stilstand zet het startpunt', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    src.load(file(), 'x.mid');
    src.seek(1500);
    expect(src.state().posMs).toBe(1500);
    const got: string[] = [];
    src.subscribe((e: MidiEvent) => got.push(`${e.kind}${'note' in e ? e.note : ''}`));
    src.start();
    expect(got).toContain('noteOn65');
    expect(got).not.toContain('noteOn60');
    src.stop();
  });

  it('lusvenster: speelt 500–1000 steeds opnieuw, noot op het eind hoort bij de volgende ronde', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    const got: string[] = [];
    src.subscribe((e: MidiEvent) => { if (e.kind === 'noteOn' || e.kind === 'noteOff') got.push(`${now}:${e.kind}${e.note}`); });
    src.load(file(), 'x.mid');
    src.setRegion({ start: 1000, end: 500 });      // omgedraaid mag
    expect(src.state().region).toEqual({ start: 500, end: 1000 });
    src.seek(500);
    src.start();                                   // t=500: noot 62 aan
    now = 400; src.pump();                         // t=900: 62 uit
    now = 500; src.pump();                         // t=1000 = einde: 64 NIET, terug naar 500
    now = 501; src.pump();                         // opnieuw 62 aan (t=500 ligt op het begin: al bij de sprong?)
    expect(got.filter((x) => x.endsWith('noteOn64'))).toEqual([]);
    expect(got.filter((x) => x.endsWith('noteOn62')).length).toBe(2);
    src.setRegion(null);
    expect(src.state().region).toBeNull();
    src.stop();
  });
});

describe('snelheid en controller-laag', () => {
  it('halve snelheid: plek in het bestand loopt half zo snel, en blijft staan bij wisselen', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    src.load(parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 1 }, { t: 3000, status: 0x80, d1: 60, d2: 0 }], { lengthMs: 4000 })), 'x.mid');
    src.start();
    now = 1000; expect(Math.round(src.position())).toBe(1000);
    src.setSpeed(0.5);
    expect(Math.round(src.position())).toBe(1000);
    now = 2000; expect(Math.round(src.position())).toBe(1500);
    src.setSpeed(2);
    now = 2500; expect(Math.round(src.position())).toBe(2500);
    src.stop();
  });
  it('controllerSeries: mod, aftertouch, bend en overige CC apart', () => {
    const f = parseSmf(encodeSmf([
      { t: 0, status: 0xB0, d1: 1, d2: 127 }, { t: 100, status: 0xD0, d1: 64, d2: 0 },
      { t: 200, status: 0xE0, d1: 0, d2: 64 }, { t: 300, status: 0xB0, d1: 74, d2: 0 },
      { t: 400, status: 0xB0, d1: 123, d2: 0 },
    ], { lengthMs: 500 }));
    const c = controllerSeries(f);
    expect(c.map((x) => x.label)).toEqual(['Modwheel', 'Aftertouch', 'Pitch bend', 'CC 74']);
    expect(c[0]!.points[0]!.v).toBe(1);
    expect(c[2]!.points[0]!.v).toBeCloseTo(0.5, 2);
  });
});
