// Tempo: één baas per patch (doc/plans/tempo.md). Zuiver, zonder React of
// engine: welke modules volgen, wie er beslist, welke knoppen mee moeten,
// en de rekensommen voor tap tempo en MIDI-clock.
//
// Volgorde van wie beslist: MIDI-clock (als die loopt en gevolgd wordt) >
// de song (zodra die sporen heeft) > het patchtempo (TAP, het getal, of een
// tempoknop die iemand verdraait).

import type { ModularProject, Patch } from './types';

/** Modules met een Tempo-knop in bpm per tel (zie de catalogus). */
export const TEMPO_TYPES: ReadonlySet<string> = new Set([
  'tp_mmb_arp', 'tp_mmb_clock', 'tp_mmb_euclid', 'tp_mmb_grids', 'tp_mmb_marbles', 'tp_mmb_rhythm', 'tp_mmb_turing',
]);
export const MIN_BPM = 30, MAX_BPM = 300, DEFAULT_BPM = 120;
export const clampTempo = (v: number): number =>
  (Number.isFinite(v) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v * 10) / 10)) : DEFAULT_BPM);
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.06;

export interface TempoModule {
  id: string;
  typeId: string;
  /** De stand van zijn Tempo-knop. */
  bpm: number;
  /** Volgt het patchtempo (niet op ExtClk, niet op eigen tempo). */
  follows: boolean;
  /** Waarom niet: een kabel (ExtClk) of bewust eigen tempo. */
  why?: 'extclock' | 'own';
}

/** De tempomodules van de patch, in rackvolgorde. */
export function tempoModules(project: ModularProject, patch: Patch): TempoModule[] {
  const inPatch = project.racks.filter((r) => patch.rackIds.includes(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId));
  const own = new Set(patch.tempoOwn ?? []);
  const out: TempoModule[] = [];
  for (const id of inPatch) {
    const m = project.modules.find((x) => x.id === id);
    if (!m || !TEMPO_TYPES.has(m.typeId)) continue;
    const cs = patch.controlState[id] ?? {};
    const ext = cs.extclock === true || Number(cs.extclock) >= 0.5;
    const bpm = Number(cs.tempo ?? DEFAULT_BPM);
    out.push({
      id, typeId: m.typeId, bpm: Number.isFinite(bpm) ? bpm : DEFAULT_BPM,
      follows: !ext && !own.has(id), ...(ext ? { why: 'extclock' as const } : own.has(id) ? { why: 'own' as const } : {}),
    });
  }
  return out;
}

/** Het tempo van de patch: het veld, anders de eerste volgende knop, anders 120. */
export function patchTempoOf(project: ModularProject, patch: Patch): number {
  if (typeof patch.tempo === 'number') return clampTempo(patch.tempo);
  const first = tempoModules(project, patch).find((m) => m.follows);
  return clampTempo(first?.bpm ?? DEFAULT_BPM);
}

export type TempoSource = 'midi' | 'song' | 'patch';
export interface TempoBoss { source: 'midi' | 'song'; bpm: number }

export interface TempoPlan {
  bpm: number;
  source: TempoSource;
  /** Knoppen die naar `bpm` moeten. */
  writes: { moduleId: string; bpm: number }[];
  /** `patch.tempo` moet dit worden (of blijft als het gelijk is). */
  patchTempo: number;
}

/**
 * Wat er moet gebeuren. `prev` is dezelfde patch bij de vorige keer (om te
 * zien of iemand aan een knop draaide); `boss` is de MIDI-clock of de song,
 * of null.
 */
export function reconcileTempo(project: ModularProject, patch: Patch, prev: Patch | null, boss: TempoBoss | null): TempoPlan {
  const mods = tempoModules(project, patch).filter((m) => m.follows);
  let bpm: number, source: TempoSource;
  if (boss) {
    bpm = clampTempo(boss.bpm); source = boss.source;
  } else {
    source = 'patch';
    // Draaide iemand aan een volgende knop (en niet aan het patchtempo zelf)?
    const before = prev && prev.id === patch.id ? new Map(tempoModules(project, prev).map((m) => [m.id, m.bpm])) : null;
    const turned = before && prev?.tempo === patch.tempo
      ? mods.find((m) => before.has(m.id) && !same(before.get(m.id)!, m.bpm)) : undefined;
    bpm = turned ? clampTempo(turned.bpm) : patchTempoOf(project, patch);
  }
  return {
    bpm, source, patchTempo: bpm,
    writes: mods.filter((m) => !same(m.bpm, bpm)).map((m) => ({ moduleId: m.id, bpm })),
  };
}

// ── tap tempo ─────────────────────────────────────────────────────────────
/** Gemiddelde van de laatste vier intervallen; na 2 s stilte opnieuw. */
export class TapTempo {
  private taps: number[] = [];
  tap(nowMs: number): number | null {
    if (this.taps.length && nowMs - this.taps[this.taps.length - 1]! > 2000) this.taps = [];
    this.taps.push(nowMs);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1]! - this.taps[0]!;
    return clampTempo(60_000 / (span / (this.taps.length - 1)));
  }
  get count(): number { return this.taps.length; }
}

// ── MIDI-clock ────────────────────────────────────────────────────────────
/** 24 tikken per tel; het tempo over de laatste tel, afgevlakt. */
export class ClockTempo {
  private ticks: number[] = [];
  private smooth: number | null = null;
  tick(nowMs: number): void {
    if (this.ticks.length && nowMs - this.ticks[this.ticks.length - 1]! > 500) { this.ticks = []; this.smooth = null; }
    this.ticks.push(nowMs);
    if (this.ticks.length > 25) this.ticks.shift();
    if (this.ticks.length === 25) {
      const bpm = 60_000 / (this.ticks[24]! - this.ticks[0]!);
      this.smooth = this.smooth === null ? bpm : this.smooth + (bpm - this.smooth) * 0.2;
    }
  }
  /** Het tempo als de klok loopt (laatste tik < 0,5 s oud), anders null. */
  bpm(nowMs: number): number | null {
    const last = this.ticks[this.ticks.length - 1];
    if (last === undefined || nowMs - last > 500 || this.smooth === null) return null;
    return clampTempo(this.smooth);
  }
}
