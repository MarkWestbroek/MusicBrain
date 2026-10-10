// Patchcontrole bij binnenkomst (doc/plans/editor-structuur.md §2, stap 0b).
//
// Elke keer dat er patches binnenkomen, draait `checkPatch` erover: bij het
// opstarten, bij een import, bij Nieuw of een preset (het hele project), en
// bij één patch uit de pool, een take of SysEx (`admitPatch`). Wat zeker is
// wordt hersteld; de rest wordt gemeld. Nooit stil: de melding (IntakeNotice)
// laat zien wat er gebeurd is, en het herstel is een gewone bewerking met
// undo.
//
// Verouderde moduletypes: een project bewaart zijn eigen types. Zijn die
// ouder dan de types van deze editor, dan zegt de controle dat, en biedt
// "Modules verversen" aan (hetzelfde als de knop Internals). Dat gebeurt
// niet vanzelf: het vervangt panelen, en dat besluit is aan de gebruiker.

import { checkPatch, repairPatch, type Finding } from './patchCheck';
import { seedInternals } from './seedModules';
import { getProject, updateProject } from './store';
import { emptyModularProject, type ModularProject, type ModuleType } from './types';

export interface PatchReport { patchId: string; patchName: string; findings: Finding[] }
export interface IntakeReport {
  /** Waar het vandaan kwam, voor de melding ("bij het laden", "uit de pool"). */
  source: string;
  patches: PatchReport[];
  /** Interne moduletypes die in dit project ouder zijn dan in deze editor. */
  staleTypes: string[];
  /** Het project direct na het herstel: "Ongedaan maken" mag alleen zolang
   *  er daarna niets meer veranderd is, anders draait undo jouw eigen werk terug. */
  after?: ModularProject;
}

let currentTypes: ModuleType[] | null = null;
/** De interne moduletypes van deze editor (eenmalig opgebouwd). */
export function editorModuleTypes(): ModuleType[] {
  return (currentTypes ??= seedInternals(emptyModularProject()).moduleTypes);
}

/** Wat een type voor de controle betekent: poorten en controls met hun
 *  soort en bereik. Paneelopmaak telt niet mee. */
function signature(t: ModuleType): string {
  return JSON.stringify([
    t.ports.map((p) => [p.id, p.direction, p.signalType]).sort(),
    t.controls.map((c) => [c.id, c.kind,
      'min' in c ? c.min : null, 'max' in c ? c.max : null,
      c.kind === 'switch' ? c.positions.length : null]).sort(),
  ]);
}

/** Interne types die in het project anders zijn dan in deze editor (en
 *  door een patch gebruikt worden). Nieuwe types tellen niet: die stoort niemand. */
export function staleModuleTypes(project: ModularProject, editorTypes: ModuleType[] = editorModuleTypes()): string[] {
  const used = new Set(project.modules.map((m) => m.typeId));
  const out: string[] = [];
  for (const now of editorTypes) {
    if (!used.has(now.id)) continue;
    const mine = project.moduleTypes.find((t) => t.id === now.id);
    if (mine && signature(mine) !== signature(now)) out.push(now.id);
  }
  return out;
}

/** Alle patches controleren en het zekere herstellen. Puur. */
export function reviewProject(project: ModularProject, source: string, editorTypes?: ModuleType[]): { project: ModularProject; report: IntakeReport } {
  const patches: PatchReport[] = [];
  let changed = false;
  const next = project.patches.map((patch) => {
    const findings = checkPatch(patch, project);
    if (findings.length) patches.push({ patchId: patch.id, patchName: patch.name, findings });
    const fixed = repairPatch(patch, findings);
    if (fixed !== patch) changed = true;
    return fixed;
  });
  return {
    project: changed ? { ...project, patches: next } : project,
    report: { source, patches, staleTypes: staleModuleTypes(project, editorTypes) },
  };
}

/** Herstel toepassen als bewerking (met undo) en de melding publiceren. */
export function applyIntake(result: { project: ModularProject; report: IntakeReport }, get: () => ModularProject,
  update: (fn: (p: ModularProject) => ModularProject, opts: { forceCommit: boolean }) => void): void {
  if (result.project !== get()) update(() => result.project, { forceCommit: true });
  publishIntake({ ...result.report, after: get() });
}

/** Eén binnengekomen patch controleren en herstellen. Puur. */
export function admitPatch(project: ModularProject, patchId: string, source: string): { project: ModularProject; report: IntakeReport } {
  const patch = project.patches.find((x) => x.id === patchId);
  if (!patch) return { project, report: { source, patches: [], staleTypes: [] } };
  const findings = checkPatch(patch, project);
  const fixed = repairPatch(patch, findings);
  return {
    project: fixed === patch ? project : { ...project, patches: project.patches.map((x) => (x.id === patchId ? fixed : x)) },
    report: { source, patches: findings.length ? [{ patchId, patchName: patch.name, findings }] : [], staleTypes: [] },
  };
}

/** Na het toevoegen van één patch (pool, SysEx, take): de actieve patch
 *  controleren, het zekere herstellen (eigen undo-stap) en melden. */
export function admitActivePatch(source: string): void {
  const id = getProject().activePatchId;
  if (id) applyIntake(admitPatch(getProject(), id, source), getProject, updateProject);
}

/** Is er iets om te melden? Alleen informatieve bevindingen (een onbekende
 *  knopstand, een signaalsoort die afwijkt) geven geen melding. */
export function reportNeedsNotice(r: IntakeReport): boolean {
  return r.staleTypes.length > 0 || r.patches.some((p) => p.findings.some((f) => f.severity !== 'info'));
}

// ── De laatste melding, voor IntakeNotice ──────────────────────────────

let last: IntakeReport | null = null;
const listeners = new Set<() => void>();
/** Toon een melding, of sluit hem met `null`. Een controle zonder iets om
 *  te melden laat een openstaande melding staan: kort na het opstarten kan
 *  het project nog een keer vervangen worden, en dan vindt de tweede
 *  controle niets meer, juist omdat de eerste al hersteld heeft. */
export function publishIntake(r: IntakeReport | null): void {
  if (r && !reportNeedsNotice(r)) return;
  last = r;
  listeners.forEach((fn) => fn());
}
export function lastIntake(): IntakeReport | null { return last; }
export function subscribeIntake(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
