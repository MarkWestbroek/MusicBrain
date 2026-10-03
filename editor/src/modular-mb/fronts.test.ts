// Patch-fronts, datamodel (doc/plans/patch-front.md stap 1): snoeien bij
// laden en bij edits, de contract-stijl toets, en het meenemen van fronts in
// een patch-snapshot. Weergave en Front-tab zijn een volgende stap.

import { describe, expect, it } from 'vitest';

import { addToFront, frontIssues, newFront, pruneFronts, removeFromFront } from './fronts';
import { removeModule, replaceModule, findModuleByWord } from './recipe/edits';
import { buildRecipe } from './recipe/compile';
import { seedInternals } from './seedModules';
import { addPatchSnapshot } from './sim/takeLibrary';
import { patchSnapshot } from './sim/midiRecorder';
import { emptyModularProject, migrateProject, type FrontItem, type ModularProject, type Patch } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject): Patch => p.patches.find((x) => x.id === p.activePatchId)!;
let n = 0;
const fresh = (prefix: string) => `${prefix}_${++n}`;

/** Een stem met VCO → VCF → VCA, en een front met de cutoff, de VCO-tune en de VCF-CV-ingang. */
function withFront(): { p: ModularProject; vcf: string; vco: string } {
  const p0 = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
  const patch = active(p0);
  const vcf = findModuleByWord(p0, patch.id, 'filter')!.id;
  const vco = findModuleByWord(p0, patch.id, 'osc')!.id;
  let f = addToFront(patch, 'front_speel', { kind: 'control', moduleId: vcf, controlId: 'cutoff', label: 'Helderheid', size: 'large' });
  f = addToFront(f, 'front_speel', { kind: 'group', text: 'Toon' });
  f = addToFront(f, 'front_speel', { kind: 'control', moduleId: vco, controlId: 'fine' });
  f = addToFront(f, 'front_speel', { kind: 'port', moduleId: vcf, portId: 'cv', label: 'Expressie' });
  return { p: { ...p0, patches: p0.patches.map((x) => (x.id === f.id ? f : x)) }, vcf, vco };
}
const items = (p: ModularProject): FrontItem[] => active(p).fronts![0]!.items;

describe('fronts: opbouw', () => {
  it('voegt items toe in volgorde en nooit dubbel', () => {
    const { p, vcf } = withFront();
    expect(frontIssues(active(p), p)).toEqual([]);
    expect(items(p).map((it) => it.kind)).toEqual(['control', 'group', 'control', 'port']);
    const again = addToFront(active(p), 'front_speel', { kind: 'control', moduleId: vcf, controlId: 'cutoff' });
    expect(again).toBe(active(p));
  });

  it('haalt een item weer weg', () => {
    const { p, vco } = withFront();
    const f = removeFromFront(active(p), 'front_speel', { kind: 'control', moduleId: vco, controlId: 'fine' });
    expect(f.fronts![0]!.items).toHaveLength(3);
  });

  it('meldt verwijzingen die niet kloppen', () => {
    const { p, vcf } = withFront();
    const bad: Patch = { ...active(p), fronts: [newFront('front_x', 'Fout', [
      { kind: 'control', moduleId: 'mod_weg', controlId: 'cutoff' },
      { kind: 'control', moduleId: vcf, controlId: 'bestaat_niet' },
      { kind: 'port', moduleId: vcf, portId: 'bestaat_niet' },
      { kind: 'control', moduleId: vcf, controlId: 'cutoff', range: { min: 0.8, max: 0.2 } },
    ])] };
    expect(frontIssues(bad, p)).toHaveLength(4);
  });
});

describe('fronts: snoeien', () => {
  it('laat een kloppend front met rust (zelfde object)', () => {
    const { p } = withFront();
    expect(pruneFronts(active(p), p)).toBe(active(p));
  });

  it('snoeit bij laden items naar verdwenen modules, maar niet de groepskopjes', () => {
    const { p, vco } = withFront();
    const broken = { ...p, modules: p.modules.filter((m) => m.id !== vco) };
    const loaded = migrateProject(JSON.parse(JSON.stringify(broken)))!;
    expect(items(loaded).map((it) => it.kind)).toEqual(['control', 'group', 'port']);
  });

  it('snoeit bij removeModule de items van die module', () => {
    const { p, vcf } = withFront();
    const r = removeModule(p, active(p).id, vcf);
    expect(items(r.project).map((it) => it.kind)).toEqual(['group', 'control']);
    expect(frontIssues(active(r.project), r.project)).toEqual([]);
  });

  it('houdt bij replaceModule de items die het nieuwe type ook heeft', () => {
    const { p, vcf } = withFront();
    const r = replaceModule(p, active(p).id, vcf, 'ms20');
    expect(frontIssues(active(r.project), r.project)).toEqual([]);
    // cutoff bestaat op de MS-20 ook; de cv-poort heet daar anders of niet.
    expect(items(r.project).some((it) => it.kind === 'control' && it.controlId === 'cutoff')).toBe(true);
  });
});

describe('fronts: snapshot', () => {
  it('gaan mee in een patch-snapshot en volgen de hernoemde module-ids', () => {
    const { p } = withFront();
    const snap = patchSnapshot(p, active(p));
    const p2 = addPatchSnapshot(base(), snap, 'Kopie', fresh);
    const copy = active(p2);
    expect(copy.fronts).toHaveLength(1);
    expect(frontIssues(copy, p2)).toEqual([]);
    const ids = new Set(p2.modules.map((m) => m.id));
    for (const it of copy.fronts![0]!.items) if (it.kind !== 'group') expect(ids.has(it.moduleId)).toBe(true);
  });
});
