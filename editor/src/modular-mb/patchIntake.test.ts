// Patchcontrole bij binnenkomst: hele project en één patch.

import { describe, expect, it } from 'vitest';

import { admitPatch, editorModuleTypes, reportNeedsNotice, reviewProject, staleModuleTypes } from './patchIntake';
import { seedEPianoPolyPatch } from './seedShowcase';
import { seedInternals } from './seedModules';
import { emptyModularProject, type ModularProject } from './types';

function project(): { p: ModularProject; ep: string } {
  const p = seedEPianoPolyPatch(seedInternals(emptyModularProject()));
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const ep = p.modules.find((m) => m.typeId === 'tp_mmb_epiano' && patch.connections.some((c) => c.from.moduleId === m.id))!.id;
  return { p, ep };
}

describe('reviewProject', () => {
  it('laat een kloppend project ongemoeid en meldt niets', () => {
    const { p } = project();
    const r = reviewProject(p, 'test');
    expect(r.project).toBe(p);
    expect(r.report.patches).toEqual([]);
    expect(r.report.staleTypes).toEqual([]);
    expect(reportNeedsNotice(r.report)).toBe(false);
  });

  it('herstelt een kapotte patch en meldt het', () => {
    const { p, ep } = project();
    const broken: ModularProject = { ...p, patches: p.patches.map((x) => (x.id === p.activePatchId
      ? { ...x, controlState: { ...x.controlState, [ep]: { ...x.controlState[ep], timbre: 9 } },
          connections: [...x.connections, { id: 'k9', from: { moduleId: ep, portId: 'weg' }, to: { moduleId: ep, portId: 'ook_weg' } }] }
      : x)) };
    const r = reviewProject(broken, 'test');
    const fixed = r.project.patches.find((x) => x.id === p.activePatchId)!;
    expect(fixed.controlState[ep]!.timbre).toBe(1);
    expect(fixed.connections.some((c) => c.id === 'k9')).toBe(false);
    expect(reportNeedsNotice(r.report)).toBe(true);
    // Opnieuw controleren vindt niets meer.
    expect(reviewProject(r.project, 'test').report.patches).toEqual([]);
  });

  it('ziet moduletypes die ouder zijn dan in de editor, alleen als ze gebruikt worden', () => {
    const { p } = project();
    const old: ModularProject = { ...p, moduleTypes: p.moduleTypes.map((t) => (t.id === 'tp_mmb_epiano'
      ? { ...t, controls: t.controls.filter((c) => c.id !== 'bell') } : t)) };
    expect(staleModuleTypes(old, editorModuleTypes())).toEqual(['tp_mmb_epiano']);
    // Een type dat geen enkele module gebruikt, telt niet mee.
    const unused: ModularProject = { ...old, modules: old.modules.filter((m) => m.typeId !== 'tp_mmb_epiano') };
    expect(staleModuleTypes(unused, editorModuleTypes())).toEqual([]);
    expect(reportNeedsNotice(reviewProject(old, 'test').report)).toBe(true);
  });
});

describe('admitPatch', () => {
  it('controleert alleen de binnengekomen patch', () => {
    const { p, ep } = project();
    const id = p.activePatchId!;
    const odd: ModularProject = { ...p, patches: p.patches.map((x) => (x.id === id
      ? { ...x, controlState: { ...x.controlState, [ep]: { ...x.controlState[ep], type: 5 } } } : x)) };
    const r = admitPatch(odd, id, 'uit de pool');
    expect(r.project.patches.find((x) => x.id === id)!.controlState[ep]!.type).toBe(1);
    expect(r.report.source).toBe('uit de pool');
    expect(r.report.patches[0]!.findings.map((f) => f.kind)).toEqual(['out-of-range']);
  });
});
