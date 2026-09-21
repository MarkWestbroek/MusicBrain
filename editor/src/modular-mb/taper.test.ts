// De som tussen gebaar en waarde. Drie dingen moeten kloppen, want ze zitten
// op drie plekken (knop, Roto-bridge, firmware): de curves zelf, de terugweg,
// en dat een onmogelijke log netjes lineair wordt in plaats van NaN.

import { describe, expect, it } from 'vitest';

import {
  derivedTaper, dragTravelPx, effectiveTaper, fromTaper, toTaper, taperOctaves,
  wheelStep, KNOB_TRAVEL_PX, PX_PER_OCTAVE,
} from './taper';

const CUTOFF = { min: 20, max: 18000, taper: 'log' as const };
const LEVEL  = { min: 0, max: 1, taper: 'exp' as const };
const LIN    = { min: 0, max: 10 };

describe('taper', () => {
  it('log verdeelt in verhoudingen, niet in Hz', () => {
    // Halverwege de knop staat de meetkundige middelste frequentie, niet 9010.
    expect(fromTaper(0.5, CUTOFF)).toBeCloseTo(Math.sqrt(20 * 18000), 3);
    // Elke tiende van de slag is dezelfde factor.
    const a = fromTaper(0.3, CUTOFF) / fromTaper(0.2, CUTOFF);
    const b = fromTaper(0.9, CUTOFF) / fromTaper(0.8, CUTOFF);
    expect(a).toBeCloseTo(b, 6);
  });

  it('heen en terug komt op dezelfde waarde uit', () => {
    for (const r of [CUTOFF, LEVEL, LIN]) {
      for (const t of [0, 0.17, 0.5, 0.83, 1]) {
        expect(toTaper(fromTaper(t, r), r)).toBeCloseTo(t, 6);
      }
    }
  });

  it('klemt buiten het bereik in plaats van door te schieten', () => {
    expect(fromTaper(-3, CUTOFF)).toBe(20);
    expect(fromTaper(9, CUTOFF)).toBe(18000);
    expect(toTaper(5, CUTOFF)).toBe(0);          // onder min
    expect(toTaper(1e6, CUTOFF)).toBe(1);
    expect(toTaper(0, CUTOFF)).toBe(0);          // log(0) mag geen NaN geven
    expect(toTaper(-1, CUTOFF)).toBe(0);
  });

  it('valt terug op lineair waar log niet kan', () => {
    // Een bereik dat nul raakt of onder nul duikt heeft geen logaritme.
    expect(effectiveTaper({ min: 0, max: 1, taper: 'log' })).toBe('lin');
    expect(effectiveTaper({ min: -100, max: 100, taper: 'log' })).toBe('lin');
    expect(fromTaper(0.5, { min: 0, max: 1, taper: 'log' })).toBe(0.5);
  });

  it('exp is de audio-taper: halverwege staat −12 dB', () => {
    expect(fromTaper(0.5, LEVEL)).toBeCloseTo(0.25, 9);
    expect(20 * Math.log10(fromTaper(0.5, LEVEL))).toBeCloseTo(-12.04, 2);
    expect(fromTaper(0, LEVEL)).toBe(0);         // knop dicht = stil
    expect(fromTaper(1, LEVEL)).toBe(1);
  });

  it('geeft een log-knop een sleepweg per octaaf, de rest zoals het was', () => {
    expect(taperOctaves(CUTOFF)).toBeCloseTo(Math.log2(900), 6);
    expect(dragTravelPx(CUTOFF)).toBe(Math.round(PX_PER_OCTAVE * Math.log2(900)));
    expect(dragTravelPx(LIN)).toBe(KNOB_TRAVEL_PX);
    expect(dragTravelPx(LEVEL)).toBe(KNOB_TRAVEL_PX);
    // Kort bereik krijgt geen onnodig lange weg, lang bereik geen eindeloze.
    expect(dragTravelPx({ min: 100, max: 200, taper: 'log' })).toBe(240);
    expect(dragTravelPx({ min: 0.001, max: 20000, taper: 'log' })).toBe(720);
  });

  it('leidt de curve af als de control er geen draagt', () => {
    // Een project bewaart zijn eigen kopie van de moduletypes. Een patch van
    // vóór de tapers draagt dus geen `taper`, en moet tóch log doen — anders
    // staat de cutoffknop na één pixel op 200 Hz en is een wielklik 60 Hz.
    const oud = { id: 'cutoff', unit: 'Hz', min: 20, max: 18000 };
    expect(derivedTaper(oud)).toBe('log');
    expect(effectiveTaper(oud)).toBe('log');
    expect(fromTaper(wheelStep(oud), oud) - 20).toBeLessThan(2);   // was 59,93 Hz
    expect(dragTravelPx(oud)).toBeGreaterThan(400);
    expect(derivedTaper({ id: 'level', min: 0, max: 1 })).toBe('exp');
    // Geen eenheid of een bereik dat nul raakt: gewoon lineair.
    expect(derivedTaper({ id: 'q', min: 0, max: 1 })).toBeUndefined();
    expect(derivedTaper({ id: 'attack', unit: 'ms', min: 0, max: 2000 })).toBeUndefined();
    expect(derivedTaper({ id: 'fine', unit: 'ct', min: -100, max: 100 })).toBeUndefined();
  });

  it('stapt met het wiel een halve toon op een log-knop', () => {
    const t = toTaper(440, CUTOFF);
    const klik = fromTaper(t + wheelStep(CUTOFF), CUTOFF);
    expect(12 * Math.log2(klik / 440)).toBeCloseTo(1, 6);
    // Twaalf klikjes is een octaaf, waar je ook staat.
    expect(fromTaper(t + 12 * wheelStep(CUTOFF), CUTOFF)).toBeCloseTo(880, 6);
    // Shift = een kwart halve toon.
    const fijn = fromTaper(t + wheelStep(CUTOFF, true), CUTOFF);
    expect(12 * Math.log2(fijn / 440)).toBeCloseTo(0.25, 6);
    // Zonder log: honderd klikjes over de slag, zoals gebruikelijk.
    expect(wheelStep(LIN)).toBeCloseTo(0.01, 9);
  });

  it('legt de CC-stappen vast die de firmware moet evenaren', () => {
    // Deze drie getallen zijn het contract met `MidiMap::scale` op de Teensy
    // (en met `ccToValue` in surfaceBridge): dezelfde binding moet daar
    // dezelfde waarde opleveren, anders voelt een Roto-knop op hardware
    // anders dan in de simulator.
    expect(fromTaper(0 / 127, CUTOFF)).toBeCloseTo(20, 6);
    expect(fromTaper(64 / 127, CUTOFF)).toBeCloseTo(616.29, 2);
    expect(fromTaper(127 / 127, CUTOFF)).toBeCloseTo(18000, 6);
    // Eén CC-stap bij 300 Hz: lineair was dat 6,5 halve toon.
    const t = toTaper(300, CUTOFF);
    expect(12 * Math.log2(fromTaper(t + 1 / 127, CUTOFF) / 300)).toBeLessThan(1);
  });

  it('houdt de pixelstap onder de hoorbare grens waar het om begon', () => {
    // De klacht: bij 300 Hz sprong de lineaire knop zeven halve tonen per
    // pixel (150 Hz). Met taper + sleepweg moet dat een kwart halve toon zijn.
    const travel = dragTravelPx(CUTOFF);
    const t = toTaper(300, CUTOFF);
    const halveTonen = 12 * Math.log2(fromTaper(t + 1 / travel, CUTOFF) / 300);
    expect(halveTonen).toBeLessThan(0.3);
    // En met shift (vier keer zo lange weg) zit je onder de 10 cent.
    const fijn = 12 * Math.log2(fromTaper(t + 1 / (travel * 4), CUTOFF) / 300);
    expect(fijn * 100).toBeLessThan(10);
  });
});
