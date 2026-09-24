// Modulecatalogus voor het patch-recept (ED-RC-1).
//
// Per interne moduletype: korte naam, soort, aliassen (NL/EN) en speelbare
// startwaarden. De aliassen zijn wat een gebruiker (of een LLM) typt; de
// compiler zet ze om naar type-id's. Een type zónder entry werkt ook: de
// poortrollen komen uit de poort-id's (`portRoles`) en de startwaarden uit
// de control-defaults van het type. Alleen de aliassen ontbreken dan.
//
// Poortrollen worden bewust uit de poort-id's afgeleid en niet per type
// opgeschreven, zodat nieuwe firmware-modules meteen meedoen zolang ze de
// bestaande conventies volgen (voct/gate/vel/tune, in/out, in_l/out_l, …).

import { type ControlValue, type ModuleType, type Port, defaultValueOf } from '../types';

export type ModuleKindTag =
  | 'source' | 'filter' | 'vca' | 'env' | 'lfo' | 'fx' | 'mixer' | 'out'
  | 'midi' | 'util' | 'seq' | 'drum' | 'noise';

export interface CatalogEntry {
  /** Korte naam voor labels en de preview ("WT-VCO", "Diode"). */
  short: string;
  kind: ModuleKindTag;
  /** Aliassen, kleine letters; spaties, streepjes en underscores tellen niet. */
  aliases: string[];
  /** Speelbare startwaarden; ontbreken = control-defaults van het type. */
  playable?: Record<string, ControlValue>;
  /** Voor mono bus-effecten die als L/R-paar geplaatst worden: variant voor
   *  de R-kant (bijv. iets kortere echo-tijd = stereo-breedte). */
  widen?: (left: Record<string, ControlValue>) => Record<string, ControlValue>;
}

export const CATALOG: Record<string, CatalogEntry> = {
  // ── bronnen ────────────────────────────────────────────────────────────
  tp_mmb_vco:       { short: 'VCO',      kind: 'source', aliases: ['vco', 'osc', 'oscillator', 'analoge osc', 'saw', 'zaagtand'],
                      playable: { wave: 2, coarse: 0, fine: 0, level: 0.9 } },
  tp_mmb_wt_vco:    { short: 'WT-VCO',   kind: 'source', aliases: ['wt', 'wtvco', 'wavetable', 'wavetable osc', 'wavetable vco', 'wavetableoscillator'] },
  tp_mmb_morph_wt:  { short: 'Morph-WT', kind: 'source', aliases: ['morph', 'morphwt', 'morphing wavetable', 'morph wavetable'] },
  tp_mmb_draw_vco:  { short: 'Draw-VCO', kind: 'source', aliases: ['draw', 'drawvco', 'getekende golf', 'draw waveshape'] },
  tp_mmb_fm_vco:    { short: 'FM-VCO',   kind: 'source', aliases: ['fm', 'fmvco', 'fm osc', 'fm oscillator'] },
  tp_mmb_string:    { short: 'String',   kind: 'source', aliases: ['string', 'snaar', 'karplus', 'karplus strong', 'pluck'],
                      playable: { pluck: 0.9, level: 0.9 } },
  tp_mmb_stk_sound: { short: 'STK',      kind: 'source', aliases: ['stk', 'stk sound', 'physical model', 'physical modelling', 'fysisch model'],
                      playable: { sound: 0, level: 0.9, strength: 0.7, timbre: 0.5, modulation: 0.5 } },
  tp_mmb_plaits:    { short: 'Plaits',   kind: 'source', aliases: ['plaits', 'macro osc', 'macro oscillator'] },
  tp_mmb_rings:     { short: 'Rings',    kind: 'source', aliases: ['rings', 'resonator osc', 'modal'] },
  tp_mmb_elements:  { short: 'Elements', kind: 'source', aliases: ['elements'] },
  tp_mmb_dx7:       { short: 'DX7',      kind: 'source', aliases: ['dx7', 'dx 7', 'fm 6op', '6op fm', 'yamaha'] },
  tp_mmb_sampler:   { short: 'Sampler',  kind: 'source', aliases: ['sampler', 'multisampler', 'sample', 'samples'] },
  tp_mmb_quad_vco_shared: { short: 'Quad-VCO', kind: 'source', aliases: ['quad vco', 'quadvco', '4 vco'] },
  tp_mmb_octa_vco:  { short: 'Octa-VCO', kind: 'source', aliases: ['octa vco', 'octavco', '8 vco'] },
  tp_mmb_noise:     { short: 'Noise',    kind: 'noise',  aliases: ['noise', 'ruis'] },
  tp_mmb_peaks:     { short: 'Peaks',    kind: 'drum',   aliases: ['peaks', 'drum', 'drums'] },
  tp_mmb_cr78:      { short: 'CR-78',    kind: 'drum',   aliases: ['cr78', 'cr 78', 'roland drum'] },

  // ── filters ────────────────────────────────────────────────────────────
  tp_mmb_vcf:       { short: 'VCF',      kind: 'filter', aliases: ['vcf', 'filter', 'svf', 'state variable', 'simpele vcf', 'simpel filter', 'eenvoudig filter', 'simple vcf', 'simple filter', 'multimode'],
                      playable: { cutoff: 800, q: 0.8, cv_amt: 1, type: 0 } },
  tp_mmb_ladder:    { short: 'Ladder',   kind: 'filter', aliases: ['ladder', 'moog', 'moog filter', 'ladder filter', 'transistor ladder'],
                      playable: { cutoff: 600, q: 0.6, drive: 1.0, cv_amt: 2, q_cv_amt: 0.3 } },
  tp_mmb_ms20:      { short: 'MS-20',    kind: 'filter', aliases: ['ms20', 'ms 20', 'korg', 'korg35', 'korg filter', 'sallen key'],
                      playable: { cutoff: 600, q: 0.5, drive: 1.5, cv_amt: 2, q_cv_amt: 0.3, type: 0 } },
  tp_mmb_octa_vcf:  { short: 'Octa-VCF', kind: 'filter', aliases: ['octa vcf', 'octavcf', '8 vcf'] },

  // ── versterkers, envelopes, modulatie ──────────────────────────────────
  tp_mmb_vca:       { short: 'VCA',      kind: 'vca',    aliases: ['vca', 'amp', 'versterker'],
                      playable: { gain: 0, resp: 0 } },
  tp_mmb_octa_vca:  { short: 'Octa-VCA', kind: 'vca',    aliases: ['octa vca', 'octavca', '8 vca'] },
  tp_mmb_stereo_vca:{ short: 'ST-VCA',   kind: 'fx',     aliases: ['stereo vca', 'panner', 'pan'] },
  tp_mmb_ahdsr:     { short: 'AHDSR',    kind: 'env',    aliases: ['ahdsr', 'adsr', 'env', 'envelope', 'omhullende'] },
  tp_mmb_stages:    { short: 'Stages',   kind: 'env',    aliases: ['stages', 'segment'] },
  tp_mmb_env_follower:      { short: 'Env-Follow-8', kind: 'env', aliases: ['envelope follower 8', 'follower 8'] },
  tp_mmb_env_follower_mono: { short: 'Env-Follow',   kind: 'env', aliases: ['envelope follower', 'env follower', 'follower'] },
  tp_mmb_lfo:       { short: 'LFO',      kind: 'lfo',    aliases: ['lfo', 'vibrato', 'tremolo'] },
  tp_mmb_tides:     { short: 'Tides',    kind: 'lfo',    aliases: ['tides', 'slopes'] },
  tp_mmb_sh:        { short: 'S&H',      kind: 'util',   aliases: ['sh', 's&h', 'sample and hold', 'sample & hold', 'slew'] },
  tp_mmb_cvmath:    { short: 'CvMath',   kind: 'util',   aliases: ['cvmath', 'cv math', 'math', 'sum', 'mult', 'attenuator'] },
  tp_mmb_quant:     { short: 'Quant',    kind: 'util',   aliases: ['quant', 'quantizer', 'kwantisator', 'scale'] },
  tp_mmb_chord:     { short: 'Chord',    kind: 'util',   aliases: ['chord', 'akkoord'] },

  // ── sequencers en events ───────────────────────────────────────────────
  tp_mmb_midiin:    { short: 'MIDI-In',  kind: 'midi',   aliases: ['midi', 'midiin', 'midi in', 'keyboard', 'klavier'] },
  tp_mmb_seq8:      { short: 'SEQ-16',   kind: 'seq',    aliases: ['seq', 'seq16', 'sequencer', 'step sequencer', 'stepseq'] },
  tp_mmb_marbles:   { short: 'Marbles',  kind: 'seq',    aliases: ['marbles', 'random sequencer', 'random'] },
  tp_mmb_grids:     { short: 'Grids',    kind: 'seq',    aliases: ['grids', 'drum sequencer', 'drumkaart'] },

  // ── effecten ───────────────────────────────────────────────────────────
  tp_mmb_echo:      { short: 'Echo',     kind: 'fx',     aliases: ['echo', 'delay', 'feedback delay'],
                      playable: { time: 0.5, feedback: 0.55, mix: 0.4 },
                      widen: (l) => ({ ...l, time: (Number(l.time) || 0.5) * 0.75 }) },
  tp_mmb_tape_echo: { short: 'Tape',     kind: 'fx',     aliases: ['tape', 'tape echo', 'tape delay', 'bandecho', 'space echo'],
                      widen: (l) => ({ ...l, time: (Number(l.time) || 0.4) * 0.75 }) },
  tp_mmb_comb:      { short: 'Comb',     kind: 'fx',     aliases: ['comb', 'comb filter', 'kamfilter'],
                      playable: { coarse: 0, feedback: 0.85, mix: 0.4 } },
  tp_mmb_phaser:    { short: 'Phaser',   kind: 'fx',     aliases: ['phaser'],
                      playable: { rate: 0.4, depth: 0.7, mix: 0.5 } },
  tp_mmb_resonator: { short: 'Resonator',kind: 'fx',     aliases: ['resonator', 'sympathetic', 'sympathische snaren'] },
  tp_mmb_clouds:    { short: 'Clouds',   kind: 'fx',     aliases: ['clouds', 'granular', 'granulair'] },
  tp_mmb_warps:     { short: 'Warps',    kind: 'fx',     aliases: ['warps', 'ringmod', 'ring modulator', 'vocoder'] },
  tp_mmb_elements_reverb: { short: 'Reverb', kind: 'fx', aliases: ['reverb', 'galm', 'hall', 'dattorro'] },
  tp_mmb_comp:      { short: 'Comp',     kind: 'fx',     aliases: ['comp', 'compressor', 'simpele compressor', 'simple compressor', 'overdrive'] },
  tp_mmb_fet_comp:  { short: 'FET',      kind: 'fx',     aliases: ['fet', 'fet comp', 'fet compressor', '1176'] },
  tp_mmb_opto_comp: { short: 'Opto',     kind: 'fx',     aliases: ['opto', 'opto comp', 'opto compressor', 'la2a', 'la 2a'] },
  tp_mmb_bus_comp:  { short: 'VCA-Bus',  kind: 'fx',     aliases: ['bus comp', 'buscomp', 'bus compressor', 'vca bus', 'vca compressor', 'ssl comp', 'glue'] },
  tp_mmb_varimu_comp: { short: 'Vari-mu', kind: 'fx',    aliases: ['varimu', 'vari mu', 'vari mu comp', 'vari mu compressor', 'buizencompressor', 'tube comp', 'fairchild'] },
  tp_mmb_diode_comp:{ short: 'Diode',    kind: 'fx',     aliases: ['diode', 'diode comp', 'diode compressor', 'diodebrug', 'diode bridge', 'neve comp', '33609'] },
  tp_mmb_program_eq:{ short: 'Program EQ', kind: 'fx',   aliases: ['program eq', 'pultec', 'programeq'] },
  tp_mmb_console_eq:{ short: 'Console EQ', kind: 'fx',   aliases: ['console eq', 'consoleeq', 'neve eq', 'channel eq'] },
  tp_mmb_para_eq:   { short: 'Para EQ',  kind: 'fx',     aliases: ['para eq', 'paraeq', 'parametric', 'parametrische eq', 'parametric eq', 'ssl eq', 'eq'] },

  // ── mixers en uitgang ──────────────────────────────────────────────────
  tp_mmb_mixer:     { short: 'Mixer',    kind: 'mixer',  aliases: ['mixer', 'mixer4', 'mix'] },
  tp_mmb_mixer8:    { short: 'Mixer-8',  kind: 'mixer',  aliases: ['mixer8', 'mix8'] },
  tp_mmb_mixer16:   { short: 'Mixer-16', kind: 'mixer',  aliases: ['mixer16', 'mix16'] },
  tp_mmb_quad_mixer_shared: { short: 'Quad-Mix', kind: 'mixer', aliases: ['quad mixer', 'quadmix'] },
  tp_mmb_out:       { short: 'OUT',      kind: 'out',    aliases: ['out', 'output', 'uitgang', 'audio out'] },
};

/** Normaliseer een alias/naam: kleine letters, zonder spaties, streepjes,
 *  underscores en een eventueel `tp_mmb_`-voorvoegsel. */
export function normalizeAlias(s: string): string {
  return s.trim().toLowerCase().replace(/^tp[_\s-]*mmb[_\s-]*/, '').replace(/[\s_\-]+/g, '');
}

let aliasIndex: Map<string, string> | null = null;
function buildAliasIndex(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [typeId, e] of Object.entries(CATALOG)) {
    m.set(normalizeAlias(typeId), typeId);
    m.set(normalizeAlias(e.short), typeId);
    for (const a of e.aliases) {
      const k = normalizeAlias(a);
      if (!m.has(k)) m.set(k, typeId);   // eerste wint: 'osc' blijft VCO
    }
  }
  return m;
}

/**
 * Zoek het type-id bij een naam/alias. Volgorde: exact type-id → alias-index
 * → `tp_mmb_<naam>` → variant/naam van het type in het project. Geeft null
 * als niets past.
 */
export function resolveTypeId(ref: string, types: ModuleType[]): string | null {
  const direct = types.find((t) => t.id === ref);
  if (direct) return direct.id;
  const key = normalizeAlias(ref);
  if (!key) return null;
  aliasIndex ??= buildAliasIndex();
  const viaAlias = aliasIndex.get(key);
  if (viaAlias && types.some((t) => t.id === viaAlias)) return viaAlias;
  const guessed = `tp_mmb_${ref.trim().toLowerCase().replace(/[\s-]+/g, '_')}`;
  if (types.some((t) => t.id === guessed)) return guessed;
  const byVariant = types.find((t) => normalizeAlias(t.variant) === key);
  return byVariant ? byVariant.id : null;
}

/** Suggesties bij een onbekende naam: aliassen die de naam bevatten of erop
 *  lijken (deelstring in beide richtingen), maximaal `max`. */
export function suggestTypeIds(ref: string, max = 5): string[] {
  const key = normalizeAlias(ref);
  if (!key) return [];
  const hits = new Set<string>();
  for (const [typeId, e] of Object.entries(CATALOG)) {
    for (const a of [e.short, ...e.aliases]) {
      const k = normalizeAlias(a);
      if (k.includes(key) || key.includes(k)) { hits.add(typeId); break; }
    }
    if (hits.size >= max) break;
  }
  return [...hits];
}

/** Korte naam voor een type (catalogus, anders variant of id). */
export function shortName(typeId: string, types: ModuleType[]): string {
  const e = CATALOG[typeId];
  if (e) return e.short;
  const t = types.find((x) => x.id === typeId);
  return t?.variant ?? typeId;
}

/** Speelbare startwaarden: catalogus-`playable` óf de control-defaults. */
export function playableControls(type: ModuleType): Record<string, ControlValue> {
  const e = CATALOG[type.id];
  if (e?.playable) return { ...e.playable };
  const out: Record<string, ControlValue> = {};
  for (const c of type.controls) {
    if (c.kind === 'display' || c.kind === 'led') continue;
    out[c.id] = defaultValueOf(c);
  }
  return out;
}

// ── Poortrollen ─────────────────────────────────────────────────────────

export interface PortRoles {
  /** Mono audio-ingang, of het L/R-paar. */
  audioIn:  { mono?: string; left?: string; right?: string };
  audioOut: { mono?: string; left?: string; right?: string };
  pitch?: string;      // voct
  gate?: string;       // gate
  vel?: string;        // vel
  tune?: string;       // tune (fijnstemming / vibrato)
  modulation?: string; // STK: modulation
  strength?: string;   // STK/Elements: strength
  cv?: string;         // hoofd-cv-ingang (filter-cutoff, VCA-gain)
}

function pick(ports: Port[], dir: 'in' | 'out', signal: Port['signalType'], ...ids: string[]): string | undefined {
  for (const id of ids) {
    if (ports.some((p) => p.id === id && p.direction === dir && p.signalType === signal)) return id;
  }
  return undefined;
}

/** Leid de poortrollen af uit de poort-id's van een type. Conventies:
 *  mono audio `in`/`out`, stereo `in_l`/`in_r` en `out_l`/`out_r` (OUT: `l`/`r`),
 *  cv `voct`/`gate`/`vel`/`tune`/`cv`. */
export function portRoles(type: ModuleType): PortRoles {
  const ps = type.ports;
  const audioIns  = ps.filter((p) => p.direction === 'in'  && p.signalType === 'audio');
  const audioOuts = ps.filter((p) => p.direction === 'out' && p.signalType === 'audio');
  const audioIn: PortRoles['audioIn'] = {
    mono:  pick(ps, 'in', 'audio', 'in') ?? (audioIns.length === 1 ? audioIns[0]!.id : undefined),
    left:  pick(ps, 'in', 'audio', 'in_l', 'l'),
    right: pick(ps, 'in', 'audio', 'in_r', 'r'),
  };
  const audioOut: PortRoles['audioOut'] = {
    mono:  pick(ps, 'out', 'audio', 'out') ?? (audioOuts.length === 1 ? audioOuts[0]!.id : undefined),
    left:  pick(ps, 'out', 'audio', 'out_l', 'l'),
    right: pick(ps, 'out', 'audio', 'out_r', 'r'),
  };
  return {
    audioIn, audioOut,
    pitch:      pick(ps, 'in', 'cv',   'voct'),
    gate:       pick(ps, 'in', 'gate', 'gate'),
    vel:        pick(ps, 'in', 'cv',   'vel'),
    tune:       pick(ps, 'in', 'cv',   'tune'),
    modulation: pick(ps, 'in', 'cv',   'modulation'),
    strength:   pick(ps, 'in', 'cv',   'strength'),
    cv:         pick(ps, 'in', 'cv',   'cv'),
  };
}

/** Compacte catalogus-tabel (voor de LLM-prompt en de preview, ED-RC-3). */
export function catalogTable(types: ModuleType[]): { typeId: string; short: string; kind: ModuleKindTag; aliases: string[] }[] {
  return types
    .filter((t) => t.internal)
    .map((t) => {
      const e = CATALOG[t.id];
      return { typeId: t.id, short: e?.short ?? t.variant, kind: e?.kind ?? 'util', aliases: e?.aliases ?? [] };
    });
}
