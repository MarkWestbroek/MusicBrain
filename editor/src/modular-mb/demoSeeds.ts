// Een gekozen lijst voorbeelden voor wie nog niets heeft: de lege
// spelerstaat van de Front-tab (telefoon: de werkbalk met Solo ▾ en Poly ▾
// staat daar buiten beeld). Dezelfde seeds als in de menu's van de
// ModularMbApp; dit is alleen een vaste keuze eruit, in de volgorde van de
// patchlijst: eerst wat je met twee handen speelt, dan de synths, dan wat
// zichzelf speelt.
//
// Een patch hoort hier als hij zonder uitleg iets moois doet en zijn front
// klopt: de knoppen die een speler wil, en een display waar een keuzeknop
// anders een kaal nummer zou zijn (DX7, ritmebox, Plaits). De meeste fronts
// zijn het automatische; orgel, koper, ritmebox en acid hebben een ontworpen
// front in hun seed.

import {
  VIBE_SOLO_FX, SHIMMER_SOLO_FX, STEREO_PHASER_SOLO_FX, REVERB_SOLO_FX, seedDx7PolyPatch, seedGenerativeJamPatch, seedKrellPatch,
  seedMellotronPatch, seedSoloVoicePatch,
} from './seedModules';
import { seedAxelFLeadPatch } from './seedAxelF';
import { seedCs80BrassPatch } from './seedBrass';
import {
  TUBE_SOLO_FX, seedAcidJamPatch, seedComplexVoicePatch, seedEPianoPolyPatch, seedOrganPolyPatch, seedRhythmBoxPatch,
  seedSynthexPolyPatch, seedWestCoastPatch,
} from './seedShowcase';
import { seedSidPolyPatch } from './seedSid';
import { emptyModularProject, type ModularProject } from './types';

export interface DemoSeed { label: string; title: string; run: (p: ModularProject) => ModularProject }

export const DEMO_SEEDS: DemoSeed[] = [
  // ── Toetsen ───────────────────────────────────────────────────────────
  { label: '🎹 E-piano ×12', title: 'Elektrische piano, twaalf toetsen, tine en pickup; speel zacht en hard.',
    run: seedEPianoPolyPatch },
  { label: '🪗 Orgel ×12', title: 'Tonewheel-orgel met alle negen trekstangen en de rotary.', run: seedOrganPolyPatch },
  { label: '🎼 DX7 ×8', title: 'Achtstemmige zesoperator-FM; kies bank en program, het display toont de naam.',
    run: (p) => seedDx7PolyPatch(p, 8) },
  { label: '💡 DX7 + Vibe', title: 'Zesoperator-FM (één stem) met univibe erachter.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_dx7', 'DX7', 'out', 'out', { program: 0, level: 0.8 }, VIBE_SOLO_FX) },
  { label: '🎞 Mellotron fluit ×8', title: 'De fluit van de Mellotron: bandjes van acht seconden, met wow en flutter.',
    run: (p) => seedMellotronPatch(p, 'fluit') },
  { label: '🎻 Mellotron strijkers ×8', title: 'Strijkers op de Mellotron: akkoorden die na acht seconden vallen.',
    run: (p) => seedMellotronPatch(p, 'strijkers') },
  // ── Synths ────────────────────────────────────────────────────────────
  // Vier stemmen, geen zes: zes ladderfilters met chorus en galm zijn op een
  // telefoon te zwaar. Met Poly ▾ zet je er zo een met zes neer.
  { label: '🎺 CS-80 koper ×4', title: 'Koper à la Vangelis: druk na de aanslag door (aftertouch) en het filter gaat open. Vier stemmen, licht genoeg voor een telefoon.',
    run: (p) => seedCs80BrassPatch(p, 4) },
  { label: '🎛 Synthex ×8', title: 'Achtstemmige Elka Synthex.', run: seedSynthexPolyPatch },
  { label: '🎸 Axel F lead', title: 'De lead van Axel F: twee zagen in unison door een ladderfilter, met echo.',
    run: seedAxelFLeadPatch },
  { label: '👾 SID ×3', title: 'De chip uit de Commodore 64 als driestemmige synth.', run: (p) => seedSidPolyPatch(p) },
  { label: '🔥 String + Tube', title: 'Snaar door een buizenversterker (Marshall-stack).',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_string', 'String', 'out', 'out', { pluck: 0.6, level: 0.8 }, TUBE_SOLO_FX) },
  { label: '✨ Rings + Shimmer', title: 'Resonator met shimmer-galm.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_rings', 'Rings', 'out_l', 'out_r',
      { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, SHIMMER_SOLO_FX) },
  { label: '🌀 Plaits + Stereo phaser', title: 'Macro-oscillator met stereo phaser; Engine kiest uit 24 klankmodellen.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux',
      { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, STEREO_PHASER_SOLO_FX) },
  { label: '🧪 Buchla-stem', title: 'West Coast onder het klavier: complex-oscillator door een low-pass gate.',
    run: seedComplexVoicePatch },
  { label: '🎚 Mixtur + Plate', title: 'Trautonium-stem (Oskar Sala, The Birds): ondertonen in plaats van boventonen en vaste formanten, met plaatgalm. Probeer het lint (〰) onder het klavier.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_mixtur', 'MIXTUR', 'out', 'out',
      { coarse: -12, curve: 0.6, unrest: 0.3, glide: 60, main: 0.8, div1: 2, div2: 3, div3: 4, div4: 5,
        sub1: 0.55, sub2: 0.4, sub3: 0.3, sub4: 0.15, formant: 4, fshift: -2, freso: 0.6, fmix: 0.75,
        noise: 0.04, dyn: 0, attack: 15, release: 250, level: 0.8 }, REVERB_SOLO_FX) },
  // ── Zelfspelend ───────────────────────────────────────────────────────
  { label: '🥁 Ritmebox (CR-78)', title: 'De ritmes van de CR-78; pad 1 start en stopt.', run: seedRhythmBoxPatch },
  { label: '🧬 Acid jam', title: 'Zelfspelende acid-lijn met een kick; draai aan Cutoff en Reso.', run: seedAcidJamPatch },
  { label: '🌊 West Coast', title: 'Zelfspelend: een gevouwen sinus door een low-pass gate.', run: seedWestCoastPatch },
  { label: '🌌 Krell', title: 'Zelfspelend: Stages, Marbles en Clouds.', run: seedKrellPatch },
  { label: '🎲 Generative jam', title: 'Zelfspelend: Marbles kiest noten voor Plaits en Clouds.', run: seedGenerativeJamPatch },
];

/** Het project waarmee een nieuwe gebruiker begint: de standaardset hierboven
 *  als patches, de eerste (E-piano) actief. Wie de editor voor het eerst
 *  opent ziet zo meteen een lijst om uit te kiezen en een front om op te
 *  spelen, in plaats van "Er is nog geen patch". Alles blijft gewoon te
 *  verwijderen; de Solo ▾/Poly ▾-menu's zetten hetzelfde er zo weer bij. */
export function standardProject(): ModularProject {
  let p = emptyModularProject();
  for (const d of DEMO_SEEDS) p = d.run(p);
  const first = p.patches[0];
  return { ...p, name: 'Standaardset', activePatchId: first?.id ?? p.activePatchId, activeRackId: first?.rackIds[0] ?? p.activeRackId };
}
