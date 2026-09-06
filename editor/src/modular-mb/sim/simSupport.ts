// simSupport — draait dit moduletype in de browser-simulator, en waarmee?
//
// De engine bouwt per module een node in `AudioEngine.makeNode()`, langs drie
// wegen: een wasm-worklet (dezelfde DSP als de Teensy), een Tone-runtimeklasse
// uit de registry, of een handvol interne modules die de engine rechtstreeks
// op typeId bouwt. Wat er níét bij zit, levert `null` op en blijft stil.
//
// Die kennis zat verspreid door makeNode, waardoor de Modules-tab hem niet
// kon tonen zonder te gaan raden. Ze staat nu hier, en makeNode vraagt het
// bij zichzelf op: zegt deze functie 'none', dan bouwt de engine niets. Zo
// kan het kolommetje in de UI niet uit de pas lopen met wat je hoort.

import { registry, WasmModule } from '../runtime';
import type { ModuleCategory, ModuleType } from '../types';

/**
 * `wasm` — worklet met dezelfde C++-kern als de firmware.
 * `tone`  — nagebouwd in Web Audio/Tone; klinkt als het idee, niet per se
 *           sample-voor-sample als de Teensy.
 * `none`  — de engine bouwt niets; de module staat wel in het rack maar
 *           doet in de simulator niets.
 */
export type SimSupport = 'wasm' | 'tone' | 'none';

/**
 * Interne modules die `makeNode` rechtstreeks op typeId bouwt, buiten de
 * registry om (ze hebben geen eigen runtimeklasse — het zijn een paar
 * Tone-nodes aan elkaar). Blijft in de pas met de `if (t.id === …)`-reeks
 * bovenin makeNode en de twee gevallen in de utility-tak.
 */
const TONE_BY_TYPE_ID: ReadonlySet<string> = new Set([
  'tp_mmb_noise', 'tp_mmb_echo', 'tp_mmb_phaser', 'tp_mmb_cvmath',
  'tp_mmb_mixer', 'tp_mmb_mixer8', 'tp_mmb_mixer16',
  'tp_mmb_out', 'tp_mmb_midiin',
]);

/**
 * Is dit de 16-staps CV/gate-sequencer die de engine kan spelen?
 *
 * De categorie `sequencer` zegt alleen dát een module stappen stuurt: Grids
 * valt er ook onder, maar heeft bd/sd/hh/acc in plaats van cv/gate en geen
 * stap-knoppen. Een stap-knop `s1` plus een `cv`-uitgang is de vingerafdruk
 * van de SEQ-16.
 */
export function isStepSequencer(t: ModuleType): boolean {
  return t.controls.some((c) => c.id === 's1')
    && t.ports.some((p) => p.id === 'cv' && p.direction === 'out');
}

/**
 * Zoals `makeNode` beslist, maar zonder iets te bouwen.
 * @param kind De `kind` van de categorie van het type (vco, vcf, utility, …).
 */
export function simSupportByKind(t: ModuleType, kind: string): SimSupport {
  if (WasmModule.supports(t.id)) return 'wasm';
  if (TONE_BY_TYPE_ID.has(t.id)) return 'tone';
  switch (kind) {
    case 'vco': case 'vcf': case 'vca': case 'envelope': case 'lfo':
      return registry.has(t.id) ? 'tone' : 'none';
    case 'sequencer':
      return isStepSequencer(t) ? 'tone' : 'none';
    default:
      return 'none';
  }
}

/**
 * Idem, maar vanuit een projectlijst — inclusief de `simulatedBy`-omweg,
 * waarmee een externe module op een interne wordt afgespeeld (ADR 0009).
 */
export function simSupportOf(
  type: ModuleType,
  types: ModuleType[],
  categories: ModuleCategory[],
): SimSupport {
  const t = type.simulatedBy
    ? types.find((x) => x.id === type.simulatedBy) ?? type
    : type;
  const kind = String(categories.find((c) => c.id === t.categoryId)?.kind ?? '');
  return simSupportByKind(t, kind);
}

/** Kort label voor in een tabel. */
export const SIM_LABEL: Record<SimSupport, string> = {
  wasm: 'wasm',
  tone: 'web-audio',
  none: '—',
};

/** Uitleg voor de tooltip. */
export const SIM_TITLE: Record<SimSupport, string> = {
  wasm: 'Speelt in de simulator via een wasm-worklet — dezelfde DSP als de Teensy.',
  tone: 'Speelt in de simulator, nagebouwd in Web Audio (benadering van de Teensy).',
  none: 'Nog niet gesimuleerd: de module staat wel in het rack maar blijft stil.',
};
