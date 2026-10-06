// Het lint (Trautonium-draad) als invoer: rekenlaag en vingerlogica.

import { describe, expect, it } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals, seedSoloVoicePatch } from '../seedModules';
import {
  RIBBON_H, RIBBON_SEMI, RibbonPlayer, bendFor, needsNewAnchor, pitchAt, pressureAt, ribbonReady, ribbonWidth,
} from './ribbonLayout';
import { ribbonMidiIn } from './ribbonSetup';

const xOf = (semis: number): number => (semis + 0.5) * RIBBON_SEMI;   // midden van vak `semis`

describe('lint: rekenlaag', () => {
  it('plek → toonhoogte, traploos of aangetrokken', () => {
    expect(pitchAt(xOf(0), 60, 2)).toBeCloseTo(60, 6);
    expect(pitchAt(xOf(7), 60, 2)).toBeCloseTo(67, 6);
    expect(pitchAt(xOf(7) + RIBBON_SEMI * 0.3, 60, 2)).toBeCloseTo(67.3, 6);       // tussen de halve tonen
    expect(pitchAt(xOf(7) + RIBBON_SEMI * 0.3, 60, 2, 1)).toBeCloseTo(67, 6);      // aantrekken 1 = vast
    expect(pitchAt(xOf(7) + RIBBON_SEMI * 0.3, 60, 2, 0.5)).toBeCloseTo(67.15, 6);
    expect(pitchAt(-50, 60, 2)).toBe(60);                                          // buiten het lint: de rand
    expect(pitchAt(ribbonWidth(2) + 50, 60, 2)).toBe(84);
  });
  it('druk: laag op het lint is hard; echte druk van een pen gaat voor', () => {
    expect(pressureAt(0, RIBBON_H)).toBe(0);
    expect(pressureAt(RIBBON_H, RIBBON_H)).toBe(127);
    expect(pressureAt(RIBBON_H, RIBBON_H, 0.5)).toBe(127);       // 0,5 = muis/touch zonder druk: hoogte telt
    expect(pressureAt(RIBBON_H, RIBBON_H, 0.2)).toBe(25);        // pen
  });
  it('bend t.o.v. het anker, en wanneer het anker mee moet', () => {
    expect(bendFor(60, 60, 24)).toBe(8192);
    expect(bendFor(72, 60, 24)).toBe(12288);
    expect(bendFor(48, 60, 24)).toBe(4096);
    expect(needsNewAnchor(83, 60, 24)).toBe(false);
    expect(needsNewAnchor(83.6, 60, 24)).toBe(true);
  });
  it('MIDI-IN klaar: B→P aan en hetzelfde bereik', () => {
    expect(ribbonReady(1, 24, 24)).toBe(true);
    expect(ribbonReady(0, 24, 24)).toBe(false);
    expect(ribbonReady(1, 2, 24)).toBe(false);
    expect(ribbonReady(true, 12, 12)).toBe(true);
  });
});

describe('lint: vingers → MIDI', () => {
  type Ev = [string, ...number[]];
  const make = (bendRange = 24, snap = 0): { p: RibbonPlayer; ev: Ev[] } => {
    const ev: Ev[] = [];
    const cb = {
      onNoteOn: (m: number, v: number) => ev.push(['on', m, Math.round(v * 100) / 100]),
      onNoteOff: (m: number) => ev.push(['off', m]),
      onBend: (b: number) => ev.push(['bend', b]),
      onAftertouch: (m: number, v: number) => ev.push(['at', m, v]),
    };
    return { p: new RibbonPlayer(() => cb, () => ({ startMidi: 48, octaves: 4, h: RIBBON_H, bendRange, snap })), ev };
  };

  it('aanraken = bend vóór de ankernoot; glijden = alleen bend; loslaten = noot uit en bend terug', () => {
    const { p, ev } = make();
    p.down(1, xOf(12) + RIBBON_SEMI * 0.25, RIBBON_H * 0.5);     // C4 + een kwart halve toon
    expect(ev[0]![0]).toBe('bend');
    expect(ev[1]).toEqual(['on', 60, 0.5]);
    ev.length = 0;
    p.move(1, xOf(17), RIBBON_H * 0.5);                          // naar F4: binnen ±24
    expect(ev.filter((e) => e[0] === 'on' || e[0] === 'off')).toEqual([]);
    expect(ev.at(-1)).toEqual(['bend', bendFor(65, 60, 24)]);
    ev.length = 0;
    p.up(1);
    expect(ev.map((e) => e[0])).toEqual(['at', 'off', 'bend']);
    expect(ev.at(-1)).toEqual(['bend', 8192]);
  });

  it('voorbij het bereik schuift het anker legato mee: eerst de nieuwe noot, dan de oude los', () => {
    const { p, ev } = make(12);
    p.down(1, xOf(0), RIBBON_H * 0.6);                           // C3
    ev.length = 0;
    p.move(1, xOf(14), RIBBON_H * 0.6);                          // D4: 14 > 12 − 0,5
    const notes = ev.filter((e) => e[0] === 'on' || e[0] === 'off');
    expect(notes).toEqual([['on', 62, 0.6], ['off', 48]]);
    // De bend gaat vóór de nieuwe noot, zodat die meteen op de goede hoogte begint.
    const iOn = ev.findIndex((e) => e[0] === 'on');
    expect(ev[iOn - 1]).toEqual(['bend', bendFor(62, 62, 12)]);
  });

  it('druk volgt de hoogte als aftertouch op de ankernoot', () => {
    const { p, ev } = make();
    p.down(1, xOf(12), RIBBON_H * 0.2);
    ev.length = 0;
    p.move(1, xOf(12), RIBBON_H * 0.9);
    expect(ev).toContainEqual(['at', 60, 114]);
  });

  it('tweede vinger neemt het over, en bij opstaan de eerste weer — één noot tegelijk', () => {
    const { p, ev } = make();
    p.down(1, xOf(12), RIBBON_H * 0.5);
    p.down(2, xOf(19), RIBBON_H * 0.5);                          // G4: binnen het bereik → alleen bend
    expect(ev.filter((e) => e[0] === 'on')).toEqual([['on', 60, 0.5]]);
    expect(ev.at(-1)).toEqual(['bend', bendFor(67, 60, 24)]);
    p.up(2);
    expect(ev.at(-1)).toEqual(['bend', 8192]);                   // terug op de eerste vinger (C4)
    expect(ev.filter((e) => e[0] === 'off')).toEqual([]);
    p.up(1);
    expect(ev.filter((e) => e[0] === 'off')).toEqual([['off', 60]]);
  });

  it('release laat alles los (wisselen naar het klavier, paniek)', () => {
    const { p, ev } = make();
    p.down(1, xOf(5), RIBBON_H * 0.5);
    p.down(2, xOf(9), RIBBON_H * 0.5);
    p.release();
    expect(ev.filter((e) => e[0] === 'off')).toEqual([['off', 53]]);
    expect(p.marker()).toBeNull();
  });
});

describe('lint: MIDI-IN van de patch', () => {
  it('een Solo-patch staat niet klaar; klaarzetten zet B→P en het bereik', () => {
    const project = seedSoloVoicePatch(seedInternals(emptyModularProject()), 'tp_mmb_vco', 'VCO', 'out', 'out', { level: 0.5 });
    const patch = project.patches.find((x) => x.id === project.activePatchId)!;
    const r = ribbonMidiIn(patch, project);
    expect(r.present).toBe(true);
    expect(r.ready(24)).toBe(false);
    const midi = project.modules.find((m) => m.typeId === 'tp_mmb_midiin' && patch.connections.some((c) => c.from.moduleId === m.id))!;
    const set = { ...patch, controlState: { ...patch.controlState, [midi.id]: { ...(patch.controlState[midi.id] ?? {}), bendPitch: 1, bendRange: 24 } } };
    expect(ribbonMidiIn(set, project).ready(24)).toBe(true);
    expect(ribbonMidiIn(set, project).ready(12)).toBe(false);
  });
  it('zonder patch of MIDI-IN: geen melding', () => {
    expect(ribbonMidiIn(undefined, emptyModularProject()).present).toBe(false);
  });
});
