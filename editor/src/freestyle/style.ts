// Stijlen en secties van de freestyle-machine (MOCKUP.md §4.4–4.5). Een
// stijl is een bundel knopstanden en patroonkeuzes op de vaste patch van
// freestylePatch.ts: tempo, en per sectie welke stems aan staan, de
// dichtheid van Grids, de baslijn, het motief en het akkoord dat op het
// scherm staat voor de gitarist. Geen andere patch per stijl: de modules
// blijven dezelfde, alleen de standen (en twee kabelkeuzes) wisselen, zodat
// NEXT atomair kan.
//
// Tempo's zijn genoteerd zoals rappers tellen (trap: 140, gevoeld 70);
// `feel` zegt het erbij op het scherm.

/** De vijf stems die je kunt muten: de "tracks" van de RC-505, plus de bas
 *  apart (besluit Mark 2026-10-27: de referenties leunen op een baslijn). */
export type Stem = 'kick' | 'snare' | 'hats' | 'bass' | 'motif';
export const STEMS: readonly Stem[] = ['kick', 'snare', 'hats', 'bass', 'motif'];
export const STEM_LABEL: Record<Stem, string> = { kick: 'KICK', snare: 'SNARE', hats: 'HATS', bass: 'BASS', motif: 'MOTIF' };

/** Logische namen van de modules in de patch; freestylePatch.ts geeft de id's. */
export type ModuleKey = 'clock' | 'grids' | 'kick' | 'snare' | 'hat' | 'bass' | 'bassSeq' | 'bassGate' | 'motifSeq' | 'piano' | 'reverb';

export interface Change { module: ModuleKey; control: string; value: number | boolean }

/** Waar de bas zijn noten vandaan haalt.
 *  - `kick`: de 808-manier: elke kick van Grids slaat de bas aan en schuift
 *    de baslijn een stap (trap, boom bap, bounce).
 *  - `euclid`: een eigen slagpatroon per sectie uit EUCLID op de
 *    zestiendenklok; de bassequencer stapt per slag en zijn gate bepaalt de
 *    nootlengte (acid hop: een echte baslijn met rusten). */
export type BassSource = 'kick' | 'euclid';

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
  /** Hoe de bas wordt aangeslagen (kabelkeuze bij het bouwen). */
  bass: BassSource;
  /** Swing op de klok (0 = strak). */
  swing: number;
  /** Klankstanden van deze stijl (kick, snare, bas, piano, grondtonen): vast
   *  voor de hele stijl, dus in de patch, niet per sectie. */
  sound: Change[];
  sections: Section[];
  /** De FILL: één maat lang, dan terug naar de sectie. Alleen Grids-standen. */
  fill: Change[];
}

/** Niveau van elke stem als hij aan staat; muten = 0. */
export const STEM_LEVELS: Record<Stem, Array<{ module: ModuleKey; control: string; level: number }>> = {
  kick:  [{ module: 'kick', control: 'level', level: 0.9 }],
  snare: [{ module: 'snare', control: 'level', level: 0.75 }],
  hats:  [{ module: 'hat', control: 'level', level: 0.45 }],
  bass:  [{ module: 'bass', control: 'level', level: 0.7 }],
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

/** Een slagpatroon voor de bas uit EUCLID: drie kanalen [steps, fill, rot],
 *  de uitgang `any` is hun OR. Een kanaal met fill 0 zwijgt. EUCLID begint
 *  elke maat opnieuw (reset op `bar`), dus een kanaal met minder dan 16
 *  stappen loopt binnen de maat rond: [14, 5, 0] raakt 0·3·6·9·12 en op 14
 *  weer zijn stap 0, precies Marks figuur 3-3-3-3-2-2. De formule staat in
 *  firmware/app-modular-brain/src/EuclidModule.h (`(i·fill) mod steps < fill`)
 *  en in `euclidHits()` hieronder, zodat de test het patroon kan narekenen. */
type EuclidChannel = [steps: number, fill: number, rot: number];
const SILENT: EuclidChannel = [16, 0, 0];
const hits = (ch1: EuclidChannel, ch2: EuclidChannel = SILENT, ch3: EuclidChannel = SILENT): Change[] =>
  [ch1, ch2, ch3].flatMap((ch, i) => [
    { module: 'bassGate', control: `steps_${i + 1}`, value: ch[0] } as Change,
    { module: 'bassGate', control: `fill_${i + 1}`, value: ch[1] } as Change,
    { module: 'bassGate', control: `rot_${i + 1}`, value: ch[2] } as Change,
  ]);
/** Welke zestienden (0..15) van een maat de drie EUCLID-kanalen samen raken. */
export function euclidHits(changes: Change[], stepsPerBar = 16): number[] {
  const v = (c: string, d: number): number => { const x = changes.find((ch) => ch.module === 'bassGate' && ch.control === c)?.value; return typeof x === 'number' ? x : d; };
  const out: number[] = [];
  for (let step = 0; step < stepsPerBar; step++) {
    const hit = [1, 2, 3].some((k) => {
      const steps = v(`steps_${k}`, 16), fill = Math.min(v(`fill_${k}`, 0), steps), rot = v(`rot_${k}`, 0);
      if (fill === 0) return false;
      const index = (step + steps - (rot % steps)) % steps;
      return (index * fill) % steps < fill;
    });
    if (hit) out.push(step);
  }
  return out;
}
/** De baslijn bij een slagpatroon: de bassequencer begint elke maat op stap
 *  0 en schuift bij de eerste slag al naar stap 1 (de reset komt een blok
 *  vóór de slag aan), dus stap 1 is een kopie van de eerste noot en de
 *  lijn staat op s2…; `rate` bepaalt met Gate 0,95 de nootlengte
 *  (0,95 × 1000 / rate ms). */
const bassLine = (notes: number[], rate: number): Change[] => [
  ...steps('bassSeq', [notes[0] ?? 0, ...notes]),
  { module: 'bassSeq', control: 'length', value: notes.length + 1 },
  { module: 'bassSeq', control: 'rate', value: rate },
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

/** Grondtonen: de bassequencer rond de sub (midi 24..40), het motief
 *  standaard drie octaven hoger; de lijnen zijn intervallen in mineur en
 *  gelden voor elke toonsoort. */
const roots = (bass: number, motif = bass + 36): Change[] => [
  { module: 'bassSeq', control: 'root', value: bass }, { module: 'motifSeq', control: 'root', value: motif },
];
const sound = (o: {
  bass: number; motif?: number;
  kick: [decay: number, coarse: number, tone: number]; snare: [tone: number, decay: number, snap: number]; hat: number;
  sub: [cutoff: number, res: number, envmod: number, decay?: number, accent?: number]; piano: [timbre: number, bell: number, decay: number];
}): Change[] => [
  ...roots(o.bass, o.motif),
  { module: 'kick', control: 'decay', value: o.kick[0] }, { module: 'kick', control: 'coarse', value: o.kick[1] }, { module: 'kick', control: 'tone', value: o.kick[2] },
  { module: 'snare', control: 'tone', value: o.snare[0] }, { module: 'snare', control: 'decay', value: o.snare[1] }, { module: 'snare', control: 'snap', value: o.snare[2] },
  { module: 'hat', control: 'decay', value: o.hat },
  { module: 'bass', control: 'cutoff', value: o.sub[0] }, { module: 'bass', control: 'res', value: o.sub[1] }, { module: 'bass', control: 'envmod', value: o.sub[2] },
  ...(o.sub[3] !== undefined ? [{ module: 'bass', control: 'decay', value: o.sub[3] } as Change] : []),
  ...(o.sub[4] !== undefined ? [{ module: 'bass', control: 'accent', value: o.sub[4] } as Change] : []),
  { module: 'piano', control: 'timbre', value: o.piano[0] }, { module: 'piano', control: 'bell', value: o.piano[1] }, { module: 'piano', control: 'decay', value: o.piano[2] },
];

const all = (o: Partial<Record<Stem, boolean>> = {}): Record<Stem, boolean> => ({ kick: true, snare: true, hats: true, bass: true, motif: true, ...o });

export const TRAP: Style = {
  id: 'trap',
  name: 'Trap half-time',
  bpm: 140,
  feel: 'half-time · feels like 70',
  key: 'F minor',
  gridsClock: 'x2',
  bass: 'kick',
  swing: 0,
  sound: sound({ bass: 29, kick: [0.85, -4, 0.35], snare: [0.7, 0.3, 0.8], hat: 0.15, sub: [0.12, 0.1, 0.25], piano: [0.4, 0.3, 0.7] }),
  sections: [
    {
      name: 'INTRO', chord: 'Fm',
      stems: all({ snare: false }),
      changes: [...grids(0.25, 0.15, 0.5, 0.4, 0.5), ...steps('bassSeq', BASS_A), ...steps('motifSeq', MOTIF_A)],
    },
    {
      name: 'VERSE', chord: 'Fm · D♭',
      stems: all(),
      changes: [...grids(0.35, 0.3, 0.55, 0.5, 0.7), ...steps('bassSeq', BASS_B), ...steps('motifSeq', MOTIF_B)],
    },
    {
      name: 'HOOK', chord: 'Fm · D♭ · E♭',
      stems: all(),
      changes: [...grids(0.5, 0.45, 0.65, 0.6, 0.85), ...steps('bassSeq', BASS_HOOK), ...steps('motifSeq', MOTIF_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Fm',
      stems: all({ kick: false, snare: false, bass: false }),
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
  bass: 'kick',
  swing: 0.18,
  sound: sound({ bass: 33, kick: [0.45, 0, 0.5], snare: [0.5, 0.35, 0.6], hat: 0.12, sub: [0.22, 0.2, 0.35], piano: [0.6, 0.2, 0.5] }),
  sections: [
    {
      name: 'INTRO', chord: 'Am',
      stems: all({ snare: false }),
      changes: [...grids(0.2, 0.1, 0.45, 0.4, 0.55), ...steps('bassSeq', BASS_BB_A), ...steps('motifSeq', MOTIF_BB_A)],
    },
    {
      name: 'VERSE', chord: 'Am · F',
      stems: all(),
      changes: [...grids(0.3, 0.2, 0.55, 0.55, 0.65), ...steps('bassSeq', BASS_BB_B), ...steps('motifSeq', MOTIF_BB_B)],
    },
    {
      name: 'HOOK', chord: 'Am · C · G',
      stems: all(),
      changes: [...grids(0.45, 0.35, 0.65, 0.65, 0.8), ...steps('bassSeq', BASS_BB_HOOK), ...steps('motifSeq', MOTIF_BB_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Am',
      stems: all({ hats: false, motif: false }),
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
  bass: 'kick',
  swing: 0.08,
  sound: sound({ bass: 31, kick: [0.5, -2, 0.45], snare: [0.8, 0.22, 0.9], hat: 0.1, sub: [0.3, 0.35, 0.5], piano: [0.3, 0.5, 0.45] }),
  sections: [
    {
      name: 'INTRO', chord: 'Gm',
      stems: all({ hats: false }),
      changes: [...grids(0.6, 0.5, 0.6, 0.45, 0.4), ...steps('bassSeq', BASS_BN_A), ...steps('motifSeq', MOTIF_BN_A)],
    },
    {
      name: 'VERSE', chord: 'Gm · B♭',
      stems: all(),
      changes: [...grids(0.65, 0.6, 0.65, 0.55, 0.5), ...steps('bassSeq', BASS_BN_B), ...steps('motifSeq', MOTIF_BN_B)],
    },
    {
      name: 'HOOK', chord: 'Gm · B♭ · D',
      stems: all(),
      changes: [...grids(0.75, 0.7, 0.75, 0.65, 0.65), ...steps('bassSeq', BASS_BN_HOOK), ...steps('motifSeq', MOTIF_BN_HOOK)],
    },
    {
      name: 'BREAK', chord: 'Gm',
      stems: all({ snare: false, motif: false }),
      changes: [...grids(0.5, 0.4, 0.55, 0.5, 0.45), ...steps('bassSeq', BASS_BN_A), ...steps('motifSeq', MOTIF_BN_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'bd', value: 0.95 },
    { module: 'grids', control: 'x', value: 0.9 },
    { module: 'grids', control: 'chaos', value: 0.3 },
  ],
};

// Acid hop (Marks opname van 2026-10-27, in Logic met de ACID-plugin en een
// e-piano met hall): 75 bpm, C mineur. De bas is een 303-figuur in
// zestienden 3-3-3-3-2-2: C E♭ C E♭ A♭ G op 0·3·6·9·12·14, in de hook
// C E♭ C E♭ G (de G lang), als variant C E♭ C C A♭ G, en als breakdown
// alleen C E♭ C met rust. Daarom komt de bas hier niet per kick maar uit
// EUCLID (`bass: 'euclid'`): per sectie een slagpatroon, de sequencer
// stapt per slag, de gate uit de sequencer bepaalt de nootlengte (eerste
// helft bijna gebonden, de twee korte noten los). ACID-standen zijn Marks
// preset "acid bass opname": cutoff 0,20, res 0,94, envmod 0,60, decay
// 0,40, accent 0,60, zaag. De e-piano prikt G G E♭ C op C6/E♭6/G6.
const BASS_AH_A     = [0, 3, 0, 3, 8, 7];        // C E♭ C E♭ A♭ G   op 0·3·6·9·12·14
const BASS_AH_HOOK  = [0, 3, 0, 3, 7];           // C E♭ C E♭ G      op 0·3·6·9·12
const BASS_AH_VAR   = [0, 3, 0, 0, 8, 7];        // C E♭ C C A♭ G    op 0·3·6·9·12·14
const BASS_AH_INTRO = [0, 3, 0];                 // C E♭ C           op 0·3·6, dan rust
const HITS_AH_SIX: EuclidChannel = [14, 5, 0];   // 0·3·6·9·12 en op 14 weer stap 0
const MOTIF_AH_A    = [7, 7, 3, 0, 7, 7, 3, 0];
const MOTIF_AH_B    = [7, 7, 7, 3, 0, 0, 3, 0];
/** Nootlengte: 0,95 × 1000 / rate ms; 2,5 Hz = 380 ms (drie zestienden op
 *  75 is 600 ms, twee 400 ms), 1,7 Hz = 560 ms voor de rustige intro. */
const AH_RATE = 2.5, AH_RATE_LONG = 1.7;

export const ACID_HOP: Style = {
  id: 'acidhop',
  name: 'Acid hop',
  bpm: 75,
  feel: '303 bass · laid back',
  key: 'C minor',
  gridsClock: 'x4',
  bass: 'euclid',
  swing: 0.1,
  sound: sound({ bass: 36, motif: 84, kick: [0.5, -2, 0.45], snare: [0.6, 0.3, 0.7], hat: 0.12, sub: [0.2, 0.94, 0.6, 0.4, 0.6], piano: [0.5, 0.45, 0.4] }),
  sections: [
    {
      name: 'INTRO', chord: 'Cm',
      stems: all({ snare: false }),
      changes: [...grids(0.35, 0.3, 0.45, 0.35, 0.5), ...hits([16, 1, 0], [16, 1, 3], [16, 1, 6]), ...bassLine(BASS_AH_INTRO, AH_RATE_LONG), ...steps('motifSeq', MOTIF_AH_A)],
    },
    {
      name: 'VERSE', chord: 'Cm · A♭',
      stems: all(),
      changes: [...grids(0.4, 0.35, 0.6, 0.55, 0.65), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_A, AH_RATE), ...steps('motifSeq', MOTIF_AH_A)],
    },
    {
      name: 'HOOK', chord: 'Cm · A♭ · G',
      stems: all(),
      changes: [...grids(0.5, 0.45, 0.7, 0.6, 0.8), ...hits([6, 1, 0], [16, 1, 3], [16, 1, 9]), ...bassLine(BASS_AH_HOOK, AH_RATE), ...steps('motifSeq', MOTIF_AH_B)],
    },
    {
      // Breakdown: alleen bas en hats, met de variant van de figuur.
      name: 'BREAK', chord: 'Cm',
      stems: all({ kick: false, snare: false, motif: false }),
      changes: [...grids(0.4, 0.3, 0.5, 0.5, 0.55), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_VAR, AH_RATE), ...steps('motifSeq', MOTIF_AH_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'hh', value: 0.95 },
    { module: 'grids', control: 'y', value: 0.6 },
    { module: 'grids', control: 'chaos', value: 0.35 },
  ],
};

export const STYLES: readonly Style[] = [TRAP, BOOM_BAP, BOUNCE, ACID_HOP];
export function styleById(id: string): Style { return STYLES.find((s) => s.id === id) ?? TRAP; }
