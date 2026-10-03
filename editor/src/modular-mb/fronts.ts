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

/** Zet een control of poort op een front, achteraan; bestaat het item al, dan
 *  blijft het waar het staat. Maakt het front als het er nog niet is. */
export function addToFront(patch: Patch, frontId: string, item: FrontItem): Patch {
  const fronts = patch.fronts ?? [];
  const f = fronts.find((x) => x.id === frontId);
  if (!f) return { ...patch, fronts: [...fronts, { id: frontId, name: 'Front', items: [item] }] };
  if (item.kind !== 'group' && f.items.some((x) => sameTarget(x, item))) return patch;
  return { ...patch, fronts: fronts.map((x) => (x.id === frontId ? { ...x, items: [...x.items, item] } : x)) };
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
