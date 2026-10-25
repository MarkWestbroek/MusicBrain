// De patch onder de freestyle-machine (MOCKUP.md §4.3, §6): één vaste set
// modules, gebouwd zoals de seeds in seedModules.ts, met de standen van de
// eerste sectie van de stijl. De pagina wijzigt daarna alleen knoppen
// (updateControl) op maatgrenzen; patronen en klank blijven in de wasm-
// modules, zodat dezelfde patch later op de Teensy kan draaien.
//
//   CLOCK (140) ─bar──▶ reset van beide sequencers
//         └─x2───────▶ GRIDS (externe klok: 1 puls = 1/16 op 70, dus
//                             32 stappen = één frase van vier maten op 140)
//   GRIDS bd ─▶ PEAKS kick · ACID gate · bas-SEQ clock (een basnoot per kick)
//   GRIDS sd ─▶ PEAKS snare        GRIDS hh ─▶ PEAKS hat
//   GRIDS acc ─▶ motief-SEQ clock ─▶ E-PIANO stem 1 ─▶ REVERB
//   drums + bas ─▶ MIXER 1 ─▶ MIXER 2 ◀─ REVERB ─▶ OUT
//
// Muten gaat via de Level-knop van de wasm-modules (de mixer is web-audio en
// kan niet live); DROP is de mastergain van de engine.

import { seedInternals } from '../modular-mb/seedModules';
import { uid } from '../modular-mb/store';
import {
  emptyModularProject,
  type ControlValue, type ModularProject, type ModuleInstance, type Patch, type PatchConnection, type Rack, type RackSlot,
} from '../modular-mb/types';
import { STEMS, STEM_LEVELS, type Change, type ModuleKey, type Style } from './style';

export interface FreestyleRig {
  project: ModularProject;
  patch: Patch;
  /** Module-id per logische naam, voor updateControl. */
  ids: Record<ModuleKey, string>;
}

export const RIG_TYPES: Record<ModuleKey, string> = {
  clock: 'tp_mmb_clock', grids: 'tp_mmb_grids', kick: 'tp_mmb_peaks', snare: 'tp_mmb_peaks', hat: 'tp_mmb_peaks',
  bass: 'tp_mmb_acid', bassSeq: 'tp_mmb_seq8', motifSeq: 'tp_mmb_seq8', piano: 'tp_mmb_epiano', reverb: 'tp_mmb_reverb',
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
    motifSeq: { root: 65, rate: 2, gate: 0.5, length: 8, run: 0 },
    piano:    { type: 0, timbre: 0.4, bell: 0.3, decay: 0.7, drive: 0, level: 0.7, tremolo: 0, trem_rate: 4, damper: 0.6 },
    reverb:   { size: 0.7, mode: 0, damp: 0.5, predelay: 20, mod: 0.2, mix: 0.35 },
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
  const out = fresh('tp_mmb_out', 'OUT');
  const all = [...keys.map((k) => mod[k]), mixer1, mixer2, out];

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name: `Freestyle · ${style.name}`,
    description: 'Clock → Grids → Peaks ×3 + Acid (bas per kick); accenten → Seq → E-piano → Reverb.',
    rows: 1, hpPerRow: Math.max(64, all.reduce((n, m) => n + m.visual.hpWidth, 0) + 4),
    slots: all.map(place), kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: fm.id, portId: fp }, to: { moduleId: tm.id, portId: tp },
  });
  const m = mod;
  const connections: PatchConnection[] = [
    c(m.clock, 'x2', m.grids, 'clock'),
    c(m.clock, 'bar', m.bassSeq, 'reset'),
    c(m.clock, 'bar', m.motifSeq, 'reset'),
    c(m.grids, 'bd', m.kick, 'gate'),
    c(m.grids, 'bd', m.bass, 'gate'),
    c(m.grids, 'bd', m.bassSeq, 'clock'),
    c(m.bassSeq, 'cv', m.bass, 'voct'),
    c(m.grids, 'sd', m.snare, 'gate'),
    c(m.grids, 'hh', m.hat, 'gate'),
    c(m.grids, 'acc', m.motifSeq, 'clock'),
    c(m.motifSeq, 'cv', m.piano, 'voct_1'),
    c(m.motifSeq, 'gate_out', m.piano, 'gate_1'),
    c(m.piano, 'out_l', m.reverb, 'in_l'),
    c(m.piano, 'out_r', m.reverb, 'in_r'),
    c(m.kick, 'out', mixer1, 'in1'),
    c(m.bass, 'out', mixer1, 'in2'),
    c(m.snare, 'out', mixer1, 'in3'),
    c(m.hat, 'out', mixer1, 'in4'),
    c(mixer1, 'out_l', mixer2, 'in1'),
    c(mixer1, 'out_r', mixer2, 'in2'),
    c(m.reverb, 'out_l', mixer2, 'in3'),
    c(m.reverb, 'out_r', mixer2, 'in4'),
    c(mixer2, 'out_l', out, 'l'),
    c(mixer2, 'out_r', out, 'r'),
  ];

  // Standen: klank + tempo van de stijl + de eerste sectie + haar stems.
  const state = baseState();
  state.clock.tempo = style.bpm;
  state.grids.tempo = style.bpm;
  const first = style.sections[0];
  if (first) {
    for (const ch of first.changes) state[ch.module][ch.control] = ch.value;
    for (const ch of stemChanges(first.stems)) state[ch.module][ch.control] = ch.value;
  }
  const controlState: Patch['controlState'] = Object.fromEntries(keys.map((k) => [mod[k].id, state[k]]));
  controlState[mixer1.id] = { vol1: 0.9, pan1: 0, vol2: 0.85, pan2: 0, vol3: 0.8, pan3: 0.1, vol4: 0.7, pan4: -0.15 };
  controlState[mixer2.id] = { vol1: 1, pan1: -1, vol2: 1, pan2: 1, vol3: 0.8, pan3: -1, vol4: 0.8, pan4: 1 };
  controlState[out.id] = { level: 0.85 };

  const patch: Patch = {
    id: uid('patch'), name: `Freestyle · ${style.name}`,
    description: `De vaste patch van de freestyle-machine (spinoffs/freestyle-machine/MOCKUP.md), stijl ${style.name}, ${style.bpm} bpm (${style.feel}). Grids speelt op de halve klok (x2), dus zijn 32 stappen zijn één frase van vier maten; elke kick slaat ook de 808-sub aan en schuift de baslijn een stap; de accenten van Grids spelen het motief op de e-piano.`,
    voiceCount: 1, rackIds: [rack.id], connections, controlState, tempo: style.bpm,
    envelopes: [], lfos: [],
  };

  const ids = Object.fromEntries(keys.map((k) => [k, mod[k].id])) as Record<ModuleKey, string>;
  const project: ModularProject = {
    ...p, racks: [...p.racks, rack], modules: [...p.modules, ...all], patches: [...p.patches, patch],
    activeRackId: rack.id, activePatchId: patch.id,
  };
  return { project, patch, ids };
}

/** De Level-standen die bij een stem-stand horen (aan = niveau, uit = 0). */
export function stemChanges(stems: Record<string, boolean>): Change[] {
  return STEMS.flatMap((s) => STEM_LEVELS[s].map((l) => ({ module: l.module, control: l.control, value: stems[s] ? l.level : 0 })));
}
