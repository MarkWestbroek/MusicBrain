import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedTestPatch, seedSamplerPolyPatch, SAMPLER_MASTER_FX } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { buildConfigPayload } from '../teensyLink';
import { buildRecipe, validateOps } from './compile';
import { analyzeProject, applyActions, diffPatches, mergeRacks, optimizeProject, rackDiff, type OptimizeAction } from './optimize';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject) => p.patches.find((x) => x.id === p.activePatchId)!;
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
    // De ladder staat direct naast de VCF (soortgenoten bij elkaar) en niets overlapt.
    const slots = rack.slots.filter((s) => s.row === 0).sort((x, y) => x.hpOffset - y.hpOffset);
    const order = slots.map((s) => typeOf(r.project, s.moduleId));
    // Links-verankerd: de ladder komt na de tegenhanger van zijn linkerbuur
    // (envFlt), dus direct vóór de VCF. Soortgenoten naast elkaar.
    expect(Math.abs(order.indexOf('tp_mmb_ladder') - order.indexOf('tp_mmb_vcf'))).toBe(1);
    for (let i = 1; i < slots.length; ++i) {
      const prev = slots[i - 1]!;
      expect(slots[i]!.hpOffset).toBeGreaterThanOrEqual(prev.hpOffset + r.project.modules.find((m) => m.id === prev.moduleId)!.visual.hpWidth);
    }
    // Vanaf de VCF is alles precies de ladder-breedte opgeschoven; links ervan niets.
    const vcfBefore = a!.slots.find((s) => typeOf(p, s.moduleId) === 'tp_mmb_vcf')!;
    for (const s of a!.slots) {
      const after = rack.slots.find((x) => x.id === s.id)!;
      expect(after.hpOffset - s.hpOffset).toBe(s.row === 0 && s.hpOffset >= vcfBefore.hpOffset ? 8 : 0);   // ladder = 8 HP
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
    // Elke phaser staat in zijn eigen rij direct rechts van de VCF (zoals in de keten van B).
    for (const row of [0, 1]) {
      const order = rack.slots.filter((s) => s.row === row).sort((x, y) => x.hpOffset - y.hpOffset).map((s) => typeOf(r.project, s.moduleId));
      expect(order.indexOf('tp_mmb_phaser')).toBe(order.indexOf('tp_mmb_vcf') + 1);
    }
    sane(r.project);
  });

  it('sampler ×8 (poly-groep op cellen): auto-wah en auto-wah + FET voegen samen', () => {
    let p = seedSamplerPolyPatch(base(), 8, true);
    const patchA = p.activePatchId!;
    p = seedSamplerPolyPatch(p, 8, true, true);
    const patchB = p.activePatchId!;
    p = seedSamplerPolyPatch(p, 8, false, SAMPLER_MASTER_FX);
    const patchC = p.activePatchId!;
    const before = { a: topo(p, patchA), b: topo(p, patchB), c: topo(p, patchC) };
    const [a, b, c] = physical(p);
    const d = rackDiff(p, a!.id, b!.id);
    expect('incompatible' in d ? d.incompatible : d.diff).toBe(1);          // alleen de FET
    const r = mergeRacks(p, a!.id, b!.id);
    const rack = physical(r.project).find((x) => x.id === a!.id)!;
    // Eén sampler over, met één celgroep ×8; beide patches ongewijzigd van topologie.
    expect(rack.slots.filter((s) => typeOf(r.project, s.moduleId) === 'tp_mmb_sampler').length).toBe(1);
    expect(rack.polyGroups!.filter((g) => g.members[0]?.kind === 'cell').length).toBe(1);
    expect(topo(r.project, patchA)).toEqual(before.a);
    expect(topo(r.project, patchB)).toEqual(before.b);
    sane(r.project);
    // De master-FX-variant (EQ + Vari-mu i.p.v. FET) verschilt 2 modules:
    // bij drempel 1 apart, bij de standaarddrempel 2 gaat ook die mee — en speelt nog.
    const d2 = rackDiff(r.project, a!.id, c!.id);
    expect('incompatible' in d2 ? d2.incompatible : d2.diff).toBe(2);
    const strict = analyzeProject(r.project, { maxDiff: 1 });
    expect(strict.actions.filter((x) => x.kind === 'mergeRacks').length).toBe(0);
    expect(strict.skipped.some((s) => /drempel/.test(s.reason))).toBe(true);
    const all = optimizeProject(r.project, { maxDiff: 2 });
    expect(physical(all.project).length).toBe(1);
    expect(topo(all.project, patchC)).toEqual(before.c);
    sane(all.project);
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

    // De kopie van A is ook als patch identiek (zelfde recept): die wordt ontdubbeld.
    expect(plan.actions.some((x) => x.kind === 'removePatch' && /Duplicaat/.test(x.label))).toBe(true);
    const r = applyActions(p, plan.actions);
    expect(physical(r.project).length).toBe(3);                    // A(+kopie), ladder, string
    expect(r.project.modules.some((m) => m.id === 'mod_los')).toBe(false);
    expect(r.project.patches.some((x) => x.id === 'patch_leeg')).toBe(false);
    expect(r.project.patches.length).toBe(3);                      // A, ladder, string (kopie weg)
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

describe('patches vergelijken en ontdubbelen', () => {
  it('diffPatches: identiek, alleen knoppen anders, kabels anders', () => {
    let p = buildRecipe(base(), { voices: 2, source: 'vco', bus: ['diode'] });
    const a = p.activePatchId!;
    // Exacte kopie op hetzelfde rack (zoals "Bewaar als…").
    const copy = { ...JSON.parse(JSON.stringify(active(p))), id: 'patch_copy', name: 'kopie' };
    p = { ...p, patches: [...p.patches, copy] };
    expect(diffPatches(p, a, 'patch_copy')).toMatchObject({ identical: true, sameTopology: true, controls: [], onlyA: [], onlyB: [] });
    // Knop anders → bijna-duplicaat met het verschil benoemd.
    const vcf = Object.keys(copy.controlState).find((id) => typeOf(p, id) === 'tp_mmb_vcf')!;
    const p2 = { ...p, patches: p.patches.map((x) => (x.id === 'patch_copy' ? { ...x, controlState: { ...x.controlState, [vcf]: { ...x.controlState[vcf], cutoff: 1200 } } } : x)) };
    const d2 = diffPatches(p2, a, 'patch_copy');
    expect(d2).toMatchObject({ identical: false, sameTopology: true });
    expect(d2.controls).toEqual([{ module: 'VCF', control: 'cutoff', a: 800, b: 1200 }]);
    // Kabel weg → topologie anders.
    const p3 = { ...p, patches: p.patches.map((x) => (x.id === 'patch_copy' ? { ...x, connections: x.connections.slice(1) } : x)) };
    const d3 = diffPatches(p3, a, 'patch_copy');
    expect(d3.sameTopology).toBe(false);
    expect(d3.onlyA.length).toBe(1);
    // Op verschillende racks: vergelijking op type-niveau vindt identieke seeds.
    const q = buildRecipe(buildRecipe(base(), { source: 'string' }), { source: 'string' });
    expect(diffPatches(q, q.patches[0]!.id, q.patches[1]!.id).identical).toBe(true);
  });

  it('analyzeProject: duplicaat weg, bijna-duplicaat standaard uit', () => {
    let p = buildRecipe(base(), { voices: 2, source: 'vco' });
    const orig = active(p);
    const dup = { ...JSON.parse(JSON.stringify(orig)), id: 'patch_dup', name: 'dup' };
    const near = { ...JSON.parse(JSON.stringify(orig)), id: 'patch_near', name: 'near' };
    const vca = Object.keys(orig.controlState).find((id) => typeOf(p, id) === 'tp_mmb_vca')!;
    near.controlState[vca] = { ...near.controlState[vca], gain: 0.5 };
    p = { ...p, patches: [...p.patches, dup, near] };
    const plan = analyzeProject(p);
    const removes = plan.actions.filter((x) => x.kind === 'removePatch') as (OptimizeAction & { patchId: string })[];
    expect(removes.map((x) => [x.patchId, !!x.defaultOff])).toEqual([['patch_dup', false], ['patch_near', true]]);
    expect(removes[1]!.detail).toMatch(/VCA\.gain: 0 ↔ 0\.5/);
    const r = applyActions(p, plan.actions.filter((x) => !x.defaultOff));
    expect(r.project.patches.map((x) => x.id).sort()).toEqual([orig.id, 'patch_near'].sort());
    sane(r.project);
  });
});

describe('push naar de Teensy (ED-RC-7)', () => {
  it('gedeeld rack: modules van de zuster-patch gaan mee (hergebruik op de Teensy), onbekabelde niet', () => {
    let p = buildRecipe(base(), { source: 'vco', filter: 'vcf' });
    p = buildRecipe(p, { source: 'vco', filter: 'ladder' });
    const [a, b] = physical(p);
    p = mergeRacks(p, a!.id, b!.id).project;
    // Actieve patch = B (ladder). De VCF hangt alleen aan kabels van patch A,
    // maar deelt het rack: hij gaat mee zodat A ↔ B wisselen niets aanmaakt.
    const payload = JSON.parse(buildConfigPayload(p).json) as { project: { modules: { typeId: string }[]; patches: unknown[] } };
    const types = payload.project.modules.map((m) => m.typeId);
    expect(types).toContain('tp_mmb_ladder');
    expect(types).toContain('tp_mmb_vcf');
    expect(payload.project.patches.length).toBe(1);   // maar alleen de actieve patch zelf
    // Wisselen naar A geeft exact dezelfde module-set (id's), dus reconcile = 100% hergebruik.
    const pA = { ...p, activePatchId: p.patches[0]!.id };
    const idsA = (JSON.parse(buildConfigPayload(pA).json) as { project: { modules: { id: string }[] } }).project.modules.map((m) => m.id).sort();
    const idsB = (JSON.parse(buildConfigPayload(p).json) as { project: { modules: { id: string }[] } }).project.modules.map((m) => m.id).sort();
    expect(idsA).toEqual(idsB);
    // Een losse module in het rack die géén patch bekabelt gaat niet mee.
    const q = buildRecipe(base(), { source: 'vco' });
    const rack = physical(q)[0]!;
    const loose = { ...q.modules.find((m) => m.typeId === 'tp_mmb_echo')!, id: 'mod_loose', internal: false };
    const q2 = { ...q, modules: [...q.modules, loose], racks: q.racks.map((r) => (r.id === rack.id
      ? { ...r, slots: [...r.slots, { id: 'slot_loose', moduleId: 'mod_loose', row: 0, hpOffset: 999 }] } : r)) };
    const t2 = (JSON.parse(buildConfigPayload(q2).json) as { project: { modules: { id: string }[] } }).project.modules.map((m) => m.id);
    expect(t2).not.toContain('mod_loose');
  });
});
