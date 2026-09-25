// Deterministische parser voor de commandoregel (ED-RC-2).
//
// De taal is klein: een aantal stemmen, modulenamen (aliassen uit de
// catalogus) en een paar positiewoorden. Geen grammatica maar keyword-
// spotting met slots. Wat overblijft komt in `unknown`: dat toont de UI
// als "niet begrepen" en is straks de trigger voor de LLM-ronde (ED-RC-3).
//
//   "maak een 8x poly patch met een wavetable osc, een simpele vcf en een
//    diode compressor op het eind"
//   → build { voices: 8, source: 'tp_mmb_wt_vco', filter: 'tp_mmb_vcf', bus: ['tp_mmb_diode_comp'] }
//
//   "vervang de osc door een ladder"      → replace { from: 'osc', to: 'ladder' }
//   "maak deze patch 4 stemmig" / "naar mono"  → voices { voices: 4 | 1 }
//   "voeg een tape echo toe op de bus"    → addBus { module: 'tape echo' }
//   "zet een lfo op de cutoff van het filter" → addModulation { source: 'lfo', target: 'filter', port: 'cutoff' }

import type { ModuleType } from '../types';
import { CATALOG, kindOf, resolveTypeId, shortName } from './catalog';
import type { PatchRecipe, RecipeModule } from './types';

export type Command =
  | { kind: 'build'; recipe: PatchRecipe; mentioned: string[]; explicitNew: boolean }
  | { kind: 'voices'; voices: number }
  | { kind: 'replace'; from: string; to: string }
  | { kind: 'addBus'; module: string }
  | { kind: 'addModulation'; source: string; target: string; port: string | null }
  | { kind: 'move'; module: string; relation: 'before' | 'after' | 'swap'; target: string }
  | { kind: 'remove'; module: string }
  | { kind: 'set'; module: string; values: Record<string, unknown> }
  | { kind: 'spread'; width: number }
  | { kind: 'connect'; from: { module: string; port: string }; to: { module: string; port: string }; gain?: number }
  | { kind: 'disconnect'; to: { module: string; port: string }; from?: { module: string; port: string } };

export interface ParseResult {
  command: Command;
  /** Woorden die niet thuisgebracht zijn. */
  unknown: string[];
  /** Eén regel voor de preview. */
  summary: string;
}

const STOP = new Set([
  'een', 'en', 'met', 'op', 'de', 'het', 'patch', 'maak', 'bouw', 'geef', 'graag', 'wil', 'ik', 'aan',
  'van', 'naar', 'dan', 'ook', 'nog', 'als', 'in', 'voor', 'er', 'me', 'mij', 'nieuwe', 'nieuw', 'new', 'eens',
  'please', 'make', 'build', 'create', 'a', 'an', 'with', 'and', 'the', 'of', 'synth', 'sound', 'klank',
  'stem', 'stemmen', 'stemmig', 'stemmige', 'voice', 'voices', 'poly', 'polyfoon', 'polyfone', 'polyphonic',
  'mono', 'monofoon', 'x', '×', 'plus', 'erachter', 'daarna', 'dan', 'simpele', 'simpel', 'simple',
  'eenvoudige', 'eenvoudig', 'basic', 'gewone', 'gewoon', 'lekkere', 'lekker', 'dikke', 'dik', 'fat',
  'osc', 'oscillator', 'module', 'modules', 'keten', 'chain', 'that', 'die', 'dat', 'zo', 'is',
]);

const BUS_MARKERS   = ['op het eind', 'op het einde', 'aan het eind', 'aan het einde', 'achteraan', 'op de bus', 'als bus', 'op de master', 'at the end', 'on the bus', 'on the master', 'bus'];
const VOICE_MARKERS = ['per stem', 'per voice', 'per noot', 'per note', 'in de stem', 'in elke stem'];
/** Effecten die zonder positiewoord op de bus horen (niet per stem). */
const BUS_DEFAULT = new Set(['tp_mmb_echo', 'tp_mmb_tape_echo', 'tp_mmb_comp', 'tp_mmb_clouds', 'tp_mmb_warps']);

function clean(text: string): string {
  return text.toLowerCase().replace(/[.,;:!?()"']+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Aantal stemmen uit de tekst; null = niet genoemd. */
function parseVoices(t: string): number | null {
  const m = /\b(\d{1,2})\s*(?:x|×|\*|-)?\s*(?:stemmig|stemmige|stemmen|stems|voice|voices|poly|polyfoon|polyfone|polyphonic)\b/.exec(t)
        ?? /\b(?:poly|polyfoon|polyphonic)\s*(?:x|×)?\s*(\d{1,2})\b/.exec(t)
        ?? /\b(\d{1,2})\s*(?:x|×)\b/.exec(t);
  if (m) return Math.max(1, Math.min(16, Number(m[1])));
  if (/\bmono\b|\bmonofoon\b|\b1\s*(?:x|×)?\s*(?:stem|voice)\b/.test(t)) return 1;
  if (/\bpoly\b|\bpolyfoon\b|\bpolyphonic\b/.test(t)) return 4;
  return null;
}

// ── bewerkingen op een bestaande patch ──────────────────────────────────

function parseEdit(t: string): Command | null {
  let m: RegExpExecArray | null;
  // "wissel de vibe en de out om" / "swap vibe and out"
  m = /^(?:wissel|verwissel|swap)\s+(?:de\s+|het\s+|the\s+)?(.+?)\s+(?:en|and|met|with)\s+(?:de\s+|het\s+|the\s+)?(.+?)(?:\s+om)?(?:\s+(?:in het rack|van plaats))?$/.exec(t);
  if (m) return { kind: 'move', module: m[1]!.trim(), relation: 'swap', target: m[2]!.trim() };
  // "zet de vibe voor de out" / "verplaats de out naar achter de vibe" / "move vibe before out"
  m = /^(?:zet|verplaats|schuif|move|put)\s+(?:de\s+|het\s+|the\s+)?(.+?)\s+(?:naar\s+)?(voor|vóór|before|in front of|na|achter|after|behind)\s+(?:de\s+|het\s+|the\s+)?(.+?)(?:\s+in het rack)?$/.exec(t);
  if (m) return { kind: 'move', module: m[1]!.trim(), relation: /^(voor|vóór|before|in front of)$/.test(m[2]!) ? 'before' : 'after', target: m[3]!.trim() };
  // "pan de stemmen van links naar rechts" / "spreid de 8 uitgangen over het stereobeeld" / "spread the voices"
  if (/^(?:pan|spreid|verdeel|spread)\b/.test(t) && /\b(?:stem|stemmen|voices?|kanalen|uitgangen|channels?|outputs?)\b|links|rechts|left|right|stereo/.test(t)) {
    const pct = /(\d{1,3})\s*(?:%|procent)/.exec(t);
    return { kind: 'spread', width: pct ? Math.max(0, Math.min(1, Number(pct[1]) / 100)) : /half|smal|narrow/.test(t) ? 0.5 : 1 };
  }
  // "zet de cutoff van het filter op 1200" / "set the filter cutoff to 1200"
  m = /^(?:zet|draai|set|turn)\s+(?:de\s+|het\s+|the\s+)?(.+?)\s+(?:van|of|on)\s+(?:de\s+|het\s+|the\s+)?(.+?)\s+(?:op|naar|to)\s+(-?[\d.,]+|[a-z]+)$/.exec(t);
  if (m) {
    const raw = m[3]!.replace(',', '.');
    return { kind: 'set', module: m[2]!.trim(), values: { [m[1]!.trim()]: /^-?[\d.]+$/.test(raw) ? Number(raw) : raw } };
  }
  // "haal de vca weg" / "verwijder de envelope" / "remove the vca"
  m = /^(?:haal|verwijder|remove|delete|schrap)\s+(?:de\s+|het\s+|the\s+|een\s+|a\s+)?(.+?)(?:\s+(?:weg|eruit|uit de patch))?$/.exec(t);
  if (m && !/^(?:alle|all)\b/.test(m[1]!)) return { kind: 'remove', module: m[1]!.trim() };
  m = /^(?:vervang|verwissel|wissel|replace|swap|change)\s+(?:de\s+|het\s+|the\s+|een\s+)?(.+?)\s+(?:door|met|by|with|for|in|to|voor)\s+(?:een\s+|a\s+|an\s+)?(.+?)$/.exec(t);
  if (m) return { kind: 'replace', from: m[1]!.trim(), to: m[2]!.trim() };

  m = /^(?:voeg|zet|plaats|hang|add|put|insert|stuur|leg)\s+(?:een\s+|a\s+|an\s+|de\s+|het\s+|the\s+)?(lfo|envelope|env|ahdsr|adsr|tides|stages|aftertouch|after touch|druk|pressure|press|modwheel|mod wheel|modulatiewiel|pitch bend|pitchbend|bend|velocity|aanslag|release velocity|cc1|cc2)\s+(?:toe\s+)?(?:op|aan|naar|on|to|at)\s+(?:de\s+|het\s+|the\s+)?(.+?)$/.exec(t);
  if (m) {
    const rest = m[2]!.trim();
    // "cutoff van het filter" / "filter cutoff" / "tune van de vco" / "the vco tune"
    const van = /^(.+?)\s+(?:van|of)\s+(?:de\s+|het\s+|the\s+)?(.+)$/.exec(rest);
    if (van) return { kind: 'addModulation', source: m[1]!, target: van[2]!.trim(), port: van[1]!.trim() };
    const words = rest.split(' ');
    if (words.length >= 2) return { kind: 'addModulation', source: m[1]!, target: words.slice(0, -1).join(' '), port: words.at(-1)! };
    return { kind: 'addModulation', source: m[1]!, target: rest, port: null };
  }

  m = /^(?:voeg|zet|plaats|hang|add|put|insert)\s+(?:een\s+|a\s+|an\s+)?(.+?)\s+(?:toe\s+)?(?:op|aan|achter|na|to|on|at|after)\s+(?:de\s+|het\s+|the\s+)?(?:bus|eind|einde|end|master|uitgang|output|out|mixer)\b/.exec(t);
  if (m) return { kind: 'addBus', module: m[1]!.trim() };

  const v = parseVoices(t);
  if (v !== null && /^(?:maak|zet|naar|make|set|to|change|verander|van)\b/.test(t)
      && /\b(?:deze|dit|this|the|de)\s+patch\b|\bnaar\b|\bto\b|^(?:maak|make|zet|set)\s+(?:er\s+|het\s+|it\s+)?(?:\d|mono|poly)/.test(t)
      && !/\bnieuw|\bnew\b/.test(t)) {
    return { kind: 'voices', voices: v };
  }
  return null;
}

// ── nieuwe patch ────────────────────────────────────────────────────────

function parseBuild(text: string, types: ModuleType[]): { command: Command; unknown: string[] } {
  let t = clean(text);
  const recipe: PatchRecipe = { source: 'vco' };
  const mentioned: string[] = [];
  const unknown: string[] = [];
  const explicitNew = /\bnieuw|\bnew\b/.test(t);

  // Ontkenningen en vlaggen eerst (vóór de alias-scan 'filter' en 'lfo' ziet).
  const eat = (re: RegExp, fn: () => void) => { if (re.test(t)) { fn(); t = t.replace(re, ' '); } };
  eat(/\b(?:zonder|geen|no|without)\s+(?:filter|vcf)\b/, () => { recipe.filter = null; });
  eat(/\b(?:zonder|geen|no|without)\s+(?:envelope|env|adsr|ahdsr)\b/, () => { recipe.ampEnv = false; recipe.filterEnv = false; });
  eat(/\b(?:zonder|geen|no|without)\s+(?:filter\s*)?(?:envelope|env)\b/, () => { recipe.filterEnv = false; });
  eat(/\b(?:zonder|geen|no|without)\s+(?:velocity|aanslag)\b/, () => { recipe.velocity = false; });
  eat(/\b(?:zonder|geen|no|without)\s+vibrato\b/, () => { recipe.vibrato = false; });
  eat(/\b(?:met\s+|with\s+)?vibrato\b/, () => { recipe.vibrato = true; });
  eat(/\blfo\s+(?:per\s+(?:stem|voice|noot)|op\s+(?:het\s+)?filter|on\s+(?:the\s+)?filter)\b/, () => { recipe.voiceLfo = true; });
  eat(/\b(?:per\s+stem\s+|per\s+voice\s+)(?:een\s+|a\s+)?lfo\b/, () => { recipe.voiceLfo = true; });

  const voices = parseVoices(t);
  if (voices !== null) recipe.voices = voices;
  t = t.replace(/\b\d{1,2}\s*(?:x|×|\*|-)?\s*(?:stemmig|stemmige|stemmen|stems|voice|voices|poly|polyfoon|polyfone|polyphonic)\b/g, ' ')
       .replace(/\b(?:poly|polyfoon|polyphonic)\s*(?:x|×)?\s*\d{1,2}\b/g, ' ')
       .replace(/\b\d{1,2}\s*(?:x|×)\b/g, ' ');

  // Tokens: markers (bus / per stem) en modules (langste alias eerst).
  type Tok = { kind: 'bus' } | { kind: 'voice' } | { kind: 'mod'; typeId: string; text: string } | { kind: 'word'; text: string };
  const words = t.split(' ').filter(Boolean);
  const toks: Tok[] = [];
  for (let i = 0; i < words.length;) {
    let hit = false;
    for (let n = Math.min(4, words.length - i); n >= 1 && !hit; --n) {
      const phrase = words.slice(i, i + n).join(' ');
      if (BUS_MARKERS.includes(phrase))   { toks.push({ kind: 'bus' });   i += n; hit = true; break; }
      if (VOICE_MARKERS.includes(phrase)) { toks.push({ kind: 'voice' }); i += n; hit = true; break; }
      if (n === 1 && (STOP.has(phrase) || /^\d+$/.test(phrase))) break;
      const typeId = resolveTypeId(phrase, types);
      if (typeId && (n > 1 || !STOP.has(phrase))) {
        toks.push({ kind: 'mod', typeId, text: phrase }); i += n; hit = true; break;
      }
    }
    if (!hit) {
      const w = words[i]!;
      if (!STOP.has(w) && !/^\d+$/.test(w)) toks.push({ kind: 'word', text: w });
      i += 1;
    }
  }

  // Slots vullen. Een positiewoord geldt voor het dichtstbijzijnde effect
  // ervóór (als dat nog geen plek had) en voor alles erna.
  let sourceSet = false, filterSet = recipe.filter === null;
  let mode: 'auto' | 'bus' | 'voice' = 'auto';
  const fx: { typeId: string; place: 'auto' | 'bus' | 'voice' }[] = [];
  const bus: RecipeModule[] = [], vfx: RecipeModule[] = [];
  for (const tok of toks) {
    if (tok.kind === 'word') { unknown.push(tok.text); continue; }
    if (tok.kind === 'bus' || tok.kind === 'voice') {
      mode = tok.kind;
      const last = fx.at(-1);
      if (last && last.place === 'auto') last.place = tok.kind;
      continue;
    }
    const tt = types.find((x) => x.id === tok.typeId); const kind = tt ? kindOf(tt) : 'util';
    mentioned.push(tok.typeId);
    if ((kind === 'source' || kind === 'drum' || kind === 'noise') && !sourceSet) { recipe.source = tok.typeId; sourceSet = true; }
    else if (kind === 'source' || kind === 'drum' || kind === 'noise') unknown.push(`${tok.text} (tweede bron genegeerd)`);
    else if (kind === 'filter' && !filterSet) { recipe.filter = tok.typeId; filterSet = true; }
    else if (kind === 'filter') unknown.push(`${tok.text} (tweede filter genegeerd)`);
    else if (kind === 'fx') fx.push({ typeId: tok.typeId, place: mode });
    else if (kind === 'lfo') { if (mode === 'voice') recipe.voiceLfo = true; else recipe.vibrato = true; }
    else if (kind === 'env') { recipe.ampEnv = true; }
    else if (kind === 'vca' || kind === 'mixer' || kind === 'out' || kind === 'midi') { /* impliciet */ }
    else unknown.push(tok.text);
  }
  for (const f of fx) {
    const place = f.place !== 'auto' ? f.place : (BUS_DEFAULT.has(f.typeId) ? 'bus' : 'voice');
    const roles = CATALOG[f.typeId];
    void roles;
    (place === 'bus' ? bus : vfx).push(f.typeId);
  }
  // Stereo-only effecten kunnen niet per stem: die gaan naar de bus.
  const stereoOnly = (typeId: string) => {
    const tp = types.find((x) => x.id === typeId);
    return !!tp && !tp.ports.some((q) => q.id === 'in' && q.direction === 'in' && q.signalType === 'audio');
  };
  for (const v of vfx.slice()) {
    if (typeof v === 'string' && stereoOnly(v)) { vfx.splice(vfx.indexOf(v), 1); bus.push(v); }
  }
  if (bus.length) recipe.bus = bus;
  if (vfx.length) recipe.voiceFx = vfx;

  return { command: { kind: 'build', recipe, mentioned, explicitNew }, unknown };
}

// ── samenvatting ────────────────────────────────────────────────────────

export function describeRecipe(r: PatchRecipe, types: ModuleType[]): string {
  const nm = (m: RecipeModule) => {
    const id = resolveTypeId(typeof m === 'string' ? m : m.type, types);
    return id ? shortName(id, types) : String(typeof m === 'string' ? m : m.type);
  };
  const n = r.voices ?? 1;
  const chain = [nm(r.source), ...(r.filter === null ? [] : [nm(r.filter ?? 'vcf')]), ...(r.voiceFx ?? []).map(nm),
                 ...((r.ampEnv ?? true) || (r.velocity ?? true) ? ['VCA'] : [])];
  const flags = [
    r.filter !== null && (r.filterEnv ?? true) ? null : (r.filter === null ? 'geen filter' : 'geen filter-env'),
    (r.ampEnv ?? true) ? null : 'geen amp-env',
    r.vibrato === true ? 'vibrato' : r.vibrato === false ? 'geen vibrato' : null,
    r.voiceLfo ? 'LFO per stem' : null,
  ].filter(Boolean);
  return `${n === 1 ? 'mono' : `${n}× poly`} · ${chain.join(' → ')}`
    + (r.bus?.length ? ` · bus: ${r.bus.map(nm).join(' → ')}` : '')
    + (flags.length ? ` · ${flags.join(', ')}` : '');
}

export function describeCommand(c: Command, types: ModuleType[]): string {
  // Type-id's en aliassen netjes als korte naam tonen; onbekende woorden
  // blijven staan zoals getypt (dan ziet de gebruiker wat er mis is).
  const nice = (s: string) => { const id = resolveTypeId(s, types); return id ? shortName(id, types) : s; };
  switch (c.kind) {
    case 'build':   return `Nieuwe patch: ${describeRecipe(c.recipe, types)}`;
    case 'voices':  return c.voices === 1 ? 'Deze patch terug naar mono' : `Deze patch ${c.voices}-stemmig maken`;
    case 'replace': return `Vervang "${nice(c.from)}" door ${nice(c.to)}`;
    case 'addBus':  return `Zet ${nice(c.module)} op de bus vóór OUT`;
    case 'addModulation': return `Hang een ${nice(c.source)} aan ${nice(c.target)}${c.port ? `.${c.port}` : ''}`;
    case 'move': return c.relation === 'swap' ? `Wissel ${nice(c.module)} en ${nice(c.target)} om in het rack` : `Zet ${nice(c.module)} ${c.relation === 'before' ? 'vóór' : 'na'} ${nice(c.target)} in het rack`;
    case 'remove': return `Haal ${nice(c.module)} weg (audio wordt doorverbonden)`;
    case 'connect': return `Kabel ${nice(c.from.module)}.${c.from.port} → ${nice(c.to.module)}.${c.to.port}${c.gain !== undefined && c.gain !== 1 ? ` (gain ${c.gain})` : ''} (bezette cv-ingang: opgeteld via CvMath)`;
    case 'disconnect': return `Kabel${c.from ? ` ${nice(c.from.module)}.${c.from.port}` : 's'} → ${nice(c.to.module)}.${c.to.port} weghalen`;
    case 'spread': return `Verdeel de stemmen over het stereobeeld${c.width < 1 ? ` (breedte ${Math.round(c.width * 100)}%)` : ''}`;
    case 'set': return `Zet op ${nice(c.module)}: ${Object.entries(c.values).map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v)}`).join(', ')}`;
  }
}

/** Parseer één regel. `hasActivePatch` bepaalt of een kale stemmen-opdracht
 *  ("maak er 4 stemmen van") een bewerking is of een nieuwe patch. */
export function parseCommand(text: string, types: ModuleType[], hasActivePatch = true): ParseResult {
  const t = clean(text);
  if (!t) return { command: { kind: 'build', recipe: { source: 'vco' }, mentioned: [], explicitNew: false }, unknown: [], summary: '' };
  const edit = hasActivePatch ? parseEdit(t) : null;
  if (edit) return { command: edit, unknown: [], summary: describeCommand(edit, types) };
  const b = parseBuild(t, types);
  const cmd = b.command as Extract<Command, { kind: 'build' }>;
  // Alleen een stemmental, geen modules, en er is een patch: dan bedoel je die patch.
  if (hasActivePatch && !cmd.explicitNew && cmd.mentioned.length === 0 && cmd.recipe.voices !== undefined && b.unknown.length === 0) {
    const v: Command = { kind: 'voices', voices: cmd.recipe.voices };
    return { command: v, unknown: [], summary: describeCommand(v, types) };
  }
  return { command: cmd, unknown: b.unknown, summary: describeCommand(cmd, types) };
}
