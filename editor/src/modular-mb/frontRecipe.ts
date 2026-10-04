// Front-recept (doc/plans/patch-front.md stap 3b): de brug tussen het
// AI-raamwerk van de recepten (tools, voorstellen, "Toepassen") en de fronts.
//
//   • `frontCandidates` is wat het model te zien krijgt: per module van de
//     patch de speelbare controls in volgorde van vermoedelijk belang
//     (rankKnobs), met label en huidige stand, en de jacks die als
//     aansluiting van de black box kunnen dienen; plus de fronts die er al
//     zijn.
//   • `FrontSpec` is wat het model teruggeeft (tool `propose_front`): items
//     met module en control/poort als woord of id, zoals de andere tools.
//   • `applyFrontSpec` zet dat om in een echt front: modules en controls
//     oplossen, onbekende items weglaten met een waarschuwing, en het front
//     toevoegen (of vervangen als er al een front met die naam is).

import { addFront, frontIssues } from './fronts';
import { autoFront, patchModulesInSignalOrder, rankKnobs } from './frontPanel';
import { findModuleByWord, findControlByWord, findPortByWord, type EditResult } from './recipe/edits';
import { RecipeError } from './recipe/types';
import {
  defaultValueOf, resolveControls, resolvePorts,
  type FrontItem, type ModularProject, type Patch, type PatchFront,
} from './types';

export interface FrontSpecItem {
  kind: 'control' | 'port' | 'group';
  module?: string; control?: string; port?: string;
  label?: string; size?: 'small' | 'large'; text?: string;
}
export interface FrontSpec {
  name: string;
  description?: string;
  columns?: number;
  items: FrontSpecItem[];
}

/** Wat het model krijgt om een front te ontwerpen. */
export function frontCandidates(project: ModularProject, patchId = project.activePatchId): unknown {
  const patch = project.patches.find((x) => x.id === patchId);
  if (!patch) throw new RecipeError('Geen (actieve) patch.');
  const mods = patchModulesInSignalOrder(patch, project);
  const auto = autoFront(patch, project);
  return {
    patch: { id: patch.id, name: patch.name, description: patch.description ?? '' },
    modules: mods.map((m) => {
      const t = project.moduleTypes.find((x) => x.id === m.typeId);
      const knobs = rankKnobs(m, patch, project);
      const others = resolveControls(m, project.moduleTypes).filter((c) => !knobs.includes(c) && c.kind !== 'display' && c.kind !== 'led');
      const state = patch.controlState[m.id] ?? {};
      return {
        id: m.id, name: m.name, type: m.typeId, role: t?.role ?? 'normal',
        controls: [...knobs, ...others].map((c, i) => ({
          id: c.id, label: patch.controlLabels?.[m.id]?.[c.id] ?? c.label ?? c.id, kind: c.kind,
          rank: i + 1, value: state[c.id] ?? defaultValueOf(c),
        })),
        ports: resolvePorts(m, project.moduleTypes).map((p) => ({ id: p.id, name: p.name, dir: p.direction, signal: p.signalType })),
      };
    }),
    existingFronts: (patch.fronts ?? []).map((f) => ({ id: f.id, name: f.name, items: f.items.length })),
    autoFront: auto.items,
    hint: 'Een front is een view: alleen bestaande controls en poorten, geen waarden. Kies wat een speler nodig heeft; groepeer per functie met kopjes; hoogstens 8-12 knoppen; labels in de taal van de gebruiker.',
  };
}

/** Zet een voorstel om in een front en voeg het toe (of vervang het front
 *  met dezelfde naam). Onbekende modules/controls vallen weg met een
 *  waarschuwing; een leeg resultaat is een fout. */
export function applyFrontSpec(project: ModularProject, patchId: string, spec: FrontSpec, id: string): EditResult {
  const patch = project.patches.find((x) => x.id === patchId);
  if (!patch) throw new RecipeError('Geen actieve patch om een front op te zetten.');
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.items)) throw new RecipeError('propose_front: items ontbreken.');
  const warnings: string[] = [];
  const items: FrontItem[] = [];
  for (const it of spec.items) {
    if (it.kind === 'group') { if (it.text?.trim()) items.push({ kind: 'group', text: it.text.trim() }); continue; }
    const m = it.module ? (project.modules.find((x) => x.id === it.module) ?? findModuleByWord(project, patchId, it.module)) : null;
    if (!m) { warnings.push(`Module "${it.module ?? '?'}" niet gevonden; item overgeslagen.`); continue; }
    if (it.kind === 'control') {
      const cid = it.control && (resolveControls(m, project.moduleTypes).some((c) => c.id === it.control) ? it.control : findControlByWord(project, m, it.control));
      if (!cid) { warnings.push(`${m.name}: control "${it.control ?? '?'}" niet gevonden; overgeslagen.`); continue; }
      items.push({ kind: 'control', moduleId: m.id, controlId: cid, ...(it.label ? { label: it.label.slice(0, 24) } : {}), ...(it.size === 'large' || it.size === 'small' ? { size: it.size } : {}) });
    } else if (it.kind === 'port') {
      const pid = it.port && (resolvePorts(m, project.moduleTypes).some((p) => p.id === it.port) ? it.port : findPortByWord(project, m, it.port));
      if (!pid) { warnings.push(`${m.name}: poort "${it.port ?? '?'}" niet gevonden; overgeslagen.`); continue; }
      items.push({ kind: 'port', moduleId: m.id, portId: pid, ...(it.label ? { label: it.label.slice(0, 24) } : {}) });
    }
  }
  if (!items.some((x) => x.kind !== 'group')) throw new RecipeError('Het voorgestelde front heeft geen enkele bestaande knop of jack.');
  const name = (spec.name ?? '').trim() || 'Front';
  const existing = (patch.fronts ?? []).find((f) => f.name === name);
  const front: PatchFront = {
    id: existing?.id ?? id, name, items,
    ...(spec.description ? { description: spec.description } : {}),
    ...(typeof spec.columns === 'number' && spec.columns >= 1 ? { columns: Math.min(8, Math.round(spec.columns)) } : {}),
  };
  const next: Patch = existing
    ? { ...patch, fronts: (patch.fronts ?? []).map((f) => (f.id === existing.id ? front : f)) }
    : addFront(patch, front);
  const issues = frontIssues(next, project);
  if (issues.length) throw new RecipeError(`Front klopt niet: ${issues.join('; ')}`);
  const n = items.filter((x) => x.kind !== 'group').length;
  return {
    project: { ...project, patches: project.patches.map((x) => (x.id === patchId ? next : x)) },
    summary: `${existing ? 'Front vervangen' : 'Nieuw front'} "${name}" met ${n} ${n === 1 ? 'item' : 'items'}`,
    warnings,
  };
}
