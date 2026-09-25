// Tools voor taalmodellen (ED-RC-5) — zie doc/plans/recept-tools-en-mcp.md.
//
// Eén definitie, twee hosts: de function-calling-lus in de browser (llm.ts)
// en de MCP-server (tools/mmb-mcp). Definities zijn JSON-schema in het
// OpenAI-functieformaat, wat één-op-één de MCP-`inputSchema` is.
//
// Alles hier is puur: `runTool(project, name, args)` geeft inhoud terug en,
// bij een wijzigende tool, het nieuwe project. Geen DOM, store of React.

import { type ModularProject, type ModuleType, resolvePorts, resolveControls, defaultValueOf } from '../types';
import { findModuleByWord } from './edits';
import { CATALOG, catalogTable, resolveTypeId, shortName, suggestTypeIds } from './catalog';
import { compileRecipe } from './compile';
import { runCommand } from './commands';
import { describeCommand, type Command } from './parse';
import { analyzeProject, optimizeProject } from './optimize';
import { RecipeError, type PatchRecipe } from './types';

export interface JsonSchema { type: string; [k: string]: unknown }
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** true = verandert het project (in de browser een voorstel, in MCP direct). */
  mutating: boolean;
}

const MODULE_REF = { type: 'string', description: 'Type-id (tp_mmb_…), korte naam of alias uit list_module_types, bijv. "wavetable", "ladder", "diode compressor".' };
const RECIPE_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'Patch-recept. Alleen de velden invullen die de gebruiker noemt; de rest heeft zinnige defaults.',
  properties: {
    name:      { type: 'string' },
    voices:    { type: 'integer', minimum: 1, maximum: 16, description: '1 = mono (default).' },
    source:    { ...MODULE_REF, description: 'Stemkern: vco, wavetable, string, stk, plaits, dx7, … (verplicht).' },
    filter:    { anyOf: [MODULE_REF, { type: 'null' }], description: 'Filter per stem; default vcf; null = geen filter.' },
    voiceFx:   { type: 'array', items: MODULE_REF, description: 'Mono-effecten per stem (comb, phaser, …) tussen filter en VCA.' },
    bus:       { type: 'array', items: MODULE_REF, description: 'Effecten na de mixer, vóór OUT (compressors, EQ, galm, echo).' },
    ampEnv:    { type: 'boolean', description: 'AHDSR → VCA (default true).' },
    filterEnv: { type: 'boolean', description: 'AHDSR → filter-cv (default true als er een filter is).' },
    velocity:  { type: 'boolean', description: 'velocity × amp-env (default true).' },
    vibrato:   { type: 'boolean', description: 'LFO × modwheel (+ bend) → tune (default: als de bron een tune-ingang heeft).' },
    voiceLfo:  { type: 'boolean', description: 'LFO per stem op de filter-cutoff (default false).' },
  },
  required: ['source'],
};

export const TOOLS: ToolDef[] = [
  { name: 'list_module_types', mutating: false,
    description: 'Catalogus van beschikbare moduletypes: type-id, korte naam, soort (source/filter/fx/env/lfo/…) en aliassen. Gebruik dit om namen van de gebruiker op type-id\'s af te beelden.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'get_module_type', mutating: false,
    description: 'Details van één moduletype: poorten (richting, signaaltype) en knoppen (bereik, default, standen).',
    inputSchema: { type: 'object', properties: { typeId: MODULE_REF }, required: ['typeId'] } },
  { name: 'list_patches', mutating: false,
    description: 'Alle patches in het project en welke actief is.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'get_patch_summary', mutating: false,
    description: 'Samenvatting van de actieve patch (of een gegeven patchId): modules met poly-status en cv-ingangen, en de master-kabels.',
    inputSchema: { type: 'object', properties: { patchId: { type: 'string' } } } },
  { name: 'compile_recipe', mutating: false,
    description: 'Droogloop van een recept: geeft de samenvatting, waarschuwingen en het aantal bouwstappen, of de fout. Bouwt niets. Handig om te controleren vóór build_patch.',
    inputSchema: { type: 'object', properties: { recipe: RECIPE_SCHEMA }, required: ['recipe'] } },
  { name: 'set_active_patch', mutating: true,
    description: 'Maak een patch actief (bewerkingen werken op de actieve patch).',
    inputSchema: { type: 'object', properties: { patchId: { type: 'string' } }, required: ['patchId'] } },
  { name: 'build_patch', mutating: true,
    description: 'Bouw een nieuwe patch (nieuw rack + patch, wordt actief) uit een recept.',
    inputSchema: { type: 'object', properties: { recipe: RECIPE_SCHEMA }, required: ['recipe'] } },
  { name: 'set_voices', mutating: true,
    description: 'Maak de actieve patch N-stemmig (1 = mono). Kloont de stemketen en maakt poly-groepen; de mixer groeit mee.',
    inputSchema: { type: 'object', properties: { voices: { type: 'integer', minimum: 1, maximum: 16 } }, required: ['voices'] } },
  { name: 'replace_module', mutating: true,
    description: 'Vervang een module in de actieve patch door een ander type. "from" is een module-id, een rolwoord (osc, filter, vca) of een alias van het huidige type. Bij een poly-groep wordt de hele groep vervangen; kabels blijven waar de poorten overeenkomen.',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: MODULE_REF }, required: ['from', 'to'] } },
  { name: 'add_bus_fx', mutating: true,
    description: 'Zet een effect op de bus, tussen de mixer en OUT, in de actieve patch.',
    inputSchema: { type: 'object', properties: { module: MODULE_REF }, required: ['module'] } },
  { name: 'add_modulation', mutating: true,
    description: 'Hang een LFO of envelope aan een cv-ingang van een module in de actieve patch. "target" is een module-id of woord (filter, osc); "port" een cv-ingang (cv, tune, q_cv, …) of woord (cutoff, pitch).',
    inputSchema: { type: 'object', properties: {
      source: { type: 'string', enum: ['tp_mmb_lfo', 'tp_mmb_ahdsr'], description: 'lfo (globaal) of ahdsr (per stem, met MIDI-gate).' },
      target: { type: 'string' }, port: { type: 'string' },
    }, required: ['source', 'target'] } },
  { name: 'move_module', mutating: true,
    description: 'Verplaats een module in het rack (alleen de weergave; aan het geluid verandert niets): vóór of na een andere module, of wissel ze om. "module" en "target" zijn een module-id of woord (vibe, out, osc). Poly-groepen verhuizen als kolom.',
    inputSchema: { type: 'object', properties: {
      module: { type: 'string' }, relation: { type: 'string', enum: ['before', 'after', 'swap'] }, target: { type: 'string' },
    }, required: ['module', 'relation', 'target'] } },
  { name: 'remove_module', mutating: true,
    description: 'Haal een module uit de actieve patch. Zit hij in het audiopad, dan wordt de audio doorverbonden (VCA eruit = bron rechtstreeks naar de mixer). Envelopes/CV-math die alleen deze module stuurden gaan mee. Gebruik dit in plaats van de patch opnieuw te bouwen.',
    inputSchema: { type: 'object', properties: { module: { type: 'string' } }, required: ['module'] } },
  { name: 'get_controls', mutating: false,
    description: 'Huidige knopstanden van een module in de actieve patch, met per knop het bereik (min/max), de schakelaarstanden en de standaardwaarde. "module" is een module-id of woord (mixer, filter, osc).',
    inputSchema: { type: 'object', properties: { module: { type: 'string' } }, required: ['module'] } },
  { name: 'set_controls', mutating: true,
    description: 'Zet knoppen van een module in de actieve patch. "values" is een object knop-id → waarde (getal, of schakelaarstand op naam). Waarden buiten het bereik worden begrensd. Bij een poly-groep krijgen alle stemmen dezelfde stand. Voorbeeld stereo-spreiding over een 8-kanaals mixer: {"pan1":-1,"pan2":-0.714,…,"pan8":1}.',
    inputSchema: { type: 'object', properties: { module: { type: 'string' }, values: { type: 'object' } }, required: ['module', 'values'] } },
  { name: 'spread_voices', mutating: true,
    description: 'Verdeel de stemmen van de actieve patch over het stereobeeld: de mixerkanalen 1..N krijgen een pan van helemaal links tot helemaal rechts. "width" 0..1 (standaard 1) maakt het beeld smaller.',
    inputSchema: { type: 'object', properties: { width: { type: 'number', minimum: 0, maximum: 1 } } } },
  { name: 'analyze_racks', mutating: false,
    description: 'Rapport van wat "optimaliseer racks" zou doen: racks zonder patch, losse modules, lege patches, en welke (bijna) identieke racks samengevoegd kunnen worden. Bouwt niets.',
    inputSchema: { type: 'object', properties: { maxDiff: { type: 'integer', minimum: 0, maximum: 16, description: 'Max. afwijkende modules aan één kant om nog samen te voegen (default 2).' } } } },
  { name: 'optimize_racks', mutating: true,
    description: 'Voer het volledige optimalisatieplan uit (zie analyze_racks): opruimen en (bijna) identieke racks samenvoegen. Patches delen daarna een rack en laten elk hun eigen modules ongemoeid.',
    inputSchema: { type: 'object', properties: { maxDiff: { type: 'integer', minimum: 0, maximum: 16 } } } },
];

export function toolDef(name: string): ToolDef | undefined { return TOOLS.find((t) => t.name === name); }

/** Tools in het OpenAI-`tools`-formaat. */
export function openAiTools(): unknown[] {
  return TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
}

// ── lezen ───────────────────────────────────────────────────────────────

/** Compacte tekst-samenvatting van een patch (voor prompts). */
export function summarizePatch(p: ModularProject, patchId = p.activePatchId): string {
  const s = patchSummary(p, patchId);
  if (!s) return 'Er is geen actieve patch.';
  const lines = [`Patch "${s.name}" (${s.id}), ${s.voices} ${s.voices === 1 ? 'stem' : 'stemmen'}.`, 'Modules (id: type — cv-ingangen):'];
  for (const m of s.modules) {
    lines.push(`- ${m.id}: ${m.short} (${m.typeId})${m.poly ? ` [poly ×${m.poly}]` : ''}${m.cvIns.length ? ` — ${m.cvIns.join(', ')}` : ''}`);
  }
  lines.push('Kabels: ' + s.connections.map((c) => `${c.from}→${c.to}`).join(', '));
  return lines.join('\n');
}

export interface PatchSummary {
  id: string; name: string; voices: number;
  modules: { id: string; typeId: string; short: string; poly?: number; cvIns: string[] }[];
  connections: { from: string; to: string }[];
}

export function patchSummary(p: ModularProject, patchId = p.activePatchId): PatchSummary | null {
  const patch = p.patches.find((x) => x.id === patchId);
  if (!patch) return null;
  const racks = p.racks.filter((r) => patch.rackIds.includes(r.id));
  const ids = new Set(racks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  const followers = new Set<string>();
  const groups = racks.flatMap((r) => r.polyGroups ?? []);
  for (const g of groups) for (const m of g.members.slice(1)) if (m.kind === 'module') followers.add(m.moduleId);
  const modules = p.modules.filter((m) => ids.has(m.id) && !followers.has(m.id)).map((m) => {
    const g = groups.find((x) => x.members[0]?.kind === 'module' && x.members[0].moduleId === m.id);
    return {
      id: m.id, typeId: m.typeId, short: shortName(m.typeId, p.moduleTypes),
      ...(g ? { poly: g.voiceCount } : {}),
      cvIns: resolvePorts(m, p.moduleTypes).filter((q) => q.direction === 'in' && q.signalType === 'cv').map((q) => q.id),
    };
  });
  const label = (id: string) => `${shortName(p.modules.find((m) => m.id === id)?.typeId ?? '?', p.moduleTypes)}#${id}`;
  const connections = patch.connections
    .filter((c) => !followers.has(c.from.moduleId) && !followers.has(c.to.moduleId))
    .map((c) => ({ from: `${label(c.from.moduleId)}.${c.from.portId}`, to: `${label(c.to.moduleId)}.${c.to.portId}` }));
  return { id: patch.id, name: patch.name, voices: patch.voiceCount, modules, connections };
}

function typeDetails(t: ModuleType, types: ModuleType[]): unknown {
  const e = CATALOG[t.id];
  return {
    typeId: t.id, short: shortName(t.id, types), kind: e?.kind ?? 'util', variant: t.variant,
    role: t.role ?? 'normal', notes: t.notes,
    ports: t.ports.map((q) => ({ id: q.id, name: q.name, direction: q.direction, signal: q.signalType,
      ...(q.eventKind ? { eventKind: q.eventKind } : {}) })),
    controls: t.controls.filter((c) => c.kind !== 'display' && c.kind !== 'led').map((c) => ({
      id: c.id, label: c.label, kind: c.kind, default: defaultValueOf(c),
      ...('min' in c ? { min: c.min, max: c.max } : {}),
      ...('unit' in c && c.unit ? { unit: c.unit } : {}),
      ...(c.kind === 'switch' ? { positions: c.positions } : {}),
    })),
  };
}

function needType(ref: unknown, types: ModuleType[]): ModuleType {
  if (typeof ref !== 'string') throw new RecipeError('typeId ontbreekt.');
  const id = resolveTypeId(ref, types);
  const t = id && types.find((x) => x.id === id);
  if (!t) {
    const sug = suggestTypeIds(ref).map((x) => shortName(x, types));
    throw new RecipeError(`Onbekend moduletype "${ref}".` + (sug.length ? ` Bedoelde je: ${sug.join(', ')}?` : ''), sug);
  }
  return t;
}

// ── commando's ──────────────────────────────────────────────────────────

/** Zet een wijzigende tool-aanroep om in een Command (null voor leestools). */
export function commandForTool(name: string, args: Record<string, unknown>): Command | null {
  const str = (k: string): string => {
    const v = args[k];
    if (typeof v !== 'string' || !v.trim()) throw new RecipeError(`${name}: "${k}" ontbreekt.`);
    return v.trim();
  };
  switch (name) {
    case 'build_patch': {
      const r = args.recipe;
      if (!r || typeof r !== 'object' || typeof (r as PatchRecipe).source !== 'string') throw new RecipeError('build_patch: recipe.source ontbreekt.');
      return { kind: 'build', recipe: r as PatchRecipe, mentioned: [], explicitNew: true };
    }
    case 'set_voices': {
      const v = Number(args.voices);
      if (!Number.isFinite(v)) throw new RecipeError('set_voices: voices ontbreekt.');
      return { kind: 'voices', voices: Math.max(1, Math.min(16, Math.round(v))) };
    }
    case 'replace_module':  return { kind: 'replace', from: str('from'), to: str('to') };
    case 'add_bus_fx':      return { kind: 'addBus', module: str('module') };
    case 'move_module': {
      const rel = str('relation');
      if (!['before', 'after', 'swap'].includes(rel)) throw new RecipeError('move_module: relation moet before, after of swap zijn.');
      return { kind: 'move', module: str('module'), relation: rel as 'before' | 'after' | 'swap', target: str('target') };
    }
    case 'remove_module':   return { kind: 'remove', module: str('module') };
    case 'spread_voices':   return { kind: 'spread', width: typeof args.width === 'number' ? Math.max(0, Math.min(1, args.width)) : 1 };
    case 'set_controls': {
      const v = args.values;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new RecipeError('set_controls: "values" moet een object zijn.');
      return { kind: 'set', module: str('module'), values: v as Record<string, unknown> };
    }
    case 'add_modulation':  return { kind: 'addModulation', source: str('source'), target: str('target'),
                                     port: typeof args.port === 'string' && args.port.trim() ? args.port.trim() : null };
    default: return null;
  }
}

export interface ToolResult { content: unknown; project?: ModularProject; command?: Command }

/** Voer een tool uit. Leestools geven inhoud; wijzigende tools ook het nieuwe project. Gooit RecipeError. */
export function runTool(project: ModularProject, name: string, args: Record<string, unknown> = {}): ToolResult {
  const types = project.moduleTypes;
  switch (name) {
    case 'list_module_types':
      return { content: catalogTable(types) };
    case 'get_module_type':
      return { content: typeDetails(needType(args.typeId, types), types) };
    case 'list_patches':
      return { content: project.patches.map((x) => ({ id: x.id, name: x.name, voices: x.voiceCount, active: x.id === project.activePatchId })) };
    case 'get_patch_summary': {
      const s = patchSummary(project, typeof args.patchId === 'string' ? args.patchId : project.activePatchId);
      if (!s) throw new RecipeError('Geen (actieve) patch gevonden.');
      return { content: { ...s, text: summarizePatch(project, s.id) } };
    }
    case 'compile_recipe': {
      const r = args.recipe as PatchRecipe;
      if (!r || typeof r !== 'object') throw new RecipeError('compile_recipe: recipe ontbreekt.');
      try {
        const c = compileRecipe(project, r);
        return { content: { ok: true, summary: c.summary, warnings: c.warnings, steps: c.ops.length } };
      } catch (e) {
        return { content: { ok: false, error: e instanceof Error ? e.message : String(e) } };
      }
    }
    case 'get_controls': {
      const pid = project.activePatchId;
      const patch = project.patches.find((x) => x.id === pid);
      if (!patch) throw new RecipeError('Geen actieve patch.');
      const m = findModuleByWord(project, pid!, String(args.module ?? ''));
      if (!m) throw new RecipeError(`Geen module "${String(args.module)}" in deze patch.`);
      const cur = patch.controlState[m.id] ?? {};
      return { content: { module: m.id, type: m.typeId, controls: resolveControls(m, types).filter((c) => c.kind !== 'display' && c.kind !== 'led').map((c) => ({
        id: c.id, label: c.label, value: cur[c.id] ?? defaultValueOf(c),
        ...('min' in c ? { min: c.min, max: c.max } : {}),
        ...(c.kind === 'switch' ? { positions: c.positions } : {}),
      })) } };
    }
    case 'analyze_racks': {
      const plan = analyzeProject(project, { maxDiff: typeof args.maxDiff === 'number' ? args.maxDiff : undefined });
      return { content: { summary: plan.summary, actions: plan.actions.map((a) => ({ kind: a.kind, label: a.label, detail: a.detail })), skipped: plan.skipped } };
    }
    case 'optimize_racks': {
      const r = optimizeProject(project, { maxDiff: typeof args.maxDiff === 'number' ? args.maxDiff : undefined });
      return { content: { ok: true, summary: r.summary, warnings: r.warnings, actions: r.plan.actions.map((a) => a.label) }, project: r.project };
    }
    case 'set_active_patch': {
      const id = typeof args.patchId === 'string' ? args.patchId : '';
      const x = project.patches.find((q) => q.id === id);
      if (!x) throw new RecipeError(`Patch ${id} bestaat niet.`);
      const next = { ...project, activePatchId: x.id, activeRackId: x.rackIds[0] ?? project.activeRackId };
      return { content: { ok: true, active: x.name }, project: next };
    }
    default: {
      const cmd = commandForTool(name, args);
      if (!cmd) throw new RecipeError(`Onbekende tool "${name}".`);
      const r = runCommand(project, cmd);
      return { content: { ok: true, summary: r.summary, warnings: r.warnings, command: describeCommand(cmd, types) }, project: r.project, command: cmd };
    }
  }
}
