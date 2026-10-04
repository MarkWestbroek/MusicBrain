// Eén schrijfpad voor controls: poly-fan-out met patch-eigen herverdeling,
// en de store die meegaat. De Teensy-kant (controlPoke) is zonder verbinding
// een stille no-op en wordt hier niet getest.

import { describe, expect, it } from 'vitest';

import { setPatchControl, writePatchControl } from './setPatchControl';
import { getProject, setProject } from './store';
import { emptyModularProject, type ModularProject, type Patch } from './types';
import { seedInternals } from './seedModules';
import { seedEPianoPolyPatch } from './seedShowcase';
import { addBusFx } from './recipe/edits';

function project(): ModularProject {
  const base = emptyModularProject();
  const mods = ['vco_a', 'vco_b', 'vco_c', 'vcf'].map((id) => ({
    id, typeId: 'tp_test', internal: true, name: id, visual: { hpWidth: 4 },
  }));
  const patch: Patch = {
    id: 'patch_1', name: 'Test', voiceCount: 3, rackIds: ['rack_1'],
    connections: [], controlState: { vcf: { cutoff: 0.3 } }, envelopes: [], lfos: [],
  };
  return {
    ...base,
    moduleTypes: [{ id: 'tp_test', categoryId: 'cat', variant: 'Test', ports: [], controls: [
      { id: 'tune', kind: 'knob', label: 'Tune', min: -1, max: 1, defaultValue: 0 },
      { id: 'cutoff', kind: 'knob', label: 'Cutoff', min: 0, max: 1, defaultValue: 0.5 },
    ] }],
    modules: mods,
    racks: [{
      id: 'rack_1', name: 'Rack', rows: 1, hpPerRow: 84, kind: 'physical',
      slots: mods.map((m, i) => ({ id: `slot_${i}`, moduleId: m.id, row: 0, hpOffset: i * 4 })),
      polyGroups: [{ id: 'poly_1', label: 'VCO ×3', voiceCount: 3,
        members: ['vco_a', 'vco_b', 'vco_c'].map((moduleId) => ({ kind: 'module' as const, moduleId })) }],
    }],
    patches: [patch],
    activePatchId: 'patch_1', activeRackId: 'rack_1',
  };
}

const state = (p: ModularProject) => p.patches[0]!.controlState;

describe('writePatchControl', () => {
  it('schrijft een edit op een groepslid naar alle stemmen van de groep', () => {
    const { project: p, targets } = writePatchControl(project(), 'patch_1', 'vco_b', 'tune', 0.25);
    expect(targets.sort()).toEqual(['vco_a', 'vco_b', 'vco_c']);
    for (const id of targets) expect(state(p)[id]?.tune).toBe(0.25);
  });

  it('volgt de patch-eigen herverdeling (polyOverrides)', () => {
    const p0 = project();
    p0.patches[0]!.polyOverrides = [{ rackPolyGroupId: 'poly_1', partition: [
      { memberIndices: [0], voiceCount: 1 }, { memberIndices: [1, 2], voiceCount: 2 },
    ] }];
    const { targets } = writePatchControl(p0, 'patch_1', 'vco_c', 'tune', 0.5);
    expect(targets.sort()).toEqual(['vco_b', 'vco_c']);
  });

  it('raakt buiten een groep alleen de module zelf, en laat andere controls staan', () => {
    const { project: p, targets } = writePatchControl(project(), 'patch_1', 'vcf', 'tune', -0.5);
    expect(targets).toEqual(['vcf']);
    expect(state(p).vcf).toEqual({ cutoff: 0.3, tune: -0.5 });
  });

  it('doet niets bij een onbekende patch', () => {
    const p0 = project();
    const { project: p, targets } = writePatchControl(p0, 'patch_x', 'vcf', 'tune', 1);
    expect(p).toBe(p0);
    expect(targets).toEqual([]);
  });
});

describe('setPatchControl', () => {
  it('werkt de store bij via hetzelfde recept', () => {
    setProject(project());
    const targets = setPatchControl('patch_1', 'vco_a', 'tune', 0.75);
    expect(targets).toHaveLength(3);
    expect(state(getProject()).vco_c?.tune).toBe(0.75);
  });

  it('met twins: een stereopaar (DRIVE L/R) krijgt dezelfde waarde; zonder twins alleen de ene', () => {
    const p0 = seedEPianoPolyPatch(seedInternals(emptyModularProject()));
    const p = addBusFx(p0, p0.activePatchId!, 'drive').project;   // DRIVE als L/R-paar op de bus
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const drives = p.modules.filter((m) => m.typeId === 'tp_mmb_drive' && patch.connections.some((c) => c.from.moduleId === m.id || c.to.moduleId === m.id));
    expect(drives.length).toBe(2);
    const alone = writePatchControl(p, patch.id, drives[0]!.id, 'drive', 0.42);
    expect(alone.targets).toEqual([drives[0]!.id]);
    const both = writePatchControl(p, patch.id, drives[0]!.id, 'drive', 0.42, { twins: true });
    expect(both.targets.sort()).toEqual(drives.map((d) => d.id).sort());
    expect(both.project.patches.find((x) => x.id === patch.id)!.controlState[drives[1]!.id]?.drive).toBe(0.42);
  });
});
