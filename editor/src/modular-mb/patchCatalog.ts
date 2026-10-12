// Patchcatalogus (doc/plans/editor-structuur.md §3, stap 1): alle ingebouwde
// patches op één plek, als gegevens. De menu's Poly ▾, Solo ▾ en Stress ▾,
// de diagnoseknoppen en de standaardset lezen hieruit; de patchkiezer
// (stap 5) en het release-script voor de pool `centraal` (besluit 1) straks
// ook.
//
// Een item is een naam, een uitleg en een bouwfunctie op het project. Waar
// het staat zegt `menu`; de volgorde binnen een menu is de volgorde hier.
// `divider` zet er in het menu een streep boven.
//
// Nieuwe seed: hier toevoegen, niet als losse knop in ModularMbApp. De
// standaardset (het eerste wat een bezoeker ziet) staat in demoSeeds.ts en
// komt hier binnen als menu 'basisset'. De test (patchCatalog.test.ts) bouwt
// elk item en legt het langs de patchcontrole.

import { BUS_SOLO_FX, CONSOLE_EQ_SOLO_FX, PARA_EQ_SOLO_FX, DIODE_SOLO_FX, EQ_SOLO_FX, FET_SOLO_FX, OPTO_SOLO_FX, SAMPLER_MASTER_FX, VARIMU_SOLO_FX, STEREO_TAPE_SOLO_FX, DIGITAL_ECHO_SOLO_FX, BBD_SOLO_FX, RINGMOD_SOLO_FX, OCTAVER_SOLO_FX, HARMONIZER_SOLO_FX, REVERB_SOLO_FX, SPRING_SOLO_FX, PALME_SOLO_FX, METALLIQUE_SOLO_FX, TREMOLO_SOLO_FX, STEREO_PHASER_SOLO_FX, VIBE_SOLO_FX, ROTARY_SOLO_FX, SHIMMER_SOLO_FX, BEADS_SOLO_FX, seedExampleModules, seedInternals, seedTestPatch, seedFmTestPatch, seedCvBridgePatch, seedPolyVoicePatch, seedSoloVoicePatch, seedCloudsAmbientPatch, seedGenerativeJamPatch, seedDx7PolyPatch, seedSamplerPolyPatch, seedWarpsVocoderPatch, seedVocoderChoirPatch, seedZangPatch, seed808JamPatch, seedKrellPatch, type PolySeedOptions } from './seedModules';
import { seedCs80BrassPatch } from './seedBrass';
import { seedAxelFLeadPatch } from './seedAxelF';
import { seedMartenotPolyPatch } from './seedMartenot';
import { seedSid3Patch, seedSidPolyPatch } from './seedSid';
import { seedMaterialBridgeDemo, seedReservoirDemo, seedTapeStripPolyPatch } from './seedModules';
import { DRIVE_SOLO_FX, ENSEMBLE_SOLO_FX, TUBE_SOLO_FX, FOLDER_SOLO_FX, FREQSHIFT_SOLO_FX, WAH_SOLO_FX, seedAcidJamPatch, seedComplexVoicePatch, seedEPianoPolyPatch, seedOrganPolyPatch, seedRunglerPatch, seedRhythmBoxPatch, seedSemSweepPatch, seedSynthexPolyPatch, seedWestCoastPatch } from './seedShowcase';
import { DEMO_SEEDS } from './demoSeeds';
import type { ModularProject } from './types';

export type CatalogMenu = 'poly' | 'solo' | 'stress' | 'diagnose' | 'basisset';

export interface CatalogEntry {
  /** Stabiel, voor links en de pool; afgeleid van menu en label. */
  id: string;
  menu: CatalogMenu;
  label: string;
  title?: string;
  /** Streep erboven in het menu. */
  divider?: boolean;
  build: (p: ModularProject) => ModularProject;
}

/** Effecten achter de solo-seeds (Solo ▾): de stand en de tooltip. */
const SOLO_FX = {
  fet:    { fx: FET_SOLO_FX,    title: 'Monofoon met FET COMP (1176-stijl) tussen instrument en OUT: Input +14, Output −6, Ratio 4:1. Probeer Ratio All.' },
  opto:   { fx: OPTO_SOLO_FX,   title: 'Monofoon met OPTO COMP (LA-2A-stijl): Peak Reduction 55, Gain +4. Traag en vloeiend; hoor hoe de gain reduction na een noot in twee fasen wegloopt.' },
  bus:    { fx: BUS_SOLO_FX,    title: 'Monofoon met VCA-BUS (SSL-stijl): attack 30 ms, release Auto, 4:1 — de aanslag komt erdoor en het pompt mee.' },
  varimu: { fx: VARIMU_SOLO_FX, title: 'Monofoon met VARI-MU (Fairchild-stijl): Input +10, tijdstand 2, Color 1,3 — dik en warm, de ratio loopt op met het ingrijpen.' },
  diode:  { fx: DIODE_SOLO_FX,  title: 'Monofoon met DIODE COMP (Neve-33609-stijl): drempel −28, 4:1, release A1, Color 1,2 — flink ingrijpen, dan hoor je de oneven harmonischen van de diodes.' },
  console: { fx: CONSOLE_EQ_SOLO_FX, title: 'Monofoon met CONSOLE EQ (1073-stijl): HPF 80 Hz, Low +4 op 60 Hz, Mid +3 op 3,2 kHz, High +2. Hoor de bult van de inductor in het laag.' },
  para:   { fx: PARA_EQ_SOLO_FX, title: 'Monofoon met PARA EQ (SSL/API-stijl): HPF 40, smile-curve (LF +3, LMF −2, HMF +3, HF +2) met Prop.Q aan.' },
  eq:     { fx: EQ_SOLO_FX,     title: 'Monofoon met PROGRAM EQ (Pultec-stijl): de Pultec-truc op 60 Hz (boost 8, atten 6) en wat glans op 8 kHz.' },
  tape:   { fx: STEREO_TAPE_SOLO_FX, title: 'Monofoon met STEREO TAPE: 320 ms links, ratio 1,5 rechts (gepunteerd), Cross 0,6 — de echo\'s kruipen van links naar rechts; wow/flutter zweven per spoor.' },
  ddl:    { fx: DIGITAL_ECHO_SOLO_FX, title: 'Monofoon met DIGITAL ECHO (12-bit, band 7 kHz, modulatie 0,7 Hz): de rack-delay van begin jaren tachtig, gruis en chorus op de herhalingen.' },
  bbd:    { fx: BBD_SOLO_FX,    title: 'Monofoon met BBD CHORUS (9 ms, 0,5 Hz, Spread 1): mono in, breed stereo uit — het Dimension-beeld.' },
  ring:   { fx: RINGMOD_SOLO_FX, title: 'Monofoon met RING MOD (diode, 330 Hz, mix 0,7): klokken en metaal; stem Freq op de toonsoort voor harmonische boventonen.' },
  oct:    { fx: OCTAVER_SOLO_FX, title: 'Monofoon met OCTAVER (−1 oct 0,8, −2 oct 0,3): de analoge sub onder de noot; speel één noot tegelijk.' },
  harm:   { fx: HARMONIZER_SOLO_FX, title: 'Monofoon met HARMONIZER: stem A +7 (kwint, links), stem B +12 +5 ct (octaaf, rechts), wat feedback — koor van kwinten en octaven.' },
  plate:  { fx: REVERB_SOLO_FX, title: 'Monofoon met REVERB in Plate-stand (Dattorro-tank, size 0,7, predelay 15 ms): de gladde studioplaat.' },
  palme:  { fx: PALME_SOLO_FX, title: 'Monofoon door de DIFFUSEUR in Palme-stand: twaalf chromatisch gestemde snaren trillen mee, een zingende halo die na de noot doorklinkt.' },
  metal:  { fx: METALLIQUE_SOLO_FX, title: 'Monofoon door de DIFFUSEUR in Métallique-stand: een gong als luidspreker, metalen boventonen die niet met de toon meegaan.' },
  spring: { fx: SPRING_SOLO_FX, title: 'Monofoon met REVERB in Spring-stand: twee veren met dispersie — de boing van een gitaarversterker.' },
  trem:   { fx: TREMOLO_SOLO_FX, title: 'Monofoon met TREMOLO in Harm-stand (brownface): laag en hoog in tegenfase op 5,2 Hz — half tremolo, half phaser.' },
  vibe:   { fx: VIBE_SOLO_FX, title: 'Monofoon met VIBE (univibe-stijl): Chorus-stand, 1,6 Hz, lampkarakter 0,75 — het ademende, scheve kloppen tussen chorus en phaser in.' },
  rotary: { fx: ROTARY_SOLO_FX, title: 'Monofoon met ROTARY (Leslie-stijl): begint op Slow; zet Speed op Fast en hoor hoorn en trommel elk in hun eigen tempo opwinden. Hang de Fast-gate aan het mod-wiel voor de klassieke schakelaar.' },
  beads:  { fx: BEADS_SOLO_FX, title: 'Plaits door BEADS (Mutable, broncode vrijgegeven op 11 oktober 2026): korrels in Tape-kwaliteit met galm. Draai Size helemaal open voor de delay; haal de kabel naar In L weg en Beads wordt zelf een klankbron.' },
  shimmer: { fx: SHIMMER_SOLO_FX, title: 'Monofoon met SHIMMER: plaatgalm met een octaaf omhoog in de lus (shimmer 0,55) — een glinsterende wolk boven wat je speelt.' },
  sphase: { fx: STEREO_PHASER_SOLO_FX, title: 'Monofoon met STEREO PHASER: 2 × 6 stages, rechts een kwartslag verschoven, feedback 0,45.' },
  drive:  { fx: DRIVE_SOLO_FX, title: 'Monofoon met DRIVE in de overdrive-stand: het midden komt naar voren, het laag blijft strak. Probeer Mode Dist en Fuzz.' },
  folder: { fx: FOLDER_SOLO_FX, title: 'Fluit (bijna een sinus) door de FOLDER (stand 259): draai Fold open en hoor de boventonen erbij vouwen; Sym voegt even boventonen toe.' },
  fshift: { fx: FREQSHIFT_SOLO_FX, title: 'Monofoon met FREQ SHIFT (+35 Hz, wat feedback): de boventonen schuiven uit hun verhouding, klokachtig. Range 5 Hz geeft een trage zweving.' },
  wah:    { fx: WAH_SOLO_FX, title: 'Monofoon met WAH in de stand Auto↑ (touch-wah): harder spelen opent het filter. Probeer Type Vowel voor het sprekende filter en Mode LFO.' },
  tube:   { fx: TUBE_SOLO_FX, title: 'Getokkelde snaar door TUBE in de Amp-stand (Marshall-stack, flink opengedraaid): twee triodes, toonstack, eindtrap met sag en een kast. Probeer Stack Fender of Vox, en Mode Studio voor alleen buiswarmte.' },
  ensemble: { fx: ENSEMBLE_SOLO_FX, title: 'Gestreken snaar door de ENSEMBLE: drie vertragingslijnen in drie fasen maken van één stem een strijkersgroep, breed en zonder hoorbaar golven.' },
} as const;

/** Solo ▾: de kortst mogelijke speelbare patch rond één instrument
 *  (MidiIn → module → [effect] → OUT). */
const SOLO_DEFS: { label: string; t: string; n: string; l: string; r: string; c: Record<string, number>; fx?: keyof typeof SOLO_FX }[] = [
  { label: '🎚 Mixtur (Trautonium)', t: 'tp_mmb_mixtur', n: 'MIXTUR', l: 'out', r: 'out',
    c: { coarse: -12, curve: 0.6, unrest: 0.3, glide: 60, main: 0.8, div1: 2, div2: 3, div3: 4, div4: 5,
         sub1: 0.55, sub2: 0.4, sub3: 0.3, sub4: 0.15, formant: 4, fshift: -2, freso: 0.6, fmix: 0.75,
         noise: 0.04, dyn: 0, attack: 15, release: 250, level: 0.8 } },
  { label: '🎚 Mixtur + Plate reverb', t: 'tp_mmb_mixtur', n: 'MIXTUR', l: 'out', r: 'out',
    c: { coarse: -12, curve: 0.6, unrest: 0.3, glide: 60, main: 0.8, div1: 2, div2: 3, div3: 4, div4: 5,
         sub1: 0.55, sub2: 0.4, sub3: 0.3, sub4: 0.15, formant: 4, fshift: -2, freso: 0.6, fmix: 0.75,
         noise: 0.04, dyn: 0, attack: 15, release: 250, level: 0.8 }, fx: 'plate' },
  { label: '🖥 CMI (Fairlight-stem)', t: 'tp_mmb_cmi', n: 'CMI', l: 'out', r: 'out',
    c: { seg: 40, smooth: 0.3, loop: 24, attack: 4, release: 400, level: 0.8 }, fx: 'plate' },
  { label: '🌊 Martenot + Palme', t: 'tp_mmb_martenot', n: 'MARTENOT', l: 'out', r: 'out',
    c: { onde: 0.8, creux: 0.15, souffle: 0.05, glide: 40, vib: 0.18, vib_rate: 5.5, attack: 10, release: 350, level: 0.8 }, fx: 'palme' },
  { label: '🌊 Martenot + Métallique', t: 'tp_mmb_martenot', n: 'MARTENOT', l: 'out', r: 'out',
    c: { onde: 0.5, gambe: 0.35, nasillard: 0.2, glide: 40, vib: 0.18, attack: 10, release: 350, level: 0.8 }, fx: 'metal' },
  { label: '🧪 Acid (303-stijl bas)', t: 'tp_mmb_acid', n: 'ACID', l: 'out', r: 'out',
    c: { wave: 0, tune: -12, cutoff: 0.3, res: 0.8, envmod: 0.65, decay: 0.35, accent: 0.7, level: 0.8 } },
  { label: '〽️ Fluit + FOLDER (West Coast)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 3, level: 0.9 }, fx: 'folder' },
  { label: '🎻 Strijker + ENSEMBLE (string machine)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 2, level: 0.9 }, fx: 'ensemble' },
  { label: '🦆 String + WAH (touch-wah)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
    c: { pluck: 0.8, level: 0.9 }, fx: 'wah' },
  { label: '🎸 String + DRIVE (overdrive/fuzz)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
    c: { pluck: 0.6, level: 0.8 }, fx: 'drive' },
  { label: '🔥 String + TUBE (buizenversterker)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
    c: { pluck: 0.6, level: 0.8 }, fx: 'tube' },
  { label: '🔔 Rings + FREQ SHIFT', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'fshift' },
  { label: '〰️ Scanned (levende golftabel)', t: 'tp_mmb_scanned', n: 'Scanned', l: 'out', r: 'out',
    c: { tension: 0.6, damping: 0.3, restore: 0.3, speed: 0.15, position: 0.5, width: 0.3, level: 0.8 } },
  { label: '🎲 GENDYN (stochastisch)', t: 'tp_mmb_gendyn', n: 'GENDYN', l: 'out', r: 'out',
    c: { points: 12, amp_step: 0.3, dur_step: 0.3, dist: 0.3, smooth: 0.5, settle: 0.1, seed: 1, level: 0.8 } },
  { label: '🫧 Excitable (prikkelbaar medium)', t: 'tp_mmb_excitable', n: 'Excitable', l: 'out_l', r: 'out_r',
    c: { detune: 7, excite: 3, refract: 12, thresh: 1, speed: 2, pickup: 0.4, level: 0.8 } },
  { label: 'Material Bridge (materiaalgeheugen)', t: 'tp_mmb_material_bridge', n: 'Material Bridge', l: 'out_l', r: 'out_r',
    c: { spread: 0.12, coupling: 0.65, decay: 4, memory: 0.85, recovery: 2, pickup: 0.25, level: 0.8 } },
  { label: '💍 Rings (resonator)', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 } },
  { label: '🎛️ Plaits (24 engines)', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 } },
  { label: '🔮 Plaits + BEADS', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 2, harmonics: 0.4, timbre: 0.45, morph: 0.5, decay: 0.7, lpg: 0.5, level: 0.8 }, fx: 'beads' },
  { label: '💎 Elements (modaal)', t: 'tp_mmb_elements', n: 'Elements', l: 'out_l', r: 'out_r',
    c: { strike: 0.8, space: 0.5, level: 0.8 } },
  { label: '🎻 STK (9 instrumenten)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 0, level: 0.8 } },
  { label: '🎹 DX7 (6-op FM)', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 } },
  { label: '🎚️ DX7 + FET comp', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'fet' },
  { label: '🎚️ Rings + Opto comp', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 },
    fx: 'opto' },
  { label: '🎚️ Plaits + VCA-bus', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'bus' },
  { label: '🎚️ Elements + Vari-mu', t: 'tp_mmb_elements', n: 'Elements', l: 'out_l', r: 'out_r',
    c: { strike: 0.8, space: 0.5, level: 0.8 }, fx: 'varimu' },
  { label: '🎚️ STK + Program EQ', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 0, level: 0.8 }, fx: 'eq' },
  { label: '🎚️ DX7 + Diode comp', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'diode' },
  { label: '🎚️ Rings + Console EQ', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 },
    fx: 'console' },
  { label: '🎚️ Plaits + Para EQ', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'para' },
  { label: '🔁 Plaits + Stereo tape', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'tape' },
  { label: '🔁 DX7 + Digital echo', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'ddl' },
  { label: '🌊 DX7 + BBD chorus', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'bbd' },
  { label: '💍 Rings + Ring mod', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'ring' },
  { label: '🎸 STK + Octaver', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 0, level: 0.8 }, fx: 'oct' },
  { label: '🎶 Plaits + Harmonizer', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'harm' },
  { label: '🏛️ Rings + Plate reverb', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'plate' },
  { label: '🪃 STK + Spring reverb', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
    c: { sound: 0, level: 0.8 }, fx: 'spring' },
  { label: '〰️ DX7 + Tremolo', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'trem' },
  { label: '💡 DX7 + Vibe', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'vibe' },
  { label: '🌪️ DX7 + Rotary', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
    c: { program: 0, level: 0.8 }, fx: 'rotary' },
  { label: '✨ Rings + Shimmer', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'shimmer' },
  { label: '🌀 Plaits + Stereo phaser', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'sphase' },

];

/** Stress ▾: energievretende varianten van de poly-patch, om de Teensy te pushen. */
const STRESS_DEFS: { label: string; n: number; o: PolySeedOptions }[] = [
  { label: '🪕 Strings ×16 (Karplus-Strong)', n: 16, o: { voiceSource: 'string' } },
  // Ladder is duur (2× oversampling): ×8 verzadigde de audio-
  // ISR (>90% CPU → kraken); ×4 is de veilige stress-grens.
  { label: '🪜 Ladder-filter ×4 (Moog)',      n: 4,  o: { filterType: 'ladder' } },
  { label: '⚡ MS-20 scream ×6 (Korg35)',     n: 6,  o: { filterType: 'ms20' } },
  // STK Bowed ×8 liep tegen heap-OOM (delay-lines); ×4 past.
  { label: '🎻 STK Bowed ×4',                 n: 4,  o: { voiceSource: 'stk', stkSound: 2 } },
  { label: '🌀 Comb per stem ×16',            n: 16, o: { perVoiceFx: 'comb' } },
  { label: '〰️ CV-storm ×8 (LFO per stem)',   n: 8,  o: { perVoiceLfo: true } },
  { label: '🔁 Echo-bus ×8 (2× 0,5 s)',       n: 8,  o: { busEchoSeconds: 0.5 } },
  { label: '💎 Elements + 4-stemmig',         n: 4,  o: { withElements: true } },
  { label: '🔥 Alles tegelijk ×8',            n: 8,  o: {
      voiceSource: 'string', perVoiceFx: 'comb', perVoiceLfo: true,
      busEchoSeconds: 0.5, withElements: true } },

];

type Raw = Omit<CatalogEntry, 'id'>;

const RAW: Raw[] = [
  // ── Diagnose: bouwstenen en testpatches ──────────────────────────────
  { menu: 'diagnose', label: "Voorbeelden", title: "Voeg 6 voorbeeld-modules toe aan dit project en plaats ze in het actieve rack", build: (p) => seedExampleModules(p) },
  { menu: 'diagnose', label: "Internals", title: "Voeg MMB-modules (AHDSR, LFO, S&H, VCO, VCF, VCA, OUT, SEQ-8) toe aan het virtuele rack", build: (p) => seedInternals(p) },
  { menu: 'diagnose', label: "Test-patch", title: "Maak een nieuw Test rack + Test patch: VCO → VCF → VCA → OUT met ENV → VCA. Klaar om in de Simulatie-tab af te spelen.", build: (p) => seedTestPatch(p) },
  { menu: 'diagnose', label: "FM-test", title: "FM-testpatch (2-op): MIDI-IN → VCO (sinus-modulator, +12 st) → FM-VCO → VCF → VCA → OUT met ENV → VCA. Speelbaar in de Simulatie-tab.", build: (p) => seedFmTestPatch(p) },
  { menu: 'diagnose', label: "CV-bridge", title: "CV-bridge patch: MidiIn → VCO → VCF → VCA, 2×AHDSR (filter+amp), velocity via CvMath.", build: (p) => seedCvBridgePatch(p) },
  // ── Poly ▾ ────────────────────────────────────────────────────────────
  ...[1, 2, 4, 8, 16].map((n): Raw => ({
    menu: 'poly', label: `${n}-stemmig${n === 1 ? ' (mono)' : ''}`,
    title: `${n}-stemmige patch${n > 8 ? ' (16-in mixer)' : n > 4 ? ' (8-in mixer)' : ''}`,
    build: (p) => seedPolyVoicePatch(p, n),
  })),
  { menu: 'poly', label: "4-stemmig + aftertouch → filter", title: "4-stemmig met aftertouch → filter: MidiIn.press (per stem) op de c-ingang van de sum-CvMath vóór het filter; druk na de aanslag opent de cutoff tot anderhalf octaaf. Channel-aftertouch (Keystep) opent alle stemmen, poly-aftertouch alleen die toets.", divider: true, build: (p) => seedPolyVoicePatch(p, 4, { aftertouch: true }) },
  { menu: 'poly', label: "🎺 CS-80 koper (aftertouch)", title: "CS-80-koper à la Vangelis, 6 stemmen: zaagtand → ladder met trage filter-attack. Aftertouch opent het filter (tot vier octaven) en voegt vibrato toe (opgeteld bij het modwheel). BBD-chorus en plaatgalm op de bus. Speel langzaam en druk ná de aanslag door.", build: (p) => seedCs80BrassPatch(p, 6) },
  { menu: 'poly', label: "🎹 Axel F-lead (2 saws)", title: "Axel F-lead (Faltermeyer), recept van Doctor Mix: twee saws in unison (±6 ct) → ladder die ver openstaat → Para EQ (low-cut, dip bij 450 Hz) → Digital Echo op een punt-achtste bij 117 BPM. Monofoon; speel staccato.", build: (p) => seedAxelFLeadPatch(p) },
  { menu: 'poly', label: "🎐 Ondes ×4 (Martenot-ensemble)", title: "Ondes ×4: vier MARTENOT-stemmen als PolyGroup door één DIFFUSEUR (Palme) — een ensemble van ondes dat één kast deelt, zoals Messiaens Fête des belles eaux voor zes ondes.", build: (p) => seedMartenotPolyPatch(p, 4) },
  { menu: 'poly', label: "🕹️ SID ×3 (C64)", title: "SID ×3 (C64): één SID-emulatie met drie stem-cellen als PolyGroup, MIDI-in verdeelt de noten. Pulse met een langzame PWM (LFO op PW+), pitch-wheel op Bend. Nog zonder filter.", build: (p) => seedSidPolyPatch(p) },
  { menu: 'poly', label: "🕹️ SID ×6 (2 chips, stereo)", title: "SID ×6: 2 SID's in één module (knop SIDs = 2), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R.", build: (p) => seedSidPolyPatch(p, 2) },
  { menu: 'poly', label: "🕹️ SID ×9 (3 chips, stereo)", title: "SID ×9: 3 SID's in één module (knop SIDs = 3), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R.", build: (p) => seedSidPolyPatch(p, 3) },
  { menu: 'poly', label: "🕹️ SID ×12 (4 chips, stereo)", title: "SID ×12: 4 SID's in één module (knop SIDs = 4), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R.", build: (p) => seedSidPolyPatch(p, 4) },
  { menu: 'poly', label: "🕹️ SID 3-osc lead (mono)", title: "SID 3-osc lead: één SID met instellingen per stem, Stack — drie oscillatoren op één noot (pulse, saw 8 ct hoger, driehoek een octaaf lager) door een 6581-lowpass.", build: (p) => seedSid3Patch(p, 1) },
  { menu: 'poly', label: "🕹️ SID 3-osc ×4 (poly)", title: "SID 3-osc ×4: vier SID 3-osc's in een PolyGroup — elke noot een eigen chip met eigen filter, via een mixer.", build: (p) => seedSid3Patch(p, 4) },
  { menu: 'poly', label: "🎹 DX7 poly ×8", title: "8-stemmige DX7 (msfa/Dexed-kern): MidiIn -> 8x DX7 -> Mixer8 -> OUT, stereo uitgewaaierd. Bank-knop kiest een factory-ROM (1A..4B); USER = .syx via de Teensy-modal.", divider: true, build: (p) => seedDx7PolyPatch(p, 8) },
  { menu: 'poly', label: "🎧 Sampler ×8 (cellen)", title: "Multisampler als multi-module: één SAMPLER met acht stem-cellen als PolyGroup. MidiIn verdeelt de noten; de bank zit één keer in het geheugen. Laad een bank via 🎹 Multisample.", build: (p) => seedSamplerPolyPatch(p, 8) },
  { menu: 'poly', label: "📼 Tape strip ×8 (Mellotron)", title: "Mellotron-mechanica om de samplerbank: per toets een bandje van 8 s dat na loslaten terugspoelt, kopcontact, motorbelasting, wow/flutter en slijtage. Gebruikt de bank van de sampler (bankbalk in Simulatie).", build: (p) => seedTapeStripPolyPatch(p, 8) },
  { menu: 'poly', label: "🎹 Organ ×12 (tonewheel + Rotary)", title: "MidiIn → ORGAN (tonewheel-orgel, twaalf toetsen) → ROTARY → OUT. 888000000 met percussie en chorus; het mod-wiel schakelt de luidspreker.", build: (p) => seedOrganPolyPatch(p) },
  { menu: 'poly', label: "🎹 E-piano ×12 (tine / reed)", title: "MidiIn → E-PIANO (twaalf toetsen, velocity bekabeld) → OUT. Een model van tine en pickup; de klank verandert met de aanslag.", build: (p) => seedEPianoPolyPatch(p) },
  { menu: 'poly', label: "🎛️ Synthex ×8 (Elka)", title: "MidiIn → SYNTHEX (acht stemmen naar de Elka Synthex) → OUT. Pitch-wheel = joystick X, mod-wiel = joystick Y (filter).", build: (p) => seedSynthexPolyPatch(p) },
  { menu: 'poly', label: "🎤 Zingende stem ×8", title: "Zingende stem: ZANG met acht stem-cellen als PolyGroup, met galm. Elke aanslag zingt de volgende lettergreep. Maak een lyricbank via 🎤 Zang.", build: (p) => seedZangPatch(p, 8) },
  { menu: 'poly', label: "FOF Stem (mono)", title: "FOF/CHANT-geinspireerde monofone zangoscillator. Speel noten en morf met Vowel door A-E-I-O-U; geen opname of lyricbank nodig.", build: (p) => seedSoloVoicePatch(p, 'tp_mmb_fof', 'FOF Stem', 'out', 'out', { vowel: 0, tone: 0.5, breath: 0.08, vibrato: 0.12, level: 0.8, voice: 0.35 }) },
  { menu: 'poly', label: "🎧 Sampler ×8 auto-wah", title: "Sampler ×8 met per stem een MS-20 in de cel, gestuurd door de envelope-follower van diezelfde stem: env_k → cutoff_k. Eén kabel in de patcher, uitgevouwen over alle stemmen.", build: (p) => seedSamplerPolyPatch(p, 8, true) },
  { menu: 'poly', label: "🎧 Sampler ×8 auto-wah + FET", title: "Sampler ×8 auto-wah, en daarachter FET COMP (1176-stijl, stereo): Input +12 drukt hem stevig samen, Output −4 haalt het niveau terug. Probeer Ratio All.", build: (p) => seedSamplerPolyPatch(p, 8, true, true) },
  { menu: 'poly', label: "🎧 Sampler ×8 + EQ + Vari-mu", title: "Sampler ×8 met een mastering-keten: PROGRAM EQ (Pultec-stijl, de Pultec-truc op 60 Hz en wat lucht op 10 kHz) en daarna VARI-MU (Fairchild-stijl) als lijm.", build: (p) => seedSamplerPolyPatch(p, 8, false, SAMPLER_MASTER_FX) },
  // ── Solo ▾ ────────────────────────────────────────────────────────────
  ...SOLO_DEFS.map((s): Raw => ({
    menu: 'solo', label: s.label, title: s.fx ? SOLO_FX[s.fx].title : undefined,
    build: (p) => seedSoloVoicePatch(p, s.t, s.n, s.l, s.r, s.c, s.fx ? SOLO_FX[s.fx].fx : undefined),
  })),
  { menu: 'solo', label: "☁️ Clouds ambient (+Tides)", title: "Plaits → Clouds (granular) → OUT, met Tides als quadratuur-LFO op position/texture. Speel één noot en laat de wolk drijven.", divider: true, build: (p) => seedCloudsAmbientPatch(p) },
  { menu: 'solo', label: "🎲 Generative jam (Marbles)", title: "Zelfspelend: Marbles kiest noten en klokt Plaits (grain-engine), Clouds + Tides maken er een drijvende wolk van. Geen MIDI nodig.", build: (p) => seedGenerativeJamPatch(p) },
  { menu: 'solo', label: "Material Bridge demo (frase)", title: "Zacht-hard-zacht-frase op Hit A plus een trage Hit B; drie varianten: Memory uit, alleen brug, brug + vermoeiing.", build: (p) => seedMaterialBridgeDemo(p) },
  { menu: 'solo', label: "Reservoir demo (gedeelde bron)", title: "Twee zelfspelende stemmen delen een eindige, herstellende bron; A/B: Drain 0,7 tegenover 0.", build: (p) => seedReservoirDemo(p) },
  { menu: 'solo', label: "🧪 Acid jam (Clock + Euclid + Chaos)", title: "Zelfspelend: Clock → Seq → ACID, Euclid op Accent en Slide, Chaos op de cutoff, kick op de tel. Draai aan Cutoff, Reso en Env mod.", build: (p) => seedAcidJamPatch(p) },
  { menu: 'solo', label: "🌊 West Coast (Turing + Folder + LPG)", title: "Zelfspelend: Turing → Quantizer → sinus → FOLDER → LPG → galm; LFO-8 en Chaos bewegen de folder, de pulsen van Turing pingen de gate.", build: (p) => seedWestCoastPatch(p) },
  { menu: 'solo', label: "🌀 Rungler (Benjolin-stijl chaos)", title: "Zelfspelende chaos naar de Benjolin van Rob Hordijk: twee oscillatoren en een schuifregister die elkaar sturen. Het klavier stemt oscillator A.", build: (p) => seedRunglerPatch(p) },
  { menu: 'solo', label: "🎛️ Buchla-stem (Complex + LPG)", title: "West Coast-stem onder het klavier: COMPLEX (259-stijl) door de LPG; SLOPE opent de gate en beweegt het timbre.", build: (p) => seedComplexVoicePatch(p) },
  { menu: 'solo', label: "🎚️ SEM sweep (LP → notch → HP)", title: "Zelfspelend: zaag op een sequencerlijn door het SEM-filter; Mode schuift traag van laagdoorlaat via notch naar hoogdoorlaat.", build: (p) => seedSemSweepPatch(p) },
  { menu: 'solo', label: "🥁 Ritmebox (CR-78-presets)", title: "Ritmebox met de presets van de CR-78 (overgenomen uit de Service Notes). Draai aan Rhythm; pad 1 start/stopt.", build: (p) => seedRhythmBoxPatch(p) },
  { menu: 'solo', label: "🗣️ Warps vocoder", title: "Vocoder: jouw keyboard bespeelt Warps' interne zaag-carrier; Marbles klokt Plaits als ritmische modulator. Houd een noot aan en draai Timbre.", build: (p) => seedWarpsVocoderPatch(p) },
  { menu: 'solo', label: "🎶 Koor zingt woorden (vocoder)", title: "Het koor zingt woorden: de sampler (koor) is de drager van Warps' vocoder, Plaits' spraak-engine spreekt bij elke aanslag een woord. Speel akkoorden; Morph kiest het woord.", build: (p) => seedVocoderChoirPatch(p, 'plaits') },
  { menu: 'solo', label: "🎤 Koor zingt jouw stem (vocoder + mic)", title: "Het koor zingt jouw stem: praat of zing in de microfoon (AUDIO IN) en speel akkoorden. Gebruik een koptelefoon.", build: (p) => seedVocoderChoirPatch(p, 'mic') },
  { menu: 'solo', label: "🎶 Koor zingt jouw woorden (vocoder + ZANG)", title: "Het koor zingt jouw woorden: de module ZANG levert bij elke aanslag de volgende lettergreep uit je lyricbank, het koor zingt hem via de vocoder. Maak de bank met 🎤 Zang.", build: (p) => seedVocoderChoirPatch(p, 'zang') },
  { menu: 'solo', label: "🥁 808 jam (Peaks)", title: "Zelfspelend 808-ritme: Marbles klokt kick/snare/hat (Peaks-drums) door een mixer. Draai aan Marbles Deja vu voor een vaste groove.", build: (p) => seed808JamPatch(p) },
  { menu: 'solo', label: "🌌 Krell (zelfspelend)", title: "Zelfspelende Krell-patch: Stages triggert zichzelf + Marbles, envelope stuurt Morph-WT door Clouds. Oneindige melodie zonder MIDI.", build: (p) => seedKrellPatch(p) },
  // ── Stress ▾ ──────────────────────────────────────────────────────────
  ...STRESS_DEFS.map((s): Raw => ({ menu: 'stress', label: s.label, build: (p) => seedPolyVoicePatch(p, s.n, s.o) })),
  // ── Standaardset (demoSeeds.ts) ───────────────────────────────────────
  ...DEMO_SEEDS.map((s): Raw => ({ menu: 'basisset', label: s.label, title: s.title, build: s.run })),
];

/** Een id uit menu en label: kleine letters, alleen letters en cijfers. */
export function catalogId(menu: CatalogMenu, label: string): string {
  const slug = label.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${menu}/${slug || 'item'}`;
}

export const PATCH_CATALOG: CatalogEntry[] = RAW.map((e) => ({ ...e, id: catalogId(e.menu, e.label) }));

/** De items van één menu, in volgorde. */
export function catalogMenu(menu: CatalogMenu): CatalogEntry[] {
  return PATCH_CATALOG.filter((e) => e.menu === menu);
}
