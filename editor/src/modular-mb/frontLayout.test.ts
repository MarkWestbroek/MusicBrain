// Het front als virtueel paneel en het automatische front
// (doc/plans/patch-front.md stap 2).

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ModulePanel } from './ModulePanel';
import { frontIssues } from './fronts';
import { autoFront, buildFrontModule, frontAddModules, frontControlState, patchModulesInSignalOrder, rankKnobs, withNameDisplays } from './frontLayout';
import { findModuleByWord } from './recipe/edits';
import { buildRecipe } from './recipe/compile';
import { seedInternals, seedKrellPatch, seedSoloVoicePatch } from './seedModules';
import { seedEPianoPolyPatch } from './seedShowcase';
import { addBusFx } from './recipe/edits';
import { emptyModularProject, resolveControls, type FrontItem, type ModularProject, type ModuleInstance, type Patch, type PatchFront } from './types';

const resolveControlsOf = (p: ModularProject, m: ModuleInstance) => resolveControls(m, p.moduleTypes);

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject): Patch => p.patches.find((x) => x.id === p.activePatchId)!;

function voice(): { p: ModularProject; vco: string; vcf: string } {
  const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
  const id = active(p).id;
  return { p, vco: findModuleByWord(p, id, 'osc')!.id, vcf: findModuleByWord(p, id, 'filter')!.id };
}

describe('buildFrontModule', () => {
  it('zet elke control en poort op een plek, in rasterrijen van `columns`', () => {
    const { p, vco, vcf } = voice();
    const front: PatchFront = { id: 'f', name: 'Spelen', columns: 2, items: [
      { kind: 'control', moduleId: vcf, controlId: 'cutoff', label: 'Helderheid', size: 'large' },
      { kind: 'control', moduleId: vcf, controlId: 'q' },
      { kind: 'control', moduleId: vco, controlId: 'fine' },
      { kind: 'group', text: 'Aansluitingen' },
      { kind: 'port', moduleId: vcf, portId: 'cv', label: 'Expressie' },
    ] };
    const fm = buildFrontModule(front, active(p), p);
    expect(fm.type.controls.map((c) => c.label)).toEqual(['Helderheid', 'Q', 'Fine']);
    expect(Object.keys(fm.module.visual.controlPlacements).sort()).toEqual(['c0', 'c1', 'c2']);
    expect(fm.module.visual.controlPlacements.c0!.sizeOverride).toBe('large');
    // Rij 1: c0 en c1 naast elkaar; c2 op de volgende rij, eerste kolom.
    const cp = fm.module.visual.controlPlacements;
    expect(cp.c0!.y).toBe(cp.c1!.y);
    expect(cp.c2!.x).toBe(cp.c0!.x);
    expect(cp.c2!.y).toBeGreaterThan(cp.c0!.y);
    expect(fm.type.ports.map((x) => x.name)).toEqual(['Expressie']);
    expect(fm.map.p0).toEqual({ kind: 'port', moduleId: vcf, portId: 'cv' });
    expect(fm.map.c2).toEqual({ kind: 'control', moduleId: vco, controlId: 'fine' });
    expect(fm.module.visual.hpWidth * 5.08).toBeGreaterThanOrEqual(2 * 24 + 10);
  });

  it('versmalt een knop tot het deelbereik en neemt het onderschrift van de patch over', () => {
    const { p, vcf } = voice();
    const patch: Patch = { ...active(p), controlLabels: { [vcf]: { q: 'Resonantie' } } };
    const front: PatchFront = { id: 'f', name: 'F', items: [
      { kind: 'control', moduleId: vcf, controlId: 'cutoff', range: { min: 300, max: 4000 } },   // Hz, binnen 20..18000
      { kind: 'control', moduleId: vcf, controlId: 'q' },
    ] };
    const fm = buildFrontModule(front, patch, p);
    const cutoff = fm.type.controls[0]!;
    expect(cutoff.kind === 'knob' && cutoff.min === 300 && cutoff.max === 4000).toBe(true);
    expect(fm.type.controls[1]!.label).toBe('Resonantie');
  });

  it('leest waarden uit de patch met de live waarden eroverheen', () => {
    const { p, vcf } = voice();
    const patch: Patch = { ...active(p), controlState: { ...active(p).controlState, [vcf]: { cutoff: 0.3, q: 0.1 } } };
    const front: PatchFront = { id: 'f', name: 'F', items: [
      { kind: 'control', moduleId: vcf, controlId: 'cutoff' }, { kind: 'control', moduleId: vcf, controlId: 'q' },
    ] };
    const fm = buildFrontModule(front, patch, p);
    expect(frontControlState(fm, patch)).toEqual({ c0: 0.3, c1: 0.1 });
    expect(frontControlState(fm, patch, { [vcf]: { cutoff: 0.9 } })).toEqual({ c0: 0.9, c1: 0.1 });
  });

  it('tekent via ModulePanel: naam, labels en jack in de SVG', () => {
    const { p, vcf } = voice();
    const front: PatchFront = { id: 'f', name: 'Spelen', items: [
      { kind: 'control', moduleId: vcf, controlId: 'cutoff', label: 'Helderheid' },
      { kind: 'port', moduleId: vcf, portId: 'cv', label: 'Expressie' },
    ] };
    const fm = buildFrontModule(front, active(p), p);
    const svg = renderToStaticMarkup(createElement(ModulePanel, {
      module: fm.module, types: [fm.type], controlState: frontControlState(fm, active(p)),
    }));
    expect(svg).toContain('Spelen');
    expect(svg).toContain('Helderheid');
    expect(svg).toContain('Expressie');
  });
});

describe('buildFrontModule: vrije plaatsing', () => {
  it('zet een item met pos op zijn eigen mm, buiten het raster, en maakt het paneel hoog genoeg', () => {
    const { p, vcf, vco } = voice();
    const front: PatchFront = { id: 'f', name: 'Vrij', columns: 2, items: [
      { kind: 'control', moduleId: vcf, controlId: 'cutoff' },
      { kind: 'control', moduleId: vco, controlId: 'fine', pos: { x: 30, y: 120 } },
      { kind: 'port', moduleId: vcf, portId: 'cv', pos: { x: 60, y: 130 } },
    ] };
    const fm = buildFrontModule(front, active(p), p);
    const cp = fm.module.visual.controlPlacements;
    expect(cp.c0!.y).toBeLessThan(60);
    expect(cp.c1).toMatchObject({ x: 30, y: 120 });
    expect(fm.module.visual.portPlacements.p0).toMatchObject({ x: 60, y: 130 });
    expect(fm.heightMm).toBeGreaterThanOrEqual(130 + 8);
  });
});

describe('patchModulesInSignalOrder', () => {
  it('zet de bron vóór het filter en laat poly-followers weg', () => {
    const p = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'vcf' });
    const patch = active(p);
    const order = patchModulesInSignalOrder(patch, p);
    const types = order.map((m) => m.typeId);
    expect(types.indexOf('tp_mmb_vco')).toBeLessThan(types.indexOf('tp_mmb_vcf'));
    expect(types.filter((t) => t === 'tp_mmb_vco')).toHaveLength(1);   // 4 stemmen, 1 master
  });
});

describe('rankKnobs', () => {
  it('zet de playable-controls uit de catalogus voorop, dan bewust gezette, dan paneelvolgorde', () => {
    const { p, vcf } = voice();
    const m = p.modules.find((x) => x.id === vcf)!;
    const panel = (resolveControlsOf(p, m)).filter((c) => c.kind === 'knob' || c.kind === 'slider').map((c) => c.id);
    // VCF staat in de catalogus met cutoff, q, cv_amt: die komen eerst.
    expect(rankKnobs(m, active(p), p).slice(0, 2).map((c) => c.id)).toEqual(['cutoff', 'q']);
    // Een module zonder catalogus-regel: een afwijkende waarde telt.
    const krell = seedKrellPatch(base());
    const kp = active(krell);
    const stages = patchModulesInSignalOrder(kp, krell).find((x) => x.typeId === 'tp_mmb_stages')!;
    const knobs = resolveControlsOf(krell, stages).filter((c) => c.kind === 'knob');
    const third = knobs[2]!;
    const kp2: Patch = { ...kp, controlState: { ...kp.controlState, [stages.id]: { [third.id]: (third.kind === 'knob' ? third.max : 1) } } };
    const base2: Patch = { ...kp, controlState: { ...kp.controlState, [stages.id]: {} } };
    expect(rankKnobs(stages, base2, krell).map((c) => c.id)).toEqual(knobs.map((c) => c.id));
    expect(rankKnobs(stages, kp2, krell)[0]!.id).toBe(third.id);
    expect(panel.length).toBeGreaterThan(0);
  });
});

describe('autoFront: E-piano', () => {
  it('zet Type (karakterschakelaar) op het front en toont een stereopaar DRIVE één keer', () => {
    const p0 = seedEPianoPolyPatch(base());
    const p = addBusFx(p0, p0.activePatchId!, 'drive').project;   // DRIVE als L/R-paar op de bus
    const patch = active(p);
    const f = autoFront(patch, p);
    const controls = f.items.filter((it): it is Extract<FrontItem, { kind: 'control' }> => it.kind === 'control');
    const piano = p.modules.find((m) => m.typeId === 'tp_mmb_epiano' && controls.some((c) => c.moduleId === m.id))!;
    expect(controls.some((c) => c.moduleId === piano.id && c.controlId === 'type')).toBe(true);
    const drives = new Set(controls.filter((c) => p.modules.find((m) => m.id === c.moduleId)?.typeId === 'tp_mmb_drive').map((c) => c.moduleId));
    expect(drives.size).toBe(1);
  });
});

describe('autoFront', () => {
  it('levert voor een seed-patch hoogstens acht knoppen die allemaal bestaan', () => {
    const p = seedKrellPatch(base());
    const patch = active(p);
    const f = autoFront(patch, p);
    const controls = f.items.filter((it) => it.kind === 'control');
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.length).toBeLessThanOrEqual(8);
    expect(frontIssues({ ...patch, fronts: [f] }, p)).toEqual([]);
    const keys = controls.map((it) => it.kind === 'control' ? `${it.moduleId}/${it.controlId}` : '');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('zet in een receptpatch de klankketen vóór de modulatoren', () => {
    const { p, vco, vcf } = voice();
    const f = autoFront(active(p), p);
    const controls = f.items.filter((it): it is Extract<FrontItem, { kind: 'control' }> => it.kind === 'control');
    expect(controls[0]!.moduleId).toBe(vco);
    expect(controls.slice(0, 4).some((it) => it.moduleId === vcf && it.controlId === 'cutoff')).toBe(true);
  });

  it('zet gelabelde en gebonden controls voorop, groot', () => {
    const { p, vco, vcf } = voice();
    const patch: Patch = { ...active(p), controlLabels: { [vcf]: { q: 'Resonantie' } } };
    const proj: ModularProject = { ...p, midiMap: { bindings: [{ ch: 1, cc: 74, mod: vco, ctrl: 'fine', min: -1, max: 1 }] } };
    const f = autoFront(patch, proj);
    const first = f.items[0]!, second = f.items[1]!;
    expect(first).toMatchObject({ kind: 'control', moduleId: vcf, controlId: 'q', size: 'large' });
    expect(second).toMatchObject({ kind: 'control', moduleId: vco, controlId: 'fine' });
  });
});

describe('displays op een front', () => {
  const dx7 = (): { p: ModularProject; patch: Patch; id: string } => {
    const p = seedSoloVoicePatch(base(), 'tp_mmb_dx7', 'DX7', 'out', 'out', { bank: 2, program: 5, level: 0.8 });
    const patch = active(p);
    const inPatch = new Set(p.racks.filter((r) => patch.rackIds.includes(r.id)).flatMap((r) => r.slots.map((x) => x.moduleId)));
    return { p, patch, id: p.modules.find((m) => m.typeId === 'tp_mmb_dx7' && inPatch.has(m.id))!.id };
  };
  const nameOf = (p: ModularProject, id: string, bank: number, program: number): string => {
    const d = resolveControlsOf(p, p.modules.find((m) => m.id === id)!).find((c) => c.id === 'voiceName')!;
    return d.kind === 'display' ? d.lookup![bank]![program]! : '';
  };

  it('toont de voicenaam van de DX7, ook als Bank en Program zelf niet op het front staan', () => {
    const { p, patch, id } = dx7();
    const front: PatchFront = { id: 'f', name: 'F', items: [
      { kind: 'control', moduleId: id, controlId: 'voiceName' },
      { kind: 'control', moduleId: id, controlId: 'level' },
    ] };
    const fm = buildFrontModule(front, patch, p);
    expect(fm.type.controls.map((c) => c.kind)).toEqual(['display', 'knob']);
    const state = frontControlState(fm, patch);
    const svg = renderToStaticMarkup(createElement(ModulePanel, { module: fm.module, types: [fm.type], controlState: state }));
    expect(svg).toContain(nameOf(p, id, 2, 5).trimEnd());
    // De live waarde van de engine of de Teensy gaat voor de patch.
    const live = frontControlState(fm, patch, { [id]: { program: 6 } });
    const svg2 = renderToStaticMarkup(createElement(ModulePanel, { module: fm.module, types: [fm.type], controlState: live }));
    expect(svg2).toContain(nameOf(p, id, 2, 6).trimEnd());
  });

  it('valt zonder waarde in de patch terug op de standaard van de gebonden knop', () => {
    const { p, patch, id } = dx7();
    const bare: Patch = { ...patch, controlState: { ...patch.controlState, [id]: {} } };
    const fm = buildFrontModule({ id: 'f', name: 'F', items: [{ kind: 'control', moduleId: id, controlId: 'voiceName' }] }, bare, p);
    const svg = renderToStaticMarkup(createElement(ModulePanel, { module: fm.module, types: [fm.type], controlState: frontControlState(fm, bare) }));
    expect(svg).toContain(nameOf(p, id, 0, 0).trimEnd());
  });

  it('geeft een groot display twee cellen en breekt de rij als het niet meer past', () => {
    const { p, patch, id } = dx7();
    const front: PatchFront = { id: 'f', name: 'F', columns: 4, items: [
      { kind: 'control', moduleId: id, controlId: 'bank' },
      { kind: 'control', moduleId: id, controlId: 'program' },
      { kind: 'control', moduleId: id, controlId: 'level' },
      { kind: 'control', moduleId: id, controlId: 'voiceName', size: 'large' },   // past niet meer: nieuwe rij
      { kind: 'control', moduleId: id, controlId: 'coarse' },
    ] };
    const cp = buildFrontModule(front, patch, p).module.visual.controlPlacements;
    expect(cp.c3!.y).toBeGreaterThan(cp.c0!.y);
    expect(cp.c3!.x).toBe(5 + 24);              // midden van kolom 0 en 1
    expect(cp.c4!.y).toBe(cp.c3!.y);
    expect(cp.c4!.x).toBe(5 + 24 * 2.5);        // derde kolom
  });

  it('zet in het automatische front de naam vóór Bank en Program, en telt hem niet als knop', () => {
    const { p, patch, id } = dx7();
    const f = autoFront(patch, p);
    const controls = f.items.filter((it): it is Extract<FrontItem, { kind: 'control' }> => it.kind === 'control');
    const at = controls.findIndex((c) => c.moduleId === id && c.controlId === 'voiceName');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(controls[at]!.size).toBe('large');
    expect(controls[at + 1]).toMatchObject({ moduleId: id, controlId: 'bank' });
    // Het kopje van de module blijft boven het display staan.
    const raw = f.items.findIndex((it) => it.kind === 'control' && it.controlId === 'voiceName');
    expect(f.items[raw - 1]).toMatchObject({ kind: 'group' });
    // Cijferdisplays (bnkDisp, prgDisp) komen niet vanzelf mee.
    expect(controls.some((c) => c.controlId === 'bnkDisp' || c.controlId === 'prgDisp')).toBe(false);
    expect(frontIssues({ ...patch, fronts: [f] }, p)).toEqual([]);
    expect(withNameDisplays(f.items, p)).toEqual(f.items);   // idempotent
  });

  it('laat een LED de lopende stap van de sequencer volgen', () => {
    const p0 = base();
    const isStepLed = (c: { kind: string; bindTo?: string; bindMatch?: number }): boolean => c.kind === 'led' && c.bindTo === '__currentStep' && c.bindMatch === 3;
    const seqType = p0.moduleTypes.find((t) => t.controls.some(isStepLed))!;
    const led = seqType.controls.find(isStepLed)!;
    const m: ModuleInstance = { ...p0.modules[0]!, id: 'seq1', typeId: seqType.id, name: 'SEQ' };
    const p: ModularProject = { ...p0, modules: [...p0.modules, m] };
    const patch = active(seedSoloVoicePatch(p, 'tp_mmb_vco', 'VCO', 'out', 'out', {}));
    const fm = buildFrontModule({ id: 'f', name: 'F', items: [{ kind: 'control', moduleId: 'seq1', controlId: led.id }] }, patch, p);
    const key = fm.type.controls[0]!.kind === 'led' ? fm.type.controls[0]!.bindTo! : '';
    expect(frontControlState(fm, patch)[key]).toBeUndefined();   // sim staat stil
    expect(frontControlState(fm, patch, { seq1: { __currentStep: 3 } })[key]).toBe(3);
  });
});

describe('frontAddModules (de lijst achter + Toevoegen)', () => {
  it('geeft elke module van de patch één keer, in signaalvolgorde, met een naam die dubbelen uit elkaar houdt', () => {
    const { p } = voice();   // twee AHDSR's (filter en amp)
    const patch = active(p);
    const list = frontAddModules(patch, p);
    expect(list.map((x) => x.id)).toEqual(patchModulesInSignalOrder(patch, p).map((m) => m.id));
    const labels = list.map((x) => x.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((l) => /AHDSR/.test(l)).length).toBeGreaterThanOrEqual(2);
  });
});
