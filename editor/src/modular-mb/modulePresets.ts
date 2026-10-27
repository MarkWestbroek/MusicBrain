// Fabriekspresets per module: één bron voor de plugin (pluginParams.ts zet ze
// in generated/<typeId>_params.h, de DAW toont ze als programma's) en later
// de editor. Waarden op control-id zoals het paneel ze kent; een keuzeknop
// met zijn index, een toggle als boolean. Wat ontbreekt staat op de default.
// Een preset uit Logic (.aupreset, "Save As…") is XML met dezelfde ids: zie
// doc/plans/plugin.md §2e.

import type { ControlValue } from './types';

export interface ModulePreset {
  name: string;
  values: Record<string, ControlValue>;
}

export const MODULE_PRESETS: Record<string, ModulePreset[]> = {
  // HALL: algo 0 Hall, 1 Room, 2 Chamber, 3 Random.
  tp_mmb_hall: [
    { name: 'Kleine kamer', values: { algo: 1, size: 0.25, decay: 0.8, predelay: 5, early: 0.7, diffusion: 0.8, mod: 0.2, hidamp: 0.5, lomult: 1.0, width: 0.8, mix: 0.25 } },
    // Mark, Logic 2026-10-25 ("hall.aupreset"): kamer met lange voorvertraging.
    { name: 'Chamber (Mark)', values: { algo: 2, size: 0.2417, decay: 2.5, predelay: 63.75, early: 0.5, diffusion: 0.9083, mod: 0.4, hidamp: 0.725, lomult: 1.2, width: 1, mix: 0.3 } },
    { name: 'Concertzaal', values: { algo: 0, size: 0.75, decay: 2.8, predelay: 25, early: 0.4, diffusion: 0.85, mod: 0.35, hidamp: 0.45, lomult: 1.3, width: 1, mix: 0.3 } },
    { name: 'Kathedraal', values: { algo: 0, size: 1, decay: 7, predelay: 45, early: 0.3, diffusion: 0.9, mod: 0.5, hidamp: 0.55, lomult: 1.6, width: 1, mix: 0.4 } },
    { name: 'Helder plaatje', values: { algo: 2, size: 0.4, decay: 1.8, predelay: 0, early: 0, diffusion: 1, mod: 0.3, hidamp: 0.15, lomult: 0.8, width: 1, mix: 0.3 } },
    { name: 'Wolk', values: { algo: 3, size: 0.8, decay: 4, predelay: 80, early: 0.2, diffusion: 0.7, mod: 0.8, hidamp: 0.5, lomult: 1.2, width: 1, mix: 0.35 } },
    { name: 'Bevroren', values: { algo: 0, size: 1, decay: 12, predelay: 0, early: 0, diffusion: 0.9, mod: 0.6, hidamp: 0.4, lomult: 1.0, width: 1, freeze_btn: true, mix: 0.5 } },
  ],
  // REVERB: mode 0 Plate, 1 Spring.
  tp_mmb_reverb: [
    { name: 'Korte plaat', values: { mode: 0, size: 0.35, damp: 0.3, predelay: 0, mod: 0.2, mix: 0.25 } },
    { name: 'Vocal plate', values: { mode: 0, size: 0.6, damp: 0.45, predelay: 30, mod: 0.3, mix: 0.3 } },
    { name: 'Grote plaat', values: { mode: 0, size: 0.9, damp: 0.55, predelay: 50, mod: 0.4, mix: 0.4 } },
    { name: 'Gitaarveer', values: { mode: 1, size: 0.5, damp: 0.4, predelay: 0, mod: 0.2, mix: 0.3 } },
    { name: 'Dub-veer', values: { mode: 1, size: 0.85, damp: 0.25, predelay: 10, mod: 0.5, mix: 0.5 } },
  ],
  // ROTARY (Leslie): speed 0 Slow, 1 Fast, 2 Brake.
  tp_mmb_rotary: [
    { name: 'Langzaam', values: { speed: 0, slow_rate: 0.8, fast_rate: 6.7, inertia: 1, drive: 0.2, balance: 0.5, spread: 0.8, noise: 0.3, level: 1 } },
    { name: 'Snel', values: { speed: 1, slow_rate: 0.8, fast_rate: 6.7, inertia: 1, drive: 0.2, balance: 0.5, spread: 0.8, noise: 0.3, level: 1 } },
    { name: 'Gospel (vuil)', values: { speed: 1, slow_rate: 0.7, fast_rate: 7, inertia: 1.2, drive: 0.65, balance: 0.55, spread: 1, noise: 0.4, level: 0.9 } },
    { name: 'Zachte koor', values: { speed: 0, slow_rate: 0.5, fast_rate: 5.5, inertia: 1.6, drive: 0, balance: 0.4, spread: 0.6, noise: 0.1, level: 1 } },
    { name: 'Remmen', values: { speed: 2, inertia: 1.5, drive: 0.3, balance: 0.5, spread: 0.8, noise: 0.3, level: 1 } },
  ],
  // ORGAN: drawbars 0..8 (16' 5⅓' 8' 4' 2⅔' 2' 1⅗' 1⅓' 1'); perc 0 uit, 1 2e, 2 3e;
  // vib 0 uit, 1–3 V1–V3, 4–6 C1–C3.
  tp_mmb_organ: [
    { name: 'Jazz (888000000)', values: { d16: 8, d513: 8, d8: 8, d4: 0, d223: 0, d2: 0, d135: 0, d113: 0, d1: 0, perc: 2, perc_fast: true, perc_soft: false, vib: 6, click: 0.5 } },
    { name: 'Gospel (888800008)', values: { d16: 8, d513: 8, d8: 8, d4: 8, d223: 0, d2: 0, d135: 0, d113: 0, d1: 8, perc: 0, vib: 6, click: 0.4 } },
    { name: 'Volle registers', values: { d16: 8, d513: 8, d8: 8, d4: 8, d223: 8, d2: 8, d135: 8, d113: 8, d1: 8, perc: 0, vib: 0, click: 0.3, level: 0.6 } },
    { name: 'Fluit (008000000)', values: { d16: 0, d513: 0, d8: 8, d4: 0, d223: 0, d2: 0, d135: 0, d113: 0, d1: 0, perc: 0, vib: 2, click: 0.1 } },
    { name: 'Rock (888600000)', values: { d16: 8, d513: 8, d8: 8, d4: 6, d223: 0, d2: 0, d135: 0, d113: 0, d1: 0, perc: 1, perc_fast: true, vib: 6, click: 0.7, leak: 0.5 } },
    { name: 'Ballade (838000000)', values: { d16: 8, d513: 3, d8: 8, d4: 0, d223: 0, d2: 0, d135: 0, d113: 0, d1: 0, perc: 0, vib: 4, click: 0.2 } },
  ],
  // EPIANO: type 0 Tine (Rhodes), 1 Reed (Wurlitzer).
  tp_mmb_epiano: [
    { name: 'Klassiek Rhodes', values: { type: 0, timbre: 0.35, bell: 0.5, decay: 0.55, drive: 0.3, tremolo: 0, damper: 0.6 } },
    { name: 'Suitcase (tremolo)', values: { type: 0, timbre: 0.4, bell: 0.45, decay: 0.6, drive: 0.4, tremolo: 0.6, trem_rate: 4.5, damper: 0.6 } },
    { name: 'Belletjes', values: { type: 0, timbre: 0.6, bell: 0.85, decay: 0.7, drive: 0.15, tremolo: 0.2, trem_rate: 3, damper: 0.5 } },
    { name: 'Wurli', values: { type: 1, timbre: 0.4, bell: 0.3, decay: 0.45, drive: 0.45, tremolo: 0.35, trem_rate: 5.5, damper: 0.65 } },
    { name: 'Wurli vuil', values: { type: 1, timbre: 0.6, bell: 0.4, decay: 0.4, drive: 0.85, tremolo: 0, damper: 0.7 } },
  ],
  // ACID (303): wave 0 Saw, 1 Sqr.
  tp_mmb_acid: [
    { name: 'Klassiek', values: { wave: 0, cutoff: 0.35, res: 0.7, envmod: 0.6, decay: 0.4, accent: 0.6 } },
    { name: 'Squelch', values: { wave: 0, cutoff: 0.2, res: 0.9, envmod: 0.85, decay: 0.3, accent: 0.9 } },
    { name: 'Diepe bas', values: { wave: 1, cutoff: 0.15, res: 0.4, envmod: 0.3, decay: 0.8, accent: 0.4 } },
    { name: 'Open', values: { wave: 0, cutoff: 0.6, res: 0.55, envmod: 0.4, decay: 1.2, accent: 0.5 } },
  ],
  // TAPE ECHO
  tp_mmb_tape_echo: [
    { name: 'Slapback', values: { time: 0.11, feedback: 0.15, mix: 0.35, tone: 0.65, wow: 0.15, flutter: 0.15, drive: 0.2 } },
    { name: 'Dub', values: { time: 0.375, feedback: 0.75, mix: 0.45, tone: 0.4, wow: 0.3, flutter: 0.2, drive: 0.4 } },
    { name: 'Versleten band', values: { time: 0.3, feedback: 0.55, mix: 0.4, tone: 0.3, wow: 0.8, flutter: 0.6, drive: 0.5 } },
    { name: 'Lang en helder', values: { time: 0.75, feedback: 0.45, mix: 0.3, tone: 0.8, wow: 0.15, flutter: 0.1, drive: 0.1 } },
    { name: 'Zelfoscillatie', values: { time: 0.25, feedback: 1.05, mix: 0.5, tone: 0.5, wow: 0.4, flutter: 0.3, drive: 0.6 } },
  ],
  // CLOUDS: mode 0 Granular, 1 Stretch, 2 Looping delay, 3 Spectral.
  tp_mmb_clouds: [
    { name: 'Korrelwolk', values: { mode: 0, position: 0.3, size: 0.5, pitch: 0, density: 0.65, texture: 0.6, mix: 0.5, spread: 0.6, feedback: 0.3, reverb: 0.4 } },
    { name: 'Octaaf erboven', values: { mode: 0, position: 0.2, size: 0.6, pitch: 12, density: 0.7, texture: 0.7, mix: 0.4, spread: 0.7, feedback: 0.2, reverb: 0.5 } },
    { name: 'Uitgerekt', values: { mode: 1, position: 0.5, size: 0.7, pitch: 0, density: 0.6, texture: 0.5, mix: 0.6, spread: 0.5, feedback: 0.4, reverb: 0.6 } },
    { name: 'Lusvertraging', values: { mode: 2, position: 0.4, size: 0.5, pitch: 0, density: 0.5, texture: 0.5, mix: 0.4, spread: 0.3, feedback: 0.5, reverb: 0.2 } },
    { name: 'Spectraal', values: { mode: 3, position: 0.5, size: 0.5, pitch: 0, density: 0.5, texture: 0.6, mix: 0.5, spread: 0.5, feedback: 0.3, reverb: 0.4 } },
  ],
  // SID: golfvorm/filter-schakelaars 0 uit, 1 aan; ADSR 0..15 zoals de chip; model 0 6581, 1 8580.
  tp_mmb_sid: [
    { name: 'Pulse-lead', values: { tri: 0, saw: 0, pulse: 1, noise: 0, pw: 0.35, attack: 0, decay: 9, sustain: 10, release: 6, filt: 0 } },
    { name: 'Saw-bas gefilterd', values: { tri: 0, saw: 1, pulse: 0, noise: 0, attack: 0, decay: 8, sustain: 6, release: 4, filt: 1, cutoff: 600, res: 10, lp: 1, bp: 0, hp: 0, coarse: -12 } },
    { name: 'Driehoekfluit', values: { tri: 1, saw: 0, pulse: 0, noise: 0, attack: 5, decay: 6, sustain: 12, release: 9, filt: 0 } },
    { name: 'Sync-schreeuw', values: { tri: 0, saw: 1, pulse: 0, noise: 0, sync: 1, attack: 0, decay: 10, sustain: 12, release: 7, filt: 1, cutoff: 1400, res: 6, lp: 1 } },
    { name: 'Ring-bel', values: { tri: 1, saw: 0, pulse: 0, noise: 0, ring: 1, attack: 0, decay: 11, sustain: 0, release: 11, filt: 0 } },
    { name: 'Ruis-snare', values: { tri: 0, saw: 0, pulse: 0, noise: 1, attack: 0, decay: 7, sustain: 0, release: 7, filt: 1, cutoff: 1500, res: 4, lp: 0, bp: 1, hp: 0 } },
    { name: '8580 pad, 4 SIDs', values: { model: 1, tri: 0, saw: 1, pulse: 0, noise: 0, attack: 9, decay: 9, sustain: 12, release: 11, filt: 1, cutoff: 900, res: 5, lp: 1, chips: 4, spread: 0.9 } },
  ],
  // PLAITS: engine = registratievolgorde Plaits 1.2 (seedModules.ts, PLAITS_ENGINE_NAMES).
  tp_mmb_plaits: [
    { name: 'VA met filter', values: { engine: 0, harmonics: 0.4, timbre: 0.45, morph: 0.5, decay: 0.6, lpg: 0.4 } },
    { name: 'FM-bel', values: { engine: 10, harmonics: 0.55, timbre: 0.4, morph: 0.3, decay: 0.7, lpg: 0.2 } },
    { name: 'Akkoordorgel', values: { engine: 14, harmonics: 0.35, timbre: 0.5, morph: 0.4, decay: 0.8, lpg: 0.5 } },
    { name: 'Gesproken', values: { engine: 15, harmonics: 0.6, timbre: 0.5, morph: 0.4, decay: 0.6, lpg: 0.5 } },
    { name: 'Snaar', values: { engine: 19, harmonics: 0.5, timbre: 0.6, morph: 0.5, decay: 0.7, lpg: 0.3 } },
    { name: 'Modaal (marimba)', values: { engine: 20, harmonics: 0.3, timbre: 0.5, morph: 0.4, decay: 0.5, lpg: 0.3 } },
    { name: 'Bassdrum', values: { engine: 21, harmonics: 0.4, timbre: 0.5, morph: 0.5, coarse: -24 } },
  ],
  // ELEMENTS: exciter (bow/blow/strike) in een resonator; program 0 = standaard.
  tp_mmb_elements: [
    { name: 'Aangeslagen snaar', values: { bow: 0, blow: 0, strike: 0.8, strike_meta: 0.4, strike_timbre: 0.5, geometry: 0.2, brightness: 0.55, damping: 0.3, position: 0.3, space: 0.4 } },
    { name: 'Gestreken', values: { bow: 0.8, blow: 0, strike: 0, bow_timbre: 0.5, envelope: 0.7, geometry: 0.25, brightness: 0.5, damping: 0.6, position: 0.25, space: 0.6 } },
    { name: 'Geblazen fluit', values: { bow: 0, blow: 0.8, strike: 0, blow_meta: 0.6, blow_timbre: 0.4, envelope: 0.6, geometry: 0.1, brightness: 0.45, damping: 0.6, position: 0.5, space: 0.5 } },
    { name: 'Metalen klok', values: { bow: 0, blow: 0, strike: 0.9, strike_meta: 0.7, strike_timbre: 0.7, geometry: 0.75, brightness: 0.7, damping: 0.15, position: 0.4, space: 0.7 } },
    { name: 'Houten blok', values: { bow: 0, blow: 0, strike: 0.9, strike_meta: 0.2, strike_timbre: 0.3, geometry: 0.45, brightness: 0.35, damping: 0.75, position: 0.2, space: 0.2 } },
  ],
  // VCO: wave 0 Sin, 1 Tri, 2 Saw, 3 Sqr.
  tp_mmb_vco: [
    { name: 'Zaagtand', values: { wave: 2, coarse: 0, fine: 0, level: 0.8 } },
    { name: 'Blokgolf', values: { wave: 3, coarse: 0, fine: 0, level: 0.7 } },
    { name: 'Zachte driehoek', values: { wave: 1, coarse: 0, fine: 0, level: 0.85 } },
    { name: 'Zuivere sinus', values: { wave: 0, coarse: 0, fine: 0, level: 0.9 } },
    { name: 'Sub-sinus (−1 oct)', values: { wave: 0, coarse: -12, fine: 0, level: 0.9 } },
  ],
  // VCF: type 0 LP, 1 HP, 2 BP.
  tp_mmb_vcf: [
    { name: 'Warme bas', values: { type: 0, cutoff: 400, q: 1.2 } },
    { name: 'Open laagdoorlaat', values: { type: 0, cutoff: 6000, q: 0.7 } },
    { name: 'Resonante sweep', values: { type: 0, cutoff: 1200, q: 4 } },
    { name: 'Telefoon', values: { type: 2, cutoff: 1500, q: 2.5 } },
    { name: 'Laag weg', values: { type: 1, cutoff: 150, q: 0.7 } },
    { name: 'Dun hoog', values: { type: 1, cutoff: 1800, q: 1.8 } },
  ],
  // LADDER: geen schakelaars (alleen 24 dB lowpass).
  tp_mmb_ladder: [
    { name: 'Moog-bas', values: { cutoff: 350, q: 0.5, drive: 1.5 } },
    { name: 'Rond en open', values: { cutoff: 3000, q: 0.3, drive: 1 } },
    { name: 'Kwakende lead', values: { cutoff: 900, q: 0.95, drive: 1.2 } },
    { name: 'Donker en warm', values: { cutoff: 180, q: 0.2, drive: 2 } },
    { name: 'Vet verzadigd', values: { cutoff: 1500, q: 0.6, drive: 3 } },
  ],
  // MS-20: type 0 LP, 1 HP.
  tp_mmb_ms20: [
    { name: 'Lowpass schoon', values: { type: 0, cutoff: 1500, q: 0.3, drive: 1 } },
    { name: 'Gierende lead', values: { type: 0, cutoff: 1100, q: 0.85, drive: 3 } },
    { name: 'Vuile bas', values: { type: 0, cutoff: 300, q: 0.5, drive: 4 } },
    { name: 'Highpass piek', values: { type: 1, cutoff: 600, q: 0.75, drive: 1.5 } },
    { name: 'Dunne fuzz', values: { type: 1, cutoff: 1200, q: 0.4, drive: 6 } },
  ],
  // STRING (Karplus-Strong): geen schakelaars.
  tp_mmb_string: [
    { name: 'Heldere tokkel', values: { pluck: 0.9, level: 0.8 } },
    { name: 'Nylon', values: { pluck: 0.5, level: 0.85 } },
    { name: 'Gedempte snaar', values: { pluck: 0.15, level: 0.9 } },
    { name: 'Harp', values: { pluck: 0.7, level: 0.8 } },
  ],
  // RINGS: model 0 Modal, 1 Sympath, 2 String, 3 FM, 4 Quant, 5 Str+Rev; polyphony 0 1, 1 2, 2 4.
  tp_mmb_rings: [
    { name: 'Marimba', values: { model: 0, polyphony: 1, structure: 0.25, brightness: 0.45, damping: 0.55, position: 0.3 } },
    { name: 'Klokken', values: { model: 0, polyphony: 2, structure: 0.75, brightness: 0.7, damping: 0.75, position: 0.4 } },
    { name: 'Sitar-klankkast', values: { model: 1, polyphony: 1, structure: 0.5, brightness: 0.6, damping: 0.7, position: 0.2 } },
    { name: 'Getokkelde snaar', values: { model: 2, polyphony: 2, structure: 0.3, brightness: 0.55, damping: 0.5, position: 0.25 } },
    { name: 'FM-gong', values: { model: 3, polyphony: 1, structure: 0.6, brightness: 0.5, damping: 0.8, position: 0.5 } },
    { name: 'Snaar in galm', values: { model: 5, polyphony: 2, structure: 0.4, brightness: 0.5, damping: 0.7, position: 0.35 } },
  ],
  // BEADS: quality 0 Tape+, 1 Tape, 2 Vintage, 3 Digital; pitch 0.5 = unisono, 0.93 = +1 oct, 0.07 = −1 oct.
  tp_mmb_beads: [
    { name: 'Korrelwolk', values: { time: 0.4, size: 0.5, shape: 0.5, pitch: 0.5, density: 0.75, size_amt: 0.2, feedback: 0.2, mix: 0.5, reverb: 0.3, quality: 3 } },
    { name: 'Regelmatige korrels', values: { time: 0.3, size: 0.35, shape: 0.3, pitch: 0.5, density: 0.2, feedback: 0.1, mix: 0.45, reverb: 0.2, quality: 1 } },
    { name: 'Octaaf erboven', values: { time: 0.25, size: 0.55, shape: 0.6, pitch: 0.93, density: 0.7, feedback: 0.25, mix: 0.4, reverb: 0.45, quality: 3 } },
    { name: 'Donkere diepte', values: { time: 0.6, size: 0.7, shape: 0.65, pitch: 0.07, density: 0.7, time_amt: 0.3, feedback: 0.3, mix: 0.45, reverb: 0.5, quality: 0 } },
    { name: 'Bandecho', values: { time: 0.45, size: 1, shape: 0.5, pitch: 0.5, density: 0.5, feedback: 0.5, mix: 0.35, reverb: 0.15, quality: 0 } },
    { name: 'Vintage-delay', values: { time: 0.3, size: 1, shape: 0.5, pitch: 0.5, density: 0.5, feedback: 0.4, mix: 0.3, reverb: 0.25, quality: 2 } },
  ],
  // WARPS: shape (Carrier) 0 Ext, 1 Sin, 2 Tri, 3 Saw, 4 Pls, 5 Nz; algo 0..8 continu
  // (0 xfade, 1 folder, 2 ringmod analoog, 3 ringmod digitaal, 4 XOR, 5 comparator, 6 spectraal, 7 morph, 8 vocoder).
  tp_mmb_warps: [
    { name: 'Analoge ringmod', values: { algo: 2, timbre: 0.5, shape: 0, drive1: 1, drive2: 1, level: 0.8 } },
    { name: 'Ringmod met sinus', values: { algo: 2, timbre: 0.4, shape: 1, drive1: 1, drive2: 1, level: 0.8 } },
    { name: 'Wavefolder', values: { algo: 1, timbre: 0.6, shape: 0, drive1: 1.2, drive2: 1, level: 0.7 } },
    { name: 'Digitale XOR', values: { algo: 4, timbre: 0.5, shape: 0, drive1: 1, drive2: 1, level: 0.6 } },
    { name: 'Spectrale morph', values: { algo: 6.5, timbre: 0.5, shape: 0, drive1: 1, drive2: 1, level: 0.8 } },
    { name: 'Vocoder (zaag)', values: { algo: 8, timbre: 0.6, shape: 3, drive1: 1, drive2: 1.3, level: 0.8 } },
  ],
  // MORPH WT: bank 0 Ana, 1 Voc, 2 Hrm, 3 Dig (4 Usr niet gebruikt); morph 0..7 frames.
  tp_mmb_morph_wt: [
    { name: 'Analoog zacht', values: { bank: 0, morph: 1.5, level: 0.8 } },
    { name: 'Analoog fel', values: { bank: 0, morph: 5, level: 0.75 } },
    { name: 'Stemklinker', values: { bank: 1, morph: 3.5, level: 0.8 } },
    { name: 'Orgelregisters', values: { bank: 2, morph: 4, level: 0.75 } },
    { name: 'Digitaal glas', values: { bank: 3, morph: 2.5, level: 0.7 } },
    { name: 'Digitaal ruw', values: { bank: 3, morph: 6.5, level: 0.65 } },
  ],
  // PEAKS: drum 0 Kick, 1 Snare, 2 Hat, 3 FM.
  tp_mmb_peaks: [
    { name: '808-kick', values: { drum: 0, tone: 0.4, decay: 0.6, snap: 0.4, level: 0.85 } },
    { name: 'Punchy kick', values: { drum: 0, tone: 0.55, decay: 0.35, snap: 0.8, level: 0.85 } },
    { name: 'Snare', values: { drum: 1, tone: 0.5, decay: 0.45, snap: 0.6, level: 0.8 } },
    { name: 'Gesloten hihat', values: { drum: 2, tone: 0.6, decay: 0.15, snap: 0.5, level: 0.7 } },
    { name: 'Open hihat', values: { drum: 2, tone: 0.55, decay: 0.6, snap: 0.5, level: 0.65 } },
    { name: 'FM-tom', values: { drum: 3, tone: 0.4, decay: 0.5, snap: 0.35, level: 0.8 } },
  ],
  // RESONATOR: scale 0 Chrom, 1 Maj, 2 Min, 3 5th, 4 Harm.
  tp_mmb_resonator: [
    { name: 'Sitar-klankkast', values: { scale: 3, structure: 0.15, decay: 0.75, damping: 0.65, mix: 0.45 } },
    { name: 'Pianosnaren', values: { scale: 1, structure: 0.2, decay: 0.8, damping: 0.4, mix: 0.35 } },
    { name: 'Mol-galm', values: { scale: 2, structure: 0.35, decay: 0.85, damping: 0.5, mix: 0.4 } },
    { name: 'Harmonisch koor', values: { scale: 4, structure: 0.6, decay: 0.7, damping: 0.55, mix: 0.5 } },
    { name: 'Chromatisch metaal', values: { scale: 0, structure: 0.4, decay: 0.6, damping: 0.75, mix: 0.3 } },
  ],
  // CR-78: drum 0 Kick, 1 Snare, 2 Rim, 3 Claves, 4 Cowbell, 5 HiHat, 6 Cymbal, 7 Maracas, 8 Guiro, 9 Bongo, 10 Conga, 11 Tamb.
  tp_mmb_cr78: [
    { name: 'Kick', values: { drum: 0, tone: 0.45, decay: 0.55, bend: 0.5, level: 0.85 } },
    { name: 'Snare', values: { drum: 1, tone: 0.5, decay: 0.45, bend: 0.4, level: 0.8 } },
    { name: 'Rimshot', values: { drum: 2, tone: 0.55, decay: 0.3, bend: 0.3, level: 0.75 } },
    { name: 'Koebel', values: { drum: 4, tone: 0.5, decay: 0.4, bend: 0.2, level: 0.65 } },
    { name: 'Hihat', values: { drum: 5, tone: 0.6, decay: 0.25, bend: 0.5, level: 0.7 } },
    { name: 'Conga', values: { drum: 10, tone: 0.5, decay: 0.5, bend: 0.6, level: 0.8 } },
  ],
  // ELEMENTS REVERB: geen schakelaars (Dattorro-plaat).
  tp_mmb_elements_reverb: [
    { name: 'Korte plaat', values: { amount: 0.25, time: 0.3, diffusion: 0.6, lp: 0.75 } },
    { name: 'Vocal plate', values: { amount: 0.3, time: 0.55, diffusion: 0.7, lp: 0.65 } },
    { name: 'Donkere kamer', values: { amount: 0.3, time: 0.45, diffusion: 0.5, lp: 0.35 } },
    { name: 'Lange staart', values: { amount: 0.4, time: 0.85, diffusion: 0.75, lp: 0.6 } },
    { name: 'Ambient-zee', values: { amount: 0.55, time: 0.95, diffusion: 0.8, lp: 0.5 } },
  ],
  // COMP: geen schakelaars.
  tp_mmb_comp: [
    { name: 'Zacht lijmen', values: { threshold: -12, ratio: 2, attack: 30, release: 200, makeup: 3, drive: 0 } },
    { name: 'Vocal', values: { threshold: -20, ratio: 4, attack: 8, release: 120, makeup: 6, drive: 0.1 } },
    { name: 'Drumbus punch', values: { threshold: -18, ratio: 4, attack: 25, release: 80, makeup: 5, drive: 0.25 } },
    { name: 'Bas strak', values: { threshold: -22, ratio: 6, attack: 5, release: 150, makeup: 7, drive: 0.2 } },
    { name: 'Pletten', values: { threshold: -32, ratio: 12, attack: 1, release: 60, makeup: 12, drive: 0.4 } },
    { name: 'Begrenzer', values: { threshold: -6, ratio: 20, attack: 0.5, release: 100, makeup: 2, drive: 0 } },
  ],
  // NOISE: color 0 white, 1 pink, 2 brown.
  tp_mmb_noise: [
    { name: 'Wit', values: { color: 0, level: 0.5 } },
    { name: 'Roze', values: { color: 1, level: 0.6 } },
    { name: 'Bruin (rommel)', values: { color: 2, level: 0.7 } },
    { name: 'Zacht wit', values: { color: 0, level: 0.2 } },
  ],
  // ECHO: geen schakelaars (Sync blijft uit).
  tp_mmb_echo: [
    { name: 'Slapback', values: { time: 0.1, feedback: 0.1, mix: 0.3 } },
    { name: 'Dubbeling', values: { time: 0.03, feedback: 0, mix: 0.4 } },
    { name: 'Ritmisch', values: { time: 0.33, feedback: 0.45, mix: 0.3 } },
    { name: 'Lange staart', values: { time: 0.5, feedback: 0.7, mix: 0.35 } },
    { name: 'Metaalveer', values: { time: 0.015, feedback: 0.8, mix: 0.25 } },
  ],
  // STEREO TAPE ECHO: geen schakelaars; ratio = tijd R als factor van L.
  tp_mmb_stereo_tape_echo: [
    { name: 'Slapback', values: { time: 0.11, ratio: 1, feedback: 0.1, cross: 0, mix: 0.3, tone: 0.65, wow: 0.15, flutter: 0.2, drive: 0.3 } },
    { name: 'Ping-pong', values: { time: 0.375, ratio: 1, feedback: 0, cross: 0.85, mix: 0.35, tone: 0.55, wow: 0.2, flutter: 0.15, drive: 0.25 } },
    { name: 'Gepunteerd', values: { time: 0.4, ratio: 0.75, feedback: 0.45, cross: 0.2, mix: 0.3, tone: 0.6, wow: 0.2, flutter: 0.15, drive: 0.3 } },
    { name: 'Dub-wolk', values: { time: 0.5, ratio: 1.5, feedback: 0.75, cross: 0.45, mix: 0.45, tone: 0.35, wow: 0.35, flutter: 0.25, drive: 0.55 } },
    { name: 'Versleten band', values: { time: 0.3, ratio: 1, feedback: 0.5, cross: 0.3, mix: 0.4, tone: 0.3, wow: 0.8, flutter: 0.6, drive: 0.6 } },
    { name: 'Zelfoscillatie', values: { time: 0.25, ratio: 1.5, feedback: 1.02, cross: 0.4, mix: 0.4, tone: 0.45, wow: 0.3, flutter: 0.2, drive: 0.7 } },
  ],
  // DIGITAL ECHO: geen schakelaars; bits 6–16, band = bandbreedte in Hz.
  tp_mmb_digital_echo: [
    { name: 'Schone 80s-delay', values: { time: 0.375, ratio: 1, feedback: 0.4, cross: 0, mod_rate: 0.8, mod_depth: 0.05, bits: 16, band: 14000, mix: 0.3 } },
    { name: 'Rack-echo (12 bit)', values: { time: 0.3, ratio: 1, feedback: 0.45, cross: 0.15, mod_rate: 0.8, mod_depth: 0.2, bits: 12, band: 8000, mix: 0.35 } },
    { name: 'Chorus-echo', values: { time: 0.25, ratio: 1.5, feedback: 0.35, cross: 0.2, mod_rate: 1.2, mod_depth: 0.6, bits: 12, band: 10000, mix: 0.35 } },
    { name: 'Breed stereo', values: { time: 0.02, ratio: 1.5, feedback: 0, cross: 0, mod_rate: 0.5, mod_depth: 0.3, bits: 14, band: 12000, mix: 0.4 } },
    { name: 'Krakerig (8 bit)', values: { time: 0.45, ratio: 0.75, feedback: 0.55, cross: 0.3, mod_rate: 0.4, mod_depth: 0.15, bits: 8, band: 4000, mix: 0.35 } },
    { name: 'Ping-pong', values: { time: 0.333, ratio: 1, feedback: 0, cross: 0.85, mod_rate: 0.6, mod_depth: 0.1, bits: 12, band: 9000, mix: 0.35 } },
  ],
  // BBD CHORUS: geen schakelaars; delay 2–6 ms flanger, 8–20 chorus, 20+ doubling.
  tp_mmb_bbd_chorus: [
    { name: 'Juno-chorus I', values: { rate: 0.5, depth: 0.5, delay: 8, feedback: 0, mix: 0.5, spread: 1, age: 0.3, tone: 0.6 } },
    { name: 'Juno-chorus II', values: { rate: 0.85, depth: 0.65, delay: 7, feedback: 0, mix: 0.5, spread: 1, age: 0.3, tone: 0.6 } },
    { name: 'Dimension', values: { rate: 0.25, depth: 0.3, delay: 12, feedback: 0, mix: 0.45, spread: 1, age: 0.15, tone: 0.75 } },
    { name: 'Jetflanger', values: { rate: 0.15, depth: 0.8, delay: 2.5, feedback: 0.7, mix: 0.5, spread: 0.5, age: 0.2, tone: 0.8 } },
    { name: 'Negatieve flanger', values: { rate: 0.3, depth: 0.7, delay: 3, feedback: -0.65, mix: 0.5, spread: 0.3, age: 0.2, tone: 0.75 } },
    { name: 'Dubbeling', values: { rate: 0.1, depth: 0.2, delay: 28, feedback: 0, mix: 0.4, spread: 1, age: 0.1, tone: 0.8 } },
  ],
  // RINGMOD: wave 0 Sin, 1 Tri, 2 Sqr; mode 0 Clean, 1 Diode.
  tp_mmb_ringmod: [
    { name: 'Klokken', values: { freq: 440, wave: 0, mode: 0, mix: 0.8 } },
    { name: 'Robotstem', values: { freq: 60, wave: 0, mode: 0, mix: 1 } },
    { name: 'Tremolo-ring', values: { freq: 6, wave: 0, mode: 0, mix: 0.6 } },
    { name: 'Metaal (diode)', values: { freq: 1250, wave: 1, mode: 1, bias: 0.4, mix: 0.7 } },
    { name: 'Gemene blok', values: { freq: 220, wave: 2, mode: 1, bias: 0.6, mix: 0.6 } },
    { name: 'Zachte diode', values: { freq: 330, wave: 0, mode: 1, bias: 0.2, mix: 0.4 } },
  ],
  // OCTAVER: geen schakelaars.
  tp_mmb_octaver: [
    { name: 'OC-2 klassiek', values: { oct1: 0.7, oct2: 0, up: 0, dry: 1, tone: 0.5 } },
    { name: 'Synth-bas', values: { oct1: 0.8, oct2: 0.5, up: 0, dry: 0.4, tone: 0.3 } },
    { name: 'Sub erbij', values: { oct1: 0, oct2: 0.6, up: 0, dry: 1, tone: 0.2 } },
    { name: 'Octavia', values: { oct1: 0, oct2: 0, up: 0.8, dry: 0.6, tone: 0.7 } },
    { name: 'Alles open', values: { oct1: 0.6, oct2: 0.4, up: 0.5, dry: 0.7, tone: 0.6 } },
  ],
  // HARMONIZER: algo 0 Heads, 1 Grains.
  tp_mmb_harmonizer: [
    { name: 'Octaaf erbij', values: { semi_a: 12, cent_a: 0, lvl_a: 0.8, semi_b: 0, lvl_b: 0, window: 30, feedback: 0, spread: 0.5, algo: 0, jitter: 0.1, mix: 0.4 } },
    { name: 'Stemverdikker', values: { semi_a: 0, cent_a: -9, lvl_a: 1, semi_b: 0, cent_b: 9, lvl_b: 1, window: 30, feedback: 0, spread: 1, algo: 0, jitter: 0.2, mix: 0.4 } },
    { name: 'Kwint en octaaf', values: { semi_a: 7, lvl_a: 0.8, semi_b: 12, lvl_b: 0.6, window: 40, feedback: 0, spread: 0.7, algo: 0, jitter: 0.15, mix: 0.45 } },
    { name: 'Octaaf omlaag', values: { semi_a: -12, lvl_a: 1, semi_b: 0, lvl_b: 0, window: 60, feedback: 0, spread: 0, algo: 0, jitter: 0.1, mix: 0.5 } },
    { name: 'Glinster', values: { semi_a: 12, lvl_a: 0.8, semi_b: 19, lvl_b: 0.5, window: 80, feedback: 0.5, spread: 0.8, algo: 1, jitter: 0.4, mix: 0.35 } },
    { name: 'Korrelwolk', values: { semi_a: 5, cent_a: 10, lvl_a: 0.7, semi_b: -7, cent_b: -10, lvl_b: 0.7, window: 100, feedback: 0.3, spread: 1, algo: 1, jitter: 0.8, mix: 0.5 } },
  ],
  // CONV: ir (knop) 0 Hall, 1 Room, 2 Chamber, 3 Plate, 4 Church, 5 Small.
  tp_mmb_conv: [
    { name: 'Kleine ruimte', values: { ir: 5, size: 1, length: 1, predelay: 0, locut: 80, hicut: 12000, width: 0.8, mix: 0.2 } },
    { name: 'Drumkamer', values: { ir: 1, size: 0.9, length: 1.2, predelay: 5, locut: 120, hicut: 10000, width: 1, mix: 0.25 } },
    { name: 'Zangplaat', values: { ir: 3, size: 1, length: 2.5, predelay: 30, locut: 150, hicut: 9000, width: 1, mix: 0.25 } },
    { name: 'Kamergalm', values: { ir: 2, size: 1, length: 2, predelay: 15, locut: 100, hicut: 11000, width: 1, mix: 0.3 } },
    { name: 'Concertzaal', values: { ir: 0, size: 1.2, length: 4, predelay: 25, locut: 60, hicut: 8000, width: 1, mix: 0.3 } },
    { name: 'Kerk', values: { ir: 4, size: 1.3, length: 4, predelay: 40, locut: 80, hicut: 7000, width: 1, mix: 0.35 } },
  ],
  // TREMOLO: mode 0 Amp, 1 Opto, 2 Harm, 3 Pan; wave 0 Sin, 1 Tri, 2 Sqr.
  tp_mmb_tremolo: [
    { name: 'Buizenversterker', values: { rate: 5, depth: 0.5, mode: 0, wave: 0, shape: 0, level: 1.1 } },
    { name: 'Blackface', values: { rate: 6, depth: 0.7, mode: 1, wave: 1, shape: 0.2, level: 1.15 } },
    { name: 'Brownface', values: { rate: 4, depth: 0.7, mode: 2, wave: 0, shape: 0, level: 1 } },
    { name: 'Hakselaar', values: { rate: 8, depth: 0.95, mode: 0, wave: 2, shape: 1, level: 1.3 } },
    { name: 'Autopan', values: { rate: 0.5, depth: 0.8, mode: 3, wave: 0, shape: 0, level: 1 } },
    { name: 'Trage golf', values: { rate: 1.5, depth: 0.4, mode: 1, wave: 0, shape: 0, level: 1.05 } },
  ],
  // STEREO PHASER: geen schakelaars; spread 0 mono, 0.5 kwartslag, 1 tegenfase.
  tp_mmb_stereo_phaser: [
    { name: 'Zachte zwaai', values: { rate: 0.3, depth: 0.6, feedback: 0.2, spread: 0.5, mix: 0.5 } },
    { name: 'Small Stone', values: { rate: 0.6, depth: 0.8, feedback: 0.65, spread: 0.25, mix: 0.5 } },
    { name: 'Breed draaiend', values: { rate: 0.15, depth: 0.9, feedback: 0.4, spread: 1, mix: 0.5 } },
    { name: 'Snel borrelen', values: { rate: 4, depth: 0.5, feedback: 0.5, spread: 0.5, mix: 0.45 } },
    { name: 'Resonant', values: { rate: 0.25, depth: 1, feedback: 0.85, spread: 0.5, mix: 0.5 } },
  ],
  // VIBE: mode 0 Chorus, 1 Vibrato, 2 Light.
  tp_mmb_vibe: [
    { name: 'Klassieke vibe', values: { speed: 2, intensity: 0.6, mode: 0, lamp_age: 0.7, volume: 1 } },
    { name: 'Machine Gun', values: { speed: 1.2, intensity: 0.75, mode: 0, lamp_age: 0.85, volume: 1 } },
    { name: 'Snel kloppen', values: { speed: 6, intensity: 0.5, mode: 0, lamp_age: 0.6, volume: 1 } },
    { name: 'Vibrato', values: { speed: 5, intensity: 0.5, mode: 1, lamp_age: 0.7, volume: 1 } },
    { name: 'Zuivere vibrato', values: { speed: 5.5, intensity: 0.35, mode: 2, lamp_age: 0, volume: 1 } },
    { name: 'Langzaam ademen', values: { speed: 0.5, intensity: 0.8, mode: 0, lamp_age: 1, volume: 1 } },
  ],
  // SHIMMER: interval 0 +12, 1 +7, 2 +19, 3 +24, 4 −12.
  tp_mmb_shimmer: [
    { name: 'Octaafglans', values: { shimmer: 0.5, interval: 0, size: 0.75, damp: 0.35, tone: 0.6, predelay: 20, mod: 0.4, mix: 0.35 } },
    { name: 'Subtiel', values: { shimmer: 0.25, interval: 0, size: 0.6, damp: 0.4, tone: 0.5, predelay: 15, mod: 0.3, mix: 0.25 } },
    { name: 'Kwintenwolk', values: { shimmer: 0.55, interval: 1, size: 0.8, damp: 0.35, tone: 0.55, predelay: 30, mod: 0.5, mix: 0.4 } },
    { name: 'Hemelkoor', values: { shimmer: 0.7, interval: 2, size: 0.9, damp: 0.3, tone: 0.5, predelay: 40, mod: 0.6, mix: 0.45 } },
    { name: 'Ijskristal', values: { shimmer: 0.6, interval: 3, size: 0.85, damp: 0.25, tone: 0.7, predelay: 25, mod: 0.4, mix: 0.35 } },
    { name: 'Diepte', values: { shimmer: 0.5, interval: 4, size: 0.85, damp: 0.5, tone: 0.4, predelay: 20, mod: 0.5, mix: 0.4 } },
  ],
  // FET COMP: ratio 0 4:1, 1 8:1, 2 12:1, 3 20:1, 4 All; attack/release 1–7 (7 = snelst).
  tp_mmb_fet_comp: [
    { name: 'Zang', values: { input: 12, output: -6, attack: 3, release: 5, ratio: 0, color: 1, mix: 1 } },
    { name: 'Bas strak', values: { input: 10, output: -5, attack: 3, release: 4, ratio: 0, color: 0.8, mix: 1 } },
    { name: 'Snaredrum', values: { input: 14, output: -7, attack: 2, release: 6, ratio: 1, color: 1.2, mix: 1 } },
    { name: 'Room-mics (All)', values: { input: 18, output: -10, attack: 6, release: 7, ratio: 4, color: 1.5, mix: 1 } },
    { name: 'NY parallel', values: { input: 20, output: -8, attack: 5, release: 6, ratio: 4, color: 1.2, mix: 0.35 } },
    { name: 'Limiter', values: { input: 8, output: -2, attack: 6, release: 5, ratio: 3, color: 0.5, mix: 1 } },
  ],
  // OPTO COMP: mode 0 Comp, 1 Limit; peak = drempel 0 (0 dB) … 100 (−45 dBFS).
  tp_mmb_opto_comp: [
    { name: 'Zang', values: { peak: 45, gain: 6, mode: 0, color: 1, mix: 1 } },
    { name: 'Bas', values: { peak: 50, gain: 6, mode: 1, color: 1.2, mix: 1 } },
    { name: 'Zacht egaliseren', values: { peak: 30, gain: 3, mode: 0, color: 0.8, mix: 1 } },
    { name: 'Akoestisch', values: { peak: 40, gain: 4, mode: 0, color: 0.6, mix: 0.8 } },
    { name: 'Warm en dik', values: { peak: 60, gain: 8, mode: 1, color: 1.8, mix: 1 } },
  ],
  // BUS COMP: ratio 0 2:1, 1 4:1, 2 10:1; attack 0 0.1, 1 0.3, 2 1, 3 3, 4 10, 5 30 ms;
  // release 0 0.1, 1 0.3, 2 0.6, 3 1.2 s, 4 Auto; sc_hpf 0 Uit, 1 60, 2 100, 3 150 Hz.
  tp_mmb_bus_comp: [
    { name: 'Mixbus-lijm', values: { threshold: -16, makeup: 2, ratio: 0, attack: 5, release: 4, sc_hpf: 1, mix: 1 } },
    { name: 'Drumbus', values: { threshold: -20, makeup: 4, ratio: 1, attack: 4, release: 1, sc_hpf: 0, mix: 1 } },
    { name: 'Drums plat (parallel)', values: { threshold: -30, makeup: 8, ratio: 2, attack: 0, release: 1, sc_hpf: 0, mix: 0.4 } },
    { name: 'Pompend', values: { threshold: -26, makeup: 6, ratio: 1, attack: 3, release: 0, sc_hpf: 0, mix: 1 } },
    { name: 'Mastering zacht', values: { threshold: -10, makeup: 1, ratio: 0, attack: 5, release: 4, sc_hpf: 2, mix: 1 } },
    { name: 'Synthbus', values: { threshold: -18, makeup: 3, ratio: 1, attack: 3, release: 2, sc_hpf: 3, mix: 1 } },
  ],
  // VARI-MU: time 0–5 = stand 1–6 (4/5 = programma-afhankelijk); mode 0 LR, 1 M/S.
  tp_mmb_varimu_comp: [
    { name: 'Mixbus-warmte', values: { input: 0, threshold: -14, output: 1, time: 3, mode: 0, color: 1, mix: 1 } },
    { name: 'Mastering M/S', values: { input: 0, threshold: -10, output: 1, time: 4, mode: 1, color: 0.6, mix: 1 } },
    { name: 'Zang', values: { input: 3, threshold: -20, output: 3, time: 1, mode: 0, color: 1, mix: 1 } },
    { name: 'Drums dik', values: { input: 6, threshold: -24, output: 2, time: 0, mode: 0, color: 1.6, mix: 0.6 } },
    { name: 'Bas', values: { input: 3, threshold: -18, output: 2, time: 2, mode: 0, color: 1.2, mix: 1 } },
    { name: 'Langzame lijm', values: { input: 0, threshold: -16, output: 1, time: 5, mode: 0, color: 0.8, mix: 1 } },
  ],
  // PROGRAM EQ: low_freq 0 20, 1 30, 2 60, 3 100 Hz; high_freq 0 3, 1 4, 2 5, 3 8, 4 10, 5 12, 6 16 kHz; atten_freq 0 5, 1 10, 2 20 kHz.
  tp_mmb_program_eq: [
    { name: 'Pultec-bas', values: { low_freq: 2, low_boost: 7, low_atten: 5, high_freq: 4, high_boost: 0, bandwidth: 5, atten_freq: 1, high_atten: 0, color: 1, output: -2 } },
    { name: 'Kick vol', values: { low_freq: 1, low_boost: 8, low_atten: 6, high_freq: 2, high_boost: 3, bandwidth: 3, atten_freq: 2, high_atten: 0, color: 1.2, output: -3 } },
    { name: 'Zang lucht', values: { low_freq: 3, low_boost: 0, low_atten: 2, high_freq: 5, high_boost: 5, bandwidth: 7, atten_freq: 2, high_atten: 1, color: 0.8, output: -1.5 } },
    { name: 'Glans bovenin', values: { low_freq: 2, low_boost: 0, low_atten: 0, high_freq: 6, high_boost: 6, bandwidth: 8, atten_freq: 2, high_atten: 0, color: 1, output: -2 } },
    { name: 'Warm en donker', values: { low_freq: 3, low_boost: 4, low_atten: 0, high_freq: 3, high_boost: 0, bandwidth: 5, atten_freq: 0, high_atten: 5, color: 1.6, output: -1.5 } },
    { name: 'Mixbus-lijm', values: { low_freq: 1, low_boost: 3, low_atten: 2, high_freq: 4, high_boost: 2, bandwidth: 8, atten_freq: 2, high_atten: 1, color: 1.2, output: -1 } },
  ],
  // DIODE COMP: ratio 0 1.5, 1 2, 2 3, 3 4, 4 6; attack 0 Fast, 1 Slow; release 0 0.1, 1 0.4, 2 0.8, 3 1.5 s, 4 A1, 5 A2.
  tp_mmb_diode_comp: [
    { name: 'Busgloed', values: { threshold: -14, ratio: 0, attack: 1, release: 4, makeup: 2, color: 0.8, mix: 1 } },
    { name: 'Zang strak', values: { threshold: -24, ratio: 2, attack: 0, release: 4, makeup: 6, color: 1, mix: 1 } },
    { name: 'Bas vast', values: { threshold: -22, ratio: 3, attack: 1, release: 1, makeup: 6, color: 1.2, mix: 1 } },
    { name: 'Drums dik', values: { threshold: -30, ratio: 4, attack: 1, release: 0, makeup: 9, color: 1.6, mix: 0.6 } },
    { name: 'Parallel plet', values: { threshold: -40, ratio: 4, attack: 0, release: 1, makeup: 14, color: 2, mix: 0.35 } },
    { name: 'Zachte leveller', values: { threshold: -18, ratio: 1, attack: 1, release: 5, makeup: 3, color: 0.5, mix: 1 } },
  ],
  // CONSOLE EQ: hpf 0 Uit, 1 50, 2 80, 3 160, 4 300 Hz; mid_freq 0 360, 1 700, 2 1.6k, 3 3.2k, 4 4.8k, 5 7.2k; low_freq 0 35, 1 60, 2 110, 3 220 Hz.
  tp_mmb_console_eq: [
    { name: 'Zang helder', values: { hpf: 2, low_freq: 2, low_gain: -2, mid_freq: 3, mid_gain: 4, high_gain: 4, color: 1, output: -2 } },
    { name: 'Bas strak', values: { hpf: 1, low_freq: 1, low_gain: 5, mid_freq: 1, mid_gain: 3, high_gain: -2, color: 1.2, output: -3 } },
    { name: 'Kick punch', values: { hpf: 0, low_freq: 1, low_gain: 6, mid_freq: 0, mid_gain: -5, high_gain: 3, color: 1.2, output: -3 } },
    { name: 'Snaredrum crack', values: { hpf: 2, low_freq: 3, low_gain: 3, mid_freq: 4, mid_gain: 4, high_gain: 2, color: 1.4, output: -3 } },
    { name: 'Gitaar door de mix', values: { hpf: 3, low_freq: 2, low_gain: -3, mid_freq: 2, mid_gain: 3, high_gain: 2, color: 1.3, output: -1 } },
    { name: 'Overheads zilver', values: { hpf: 3, low_freq: 2, low_gain: 0, mid_freq: 0, mid_gain: -3, high_gain: 5, color: 0.8, output: -1.5 } },
  ],
  // PARA EQ: lf_shelf/hf_shelf 0 Bell, 1 Shelf; prop_q 0 Uit, 1 Aan.
  tp_mmb_para_eq: [
    { name: 'Zang helder', values: { hpf: 90, lf_freq: 200, lf_gain: -2, lf_shelf: 1, lmf_freq: 350, lmf_gain: -3, lmf_q: 1.4, hmf_freq: 3200, hmf_gain: 3, hmf_q: 1, hf_freq: 12000, hf_gain: 3, hf_shelf: 1, output: -1 } },
    { name: 'Bas strak', values: { hpf: 35, lf_freq: 80, lf_gain: 3, lf_shelf: 0, lmf_freq: 250, lmf_gain: -4, lmf_q: 1.5, hmf_freq: 900, hmf_gain: 3, hmf_q: 1.2, hf_freq: 6000, hf_gain: -3, hf_shelf: 1, output: -1.5 } },
    { name: 'Kick klik', values: { hpf: 30, lf_freq: 60, lf_gain: 5, lf_shelf: 0, lmf_freq: 400, lmf_gain: -6, lmf_q: 2, hmf_freq: 4000, hmf_gain: 4, hmf_q: 1.5, hf_freq: 10000, hf_gain: 0, hf_shelf: 1, output: -3 } },
    { name: 'Modder eruit', values: { hpf: 60, lf_freq: 100, lf_gain: 0, lf_shelf: 1, lmf_freq: 300, lmf_gain: -5, lmf_q: 1, hmf_freq: 2500, hmf_gain: 0, hmf_q: 1, hf_freq: 8000, hf_gain: 0, hf_shelf: 1 } },
    { name: 'Smile (API)', values: { hpf: 25, lf_freq: 90, lf_gain: 4, lf_shelf: 1, lmf_freq: 500, lmf_gain: -2, lmf_q: 0.8, hmf_freq: 3000, hmf_gain: 2, hmf_q: 1, hf_freq: 10000, hf_gain: 4, hf_shelf: 1, prop_q: 1, output: -3 } },
    { name: 'Telefoon', values: { hpf: 300, lf_freq: 450, lf_gain: 0, lf_shelf: 1, lmf_freq: 1000, lmf_gain: 6, lmf_q: 1.2, hmf_freq: 2500, hmf_gain: 3, hmf_q: 1, hf_freq: 8000, hf_gain: 0, hf_shelf: 1, lpf: 3500, output: -3 } },
  ],
  // SID 3-OSC: golfvorm/ring/sync/filt 0 Uit, 1 Aan; stack 0 Split, 1 Stack; lp/bp/hp 0 Uit, 1 Aan; model 0 6581, 1 8580. ADSR 0..15 registerwaarden.
  tp_mmb_sid3: [
    { name: 'Dikke lead', values: { stack: 1, tri_1: 0, saw_1: 0, pulse_1: 1, noise_1: 0, pw_1: 0.4, saw_2: 1, pulse_2: 0, tri_2: 0, noise_2: 0, coarse_2: 0, fine_2: 10, tri_3: 0, saw_3: 1, pulse_3: 0, noise_3: 0, coarse_3: -12, fine_3: -6, attack_1: 0, decay_1: 9, sustain_1: 11, release_1: 7, attack_2: 0, decay_2: 9, sustain_2: 11, release_2: 7, attack_3: 0, decay_3: 9, sustain_3: 11, release_3: 7, filt_1: 0, filt_2: 0, filt_3: 0 } },
    { name: 'Gefilterde bas', values: { stack: 1, tri_1: 0, saw_1: 1, pulse_1: 0, noise_1: 0, coarse_1: -12, fine_1: 0, tri_2: 0, saw_2: 0, pulse_2: 1, noise_2: 0, pw_2: 0.3, coarse_2: -12, fine_2: 6, tri_3: 1, saw_3: 0, pulse_3: 0, noise_3: 0, coarse_3: -24, fine_3: 0, attack_1: 0, decay_1: 8, sustain_1: 6, release_1: 4, attack_2: 0, decay_2: 8, sustain_2: 6, release_2: 4, attack_3: 0, decay_3: 8, sustain_3: 8, release_3: 4, filt_1: 1, filt_2: 1, filt_3: 0, cutoff: 500, res: 10, lp: 1, bp: 0, hp: 0 } },
    { name: 'Sync-schreeuw', values: { stack: 1, tri_1: 1, saw_1: 0, pulse_1: 0, noise_1: 0, coarse_1: 0, tri_2: 0, saw_2: 1, pulse_2: 0, noise_2: 0, sync_2: 1, coarse_2: 7, fine_2: 0, tri_3: 0, saw_3: 0, pulse_3: 0, noise_3: 0, attack_1: 0, decay_1: 10, sustain_1: 0, release_1: 6, attack_2: 0, decay_2: 10, sustain_2: 12, release_2: 7, filt_1: 0, filt_2: 1, filt_3: 0, cutoff: 1300, res: 6, lp: 1, bp: 1, hp: 0 } },
    { name: 'Ringbel', values: { stack: 1, tri_1: 1, saw_1: 0, pulse_1: 0, noise_1: 0, ring_1: 1, coarse_1: 0, tri_2: 1, saw_2: 0, pulse_2: 0, noise_2: 0, coarse_2: 0, fine_2: 0, tri_3: 1, saw_3: 0, pulse_3: 0, noise_3: 0, coarse_3: 19, fine_3: 0, attack_1: 0, decay_1: 11, sustain_1: 0, release_1: 11, attack_2: 0, decay_2: 10, sustain_2: 0, release_2: 10, attack_3: 0, decay_3: 2, sustain_3: 0, release_3: 2, filt_1: 0, filt_2: 0, filt_3: 0 } },
    { name: 'Akkoordpad', values: { stack: 1, tri_1: 0, saw_1: 1, pulse_1: 0, noise_1: 0, coarse_1: 0, tri_2: 0, saw_2: 1, pulse_2: 0, noise_2: 0, coarse_2: 7, fine_2: 0, tri_3: 0, saw_3: 1, pulse_3: 0, noise_3: 0, coarse_3: 12, fine_3: 0, attack_1: 9, decay_1: 9, sustain_1: 12, release_1: 10, attack_2: 9, decay_2: 9, sustain_2: 12, release_2: 10, attack_3: 9, decay_3: 9, sustain_3: 12, release_3: 10, filt_1: 1, filt_2: 1, filt_3: 1, cutoff: 800, res: 5, lp: 1, bp: 0, hp: 0, model: 1, combo: 4, level: 0.7 } },
    { name: 'Chiptune-drum', values: { stack: 1, tri_1: 0, saw_1: 0, pulse_1: 0, noise_1: 1, coarse_1: 0, tri_2: 0, saw_2: 0, pulse_2: 1, noise_2: 0, pw_2: 0.5, coarse_2: -12, fine_2: 0, tri_3: 1, saw_3: 0, pulse_3: 0, noise_3: 0, coarse_3: -24, fine_3: 0, attack_1: 0, decay_1: 6, sustain_1: 0, release_1: 6, attack_2: 0, decay_2: 4, sustain_2: 0, release_2: 4, attack_3: 0, decay_3: 7, sustain_3: 0, release_3: 7, filt_1: 1, filt_2: 0, filt_3: 0, cutoff: 1500, res: 4, lp: 0, bp: 1, hp: 0 } },
  ],
  // PHASER: geen schakelaars (rate Hz, depth, feedback, mix).
  tp_mmb_phaser: [
    { name: 'Langzame zwaai', values: { rate: 0.2, depth: 0.7, feedback: 0.3, mix: 0.5 } },
    { name: 'Klassiek 70s', values: { rate: 0.5, depth: 0.8, feedback: 0.5, mix: 0.5 } },
    { name: 'Funkgitaar', values: { rate: 1.2, depth: 0.6, feedback: 0.6, mix: 0.5 } },
    { name: 'Jet-straal', values: { rate: 0.12, depth: 1, feedback: 0.85, mix: 0.5 } },
    { name: 'Snelle wobbel', values: { rate: 5, depth: 0.5, feedback: 0.4, mix: 0.45 } },
    { name: 'Subtiel breed', values: { rate: 0.3, depth: 0.4, feedback: 0.15, mix: 0.3 } },
  ],
  // FM-VCO: wave 0 Sin, 1 Tri, 2 Saw, 3 Sqr. FM werkt met een signaal op de FM-ingang (sidechain).
  tp_mmb_fm_vco: [
    { name: 'Zuivere sinus', values: { wave: 0, coarse: 0, fine: 0, fm_amt: 1, level: 0.8 } },
    { name: 'FM-bel', values: { wave: 0, coarse: 12, fine: 0, fm_amt: 1.5, level: 0.7 } },
    { name: 'Diepe FM-bas', values: { wave: 0, coarse: -24, fine: 0, fm_amt: 0.6, level: 0.85 } },
    { name: 'Driehoek zacht', values: { wave: 1, coarse: 0, fine: 0, fm_amt: 0.3, level: 0.8 } },
    { name: 'Zaag metaal', values: { wave: 2, coarse: 0, fine: 0, fm_amt: 2.5, level: 0.6 } },
    { name: 'Blokgolf grom', values: { wave: 3, coarse: -12, fine: 0, fm_amt: 0.8, level: 0.6 } },
  ],
  // COMB: geen schakelaars (Tune = semitonen rond C4, feedback, mix).
  tp_mmb_comb: [
    { name: 'Lichte kleur', values: { coarse: 0, feedback: 0.5, mix: 0.3 } },
    { name: 'Flanger-buis', values: { coarse: 12, feedback: 0.7, mix: 0.5 } },
    { name: 'Gestemde snaar', values: { coarse: 0, feedback: 0.95, mix: 0.6 } },
    { name: 'Lage resonator', values: { coarse: -24, feedback: 0.92, mix: 0.5 } },
    { name: 'Metalen buis', values: { coarse: 19, feedback: 0.97, mix: 0.45 } },
  ],
  // WT-VCO: bank 0 Saw, 1 Sqr, 2 Tri, 3 Organ, 4 Pulse, 5 Vocal.
  tp_mmb_wt_vco: [
    { name: 'Zaag', values: { bank: 0, coarse: 0, fine: 0, level: 0.75 } },
    { name: 'Holle blok', values: { bank: 1, coarse: 0, fine: 0, level: 0.7 } },
    { name: 'Zachte driehoek', values: { bank: 2, coarse: 0, fine: 0, level: 0.85 } },
    { name: 'Orgeltje', values: { bank: 3, coarse: 0, fine: 0, level: 0.75 } },
    { name: 'Smalle puls-bas', values: { bank: 4, coarse: -12, fine: 0, level: 0.75 } },
    { name: 'Stem', values: { bank: 5, coarse: 0, fine: 0, level: 0.8 } },
  ],
  // STK-SOUND: sound 0 Plucked, 1 Clarinet, 2 Bowed, 3 Flute, 4 Brass, 5 Saxophony, 6 BlowHole, 7 BandedWG, 8 Mandolin.
  tp_mmb_stk_sound: [
    { name: 'Getokkelde snaar', values: { sound: 0, timbre: 0.5, modulation: 0.2, strength: 0.8, level: 0.8 } },
    { name: 'Klarinet', values: { sound: 1, timbre: 0.5, modulation: 0.3, strength: 0.7, level: 0.75 } },
    { name: 'Strijkstok', values: { sound: 2, timbre: 0.45, modulation: 0.4, strength: 0.75, level: 0.8 } },
    { name: 'Fluit', values: { sound: 3, timbre: 0.4, modulation: 0.35, strength: 0.7, level: 0.8 } },
    { name: 'Koper', values: { sound: 4, timbre: 0.6, modulation: 0.2, strength: 0.85, level: 0.7 } },
    { name: 'Mandoline', values: { sound: 8, timbre: 0.5, modulation: 0.3, strength: 0.8, level: 0.8 } },
  ],
  // FOF: geen schakelaars; syl 0 = Vowel-knop, 1..45 lettergrepen (1 doo, 2 da, 16 bim, 17 bam).
  tp_mmb_fof: [
    { name: 'Koor-aa', values: { vowel: 0, tone: 0.5, breath: 0.08, vibrato: 0.15, voice: 0.35, syl: 0, level: 0.8 } },
    { name: 'Sopraan ie', values: { vowel: 0.5, tone: 0.65, breath: 0.05, vibrato: 0.25, voice: 0.2, syl: 0, level: 0.75 } },
    { name: 'Bas oe', values: { vowel: 1, tone: 0.35, breath: 0.1, vibrato: 0.1, voice: 0.6, syl: 0, level: 0.85 } },
    { name: 'Fluisterstem', values: { vowel: 0.25, tone: 0.4, breath: 0.6, vibrato: 0.05, voice: 0.7, syl: 0, level: 0.8 } },
    { name: 'Doo-wop', values: { vowel: 0, tone: 0.5, breath: 0.08, vibrato: 0.12, voice: 0.4, syl: 1, level: 0.8 } },
    { name: 'Bim-bam', values: { vowel: 0, tone: 0.55, breath: 0.05, vibrato: 0.1, voice: 0.3, syl: 17, level: 0.8 } },
  ],
  // MATERIAL BRIDGE: geen schakelaars.
  tp_mmb_material_bridge: [
    { name: 'Houten brug', values: { pitch: 0, spread: 0.35, coupling: 0.5, decay: 1.5, memory: 0.7, fatigue: 0.5, recovery: 2, pickup: 0.25, level: 0.8 } },
    { name: 'Glazen klok', values: { pitch: 12, spread: 0.6, coupling: 0.65, decay: 5, memory: 0.3, fatigue: 0.15, recovery: 3, pickup: 0.5, level: 0.7 } },
    { name: 'Korte pluk', values: { pitch: 0, spread: 0.2, coupling: 0.35, decay: 0.4, memory: 0.5, fatigue: 0.6, recovery: 1, pickup: 0.2, level: 0.85 } },
    { name: 'Breekbaar metaal', values: { pitch: 0, spread: 0.8, coupling: 0.8, decay: 4, memory: 1, fatigue: 0.8, recovery: 6, pickup: 0.6, level: 0.7 } },
    { name: 'Lage gong', values: { pitch: -24, spread: 0.5, coupling: 0.6, decay: 7, memory: 0.4, fatigue: 0.3, recovery: 4, pickup: 0.4, level: 0.75 } },
  ],
  // SCANNED: geen schakelaars.
  tp_mmb_scanned: [
    { name: 'Levend orgel', values: { pitch: 0, tension: 0.6, damping: 0.4, restore: 0.4, speed: 0.1, width: 0.3, position: 0.5, level: 0.8 } },
    { name: 'Trillende snaar', values: { pitch: 0, tension: 0.8, damping: 0.15, restore: 0.2, speed: 0.3, width: 0.15, position: 0.3, level: 0.75 } },
    { name: 'Trage golf', values: { pitch: 0, tension: 0.4, damping: 0.6, restore: 0.15, speed: 0.04, width: 0.5, position: 0.5, level: 0.8 } },
    { name: 'Rubberen bas', values: { pitch: -12, tension: 0.3, damping: 0.5, restore: 0.5, speed: 0.2, width: 0.6, position: 0.4, level: 0.85 } },
    { name: 'Glinsterend', values: { pitch: 12, tension: 0.9, damping: 0.1, restore: 0.3, speed: 0.6, width: 0.1, position: 0.7, level: 0.7 } },
  ],
  // GENDYN: geen schakelaars.
  tp_mmb_gendyn: [
    { name: 'Bijna stabiel', values: { pitch: 0, points: 12, amp_step: 0.1, dur_step: 0.05, dist: 0.2, smooth: 0.7, settle: 0.15, seed: 1, level: 0.75 } },
    { name: 'Xenakis-ruw', values: { pitch: 0, points: 16, amp_step: 0.5, dur_step: 0.4, dist: 0.6, smooth: 0.2, settle: 0.1, seed: 7, level: 0.65 } },
    { name: 'Zacht zingend', values: { pitch: 0, points: 6, amp_step: 0.2, dur_step: 0.1, dist: 0.3, smooth: 1, settle: 0.2, seed: 3, level: 0.8 } },
    { name: 'Grommende bas', values: { pitch: -24, points: 8, amp_step: 0.3, dur_step: 0.15, dist: 0.5, smooth: 0.5, settle: 0.1, seed: 12, level: 0.8 } },
    { name: 'Insectenzwerm', values: { pitch: 12, points: 24, amp_step: 0.6, dur_step: 0.7, dist: 0.8, smooth: 0.3, settle: 0.05, seed: 42, level: 0.6 } },
  ],
  // EXCITABLE: speed 0 = 1, 1 = 2, 2 = 4 (samples per mediumstap).
  tp_mmb_excitable: [
    { name: 'Zoemende cellen', values: { pitch: 0, detune: 7, refract: 12, excite: 3, thresh: 1, pickup: 0.4, speed: 1, level: 0.8 } },
    { name: 'Zuivere puls', values: { pitch: 0, detune: 12, refract: 6, excite: 2, thresh: 1, pickup: 0.1, speed: 0, level: 0.75 } },
    { name: 'Botsende fronten', values: { pitch: 0, detune: 5, refract: 18, excite: 4, thresh: 1, pickup: 1, speed: 1, level: 0.8 } },
    { name: 'Ondertonen', values: { pitch: 24, detune: 0, refract: 60, excite: 3, thresh: 1, pickup: 0.5, speed: 1, level: 0.8 } },
    { name: 'Grof raster', values: { pitch: -12, detune: 7, refract: 20, excite: 6, thresh: 2, pickup: 0.6, speed: 2, level: 0.8 } },
  ],
  // FOLDER: type 0 Sine, 1 Tri, 2 259.
  tp_mmb_folder: [
    { name: 'Warme vouw', values: { fold: 0.25, symmetry: 0, type: 0, mix: 1, level: 0.8 } },
    { name: 'Glazen boventonen', values: { fold: 0.55, symmetry: 0.2, type: 0, mix: 1, level: 0.75 } },
    { name: 'Scherpe driehoek', values: { fold: 0.5, symmetry: 0, type: 1, mix: 0.8, level: 0.7 } },
    { name: 'Buchla 259', values: { fold: 0.45, symmetry: 0.1, type: 2, mix: 1, level: 0.8 } },
    { name: 'Neuzig scheef', values: { fold: 0.7, symmetry: -0.5, type: 2, mix: 1, level: 0.7 } },
    { name: 'Parallel glans', values: { fold: 0.8, symmetry: 0.3, type: 1, mix: 0.35, level: 0.8 } },
  ],
  // LPG: mode 0 LP, 1 Both, 2 VCA. (Zonder trigger/CV bepaalt Open hoe ver hij openstaat.)
  tp_mmb_lpg: [
    { name: 'Half open', values: { offset: 0.5, decay: 0.25, mode: 1, res: 0.1, level: 0.9 } },
    { name: 'Donker hout', values: { offset: 0.3, decay: 0.4, mode: 1, res: 0.05, level: 0.9 } },
    { name: 'Filterpiek', values: { offset: 0.6, decay: 0.25, mode: 0, res: 0.6, level: 0.85 } },
    { name: 'Zacht filter', values: { offset: 0.45, decay: 0.8, mode: 0, res: 0.2, level: 0.9 } },
    { name: 'Vactrol-VCA', values: { offset: 0.8, decay: 1.2, mode: 2, res: 0, level: 0.9 } },
    { name: 'Wijd open', values: { offset: 1, decay: 0.25, mode: 1, res: 0.15, level: 0.85 } },
  ],
  // DRIVE: mode 0 OD, 1 Dist, 2 Fuzz.
  tp_mmb_drive: [
    { name: 'Lichte crunch', values: { mode: 0, drive: 0.3, tone: 0.5, level: 0.5, mix: 1 } },
    { name: 'Groene solo', values: { mode: 0, drive: 0.7, tone: 0.6, level: 0.45, mix: 1 } },
    { name: 'Rauwe rat', values: { mode: 1, drive: 0.6, tone: 0.45, level: 0.4, mix: 1 } },
    { name: 'Muur van fuzz', values: { mode: 2, drive: 0.8, tone: 0.5, level: 0.35, mix: 1 } },
    { name: 'Parallel vuil', values: { mode: 1, drive: 0.75, tone: 0.55, level: 0.45, mix: 0.4 } },
  ],
  // TUBE: mode 0 Studio, 1 Amp; stack 0 Fender, 1 Marshall, 2 Vox; cab 0 Uit, 1 Aan.
  tp_mmb_tube: [
    { name: 'Warmte op de mix', values: { mode: 0, drive: 0.3, bias: 0.6, mix: 1, level: 0.6 } },
    { name: 'Vette stem', values: { mode: 0, drive: 0.6, bias: 0.5, mix: 0.7, level: 0.6 } },
    { name: 'Clean Fender', values: { mode: 1, stack: 0, drive: 0.25, bias: 0.55, bass: 0.55, mid: 0.4, treble: 0.6, presence: 0.5, sag: 0.3, cab: 1, mix: 1, level: 0.6 } },
    { name: 'Marshall crunch', values: { mode: 1, stack: 1, drive: 0.65, bias: 0.45, bass: 0.5, mid: 0.65, treble: 0.6, presence: 0.55, sag: 0.4, cab: 1, mix: 1, level: 0.5 } },
    { name: 'Vox chime', values: { mode: 1, stack: 2, drive: 0.45, bias: 0.6, bass: 0.4, mid: 0.5, treble: 0.7, presence: 0.6, sag: 0.5, cab: 1, mix: 1, level: 0.55 } },
    { name: 'Sponzige lead', values: { mode: 1, stack: 1, drive: 0.85, bias: 0.35, bass: 0.45, mid: 0.7, treble: 0.55, presence: 0.45, sag: 0.8, cab: 1, mix: 1, level: 0.45 } },
  ],
  // FREQSHIFT: range 0 5 Hz, 1 50, 2 500, 3 5 k.
  tp_mmb_freqshift: [
    { name: 'Trage zweving', values: { shift: 0.3, range: 0, fbk: 0, mix: 0.5, level: 0.8 } },
    { name: 'Barberpaal', values: { shift: 0.4, range: 0, fbk: 0.7, mix: 0.6, level: 0.75 } },
    { name: 'Klokachtig', values: { shift: 0.3, range: 2, fbk: 0, mix: 0.6, level: 0.8 } },
    { name: 'Metaalstem', values: { shift: -0.5, range: 2, fbk: 0.4, mix: 0.7, level: 0.75 } },
    { name: 'Ruimtesirene', values: { shift: 0.15, range: 3, fbk: 0.6, mix: 0.5, level: 0.7 } },
  ],
  // MIXTUR: formant 0 Uit, 1 A, 2 E, 3 I, 4 O, 5 U; dyn 0 Vel, 1 Press.
  tp_mmb_mixtur: [
    { name: 'Sala-klinker', values: { curve: 0.55, unrest: 0.25, div1: 2, div2: 3, div3: 4, div4: 5, main: 0.8, sub1: 0.6, sub2: 0.45, sub3: 0.3, sub4: 0, formant: 1, fshift: 0, freso: 0.55, fmix: 0.7, noise: 0.03, dyn: 0, attack: 8, release: 120, level: 0.8 } },
    { name: 'Vogels', values: { curve: 0.7, unrest: 0.4, glide: 120, div1: 2, div2: 3, div3: 5, div4: 7, main: 0.8, sub1: 0.3, sub2: 0.35, sub3: 0.25, sub4: 0.2, formant: 3, fshift: 5, freso: 0.7, fmix: 0.75, noise: 0.06, dyn: 0, attack: 3, release: 200, level: 0.75 } },
    { name: 'Diep orgel', values: { curve: 0.4, unrest: 0.1, div1: 2, div2: 4, div3: 3, div4: 6, main: 0.7, sub1: 0.7, sub2: 0.5, sub3: 0.4, sub4: 0.25, formant: 4, fshift: -3, freso: 0.4, fmix: 0.5, noise: 0.02, dyn: 0, attack: 25, release: 300, level: 0.75 } },
    { name: 'Kale zaag', values: { curve: 0.3, unrest: 0.15, main: 0.9, sub1: 0, sub2: 0, sub3: 0, sub4: 0, formant: 0, noise: 0.02, dyn: 0, attack: 5, release: 100, level: 0.75 } },
    { name: 'Hoorn op U', values: { curve: 0.6, unrest: 0.3, glide: 60, div1: 2, div2: 3, div3: 4, div4: 6, main: 0.85, sub1: 0.4, sub2: 0.2, sub3: 0, sub4: 0, formant: 5, fshift: 2, freso: 0.65, fmix: 0.8, noise: 0.05, dyn: 0, attack: 40, release: 250, level: 0.8 } },
  ],
  // RUNGLER: geen schakelaars; loop is een toggle.
  tp_mmb_rungler: [
    { name: 'Startpunt', values: { freq_a: 110, run_a: 0.4, run_b: 0.3, freq_b: 3, cross_a: 0, cross_b: 0, loop: false, cutoff: 900, res: 0.5, sweep: 0.5, level: 0.7 } },
    { name: 'Vaste lus', values: { freq_a: 220, run_a: 0.55, run_b: 0.2, freq_b: 6, cross_a: 0, cross_b: 0, loop: true, cutoff: 1500, res: 0.4, sweep: 0.6, level: 0.7 } },
    { name: 'Getrapte chaos', values: { freq_a: 160, run_a: 0.8, run_b: 0.6, freq_b: 9, cross_a: 0.3, cross_b: 0.2, loop: false, cutoff: 1200, res: 0.6, sweep: 0.7, level: 0.65 } },
    { name: 'Lage brom', values: { freq_a: 45, run_a: 0.25, run_b: 0.2, freq_b: 1.2, cross_a: 0, cross_b: 0.1, loop: true, cutoff: 400, res: 0.55, sweep: 0.4, level: 0.75 } },
    { name: 'Ruisregen', values: { freq_a: 900, run_a: 0.9, run_b: 0.8, freq_b: 220, cross_a: 0.6, cross_b: 0.5, loop: false, cutoff: 3000, res: 0.3, sweep: 0.8, level: 0.55 } },
  ],
  // MARTENOT: touche 0 Klavier, 1 Touche (Touche zwijgt zonder aftertouch; hier steeds Klavier).
  tp_mmb_martenot: [
    { name: 'Zuivere onde', values: { vib: 0.15, vib_rate: 5.5, onde: 0.8, creux: 0, gambe: 0, nasillard: 0, octaviant: 0, souffle: 0.05, bright: 0.6, touche: 0, attack: 6, release: 250, level: 0.8 } },
    { name: 'Turangalîla', values: { glide: 180, vib: 0.25, vib_rate: 6, onde: 0.7, creux: 0, gambe: 0, nasillard: 0, octaviant: 0.35, souffle: 0.08, bright: 0.65, touche: 0, attack: 20, release: 400, level: 0.8 } },
    { name: 'Holle fluit', values: { vib: 0.1, vib_rate: 5, onde: 0.3, creux: 0.7, gambe: 0, nasillard: 0, octaviant: 0, souffle: 0.2, bright: 0.45, touche: 0, attack: 30, release: 300, level: 0.8 } },
    { name: 'Strijker', values: { vib: 0.2, vib_rate: 5.8, onde: 0.2, creux: 0, gambe: 0.75, nasillard: 0.15, octaviant: 0, souffle: 0.05, bright: 0.7, touche: 0, attack: 60, release: 350, level: 0.75 } },
    { name: 'Neuzige lead', values: { glide: 60, vib: 0.18, vib_rate: 6.5, onde: 0.2, creux: 0.2, gambe: 0.2, nasillard: 0.7, octaviant: 0, souffle: 0.03, bright: 0.75, touche: 0, attack: 8, release: 200, level: 0.75 } },
  ],
  // DIFFUSEUR: type 0 Principal, 1 Palme, 2 Métallique.
  tp_mmb_diffuseur: [
    { name: 'Principal', values: { type: 0, mix: 1, ring: 0.3, tune: 0, gong: 196, level: 1 } },
    { name: 'Palme-halo', values: { type: 1, mix: 0.5, ring: 0.5, tune: 0, gong: 196, level: 1 } },
    { name: 'Lange snaren', values: { type: 1, mix: 0.65, ring: 0.85, tune: 0, gong: 196, level: 0.9 } },
    { name: 'Gong-kast', values: { type: 2, mix: 0.45, ring: 0.5, tune: 0, gong: 196, level: 1 } },
    { name: 'Diepe gong', values: { type: 2, mix: 0.6, ring: 0.75, tune: 0, gong: 90, level: 0.9 } },
  ],
  // CMI: geen schakelaars (zonder profiel de ingebouwde koperklank).
  tp_mmb_cmi: [
    { name: 'Fairlight koper', values: { seg: 40, smooth: 0.3, loop: 24, attack: 4, release: 300, filter: 8, level: 0.8 } },
    { name: 'Rauwe 8 bit', values: { seg: 40, smooth: 0, loop: 24, attack: 2, release: 200, filter: 15, level: 0.7 } },
    { name: 'Trage zwelling', values: { seg: 150, smooth: 0.8, loop: 16, attack: 120, release: 900, filter: 7, level: 0.8 } },
    { name: 'Korte tik', values: { seg: 12, smooth: 0.2, loop: 32, attack: 1, release: 150, filter: 10, level: 0.8 } },
    { name: 'Zacht pad', values: { seg: 300, smooth: 1, loop: 8, attack: 400, release: 1500, filter: 5, level: 0.8 } },
  ],
  // SEM: mode traploos 0 LP · 0.5 notch · 1 HP (geen schakelaars).
  tp_mmb_sem: [
    { name: 'Warm laagdoorlaat', values: { cutoff: 1200, res: 0.3, mode: 0, drive: 0.2, level: 0.8 } },
    { name: 'Donker en rond', values: { cutoff: 400, res: 0.45, mode: 0, drive: 0.35, level: 0.85 } },
    { name: 'Notch', values: { cutoff: 1000, res: 0.5, mode: 0.5, drive: 0.15, level: 0.8 } },
    { name: 'Telefoonband', values: { cutoff: 1500, res: 0.6, mode: 0.3, drive: 0.3, level: 0.8 } },
    { name: 'Dun hoogdoorlaat', values: { cutoff: 600, res: 0.35, mode: 1, drive: 0.1, level: 0.8 } },
  ],
  // COMPLEX: mod_wave 0 Sin, 1 Tri, 2 Saw.
  tp_mmb_complex: [
    { name: 'Zuivere sinus', values: { ratio: 2, mod_wave: 0, fm: 0, am: 0, tmod: 0, symmetry: 0, timbre: 0, level: 0.8 } },
    { name: 'West Coast', values: { ratio: 2, mod_wave: 0, fm: 0.15, am: 0, tmod: 0.2, symmetry: 0.1, timbre: 0.45, level: 0.8 } },
    { name: 'Klok', values: { ratio: 3.5, mod_wave: 0, fm: 0.35, am: 0, tmod: 0, symmetry: 0, timbre: 0.2, level: 0.75 } },
    { name: 'Holle bas', values: { ratio: 1, pitch: -12, mod_wave: 1, fm: 0.1, am: 0.2, tmod: 0.15, symmetry: 0.3, timbre: 0.55, level: 0.8 } },
    { name: 'Metaalgong', values: { ratio: 1.41, mod_wave: 0, fm: 0.5, am: 0.3, tmod: 0.3, symmetry: 0, timbre: 0.4, level: 0.7 } },
    { name: 'Zaagvouw', values: { ratio: 0.5, mod_wave: 2, fm: 0.05, am: 0.1, tmod: 0.5, symmetry: -0.2, timbre: 0.6, level: 0.7 } },
  ],
  // WAH: mode 0 Pedal, 1 Auto↑, 2 Auto↓, 3 LFO; type 0 Wah, 1 Vowel.
  tp_mmb_wah: [
    { name: 'Funk auto-wah', values: { mode: 1, type: 0, sens: 0.65, q: 0.6, mix: 1, level: 0.8 } },
    { name: 'Halve hak', values: { mode: 0, type: 0, pedal: 0.45, q: 0.55, mix: 1, level: 0.8 } },
    { name: 'Omlaag-wah', values: { mode: 2, type: 0, sens: 0.6, q: 0.5, mix: 1, level: 0.8 } },
    { name: 'Wiebel-LFO', values: { mode: 3, type: 0, rate: 2, q: 0.65, mix: 1, level: 0.8 } },
    { name: 'Pratend filter', values: { mode: 1, type: 1, sens: 0.6, q: 0.6, mix: 1, level: 0.8 } },
    { name: 'Trage klinkers', values: { mode: 3, type: 1, rate: 0.3, q: 0.5, mix: 0.8, level: 0.8 } },
  ],
  // ENSEMBLE: geen schakelaars.
  tp_mmb_ensemble: [
    { name: 'String machine', values: { depth: 0.7, slow: 0.6, fast: 6, tone: 0.6, mix: 0.8, level: 0.8 } },
    { name: 'Subtiel breed', values: { depth: 0.35, slow: 0.4, fast: 5, tone: 0.7, mix: 0.4, level: 0.8 } },
    { name: 'Dik koor', values: { depth: 1, slow: 0.8, fast: 7, tone: 0.5, mix: 0.9, level: 0.75 } },
    { name: 'Donkere zwevingen', values: { depth: 0.8, slow: 0.25, fast: 4, tone: 0.3, mix: 0.7, level: 0.8 } },
    { name: 'Snelle glans', values: { depth: 0.5, slow: 1.5, fast: 9, tone: 0.8, mix: 0.6, level: 0.8 } },
  ],
  // SYNTHEX: o1/o2_oct 0 16', 1 8', 2 4', 3 2'; o1/o2_wave 0 Ramp, 1 Sqr, 2 Pulse;
  // mode 0 LP, 1 BP, 2 HP; lfo_wave 0 Tri, 1 Sqr, 2 Saw, 3 S&H.
  tp_mmb_synthex: [
    { name: 'Synthex brass', values: { o1_oct: 1, o1_wave: 0, o1_level: 10, o2_oct: 1, o2_transpose: 0, o2_detune: 6, o2_wave: 0, o2_level: 8, freq: 4, res: 2, env_amt: 6, kbd: 4, mode: 0, fa: 1.5, fd: 5, fs: 5, fr: 4, aa: 1, ad: 5, as: 8, ar: 4, chorus: true, level: 0.75 } },
    { name: 'Breed strijkers', values: { o1_oct: 1, o1_wave: 2, o1_level: 9, o2_oct: 2, o2_transpose: 0, o2_detune: 10, o2_wave: 0, o2_level: 7, pw: 0.25, freq: 6, res: 1, env_amt: 2, kbd: 3, mode: 0, fa: 4, fd: 6, fs: 7, fr: 6, aa: 4.5, ad: 6, as: 9, ar: 6.5, lfo_rate: 4, lfo_wave: 0, lfo_pw: 0.3, chorus: true, level: 0.75 } },
    { name: 'Zachte pad', values: { o1_oct: 1, o1_wave: 1, o1_level: 8, o2_oct: 1, o2_transpose: 0, o2_detune: 8, o2_wave: 0, o2_level: 7, freq: 3.5, res: 2.5, env_amt: 3, kbd: 3, mode: 0, fa: 6, fd: 6, fs: 6, fr: 7, aa: 5.5, ad: 6, as: 9, ar: 7, lfo_rate: 0.3, lfo_wave: 0, lfo_vcf: 0.15, chorus: true, level: 0.75 } },
    { name: 'Sync lead', values: { o1_oct: 1, o1_wave: 0, o1_level: 10, o2_oct: 2, o2_transpose: 7, o2_detune: 0, o2_wave: 0, o2_level: 9, sync: true, freq: 6, res: 3, env_amt: 5, kbd: 5, mode: 0, fa: 0.5, fd: 4.5, fs: 6, fr: 3, aa: 0.5, ad: 5, as: 8, ar: 3, glide: 0.2, lfo_rate: 5.5, lfo_wave: 0, lfo_osc: 0.08, chorus: false, level: 0.7 } },
    { name: 'Bas', values: { o1_oct: 0, o1_wave: 1, o1_level: 10, o2_oct: 1, o2_transpose: 0, o2_detune: 3, o2_wave: 0, o2_level: 7, freq: 3, res: 4, env_amt: 6, kbd: 5, mode: 0, fa: 0, fd: 3.5, fs: 2, fr: 2.5, aa: 0, ad: 4, as: 8, ar: 2, chorus: false, level: 0.8 } },
    { name: 'Ringklok', values: { o1_oct: 2, o1_wave: 0, o1_level: 9, o2_oct: 2, o2_transpose: 5, o2_detune: 0, o2_wave: 1, o2_level: 9, ring: true, freq: 7, res: 2, env_amt: 2, kbd: 4, mode: 1, fa: 0, fd: 5, fs: 3, fr: 5, aa: 0, ad: 6, as: 2, ar: 5.5, chorus: true, level: 0.7 } },
  ],
  // DRAW-VCO: shape 0 Getekend, 1 Sinus, 2 Driehoek, 3 Zaag, 4 Blok, 5 Puls, 6 Orgel.
  tp_mmb_draw_vco: [
    { name: 'Zuivere sinus', values: { shape: 1, level: 0.8 } },
    { name: 'Zachte driehoek', values: { shape: 2, level: 0.8 } },
    { name: 'Zaag', values: { shape: 3, level: 0.7 } },
    { name: 'Blok', values: { shape: 4, level: 0.7 } },
    { name: 'Smalle puls', values: { shape: 5, level: 0.7 } },
    { name: 'Orgeltje', values: { shape: 6, level: 0.8 } },
    { name: 'Sub-sinus (−1 oct)', values: { shape: 1, coarse: -12, level: 0.9 } },
  ],
};

// Beginstand alleen in de plugin ("Standaard" en een nieuwe instantie), waar
// die afwijkt van het paneel. SID: met het filter aan, anders doet de hele
// filterkolom niets en lijkt de plugin stuk.
export const PLUGIN_DEFAULTS: Record<string, Record<string, ControlValue>> = {
  tp_mmb_sid: { filt: 1 },
};
