import { describe, expect, it } from 'vitest';

import { checkPatch } from '../modular-mb/patchCheck';
import { resolveControls } from '../modular-mb/types';
import { RIG_TYPES, buildFreestyleRig, stemChanges } from './freestylePatch';
import { STEMS, STYLES, TRAP, type Change } from './style';

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
    expect(STYLES.map((s) => s.id)).toEqual(['trap', 'boombap', 'bounce']);
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
    const off = stemChanges({ kick: false, snare: true, hats: true, motif: true });
    expect(off.filter((c) => c.value === 0).map((c) => c.module).sort()).toEqual(['bass', 'kick']);
    expect(STEMS).toHaveLength(4);
  });
});
