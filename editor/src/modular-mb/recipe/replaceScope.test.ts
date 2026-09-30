import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { buildRecipe, validateOps } from './compile';
import { mergeRacks } from './optimize';
import { replaceModule, otherPatchesUsing } from './edits';
import { runCommand } from './commands';

/** Twee patches (A, B) op één rack, met dezelfde VCF-modules. */
function shared(): { p: ModularProject; a: string; b: string; vcf: string } {
  let p = buildRecipe(seedInternals(emptyModularProject()), { voices: 1, source: 'vco' });
  const a = p.activePatchId!;
  p = buildRecipe(p, { voices: 1, source: 'vco' });
  const b = p.activePatchId!;
  const racks = p.racks.filter((r) => r.kind !== 'internal' && r.slots.length > 0);
  p = mergeRacks(p, racks[0]!.id, racks[1]!.id).project;
  const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
  const vcf = p.patches.find((x) => x.id === a)!.connections.map((c) => c.to.moduleId).find((id) => typeOf(id) === 'tp_mmb_vcf')!;
  return { p, a, b, vcf };
}
const types = (p: ModularProject, patchId: string) => {
  const x = p.patches.find((q) => q.id === patchId)!;
  const t = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
  return new Set(x.connections.flatMap((c) => [t(c.from.moduleId), t(c.to.moduleId)]));
};

describe('module vervangen als andere patches hem ook gebruiken', () => {
  it('de opzet: B gebruikt dezelfde VCF', () => {
    const { p, a, vcf } = shared();
    expect(otherPatchesUsing(p, a, vcf).length).toBe(1);
  });

  it("'all': de module zelf verandert, dus ook in B", () => {
    const { p, a, b, vcf } = shared();
    const r = replaceModule(p, a, vcf, 'tp_mmb_ladder', 'all').project;
    expect(types(r, a).has('tp_mmb_ladder')).toBe(true);
    expect(types(r, b).has('tp_mmb_ladder')).toBe(true);
  });

  it("'patch': nieuwe module in hetzelfde rack, alleen A ompatcht; B houdt zijn VCF", () => {
    const { p, a, b, vcf } = shared();
    const res = replaceModule(p, a, vcf, 'tp_mmb_ladder', 'patch');
    const r = res.project;
    expect(types(r, a).has('tp_mmb_ladder')).toBe(true);
    expect(types(r, a).has('tp_mmb_vcf')).toBe(false);
    expect(types(r, b).has('tp_mmb_vcf')).toBe(true);
    expect(types(r, b).has('tp_mmb_ladder')).toBe(false);
    expect(r.modules.find((m) => m.id === vcf)!.typeId).toBe('tp_mmb_vcf');
    const ra = r.patches.find((x) => x.id === a)!, rb = r.patches.find((x) => x.id === b)!;
    expect(ra.rackIds).toEqual(rb.rackIds);                         // zelfde rack
    expect(res.warnings.join(' ')).toContain('blijft in');
    validateOps(r, [], a); validateOps(r, [], b);
  });

  it("'rack': A krijgt een eigen kopie van het rack; B blijft op het oude", () => {
    const { p, a, b, vcf } = shared();
    const r = replaceModule(p, a, vcf, 'tp_mmb_ladder', 'rack').project;
    const ra = r.patches.find((x) => x.id === a)!, rb = r.patches.find((x) => x.id === b)!;
    expect(ra.rackIds).not.toEqual(rb.rackIds);
    expect(types(r, a).has('tp_mmb_ladder')).toBe(true);
    expect(types(r, b).has('tp_mmb_vcf')).toBe(true);
    expect(r.racks.length).toBe(p.racks.length + 1);
    validateOps(r, [], a); validateOps(r, [], b);
  });

  it("commandoregel ('auto'): bij een gedeelde module alleen in deze patch", () => {
    const { p, a, b } = shared();
    const r = runCommand({ ...p, activePatchId: a }, { kind: 'replace', from: 'vcf', to: 'ladder' }).project;
    expect(types(r, a).has('tp_mmb_ladder')).toBe(true);
    expect(types(r, b).has('tp_mmb_vcf')).toBe(true);
  });

  it("MCP/AI met scope 'all': bewust overal vervangen", () => {
    const { p, a, b } = shared();
    const r = runCommand({ ...p, activePatchId: a }, { kind: 'replace', from: 'vcf', to: 'ladder', scope: 'all' }).project;
    expect(types(r, b).has('tp_mmb_ladder')).toBe(true);
  });

  /** Geen twee modules in dezelfde rij die elkaar overlappen, in welk rack dan ook. */
  const overlaps = (p: ModularProject): string[] => {
    const bad: string[] = [];
    for (const r of p.racks) {
      const w = (id: string) => p.modules.find((m) => m.id === id)!.visual.hpWidth;
      const rows = new Map<number, { a: number; b: number; id: string }[]>();
      for (const sl of r.slots) rows.set(sl.row, [...(rows.get(sl.row) ?? []), { a: sl.hpOffset, b: sl.hpOffset + w(sl.moduleId), id: sl.moduleId }]);
      for (const list of rows.values()) {
        list.sort((x, y) => x.a - y.a);
        for (let i = 1; i < list.length; i++) if (list[i]!.a < list[i - 1]!.b) bad.push(`${r.name}: ${list[i - 1]!.id}/${list[i]!.id}`);
        if (list.length && list[list.length - 1]!.b > r.hpPerRow) bad.push(`${r.name}: rij breder dan het rack`);
      }
    }
    return bad;
  };

  it("'patch': de nieuwe module staat direct rechts naast de oude, niets overlapt", () => {
    const { p, a, vcf } = shared();
    const r = replaceModule(p, a, vcf, 'tp_mmb_ladder', 'patch').project;
    const rack = r.racks.find((x) => x.slots.some((sl) => sl.moduleId === vcf))!;
    const old = rack.slots.find((sl) => sl.moduleId === vcf)!;
    const ladderId = r.patches.find((x) => x.id === a)!.connections
      .map((c) => c.to.moduleId).find((id) => r.modules.find((m) => m.id === id)!.typeId === 'tp_mmb_ladder')!;
    const neu = rack.slots.find((sl) => sl.moduleId === ladderId)!;
    expect(neu.row).toBe(old.row);
    expect(neu.hpOffset).toBe(old.hpOffset + r.modules.find((m) => m.id === vcf)!.visual.hpWidth);
    expect(overlaps(r)).toEqual([]);
  });

  it('een bredere vervanger schuift de rij op in alle drie de keuzes (geen overlap)', () => {
    for (const scope of ['all', 'patch', 'rack'] as const) {
      const { p, a } = shared();
      const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
      const vco = p.patches.find((x) => x.id === a)!.connections.map((c) => c.from.moduleId).find((id) => typeOf(id) === 'tp_mmb_vco')!;
      const wideHp = p.modules.find((m) => m.typeId === 'tp_mmb_plaits')!.visual.hpWidth;
      expect(wideHp).toBeGreaterThan(p.modules.find((m) => m.id === vco)!.visual.hpWidth);
      const r = replaceModule(p, a, vco, 'tp_mmb_plaits', scope).project;
      expect(overlaps(r), scope).toEqual([]);
    }
  });
});
