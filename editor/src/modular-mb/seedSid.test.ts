import { describe, it, expect } from 'vitest';
import { emptyModularProject } from './types';
import { seedInternals } from './seedModules';
import { expandPatchConnections } from './polyExpand';
import { validateOps } from './recipe/compile';
import { seedSidPolyPatch } from './seedSid';

describe('seedSidPolyPatch', () => {
  it('MidiIn → SID-cel 1, uitgewaaierd over drie cellen; LFO op PW+', () => {
    const p = seedSidPolyPatch(seedInternals(emptyModularProject()));
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const e = patch.connections.map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`);
    expect(e).toContain('tp_mmb_midiin.pitch>tp_mmb_sid.voct_1');
    expect(e).toContain('tp_mmb_lfo.out>tp_mmb_sid.pw_cv');
    validateOps(p, [], patch.id);
    const flat = expandPatchConnections(patch, p).map((c) => `${c.from.portId}>${c.to.portId}`);
    for (const k of [1, 2, 3]) {
      expect(flat.some((x) => x.endsWith(`>voct_${k}`))).toBe(true);
      expect(flat.some((x) => x.endsWith(`>gate_${k}`))).toBe(true);
    }
  });
});

describe('seedInternals na een bredere SID', () => {
  it('schuift de buurman op in plaats van eroverheen te liggen', () => {
    // Nabootsen: een project van vóór het filter (SID 12 HP, LFO er direct naast).
    const p0 = seedSidPolyPatch(seedInternals(emptyModularProject()));
    const rack = p0.racks.find((r) => r.id === p0.activeRackId)!;
    const sid = p0.modules.find((m) => m.typeId === 'tp_mmb_sid' && rack.slots.some((s) => s.moduleId === m.id))!;
    const sidSlot = rack.slots.find((s) => s.moduleId === sid.id)!;
    const lfoSlot = rack.slots.find((s) => p0.modules.find((m) => m.id === s.moduleId)!.typeId === 'tp_mmb_lfo')!;
    const old = {
      ...p0,
      modules: p0.modules.map((m) => (m.id === sid.id ? { ...m, visual: { ...m.visual, hpWidth: 12 } } : m)),
      racks: p0.racks.map((r) => (r.id !== rack.id ? r : {
        ...r, slots: r.slots.map((s) => (s.id === lfoSlot.id ? { ...s, hpOffset: sidSlot.hpOffset + 12 } : s)),
      })),
    };
    const up = seedInternals(old);
    const r = up.racks.find((x) => x.id === rack.id)!;
    const width = (id: string) => up.modules.find((m) => m.id === id)!.visual.hpWidth;
    const row = r.slots.filter((s) => s.row === sidSlot.row).sort((a, b) => a.hpOffset - b.hpOffset);
    for (let i = 1; i < row.length; i++)
      expect(row[i]!.hpOffset).toBeGreaterThanOrEqual(row[i - 1]!.hpOffset + width(row[i - 1]!.moduleId));
    expect(width(sid.id)).toBe(16);
    expect(r.slots.find((s) => s.id === lfoSlot.id)!.hpOffset).toBe(sidSlot.hpOffset + 16);
  });
});
