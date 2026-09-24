// LLM-adapter (ED-RC-3): vrije tekst → Command via een OpenAI-compatibele
// chat-completions-API (DeepSeek, OpenAI, Ollama, …). Bring-your-own-key:
// endpoint, model en key staan in localStorage. Naar buiten gaan alleen de
// vraag, de catalogus (type-id's, korte namen, soort, aliassen) en een
// compacte samenvatting van de actieve patch — nooit het project.
//
// Het model levert JSON dat hier streng gevalideerd wordt tot hetzelfde
// `Command` als de deterministische parser. Een verzonnen type-id is een
// RecipeError, geen kapotte patch. Uitvoeren gebeurt daarna via runCommand.

import type { ModularProject, ModuleType } from '../types';
import { resolvePorts } from '../types';
import { CATALOG, catalogTable, resolveTypeId, shortName } from './catalog';
import type { Command } from './parse';
import { describeCommand } from './parse';
import { RecipeError, type PatchRecipe } from './types';

export interface LlmSettings {
  endpoint: string;
  model: string;
  apiKey: string;
}

const STORAGE_KEY = 'mmb.llm.v1';
export const LLM_PRESETS: Record<string, Omit<LlmSettings, 'apiKey'>> = {
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  openai:   { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  ollama:   { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' },
};

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...LLM_PRESETS.deepseek!, apiKey: '', ...JSON.parse(raw) };
  } catch { /* geen opslag */ }
  return { ...LLM_PRESETS.deepseek!, apiKey: '' };
}

export function saveLlmSettings(s: LlmSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota/private */ }
}

// ── prompt ──────────────────────────────────────────────────────────────

/** Compacte samenvatting van de actieve patch voor het model. */
export function summarizePatch(p: ModularProject): string {
  const patch = p.patches.find((x) => x.id === p.activePatchId);
  if (!patch) return 'Er is geen actieve patch.';
  const racks = p.racks.filter((r) => patch.rackIds.includes(r.id));
  const ids = new Set(racks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  const followers = new Set<string>();
  const groups = racks.flatMap((r) => r.polyGroups ?? []);
  for (const g of groups) for (const m of g.members.slice(1)) if (m.kind === 'module') followers.add(m.moduleId);
  const lines: string[] = [`Patch "${patch.name}", ${patch.voiceCount} ${patch.voiceCount === 1 ? 'stem' : 'stemmen'}.`];
  lines.push('Modules (id: type — cv-ingangen):');
  for (const m of p.modules) {
    if (!ids.has(m.id) || followers.has(m.id)) continue;
    const cv = resolvePorts(m, p.moduleTypes).filter((q) => q.direction === 'in' && q.signalType === 'cv').map((q) => q.id);
    const g = groups.find((x) => x.members[0]?.kind === 'module' && x.members[0].moduleId === m.id);
    lines.push(`- ${m.id}: ${shortName(m.typeId, p.moduleTypes)} (${m.typeId})${g ? ` [poly ×${g.voiceCount}]` : ''}${cv.length ? ` — ${cv.join(', ')}` : ''}`);
  }
  const typeOf = (id: string) => shortName(p.modules.find((m) => m.id === id)?.typeId ?? '?', p.moduleTypes);
  lines.push('Kabels: ' + patch.connections
    .filter((c) => !followers.has(c.from.moduleId) && !followers.has(c.to.moduleId))
    .map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}→${typeOf(c.to.moduleId)}.${c.to.portId}`).join(', '));
  return lines.join('\n');
}

export function buildSystemPrompt(types: ModuleType[]): string {
  const table = catalogTable(types).map((r) => `${r.typeId} | ${r.short} | ${r.kind} | ${r.aliases.slice(0, 6).join(', ')}`).join('\n');
  return [
    'Je vertaalt een verzoek van een gebruiker van de MusicBrain-editor (modulaire synth) naar precies één JSON-commando.',
    'Antwoord ALLEEN met JSON, zonder uitleg eromheen. Gebruik uitsluitend type-id\'s uit de catalogus.',
    '',
    'Commando\'s:',
    '1. Nieuwe patch:  {"command":"build","recipe":{"voices":8,"source":"tp_mmb_wt_vco","filter":"tp_mmb_vcf","voiceFx":[],"bus":["tp_mmb_diode_comp"],"ampEnv":true,"filterEnv":true,"velocity":true,"vibrato":true,"voiceLfo":false},"explanation":"…"}',
    '   voices 1..16 (1 = mono). filter: type-id of null (geen filter). voiceFx: mono-effecten per stem. bus: effecten na de mixer vóór OUT.',
    '2. Stemmen wijzigen van de actieve patch: {"command":"voices","voices":4,"explanation":"…"}',
    '3. Module vervangen: {"command":"replace","from":"<module-id of woord zoals osc/filter>","to":"<type-id>","explanation":"…"}',
    '4. Effect op de bus: {"command":"addBus","module":"<type-id>","explanation":"…"}',
    '5. Modulatie: {"command":"addModulation","source":"tp_mmb_lfo"|"tp_mmb_ahdsr","target":"<module-id of woord>","port":"<cv-ingang>","explanation":"…"}',
    '6. Onmogelijk of onduidelijk: {"command":"none","explanation":"…"}',
    '',
    'Catalogus (type-id | korte naam | soort | aliassen):',
    table,
    '',
    'Soorten: source = stemkern (oscillator/instrument), filter, fx = effect, env, lfo, util, mixer, out, midi, seq, drum, noise.',
    'Kies bij "compressor" zonder verdere aanduiding tp_mmb_comp niet; kies een karakter (diode/fet/opto/bus/varimu) als de gebruiker dat noemt, anders tp_mmb_bus_comp.',
    'Kies bij "filter" zonder verdere aanduiding tp_mmb_vcf, bij "moog"/"ladder" tp_mmb_ladder, bij "korg"/"ms20" tp_mmb_ms20.',
  ].join('\n');
}

// ── validatie ───────────────────────────────────────────────────────────

function asTypeId(v: unknown, types: ModuleType[], what: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new RecipeError(`AI-antwoord: ${what} ontbreekt.`);
  const id = resolveTypeId(v, types);
  if (!id) throw new RecipeError(`AI-antwoord noemt een onbekende module "${v}" (${what}).`);
  return id;
}

function asBool(v: unknown): boolean | undefined { return typeof v === 'boolean' ? v : undefined; }

/** Zet de JSON van het model om in een Command; gooit RecipeError bij rommel. */
export function commandFromLlmJson(json: unknown, types: ModuleType[]): { command: Command | null; explanation: string } {
  if (!json || typeof json !== 'object') throw new RecipeError('AI-antwoord is geen JSON-object.');
  const o = json as Record<string, unknown>;
  const explanation = typeof o.explanation === 'string' ? o.explanation : '';
  switch (o.command) {
    case 'none': return { command: null, explanation: explanation || 'Het model kon er geen commando van maken.' };
    case 'build': {
      const r = (o.recipe ?? {}) as Record<string, unknown>;
      const voices = typeof r.voices === 'number' ? Math.max(1, Math.min(16, Math.round(r.voices))) : 1;
      const list = (v: unknown, what: string): string[] | undefined =>
        Array.isArray(v) && v.length ? v.map((x) => asTypeId(x, types, what)) : undefined;
      const recipe: PatchRecipe = {
        voices,
        source: asTypeId(r.source ?? 'tp_mmb_vco', types, 'bron'),
        filter: r.filter === null ? null : r.filter === undefined ? undefined : asTypeId(r.filter, types, 'filter'),
        voiceFx: list(r.voiceFx, 'effect per stem'),
        bus: list(r.bus, 'bus-effect'),
        ampEnv: asBool(r.ampEnv), filterEnv: asBool(r.filterEnv), velocity: asBool(r.velocity),
        vibrato: asBool(r.vibrato), voiceLfo: asBool(r.voiceLfo),
      };
      if (typeof r.name === 'string' && r.name.trim()) recipe.name = r.name.trim();
      for (const k of ['filter', 'voiceFx', 'bus', 'ampEnv', 'filterEnv', 'velocity', 'vibrato', 'voiceLfo'] as const) {
        if (recipe[k] === undefined) delete recipe[k];
      }
      return { command: { kind: 'build', recipe, mentioned: [], explicitNew: true }, explanation };
    }
    case 'voices': {
      if (typeof o.voices !== 'number') throw new RecipeError('AI-antwoord: aantal stemmen ontbreekt.');
      return { command: { kind: 'voices', voices: Math.max(1, Math.min(16, Math.round(o.voices))) }, explanation };
    }
    case 'replace': {
      if (typeof o.from !== 'string') throw new RecipeError('AI-antwoord: "from" ontbreekt.');
      return { command: { kind: 'replace', from: o.from, to: asTypeId(o.to, types, 'nieuw type') }, explanation };
    }
    case 'addBus':
      return { command: { kind: 'addBus', module: asTypeId(o.module, types, 'bus-effect') }, explanation };
    case 'addModulation': {
      if (typeof o.target !== 'string') throw new RecipeError('AI-antwoord: "target" ontbreekt.');
      const source = asTypeId(o.source ?? 'tp_mmb_lfo', types, 'modulatiebron');
      if (!['env', 'lfo'].includes(CATALOG[source]?.kind ?? '')) throw new RecipeError(`${shortName(source, types)} is geen modulatiebron.`);
      return { command: { kind: 'addModulation', source, target: o.target, port: typeof o.port === 'string' ? o.port : null }, explanation };
    }
    default:
      throw new RecipeError(`AI-antwoord: onbekend commando "${String(o.command)}".`);
  }
}

/** Haal het JSON-object uit een antwoord dat eventueel in ```-hekken zit. */
export function extractJson(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new RecipeError('AI-antwoord bevat geen JSON.');
  try { return JSON.parse(m[0]); } catch { throw new RecipeError('AI-antwoord is geen geldige JSON.'); }
}

// ── aanroep ─────────────────────────────────────────────────────────────

export interface LlmAnswer { command: Command | null; explanation: string; summary: string; raw: string }

export async function askLlm(text: string, project: ModularProject, settings = loadLlmSettings(),
                             fetchFn: typeof fetch = fetch): Promise<LlmAnswer> {
  if (!settings.apiKey && !/localhost|127\.0\.0\.1/.test(settings.endpoint)) {
    throw new RecipeError('Geen API-key ingesteld (⚙ in de commandoregel).');
  }
  const body = {
    model: settings.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(project.moduleTypes) },
      { role: 'user', content: `Actieve patch:\n${summarizePatch(project)}\n\nVerzoek: ${text}` },
    ],
  };
  let res: Response;
  try {
    res = await fetchFn(settings.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new RecipeError(`Kon ${settings.endpoint} niet bereiken (netwerk of CORS): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new RecipeError(`AI-dienst antwoordde ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? '';
  const parsed = commandFromLlmJson(extractJson(raw), project.moduleTypes);
  return {
    ...parsed, raw,
    summary: parsed.command ? describeCommand(parsed.command, project.moduleTypes) : parsed.explanation,
  };
}
