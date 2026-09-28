import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MidiFileUi } from './MidiFileUi';
import { MidiFileSource, parseSmf } from './midiFilePlayer';
import { encodeSmf } from './midiRecorder';

describe('MidiFileUi met pianorol', () => {
  it('rendert tijd, tempo, lusvenster en de canvas', () => {
    const src = new MidiFileSource(() => 0, 1_000_000);
    src.load(parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 1000, status: 0x80, d1: 60, d2: 0 }], { lengthMs: 4000 })), 'take.mid');
    src.setRegion({ start: 1000, end: 3000 });
    src.seek(1500);
    const html = renderToStaticMarkup(createElement(MidiFileUi, { source: src, running: false }));
    expect(html).toContain('<canvas');
    expect(html).toContain('0:01.5 / 0:04.0 · 120 BPM');
    expect(html).toContain('lus 0:01.0–0:03.0');
    expect(html).toContain('take.mid');
  });
});
