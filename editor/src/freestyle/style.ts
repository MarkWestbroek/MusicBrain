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
  /** Welke klokuitgang Grids stapt: x2 = half-time (Grids' 32 zestienden zijn
   *  dan één frase van vier maten, de snare valt op de 3), x4 = gewoon. */
  gridsClock: 'x2' | 'x4';
  /** Swing op de klok (0 = strak). */
  swing: number;
  /** Klankstanden van deze stijl (kick, snare, bas, piano, grondtonen): vast
   *  voor de hele stijl, dus in de patch, niet per sectie. */
  sound: Change[];
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

/** Grondtonen: de bassequencer rond de sub (midi 24..40), het motief drie
 *  octaven hoger; de lijnen zijn intervallen in mineur en gelden voor elke
 *  toonsoort. */
const roots = (bass: number): Change[] => [
  { module: 'bassSeq', control: 'root', value: bass }, { module: 'motifSeq', control: 'root', value: bass + 36 },
];
const sound = (o: { bass: number; kick: [decay: number, coarse: number, tone: number]; snare: [tone: number, decay: number, snap: number]; hat: number; sub: [cutoff: number, res: number, envmod: number]; piano: [timbre: number, bell: number, decay: number] }): Change[] => [
  ...roots(o.bass),
  { module: 'kick', control: 'decay', value: o.kick[0] }, { module: 'kick', control: 'coarse', value: o.kick[1] }, { module: 'kick', control: 'tone', value: o.kick[2] },
  { module: 'snare', control: 'tone', value: o.snare[0] }, { module: 'snare', control: 'decay', value: o.snare[1] }, { module: 'snare', control: 'snap', value: o.snare[2] },
  { module: 'hat', control: 'decay', value: o.hat },
  { module: 'bass', control: 'cutoff', value: o.sub[0] }, { module: 'bass', control: 'res', value: o.sub[1] }, { module: 'bass', control: 'envmod', value: o.sub[2] },
  { module: 'piano', control: 'timbre', value: o.piano[0] }, { module: 'piano', control: 'bell', value: o.piano[1] }, { module: 'piano', control: 'decay', value: o.piano[2] },
];

export const TRAP: Style = {
  id: 'trap',
  name: 'Trap half-time',
  bpm: 140,
  feel: 'half-time · feels like 70',
  key: 'F minor',
  gridsClock: 'x2',
  swing: 0,
  sound: sound({ bass: 29, kick: [0.85, -4, 0.35], snare: [0.7, 0.3, 0.8], hat: 0.15, sub: [0.12, 0.1, 0.25], piano: [0.4, 0.3, 0.7] }),
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

// Boom bap: 88, backbeat op 2 en 4 met swing, korte droge kick, de bas
// hoorbaar als baslijn, een warmer motief.
const BASS_BB_A    = [0, 0, 0, 7, 0, 0, 10, 10, 0, 0, 0, 7, 0, 0, 10, 10];
const BASS_BB_B    = [0, 0, 7, 7, 10, 10, 8, 8, 0, 0, 7, 7, 10, 10, 8, 8];
const BASS_BB_HOOK = [0, 0, 3, 3, 5, 5, 7, 7, 0, 0, 3, 3, 5, 5, 7, 7];
const MOTIF_BB_A    = [0, 3, 5, 7, 3, 0, -2, 0];
const MOTIF_BB_B    = [7, 5, 3, 0, 3, 5, 7, 10];
const MOTIF_BB_HOOK = [12, 10, 7, 10, 12, 7, 5, 3];

export const BOOM_BAP: Style = {
  id: 'boombap',
  name: 'Boom bap',
  bpm: 88,
  feel: 'swing · backbeat on 2 and 4',
  key: 'A minor',
  gridsClock: 'x4',
  swing: 0.18,
  sound: sound({ bass: 33, kick: [0.45, 0, 0.5], snare: [0.5, 0.35, 0.6], hat: 0.12, sub: [0.22, 0.2, 0.35], piano: [0.6, 0.2, 0.5] }),
  sections: [
    {
      name: 'INTRO', chord: 'Am',
      stems: { kick: true, snare: false, hats: true, motif: true },
      changes: [...grids(0.2, 0.1, 0.45, 0.4, 0.55), ...steps('bassSeq', BASS_BB_A), ...steps('motifSeq', MOTIF_BB_A)],
    },
    {
      name: 'VERSE', chord: 'Am · F',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.3, 0.2, 0.55, 0.55, 0.65), ...steps('bassSeq', BASS_BB_B), ...steps('motifSeq', MOTIF_BB_B)],
    },
    {
      name: 'HOOK', chord: 'Am · C · G',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.45, 0.35, 0.65, 0.65, 0.8), ...steps('bassSeq', BASS_BB_HOOK), ...steps('motifSeq', MOTIF_BB_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Am',
      stems: { kick: true, snare: true, hats: false, motif: false },
      changes: [...grids(0.25, 0.15, 0.5, 0.5, 0.5), ...steps('bassSeq', BASS_BB_A), ...steps('motifSeq', MOTIF_BB_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'sd', value: 0.9 },
    { module: 'grids', control: 'y', value: 0.6 },
    { module: 'grids', control: 'chaos', value: 0.35 },
  ],
};

// Bounce (Timbaland): 100, gesyncopeerde stotterende kick, rimshot-snare,
// dunne offbeat-hats, de bas als korte stab.
const BASS_BN_A    = [0, 0, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0, -2, -2, 3, 3];
const BASS_BN_B    = [0, 0, 3, 3, 0, 0, -2, -2, 0, 0, 3, 3, 5, 5, -2, -2];
const BASS_BN_HOOK = [0, 0, 0, 0, 5, 5, 3, 3, 0, 0, 0, 0, 7, 7, 8, 8];
const MOTIF_BN_A    = [0, 0, 3, 0, 0, 7, 0, 0];
const MOTIF_BN_B    = [3, 0, 5, 0, 3, 0, -2, 0];
const MOTIF_BN_HOOK = [7, 7, 5, 3, 7, 7, 10, 8];

export const BOUNCE: Style = {
  id: 'bounce',
  name: 'Bounce',
  bpm: 100,
  feel: 'Timbaland · syncopated kick',
  key: 'G minor',
  gridsClock: 'x4',
  swing: 0.08,
  sound: sound({ bass: 31, kick: [0.5, -2, 0.45], snare: [0.8, 0.22, 0.9], hat: 0.1, sub: [0.3, 0.35, 0.5], piano: [0.3, 0.5, 0.45] }),
  sections: [
    {
      name: 'INTRO', chord: 'Gm',
      stems: { kick: true, snare: true, hats: false, motif: true },
      changes: [...grids(0.6, 0.5, 0.6, 0.45, 0.4), ...steps('bassSeq', BASS_BN_A), ...steps('motifSeq', MOTIF_BN_A)],
    },
    {
      name: 'VERSE', chord: 'Gm · B♭',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.65, 0.6, 0.65, 0.55, 0.5), ...steps('bassSeq', BASS_BN_B), ...steps('motifSeq', MOTIF_BN_B)],
    },
    {
      name: 'HOOK', chord: 'Gm · B♭ · D',
      stems: { kick: true, snare: true, hats: true, motif: true },
      changes: [...grids(0.75, 0.7, 0.75, 0.65, 0.65), ...steps('bassSeq', BASS_BN_HOOK), ...steps('motifSeq', MOTIF_BN_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Gm',
      stems: { kick: true, snare: false, hats: true, motif: false },
      changes: [...grids(0.5, 0.4, 0.55, 0.5, 0.45), ...steps('bassSeq', BASS_BN_A), ...steps('motifSeq', MOTIF_BN_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'bd', value: 0.95 },
    { module: 'grids', control: 'x', value: 0.9 },
    { module: 'grids', control: 'chaos', value: 0.3 },
  ],
};

export const STYLES: readonly Style[] = [TRAP, BOOM_BAP, BOUNCE];
export function styleById(id: string): Style { return STYLES.find((s) => s.id === id) ?? TRAP; }
