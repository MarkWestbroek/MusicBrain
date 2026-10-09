// CMI-stemmen voorzien van hun golfvormen (doc/plans/fairlight.md, stap 3).
// Het profiel staat in de patch (`patch.moduleData[masterId].cmi`); elke
// stem van een PolyGroup krijgt dat van de master. COMPUTE (cmiProfile.ts)
// maakt er de tabel van die de stem verwacht; die gaat naar de simulator
// (wasm-blob, blijft staan over een herbouw) en, als de link open is, naar de
// Teensy (`wavetable`-bericht, ná de config). Zuiver: de engine
// (AudioEngine.build) en de link (teensyLink.sendConfig) roepen dit aan.

import { CMI_TYPE, computeTable, decodeProfile, preset, type CmiProfile } from './cmiProfile';
import type { ModularProject, Patch } from './types';

/** Voor elke CMI-stem in de patch: zijn id en de module waar het profiel bij hoort. */
export function cmiVoices(project: ModularProject, patch: Patch): { id: string; owner: string }[] {
  const inRacks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const ids = new Set(inRacks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  const master = new Map<string, string>();
  for (const r of inRacks) for (const g of r.polyGroups ?? []) {
    const first = g.members[0];
    if (first?.kind !== 'module') continue;
    for (const m of g.members) if (m.kind === 'module') master.set(m.moduleId, first.moduleId);
  }
  return project.modules.filter((m) => ids.has(m.id) && m.typeId === CMI_TYPE)
    .map((m) => ({ id: m.id, owner: master.get(m.id) ?? m.id }));
}

/** Het profiel van een stem: uit de patch, anders het ingebouwde (koper). */
export function profileOf(patch: Patch, owner: string): CmiProfile {
  return decodeProfile(patch.moduleData?.[owner]?.cmi) ?? preset('brass');
}

// COMPUTE kost ~100k sinusproducten: per profieltekst onthouden.
const cache = new Map<string, Int16Array>();
export function tableFor(patch: Patch, owner: string): Int16Array {
  const key = patch.moduleData?.[owner]?.cmi ?? '';
  let t = cache.get(key);
  if (!t) {
    t = computeTable(profileOf(patch, owner));
    if (cache.size > 32) cache.clear();
    cache.set(key, t);
  }
  return t;
}

/** Per stem de tabel: voor de simulator (blob) en de Teensy (getallen). */
export function cmiTables(project: ModularProject, patch: Patch): { id: string; table: Int16Array }[] {
  return cmiVoices(project, patch).map((v) => ({ id: v.id, table: tableFor(patch, v.owner) }));
}

/** De berichten voor de Teensy: per stem de tabel als getallen. */
export function cmiTeensyFrames(project: ModularProject, patch: Patch): { id: string; data: number[] }[] {
  return cmiVoices(project, patch).map((v) => ({ id: v.id, data: Array.from(tableFor(patch, v.owner)) }));
}
