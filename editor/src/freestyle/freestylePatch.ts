// De patch onder de freestyle-machine (MOCKUP.md §4.3, §6): één vaste set
// modules, gebouwd zoals de seeds in seedModules.ts, met de standen van de
// eerste sectie van de stijl. De pagina wijzigt daarna alleen knoppen
// (updateControl) op maatgrenzen; patronen en klank blijven in de wasm-
// modules, zodat dezelfde patch later op de Teensy kan draaien.
//
//   CLOCK (140) ─bar──▶ reset van beide sequencers
//         └─x2 of x4─▶ GRIDS (externe klok; trap op x2: 1 puls = 1/16 op 70,
//                             dus 32 stappen = één frase van vier maten op 140)
//   GRIDS bd ─▶ PEAKS kick · (bass 'kick':) ACID gate · bas-SEQ clock (een basnoot per kick)
//   (bass 'euclid':) CLOCK x4 ─▶ EUCLID (reset op bar) ─any─▶ bas-SEQ clock ─gate_out─▶ ACID gate
//   (bass 'slide':)  EUCLID kanaal 1 ─▶ bas-SEQ clock; kanaal 2 (elke zestiende) ─▶ slide-SEQ (reset op bar) ─cv─▶ LOGIC gt ─▶ ACID slide
//   GRIDS sd ─▶ PEAKS snare        GRIDS hh ─▶ PEAKS hat
//   (hats 'ratchet'): GRIDS hh ─▶ RATCHET thru (clock x4, reset bar, roll ◀─ LOGIC gt) ─gate/accent/pitch─▶ CR-78 HiHat ─▶ MIXER 1 (de PEAKS-hat hangt los)
//   GRIDS acc ─▶ motief-SEQ clock ─▶ E-PIANO stem 1 ─▶ REVERB
//   (keys 'riff':)   CLOCK x4 ─▶ toetsen-EUCLID kanaal 1 ─▶ motief-SEQ clock ─cv/gate─▶ SYNTHEX cel 1 (geen e-piano)
//   (keysFx 'dirty':) toetsen L ─▶ DRIVE ─▶ FET COMP ─▶ STEREO PHASER ─L/R─▶ KEYS-mixer (of REVERB)
//   (bassFx 'drive':) ACID out ─▶ DRIVE ─▶ MIXER 1 (in plaats van ACID rechtstreeks)
//   (padVoices 'chord':) CHORD out1–4 ─▶ PAD strip 1–4 (gate = Div), in plaats van de padsequencer op strip 1
//   drums + bas ─▶ MIXER 1 ─▶ DRY ─▶ MIXER 2 ◀─ REVERB ─▶ OUT   (keys 'riff': de synth ook droog in DRY, zacht naar de galm)
//
// Muten gaat via de Level-knop van de wasm-modules (de mixer is web-audio en
// kan niet live); DROP is de mastergain van de engine. EUCLID zit in elke
// patch (klein, CV-domein) en hangt alleen aan kabels als de stijl hem
// gebruikt, zodat de module-id's voor elke stijl dezelfde namen hebben.

import { seedInternals } from '../modular-mb/seedModules';
import { uid } from '../modular-mb/store';
import {
  emptyModularProject,
  type ControlValue, type ModularProject, type ModuleInstance, type Patch, type PatchConnection, type Rack, type RackSlot,
} from '../modular-mb/types';
import { STEMS, stemLevels, type Change, type ModuleKey, type Style } from './style';

export interface FreestyleRig {
  project: ModularProject;
  patch: Patch;
  /** Module-id per logische naam, voor updateControl. */
  ids: Record<ModuleKey, string>;
}

export const RIG_TYPES: Record<ModuleKey, string> = {
  clock: 'tp_mmb_clock', grids: 'tp_mmb_grids', kick: 'tp_mmb_peaks', snare: 'tp_mmb_peaks', hat: 'tp_mmb_peaks',
  bass: 'tp_mmb_acid', bassSeq: 'tp_mmb_seq8', bassGate: 'tp_mmb_euclid', motifSeq: 'tp_mmb_seq8', piano: 'tp_mmb_epiano', reverb: 'tp_mmb_reverb',
  chord: 'tp_mmb_chord', keysGate: 'tp_mmb_euclid', pad: 'tp_mmb_tapestrip', padSeq: 'tp_mmb_seq8',
  slideSeq: 'tp_mmb_seq8', slideGate: 'tp_mmb_logic',
  synth: 'tp_mmb_synthex', bassDrive: 'tp_mmb_drive', keysDrive: 'tp_mmb_drive', keysComp: 'tp_mmb_fet_comp', keysPhaser: 'tp_mmb_stereo_phaser',
  ratchet: 'tp_mmb_ratchet', rollHat: 'tp_mmb_cr78', rollGate: 'tp_mmb_logic',
};

/** Vaste standen (klank), los van de secties. */
function baseState(): Record<ModuleKey, Record<string, ControlValue>> {
  return {
    // run 0: de pagina zet hem aan op het startmoment, dan begint hij vers op tel 1.
    clock:    { tempo: 140, run: 0, swing: 0, width: 0.5, div: 6 },
    grids:    { extclock: 1, tempo: 140, x: 0.3, y: 0.2, bd: 0.5, sd: 0.5, hh: 0.6, chaos: 0 },
    // 808: lange boom, een paar halve tonen omlaag.
    kick:     { drum: 0, tone: 0.35, decay: 0.85, snap: 0.6, coarse: -4, level: 0.9 },
    // Snare met hoge snap en korte decay: richting clap.
    snare:    { drum: 1, tone: 0.7, decay: 0.3, snap: 0.8, coarse: 0, level: 0.75 },
    hat:      { drum: 2, tone: 0.6, decay: 0.15, snap: 0.5, coarse: 0, level: 0.45 },
    // Sub-bas: zaag door een bijna dicht filter, weinig envelope.
    bass:     { wave: 0, tune: 0, cutoff: 0.12, res: 0.1, envmod: 0.25, decay: 0.6, accent: 0.3, level: 0.7 },
    // Externe klok: Rate bepaalt alleen nog de gate-lengte (Gate × 1/Rate).
    bassSeq:  { root: 29, rate: 4, gate: 0.5, length: 16, run: 0 },
    // Slagpatroon voor de bas (alleen bekabeld bij `bass: 'euclid'`): externe
    // klok, de secties zetten steps/fill/rot; de sequencer-gate bepaalt dan de
    // nootlengte, dus Gate ruim open.
    bassGate: { extclock: 1, tempo: 140, steps_1: 16, fill_1: 0, rot_1: 0, steps_2: 16, fill_2: 0, rot_2: 0, steps_3: 16, fill_3: 0, rot_3: 0 },
    motifSeq: { root: 65, rate: 2, gate: 0.5, length: 8, run: 0 },
    piano:    { type: 0, timbre: 0.4, bell: 0.3, decay: 0.7, drive: 0, level: 0.7, tremolo: 0, trem_rate: 4, damper: 0.6 },
    reverb:   { size: 0.7, mode: 0, damp: 0.5, predelay: 20, mod: 0.2, mix: 0.35 },
    // Toetsen-uitbreiding (alleen bekabeld bij keys 'chords' / pad): CHORD op
    // C4 (ingang los = 0 V), slagpatroon stil, pad op de Mellotron-fluitbank.
    chord:    { chord: 1, inv: 0, spread: 0 },
    keysGate: { extclock: 1, tempo: 140, steps_1: 16, fill_1: 0, rot_1: 0, steps_2: 16, fill_2: 0, rot_2: 0, steps_3: 16, fill_3: 0, rot_3: 0 },
    pad:      { bank: 7, length: 8, return: 1, contact: 0.5, motor: 0.4, wow: 0.3, flutter: 0.3, wear: 0.3, level: 0.6 },
    padSeq:   { root: 60, rate: 0.5, gate: 0.95, length: 2, run: 0 },
    // Slide-rij (alleen bekabeld bij `bass: 'slide'`): zestien stappen op x4,
    // s = 12 (1 V) is Slide hoog, 0 is laag; de secties zetten de rij.
    slideSeq: { root: 60, rate: 4, gate: 0.5, length: 16, run: 0 },
    // LOGIC `gt` met B los: A > drempel, dus van de rij (0 of 1 V) een gate.
    slideGate: { thresh: 0.5 },
    // Synth en vuil (alleen bekabeld bij keys 'riff' / bassFx / keysFx):
    // neutrale standen (de fabrieksstanden van de modules), de stijl zet ze
    // in `sound`.
    synth: {
      o1_oct: 2, o1_wave: 0, o1_level: 10, o2_oct: 2, o2_wave: 0, o2_level: 8, o2_transpose: 0, o2_detune: 6, pw: 0.3, noise: 0,
      freq: 6, res: 2, env_amt: 4, kbd: 3, mode: 0, fa: 0.5, fd: 5, fs: 6, fr: 4, aa: 0.5, ad: 5, as: 8, ar: 4,
      lfo_rate: 5, lfo_wave: 0, lfo_osc: 0, lfo_pw: 0, lfo_vcf: 0, lfo_vca: 0, glide: 0, tune: 0, chorus: true, sync: false, ring: false, level: 0.8,
    },
    bassDrive:  { mode: 0, drive: 0.5, tone: 0.5, level: 0.5, mix: 1 },
    keysDrive:  { mode: 0, drive: 0.5, tone: 0.5, level: 0.5, mix: 1 },
    keysComp:   { input: 0, output: 0, attack: 4, release: 4, ratio: 0, color: 1, mix: 1, bypass: 0 },
    keysPhaser: { rate: 0.4, depth: 0.7, feedback: 0.3, spread: 0.5, mix: 0.5 },
    // Roffels (alleen bekabeld bij hats 'ratchet'): alle stappen rust, de
    // stijl zet de standen per sectie; CR-78 op HiHat; Roll laag (LOGIC gt
    // met A los: 0 V > 0,5 is onwaar).
    ratchet: {
      ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`a_${i + 1}`, 0])), ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`b_${i + 1}`, 0])),
      length: 16, base: 0.6, ramp: 0.4, sweep: 0, rollstand: 5, width: 50,
    },
    rollHat:  { drum: 5, tone: 0.5, decay: 0.5, bend: 0.5, level: 0.55 },
    rollGate: { thresh: 0.5 },
  };
}

/** Bouw de patch voor een stijl; `base` is een project met de interne
 *  moduletypes (standaard: een vers project). */
export function buildFreestyleRig(style: Style, base: ModularProject = seedInternals(emptyModularProject())): FreestyleRig {
  const p = Object.values(RIG_TYPES).some((tid) => !base.moduleTypes.some((t) => t.id === tid)) ? seedInternals(base) : base;

  const fresh = (tid: string, name: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid);
    if (!proto) throw new Error(`freestyle: moduletype ${tid} ontbreekt in het project`);
    return { ...proto, id: uid('mod'), internal: false, name, visual: proto.visual };
  };
  const keys = Object.keys(RIG_TYPES) as ModuleKey[];
  const mod = Object.fromEntries(keys.map((k) => [k, fresh(RIG_TYPES[k], k.toUpperCase())])) as Record<ModuleKey, ModuleInstance>;
  const mixer1 = fresh('tp_mmb_mixer', 'DRUMS');
  const mixer2 = fresh('tp_mmb_mixer', 'MASTER');
  // De toetsen (e-piano en pad) samen de galm in; zonder pad gaat de e-piano
  // er rechtstreeks in, zoals vóór 2026-10-27.
  const keysMix = fresh('tp_mmb_mixer', 'KEYS');
  // Drums en (keys 'riff') de synth droog, vóór de master: zo krijgt de
  // synth weinig galm en de strijkers veel (Mark: "in your face" voorop, de
  // strijkers naar achteren).
  const dryMix = fresh('tp_mmb_mixer', 'DRY');
  const out = fresh('tp_mmb_out', 'OUT');
  const all = [...keys.map((k) => mod[k]), mixer1, dryMix, mixer2, keysMix, out];

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name: `Freestyle · ${style.name}`,
    description: `Clock → Grids → Peaks ×3 + Acid (bas ${style.bass === 'kick' ? 'per kick' : style.bass === 'slide' ? 'uit Euclid, met slide-rij' : 'uit Euclid'}${style.bassFx ? ', door Drive' : ''}); ${style.keys === 'riff' ? 'Euclid → Seq → Synthex' : 'accenten → Seq → E-piano'}${style.keysFx ? ' → Drive → FET comp → Stereo phaser' : ''} → Reverb.`,
    rows: 1, hpPerRow: Math.max(64, all.reduce((n, m) => n + m.visual.hpWidth, 0) + 4),
    slots: all.map(place), kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: fm.id, portId: fp }, to: { moduleId: tm.id, portId: tp },
  });
  const m = mod;
  // De toetsen: de e-piano, of (keys 'riff') de SYNTHEX. Als stereopaar
  // rechtstreeks, of (keysFx) mono door DRIVE → FET COMP → STEREO PHASER, die
  // er weer stereo van maakt ("mono in geeft stereo uit"; de compressor met
  // alleen L is mono op beide).
  const keysSrc = style.keys === 'riff' ? m.synth : m.piano;
  const keysOut: ModuleInstance = style.keysFx ? m.keysPhaser : keysSrc;
  const connections: PatchConnection[] = [
    ...(style.keysFx
      ? [c(keysSrc, 'out_l', m.keysDrive, 'in'), c(m.keysDrive, 'out', m.keysComp, 'in_l'), c(m.keysComp, 'out_l', m.keysPhaser, 'in_l')]
      : []),
    c(m.clock, style.gridsClock, m.grids, 'clock'),
    c(m.clock, 'bar', m.bassSeq, 'reset'),
    c(m.clock, 'bar', m.motifSeq, 'reset'),
    c(m.grids, 'bd', m.kick, 'gate'),
    // De bas: per kick, of uit een eigen slagpatroon. In het tweede geval
    // komt de reset (één kabel) een blok vóór de slag (twee kabels) aan, dus
    // de sequencer staat bij de eerste slag op stap 1; style.ts rekent daarmee.
    ...(style.bass === 'kick'
      ? [c(m.grids, 'bd', m.bass, 'gate'), c(m.grids, 'bd', m.bassSeq, 'clock')]
      : [c(m.clock, 'x4', m.bassGate, 'clock'), c(m.clock, 'bar', m.bassGate, 'reset'),
        c(m.bassGate, style.bass === 'slide' ? 'out_1' : 'any', m.bassSeq, 'clock'), c(m.bassSeq, 'gate_out', m.bass, 'gate')]),
    // De glijdende 808 (bass 'slide'): Euclid-kanaal 1 is het slagraster,
    // kanaal 2 (elke zestiende) stapt een tweede rij, die via LOGIC (gt: rij
    // > drempel) de Slide-ingang van ACID zet; hoog = de noot blijft liggen
    // en de volgende slag glijdt erheen, laag = los. Vier kabels tegenover
    // drie voor de gate: de rij komt één blok ná de gate aan, zodat Slide bij
    // een nieuwe aanslag nog laag is en de noot op toon begint; de boog gaat
    // pas daarna hoog (de kernel leest Slide vóór Gate).
    ...(style.bass === 'slide'
      ? [c(m.bassGate, 'out_2', m.slideSeq, 'clock'), c(m.clock, 'bar', m.slideSeq, 'reset'),
        c(m.slideSeq, 'cv', m.slideGate, 'a'), c(m.slideGate, 'gt', m.bass, 'slide')]
      : []),
    c(m.bassSeq, 'cv', m.bass, 'voct'),
    c(m.grids, 'sd', m.snare, 'gate'),
    // De hats: rechtstreeks op de Peaks-hat, of (hats 'ratchet') door RATCHET
    // naar de CR-78-hat, die accent en toon van de roffels volgt; de FILL zet
    // Roll hoog via LOGIC (gt met A los en een negatieve drempel).
    ...(style.hats === 'ratchet'
      ? [c(m.grids, 'hh', m.ratchet, 'thru'), c(m.clock, 'x4', m.ratchet, 'clock'), c(m.clock, 'bar', m.ratchet, 'reset'),
        c(m.rollGate, 'gt', m.ratchet, 'roll'),
        c(m.ratchet, 'gate', m.rollHat, 'gate'), c(m.ratchet, 'accent', m.rollHat, 'accent_cv'), c(m.ratchet, 'pitch', m.rollHat, 'voct')]
      : [c(m.grids, 'hh', m.hat, 'gate')]),
    // De e-piano: één motiefstem per Grids-accent, of akkoorden (CHORD op
    // stem 1–4, slag uit het toetsen-Euclid kanaal 1) met de motiefsequencer
    // als lijn op stem 5 (stapt op kanaal 2) en het sustainpedaal aan de
    // Div-puls van de klok (één per maat, 90 % hoog).
    // Bij `riff` stapt de motiefsequencer op kanaal 1 van het toetsen-Euclid
    // en speelt hij cel 1 van de SYNTHEX; de e-piano hangt dan nergens aan.
    ...(style.keys === 'motif'
      ? [c(m.grids, 'acc', m.motifSeq, 'clock'), c(m.motifSeq, 'cv', m.piano, 'voct_1'), c(m.motifSeq, 'gate_out', m.piano, 'gate_1')]
      : style.keys === 'riff'
      ? [c(m.clock, 'x4', m.keysGate, 'clock'), c(m.clock, 'bar', m.keysGate, 'reset'),
        c(m.keysGate, 'out_1', m.motifSeq, 'clock'), c(m.motifSeq, 'cv', m.synth, 'voct_1'), c(m.motifSeq, 'gate_out', m.synth, 'gate_1')]
      : [
        c(m.clock, 'x4', m.keysGate, 'clock'), c(m.clock, 'bar', m.keysGate, 'reset'),
        ...([1, 2, 3, 4] as const).flatMap((k) => [c(m.chord, `out${k}`, m.piano, `voct_${k}`), c(m.keysGate, 'out_1', m.piano, `gate_${k}`)]),
        c(m.keysGate, 'out_2', m.motifSeq, 'clock'), c(m.motifSeq, 'cv', m.piano, 'voct_5'), c(m.motifSeq, 'gate_out', m.piano, 'gate_5'),
        c(m.clock, 'div', m.piano, 'sustain'),
      ]),
    // Het pad: één noot per maat (padsequencer op `bar`), gate = de Div-puls.
    // Met `chordRoot: 'pad'` volgt CHORD dezelfde CV (de toonsoort van de stijl);
    // met `padVoices: 'chord'` spelen vier strips de vier uitgangen van CHORD.
    ...(style.pad
      ? [c(m.clock, 'bar', m.padSeq, 'clock'),
        ...(style.chordRoot === 'pad' ? [c(m.padSeq, 'cv', m.chord, 'voct')] : []),
        ...(style.padVoices === 'chord' && style.chordRoot === 'pad'
          ? ([1, 2, 3, 4] as const).flatMap((k) => [c(m.chord, `out${k}`, m.pad, `voct_${k}`), c(m.clock, 'div', m.pad, `gate_${k}`)])
          : [c(m.padSeq, 'cv', m.pad, 'voct_1'), c(m.clock, 'div', m.pad, 'gate_1')]),
        c(keysOut, 'out_l', keysMix, 'in1'), c(keysOut, 'out_r', keysMix, 'in2'), c(m.pad, 'out_l', keysMix, 'in3'), c(m.pad, 'out_r', keysMix, 'in4'),
        c(keysMix, 'out_l', m.reverb, 'in_l'), c(keysMix, 'out_r', m.reverb, 'in_r')]
      : [c(keysOut, 'out_l', m.reverb, 'in_l'), c(keysOut, 'out_r', m.reverb, 'in_r')]),
    c(m.kick, 'out', mixer1, 'in1'),
    // De bas rechtstreeks de mixer in, of (bassFx) door DRIVE: de boventonen
    // maken de 808 hoorbaar op een telefoon.
    ...(style.bassFx ? [c(m.bass, 'out', m.bassDrive, 'in'), c(m.bassDrive, 'out', mixer1, 'in2')] : [c(m.bass, 'out', mixer1, 'in2')]),
    c(m.snare, 'out', mixer1, 'in3'),
    c(style.hats === 'ratchet' ? m.rollHat : m.hat, 'out', mixer1, 'in4'),
    c(mixer1, 'out_l', dryMix, 'in1'),
    c(mixer1, 'out_r', dryMix, 'in2'),
    ...(style.keys === 'riff' ? [c(keysOut, 'out_l', dryMix, 'in3'), c(keysOut, 'out_r', dryMix, 'in4')] : []),
    c(dryMix, 'out_l', mixer2, 'in1'),
    c(dryMix, 'out_r', mixer2, 'in2'),
    c(m.reverb, 'out_l', mixer2, 'in3'),
    c(m.reverb, 'out_r', mixer2, 'in4'),
    c(mixer2, 'out_l', out, 'l'),
    c(mixer2, 'out_r', out, 'r'),
  ];

  // Standen: klank + tempo van de stijl + de eerste sectie + haar stems.
  const state = baseState();
  state.clock.tempo = style.bpm;
  state.clock.swing = style.swing;
  state.grids.tempo = style.bpm;
  state.bassGate.tempo = style.bpm;
  if (style.bass !== 'kick') state.bassSeq.gate = 0.95;
  for (const ch of style.sound) state[ch.module][ch.control] = ch.value;
  const first = style.sections[0];
  if (first) {
    for (const ch of first.changes) state[ch.module][ch.control] = ch.value;
    for (const ch of stemChanges(first.stems, style)) state[ch.module][ch.control] = ch.value;
  }
  const controlState: Patch['controlState'] = Object.fromEntries(keys.map((k) => [mod[k].id, state[k]]));
  controlState[mixer1.id] = { vol1: 0.9, pan1: 0, vol2: 0.85, pan2: 0, vol3: 0.8, pan3: 0.1, vol4: 0.7, pan4: -0.15 };
  controlState[mixer2.id] = { vol1: 1, pan1: -1, vol2: 1, pan2: 1, vol3: 0.8, pan3: -1, vol4: 0.8, pan4: 1 };
  // E-piano iets zachter dan het pad (Mark, 2026-10-27). De synth-riff gaat
  // droog door DRY en maar zacht de galm in; de strijkers vol.
  const riff = style.keys === 'riff';
  controlState[keysMix.id] = { vol1: riff ? 0.35 : 0.75, pan1: -1, vol2: riff ? 0.35 : 0.75, pan2: 1, vol3: riff ? 1 : 0.9, pan3: -1, vol4: riff ? 1 : 0.9, pan4: 1 };
  controlState[dryMix.id] = { vol1: 1, pan1: -1, vol2: 1, pan2: 1, vol3: 0.8, pan3: -1, vol4: 0.8, pan4: 1 };
  controlState[out.id] = { level: 0.85 };

  const patch: Patch = {
    id: uid('patch'), name: `Freestyle · ${style.name}`,
    description: `De vaste patch van de freestyle-machine (spinoffs/freestyle-machine/MOCKUP.md), stijl ${style.name}, ${style.bpm} bpm (${style.feel}). Grids stapt op ${style.gridsClock} van de klok${style.gridsClock === 'x2' ? ' (half-time: zijn 32 stappen zijn één frase van vier maten)' : ''}; ${style.bass === 'kick' ? 'elke kick slaat ook de 808-sub aan en schuift de baslijn een stap' : style.bass === 'slide' ? 'Euclid slaat de bas aan op een 3-van-4-raster en een slide-rij op de zestienden laat de 808 glijden en liggen' : 'Euclid op de zestienden slaat de bas aan en schuift de baslijn per slag'}; ${style.keys === 'riff' ? 'de Synthex speelt de riff op het toetsen-Euclid' : 'de accenten van Grids spelen het motief op de e-piano'}.`,
    voiceCount: 1, rackIds: [rack.id], connections, controlState, tempo: style.bpm,
    envelopes: [], lfos: [],
    ...(style.pad ? { simBanks: { [String(style.pad.nn)]: style.pad.file } } : {}),
  };

  const ids = Object.fromEntries(keys.map((k) => [k, mod[k].id])) as Record<ModuleKey, string>;
  const project: ModularProject = {
    ...p, racks: [...p.racks, rack], modules: [...p.modules, ...all], patches: [...p.patches, patch],
    activeRackId: rack.id, activePatchId: patch.id,
  };
  return { project, patch, ids };
}

/** De Level-standen die bij een stem-stand horen (aan = niveau, uit = 0);
 *  met `style` de niveaus van die stijl (`Style.levels`). */
export function stemChanges(stems: Record<string, boolean>, style?: Style): Change[] {
  const levels = stemLevels(style);
  return STEMS.flatMap((s) => levels[s].map((l) => ({ module: l.module, control: l.control, value: stems[s] ? l.level : 0 })));
}
