// simSupport — draait dit moduletype in de browser-simulator, en waarmee?
//
// De engine bouwt per module een node in `AudioEngine.makeNode()`, langs twee
// wegen: een wasm-worklet (dezelfde DSP als de Teensy), of OUT en de mixers,
// die hij rechtstreeks uit Web Audio-nodes bouwt. Wat er níét bij zit,
// levert `null` op en blijft stil.
//
// Die kennis zat verspreid door makeNode, waardoor de Modules-tab hem niet
// kon tonen zonder te gaan raden. Ze staat nu hier, en makeNode vraagt het
// bij zichzelf op: zegt deze functie 'none', dan bouwt de engine niets. Zo
// kan het kolommetje in de UI niet uit de pas lopen met wat je hoort.

import { WasmModule } from '../runtime';
import type { ModuleCategory, ModuleType } from '../types';

/**
 * `wasm` — worklet met dezelfde C++-kern als de firmware.
 * `tone`  — gebouwd uit Web Audio-nodes: alleen OUT en de mixers, die optellen
 *           en pannen (daar valt niets na te bootsen).
 * `none`  — de engine bouwt niets; de module staat wel in het rack maar
 *           doet in de simulator niets.
 */
export type SimSupport = 'wasm' | 'tone' | 'none';

/** Modules die `makeNode` uit Web Audio-nodes bouwt, buiten de wasm om. */
const TONE_BY_TYPE_ID: ReadonlySet<string> = new Set([
  'tp_mmb_mixer', 'tp_mmb_mixer8', 'tp_mmb_mixer16', 'tp_mmb_out',
]);

/**
 * Zoals `makeNode` beslist, maar zonder iets te bouwen.
 * @param _kind De `kind` van de categorie (vco, vcf, utility, …). Sinds alle
 *   interne modules wasm zijn beslist het typeId alleen; de parameter blijft
 *   voor de aanroepers.
 */
export function simSupportByKind(t: ModuleType, _kind: string): SimSupport {
  if (WasmModule.supports(t.id)) return 'wasm';
  if (TONE_BY_TYPE_ID.has(t.id)) return 'tone';
  return 'none';
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
