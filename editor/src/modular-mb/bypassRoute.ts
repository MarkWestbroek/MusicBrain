// Bypass voor effecten: welk droog pad hoort bij welke uitgang.
//
// Een bypass is een eigenschap van de patchmotor, niet van de module: de
// waarde staat als `__bypass` in patch.controlState, de motor routeert de
// audio-ingang om het effect heen (crossfade, trails). Deze functie zegt per
// moduletype hoe dat droge pad loopt; de plugin-generator
// (scripts/pluginPatches.ts) bakt het in, later ook de sim en de firmware.
//
// Regel (besluit Mark 2026-10-29): alleen categoryId 'effect'. Modules met
// een audio-ingang in een andere categorie (Elements, SID, FM-VCO, …) krijgen
// geen bypass. Heeft een effect zelf een knop `bypass` (compressors, EQ's),
// dan zet de motor die in plaats van zelf te routeren.

import type { ModuleType } from './types';

/** Droog pad naar één uitgang. `fallback`: de ingang die telt als `in` niet
 *  aangesloten is — de firmwareregel "alleen L aangesloten = mono op beide". */
export interface BypassPair { out: string; in: string; fallback?: string }

export type BypassRoute = { own: 'bypass' } | { pairs: BypassPair[] } | null;

/** Effecten die niet in een van de vaste patronen passen: hier met de hand,
 *  of `null` met de reden. De test eist dat elk effecttype óf een patroon
 *  volgt óf hier staat. */
export const BYPASS_EXCEPTIONS: Record<string, { pairs: BypassPair[] } | { none: string }> = {
  // Warps: in1 is de draaggolf (het gespeelde signaal), in2 de modulator.
  tp_mmb_warps:      { pairs: [{ out: 'out', in: 'in1' }, { out: 'aux', in: 'in1' }] },
  // Ringmod: `in` is het signaal, `carrier` de modulator.
  tp_mmb_ringmod:    { pairs: [{ out: 'out', in: 'in' }] },
  // Resonator: `out` nat, `mix` al droog+nat; droog op beide.
  tp_mmb_resonator:  { pairs: [{ out: 'out', in: 'in' }, { out: 'mix', in: 'in' }] },
  // Frequency shifter: `out` omhoog, `down` omlaag; droog op beide.
  tp_mmb_freqshift:  { pairs: [{ out: 'out', in: 'in' }, { out: 'down', in: 'in' }] },
  // Een VCA/panner: overbruggen zet hem open, een noot zou blijven klinken.
  tp_mmb_stereo_vca: { none: 'VCA, geen effect om te overbruggen' },
};

const audio = (t: ModuleType, dir: 'in' | 'out'): string[] =>
  t.ports.filter((p) => p.direction === dir && p.signalType === 'audio').map((p) => p.id).sort();

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** De vaste patronen: mono in/uit, stereo L/R, mono in → stereo uit. */
function byPattern(t: ModuleType): BypassPair[] | null {
  const ins = audio(t, 'in'), outs = audio(t, 'out');
  if (same(ins, ['in']) && same(outs, ['out'])) return [{ out: 'out', in: 'in' }];
  if (same(ins, ['in_l', 'in_r']) && same(outs, ['out_l', 'out_r']))
    return [{ out: 'out_l', in: 'in_l' }, { out: 'out_r', in: 'in_r', fallback: 'in_l' }];
  if (same(ins, ['in']) && same(outs, ['out_l', 'out_r']))
    return [{ out: 'out_l', in: 'in' }, { out: 'out_r', in: 'in' }];
  return null;
}

export function bypassRoute(t: ModuleType): BypassRoute {
  if (t.categoryId !== 'effect') return null;
  if (t.controls.some((c) => c.id === 'bypass')) return { own: 'bypass' };
  const ex = BYPASS_EXCEPTIONS[t.id];
  if (ex) return 'none' in ex ? null : { pairs: ex.pairs };
  const pairs = byPattern(t);
  return pairs ? { pairs } : null;
}

/** Voor de test: een effecttype zonder patroon en zonder uitzondering. */
export function bypassUndecided(t: ModuleType): boolean {
  return t.categoryId === 'effect' && !t.controls.some((c) => c.id === 'bypass')
    && !BYPASS_EXCEPTIONS[t.id] && byPattern(t) === null;
}
