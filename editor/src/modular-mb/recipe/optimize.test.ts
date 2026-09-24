import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedTestPatch } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { buildConfigPayload } from '../teensyLink';
import { buildRecipe, validateOps } from './compile';
import { analyzeProject, applyActions, mergeRacks, optimizeProject, rackDiff } from './optimize';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
/** Fysieke racks mét modules (het lege "Mijn rack" van een nieuw project telt niet mee). */
const physical = (p: ModularProject) => p.racks.filter((r) => r.kind !== 'internal' && r.slots.length > 0);
const typeOf = (p: ModularProject, id: string) => p.modules.find((m) => m.id === id)!.typeId;
/** Topologie van een patch op type-niveau, onafhankelijk van id's. */
const topo = (p: ModularProject, patchId: string) => {
  const x = p.patches.find((q) => q.id === patchId)!;
  return {
    voices: x.voiceCount,
    edges: x.connections.map((c) => `${typeOf(p, c.from.moduleId)}.${c.from.portId}>${typeOf(p, c.to.moduleId)}.${c.to.portId}`).sort(),
    expanded: expandPatchConnections(x, p).length,
    controls: Object.entries(x.controlState).map(([id, v]) => `${typeOf(p, id)}:${JSON.stringify(v)}`).sort(),
  };
};
const sane = (p: ModularProject) => {
  const ids = new Set(p.modules.map((m) => m.id));
  for (const r of p.racks) for (const s of r.slots) expect(ids.has(s.moduleId)).toBe(true);
  for (const x of p.patches) {
    for (const c of x.connections) { expect(ids.has(c.from.moduleId)).toBe(true); expect(ids.has(c.to.moduleId)).toBe(true); }
    for (const rid of x.rackIds) expect(p.racks.some((r) => r.id === rid)).toBe(true);
    validateOps(p, [], x.id);
  }
};

describe('rackDiff', () => {
  it('identieke seeds: diff 0, alles afgebeeld', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco' });
    p = buildRecipe(p, { voices: 4, source: 'vco' });
    const [a, b] = physical(p);
    const d = rackDiff(p, a!.id, b!.id);
    expect('incompatible' in d).toBe(false);
    if ('incompatible' in d) return;
    expect(d.diff).toBe(0);
    expect(d.mapping.size).toBe(b!.slots.length);
    expect(d.moved).toEqual([]);
  });

  it('één module anders (VCF vs Ladder): diff 1; ander stemmental: incompatibel', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'vcf' });
    p = buildRecipe(p, { voices: 4, source: 'vco', filter: 'ladder' });
    p = buildRecipe(p, { voices: 8, source: 'vco', filter: 'vcf' });
    const [a, b, c] = physical(p);
    const d = rackDiff(p, a!.id, b!.id);
    expect('incompatible' in d ? -1 : d.diff).toBe(4);   // 4 stemmen → 4 filters verschillen
    const e = rackDiff(p, a!.id, c!.id);
    expect('incompatible' in e && e.incompatible).toMatch(/stemmental/);
    // Mono: precies één module.
    let q = buildRecipe(base(), { source: 'vco', filter: 'vcf' });
    q = buildRecipe(q, { source: 'vco', filter: 'ladder' });
    const [qa, qb] = physical(q);
    const f = rackDiff(q, qa!.id, qb!.id);
    expect('incompatible' in f ? -1 : f.diff).toBe(1);
  });
});

describe('mergeRacks', () => {
  it('identiek: één rack over, beide patches spelen met dezelfde topologie', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco', bus: ['diode'] });
    const patchA = p.activePatchId!;
    p = buildRecipe(p, { voices: 4, source: 'vco', bus: ['diode'] });
    const patchB = p.activePatchId!;
    const before = { a: topo(p, patchA), b: topo(p, patchB) };
    const modulesBefore = p.modules.length;
    const [a, b] = physical(p);
    const r = mergeRacks(p, a!.id, b!.id);
    expect(r.diff).toBe(0);
    expect(physical(r.project).length).toBe(1);
    expect(r.project.modules.length).toBe(modulesBefore - b!.slots.length);
    expect(topo(r.project, patchA)).toEqual(before.a);
    expect(topo(r.project, patchB)).toEqual(before.b);
    expect(r.project.patches.find((x) => x.id === patchB)!.rackIds).toEqual([a!.id]);
    sane(r.project);
  });

  it('bijna identiek: afwijkende module verhuist, patch A raakt hem niet, patch B wel', () => {
    let p = buildRecipe(base(), { source: 'vco', filter: 'vcf' });
    const patchA = p.activePatchId!;
    p = buildRecipe(p, { source: 'vco', filter: 'ladder' });
    const patchB = p.activePatchId!;
    const before = { a: topo(p, patchA), b: topo(p, patchB) };
    const [a, b] = physical(p);
    const r = mergeRacks(p, a!.id, b!.id);
    expect(r.diff).toBe(1);
    const rack = physical(r.project)[0]!;
    expect(rack.slots.filter((s) => typeOf(r.project, s.moduleId) === 'tp_mmb_ladder').length).toBe(1);
    expect(rack.slots.filter((s) => typeOf(r.project, s.moduleId) === 'tp_mmb_vcf').length).toBe(1);
    expect(topo(r.project, patchA)).toEqual(before.a);
    expect(topo(r.project, patchB)).toEqual(before.b);
    // De ladder staat achteraan in rij 0 en overlapt niets.
    const slots = rack.slots.filter((s) => s.row === 0).sort((x, y) => x.hpOffset - y.hpOffset);
    for (let i = 1; i < slots.length; ++i) {
      const prev = slots[i - 1]!;
      expect(slots[i]!.hpOffset).toBeGreaterThanOrEqual(prev.hpOffset + r.project.modules.find((m) => m.id === prev.moduleId)!.visual.hpWidth);
    }
    expect(r.summary).toMatch(/verhuisd: Ladder/);
    sane(r.project);
  });

  it('poly: groepen van B vallen op groepen van A; verhuizende groep wordt nieuw', () => {
    let p = buildRecipe(base(), { voices: 2, source: 'vco', filter: 'vcf' });
    p = buildRecipe(p, { voices: 2, source: 'vco', filter: 'vcf', voiceFx: ['phaser'] });
    const patchB = p.activePatchId!;
    const before = topo(p, patchB);
    const [a, b] = physical(p);
    const r = mergeRacks(p, a!.id, b!.id);
    expect(r.diff).toBe(2);   // 2 phasers verhuizen
    const rack = physical(r.project)[0]!;
    expect(rack.polyGroups!.filter((g) => g.label === 'Phaser').length).toBe(1);
    expect(rack.polyGroups!.filter((g) => g.label === 'VCF').length).toBe(1);
    expect(topo(r.project, patchB)).toEqual(before);
    sane(r.project);
  });

  it('incompatibel → RecipeError', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco' });
    p = buildRecipe(p, { voices: 8, source: 'vco' });
    const [a, b] = physical(p);
    expect(() => mergeRacks(p, a!.id, b!.id)).toThrowError(RecipeError);
  });
});

describe('analyzeProject / applyActions', () => {
  it('ruimt op en voegt samen binnen de drempel; daarboven blijft apart', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco' });                 // A
    p = buildRecipe(p, { voices: 4, source: 'vco' });                          // identiek aan A
    p = buildRecipe(p, { voices: 4, source: 'vco', filter: 'ladder' });        // 4 afwijkend → apart bij drempel 2
    p = buildRecipe(p, { voices: 2, source: 'string' });                       // ander stemmental
    const weesRack = physical(p)[0]!.id;
    // Wees-rack: kopie zonder patch; wees-module: zonder slot; lege patch.
    p = { ...p,
      racks: [...p.racks, { ...physical(p)[3]!, id: 'rack_wees', name: 'Wees', slots: physical(p)[3]!.slots.map((s) => ({ ...s, id: s.id + 'w', moduleId: s.moduleId + 'w' })) }],
      modules: [...p.modules, ...physical(p)[3]!.slots.map((s) => ({ ...p.modules.find((m) => m.id === s.moduleId)!, id: s.moduleId + 'w' })),
                { ...p.modules.find((m) => m.typeId === 'tp_mmb_vca')!, id: 'mod_los', internal: false }],
      patches: [...p.patches, { id: 'patch_leeg', name: 'Leeg', voiceCount: 1, rackIds: [weesRack], connections: [], controlState: {}, envelopes: [], lfos: [] }],
    };
    const plan = analyzeProject(p, { maxDiff: 2 });
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds).toContain('removeRack');
    expect(kinds).toContain('removeModules');
    expect(kinds).toContain('removePatch');
    expect(plan.actions.filter((a) => a.kind === 'mergeRacks').length).toBe(1);
    expect(plan.skipped.some((s) => /drempel/.test(s.reason))).toBe(true);
    expect(plan.skipped.some((s) => /stemmental/.test(s.reason))).toBe(true);
    expect(plan.summary).toMatch(/1 racks samenvoegen/);

    const r = applyActions(p, plan.actions);
    expect(physical(r.project).length).toBe(3);                    // A(+kopie), ladder, string
    expect(r.project.modules.some((m) => m.id === 'mod_los')).toBe(false);
    expect(r.project.patches.some((x) => x.id === 'patch_leeg')).toBe(false);
    expect(r.project.patches.length).toBe(4);
    expect(r.project.activePatchId).toBeDefined();
    sane(r.project);
    // Idempotent: nog een keer analyseren geeft niets.
    expect(analyzeProject(r.project, { maxDiff: 2 }).actions).toEqual([]);
  });

  it('drempel 4 voegt de ladder-variant wél samen', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'vco' });
    p = buildRecipe(p, { voices: 4, source: 'vco', filter: 'ladder' });
    const r = optimizeProject(p, { maxDiff: 4 });
    expect(physical(r.project).length).toBe(1);
    expect(r.plan.actions[0]!.kind).toBe('mergeRacks');
    sane(r.project);
  });

  it('interne rack en seedTestPatch blijven met rust', () => {
    const p = seedTestPatch(base());
    const plan = analyzeProject(p);
    expect(plan.actions).toEqual([]);
  });
});

describe('push naar de Teensy (ED-RC-7)', () => {
  it('alleen bekabelde modules gaan mee, ook in een gedeeld rack', () => {
    let p = buildRecipe(base(), { source: 'vco', filter: 'vcf' });
    p = buildRecipe(p, { source: 'vco', filter: 'ladder' });
    const [a, b] = physical(p);
    p = mergeRacks(p, a!.id, b!.id).project;
    // Actieve patch = B (ladder). De VCF staat in hetzelfde rack maar zonder kabel.
    const payload = JSON.parse(buildConfigPayload(p).json) as { project: { modules: { typeId: string }[] } };
    const types = payload.project.modules.map((m) => m.typeId);
    expect(types).toContain('tp_mmb_ladder');
    expect(types).not.toContain('tp_mmb_vcf');
    // String-seed via recept plaatst geen ongebruikte vibrato-modules; een
    // handmatig losse module in het rack gaat óók niet mee.
    const q = buildRecipe(base(), { source: 'vco' });
    const rack = physical(q)[0]!;
    const loose = { ...q.modules.find((m) => m.typeId === 'tp_mmb_echo')!, id: 'mod_loose', internal: false };
    const q2 = { ...q, modules: [...q.modules, loose], racks: q.racks.map((r) => (r.id === rack.id
      ? { ...r, slots: [...r.slots, { id: 'slot_loose', moduleId: 'mod_loose', row: 0, hpOffset: 999 }] } : r)) };
    const t2 = (JSON.parse(buildConfigPayload(q2).json) as { project: { modules: { id: string }[] } }).project.modules.map((m) => m.id);
    expect(t2).not.toContain('mod_loose');
  });
});
