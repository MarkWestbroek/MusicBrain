// Patch-fronts, datamodel (doc/plans/patch-front.md stap 1): snoeien bij
// laden en bij edits, de contract-stijl toets, en het meenemen van fronts in
// een patch-snapshot. Weergave en Front-tab zijn een volgende stap.

import { describe, expect, it } from 'vitest';

import {
  addFront, addToFront, frontIssues, insertFrontItem, isOnFront, moveFrontItem, newFront, pruneFronts,
  removeFromFront, removeFront, removeFrontItemAt, updateFront, updateFrontItem,
} from './fronts';
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

describe('fronts: bewerken', () => {
  it('verplaatst, wijzigt, voegt in en verwijdert items; naam en kolommen', () => {
    const { p, vcf, vco } = withFront();
    let f = active(p);
    const id = 'front_speel';
    f = moveFrontItem(f, id, 2, -1);
    expect(f.fronts![0]!.items.map((it) => it.kind)).toEqual(['control', 'control', 'group', 'port']);
    f = moveFrontItem(f, id, 0, -1);   // buiten bereik: ongewijzigd
    expect(f.fronts![0]!.items[0]).toMatchObject({ moduleId: vcf, controlId: 'cutoff' });
    f = updateFrontItem(f, id, 1, (it) => (it.kind === 'control' ? { ...it, label: 'Fijn', size: 'large' } : it));
    expect(f.fronts![0]!.items[1]).toMatchObject({ moduleId: vco, controlId: 'fine', label: 'Fijn', size: 'large' });
    f = insertFrontItem(f, id, 0, { kind: 'group', text: 'Klank' });
    expect(f.fronts![0]!.items[0]).toEqual({ kind: 'group', text: 'Klank' });
    f = removeFrontItemAt(f, id, 0);
    expect(f.fronts![0]!.items).toHaveLength(4);
    f = updateFront(f, id, { name: 'Live', columns: 2, description: 'Twee kolommen' });
    expect(f.fronts![0]).toMatchObject({ name: 'Live', columns: 2, description: 'Twee kolommen' });
    expect(isOnFront(f.fronts![0]!, { kind: 'control', moduleId: vcf, controlId: 'cutoff' })).toBe(true);
    expect(isOnFront(f.fronts![0]!, { kind: 'control', moduleId: vcf, controlId: 'q' })).toBe(false);
    f = addFront(f, newFront('front_2', 'Tweede'));
    expect(f.fronts).toHaveLength(2);
    f = removeFront(f, id);
    f = removeFront(f, 'front_2');
    expect(f.fronts).toBeUndefined();
  });
});

describe('fronts: plaats van een nieuw item', () => {
  it('zet een knop bij de knoppen van zijn eigen module, niet achteraan in de laatste tegel', () => {
    const { p, vcf, vco } = withFront();
    // Front: [vcf cutoff] [kopje Toon] [vco fine] [vcf cv-jack]
    const f = addToFront(active(p), 'front_speel', { kind: 'control', moduleId: vcf, controlId: 'resonance' }, 'VCF');
    expect(f.fronts![0]!.items.map((it) => (it.kind === 'control' ? `${it.moduleId === vcf ? 'vcf' : 'vco'}.${it.controlId}` : it.kind)))
      .toEqual(['vcf.cutoff', 'vcf.resonance', 'group', 'vco.fine', 'port']);
    const g = addToFront(active(p), 'front_speel', { kind: 'control', moduleId: vco, controlId: 'coarse' }, 'VCO');
    expect(g.fronts![0]!.items.map((it) => (it.kind === 'control' ? it.controlId : it.kind))).toEqual(['cutoff', 'group', 'fine', 'coarse', 'port']);
  });

  it('geeft een module zonder soortgenoot een eigen kopje vóór de jacks; een jack komt achteraan', () => {
    const { p, vcf } = withFront();
    const other = active(p).fronts![0]!.items.find((it) => it.kind === 'control')!.moduleId;
    const vca = findModuleByWord(p, active(p).id, 'vca')?.id;
    const mod = vca && vca !== other && vca !== vcf ? vca : null;
    expect(mod).toBeTruthy();
    if (!mod) return;
    const f = addToFront(active(p), 'front_speel', { kind: 'control', moduleId: mod, controlId: 'gain' }, 'VCA');
    const kinds = f.fronts![0]!.items.map((it) => (it.kind === 'group' ? `group:${it.text}` : it.kind));
    expect(kinds).toEqual(['control', 'group:Toon', 'control', 'group:VCA', 'control', 'port']);
    const g = addToFront(active(p), 'front_speel', { kind: 'port', moduleId: mod, portId: 'in' });
    expect(g.fronts![0]!.items.at(-1)).toEqual({ kind: 'port', moduleId: mod, portId: 'in' });
  });
});
