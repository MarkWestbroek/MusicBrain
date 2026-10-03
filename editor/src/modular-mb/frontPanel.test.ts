// Het front als virtueel paneel en het automatische front
// (doc/plans/patch-front.md stap 2).

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { ModulePanel } from './ModulePanel';
import { frontIssues } from './fronts';
import { autoFront, buildFrontModule, frontControlState, patchModulesInSignalOrder } from './frontPanel';
import { findModuleByWord } from './recipe/edits';
import { buildRecipe } from './recipe/compile';
import { seedInternals, seedKrellPatch } from './seedModules';
import { emptyModularProject, type ModularProject, type Patch, type PatchFront } from './types';

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
