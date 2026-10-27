import { describe, expect, it } from 'vitest';

import { checkPatch } from '../modular-mb/patchCheck';
import { resolveControls } from '../modular-mb/types';
import { RIG_TYPES, buildFreestyleRig, stemChanges } from './freestylePatch';
import { ACID_HOP, STEMS, STYLES, TRAP, euclidHits, type Change } from './style';

describe('freestyle-patch', () => {
  const rig = buildFreestyleRig(TRAP);

  it('bouwt elke stijl en doorstaat de patchcontrole', () => {
    for (const style of STYLES) {
      const r = buildFreestyleRig(style);
      const f = checkPatch(r.patch, r.project).filter((x) => x.kind !== 'signal-mismatch');
      expect(f.map((x) => `${x.kind}: ${x.message}`), style.id).toEqual([]);
      expect(r.project.activePatchId).toBe(r.patch.id);
      expect(r.patch.tempo).toBe(style.bpm);
      expect(r.patch.controlState[r.ids.clock]?.swing).toBe(style.swing);
      // Grids hangt aan de klokuitgang van de stijl (x2 = half-time).
      const cable = r.patch.connections.find((c) => c.to.moduleId === r.ids.grids && c.to.portId === 'clock');
      expect(cable?.from.portId, style.id).toBe(style.gridsClock);
      // De klank van de stijl staat in de patch.
      for (const ch of style.sound) expect(r.patch.controlState[r.ids[ch.module]]?.[ch.control], `${style.id}: ${ch.module}.${ch.control}`).toBe(ch.value);
    }
    expect(STYLES.map((s) => s.id)).toEqual(['trap', 'boombap', 'bounce', 'acidhop']);
  });

  it('bekabelt de bas per kick, of uit Euclid op de zestienden', () => {
    const cable = (r: ReturnType<typeof buildFreestyleRig>, toKey: keyof typeof r.ids, port: string): string | undefined => {
      const c = r.patch.connections.find((x) => x.to.moduleId === r.ids[toKey] && x.to.portId === port);
      if (!c) return undefined;
      const fromKey = (Object.keys(r.ids) as Array<keyof typeof r.ids>).find((k) => r.ids[k] === c.from.moduleId);
      return `${String(fromKey)}.${c.from.portId}`;
    };
    expect(cable(rig, 'bass', 'gate')).toBe('grids.bd');
    expect(cable(rig, 'bassSeq', 'clock')).toBe('grids.bd');
    expect(cable(rig, 'bassGate', 'clock')).toBeUndefined();
    const ah = buildFreestyleRig(ACID_HOP);
    expect(cable(ah, 'bassGate', 'clock')).toBe('clock.x4');
    expect(cable(ah, 'bassGate', 'reset')).toBe('clock.bar');
    expect(cable(ah, 'bassSeq', 'clock')).toBe('bassGate.any');
    expect(cable(ah, 'bassSeq', 'reset')).toBe('clock.bar');
    expect(cable(ah, 'bass', 'gate')).toBe('bassSeq.gate_out');
    expect(ah.patch.controlState[ah.ids.bassSeq]?.gate).toBe(0.95);
    expect(ah.patch.controlState[ah.ids.bassGate]?.extclock).toBe(1);
  });

  it('acid hop: de slagpatronen van Euclid passen op de baslijnen (Marks figuur 3-3-3-3-2-2)', () => {
    const expected: Record<string, number[]> = {
      INTRO: [0, 3, 6], VERSE: [0, 3, 6, 9, 12, 14], HOOK: [0, 3, 6, 9, 12], BREAK: [0, 3, 6, 9, 12, 14],
    };
    for (const s of ACID_HOP.sections) {
      const hits = euclidHits(s.changes);
      expect(hits, s.name).toEqual(expected[s.name]);
      // De sequencer: stap 0 is de kopie van de eerste noot, daarna één stap per slag.
      const length = s.changes.find((c) => c.module === 'bassSeq' && c.control === 'length')?.value;
      expect(length, s.name).toBe(hits.length + 1);
      const s1 = s.changes.find((c) => c.module === 'bassSeq' && c.control === 's1')?.value;
      const s2 = s.changes.find((c) => c.module === 'bassSeq' && c.control === 's2')?.value;
      expect(s1, s.name).toBe(s2);
    }
    // De andere stijlen zetten Euclid niet aan.
    for (const style of STYLES.filter((s) => s.bass === 'kick')) {
      for (const s of style.sections) expect(s.changes.some((c) => c.module === 'bassGate'), `${style.id}/${s.name}`).toBe(false);
    }
  });

  it('heeft voor elke logische module een echte module van het juiste type', () => {
    for (const [key, id] of Object.entries(rig.ids)) {
      const m = rig.project.modules.find((x) => x.id === id);
      expect(m?.typeId, key).toBe(RIG_TYPES[key as keyof typeof RIG_TYPES]);
    }
  });

  it('kan elke sectie- en stemwijziging van elke stijl op een bestaande knop zetten', () => {
    const okay = (ch: Change): boolean => {
      const m = rig.project.modules.find((x) => x.id === rig.ids[ch.module])!;
      const c = resolveControls(m, rig.project.moduleTypes).find((x) => x.id === ch.control);
      if (!c) return false;
      if (typeof ch.value === 'number' && c.min !== undefined && c.max !== undefined) return ch.value >= c.min && ch.value <= c.max;
      return true;
    };
    for (const style of STYLES) {
      expect(style.sections.length).toBeGreaterThanOrEqual(2);
      for (const s of style.sections) {
        for (const ch of s.changes) expect(okay(ch), `${style.id}/${s.name}: ${ch.module}.${ch.control}=${ch.value}`).toBe(true);
        for (const ch of stemChanges(s.stems)) expect(okay(ch), `${style.id}/${s.name}: ${ch.module}.${ch.control}`).toBe(true);
      }
      for (const ch of style.fill) expect(okay(ch), `${style.id}/fill: ${ch.module}.${ch.control}`).toBe(true);
      for (const ch of style.sound) expect(okay(ch), `${style.id}/sound: ${ch.module}.${ch.control}`).toBe(true);
    }
  });

  it('begint met de eerste sectie: intro zonder snare, de rest aan', () => {
    const level = (key: keyof typeof rig.ids): unknown => rig.patch.controlState[rig.ids[key]]?.level;
    expect(level('snare')).toBe(0);
    expect(level('kick')).toBeGreaterThan(0);
    expect(level('bass')).toBeGreaterThan(0);
    expect(level('hat')).toBeGreaterThan(0);
    expect(level('piano')).toBeGreaterThan(0);
    // De klok staat uit tot de pagina hem op het startmoment aanzet.
    expect(rig.patch.controlState[rig.ids.clock]?.run).toBe(0);
  });

  it('muten zet precies de Level-knoppen van die stem op nul', () => {
    const off = stemChanges({ kick: false, snare: true, hats: true, bass: false, motif: true });
    expect(off.filter((c) => c.value === 0).map((c) => c.module).sort()).toEqual(['bass', 'kick']);
    expect(stemChanges({ kick: true, snare: true, hats: true, bass: false, motif: true }).filter((c) => c.value === 0).map((c) => c.module)).toEqual(['bass']);
    expect(STEMS).toEqual(['kick', 'snare', 'hats', 'bass', 'motif']);
  });
});
