// Bewaren zoals op een synth (ED-RC-9): je werkt in een bewerkbuffer, en
// "Bewaar" legt de versie vast waar je op kunt terugvallen.
//
//   • De patch zelf is altijd de bewerkbuffer en wordt (zoals alles) meteen
//     automatisch opgeslagen: je verliest nooit werk.
//   • `patch.saved` bestaat alleen zolang er iets gewijzigd is: bij de eerste
//     wijziging legt `trackSaved` (aangeroepen vanuit store.updateProject)
//     de vorige toestand vast. Een schone patch kost dus geen extra opslag.
//   • Bewaar = `saved` weg (wat er nu staat is de bewaarde versie).
//     Terug = de bewaarde velden terug, `saved` weg. Bewaar als = kopie van
//     de bewerking als nieuwe patch, het origineel terug naar bewaard.
//     Vergelijk = bewerking en bewaarde versie omwisselen (verliesloos).
//   • Morph-patches doen niet mee: hun inhoud wordt uitgerekend.
//
// Bewaard wordt de klank: kabels, knopstanden, stemmen, racks, envelopes/
// LFO's, poly-overrides. Naam, map en prog# gaan direct.

import type { ModularProject, Patch } from '../types';

export type SavedFields = Pick<Patch, 'connections' | 'controlState' | 'voiceCount' | 'rackIds' | 'envelopes' | 'lfos' | 'polyOverrides'>;

export function snapshotOf(p: Patch): SavedFields {
  return {
    connections: p.connections, controlState: p.controlState, voiceCount: p.voiceCount,
    rackIds: p.rackIds, envelopes: p.envelopes, lfos: p.lfos,
    ...(p.polyOverrides ? { polyOverrides: p.polyOverrides } : {}),
  };
}

const sig = (s: SavedFields): string => JSON.stringify([s.connections, s.controlState, s.voiceCount, s.rackIds, s.envelopes, s.lfos, s.polyOverrides ?? null]);

/** Na elke store-wijziging: leg de bewaarde versie vast bij de eerste
 *  wijziging van een schone patch, en ruim hem op als de bewerking weer
 *  gelijk is aan het bewaarde. */
export function trackSaved(prev: ModularProject, next: ModularProject): ModularProject {
  if (next.patches === prev.patches) return next;
  const before = new Map(prev.patches.map((x) => [x.id, x]));
  let changed = false;
  const patches = next.patches.map((x) => {
    const old = before.get(x.id);
    if (!old || old === x || x.morph) return x;
    const cur = snapshotOf(x);
    if (!x.saved) {
      if (old.saved) return x;   // al bewaard (bijv. net met Bewaar weggehaald) — laat staan
      if (sig(cur) === sig(snapshotOf(old))) return x;   // alleen naam/map/…
      changed = true;
      return { ...x, saved: snapshotOf(old) };
    }
    if (sig(cur) === sig(x.saved)) { changed = true; const { saved: _s, showingSaved: _v, ...rest } = x; void _s; void _v; return rest as Patch; }
    return x;
  });
  return changed ? { ...next, patches } : next;
}

export const isDirty = (p: Patch): boolean => !!p.saved && !p.morph;

/** Bewaar: wat er nu staat wordt de bewaarde versie. */
export function savePatch(p: ModularProject, id: string): ModularProject {
  return { ...p, patches: p.patches.map((x) => {
    if (x.id !== id) return x;
    const { saved: _s, showingSaved: _v, ...rest } = x; void _s; void _v;
    return rest as Patch;
  }) };
}

/** Terug naar de bewaarde versie. Staat de bewaarde versie al voor
 *  (vergelijken), dan is dat simpelweg "bewaar niet". */
export function revertPatch(p: ModularProject, id: string): ModularProject {
  return { ...p, patches: p.patches.map((x) => {
    if (x.id !== id || !x.saved) return x;
    const back = x.showingSaved ? snapshotOf(x) : x.saved;
    const { saved: _s, showingSaved: _v, ...rest } = x; void _s; void _v;
    return { ...(rest as Patch), ...back };
  }) };
}

/** Vergelijk: bewerking en bewaarde versie omwisselen. */
export function toggleShowSaved(p: ModularProject, id: string): ModularProject {
  return { ...p, patches: p.patches.map((x) => {
    if (x.id !== id || !x.saved) return x;
    return { ...x, ...x.saved, saved: snapshotOf(x), showingSaved: !x.showingSaved };
  }) };
}

/** Bewaar als: de bewerking wordt een nieuwe patch; het origineel gaat
 *  terug naar zijn bewaarde versie. Geeft ook de nieuwe id terug. */
export function saveAsPatch(p: ModularProject, id: string, newId: string, name: string): ModularProject {
  const x = p.patches.find((q) => q.id === id);
  if (!x) return p;
  const edited = x.showingSaved && x.saved ? x.saved : snapshotOf(x);
  const { saved: _s, showingSaved: _v, programNumber: _pn, ...rest } = x; void _s; void _v; void _pn;
  const copy: Patch = { ...(JSON.parse(JSON.stringify({ ...rest, ...edited })) as Patch), id: newId, name };
  const reverted = revertPatch(p, id);
  return { ...reverted, patches: [...reverted.patches, copy], activePatchId: newId };
}
