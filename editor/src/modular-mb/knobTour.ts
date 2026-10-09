// Knoptour: het instrument speelt een frase en draait intussen aan één knop,
// zodat je hoort wat hij doet (doc/plans/help-en-instrumenttour.md, deel B,
// stap 1: ▶ per knopregel in het uitlegblad).
//
// Het draaien is een preview: dezelfde doelen als setPatchControl (poly-
// fan-out en stereoparen via writePatchControl), live naar de engine en de
// Teensy, maar niet in de patch. Zo komt er geen Bewaar-knop en geen undo-
// punt. Bij stoppen gaat de knop terug naar zijn patchwaarde; "Houden" in de
// pauze zet de waarde van dat moment via setPatchControl wél in de patch.

import { useSyncExternalStore } from 'react';

import { patchModulesInSignalOrder } from './frontLayout';
import { setPatchControl, writePatchControl } from './setPatchControl';
import { getEngine } from './sim/engineSingleton';
import { getProject } from './store';
import { fromTaper, toTaper } from './taper';
import { patchTempoOf } from './tempo';
import { sendControlPoke } from './teensyLink';
import { defaultValueOf, resolveControls, type Control, type ControlValue } from './types';

// ── zuiver: het verloop van één knop ─────────────────────────────────────

/** Knoppen die de tour kan laten horen. Een knop (button) is een moment,
 *  geen bereik; joystick en exotisch slaan we over. */
export function tourable(c: Control): boolean {
  return c.kind === 'knob' || c.kind === 'slider' || c.kind === 'switch' || c.kind === 'toggle';
}

export const SWEEP_MS = 8000;

/** Waarde van de knop op tijd `ms` van de zwaai, vanaf `orig`. Een knop of
 *  schuif: naar het minimum, langzaam naar het maximum, terug naar `orig`
 *  (in knopstand, dus logaritmisch voor Hz). Een schakelaar loopt zijn
 *  standen af en eindigt op `orig`. `range` = het deelbereik van het front. */
export function sweepValue(c: Control, orig: ControlValue, ms: number, range?: { min: number; max: number }): ControlValue {
  const t = Math.max(0, Math.min(1, ms / SWEEP_MS));
  if (c.kind === 'switch') {
    const n = c.positions.length;
    const start = typeof orig === 'number' ? orig : 0;
    const k = Math.min(n, Math.floor(t * (n + 1)));          // n+1 vakjes: elke stand, dan terug
    return (start + k) % n;
  }
  if (c.kind === 'toggle') {
    const on = Boolean(orig);
    return t < 0.33 ? !on : t < 0.66 ? on : t < 0.95 ? !on : on;
  }
  if (c.kind !== 'knob' && c.kind !== 'slider') return orig;
  const r = { ...c, min: range?.min ?? c.min, max: range?.max ?? c.max };
  const o = typeof orig === 'number' ? Math.max(0, Math.min(1, toTaper(orig, r))) : 0.5;
  // Keerpunten in knopstand: orig → 0 (20 %) → 1 (70 %) → orig (100 %).
  const ease = (a: number, b: number, u: number): number => a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  const pos = t < 0.2 ? ease(o, 0, t / 0.2) : t < 0.7 ? ease(0, 1, (t - 0.2) / 0.5) : ease(1, o, (t - 0.7) / 0.3);
  let v = fromTaper(pos, r);
  if ('step' in c && c.step) v = Math.round(v / c.step) * c.step;
  return v;
}

/** Wat de tour speelt. Een patch die zelf noten maakt (ritmebox,
 *  sequencer) krijgt niets; met een arpeggiator houden we een akkoord vast;
 *  anders een gebroken akkoord in kwartnoten op het tempo van de patch. */
export type Phrase = { kind: 'none' } | { kind: 'hold'; notes: number[] } | { kind: 'arp'; notes: number[]; stepMs: number };
const SELF_PLAYING = new Set(['tp_mmb_rhythm', 'tp_mmb_marbles', 'tp_mmb_seq8', 'tp_mmb_grids', 'tp_mmb_euclid', 'tp_mmb_turing', 'tp_mmb_percuter']);
export function phraseFor(typeIds: readonly string[], bpm: number): Phrase {
  if (typeIds.some((t) => SELF_PLAYING.has(t))) return { kind: 'none' };
  if (typeIds.includes('tp_mmb_arp')) return { kind: 'hold', notes: [48, 55, 60, 64] };
  return { kind: 'arp', notes: [48, 55, 60, 64, 67, 64, 60, 55], stepMs: Math.round(60000 / Math.max(40, Math.min(240, bpm))) };
}

// ── de speler ─────────────────────────────────────────────────────────────

export interface KnobTourState {
  status: 'idle' | 'playing' | 'paused';
  patchId: string; moduleId: string; controlId: string;
  label: string; help: string | null;
  /** De previewwaarde op dit moment; het front toont hem in plaats van de patchwaarde. */
  value: ControlValue | null;
}
const IDLE: KnobTourState = { status: 'idle', patchId: '', moduleId: '', controlId: '', label: '', help: null, value: null };

let state: KnobTourState = IDLE;
const subs = new Set<() => void>();
const emit = (s: KnobTourState): void => { state = s; for (const f of subs) f(); };
export function getKnobTour(): KnobTourState { return state; }
export function useKnobTour(): KnobTourState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getKnobTour, getKnobTour);
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let noteTimer: ReturnType<typeof setTimeout> | null = null;
let held: number[] = [];
let elapsed = 0, lastTick = 0;
let ctx: { c: Control; orig: ControlValue; range?: { min: number; max: number }; targets: string[] } | null = null;

/** De waarde op alle doelen, live, buiten de patch om. */
function preview(controlId: string, targets: readonly string[], v: ControlValue): void {
  const engine = getEngine();
  for (const id of targets) {
    engine.updateControl(id, controlId, v);
    if (typeof v === 'number' || typeof v === 'boolean') void sendControlPoke(id, controlId, v);
  }
}

function stopNotes(): void {
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = null;
  const engine = getEngine();
  for (const n of held) engine.noteOff(n);
  held = [];
}

function startNotes(ph: Phrase): void {
  const engine = getEngine();
  if (ph.kind === 'hold') {
    for (const n of ph.notes) { engine.noteOn(n, 0.8); held.push(n); }
    return;
  }
  if (ph.kind !== 'arp') return;
  let i = 0;
  const step = (): void => {
    const n = ph.notes[i % ph.notes.length]!;
    i += 1;
    engine.noteOn(n, i % 4 === 1 ? 0.9 : 0.7);
    held.push(n);
    const off = setTimeout(() => { engine.noteOff(n); held = held.filter((x) => x !== n); }, ph.stepMs * 0.85);
    void off;
    noteTimer = setTimeout(step, ph.stepMs);
  };
  step();
}

function tick(): void {
  if (!ctx || state.status !== 'playing') return;
  const now = performance.now();
  elapsed += now - lastTick;
  lastTick = now;
  const v = sweepValue(ctx.c, ctx.orig, elapsed, ctx.range);
  if (v !== state.value) { preview(state.controlId, ctx.targets, v); emit({ ...state, value: v }); }
  if (elapsed >= SWEEP_MS) stopKnobTour();
}

/** Start de tour voor één knop van de actieve patch. */
export async function startKnobTour(opts: {
  patchId: string; moduleId: string; controlId: string; label: string; help: string | null;
  range?: { min: number; max: number };
}): Promise<void> {
  stopKnobTour();
  const project = getProject();
  const patch = project.patches.find((p) => p.id === opts.patchId);
  const mod = project.modules.find((m) => m.id === opts.moduleId);
  const c = mod ? resolveControls(mod, project.moduleTypes).find((x) => x.id === opts.controlId) : undefined;
  if (!patch || !mod || !c || !tourable(c)) return;
  const { targets } = writePatchControl(project, patch.id, mod.id, c.id, 0, { twins: true });
  const orig = patch.controlState[mod.id]?.[c.id] ?? defaultValueOf(c);
  ctx = { c, orig, range: opts.range, targets };
  const engine = getEngine();
  try { await engine.start(); } catch { /* geen audio: de knop draait toch */ }
  const typeIds = patchModulesInSignalOrder(patch, project).map((m) => m.typeId);
  startNotes(phraseFor(typeIds, patchTempoOf(project, patch)));
  elapsed = 0; lastTick = performance.now();
  emit({ status: 'playing', patchId: patch.id, moduleId: mod.id, controlId: c.id, label: opts.label, help: opts.help, value: orig });
  sweepTimer = setInterval(tick, 30);
}

/** ⏸ / ▶: de knop staat stil op zijn waarde; de frase speelt door. */
export function toggleKnobTourPause(): void {
  if (state.status === 'playing') emit({ ...state, status: 'paused' });
  else if (state.status === 'paused') { lastTick = performance.now(); emit({ ...state, status: 'playing' }); }
}

/** Houden: de waarde van nu gaat via het gewone pad de patch in (Bewaren
 *  en Bewaar als… werken daarna zoals altijd); de tour stopt. */
export function keepKnobTour(): void {
  if (state.status === 'idle' || state.value === null) return;
  const { patchId, moduleId, controlId, value } = state;
  ctx = null;   // niet terugzetten
  stopKnobTour();
  setPatchControl(patchId, moduleId, controlId, value, { twins: true });
}

/** Stoppen: de knop terug naar zijn patchwaarde. */
export function stopKnobTour(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
  stopNotes();
  if (ctx && state.status !== 'idle') {
    const patch = getProject().patches.find((p) => p.id === state.patchId);
    const back = patch?.controlState[state.moduleId]?.[state.controlId] ?? ctx.orig;
    preview(state.controlId, ctx.targets, back);
  }
  ctx = null;
  if (state.status !== 'idle') emit(IDLE);
}

/** Jij wint: draai je zelf aan de knop die de tour draait, dan stopt de tour
 *  zonder terug te zetten (jouw waarde staat al in de patch). */
export function knobTourUserTouched(moduleId: string, controlId: string): void {
  if (state.status === 'idle' || state.moduleId !== moduleId || state.controlId !== controlId) return;
  ctx = null;
  stopKnobTour();
}
