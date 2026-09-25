import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject, type PatchConnection } from '../types';
import { seedInternals } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { buildRecipe, validateOps } from './compile';
import { mergeRacks } from './optimize';
import { addBusFx, findModuleByWord } from './edits';
import {
  morphDescriptor, morphPatch, morphControlValue, cableWeight, upsertMorph, isOrdinalSwitch, ruleFor, describeMorph,
} from './morph';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject) => p.patches.find((x) => x.id === p.activePatchId)!;
const typeOf = (p: ModularProject, id: string) => p.modules.find((m) => m.id === id)!.typeId;
const label = (p: ModularProject, c: PatchConnection) => `${typeOf(p, c.from.moduleId)}.${c.from.portId}>${typeOf(p, c.to.moduleId)}.${c.to.portId}`;

/** A = vco → vcf → … → mixer → out ; B = zelfde maar met een diode-comp op de bus. Zelfde rack via merge. */
function abBus(): { p: ModularProject; a: string; b: string } {
  let p = buildRecipe(base(), { voices: 2, source: 'vco' });
  const a = p.activePatchId!;
  p = buildRecipe(p, { voices: 2, source: 'vco' });
  const b = p.activePatchId!;
  const racks = p.racks.filter((r) => r.kind !== 'internal' && r.slots.length > 0);
  p = mergeRacks(p, racks[0]!.id, racks[1]!.id).project;
  p = addBusFx(p, b, 'diode').project;
  return { p, a, b };
}

describe('divergentieregel', () => {
  it('bus-effect alleen in B: gewogen bij OUT, de comp-ingang draait vol', () => {
    const { p, a, b } = abBus();
    const d = morphDescriptor(p, a, b);
    // Gewogen: mixer→out (A) en comp→out (B), op out.l en out.r.
    const w = d.weighted.map((x) => `${x.side}:${label(p, x.connection)}`).sort();
    expect(w).toEqual([
      'a:tp_mmb_mixer.out_l>tp_mmb_out.l', 'a:tp_mmb_mixer.out_r>tp_mmb_out.r',
      'b:tp_mmb_diode_comp.out_l>tp_mmb_out.l', 'b:tp_mmb_diode_comp.out_r>tp_mmb_out.r',
    ]);
    // Vol: mixer→comp (alleen in B, maar stroomopwaarts van het divergentiepunt).
    expect(d.full.map((c) => label(p, c)).sort()).toEqual(['tp_mmb_mixer.out_l>tp_mmb_diode_comp.in_l', 'tp_mmb_mixer.out_r>tp_mmb_diode_comp.in_r']);
    expect(d.common.length).toBe(active({ ...p, activePatchId: a }).connections.length - 2);
    expect(d.weighted.every((x) => !x.snap)).toBe(true);
    // Gewichten en fusie op t.
    const wa = d.weighted.find((x) => x.side === 'a')!, wb = d.weighted.find((x) => x.side === 'b')!;
    expect([cableWeight(wa, 0), cableWeight(wa, 0.25), cableWeight(wa, 1)]).toEqual([1, 0.75, 0]);
    expect([cableWeight(wb, 0), cableWeight(wb, 0.25), cableWeight(wb, 1)]).toEqual([0, 0.25, 1]);
    const m = morphPatch(p, d, 0.25);
    expect(m.morph).toEqual({ a, b, t: 0.25 });
    expect(m.connections.filter((c) => c.attenuation !== undefined).length).toBe(4);
    expect(m.connections.filter((c) => c.attenuation === undefined).length).toBe(d.common.length + d.full.length);
    // De fusie is een geldige patch (poorten, flatten).
    const q = { ...p, patches: [...p.patches, m], activePatchId: m.id };
    validateOps(q, [], m.id);
    expect(expandPatchConnections(m, q).length).toBeGreaterThan(0);
    expect(describeMorph(p, d)).toMatch(/4 gewogen kabels, 2 vol/);
  });

  it('gate-ingang die divergeert snapt; audio crossfadet', () => {
    // A: midi.gate → envAmp.gate ; B: idem maar de envFlt-gate ontbreekt → envFlt.gate divergeert (alleen A).
    let p = buildRecipe(base(), { source: 'vco' });
    const a = p.activePatchId!;
    const envFlt = p.modules.find((m) => m.typeId === 'tp_mmb_ahdsr' && active(p).connections.some((c) => c.to.moduleId === m.id && c.to.portId === 'gate')
      && active(p).connections.some((c) => c.from.moduleId === m.id && typeOf(p, c.to.moduleId) === 'tp_mmb_vcf'))!;
    const B = { ...JSON.parse(JSON.stringify(active(p))), id: 'patch_b', name: 'B',
      connections: active(p).connections.filter((c) => !(c.to.moduleId === envFlt.id && c.to.portId === 'gate')) };
    p = { ...p, patches: [...p.patches, B] };
    const d = morphDescriptor(p, a, 'patch_b');
    const g = d.weighted.find((x) => x.connection.to.portId === 'gate');
    expect(g).toBeDefined();
    expect(g!.snap).toBe(true);
    expect(cableWeight(g!, 0.4)).toBe(1);
    expect(cableWeight(g!, 0.6)).toBe(0);
  });

  it('weigert ander rack of ander stemmental', () => {
    let p = buildRecipe(base(), { voices: 2, source: 'vco' });
    const a = p.activePatchId!;
    p = buildRecipe(p, { voices: 2, source: 'vco' });
    expect(() => morphDescriptor(p, a, p.activePatchId!)).toThrowError(/zelfde rack/);
    const racks = p.racks.filter((r) => r.kind !== 'internal' && r.slots.length > 0);
    p = mergeRacks(p, racks[0]!.id, racks[1]!.id).project;
    p = { ...p, patches: p.patches.map((x) => (x.id === a ? { ...x, voiceCount: 4 } : x)) };
    expect(() => morphDescriptor(p, a, p.activePatchId!)).toThrowError(/stemmental/);
    expect(() => morphDescriptor(p, a, a)).toThrowError(RecipeError);
  });
});

describe('controls', () => {
  it('geordende en ongeordende schakelaars', () => {
    const types = base().moduleTypes;
    const sw = (typeId: string, id: string) => types.find((t) => t.id === typeId)!.controls.find((c) => c.id === id) as Extract<ReturnType<typeof ruleFor>, never> | never;
    void sw;
    const ctl = (typeId: string, id: string) => types.find((t) => t.id === typeId)!.controls.find((c) => c.id === id)!;
    const lowHz = ctl('tp_mmb_program_eq', 'low_freq');
    const ratio = ctl('tp_mmb_fet_comp', 'ratio');
    const vcfType = ctl('tp_mmb_vcf', 'type');
    expect(lowHz.kind).toBe('switch'); expect(ratio.kind).toBe('switch'); expect(vcfType.kind).toBe('switch');
    expect(isOrdinalSwitch(lowHz as never)).toBe(true);     // 20/30/60/100
    expect(isOrdinalSwitch(ratio as never)).toBe(true);     // 4:1 … All
    expect(isOrdinalSwitch(vcfType as never)).toBe(false);  // LP/HP/BP
    expect(ruleFor(lowHz)).toBe('ordinal');
    expect(ruleFor(vcfType)).toBe('snap');
    expect(ruleFor(ctl('tp_mmb_vcf', 'cutoff'))).toBe('taper');
    expect(ruleFor(ctl('tp_mmb_ahdsr', 'loop'))).toBe('snap');
    // Van stand 0 naar 3 langs 1 en 2.
    const e = { moduleId: 'x', controlId: 'low_freq', a: 0, b: 3, rule: 'ordinal' as const };
    expect([0, 0.2, 0.4, 0.6, 0.9, 1].map((t) => morphControlValue(lowHz, e, t))).toEqual([0, 1, 1, 2, 3, 3]);
    const s = { moduleId: 'x', controlId: 'type', a: 0, b: 2, rule: 'snap' as const };
    expect([0.49, 0.5].map((t) => morphControlValue(vcfType, s, t))).toEqual([0, 2]);
  });

  it('knoppen interpoleren in het taperdomein (cutoff per octaaf)', () => {
    const cutoff = base().moduleTypes.find((t) => t.id === 'tp_mmb_vcf')!.controls.find((c) => c.id === 'cutoff')!;
    const e = { moduleId: 'x', controlId: 'cutoff', a: 200, b: 3200, rule: 'taper' as const };
    const mid = Number(morphControlValue(cutoff, e, 0.5));
    expect(mid).toBeCloseTo(800, 0);          // meetkundig midden, niet 1700
    expect(Number(morphControlValue(cutoff, e, 0))).toBeCloseTo(200, 3);
    expect(Number(morphControlValue(cutoff, e, 1))).toBeCloseTo(3200, 3);
  });

  it('upsertMorph: maakt en ververst de morph-patch; alleen verschillende controls morphen', () => {
    const { p, a, b } = abBus();
    const vcf = findModuleByWord(p, a, 'filter')!;
    const q = { ...p, patches: p.patches.map((x) => (x.id === b ? { ...x, controlState: { ...x.controlState, [vcf.id]: { ...x.controlState[vcf.id], cutoff: 3200 } } } : x)) };
    let r = upsertMorph(q, a, b, 0);
    const m0 = r.patches.find((x) => x.morph)!;
    expect(Number(m0.controlState[vcf.id]!.cutoff)).toBeCloseTo(800, 6);
    r = upsertMorph(r, a, b, 1, m0.id);
    expect(r.patches.filter((x) => x.morph).length).toBe(1);
    expect(r.patches.find((x) => x.morph)!.controlState[vcf.id]!.cutoff).toBeCloseTo(3200, 3);
    expect(r.patches.find((x) => x.morph)!.morph!.t).toBe(1);
    const d = morphDescriptor(q, a, b);
    expect(d.controls.map((c) => c.controlId)).toEqual(['cutoff']);
  });
});
