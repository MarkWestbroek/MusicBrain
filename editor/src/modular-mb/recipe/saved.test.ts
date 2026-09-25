import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { buildRecipe } from './compile';
import { findModuleByWord, addBusFx } from './edits';
import { trackSaved, isDirty, savePatch, revertPatch, toggleShowSaved, saveAsPatch, snapshotOf } from './saved';
import { upsertMorph } from './morph';
import { mergeRacks } from './optimize';

const base = () => seedInternals(emptyModularProject());
/** Zoals store.updateProject: fn toepassen en trackSaved erachter. */
const upd = (p: ModularProject, fn: (q: ModularProject) => ModularProject) => trackSaved(p, fn(p));
const pat = (p: ModularProject, id: string) => p.patches.find((x) => x.id === id)!;
const setCutoff = (id: string, mod: string, v: number) => (q: ModularProject): ModularProject => ({
  ...q, patches: q.patches.map((x) => (x.id === id ? { ...x, controlState: { ...x.controlState, [mod]: { ...x.controlState[mod], cutoff: v } } } : x)),
});

describe('bewaren (ED-RC-9)', () => {
  it('eerste wijziging legt de bewaarde versie vast; terug naar gelijk = weer schoon', () => {
    let p = buildRecipe(base(), { source: 'vco' });
    const id = p.activePatchId!;
    const vcf = findModuleByWord(p, id, 'filter')!.id;
    expect(isDirty(pat(p, id))).toBe(false);
    p = upd(p, setCutoff(id, vcf, 1500));
    expect(isDirty(pat(p, id))).toBe(true);
    expect(pat(p, id).saved!.controlState[vcf]!.cutoff).toBe(800);
    p = upd(p, setCutoff(id, vcf, 2000));
    expect(pat(p, id).saved!.controlState[vcf]!.cutoff).toBe(800);   // blijft de oorspronkelijke
    p = upd(p, setCutoff(id, vcf, 800));
    expect(isDirty(pat(p, id))).toBe(false);
    // Naam wijzigen maakt niet vuil.
    p = upd(p, (q) => ({ ...q, patches: q.patches.map((x) => ({ ...x, name: 'nieuw' })) }));
    expect(isDirty(pat(p, id))).toBe(false);
  });

  it('Bewaar, Terug, Vergelijk, Bewaar als', () => {
    let p = buildRecipe(base(), { source: 'vco' });
    const id = p.activePatchId!;
    const vcf = findModuleByWord(p, id, 'filter')!.id;
    p = upd(p, setCutoff(id, vcf, 1500));
    // Vergelijk: omwisselen en terug is verliesloos.
    let q = upd(p, (x) => toggleShowSaved(x, id));
    expect(pat(q, id).controlState[vcf]!.cutoff).toBe(800);
    expect(pat(q, id).showingSaved).toBe(true);
    expect(isDirty(pat(q, id))).toBe(true);
    q = upd(q, (x) => toggleShowSaved(x, id));
    expect(pat(q, id).controlState[vcf]!.cutoff).toBe(1500);
    expect(pat(q, id).showingSaved).toBe(false);
    // Terug.
    const r = upd(p, (x) => revertPatch(x, id));
    expect(pat(r, id).controlState[vcf]!.cutoff).toBe(800);
    expect(isDirty(pat(r, id))).toBe(false);
    // Terug terwijl de bewaarde versie voorstaat = bewerking weg, bewaard blijft.
    const r2 = upd(upd(p, (x) => toggleShowSaved(x, id)), (x) => revertPatch(x, id));
    expect(pat(r2, id).controlState[vcf]!.cutoff).toBe(800);
    // Bewaar.
    const s = upd(p, (x) => savePatch(x, id));
    expect(pat(s, id).controlState[vcf]!.cutoff).toBe(1500);
    expect(isDirty(pat(s, id))).toBe(false);
    // Bewaar als: kopie met de bewerking, origineel terug.
    const a = upd(p, (x) => saveAsPatch(x, id, 'patch_new', 'variant'));
    expect(pat(a, 'patch_new').controlState[vcf]!.cutoff).toBe(1500);
    expect(isDirty(pat(a, 'patch_new'))).toBe(false);
    expect(pat(a, id).controlState[vcf]!.cutoff).toBe(800);
    expect(isDirty(pat(a, id))).toBe(false);
    expect(a.activePatchId).toBe('patch_new');
  });

  it('kabelbewerkingen tellen, morph-patches niet', () => {
    let p = buildRecipe(base(), { voices: 2, source: 'vco' });
    const a = p.activePatchId!;
    p = buildRecipe(p, { voices: 2, source: 'vco' });
    const b = p.activePatchId!;
    const racks = p.racks.filter((r) => r.kind !== 'internal' && r.slots.length > 0);
    p = mergeRacks(p, racks[0]!.id, racks[1]!.id).project;
    p = savePatch(savePatch(p, a), b);
    const before = snapshotOf(pat(p, b));
    p = upd(p, (x) => addBusFx(x, b, 'diode').project);
    expect(isDirty(pat(p, b))).toBe(true);
    expect(pat(p, b).saved!.connections).toEqual(before.connections);
    p = upd(p, (x) => upsertMorph(x, a, b, 0.3));
    const m = p.patches.find((x) => x.morph)!;
    p = upd(p, (x) => upsertMorph(x, a, b, 0.7, m.id));
    expect(pat(p, m.id).saved).toBeUndefined();
  });
});
