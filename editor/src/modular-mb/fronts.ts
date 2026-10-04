// Patch-fronts: de black-box-kant van een patch (doc/plans/patch-front.md).
//
// Een front is een view op de patch: een geordende selectie van controls en
// poorten met een eigen label en rasterlayout. De waarden staan niet in het
// front maar in `patch.controlState`; draaien op het front wijzigt de patch.
// Hier staat alles wat met het datamodel te maken heeft: snoeien van items
// die naar verdwenen modules, controls of poorten wijzen, en de toets die
// contract.test.ts-stijl gebruikt. De weergave (het virtuele paneel) en de
// Front-tab komen in een volgende stap.

import {
  resolveControls, resolvePorts,
  type FrontItem, type ModularProject, type Patch, type PatchFront,
} from './types';

export { pruneAllFronts, pruneFronts } from './types';

/** Een leeg front. De id komt van de aanroeper (`uid('front')`), zodat dit
 *  bestand niets uit de store hoeft te importeren. */
export function newFront(id: string, name: string, items: FrontItem[] = []): PatchFront {
  return { id, name, items };
}

/** Wat er mis is met de fronts van een patch, als tekst per item; leeg = alles
 *  klopt. Een `group`-item kan niet fout zijn. */
export function frontIssues(patch: Patch, project: ModularProject): string[] {
  const out: string[] = [];
  for (const f of patch.fronts ?? []) {
    for (const it of f.items) {
      if (it.kind === 'group') continue;
      const m = project.modules.find((x) => x.id === it.moduleId);
      if (!m) { out.push(`${f.name}: module ${it.moduleId} bestaat niet`); continue; }
      if (it.kind === 'control') {
        if (!resolveControls(m, project.moduleTypes).some((c) => c.id === it.controlId))
          out.push(`${f.name}: ${m.name} heeft geen control ${it.controlId}`);
        else if (it.range && !(it.range.min < it.range.max))
          out.push(`${f.name}: ${m.name}.${it.controlId} heeft een leeg bereik`);
      } else if (!resolvePorts(m, project.moduleTypes).some((p) => p.id === it.portId)) {
        out.push(`${f.name}: ${m.name} heeft geen poort ${it.portId}`);
      }
    }
  }
  return out;
}

/** Zet een control of poort op een front; bestaat het item al, dan blijft
 *  het waar het staat. Maakt het front als het er nog niet is.
 *
 *  Waar komt het te staan? Bij zijn eigen module: direct na het laatste item
 *  van dezelfde module en soort (knop bij de knoppen, jack bij de jacks).
 *  Zonder soortgenoot: een knop krijgt, als `groupText` (de modulenaam)
 *  meekomt, een eigen kopje na de laatste knop (dus vóór de jacks); anders
 *  achteraan. Zomaar achteraan zetten leek logisch, maar op een front met
 *  kopjes belandde de Type-schakelaar van de E-piano dan in de tegel van
 *  MMB OUT. */
export function addToFront(patch: Patch, frontId: string, item: FrontItem, groupText?: string): Patch {
  const fronts = patch.fronts ?? [];
  const f = fronts.find((x) => x.id === frontId);
  if (!f) return { ...patch, fronts: [...fronts, { id: frontId, name: 'Front', items: [item] }] };
  if (item.kind !== 'group' && f.items.some((x) => sameTarget(x, item))) return patch;
  const items = [...f.items];
  if (item.kind === 'group') items.push(item);
  else {
    const lastOf = (pred: (x: FrontItem) => boolean): number => { let i = -1; items.forEach((x, k) => { if (pred(x)) i = k; }); return i; };
    const sibling = lastOf((x) => x.kind === item.kind && x.moduleId === item.moduleId);
    if (sibling >= 0) items.splice(sibling + 1, 0, item);
    else if (item.kind === 'control' && groupText && items.some((x) => x.kind === 'group')) {
      const lastControl = lastOf((x) => x.kind === 'control');
      items.splice(lastControl + 1, 0, { kind: 'group', text: groupText }, item);
    } else items.push(item);
  }
  return { ...patch, fronts: fronts.map((x) => (x.id === frontId ? { ...x, items } : x)) };
}

/** Haal een control of poort van een front. */
export function removeFromFront(patch: Patch, frontId: string, item: FrontItem): Patch {
  const fronts = patch.fronts ?? [];
  if (!fronts.some((x) => x.id === frontId)) return patch;
  return {
    ...patch,
    fronts: fronts.map((x) => (x.id === frontId ? { ...x, items: x.items.filter((y) => !sameTarget(y, item)) } : x)),
  };
}

function sameTarget(a: FrontItem, b: FrontItem): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'group' || b.kind === 'group') return a.kind === 'group' && b.kind === 'group' && a.text === b.text;
  if (a.moduleId !== b.moduleId) return false;
  return a.kind === 'control' && b.kind === 'control' ? a.controlId === b.controlId
    : a.kind === 'port' && b.kind === 'port' ? a.portId === b.portId : false;
}

// ── Bewerken van een front (Front-tab) ────────────────────────────────────

function withFront(patch: Patch, frontId: string, fn: (f: PatchFront) => PatchFront): Patch {
  if (!patch.fronts?.some((f) => f.id === frontId)) return patch;
  return { ...patch, fronts: patch.fronts.map((f) => (f.id === frontId ? fn(f) : f)) };
}

export function addFront(patch: Patch, front: PatchFront): Patch {
  return { ...patch, fronts: [...(patch.fronts ?? []), front] };
}

export function removeFront(patch: Patch, frontId: string): Patch {
  const fronts = (patch.fronts ?? []).filter((f) => f.id !== frontId);
  const { fronts: _f, ...rest } = patch; void _f;
  return fronts.length ? { ...rest, fronts } : rest;
}

export function updateFront(patch: Patch, frontId: string, change: Partial<Omit<PatchFront, 'id' | 'items'>>): Patch {
  return withFront(patch, frontId, (f) => ({ ...f, ...change }));
}

/** Verplaats item `index` met `delta` plekken (−1 omhoog, +1 omlaag). */
export function moveFrontItem(patch: Patch, frontId: string, index: number, delta: number): Patch {
  return withFront(patch, frontId, (f) => {
    const to = index + delta;
    if (index < 0 || index >= f.items.length || to < 0 || to >= f.items.length) return f;
    const items = [...f.items];
    const [it] = items.splice(index, 1);
    items.splice(to, 0, it!);
    return { ...f, items };
  });
}

export function updateFrontItem(patch: Patch, frontId: string, index: number, fn: (it: FrontItem) => FrontItem): Patch {
  return withFront(patch, frontId, (f) => ({ ...f, items: f.items.map((it, i) => (i === index ? fn(it) : it)) }));
}

export function insertFrontItem(patch: Patch, frontId: string, index: number, item: FrontItem): Patch {
  return withFront(patch, frontId, (f) => {
    const items = [...f.items];
    items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
    return { ...f, items };
  });
}

export function removeFrontItemAt(patch: Patch, frontId: string, index: number): Patch {
  return withFront(patch, frontId, (f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
}

/** Staat dit doel (control of poort) op het front? */
export function isOnFront(front: PatchFront, item: FrontItem): boolean {
  return front.items.some((x) => sameTarget(x, item));
}
