// LLM-adapter (ED-RC-3/5): vrije tekst → Command(s) via een OpenAI-compatibele
// chat-completions-API (DeepSeek, OpenAI, Ollama, …). Bring-your-own-key:
// endpoint, model en key staan in localStorage.
//
// Twee modi:
//   • tools (default): function calling. Het model haalt zelf op wat het
//     nodig heeft (catalogus, typedetails, patch-samenvatting) en "plant"
//     wijzigingen. Wijzigende tools worden hier NIET uitgevoerd op het echte
//     project maar verzameld als voorstel; wel op een lokale kopie, zodat
//     een volgende leestool het voorlopige resultaat ziet.
//   • json: één antwoord in JSON met de hele catalogus in de prompt (voor
//     modellen zonder function calling).
// Naar buiten gaan alleen de vraag, catalogus/typedetails en een compacte
// samenvatting van de patch — nooit het project.

import type { ModularProject, ModuleType } from '../types';
import { CATALOG, catalogTable, resolveTypeId, shortName } from './catalog';
import { runCommand } from './commands';
import type { Command } from './parse';
import { describeCommand } from './parse';
import { commandForTool, openAiTools, runTool, toolDef, summarizePatch } from './tools';
import { RecipeError, type PatchRecipe } from './types';

export { summarizePatch };

export interface LlmSettings {
  endpoint: string;
  model: string;
  apiKey: string;
  mode: 'tools' | 'json';
}

const STORAGE_KEY = 'mmb.llm.v1';
export const LLM_PRESETS: Record<string, Pick<LlmSettings, 'endpoint' | 'model'>> = {
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  openai:   { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  ollama:   { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' },
};
const DEFAULTS: LlmSettings = { ...LLM_PRESETS.deepseek!, apiKey: '', mode: 'tools' };

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* geen opslag */ }
  return { ...DEFAULTS };
}

export function saveLlmSettings(s: LlmSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota/private */ }
}

export interface LlmAnswer {
  /** Eerste voorgestelde commando (json-modus: het enige). */
  command: Command | null;
  /** Alle voorgestelde commando's, in volgorde. */
  commands: Command[];
  explanation: string;
  summary: string;
  raw: string;
}

// ── transport ───────────────────────────────────────────────────────────

interface ChatMessage { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

async function post(settings: LlmSettings, body: Record<string, unknown>, fetchFn: typeof fetch): Promise<ChatMessage> {
  if (!settings.apiKey && !/localhost|127\.0\.0\.1/.test(settings.endpoint)) {
    throw new RecipeError('Geen API-key ingesteld (⚙ in de commandoregel).');
  }
  let res: Response;
  try {
    res = await fetchFn(settings.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify({ model: settings.model, temperature: 0, ...body }),
    });
  } catch (e) {
    throw new RecipeError(`Kon ${settings.endpoint} niet bereiken (netwerk of CORS): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new RecipeError(`AI-dienst antwoordde ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: { message?: ChatMessage }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new RecipeError('AI-antwoord zonder inhoud.');
  return msg;
}

// ── tools-modus ─────────────────────────────────────────────────────────

const TOOLS_PROMPT = [
  'Je helpt een gebruiker van de MusicBrain-editor (modulaire synth) patches te bouwen en te veranderen.',
  'Gebruik de tools: list_module_types om namen op type-id\'s af te beelden, get_module_type voor poorten/knoppen,',
  'get_patch_summary voor de huidige patch, compile_recipe om een recept te controleren.',
  'Wijzigende tools (build_patch, set_voices, replace_module, add_bus_fx, add_modulation) worden als VOORSTEL',
  'vastgelegd; de gebruiker keurt ze daarna goed. Doe precies wat gevraagd wordt, niet meer.',
  'Kies bij "compressor" zonder karakter tp_mmb_bus_comp; bij "filter" zonder meer tp_mmb_vcf; "moog"/"ladder" = tp_mmb_ladder; "korg"/"ms20" = tp_mmb_ms20.',
  'Sluit af met één of twee zinnen in het Nederlands over wat je hebt voorgesteld, zonder JSON.',
].join('\n');

export async function askLlmWithTools(text: string, project: ModularProject, settings = loadLlmSettings(),
                                      fetchFn: typeof fetch = fetch, maxRounds = 10): Promise<LlmAnswer> {
  const messages: ChatMessage[] = [
    { role: 'system', content: TOOLS_PROMPT },
    { role: 'user', content: text },
  ];
  let sim = project;                 // lokale kopie met de voorstellen toegepast
  const commands: Command[] = [];
  let explanation = '';
  for (let round = 0; round < maxRounds; ++round) {
    const msg = await post(settings, { messages, tools: openAiTools(), tool_choice: 'auto' }, fetchFn);
    messages.push(msg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) { explanation = (msg.content ?? '').trim(); break; }
    for (const call of calls) {
      const name = call.function?.name ?? '';
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
      let result: unknown;
      try {
        const def = toolDef(name);
        if (!def) {
          result = { error: `Onbekende tool "${name}".` };
        } else if (def.mutating) {
          const cmd = commandForTool(name, args);
          if (cmd) {
            const r = runCommand(sim, cmd);
            sim = r.project; commands.push(cmd);
            result = { planned: true, summary: r.summary, warnings: r.warnings };
          } else {
            const r = runTool(sim, name, args);      // set_active_patch: alleen op de kopie
            sim = r.project ?? sim; result = r.content;
          }
        } else {
          result = runTool(sim, name, args).content;
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  const types = project.moduleTypes;
  return {
    command: commands[0] ?? null, commands, explanation, raw: explanation,
    summary: commands.length ? commands.map((c) => describeCommand(c, types)).join(' · ') : (explanation || 'Geen voorstel.'),
  };
}

// ── json-modus ──────────────────────────────────────────────────────────

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

export async function askLlm(text: string, project: ModularProject, settings = loadLlmSettings(),
                             fetchFn: typeof fetch = fetch): Promise<LlmAnswer> {
  const msg = await post(settings, {
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(project.moduleTypes) },
      { role: 'user', content: `Actieve patch:\n${summarizePatch(project)}\n\nVerzoek: ${text}` },
    ],
  }, fetchFn);
  const raw = msg.content ?? '';
  const parsed = commandFromLlmJson(extractJson(raw), project.moduleTypes);
  return {
    ...parsed, raw, commands: parsed.command ? [parsed.command] : [],
    summary: parsed.command ? describeCommand(parsed.command, project.moduleTypes) : parsed.explanation,
  };
}

/** Kies de modus uit de instellingen. */
export function askAi(text: string, project: ModularProject, settings = loadLlmSettings(), fetchFn: typeof fetch = fetch): Promise<LlmAnswer> {
  return settings.mode === 'json' ? askLlm(text, project, settings, fetchFn) : askLlmWithTools(text, project, settings, fetchFn);
}
