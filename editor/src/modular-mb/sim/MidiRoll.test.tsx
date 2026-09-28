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
    expect(html).toContain('0:01.5 / 0:04.0');
    expect(html).toContain('aria-label="Tempo in BPM"');
    expect(html).toContain('lus 0:01.0–0:03.0');
    expect(html).toContain('aria-label="Maat terug"');
    expect(html).not.toContain('venster weg');
    expect(html).toContain('take.mid');
  });
});

describe('barStep en barEvery', () => {
  it('maat terug/verder zoals in een DAW', async () => {
    const { barStep, barEvery } = await import('./MidiRoll');
    expect(barStep(0, 2000, 1, 10_000)).toBe(2000);
    expect(barStep(2000, 2000, 1, 10_000)).toBe(4000);
    expect(barStep(3000, 2000, -1, 10_000)).toBe(2000);   // naar begin huidige maat
    expect(barStep(2100, 2000, -1, 10_000)).toBe(0);      // net in de maat → vorige
    expect(barStep(9500, 2000, 1, 10_000)).toBe(10_000);  // niet voorbij het einde
    expect(barEvery(30, 28)).toBe(1);
    expect(barEvery(5, 28)).toBe(8);
  });
});

describe('rulerHit', () => {
  it('randen, binnen, buiten; smal venster = dichtstbijzijnde rand', async () => {
    const { rulerHit } = await import('./MidiRoll');
    const r = { x0: 100, x1: 200 };
    expect(rulerHit(50, r)).toBe('outside');
    expect(rulerHit(95, r)).toBe('left');
    expect(rulerHit(106, r)).toBe('left');
    expect(rulerHit(150, r)).toBe('inside');
    expect(rulerHit(205, r)).toBe('right');
    expect(rulerHit(250, r)).toBe('outside');
    expect(rulerHit(104, { x0: 100, x1: 106 })).toBe('right');
    expect(rulerHit(150, null)).toBe('outside');
  });
});

describe('tempo en raster', () => {
  it('tapTempo en barStep met verschoven tel 1', async () => {
    const { tapTempo, barStep } = await import('./MidiRoll');
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 625, 1250])).toBe(96);
    expect(barStep(0, 2000, 1, 10_000, 300)).toBe(300);        // eerst naar tel 1
    expect(barStep(300, 2000, 1, 10_000, 300)).toBe(2300);
    expect(barStep(2400, 2000, -1, 10_000, 300)).toBe(300);
  });
  it('speler: eigen raster, en terug naar het bestand', () => {
    const src = new MidiFileSource(() => 0, 1_000_000);
    src.load(parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 1 }], { lengthMs: 1000 })), 'x.mid');
    expect(src.grid()).toEqual({ bpm: 120, offsetMs: 0, beatsPerBar: 4 });
    src.setGrid({ bpm: 96 }); src.setGrid({ offsetMs: 250 });
    expect(src.grid()).toEqual({ bpm: 96, offsetMs: 250, beatsPerBar: 4 });
    expect(src.gridIsCustom()).toBe(true);
    src.setGrid(null);
    expect(src.grid().bpm).toBe(120);
  });
});
