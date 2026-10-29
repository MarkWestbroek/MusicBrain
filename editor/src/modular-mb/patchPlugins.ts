// Patch-plugins (doc/plans/plugin-patches.md §5): welke seeds een plugin
// worden, en welke knoppen daar een DAW-parameter zijn. Gedeeld door de
// generator (scripts/pluginPatches.ts) en de bediening in de plugin
// (src/plugin-ui), zodat parameter "p<k>" aan beide kanten dezelfde knop is.

import { bypassRoute } from './bypassRoute';
import { buildFrontModule } from './frontLayout';
import type { Control, FrontItem, ModularProject, Patch, PatchFront } from './types';

/** Welke patches een plugin worden. Code: vier tekens, uniek onder de MMB-plugins (P = patch). */
export const PATCH_PLUGINS: { label: string; target: string; code: string; product: string }[] = [
  { label: '8-stemmig', target: 'MmbPatchPoly8', code: 'Pp8v', product: 'MMB Poly 8' },
  { label: '🎺 CS-80 koper (aftertouch)', target: 'MmbPatchCs80', code: 'Pcs8', product: 'MMB CS-80 Brass' },
];

/** Het type-id van de plugin (ModuleSpec.typeId); de bediening vindt er de seed mee terug. */
export const patchPluginTypeId = (target: string): string => 'patch_' + target.replace(/^Mmb/, '').toLowerCase();

/** De pseudo-knop van de bypass (bypassRoute.ts, PatchEngine.h). */
export const BYPASS_CONTROL_ID = '__bypass';
export const bypassControl = (): Control => ({ id: BYPASS_CONTROL_ID, kind: 'toggle', label: 'Bypass', defaultValue: false } as Control);

const typeOf = (project: ModularProject, moduleId: string) =>
  project.moduleTypes.find((t) => t.id === project.modules.find((m) => m.id === moduleId)?.typeId);

/**
 * De fronts zoals de plugin ze toont: elk effect op een front krijgt na zijn
 * laatste knop een bypass-schakelaar (als het front die nog niet heeft).
 */
export function pluginFronts(project: ModularProject, patch: Patch): PatchFront[] {
  return (patch.fronts ?? []).map((f) => {
    const items: FrontItem[] = [...f.items];
    const done = new Set(items.filter((it) => it.kind === 'control' && it.controlId === BYPASS_CONTROL_ID).map((it) => (it as { moduleId: string }).moduleId));
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      if (it.kind !== 'control' || done.has(it.moduleId)) continue;
      const type = typeOf(project, it.moduleId);
      if (!type || !bypassRoute(type)) continue;
      done.add(it.moduleId);
      items.splice(i + 1, 0, { kind: 'control', moduleId: it.moduleId, controlId: BYPASS_CONTROL_ID, label: 'Bypass' });
    }
    return { ...f, items };
  });
}

export interface PluginParam { moduleId: string; controlId: string; label: string; control: Control }

/** De parameters van de plugin, in volgorde (p0, p1, …): de knoppen van alle fronts, elke knop één keer. */
export function pluginParams(project: ModularProject, patch: Patch): PluginParam[] {
  const out: PluginParam[] = [];
  const seen = new Set<string>();
  const items = pluginFronts(project, patch).flatMap((f) => f.items);
  // Naam van een effect in de DAW: het label van zijn eerste knop ("Galm bypass").
  const nameOf = (moduleId: string) => items.find((x): x is Extract<FrontItem, { kind: 'control' }> =>
    x.kind === 'control' && x.moduleId === moduleId && x.controlId !== BYPASS_CONTROL_ID)?.label;
  for (const it of items) {
    if (it.kind !== 'control') continue;
    const key = `${it.moduleId}\0${it.controlId}`;
    if (seen.has(key)) continue;
    const type = typeOf(project, it.moduleId);
    const c = it.controlId === BYPASS_CONTROL_ID ? (type && bypassRoute(type) ? bypassControl() : undefined) : type?.controls.find((x) => x.id === it.controlId);
    // Alleen wat een DAW-parameter kan zijn (spec() in scripts/pluginParams.ts).
    if (!c || !['knob', 'slider', 'switch', 'toggle'].includes(c.kind)) continue;
    seen.add(key);
    const label = it.controlId === BYPASS_CONTROL_ID
      ? `${nameOf(it.moduleId) ?? type!.variant} bypass`
      : it.label ?? ('label' in c && c.label ? c.label : c.id);
    out.push({ moduleId: it.moduleId, controlId: it.controlId, label, control: c });
  }
  return out;
}

/** Hoogte van de tabbalk boven het front, in mm van het paneel. */
export const TAB_BAR_MM = 9;

/** Grootste front (mm), plus de tabbalk als er meer dan één is: het venster van de plugin. */
export function pluginPanelSize(project: ModularProject, patch: Patch): { widthMm: number; heightMm: number } {
  const fronts = pluginFronts(project, patch);
  let w = 0, h = 0;
  for (const f of fronts) {
    const fm = buildFrontModule(f, patch, project);
    w = Math.max(w, fm.widthMm); h = Math.max(h, fm.heightMm);
  }
  return { widthMm: w, heightMm: h + (fronts.length > 1 ? TAB_BAR_MM : 0) };
}
