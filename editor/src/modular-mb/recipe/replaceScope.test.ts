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
});
