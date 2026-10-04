// Een korte, gekozen lijst voorbeelden voor wie nog niets heeft: de lege
// spelerstaat van de Front-tab (telefoon: de werkbalk met Solo ▾ en Poly ▾
// staat daar buiten beeld). Dezelfde seeds als in de menu's van de
// ModularMbApp; dit is alleen een kleine, vaste keuze eruit.

import {
  VIBE_SOLO_FX, SHIMMER_SOLO_FX, STEREO_PHASER_SOLO_FX, seedGenerativeJamPatch, seedKrellPatch, seedSoloVoicePatch,
} from './seedModules';
import { TUBE_SOLO_FX, seedEPianoPolyPatch, seedOrganPolyPatch, seedSynthexPolyPatch } from './seedShowcase';
import { emptyModularProject, type ModularProject } from './types';

export interface DemoSeed { label: string; title: string; run: (p: ModularProject) => ModularProject }

export const DEMO_SEEDS: DemoSeed[] = [
  { label: '🎹 E-piano ×12', title: 'Elektrische piano, twaalf toetsen, tine en pickup; speel zacht en hard.',
    run: seedEPianoPolyPatch },
  { label: '💡 DX7 + Vibe', title: 'Zesoperator-FM met univibe erachter.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_dx7', 'DX7', 'out', 'out', { program: 0, level: 0.8 }, VIBE_SOLO_FX) },
  { label: '🔥 String + Tube', title: 'Snaar door een buizenversterker (Marshall-stack).',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_string', 'String', 'out', 'out', { pluck: 0.6, level: 0.8 }, TUBE_SOLO_FX) },
  { label: '✨ Rings + Shimmer', title: 'Resonator met shimmer-galm.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_rings', 'Rings', 'out_l', 'out_r',
      { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, SHIMMER_SOLO_FX) },
  { label: '🌀 Plaits + Stereo phaser', title: 'Macro-oscillator met stereo phaser.',
    run: (p) => seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux',
      { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, STEREO_PHASER_SOLO_FX) },
  { label: '🪗 Orgel ×12', title: 'Tonewheel-orgel met trekstangen en rotary.', run: seedOrganPolyPatch },
  { label: '🎛 Synthex ×8', title: 'Achtstemmige Elka Synthex.', run: seedSynthexPolyPatch },
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
