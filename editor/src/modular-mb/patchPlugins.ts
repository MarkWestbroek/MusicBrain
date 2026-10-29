// Patch-plugins (doc/plans/plugin-patches.md §5): welke seeds een plugin
// worden, en welke knoppen daar een DAW-parameter zijn. Gedeeld door de
// generator (scripts/pluginPatches.ts) en de bediening in de plugin
// (src/plugin-ui), zodat een parameter-id aan beide kanten dezelfde knop is.

import { bypassRoute } from './bypassRoute';
import { buildFrontModule } from './frontLayout';
import { resolveControls, type Control, type FrontItem, type ModularProject, type Patch, type PatchFront } from './types';

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

export interface PluginParam {
  /** Vast id voor de DAW: `<type><n>_<knop>` (n = hoeveelste van dat type in het rack). */
  id: string;
  moduleId: string; controlId: string;
  /** Naam in de DAW: het label op het front, anders "<module> <knop>". */
  label: string;
  control: Control;
}

/** Een module in de Expert-tab: zijn knoppen en displays, onder zijn naam. */
export interface ExpertModule { moduleId: string; name: string; params: PluginParam[]; displays: Control[] }

const PARAM_KINDS = new Set<Control['kind']>(['knob', 'slider', 'switch', 'toggle']);

/**
 * Alle modules van de patch zoals de editor ze toont bij Binnenkijken: per
 * poly-groep alleen de eerste stem (de rest volgt via polyControlTargets),
 * in de volgorde van het rack. Met elke knop als parameter, en een bypass
 * per effect.
 */
export function expertModules(project: ModularProject, patch: Patch): ExpertModule[] {
  const rackIds = new Set(patch.rackIds);
  const racks = project.racks.filter((r) => rackIds.has(r.id));
  const followers = new Set(racks.flatMap((r) => (r.polyGroups ?? []).flatMap((g) => g.members.slice(1)
    .filter((m): m is { kind: 'module'; moduleId: string } => m.kind === 'module').map((m) => m.moduleId))));
  const frontLabel = new Map<string, string>();
  for (const it of pluginFronts(project, patch).flatMap((f) => f.items))
    if (it.kind === 'control' && it.label) frontLabel.set(`${it.moduleId}\0${it.controlId}`, it.label);
  const count = new Map<string, number>();
  const out: ExpertModule[] = [];
  for (const slot of racks.flatMap((r) => r.slots)) {
    if (followers.has(slot.moduleId)) continue;
    const m = project.modules.find((x) => x.id === slot.moduleId);
    if (!m) continue;
    const type = project.moduleTypes.find((t) => t.id === m.typeId);
    const short = m.typeId.replace(/^tp_mmb_/, '');
    const n = (count.get(short) ?? 0) + 1;
    count.set(short, n);
    const all = resolveControls(m, project.moduleTypes);
    const name = all.length && m.name ? m.name.replace(/^MMB /, '') : short;
    const controls = all.filter((c) => PARAM_KINDS.has(c.kind));
    if (type && bypassRoute(type) && !controls.some((c) => c.id === 'bypass')) controls.push(bypassControl());
    // Naam van een effect op het front ("Galm"), voor zijn bypass.
    const onFront = [...frontLabel.entries()].find(([k]) => k.startsWith(`${m.id}\0`) && !k.endsWith(`\0${BYPASS_CONTROL_ID}`))?.[1];
    const params = controls.map((c): PluginParam => {
      const label = frontLabel.get(`${m.id}\0${c.id}`);
      const own = 'label' in c && c.label ? c.label : c.id;
      return { id: `${short}${n}_${c.id === BYPASS_CONTROL_ID ? 'bypass' : c.id}`, moduleId: m.id, controlId: c.id, control: c,
        label: c.id === BYPASS_CONTROL_ID ? `${onFront ?? `${name}${n > 1 ? ` ${n}` : ''}`} bypass` : label ?? `${name}${n > 1 ? ` ${n}` : ''} ${own}` };
    });
    // Displays alleen als ze iets toevoegen (een naam uit een lijst); een
    // getal staat al naast zijn knop.
    const displays = all.filter((c) => c.kind === 'display' && !!c.lookup);
    if (params.length || displays.length) out.push({ moduleId: m.id, name: n > 1 ? `${name} ${n}` : name, params, displays });
  }
  return out;
}

/**
 * De parameters van de plugin: eerst de knoppen van de fronts (in hun
 * volgorde, zodat de DAW-lijst met het spelen begint), dan de rest per
 * module. Elke knop één keer; het id is vast, ook als het front verandert.
 */
export function pluginParams(project: ModularProject, patch: Patch): PluginParam[] {
  const all = expertModules(project, patch).flatMap((m) => m.params);
  const key = (moduleId: string, controlId: string) => `${moduleId}\0${controlId}`;
  const byKey = new Map(all.map((p) => [key(p.moduleId, p.controlId), p]));
  const out: PluginParam[] = [];
  const seen = new Set<string>();
  for (const it of pluginFronts(project, patch).flatMap((f) => f.items)) {
    if (it.kind !== 'control') continue;
    const p = byKey.get(key(it.moduleId, it.controlId));
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  for (const p of all) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  return out;
}

/** Hoogte van de tabbalk boven het front, in mm van het paneel. */
export const TAB_BAR_MM = 9;

/** Grootste front (mm), plus de tabbalk (de fronts en Expert): het venster van de plugin. */
export function pluginPanelSize(project: ModularProject, patch: Patch): { widthMm: number; heightMm: number } {
  const fronts = pluginFronts(project, patch);
  let w = 0, h = 0;
  for (const f of fronts) {
    const fm = buildFrontModule(f, patch, project);
    w = Math.max(w, fm.widthMm); h = Math.max(h, fm.heightMm);
  }
  return { widthMm: w || 106.7, heightMm: (h || 120) + TAB_BAR_MM };
}
