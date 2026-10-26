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
};
