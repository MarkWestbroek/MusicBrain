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
export type ModuleKey =
  | 'clock' | 'grids' | 'kick' | 'snare' | 'hat' | 'bass' | 'bassSeq' | 'bassGate' | 'motifSeq' | 'piano' | 'reverb'
  /** Toetsen-uitbreiding (alleen bekabeld bij `keys: 'chords'` / `pad`): akkoordgever
   *  voor e-piano stem 1–4, slagpatroon voor akkoord en lijn, Mellotron-pad met
   *  zijn eigen sequencer (één noot per maat). */
  | 'chord' | 'keysGate' | 'pad' | 'padSeq'
  /** De slide-rij voor ACID (alleen bekabeld bij `bass: 'slide'`): een
   *  sequencer op de zestienden waarvan de CV (1 V of 0 V) via LOGIC `gt`
   *  (`slideGate`, de drempel maakt er een gate van en kost één blok) de
   *  Slide-ingang hoog of laag zet; zie `slideRow`. */
  | 'slideSeq' | 'slideGate'
  /** De voorgrondsynth (tp_mmb_synthex, alleen bekabeld bij `keys: 'riff'`)
   *  en het vuil (alleen bij `bassFx` / `keysFx`): DRIVE achter de bas, en
   *  achter de toetsen DRIVE → FET COMP → STEREO PHASER. */
  | 'synth' | 'bassDrive' | 'keysDrive' | 'keysComp' | 'keysPhaser';

export interface Change { module: ModuleKey; control: string; value: number | boolean }

/** Waar de bas zijn noten vandaan haalt.
 *  - `kick`: de 808-manier: elke kick van Grids slaat de bas aan en schuift
 *    de baslijn een stap (trap, boom bap, bounce).
 *  - `euclid`: een eigen slagpatroon per sectie uit EUCLID op de
 *    zestiendenklok; de bassequencer stapt per slag en zijn gate bepaalt de
 *    nootlengte (acid hop: een echte baslijn met rusten). */
/**  - `slide`: als `euclid`, met een vast 3-van-4-raster en een korte gate,
 *    plus een tweede sequencer-rij op de zestienden aan de Slide-ingang van
 *    ACID: zo glijdt een 808 chromatisch tussen de tellen en blijft hij
 *    liggen waar de rij hoog is (dark trap). */
export type BassSource = 'kick' | 'euclid' | 'slide';

/** De rol van een sectie in de liedvorm (besluit Mark 2026-10-27, gangbaar in
 *  hiphop: I V H V H B V H E): intro één keer bij START; NEXT wisselt verse
 *  en hook; BREAK is één frase en keert terug naar de andere sectie dan waar
 *  je vandaan kwam (vers → break → hook); STOP speelt de outro (breakmateriaal
 *  met de bas op de grondtoon) en stopt. Ontbreekt de outro, dan is het de
 *  break. */
export type SectionRole = 'intro' | 'verse' | 'hook' | 'break' | 'outro';

export interface Section {
  name: string;
  role: SectionRole;
  /** Wat de gitarist ziet: toonsoort of akkoordenpaar. */
  chord: string;
  /** Welke stems deze sectie aanzet. Een mute uit de vorige sectie telt niet
   *  meer: de sectie bepaalt het arrangement. */
  stems: Record<Stem, boolean>;
  changes: Change[];
  /** De B-maat (inzicht Mark 2026-10-27: rap denkt in vraag en antwoord,
   *  elke regel één maat, dus A-B-A-B): standen die op elke oneven maat
   *  landen; op de even maat zet de bedieningslaag voor dezelfde knoppen de
   *  A-waarde uit `changes` terug. Elke knop in `b` moet dus ook in `changes`
   *  staan (de test eist dat). */
  b?: Change[];
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
  /** De e-piano: `motif` = één stem, de motiefsequencer stapt per accent van
   *  Grids; `chords` = CHORD (C4 mineur, vast) op stem 1–4 met een eigen
   *  slagpatroon uit een tweede EUCLID (kanaal 1 = akkoord, kanaal 2 stapt de
   *  motiefsequencer als lijn op stem 5), sustainpedaal hoog 90 % van de maat
   *  via de Div-uitgang van de klok; `riff` = geen e-piano maar de SYNTHEX
   *  (één cel) met de motiefsequencer als riff, die stapt op kanaal 1 van
   *  het toetsen-Euclid: korte harde stoten, "in your face" (Mark over dark
   *  trap, 2026-10-27). */
  keys: 'motif' | 'chords' | 'riff';
  /** Mellotron-pad (tp_mmb_tapestrip) op een serverbank; de pagina laadt die
   *  bank (`ensureSamplerBank`) en de patch vraagt hem via `simBanks`. Eén
   *  noot per maat uit de padsequencer, gate = de Div-puls van de klok. */
  pad?: { nn: number; file: string };
  /** Waar CHORD zijn grondtoon vandaan haalt: weggelaten = de ingang los,
   *  dus C4 (acid hop II); `pad` = de CV van de padsequencer, zodat akkoord
   *  en pad dezelfde grondtoon hebben in een andere toonsoort (dark trap). */
  chordRoot?: 'pad';
  /** Het pad speelt niet één noot maar het hele akkoord: de vier uitgangen
   *  van CHORD op strip 1–4 (vraagt `chordRoot: 'pad'`), zodat strijkers als
   *  strijkers lezen (Mark over dark trap, 2026-10-27). */
  padVoices?: 'chord';
  /** De bas door DRIVE (ACID → DRIVE → mixer): de boventonen maken een 808
   *  op F♯1 hoorbaar op een telefoon, het klassieke 808-vervormingstrucje. */
  bassFx?: 'drive';
  /** De toetsen vuil: mono door DRIVE → FET COMP (snel, pompend) → STEREO
   *  PHASER (langzaam), die er weer stereo van maakt, dan de galm in. */
  keysFx?: 'dirty';
  /** Een ander stem-niveau voor een module dan `STEM_LEVELS` (de stand als
   *  de stem aan staat), bijvoorbeeld de strijkers luider in dark trap. */
  levels?: Partial<Record<ModuleKey, number>>;
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
  // MOTIF is "de toetsen": e-piano, Mellotron-pad en synth (waar bekabeld).
  motif: [{ module: 'piano', control: 'level', level: 0.7 }, { module: 'pad', control: 'level', level: 0.6 }, { module: 'synth', control: 'level', level: 0.8 }],
};

/** De stem-niveaus voor een stijl: `STEM_LEVELS`, met de afwijkingen uit
 *  `Style.levels`. */
export function stemLevels(style?: Style): typeof STEM_LEVELS {
  if (!style?.levels) return STEM_LEVELS;
  return Object.fromEntries(STEMS.map((s) => [s, STEM_LEVELS[s].map((l) => ({ ...l, level: style.levels?.[l.module] ?? l.level }))])) as typeof STEM_LEVELS;
}

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
const hitsOn = (module: 'bassGate' | 'keysGate', ch1: EuclidChannel, ch2: EuclidChannel = SILENT, ch3: EuclidChannel = SILENT): Change[] =>
  [ch1, ch2, ch3].flatMap((ch, i) => [
    { module, control: `steps_${i + 1}`, value: ch[0] } as Change,
    { module, control: `fill_${i + 1}`, value: ch[1] } as Change,
    { module, control: `rot_${i + 1}`, value: ch[2] } as Change,
  ]);
const hits = (ch1: EuclidChannel, ch2?: EuclidChannel, ch3?: EuclidChannel): Change[] => hitsOn('bassGate', ch1, ch2, ch3);
/** Welke zestienden (0..15) van een maat de EUCLID-kanalen `channels` van
 *  module `module` samen raken. */
export function euclidHits(changes: Change[], module: 'bassGate' | 'keysGate' = 'bassGate', channels: number[] = [1, 2, 3], stepsPerBar = 16): number[] {
  const v = (c: string, d: number): number => { const x = changes.find((ch) => ch.module === module && ch.control === c)?.value; return typeof x === 'number' ? x : d; };
  const out: number[] = [];
  for (let step = 0; step < stepsPerBar; step++) {
    const hit = channels.some((k) => {
      const steps = v(`steps_${k}`, 16), fill = Math.min(v(`fill_${k}`, 0), steps), rot = v(`rot_${k}`, 0);
      if (fill === 0) return false;
      const index = (step + steps - (rot % steps)) % steps;
      return (index * fill) % steps < fill;
    });
    if (hit) out.push(step);
  }
  return out;
}
/** Een lijn op een sequencer die per EUCLID-slag stapt en elke maat op stap
 *  0 begint: de reset komt een blok vóór de slag aan, dus bij de eerste slag
 *  staat hij al op stap 1. Stap 1 is daarom een kopie van de eerste noot en
 *  de lijn staat op s2…; `rate` bepaalt met Gate 0,95 de nootlengte
 *  (0,95 × 1000 / rate ms). */
const seqLine = (module: 'bassSeq' | 'motifSeq', notes: number[], rate: number): Change[] => [
  ...steps(module, [notes[0] ?? 0, ...notes]),
  { module, control: 'length', value: notes.length + 1 },
  { module, control: 'rate', value: rate },
];
const bassLine = (notes: number[], rate: number): Change[] => seqLine('bassSeq', notes, rate);
/** Het pad: één noot per maat (de padsequencer stapt op `bar`, zonder reset),
 *  dus gewoon de noten op s1… met de lengte van de reeks. */
const padLine = (notes: number[]): Change[] => [...steps('padSeq', notes), { module: 'padSeq', control: 'length', value: Math.max(2, notes.length) }];
/** Akkoordtype van CHORD (ChordModule.h): 1 = mineur (C E♭ G C'), 9 = kwint (C G C' G'). */
const chordType = (chord: number): Change[] => [{ module: 'chord', control: 'chord', value: chord }];

/** De slide-rij van ACID op de zestienden (bass 'slide'): 1 V (hoog, de
 *  boog) op elke zestiende behalve `releases`, daar 0 V (los).
 *  Betekenis (mmb_dsp/acid.h): is Slide hoog als de gate van een noot
 *  loslaat, dan blijft de noot klinken tot de volgende slag, en die slag
 *  glijdt (tijdconstante 60 ms) naar zijn toon zonder nieuwe aanslag; gaat
 *  Slide laag, dan stopt een losgelaten noot en slaat de volgende slag
 *  opnieuw aan. Een nul hoort dus altijd op een stille zestiende, vlak vóór
 *  een aanslag.
 *  Timing (gemeten 2026-10-27): de rij moet één blok ná de bas-gate bij
 *  ACID aankomen, want de kernel leest Slide vóór Gate; dan is Slide bij een
 *  nieuwe aanslag nog laag en begint de noot op toon (anders glijdt hij vanaf
 *  de oude toon). Daarom stapt de rij op EUCLID-kanaal 2 (elke zestiende,
 *  twee kabels) en gaat hij via LOGIC naar ACID (vier kabels tegenover drie
 *  voor de gate). De reset op `bar` (één kabel) komt een blok vóór de eerste
 *  klokpuls, dus bij zestiende 0 staat de rij al op stap 1: zestiende k
 *  staat op s(k+2), zestiende 15 op s1. */
const slideRow = (releases: number[]): Change[] => {
  const row = Array.from({ length: 16 }, (_, i) => (releases.includes(i) ? 0 : 12));
  return [...steps('slideSeq', [row[15]!, ...row.slice(0, 15)]), { module: 'slideSeq', control: 'length', value: 16 }];
};
/** Een baslijn op het 3-van-4-raster van `HITS_SLIDE_GRID` (twaalf slagen per
 *  maat; stap 1 is weer de kopie, zie `seqLine`), zonder rate: de gate moet
 *  korter blijven dan een zestiende en volgt het tempo (`slideBassRate`). */
const slideBass = (notes: number[]): Change[] => [
  ...steps('bassSeq', [notes[0] ?? 0, ...notes]),
  { module: 'bassSeq', control: 'length', value: notes.length + 1 },
];
/** Het slagraster van bass 'slide' op EUCLID-kanaal 1: zestiende 0·1·2,
 *  4·5·6, 8·9·10 en 12·13·14 ([4, 3, 2]: drie van vier, gedraaid zodat de
 *  stille op 3 valt); op 3, 7, 11 en 15 ademt de bas. Drie slagen achter
 *  elkaar met verschillende noten zijn een glijder, met dezelfde noot een
 *  liggende toon (de slag valt dan in de boog en doet niets). Kanaal 2 geeft
 *  elke zestiende: de klok van de slide-rij. */
export const HITS_SLIDE_GRID: EuclidChannel = [4, 3, 2];
export const SLIDE_CLOCK: EuclidChannel = [1, 1, 0];
/** Rate van de bassequencer bij bass 'slide': de gate (0,95 × 1000 / rate
 *  ms) moet korter zijn dan een zestiende (15000 / bpm ms), hier 85 % ervan;
 *  op 140 is dat 91 ms, rate 10,4. Begrensd op het bereik van Seq16. */
export function slideBassRate(bpm: number): number {
  const sixteenth = 15000 / bpm;
  return Math.min(16, Math.max(0.5, Math.round((950 / (0.85 * sixteenth)) * 100) / 100));
}
/** Wat er bij een nieuw tempo mee moet: de klok, en bij bass 'slide' de
 *  gate-lengte van de bassequencer. */
export function tempoChanges(style: Style, bpm: number): Change[] {
  return [
    { module: 'clock', control: 'tempo', value: bpm },
    ...(style.bass === 'slide' ? [{ module: 'bassSeq', control: 'rate', value: slideBassRate(bpm) } as Change] : []),
  ];
}

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
  sub: [cutoff: number, res: number, envmod: number, decay?: number, accent?: number];
  piano: [timbre: number, bell: number, decay: number, drive?: number, tremolo?: number, tremRate?: number, damper?: number];
  /** Galm van het motief (tp_mmb_reverb): size, damp, predelay (ms), mod, mix. */
  reverb?: [size: number, damp: number, predelay: number, mod: number, mix: number];
}): Change[] => [
  ...roots(o.bass, o.motif),
  { module: 'kick', control: 'decay', value: o.kick[0] }, { module: 'kick', control: 'coarse', value: o.kick[1] }, { module: 'kick', control: 'tone', value: o.kick[2] },
  { module: 'snare', control: 'tone', value: o.snare[0] }, { module: 'snare', control: 'decay', value: o.snare[1] }, { module: 'snare', control: 'snap', value: o.snare[2] },
  { module: 'hat', control: 'decay', value: o.hat },
  { module: 'bass', control: 'cutoff', value: o.sub[0] }, { module: 'bass', control: 'res', value: o.sub[1] }, { module: 'bass', control: 'envmod', value: o.sub[2] },
  ...(o.sub[3] !== undefined ? [{ module: 'bass', control: 'decay', value: o.sub[3] } as Change] : []),
  ...(o.sub[4] !== undefined ? [{ module: 'bass', control: 'accent', value: o.sub[4] } as Change] : []),
  { module: 'piano', control: 'timbre', value: o.piano[0] }, { module: 'piano', control: 'bell', value: o.piano[1] }, { module: 'piano', control: 'decay', value: o.piano[2] },
  ...(o.piano[3] !== undefined ? [{ module: 'piano', control: 'drive', value: o.piano[3] } as Change] : []),
  ...(o.piano[4] !== undefined ? [{ module: 'piano', control: 'tremolo', value: o.piano[4] } as Change] : []),
  ...(o.piano[5] !== undefined ? [{ module: 'piano', control: 'trem_rate', value: o.piano[5] } as Change] : []),
  ...(o.piano[6] !== undefined ? [{ module: 'piano', control: 'damper', value: o.piano[6] } as Change] : []),
  ...(o.reverb ? (['size', 'damp', 'predelay', 'mod', 'mix'] as const).map((c, i) => ({ module: 'reverb', control: c, value: o.reverb![i] } as Change)) : []),
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
  keys: 'motif',
  swing: 0,
  sound: sound({ bass: 29, kick: [0.85, -4, 0.35], snare: [0.7, 0.3, 0.8], hat: 0.15, sub: [0.12, 0.1, 0.25], piano: [0.4, 0.3, 0.7] }),
  sections: [
    {
      name: 'INTRO', role: 'intro', chord: 'Fm',
      stems: all({ snare: false }),
      changes: [...grids(0.25, 0.15, 0.5, 0.4, 0.5), ...steps('bassSeq', BASS_A), ...steps('motifSeq', MOTIF_A)],
    },
    {
      name: 'VERSE', role: 'verse', chord: 'Fm · D♭',
      stems: all(),
      changes: [...grids(0.35, 0.3, 0.55, 0.5, 0.7), ...steps('bassSeq', BASS_B), ...steps('motifSeq', MOTIF_B)],
    },
    {
      name: 'HOOK', role: 'hook', chord: 'Fm · D♭ · E♭',
      stems: all(),
      changes: [...grids(0.5, 0.45, 0.65, 0.6, 0.85), ...steps('bassSeq', BASS_HOOK), ...steps('motifSeq', MOTIF_HOOK)],
    },
    {
      name: 'BREAK', role: 'break', chord: 'Fm',
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
  keys: 'motif',
  swing: 0.18,
  sound: sound({ bass: 33, kick: [0.45, 0, 0.5], snare: [0.5, 0.35, 0.6], hat: 0.12, sub: [0.22, 0.2, 0.35], piano: [0.6, 0.2, 0.5] }),
  sections: [
    {
      name: 'INTRO', role: 'intro', chord: 'Am',
      stems: all({ snare: false }),
      changes: [...grids(0.2, 0.1, 0.45, 0.4, 0.55), ...steps('bassSeq', BASS_BB_A), ...steps('motifSeq', MOTIF_BB_A)],
    },
    {
      name: 'VERSE', role: 'verse', chord: 'Am · F',
      stems: all(),
      changes: [...grids(0.3, 0.2, 0.55, 0.55, 0.65), ...steps('bassSeq', BASS_BB_B), ...steps('motifSeq', MOTIF_BB_B)],
    },
    {
      name: 'HOOK', role: 'hook', chord: 'Am · C · G',
      stems: all(),
      changes: [...grids(0.45, 0.35, 0.65, 0.65, 0.8), ...steps('bassSeq', BASS_BB_HOOK), ...steps('motifSeq', MOTIF_BB_HOOK)],
    },
    {
      name: 'BREAK', role: 'break', chord: 'Am',
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
  keys: 'motif',
  swing: 0.08,
  sound: sound({ bass: 31, kick: [0.5, -2, 0.45], snare: [0.8, 0.22, 0.9], hat: 0.1, sub: [0.3, 0.35, 0.5], piano: [0.3, 0.5, 0.45] }),
  sections: [
    {
      name: 'INTRO', role: 'intro', chord: 'Gm',
      stems: all({ hats: false }),
      changes: [...grids(0.6, 0.5, 0.6, 0.45, 0.4), ...steps('bassSeq', BASS_BN_A), ...steps('motifSeq', MOTIF_BN_A)],
    },
    {
      name: 'VERSE', role: 'verse', chord: 'Gm · B♭',
      stems: all(),
      changes: [...grids(0.65, 0.6, 0.65, 0.55, 0.5), ...steps('bassSeq', BASS_BN_B), ...steps('motifSeq', MOTIF_BN_B)],
    },
    {
      name: 'HOOK', role: 'hook', chord: 'Gm · B♭ · D',
      stems: all(),
      changes: [...grids(0.75, 0.7, 0.75, 0.65, 0.65), ...steps('bassSeq', BASS_BN_HOOK), ...steps('motifSeq', MOTIF_BN_HOOK)],
    },
    {
      name: 'BREAK', role: 'break', chord: 'Gm',
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
// alleen C E♭ C met rust. Sinds de A/B-maten (Marks inzicht, zie
// Section.b): de A-maat loopt weg (A♭ G), de B-maat landt op de G of op
// C E♭ C met rust, zoals in zijn opname. Daarom komt de bas hier niet per kick maar uit
// EUCLID (`bass: 'euclid'`): per sectie een slagpatroon, de sequencer
// stapt per slag, de gate uit de sequencer bepaalt de nootlengte (eerste
// helft bijna gebonden, de twee korte noten los). ACID-standen zijn Marks
// preset "acid bass opname": cutoff 0,20, res 0,94, envmod 0,60, decay
// 0,40, accent 0,60, zaag. De e-piano prikt G G E♭ C; eerst op C6, maar dat
// stak (Mark, 2026-10-27), nu op C5 zoals zijn eigen EP-stoten in de MIDI,
// met de klank van zijn preset "ep opname" (tine, timbre 0,35, bell 0,29,
// decay 0,50, drive 0,40, tremolo 0,30 op 4,5 Hz, damper 0,60) en een galm
// die zijn HALL-preset "ep-chamber-opname" benadert (Room, size 0,58, decay
// 2,5 s, 66 ms predelay, hidamp 0,875, mix 0,30) op de bestaande
// REVERB-module: size 0,5, damp 0,85, predelay 66, mod 0,4, mix 0,3.
const BASS_AH_A     = [0, 3, 0, 3, 8, 7];        // C E♭ C E♭ A♭ G   op 0·3·6·9·12·14
const BASS_AH_HOOK  = [0, 3, 0, 3, 7];           // C E♭ C E♭ G      op 0·3·6·9·12
const BASS_AH_VAR   = [0, 3, 0, 0, 8, 7];        // C E♭ C C A♭ G    op 0·3·6·9·12·14
const BASS_AH_INTRO = [0, 3, 0];                 // C E♭ C           op 0·3·6, dan rust
const HITS_AH_SIX: EuclidChannel = [14, 5, 0];   // 0·3·6·9·12 en op 14 weer stap 0
const HITS_AH_FIVE: [EuclidChannel, EuclidChannel, EuclidChannel] = [[6, 1, 0], [16, 1, 3], [16, 1, 9]]; // 0·3·6·9·12
const HITS_AH_THREE: [EuclidChannel, EuclidChannel, EuclidChannel] = [[16, 1, 0], [16, 1, 3], [16, 1, 6]]; // 0·3·6, dan rust
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
  keys: 'motif',
  swing: 0.1,
  sound: sound({
    bass: 36, motif: 72, kick: [0.5, -2, 0.45], snare: [0.6, 0.3, 0.7], hat: 0.12, sub: [0.2, 0.94, 0.6, 0.4, 0.6],
    piano: [0.35, 0.29, 0.5, 0.4, 0.3, 4.5, 0.6], reverb: [0.5, 0.85, 66, 0.4, 0.3],
  }),
  sections: [
    {
      name: 'INTRO', role: 'intro', chord: 'Cm',
      stems: all({ snare: false }),
      changes: [...grids(0.35, 0.3, 0.45, 0.35, 0.5), ...hits(...HITS_AH_THREE), ...bassLine(BASS_AH_INTRO, AH_RATE_LONG), ...steps('motifSeq', MOTIF_AH_A)],
    },
    {
      name: 'VERSE', role: 'verse', chord: 'Cm · A♭',
      stems: all(),
      changes: [...grids(0.4, 0.35, 0.6, 0.55, 0.65), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_A, AH_RATE), ...steps('motifSeq', MOTIF_AH_A)],
      b: [...hits(...HITS_AH_FIVE), ...bassLine(BASS_AH_HOOK, AH_RATE_LONG)],
    },
    {
      name: 'HOOK', role: 'hook', chord: 'Cm · A♭ · G',
      stems: all(),
      changes: [...grids(0.5, 0.45, 0.7, 0.6, 0.8), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_VAR, AH_RATE), ...steps('motifSeq', MOTIF_AH_B)],
      b: [...hits(...HITS_AH_FIVE), ...bassLine(BASS_AH_HOOK, AH_RATE_LONG)],
    },
    {
      // Breakdown: alleen bas en hats; A de variant van de figuur, B alleen C E♭ C en rust.
      name: 'BREAK', role: 'break', chord: 'Cm',
      stems: all({ kick: false, snare: false, motif: false }),
      changes: [...grids(0.4, 0.3, 0.5, 0.5, 0.55), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_VAR, AH_RATE), ...steps('motifSeq', MOTIF_AH_A)],
      b: [...hits(...HITS_AH_THREE), ...bassLine(BASS_AH_INTRO, AH_RATE_LONG)],
    },
    {
      // Uittro (STOP): bas op de grondtoon, lang, alleen met de hats; de
      // einde-fill komt in de laatste maat, dan stil.
      name: 'OUTRO', role: 'outro', chord: 'Cm',
      stems: all({ kick: false, snare: false, motif: false }),
      changes: [...grids(0.3, 0.25, 0.45, 0.4, 0.45), ...hits([16, 1, 0]), ...bassLine([0], 0.5), ...steps('motifSeq', MOTIF_AH_A)],
    },
  ],
  fill: [
    { module: 'grids', control: 'hh', value: 0.95 },
    { module: 'grids', control: 'y', value: 0.6 },
    { module: 'grids', control: 'chaos', value: 0.35 },
  ],
};

// Acid hop II (Marks referentie "MMB Freestyle 01 (78)", spinoffs/freestyle-
// machine/referenties/mmb-freestyle-01/): 78 bpm, C mineur, naast V1 om te
// vergelijken. Nieuw: een tweede basdeel dat naar G1/A♭1 zakt, een
// slotfiguur A♭ G E♭ C, de e-piano meerstemmig zoals Mark hem speelde
// (lange Cm-akkoorden met sustain, korte stoten, in de hook een neergebroken
// akkoord A♭5 G5 E♭5 D5 C5 G4 E♭4 D4 dat blijft klinken) en een Mellotron-
// fluitpad (tape strip op gu-flute): C4 lang, in de break de lage
// slotmelodie E♭3 A♭3 G3 C3. In zijn opname komt de bas in maat 3; hier is
// INTRO drums + pad + akkoord en brengt NEXT de bas.
// Vraag en antwoord (A- en B-maat, uit de MIDI): de verse begint twee keer
// hetzelfde maar landt in B op de grondtoon en rust; de hook idem rond G1.
const BASS_AH2_VERSE_B = [0, 3, 0, 3, 0];         // C2 E♭2 C2 E♭2 C2 op 0·3·6·9·12, dan rust
const BASS_AH2_HOOK_A  = [-5, 0, -4, -5, -5, -4]; // G1 C2 A♭1 G1 G1 A♭1 op 0·3·6·9·12·14
const BASS_AH2_HOOK_B  = [-5, 0, -5, -4, -5];     // G1 C2 G1 A♭1 G1  op 0·3·6·9·12
const BASS_AH2_END   = [8, 7, 3, 0];              // A♭2 G2 E♭2 C2    op 0·6·12·14
const LINE_AH2_STABS = [7, 0];                    // G5 C5 op 6 en 14 (t.o.v. C5)
const LINE_AH2_FALL  = [8, 7, 3, 2, 0, -5, -9, -10]; // A♭5 G5 E♭5 D5 C5 G4 E♭4 D4, om de twee zestienden, met sustain
const LINE_AH2_GRACE = [-4];                      // A♭4 op 14, de voorslag naar het akkoord
const LINE_AH2_LAND  = [-12];                     // C4 lang op de 1: de landing na de val
const PAD_AH2_LOW    = [-9, -4, -5, -12];         // E♭3 A♭3 G3 C3, één per maat
const PAD_AH2_C      = [0, 0];                    // C4 (lengte minstens 2)
const CHORD_MINOR = 1, CHORD_FIFTH = 9;

export const ACID_HOP_2: Style = {
  id: 'acidhop2',
  name: 'Acid hop II',
  bpm: 78,
  feel: '303 bass · mellotron · as Mark played it',
  key: 'C minor',
  gridsClock: 'x4',
  bass: 'euclid',
  keys: 'chords',
  pad: { nn: 7, file: 'gu-flute.mmbs' },
  swing: 0.1,
  sound: [
    ...sound({
      bass: 36, motif: 72, kick: [0.5, -2, 0.45], snare: [0.6, 0.3, 0.7], hat: 0.12, sub: [0.2, 0.94, 0.6, 0.4, 0.6],
      piano: [0.35, 0.29, 0.5, 0.4, 0.3, 4.5, 0.6], reverb: [0.5, 0.85, 66, 0.4, 0.3],
    }),
    // Div = één puls per maat (16 zestienden), 90 % hoog: de gate van het pad
    // en het sustainpedaal van de e-piano; de dempers vallen vlak vóór de 1.
    { module: 'clock', control: 'div', value: 16 }, { module: 'clock', control: 'width', value: 0.9 },
    { module: 'chord', control: 'inv', value: 0 }, { module: 'chord', control: 'spread', value: 0 },
    // Mellotron-mechanica als de Mellotron-seed: bandje van 8 s, veer terug, wat wow.
    { module: 'pad', control: 'bank', value: 7 }, { module: 'pad', control: 'length', value: 8 }, { module: 'pad', control: 'return', value: 1 },
    { module: 'pad', control: 'contact', value: 0.5 }, { module: 'pad', control: 'motor', value: 0.4 }, { module: 'pad', control: 'wow', value: 0.3 },
    { module: 'pad', control: 'flutter', value: 0.3 }, { module: 'pad', control: 'wear', value: 0.3 },
    { module: 'padSeq', control: 'root', value: 60 },
  ],
  sections: [
    {
      // E-piano in A/B zoals Mark speelde (EP-MIDI per maat): A het volle
      // Cm-akkoord, B de kwint C+G (maat 2 en 4 van zijn opname).
      name: 'INTRO', role: 'intro', chord: 'Cm',
      stems: all({ bass: false }),
      changes: [...grids(0.35, 0.3, 0.45, 0.4, 0.5), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_A, AH_RATE),
        ...chordType(CHORD_MINOR), ...hitsOn('keysGate', [16, 1, 0]), ...seqLine('motifSeq', LINE_AH2_STABS, AH_RATE), ...padLine(PAD_AH2_C)],
      b: chordType(CHORD_FIFTH),
    },
    {
      name: 'VERSE', role: 'verse', chord: 'Cm',
      stems: all(),
      changes: [...grids(0.4, 0.35, 0.6, 0.55, 0.65), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH_A, AH_RATE),
        ...chordType(CHORD_MINOR), ...hitsOn('keysGate', [16, 1, 0], [8, 1, 6]), ...seqLine('motifSeq', LINE_AH2_STABS, AH_RATE), ...padLine(PAD_AH2_C)],
      b: [...hits(...HITS_AH_FIVE), ...bassLine(BASS_AH2_VERSE_B, AH_RATE), ...chordType(CHORD_FIFTH)],
    },
    {
      // Hook: A het neergebroken akkoord dat blijft klinken, B de landing op
      // een lange C4 (zijn maat 13: D4 C4 en dan niets tot de volgende val).
      name: 'HOOK', role: 'hook', chord: 'Cm · A♭ · G',
      stems: all(),
      changes: [...grids(0.5, 0.45, 0.7, 0.6, 0.8), ...hits(HITS_AH_SIX), ...bassLine(BASS_AH2_HOOK_A, AH_RATE),
        ...chordType(CHORD_MINOR), ...hitsOn('keysGate', SILENT, [2, 1, 0]), ...seqLine('motifSeq', LINE_AH2_FALL, 4), ...padLine(PAD_AH2_C)],
      b: [...hits(...HITS_AH_FIVE), ...bassLine(BASS_AH2_HOOK_B, AH_RATE), ...hitsOn('keysGate', SILENT, [16, 1, 0]), ...seqLine('motifSeq', LINE_AH2_LAND, 1)],
    },
    {
      // Slot: A C4+G4 een hele maat, B het Cm-akkoord (zijn maat 14–16); de bas
      // speelt A♭ G E♭ C, het pad de lage melodie.
      name: 'BREAK', role: 'break', chord: 'Cm',
      stems: all({ kick: false, snare: false }),
      changes: [...grids(0.4, 0.3, 0.5, 0.5, 0.55), ...hits([6, 1, 0], [16, 1, 14]), ...bassLine(BASS_AH2_END, AH_RATE),
        ...chordType(CHORD_FIFTH), ...hitsOn('keysGate', [16, 1, 0], [16, 1, 14]), ...seqLine('motifSeq', LINE_AH2_GRACE, AH_RATE), ...padLine(PAD_AH2_LOW)],
      b: chordType(CHORD_MINOR),
    },
    {
      // Uittro: bas lang op C, het Cm-akkoord op de 1, het pad op C3, hats.
      name: 'OUTRO', role: 'outro', chord: 'Cm',
      stems: all({ kick: false, snare: false }),
      changes: [...grids(0.3, 0.25, 0.45, 0.4, 0.45), ...hits([16, 1, 0]), ...bassLine([0], 0.5),
        ...chordType(CHORD_MINOR), ...hitsOn('keysGate', [16, 1, 0]), ...seqLine('motifSeq', LINE_AH2_LAND, 1), ...padLine([-12, -12])],
    },
  ],
  fill: [
    { module: 'grids', control: 'hh', value: 0.95 },
    { module: 'grids', control: 'y', value: 0.6 },
    { module: 'grids', control: 'chaos', value: 0.35 },
  ],
};

// Dark trap (referentie 3 in MOCKUP §1: PRO8L3M, "Molly" instr., Steez83;
// analyse van de sessie "song for FREESTYLE", 2026-10-27): precies 140,
// gevoeld 70, F♯ mineur, kaal. Het "uit de pas"-gevoel zit in de 808: de
// toon begint op de tel en glijdt in twee, drie zestienden chromatisch
// omlaag terwijl de drums strak staan; dan een lange octaaf of een landing
// op C♯. Techniek overgenomen, niet de noten. Vorm: intro zonder sub, vers
// met de glijders, hook met de glijder twee keer per maat en dan C♯ liggend,
// break = sub weg, outro = de melodie voorop en de bas liggend op F♯.
// A/B: maat A eindigt met een glijder, maat B met de C♯-landing (vers) of
// met de lage C♯ en de octaaf (hook); het akkoord wisselt mineur/kwint.
const DARK_ROOT = 30;                                                        // F♯1
// Twaalf slagen per maat op het 3-van-4-raster: [0·1·2] [4·5·6] [8·9·10] [12·13·14].
const BASS_DK_VERSE_A = [3, 2, 0, 15, 15, 15, 15, 15, 15, 2, 1, 0];          // A1↘G♯1↘F♯1 · A2 (ligt 4–10) · G♯1↘G1↘F♯1
const BASS_DK_HOOK_A  = [2, 1, 0, 2, 1, 0, 7, 7, 7, 7, 7, 7];                // G♯1↘G1↘F♯1 twee keer · C♯2 ligt 8–14
const BASS_DK_ROOT    = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];                // F♯1 de hele maat (outro)
// Waar de bas loslaat (de nullen in de slide-rij), altijd op een stille zestiende.
const SLIDE_DK_VERSE  = slideRow([3, 11, 15]);                               // glijder · octaaf tot 11 · glijder
const SLIDE_DK_HOOK_A = slideRow([3, 7, 15]);                                // twee glijders · liggend tot 15
const SLIDE_DK_HOLD   = slideRow([15]);                                      // één toon per maat
// De B-maat van de 808 (Mark 2026-10-27: A ademt in en bouwt op, op de tel;
// B ademt uit en laat zakken, minder noten en achter de tel): een tresillo
// één zestiende achter de tel ([8, 3, 1]: 1·4·7, 9·12·15), zes slagen in
// plaats van twaalf; los op 0 en 8 (stil, vlak vóór de aanslag) en op 15,
// zodat de laatste slag een korte schone stoot is en de A-maat op toon
// begint (de rij van A staat op 0 hoog; stond B op 15 nog hoog, dan gleed
// de A-aanslag omhoog vanaf de lage toon).
export const HITS_SLIDE_GRID_B: EuclidChannel = [8, 3, 1];
const BASS_DK_VERSE_B = [3, 2, 0, 15, 15, -5];                               // A1↘G♯1↘F♯1 (traag) · A2 ligt 9–14 · C♯1 kort: zakt
const BASS_DK_HOOK_B  = [2, 1, 0, -5, -5, -5];                               // G♯1↘G1↘F♯1 · C♯1 ligt, kort op 15
const SLIDE_DK_B      = slideRow([0, 8, 15]);
// De toetsen (Marks luisterbeurt 2026-10-27: geen e-piano, "in your face"):
// de SYNTHEX als riff op F♯3, korte harde stoten op het dubbele tresillo
// ([16, 6, 0]: zestiende 0·3·6·8·11·14), door DRIVE, FET COMP en STEREO
// PHASER. Daaronder de Mellotron-strijkers als duistere laag met het hele
// akkoord (CHORD op de grondtoon van het pad, F♯3: F♯3 A3 C♯4 F♯4; op F♯2
// verdwenen ze onder de sub), één aanzet per twee maten.
// A/B (Mark): de A-maat op de tel, de B-maat dunner en achter de tel: vier
// stoten elk een zestiende na de tel ([16, 4, 1]: 1·5·9·13) en een dalende lijn.
const HITS_DK_RIFF: EuclidChannel = [16, 6, 0];                              // 0·3·6·8·11·14
const HITS_DK_RIFF_B: EuclidChannel = [16, 4, 1];                            // 1·5·9·13: achter de tel
const HITS_DK_SPARSE: EuclidChannel = [16, 3, 0];                            // 0·6·11
const HITS_DK_SPARSE_B: EuclidChannel = [16, 2, 1];                          // 1·9
const HITS_DK_TWO: EuclidChannel = [16, 2, 0];                               // 0·8
const RIFF_DK_VERSE_A = [0, 0, 3, 0, 5, 3];                                  // F♯ F♯ A F♯ C♯ A (t.o.v. F♯3)
const RIFF_DK_VERSE_B = [0, -2, -4, -5];                                     // F♯ E D C♯: zakt
const RIFF_DK_HOOK_A  = [7, 7, 8, 7, 3, 0];                                  // C♯ C♯ D C♯ A F♯: de halve toon D–C♯ dreigt
const RIFF_DK_HOOK_B  = [7, 5, 3, 0];                                        // C♯ B A F♯: zakt
const RIFF_DK_INTRO   = [0, 3, -2];                                          // F♯ A E op 0·6·11
const RIFF_DK_INTRO_B = [0, -5];                                             // F♯ C♯ op 1·9
const RIFF_DK_BREAK   = [0, -2, -5];                                         // F♯ E C♯
const RIFF_DK_BREAK_B = [-2, -5];                                            // E C♯ op 1·9
const RIFF_DK_OUTRO   = [0, 3];                                              // F♯ A op 0·8
const RIFF_RATE = 6;                                                         // gate 0,5 × 1000 / 6 = 83 ms: een stoot
const PAD_DK = [0, 0];                                                       // F♯3 (grondtoon van akkoord en strijkers), elke maat
const riff = (grid: EuclidChannel, notes: number[]): Change[] => [...hitsOn('keysGate', grid), ...seqLine('motifSeq', notes, RIFF_RATE)];

export const DARK: Style = {
  id: 'dark',
  name: 'Dark trap',
  bpm: 140,
  feel: 'half-time · feels like 70 · sliding 808',
  key: 'F♯ minor',
  gridsClock: 'x2',
  bass: 'slide',
  keys: 'riff',
  pad: { nn: 3, file: 'gu-strings.mmbs' },
  chordRoot: 'pad',
  padVoices: 'chord',
  bassFx: 'drive',
  keysFx: 'dirty',
  // Strijkers en synth voorop (Mark: "in your face", geen tapijtje); de
  // strijkers vol open, de galm (mix 0,45) zet ze naar achteren.
  levels: { pad: 1, synth: 0.9 },
  swing: 0,
  sound: [
    ...sound({
      // De riff twee octaven boven de sub (F♯3); de e-piano hangt nergens aan.
      bass: DARK_ROOT, motif: DARK_ROOT + 24, kick: [0.9, -6, 0.3], snare: [0.75, 0.2, 0.9], hat: 0.1,
      // De 808 als sub: zaag door een bijna dicht filter (iets opener dan eerst,
      // zodat de drive wat te knijpen heeft), lange filter-decay, weinig accent.
      sub: [0.16, 0.05, 0.2, 1.0, 0.2],
      // Galm vooral voor de strijkers (de synth gaat grotendeels droog via de
      // DRY-mixer): groot en nat, zodat ze zich scheiden van synth en 808.
      piano: [0.25, 0.05, 0.95], reverb: [0.7, 0.6, 40, 0.3, 0.45],
    }),
    { module: 'bassSeq', control: 'rate', value: slideBassRate(140) },
    { module: 'slideSeq', control: 'root', value: 60 },
    // De 808 door DRIVE in de Dist-stand (RAT: het hele spectrum hard geknipt,
    // dus boventonen op 139, 231 en 323 Hz die een telefoon wél weergeeft),
    // Tone donker, tweederde vervormd zodat de sub eronder schoon blijft.
    // Drive matig (Mark: iets minder): harder knijpen houdt de staart van
    // elke noot op niveau en dan verdwijnen de rusten (gemeten: bij 0,6 nog
    // 50 ms van de 107).
    { module: 'bassDrive', control: 'mode', value: 1 }, { module: 'bassDrive', control: 'drive', value: 0.35 },
    { module: 'bassDrive', control: 'tone', value: 0.35 }, { module: 'bassDrive', control: 'level', value: 0.5 }, { module: 'bassDrive', control: 'mix', value: 0.5 },
    // De SYNTHEX als stoot: twee zaagtanden (8' en 16', licht ontstemd), het
    // filter halfopen (knop 0..10 = 20 Hz..20 kHz, 4,5 ≈ 450 Hz) met veel
    // resonantie en een snelle filterenvelope (A 0, D ≈ 90 ms, S laag); de
    // versterker houdt de gate (83 ms) en laat dan in ≈ 80 ms los; chorus aan.
    // Envelope-knoppen: 0,002 × 5000^(k/10) s.
    { module: 'synth', control: 'o1_wave', value: 0 }, { module: 'synth', control: 'o1_oct', value: 2 }, { module: 'synth', control: 'o1_level', value: 10 },
    { module: 'synth', control: 'o2_wave', value: 0 }, { module: 'synth', control: 'o2_oct', value: 1 }, { module: 'synth', control: 'o2_level', value: 8 },
    { module: 'synth', control: 'o2_transpose', value: 0 }, { module: 'synth', control: 'o2_detune', value: 9 }, { module: 'synth', control: 'noise', value: 0 },
    { module: 'synth', control: 'mode', value: 0 }, { module: 'synth', control: 'freq', value: 4.5 }, { module: 'synth', control: 'res', value: 6 },
    { module: 'synth', control: 'env_amt', value: 6 }, { module: 'synth', control: 'kbd', value: 4 },
    { module: 'synth', control: 'fa', value: 0 }, { module: 'synth', control: 'fd', value: 4.5 }, { module: 'synth', control: 'fs', value: 2 }, { module: 'synth', control: 'fr', value: 3.5 },
    { module: 'synth', control: 'aa', value: 0 }, { module: 'synth', control: 'ad', value: 5 }, { module: 'synth', control: 'as', value: 5 }, { module: 'synth', control: 'ar', value: 4 },
    { module: 'synth', control: 'lfo_vcf', value: 0 }, { module: 'synth', control: 'lfo_osc', value: 0 }, { module: 'synth', control: 'glide', value: 0 },
    { module: 'synth', control: 'chorus', value: true }, { module: 'synth', control: 'sync', value: false }, { module: 'synth', control: 'ring', value: false },
    // Het vuil achter de synth: overdrive (OD, midden naar voren), dan de
    // FET-compressor hard aangestuurd met snelle attack en release (pompend,
    // 12:1), dan een langzame stereo phaser die het breed en dreigend maakt.
    { module: 'keysDrive', control: 'mode', value: 0 }, { module: 'keysDrive', control: 'drive', value: 0.55 },
    { module: 'keysDrive', control: 'tone', value: 0.55 }, { module: 'keysDrive', control: 'level', value: 0.5 }, { module: 'keysDrive', control: 'mix', value: 0.85 },
    { module: 'keysComp', control: 'input', value: 12 }, { module: 'keysComp', control: 'output', value: 2 },
    { module: 'keysComp', control: 'attack', value: 6 }, { module: 'keysComp', control: 'release', value: 6 },
    { module: 'keysComp', control: 'ratio', value: 2 }, { module: 'keysComp', control: 'color', value: 1.2 },
    { module: 'keysPhaser', control: 'rate', value: 0.12 }, { module: 'keysPhaser', control: 'depth', value: 0.65 },
    { module: 'keysPhaser', control: 'feedback', value: 0.45 }, { module: 'keysPhaser', control: 'spread', value: 0.6 }, { module: 'keysPhaser', control: 'mix', value: 0.5 },
    // Div = twee maten (32 zestienden), 90 % hoog: de padgate, dus één aanzet
    // van de strijkers per twee maten.
    { module: 'clock', control: 'div', value: 32 }, { module: 'clock', control: 'width', value: 0.9 },
    // Gesloten ligging op F♯3: F♯3 A3 C♯4 F♯4 op vier strips.
    { module: 'chord', control: 'inv', value: 0 }, { module: 'chord', control: 'spread', value: 0 },
    // Mellotron-strijkers (bank 3 = de Mellotron-seed), vier strips tegelijk
    // (padVoices), bandje licht versleten zodat het hoog blijft staan.
    { module: 'pad', control: 'bank', value: 3 }, { module: 'pad', control: 'length', value: 8 }, { module: 'pad', control: 'return', value: 1 },
    { module: 'pad', control: 'contact', value: 0.5 }, { module: 'pad', control: 'motor', value: 0.3 }, { module: 'pad', control: 'wow', value: 0.2 },
    { module: 'pad', control: 'flutter', value: 0.2 }, { module: 'pad', control: 'wear', value: 0.25 },
    { module: 'padSeq', control: 'root', value: 54 },
  ],
  sections: [
    {
      // Intro: strijkers, hats en een schaarse riff; geen sub en geen snare.
      name: 'INTRO', role: 'intro', chord: 'F♯m',
      stems: all({ bass: false, snare: false }),
      changes: [...grids(0.3, 0.2, 0.45, 0.4, 0.75), ...hits(HITS_SLIDE_GRID, SLIDE_CLOCK), ...slideBass(BASS_DK_VERSE_A), ...SLIDE_DK_VERSE,
        ...chordType(CHORD_MINOR), ...riff(HITS_DK_SPARSE, RIFF_DK_INTRO), ...padLine(PAD_DK)],
      b: [...chordType(CHORD_FIFTH), ...riff(HITS_DK_SPARSE_B, RIFF_DK_INTRO_B)],
    },
    {
      // Vers: de riff op het dubbele tresillo; maat B dunner en achter de tel,
      // de 808 op het late tresillo en zakkend naar C♯1, het akkoord een kwint.
      name: 'VERSE', role: 'verse', chord: 'F♯m',
      stems: all(),
      changes: [...grids(0.35, 0.3, 0.5, 0.5, 0.8), ...hits(HITS_SLIDE_GRID, SLIDE_CLOCK), ...slideBass(BASS_DK_VERSE_A), ...SLIDE_DK_VERSE,
        ...chordType(CHORD_MINOR), ...riff(HITS_DK_RIFF, RIFF_DK_VERSE_A), ...padLine(PAD_DK)],
      b: [...hits(HITS_SLIDE_GRID_B, SLIDE_CLOCK), ...slideBass(BASS_DK_VERSE_B), ...SLIDE_DK_B, ...chordType(CHORD_FIFTH), ...riff(HITS_DK_RIFF_B, RIFF_DK_VERSE_B)],
    },
    {
      // Hook: de glijder twee keer per maat, dan C♯ liggend; de riff op C♯ met
      // de halve toon D; minder hats.
      name: 'HOOK', role: 'hook', chord: 'F♯m · C♯',
      stems: all(),
      changes: [...grids(0.45, 0.4, 0.6, 0.6, 0.55), ...hits(HITS_SLIDE_GRID, SLIDE_CLOCK), ...slideBass(BASS_DK_HOOK_A), ...SLIDE_DK_HOOK_A,
        ...chordType(CHORD_MINOR), ...riff(HITS_DK_RIFF, RIFF_DK_HOOK_A), ...padLine(PAD_DK)],
      b: [...hits(HITS_SLIDE_GRID_B, SLIDE_CLOCK), ...slideBass(BASS_DK_HOOK_B), ...SLIDE_DK_B, ...chordType(CHORD_FIFTH), ...riff(HITS_DK_RIFF_B, RIFF_DK_HOOK_B)],
    },
    {
      // Break: de sub weg (en de kick, die in trap de 808 is); snare, hats,
      // strijkers en een schaarse riff blijven.
      name: 'BREAK', role: 'break', chord: 'F♯m',
      stems: all({ kick: false, bass: false }),
      changes: [...grids(0.3, 0.25, 0.4, 0.45, 0.7), ...hits(HITS_SLIDE_GRID, SLIDE_CLOCK), ...slideBass(BASS_DK_VERSE_A), ...SLIDE_DK_VERSE,
        ...chordType(CHORD_MINOR), ...riff(HITS_DK_SPARSE, RIFF_DK_BREAK), ...padLine(PAD_DK)],
      b: [...chordType(CHORD_FIFTH), ...riff(HITS_DK_SPARSE_B, RIFF_DK_BREAK_B)],
    },
    {
      // Slot: strijkers en synth voorop (geen kick, geen snare), de bas ligt op F♯1, hats.
      name: 'OUTRO', role: 'outro', chord: 'F♯m',
      stems: all({ kick: false, snare: false }),
      changes: [...grids(0.3, 0.2, 0.4, 0.4, 0.6), ...hits(HITS_SLIDE_GRID, SLIDE_CLOCK), ...slideBass(BASS_DK_ROOT), ...SLIDE_DK_HOLD,
        ...chordType(CHORD_MINOR), ...riff(HITS_DK_TWO, RIFF_DK_OUTRO), ...padLine(PAD_DK)],
    },
  ],
  // De fill: een snareroffel (stap 12–15 in het origineel) met wat chaos.
  fill: [
    { module: 'grids', control: 'sd', value: 0.95 },
    { module: 'grids', control: 'hh', value: 0.9 },
    { module: 'grids', control: 'y', value: 0.6 },
    { module: 'grids', control: 'chaos', value: 0.45 },
  ],
};

export const STYLES: readonly Style[] = [TRAP, BOOM_BAP, BOUNCE, ACID_HOP, ACID_HOP_2, DARK];
export function styleById(id: string): Style { return STYLES.find((s) => s.id === id) ?? TRAP; }
/** De stijl uit de querystring (`?app=freestyle&style=acidhop2`); onbekend of
 *  leeg = de eerste stijl. Zo neemt een gedeelde link de stijl mee. */
export function styleIdFromSearch(search: string): string {
  const id = new URLSearchParams(search).get('style') ?? '';
  return STYLES.some((s) => s.id === id) ? id : STYLES[0]!.id;
}
