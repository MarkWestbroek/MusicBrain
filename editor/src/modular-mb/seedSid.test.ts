import { describe, it, expect } from 'vitest';
import { emptyModularProject } from './types';
import { seedInternals } from './seedModules';
import { expandPatchConnections } from './polyExpand';
import { validateOps } from './recipe/compile';
import { seedSid3Patch, seedSidPolyPatch } from './seedSid';

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
    // Nabootsen: een project van vóór het filter (SID 12 HP, LFO er direct naast);
    // de huidige SID is breder, dus de LFO moet opschuiven.
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
    const now = width(sid.id);
    expect(now).toBeGreaterThan(12);
    expect(r.slots.find((s) => s.id === lfoSlot.id)!.hpOffset).toBe(sidSlot.hpOffset + now);
  });
});

describe('seedSid3Patch', () => {
  it('mono: MidiIn → voct_1/gate_1, contract klopt', () => {
    const p = seedSid3Patch(seedInternals(emptyModularProject()), 1);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const e = patch.connections.map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`);
    expect(e).toContain('tp_mmb_midiin.pitch>tp_mmb_sid3.voct_1');
    expect(e).toContain('tp_mmb_sid3.out>tp_mmb_out.l');
    validateOps(p, [], patch.id);
  });
  it('×4: PolyGroup over vier modules, uitgewaaierd naar de mixer', () => {
    const p = seedSid3Patch(seedInternals(emptyModularProject()), 4);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    validateOps(p, [], patch.id);
    const flat = expandPatchConnections(patch, p);
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const sidsFed = new Set(flat.filter((c) => c.to.portId === 'voct_1' && typeOf(c.to.moduleId) === 'tp_mmb_sid3').map((c) => c.to.moduleId));
    expect(sidsFed.size).toBe(4);
    for (const k of [1, 2, 3, 4]) expect(flat.some((c) => c.to.portId === `in${k}`)).toBe(true);
  });
});

describe('seedSidPolyPatch met meer chips', () => {
  it('×12: vier chips, twaalf cellen uitgewaaierd, stereo naar OUT', () => {
    const p = seedSidPolyPatch(seedInternals(emptyModularProject()), 4);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    validateOps(p, [], patch.id);
    const flat = expandPatchConnections(patch, p).map((c) => `${c.from.portId}>${c.to.portId}`);
    for (let k = 1; k <= 12; k++) {
      expect(flat.some((x) => x.endsWith(`>voct_${k}`))).toBe(true);
      expect(flat.some((x) => x.endsWith(`>gate_${k}`))).toBe(true);
    }
    expect(flat).toContain('out_l>l');
    expect(flat).toContain('out_r>r');
    const sid = p.modules.find((m) => m.typeId === 'tp_mmb_sid' && patch.controlState[m.id])!;
    expect(patch.controlState[sid.id]).toMatchObject({ chips: 4 });
  });
});

describe('SID-seeds in een project met een oudere SID', () => {
  it('werken de SID-definitie eerst bij (12 cellen, out_l/out_r)', () => {
    const fresh = seedInternals(emptyModularProject());
    // Nabootsen: de SID zoals hij was vóór de chips (3 cellen, alleen `out`).
    const old = {
      ...fresh,
      moduleTypes: fresh.moduleTypes.map((t) => t.id !== 'tp_mmb_sid' ? t : {
        ...t,
        cellGroups: t.cellGroups!.map((g) => ({ ...g, count: 3 })),
        ports: t.ports.filter((pt) => !['out_l', 'out_r', 'sid_1', 'sid_2', 'sid_3', 'sid_4'].includes(pt.id)
          && !/^(voct|gate)_([4-9]|1[0-2])$/.test(pt.id)),
      }),
    };
    const p = seedSidPolyPatch(old, 4);
    const t = p.moduleTypes.find((x) => x.id === 'tp_mmb_sid')!;
    expect(t.cellGroups![0]!.count).toBe(12);
    expect(t.ports.some((pt) => pt.id === 'out_l')).toBe(true);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    validateOps(p, [], patch.id);
  });
});

describe('SID-presets', () => {
  it('gebruiken alleen knoppen die het paneel kent, binnen hun bereik', async () => {
    const { factoryModulePresets } = await import('./presets');
    const types = seedInternals(emptyModularProject()).moduleTypes;
    const sidPresets = factoryModulePresets.filter((x) => x.typeId === 'tp_mmb_sid' || x.typeId === 'tp_mmb_sid3');
    expect(sidPresets.length).toBeGreaterThanOrEqual(10);
    for (const pr of sidPresets) {
      const t = types.find((x) => x.id === pr.typeId)!;
      for (const [id, v] of Object.entries(pr.controlValues)) {
        const c = t.controls.find((x) => x.id === id) as { kind: string; min?: number; max?: number; positions?: string[] } | undefined;
        expect(c, `${pr.id}: ${id}`).toBeTruthy();
        if (c!.kind === 'knob') { expect(v as number).toBeGreaterThanOrEqual(c!.min!); expect(v as number).toBeLessThanOrEqual(c!.max!); }
        if (c!.kind === 'switch') expect(v as number).toBeLessThan(c!.positions!.length);
      }
    }
  });
});
