// Wat een patch-plugin van een patch nodig heeft (doc/plans/plugin-patches.md
// §5): de JSON voor de motor (PatchEngine.h) en per parameter de knoppen die
// hij zet. Gedeeld door de generator (scripts/pluginPatches.ts: een vaste
// patch per plugin) en "MMB Patch" (plugin-ui: elke patch, tijdens het
// spelen gekozen), zodat beide dezelfde motor-JSON en dezelfde volgorde
// van parameters maken.
//
// MMB Patch heeft een vaste reeks parameters ("slots", s001..): de DAW kan
// het aantal niet tijdens een sessie veranderen. Slot i is pluginParams()[i];
// een slot loopt van 0 tot 1 en `slotSpec` zegt hoe dat een knopwaarde wordt
// (dezelfde formules als juce::NormalisableRange in GenericPatch.h).

import { bypassRoute } from './bypassRoute';
import { pluginParams } from './patchPlugins';
import { polyControlTargets } from './polyExpand';
import { buildConfigPayload } from './teensyLink';
import type { Control, ControlValue, ModularProject, Patch } from './types';

/** Zoveel parameters heeft MMB Patch; een patch met meer houdt de rest in Expert zonder DAW-parameter. */
export const PATCH_SLOTS = 256;

export interface SlotSpec {
  kind: 'float' | 'choice' | 'bool';
  min: number; max: number;
  /** Beginstand in de eenheid van de knop (keuze: index, aan/uit: 0/1). */
  def: number;
  /** Stap (0 = continu). */
  interval: number;
  /** > 0: waarde in het midden (log-taper), zoals spec() in scripts/pluginParams.ts. */
  skewMid: number;
  choices?: string[];
  unit?: string;
}

/** Hoe een knop een slot wordt; undefined = geen parameter (display, joystick). */
export function slotSpec(c: Control, state?: ControlValue): SlotSpec | undefined {
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : d);
  switch (c.kind) {
    case 'knob':
      return { kind: 'float', min: c.min, max: c.max, def: num(state, c.defaultValue), interval: c.step ?? 0,
        skewMid: c.taper === 'log' && c.min > 0 ? Math.sqrt(c.min * c.max) : 0, unit: c.unit };
    case 'slider':
      return { kind: 'float', min: c.min, max: c.max, def: num(state, c.defaultValue), interval: 0, skewMid: 0, unit: c.unit };
    case 'switch':
      return { kind: 'choice', min: 0, max: c.positions.length - 1, def: num(state, c.defaultIndex), interval: 1, skewMid: 0, choices: c.positions };
    case 'toggle':
      return { kind: 'bool', min: 0, max: 1, def: num(state, c.defaultValue ? 1 : 0), interval: 1, skewMid: 0 };
    default:
      return undefined;
  }
}

const skewOf = (s: SlotSpec) =>
  s.skewMid > s.min && s.skewMid < s.max ? Math.log(0.5) / Math.log((s.skewMid - s.min) / (s.max - s.min)) : 1;

/** Knopwaarde → 0..1 (juce::NormalisableRange::convertTo0to1). */
export function toSlot(s: SlotSpec, v: ControlValue): number {
  const x = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  if (s.kind === 'bool') return x >= 0.5 ? 1 : 0;
  if (s.kind === 'choice') return s.max > 0 ? Math.min(1, Math.max(0, Math.round(x) / s.max)) : 0;
  const p = Math.min(1, Math.max(0, (x - s.min) / (s.max - s.min)));
  const k = skewOf(s);
  return k === 1 ? p : Math.pow(p, k);
}

/** 0..1 → knopwaarde (juce::NormalisableRange::convertFrom0to1, met de stap). */
export function fromSlot(s: SlotSpec, p: number): ControlValue {
  const q = Math.min(1, Math.max(0, p));
  if (s.kind === 'bool') return q >= 0.5;
  if (s.kind === 'choice') return Math.round(q * s.max);
  const k = skewOf(s);
  let v = s.min + (s.max - s.min) * (k === 1 || q <= 0 ? q : Math.exp(Math.log(q) / k));
  if (s.interval > 0) v = s.min + Math.round((v - s.min) / s.interval) * s.interval;
  return Math.min(s.max, Math.max(s.min, v));
}

export interface PatchSlot {
  /** Parameter-id in de patch (`ladder1_cutoff`, patchPlugins.ts). */
  id: string;
  label: string;
  moduleId: string; controlId: string;
  /** (module, knop) per stem: de motor zet ze allemaal (polyControlTargets). */
  targets: [string, string][];
  spec: SlotSpec;
}

export interface PatchPluginConfig {
  /** De JSON voor PatchEngine: de Teensy-payload plus "bypass" per effecttype. */
  json: string;
  /** In de volgorde van pluginParams(): de fronts eerst. */
  slots: PatchSlot[];
  modules: number;
}

/** Motor-JSON en parameters voor één patch van @p project. */
export function patchPluginConfig(project: ModularProject, patch: Patch): PatchPluginConfig {
  const active = project.activePatchId === patch.id ? project : { ...project, activePatchId: patch.id };
  const payload = buildConfigPayload(active, { activeOnly: true });
  const config = JSON.parse(payload.json) as { project: { modules: { id: string; typeId: string }[] }; bypass?: Record<string, unknown> };
  const bypass: Record<string, unknown> = {};
  for (const t of new Set(config.project.modules.map((m) => m.typeId))) {
    const type = project.moduleTypes.find((x) => x.id === t);
    const route = type && bypassRoute(type);
    if (route) bypass[t] = 'own' in route ? { own: true } : route.pairs.map((x) => (x.fallback ? [x.out, x.in, x.fallback] : [x.out, x.in]));
  }
  config.bypass = bypass;
  const slots: PatchSlot[] = [];
  for (const it of pluginParams(project, patch)) {
    const spec = slotSpec(it.control, patch.controlState[it.moduleId]?.[it.controlId]);
    if (!spec) continue;
    slots.push({ id: it.id, label: it.label, moduleId: it.moduleId, controlId: it.controlId, spec,
      targets: polyControlTargets(patch, project, it.moduleId).map((m) => [m, it.controlId] as [string, string]) });
  }
  return { json: JSON.stringify(config), slots, modules: config.project.modules.length };
}

/**
 * Alleen wat de bediening van de plugin nodig heeft: de patch, zijn racks,
 * zijn modules en hun typen. Gaat in de projecttoestand van MMB Patch; een
 * heel project (met elke seed als extra patch) zou megabytes zijn.
 */
export function slimProject(project: ModularProject, patch: Patch): ModularProject {
  const rackIds = new Set(patch.rackIds);
  const racks = project.racks.filter((r) => rackIds.has(r.id));
  const moduleIds = new Set([...racks.flatMap((r) => r.slots.map((s) => s.moduleId)),
    ...patch.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId])]);
  const modules = project.modules.filter((m) => moduleIds.has(m.id));
  const typeIds = new Set(modules.map((m) => m.typeId));
  return {
    ...project,
    modules,
    moduleTypes: project.moduleTypes.filter((t) => typeIds.has(t.id)),
    racks,
    patches: [patch],
    activePatchId: patch.id,
    activeRackId: racks[0]?.id ?? project.activeRackId,
  };
}
