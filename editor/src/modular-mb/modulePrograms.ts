// Programmabanken per moduletype (doc/plans/elements-programmas.md). Een
// programma is een naam en de stand van de knoppen van één module; kiezen
// (knop `program`, met een naamdisplay) zet die knoppen via setPatchControl,
// het ene schrijfpad. Stemming en volume blijven staan (besluit Mark
// 2026-10-12): die staan niet in `values`.
//
// Elements: de 19 programma's van de losse 5× Elements-Teensy, gered op
// 2026-10-12 (sounds/Elements/5x-elements-programs.json). 9–19 hadden geen
// naam; Mark en ik geven ze er een na het beluisteren.

export interface ModuleProgram { name: string; values: Readonly<Record<string, number>> }

export const ELEMENTS_PROGRAMS: readonly ModuleProgram[] = [
  { name: 'short', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.0, strike_meta: 0.6457, strike_timbre: 0.8425, signature: 0.0, geometry: 0.2283, brightness: 0.7087, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'longer', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.0, strike_meta: 0.6457, strike_timbre: 0.8425, signature: 0.0, geometry: 0.2283, brightness: 0.7087, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'mandolin', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.8661, strike_timbre: 0.8346, signature: 0.0, geometry: 0.2283, brightness: 0.7874, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'woody', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.7087, strike_timbre: 0.7638, signature: 0.0, geometry: 0.1811, brightness: 0.4252, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'slow wood repeat', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.8898, strike_timbre: 0.7638, signature: 0.0, geometry: 0.2126, brightness: 0.4252, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'slow wood repeat 2', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.8898, strike_timbre: 0.7638, signature: 0.0, geometry: 0.2126, brightness: 0.4252, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'fast sharp repeat', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.8661, strike_timbre: 0.8346, signature: 0.0, geometry: 0.2283, brightness: 0.7874, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'test 8', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.0, strike_meta: 0.6693, strike_timbre: 0.9843, signature: 0.0, geometry: 0.6457, brightness: 0.5354, damping: 0.25, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 9', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.0, strike_meta: 0.6693, strike_timbre: 0.9843, signature: 0.0, geometry: 0.6457, brightness: 0.5354, damping: 0.7087, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 10', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.9764, strike_timbre: 0.9843, signature: 0.0, geometry: 0.1811, brightness: 0.6063, damping: 0.2441, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 11', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.063, strike_timbre: 0.9843, signature: 0.0, geometry: 0.1811, brightness: 0.6063, damping: 0.8031, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 12', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.9449, strike_timbre: 0.9843, signature: 0.0, geometry: 0.7323, brightness: 0.7244, damping: 0.5354, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 13', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.8, strike_meta: 0.8976, strike_timbre: 0.9843, signature: 0.0, geometry: 0.4252, brightness: 0.4331, damping: 0.5984, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 14', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.5, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.5, strike: 0.0, strike_meta: 0.8976, strike_timbre: 0.9843, signature: 0.0, geometry: 0.378, brightness: 0.2047, damping: 0.9213, position: 0.3, space: 0.5, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 15', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.4173, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.1102, strike: 0.0, strike_meta: 0.8976, strike_timbre: 0.9843, signature: 0.0, geometry: 0.315, brightness: 0.4252, damping: 0.3858, position: 0.4094, space: 0.8976, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 16', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.4173, blow: 0.8, blow_meta: 0.5, blow_timbre: 0.7087, strike: 0.0, strike_meta: 0.811, strike_timbre: 0.9843, signature: 0.0, geometry: 0.315, brightness: 0.3858, damping: 0.3858, position: 0.4094, space: 0.8976, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 17', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.4173, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.8346, strike: 0.8, strike_meta: 0.8898, strike_timbre: 0.9843, signature: 0.0, geometry: 0.315, brightness: 0.5039, damping: 0.3858, position: 0.4094, space: 0.8976, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 18', values: { envelope: 0.0, bow: 0.0, bow_timbre: 0.4173, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.8346, strike: 0.8, strike_meta: 0.8898, strike_timbre: 0.9843, signature: 0.0, geometry: 0.315, brightness: 0.5039, damping: 0.3858, position: 0.4094, space: 0.8976, mod_offset: 0.1, mod_freq: 0.0 } },
  { name: 'prog 19', values: { envelope: 0.0394, bow: 0.0, bow_timbre: 0.4173, blow: 0.0, blow_meta: 0.5, blow_timbre: 0.8346, strike: 0.8, strike_meta: 0.874, strike_timbre: 0.6929, signature: 0.0, geometry: 0.315, brightness: 0.5039, damping: 0.3858, position: 0.4094, space: 0.8976, mod_offset: 0.1, mod_freq: 0.0 } },
];

/** Per moduletype de fabrieksbank. */
export const MODULE_PROGRAMS: Readonly<Record<string, readonly ModuleProgram[]>> = {
  tp_mmb_elements: ELEMENTS_PROGRAMS,
};

/** De namen, voor het naamdisplay (`lookup`). */
export const programNames = (typeId: string): string[] => (MODULE_PROGRAMS[typeId] ?? []).map((p) => p.name);
