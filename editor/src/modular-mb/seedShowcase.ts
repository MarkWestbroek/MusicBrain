// Demo-patches bij het modulatorpakket en de klassiekers van 2026-10-02:
//
//   seedAcidJamPatch    — Clock → Seq → ACID, met Euclid op Accent en Slide,
//                         Chaos op de cutoff en een kick op de tel.
//   seedWestCoastPatch  — Turing → Quantizer → VCO (sinus) → FOLDER → LPG →
//                         REVERB; LFO-8 en Chaos bewegen de folder, de pulsen
//                         van Turing pingen de gate.
//   seedOrganPolyPatch  — MIDI-in → ORGAN (twaalf toetsen) → ROTARY → OUT.
//
// De eerste twee spelen zichzelf; het orgel bespeel je. Alle drie staan in
// de contract-test (allSeededProject), dus elke kabel is tegen de firmware
// gecontroleerd.

import type {
  ControlValue, ModularProject, ModuleInstance, Patch, PatchConnection, Rack, RackSlot,
} from './types';
import { uid } from './store';
import { seedInternals } from './seedModules';

type Wire = [from: ModuleInstance, output: string, to: ModuleInstance, input: string];

/** Verse instanties van interne types, in één rij in een nieuw rack. */
function build(
  project: ModularProject,
  typeIds: string[],
  rackName: string, rackDescription: string,
): { p: ModularProject; mods: ModuleInstance[]; rack: Rack } {
  const missing = typeIds.some((typeId) => !project.moduleTypes.some((type) => type.id === typeId));
  const p = missing ? seedInternals(project) : project;
  const mods = typeIds.map((typeId): ModuleInstance => {
    const proto = p.modules.find((module) => module.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  });
  let offset = 0;
  const slots = mods.map((module): RackSlot => {
    const slot: RackSlot = { id: uid('slot'), moduleId: module.id, row: 0, hpOffset: offset };
    offset += module.visual.hpWidth;
    return slot;
  });
  const rack: Rack = {
    id: uid('rack'), name: rackName, description: rackDescription,
    rows: 1, hpPerRow: Math.max(64, offset + 4), slots, kind: 'physical',
  };
  return { p, mods, rack };
}

const cables = (wires: Wire[]): PatchConnection[] => wires.map(([from, output, to, input]) => ({
  id: uid('conn'), from: { moduleId: from.id, portId: output }, to: { moduleId: to.id, portId: input },
}));

function finish(p: ModularProject, mods: ModuleInstance[], rack: Rack, patch: Patch): ModularProject {
  return {
    ...p, racks: [...p.racks, rack], modules: [...p.modules, ...mods],
    patches: [...p.patches, patch], activeRackId: rack.id, activePatchId: patch.id,
  };
}

/**
 * Acid jam: een 303-lijn die zichzelf varieert. De sequencer levert noten en
 * gates op de zestienden van de Clock; twee Euclid-kanalen met een andere
 * lengte dan de reeks bepalen welke noten een accent en welke een slide
 * krijgen, zodat de lijn pas na vele maten herhaalt. Chaos laat de cutoff
 * langzaam drijven.
 */
export function seedAcidJamPatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project,
    ['tp_mmb_clock', 'tp_mmb_seq8', 'tp_mmb_euclid', 'tp_mmb_chaos', 'tp_mmb_acid', 'tp_mmb_peaks', 'tp_mmb_mixer', 'tp_mmb_out'],
    'Acid jam', 'Clock → Seq → ACID; Euclid op Accent en Slide, Chaos op de cutoff, kick op de tel.');
  const [clock, seq, euclid, chaos, acid, kick, mixer, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance];
  const line = [0, 0, 12, 0, 3, 0, 10, 12, 0, 0, 15, 0, 3, 5, 0, 12];
  const steps: Record<string, ControlValue> = Object.fromEntries(line.map((semi, i) => [`s${i + 1}`, semi]));
  const patch: Patch = {
    id: uid('patch'), name: 'Acid jam',
    description: 'Zelfspelende acid-lijn. De Clock klokt de sequencer op zestienden; Euclid 1 (5 op 16) zet accenten, Euclid 2 (2 op 7) slides, en omdat 7 niet in 16 past verschuift het patroon elke maat. Chaos drijft de cutoff. Draai aan Cutoff, Reso, Env mod en Accent op ACID; verander Fill en Steps op EUCLID voor een andere lijn; Swing op CLOCK.',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [clock, 'x4', seq, 'clock'],
      [clock, 'x4', euclid, 'clock'],
      [clock, 'bar', euclid, 'reset'],
      [clock, 'beat', kick, 'gate'],
      [seq, 'cv', acid, 'voct'],
      [seq, 'gate_out', acid, 'gate'],
      [euclid, 'out_1', acid, 'accent'],
      [euclid, 'out_2', acid, 'slide'],
      [chaos, 'x', acid, 'cutoff_cv'],
      [acid, 'out', mixer, 'in1'],
      [kick, 'out', mixer, 'in2'],
      [mixer, 'out_l', out, 'l'],
      [mixer, 'out_r', out, 'r'],
    ]),
    controlState: {
      [clock.id]: { tempo: 126, swing: 0.15, width: 0.5, div: 6, run: 1 },
      // Met een externe klok bepaalt Rate alleen nog de gate-lengte (Gate x 1/Rate):
      // 8,4 Hz is een zestiende op 126 bpm.
      [seq.id]: { ...steps, root: 36, rate: 8.4, gate: 0.55, length: 16, run: 0 },
      [euclid.id]: {
        steps_1: 16, fill_1: 5, rot_1: 0, steps_2: 7, fill_2: 2, rot_2: 1, steps_3: 16, fill_3: 4, rot_3: 0,
        tempo: 126, extclock: 1,
      },
      [chaos.id]: { rate: 0.06, model: 0, shape: 0.3, depth: 0.12, rate_cv_amt: 1, bipolar: 1 },
      [acid.id]: { wave: 0, tune: 0, cutoff: 0.3, res: 0.85, envmod: 0.65, decay: 0.3, accent: 0.8, level: 0.8 },
      [kick.id]: { drum: 0, tone: 0.45, decay: 0.45, snap: 0.5, coarse: 0, level: 0.8 },
      [mixer.id]: { vol1: 0.6, pan1: 0, vol2: 0.6, pan2: 0 },
      [out.id]: { level: 0.8 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/**
 * West Coast: geen filter dat boventonen weghaalt, maar een sinus die
 * gevouwen wordt en een low-pass gate die tikt. Turing levert een lus die
 * langzaam verandert; de Quantizer houdt hem in de toonsoort.
 */
export function seedWestCoastPatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project,
    ['tp_mmb_clock', 'tp_mmb_turing', 'tp_mmb_quant', 'tp_mmb_lfo8', 'tp_mmb_chaos', 'tp_mmb_vco', 'tp_mmb_folder', 'tp_mmb_lpg', 'tp_mmb_reverb', 'tp_mmb_out'],
    'West Coast', 'Turing → Quantizer → VCO (sinus) → FOLDER → LPG → REVERB; LFO-8 en Chaos bewegen de folder.');
  const [clock, turing, quant, lfo8, chaos, vco, folder, lpg, reverb, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance];
  const patch: Patch = {
    id: uid('patch'), name: 'West Coast',
    description: 'Zelfspelend, in de Buchla-traditie: een sinus door de wavefolder (stand 259) en een low-pass gate die door de pulsen van Turing aangetikt wordt. De melodie is een schuifregister-lus van acht stappen die af en toe een noot verandert (Change op TURING: 0 = vast, hoger = sneller anders). LFO-8 opent en sluit de folder in een trage golf, Chaos schuift de symmetrie. Draai aan Fold en Type op FOLDER en aan Decay op LPG.',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [clock, 'x2', turing, 'clock'],
      [turing, 'cv', quant, 'in'],
      [quant, 'out', vco, 'voct'],
      [turing, 'pulse', lpg, 'trig'],
      [lfo8, 'out_4', folder, 'fold_cv'],
      [chaos, 'x', folder, 'sym_cv'],
      [lfo8, 'out_6', lpg, 'cv'],
      [vco, 'out', folder, 'in'],
      [folder, 'out', lpg, 'in'],
      [lpg, 'out', reverb, 'in_l'],
      [reverb, 'out_l', out, 'l'],
      [reverb, 'out_r', out, 'r'],
    ]),
    controlState: {
      [clock.id]: { tempo: 96, swing: 0.25, width: 0.3, div: 6, run: 1 },
      [turing.id]: { change: 0.12, length: 8, range: 2, tempo: 96, extclock: 1 },
      [quant.id]: { scale: 4, root: 2, glide: 0 },
      [lfo8.id]: { rate: 0.8, spread: 1.6, shape: 1, depth: 0.3, bipolar: 0 },
      [chaos.id]: { rate: 0.1, model: 2, shape: 0.5, depth: 0.35, rate_cv_amt: 1, bipolar: 1 },
      [vco.id]: { wave: 0, coarse: -12, fine: 0, fm_amt: 0, level: 1 },
      [folder.id]: { fold: 0.22, symmetry: 0, type: 2, mix: 1, level: 0.8 },
      [lpg.id]: { offset: 0, decay: 0.3, mode: 1, res: 0.15, level: 0.9 },
      [reverb.id]: { size: 0.6, mode: 0, damp: 0.5, predelay: 20, mod: 0.3, mix: 0.3 },
      [out.id]: { level: 1 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/** Orgel met twaalf toetsen door de draaiende luidspreker. */
export function seedOrganPolyPatch(project: ModularProject): ModularProject {
  const N = 12;
  const { p, mods, rack } = build(project, ['tp_mmb_midiin', 'tp_mmb_organ', 'tp_mmb_rotary', 'tp_mmb_out'],
    `Organ ×${N}`, `MidiIn → ORGAN (${N} toets-cellen als PolyGroup) → ROTARY → OUT.`);
  const [midi, organ, rotary, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance];
  rack.polyGroups = [{
    id: uid('poly'), label: 'ORGAN', voiceCount: N,
    members: Array.from({ length: N }, (_, i) => ({ kind: 'cell' as const, moduleId: organ.id, cellGroupId: 'voice', cellIndex: i })),
  }];
  const patch: Patch = {
    id: uid('patch'), name: `Organ ×${N}`,
    description: 'Tonewheel-orgel met twaalf toetsen door de ROTARY. Registratie 888000000 met percussie op de 3e harmonische en chorus C3: de jazz-stand. Het mod-wiel schakelt de luidspreker tussen langzaam en snel; hoor hoorn en trommel elk in hun eigen tempo opwinden. Speel legato: alleen de eerste noot krijgt de percussietik. Trek 16′ en 5⅓′ dicht en 4′ open voor een lichter geluid, of alles open voor vol orgel.',
    voiceCount: N, rackIds: [rack.id],
    connections: cables([
      [midi, 'pitch', organ, 'voct_1'],
      [midi, 'gate', organ, 'gate_1'],
      [midi, 'cv_mod', rotary, 'fast'],
      [organ, 'out', rotary, 'in_l'],
      [rotary, 'out_l', out, 'l'],
      [rotary, 'out_r', out, 'r'],
    ]),
    controlState: {
      [midi.id]: { channel: 0, voiceCount: N, steal: 0 },
      [organ.id]: {
        d16: 8, d513: 8, d8: 8, d4: 0, d223: 0, d2: 0, d135: 0, d113: 0, d1: 0,
        perc: 2, perc_fast: 1, perc_soft: 0, vib: 6, click: 0.4, leak: 0.3, level: 0.8,
      },
      [rotary.id]: { drive: 0.35, level: 1 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/** DRIVE achter een solo-instrument: de overdrive-stand, halverwege. */
export const DRIVE_SOLO_FX = {
  typeId: 'tp_mmb_drive', label: 'DRIVE', mono: true,
  controls: { drive: 0.6, tone: 0.5, level: 0.5, mode: 0, mix: 1 },
} as const;

/** FOLDER achter een sinus: de 259-stand, een eind open. */
export const FOLDER_SOLO_FX = {
  typeId: 'tp_mmb_folder', label: 'FOLDER', mono: true,
  controls: { fold: 0.45, symmetry: 0.15, type: 2, mix: 1, level: 0.8 },
} as const;

/** FREQ SHIFT achter een solo-instrument: +35 Hz, klokachtig. */
export const FREQSHIFT_SOLO_FX = {
  typeId: 'tp_mmb_freqshift', label: 'FREQ SHIFT', mono: true,
  controls: { shift: 0.7, range: 1, fbk: 0.3, mix: 0.6, level: 0.8 },
} as const;

/**
 * Rungler: speelt zichzelf (twee oscillatoren en een schuifregister die
 * elkaar sturen); het klavier stemt oscillator A via V/Oct.
 */
export function seedRunglerPatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project, ['tp_mmb_midiin', 'tp_mmb_rungler', 'tp_mmb_out'],
    'Rungler', 'RUNGLER (Benjolin-stijl) → OUT; het klavier stemt oscillator A.');
  const [midi, rungler, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance];
  const patch: Patch = {
    id: uid('patch'), name: 'Rungler',
    description: 'Zelfspelende chaos naar de Benjolin: twee oscillatoren en een schuifregister die elkaar sturen. Links het filter, rechts de kale pulsgolf. Begin bij Run A en Freq B: kleine verdraaiingen kiezen een ander patroon. Loop aan bevriest het patroon van acht stappen. Het klavier stemt oscillator A. De uitgang Rung is de getrapte CV: prik hem in een andere module.',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [midi, 'pitch', rungler, 'voct'],
      [rungler, 'out', out, 'l'],
      [rungler, 'pwm', out, 'r'],
    ]),
    controlState: {
      [midi.id]: { channel: 0, voiceCount: 1 },
      [rungler.id]: { freq_a: 110, freq_b: 3, run_a: 0.5, run_b: 0.35, cross_a: 0, cross_b: 0, cutoff: 900, res: 0.6, sweep: 0.6, loop: 0, level: 0.6 },
      [out.id]: { level: 0.7 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

// ── Tweede ronde (2026-10-02): SEM, complex-oscillator, wah, ensemble, e-piano ──

/**
 * Buchla-stem: de complex-oscillator onder het klavier. Slope maakt van de
 * gate een envelope die de low-pass gate opent en het timbre mee laat
 * bewegen: helder bij de aanslag, ronder in de staart.
 */
export function seedComplexVoicePatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project, ['tp_mmb_midiin', 'tp_mmb_slope', 'tp_mmb_complex', 'tp_mmb_lpg', 'tp_mmb_out'],
    'Buchla-stem', 'MidiIn → COMPLEX → LPG → OUT; SLOPE opent de gate en beweegt het timbre.');
  const [midi, slope, complex, lpg, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance];
  const patch: Patch = {
    id: uid('patch'), name: 'Buchla-stem',
    description: 'West Coast-stem onder het klavier: complex-oscillator (259-stijl) door een low-pass gate. De gate van het klavier gaat door SLOPE (snel op, traag terug); die envelope opent de LPG en duwt het timbre open, zodat elke noot helder begint en rond uitsterft. De gate pingt de LPG ook rechtstreeks voor de tik. Draai aan Timbre, FM en Ratio op COMPLEX (hele Ratio = harmonisch, ertussen = klok), en aan Fall op SLOPE voor de lengte.',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [midi, 'pitch', complex, 'voct'],
      [midi, 'gate', slope, 'in'],
      [midi, 'gate', lpg, 'trig'],
      [slope, 'out', lpg, 'cv'],
      [slope, 'out', complex, 'timbre_cv'],
      [complex, 'out', lpg, 'in'],
      [lpg, 'out', out, 'l'],
      [lpg, 'out', out, 'r'],
    ]),
    controlState: {
      [midi.id]: { channel: 0, voiceCount: 1 },
      [slope.id]: { rise: 0.005, fall: 0.25, shape: -0.5, cycle: 0 },
      [complex.id]: { pitch: -12, ratio: 2, mod_wave: 0, fm: 0.25, am: 0, tmod: 0.2, timbre: 0.15, symmetry: 0.1, level: 0.9 },
      [lpg.id]: { offset: 0, decay: 0.2, mode: 1, res: 0.2, level: 0.9 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/**
 * SEM sweep: een zaag op een sequencerlijn door het SEM-filter. SLOPE tikt de
 * cutoff per noot open, LFO-8 schuift Mode traag van laagdoorlaat via notch
 * naar hoogdoorlaat en terug.
 */
export function seedSemSweepPatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project, ['tp_mmb_seq8', 'tp_mmb_vco', 'tp_mmb_slope', 'tp_mmb_lfo8', 'tp_mmb_sem', 'tp_mmb_out'],
    'SEM sweep', 'Seq → VCO (zaag) → SEM → OUT; SLOPE op de cutoff, LFO-8 op Mode.');
  const [seq, vco, slope, lfo8, sem, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance, ModuleInstance];
  const line = [0, 12, 7, 0, 10, 0, 3, 7];
  const steps: Record<string, ControlValue> = Object.fromEntries(line.map((semi, i) => [`s${i + 1}`, semi]));
  const patch: Patch = {
    id: uid('patch'), name: 'SEM sweep',
    description: 'Zelfspelend: een doorlopende zaag op een lijn van acht noten door het SEM-filter. Elke noot tikt de cutoff open (SLOPE); LFO-8 schuift Mode in ongeveer een halve minuut van laagdoorlaat via notch naar hoogdoorlaat en terug, zodat je het karakter van het filter hoort veranderen. Draai aan Res, Drive en Cutoff op SEM; de bandpass heeft een eigen uitgang (BP).',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [seq, 'cv', vco, 'voct'],
      [seq, 'gate_out', slope, 'trig'],
      [slope, 'out', sem, 'cutoff_cv'],
      [lfo8, 'out_6', sem, 'mode_cv'],
      [vco, 'out', sem, 'in'],
      [sem, 'out', out, 'l'],
      [sem, 'out', out, 'r'],
    ]),
    controlState: {
      [seq.id]: { ...steps, root: 36, rate: 4, gate: 0.5, length: 8, run: 0 },
      [vco.id]: { wave: 2, coarse: 0, fine: 0, fm_amt: 0, level: 0.5 },
      [slope.id]: { rise: 0.003, fall: 0.22, shape: -0.6, cycle: 0 },
      [lfo8.id]: { rate: 0.35, spread: 1.6, shape: 1, depth: 1, bipolar: 0 },
      [sem.id]: { cutoff: 220, res: 0.6, mode: 0, drive: 0.3, cv_amt: 4, level: 0.45 },
      [out.id]: { level: 0.8 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/** Elektrische piano met twaalf toetsen, velocity bekabeld. */
export function seedEPianoPolyPatch(project: ModularProject): ModularProject {
  const N = 12;
  const { p, mods, rack } = build(project, ['tp_mmb_midiin', 'tp_mmb_epiano', 'tp_mmb_out'],
    `E-piano ×${N}`, `MidiIn → E-PIANO (${N} toets-cellen als PolyGroup) → OUT.`);
  const [midi, piano, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance];
  rack.polyGroups = [{
    id: uid('poly'), label: 'E-PIANO', voiceCount: N,
    members: Array.from({ length: N }, (_, i) => ({ kind: 'cell' as const, moduleId: piano.id, cellGroupId: 'voice', cellIndex: i })),
  }];
  const patch: Patch = {
    id: uid('patch'), name: `E-piano ×${N}`,
    description: 'Elektrische piano met twaalf toetsen: een model van tine en pickup, zonder samples. Speel zacht en hard: de klank verandert met de aanslag, van rond naar blaffend. Timbre is de plek van de tine voor de pickup (0 = dun en glazig, hoger = vol); Bell is de tik in de aanslag; Type Reed geeft de hollere Wurlitzer-kant. Tremolo wiegt tussen links en rechts.',
    voiceCount: N, rackIds: [rack.id],
    connections: cables([
      [midi, 'pitch', piano, 'voct_1'],
      [midi, 'gate', piano, 'gate_1'],
      [midi, 'vel', piano, 'vel_1'],
      [piano, 'out_l', out, 'l'],
      [piano, 'out_r', out, 'r'],
    ]),
    controlState: {
      [midi.id]: { channel: 0, voiceCount: N, steal: 0 },
      [piano.id]: { type: 0, timbre: 0.35, bell: 0.5, decay: 0.5, drive: 0.4, tremolo: 0.3, trem_rate: 4.5, level: 0.8 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/** WAH achter een solo-instrument: touch-wah. */
export const WAH_SOLO_FX = {
  typeId: 'tp_mmb_wah', label: 'WAH', mono: true,
  controls: { pedal: 0.1, mode: 1, type: 0, sens: 0.7, rate: 2, q: 0.6, mix: 1, level: 0.8 },
} as const;

/** ENSEMBLE achter een solo-instrument: de string-machine-stand. */
export const ENSEMBLE_SOLO_FX = {
  typeId: 'tp_mmb_ensemble', label: 'ENSEMBLE',
  controls: { depth: 0.75, slow: 0.6, fast: 6, tone: 0.6, mix: 0.8, level: 0.9 },
} as const;

/** Ritmebox met een paar drukknoppen ernaast: zelfspelend. */
export function seedRhythmBoxPatch(project: ModularProject): ModularProject {
  const { p, mods, rack } = build(project, ['tp_mmb_rhythm', 'tp_mmb_pads', 'tp_mmb_out'],
    'Ritmebox', 'RHYTHM (CR-78-presets) → OUT; PADS 1 start/stopt, PADS 2 zet terug op de één.');
  const [box, pads, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance];
  const patch: Patch = {
    id: uid('patch'), name: 'Ritmebox (CR-78)',
    description: 'De ritmebox met de presets van de CR-78. Draai aan Rhythm voor een ander ritme en zet Variation op A, B of A+B. Pad 1 start en stopt, pad 2 zet terug op de één. Rock 4 en Disco zijn onzeker overgenomen; Samba, Mambo, Cha-cha, Beguine en Rhumba ontbreken nog.',
    voiceCount: 1, rackIds: [rack.id],
    connections: cables([
      [pads, 'trig_1', box, 'start'],
      [pads, 'trig_2', box, 'reset'],
      [box, 'out_l', out, 'l'],
      [box, 'out_r', out, 'r'],
    ]),
    controlState: {
      [box.id]: { rhythm: 14, variation: 2, tempo: 128, run: 1, extclock: 0, accent: 0.6, bass: 0.8, snare: 0.8, metal: 0.7, perc: 0.7, level: 0.8 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}

/** Synthex met acht stemmen, de pitch-wheel op de joystick-X. */
export function seedSynthexPolyPatch(project: ModularProject): ModularProject {
  const N = 8;
  const { p, mods, rack } = build(project, ['tp_mmb_midiin', 'tp_mmb_synthex', 'tp_mmb_out'],
    `Synthex ×${N}`, `MidiIn → SYNTHEX (${N} stem-cellen als PolyGroup) → OUT.`);
  const [midi, synth, out] = mods as [ModuleInstance, ModuleInstance, ModuleInstance];
  rack.polyGroups = [{
    id: uid('poly'), label: 'SYNTHEX', voiceCount: N,
    members: Array.from({ length: N }, (_, i) => ({ kind: 'cell' as const, moduleId: synth.id, cellGroupId: 'voice', cellIndex: i })),
  }];
  const patch: Patch = {
    id: uid('patch'), name: `Synthex ×${N}`,
    description: 'Acht stemmen naar de Elka Synthex: een zaag en een pulsgolf, iets verstemd, door het vierpolige filter met wat envelope, en de chorus aan. De pitch-wheel is de joystick (X), het mod-wiel opent het filter (Y). Probeer Mode BP of HP, Ring op oscillator 2, of Sync met Transpose +7.',
    voiceCount: N, rackIds: [rack.id],
    connections: cables([
      [midi, 'pitch', synth, 'voct_1'],
      [midi, 'gate', synth, 'gate_1'],
      [midi, 'cv_bend', synth, 'bend'],
      [midi, 'cv_mod', synth, 'joy'],
      [synth, 'out_l', out, 'l'],
      [synth, 'out_r', out, 'r'],
    ]),
    controlState: {
      [midi.id]: { channel: 0, voiceCount: N, steal: 0 },
      [synth.id]: { o1_oct: 2, o1_wave: 0, o1_level: 10, o2_oct: 2, o2_transpose: 0, o2_detune: 9, o2_wave: 2, o2_level: 8, sync: 0, ring: 0,
        pw: 0.3, noise: 0, freq: 5, res: 3, env_amt: 5, kbd: 3, mode: 0, fa: 3, fd: 7, fs: 4, fr: 5, aa: 2, ad: 5, as: 8, ar: 6,
        lfo_rate: 5.5, lfo_wave: 0, lfo_osc: 0, lfo_pw: 0.4, lfo_vcf: 0, lfo_vca: 0, glide: 0, tune: 0, chorus: 1, level: 0.8 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return finish(p, mods, rack, patch);
}
