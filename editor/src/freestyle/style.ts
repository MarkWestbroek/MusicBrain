// Stijlen en secties van de freestyle-machine (MOCKUP.md §4.4–4.5). Een
// stijl is een bundel knopstanden en patroonkeuzes op de vaste patch van
// freestylePatch.ts: tempo, en per sectie welke stems aan staan, de
// dichtheid van Grids, de baslijn, het motief en het akkoord dat op het
// scherm staat voor de gitarist. Geen andere patch per stijl: de modules
// blijven dezelfde, alleen de standen wisselen, zodat NEXT atomair kan.
//
// Tempo's zijn genoteerd zoals rappers tellen (trap: 140, gevoeld 70);
// `feel` zegt het erbij op het scherm.

/** De vier stems die je kunt muten: de "vier tracks" van de RC-505. */
export type Stem = 'kick' | 'snare' | 'hats' | 'motif';
export const STEMS: readonly Stem[] = ['kick', 'snare', 'hats', 'motif'];
export const STEM_LABEL: Record<Stem, string> = { kick: 'KICK / 808', snare: 'SNARE', hats: 'HATS', motif: 'MOTIF' };

/** Logische namen van de modules in de patch; freestylePatch.ts geeft de id's. */
export type ModuleKey = 'clock' | 'grids' | 'kick' | 'snare' | 'hat' | 'bass' | 'bassSeq' | 'motifSeq' | 'piano' | 'reverb';

export interface Change { module: ModuleKey; control: string; value: number | boolean }

export interface Section {
  name: string;
  /** Wat de gitarist ziet: toonsoort of akkoordenpaar. */
  chord: string;
  /** Welke stems deze sectie aanzet. Een mute uit de vorige sectie telt niet
   *  meer: de sectie bepaalt het arrangement. */
  stems: Record<Stem, boolean>;
  changes: Change[];
}

export interface Style {
  id: string;
  name: string;
  /** Genoteerd tempo (hoe de rapper telt). */
  bpm: number;
  /** Korte toelichting bij het tempo op het scherm. */
  feel: string;
  key: string;
  sections: Section[];
  /** De FILL: één maat lang, dan terug naar de sectie. Alleen Grids-standen. */
  fill: Change[];
}

/** Niveau van elke stem als hij aan staat; muten = 0. De kick-stem is kick
 *  én 808-sub samen. */
export const STEM_LEVELS: Record<Stem, Array<{ module: ModuleKey; control: string; level: number }>> = {
  kick:  [{ module: 'kick', control: 'level', level: 0.9 }, { module: 'bass', control: 'level', level: 0.7 }],
  snare: [{ module: 'snare', control: 'level', level: 0.75 }],
  hats:  [{ module: 'hat', control: 'level', level: 0.45 }],
  motif: [{ module: 'piano', control: 'level', level: 0.7 }],
};

/** Stand "percussionist plays along": de hats dunner, de djembe vult de gaten. */
export const PERCUSSIONIST_HH_SCALE = 0.55;

const steps = (module: ModuleKey, line: number[]): Change[] => line.map((semi, i) => ({ module, control: `s${i + 1}`, value: semi }));
const grids = (x: number, y: number, bd: number, sd: number, hh: number, chaos = 0): Change[] => [
  { module: 'grids', control: 'x', value: x }, { module: 'grids', control: 'y', value: y },
  { module: 'grids', control: 'bd', value: bd }, { module: 'grids', control: 'sd', value: sd },
  { module: 'grids', control: 'hh', value: hh }, { module: 'grids', control: 'chaos', value: chaos },
];

// F mineur: 0 = F, 3 = A♭, 5 = B♭, 7 = C, 8 = D♭, 10 = E♭; -2 = E♭, -4 = D♭, -5 = C.
// De bassequencer stapt per kick en begint elke maat opnieuw, dus de eerste
// stappen tellen het meest. Het motief stapt per accent van Grids.
const BASS_A    = [0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, -4, -4, -2, -2];
const BASS_B    = [0, 0, 8, 8, 8, 8, -5, -5, 0, 0, 8, 8, 10, 10, -2, -2];
const BASS_HOOK = [0, 0, 8, 8, 10, 10, 7, 7, 0, 0, 8, 8, 10, 10, 12, 12];
const MOTIF_A    = [0, 3, 7, 3, 10, 7, 3, 0];
const MOTIF_B    = [0, 3, 7, 3, 8, 7, 3, 0];
const MOTIF_HOOK = [7, 10, 12, 10, 7, 3, 0, 3];

export const TRAP: Style = {
  id: 'trap',
  name: 'Trap half-time',
  bpm: 140,
  feel: 'half-time · feels like 70',
  key: 'F minor',
  sections: [
    {
      name: 'INTRO', chord: 'Fm',
      stems: { kick: true, snare: false, hats: true, motif: true },
      changes: [...grids(0.25, 0.15, 0.5, 0.4, 0.5), ...steps('bassSeq', BASS_A), ...steps('motifSeq', MOTIF_A)],
    },
    {
      name: 'VERSE', chord: 'Fm · D♭',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.35, 0.3, 0.55, 0.5, 0.7), ...steps('bassSeq', BASS_B), ...steps('motifSeq', MOTIF_B)],
    },
    {
      name: 'HOOK', chord: 'Fm · D♭ · E♭',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.5, 0.45, 0.65, 0.6, 0.85), ...steps('bassSeq', BASS_HOOK), ...steps('motifSeq', MOTIF_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Fm',
      stems: { kick: false, snare: false, hats: true, motif: true },
      changes: [...grids(0.3, 0.3, 0.5, 0.5, 0.6), ...steps('bassSeq', BASS_A), ...steps('motifSeq', MOTIF_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'hh', value: 0.95 },
    { module: 'grids', control: 'y', value: 0.7 },
    { module: 'grids', control: 'chaos', value: 0.4 },
  ],
};

export const STYLES: readonly Style[] = [TRAP];
