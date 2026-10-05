// De opname bedienen van buiten het simulatiepaneel (de speelmodus heeft de
// Simulatie-tab niet in beeld). De recorder zelf en alles wat erbij hoort
// (WAV, .mid, patch, de laatste take voor de library) blijven in
// SimulationPanel, dat altijd gemount is; dit is alleen het doorgeefluik:
// het paneel meldt zijn stand en zijn start/stop, RecordButton leest ze.
// Eén recorder, één knop, op twee plekken.

import { useSyncExternalStore } from 'react';

export interface RecordState {
  recording: boolean;
  /** Seconden van de lopende opname. */
  secs: number;
  /** Nabeschouwing van de laatste opname ("naam.wav · 12,0 s · piek …"). */
  done: string | null;
  error: string | null;
}

let state: RecordState = { recording: false, secs: 0, done: null, error: null };
let handlers: { start: () => Promise<void>; stop: () => Promise<void> } | null = null;
const listeners = new Set<() => void>();

/** Door het simulatiepaneel: de actuele stand. */
export function publishRecordState(next: RecordState): void {
  if (next.recording === state.recording && next.secs === state.secs && next.done === state.done && next.error === state.error) return;
  state = next;
  listeners.forEach((fn) => fn());
}

/** Door het simulatiepaneel: wie start en stopt. Geeft de afmelder terug. */
export function bindRecordHandlers(h: { start: () => Promise<void>; stop: () => Promise<void> }): () => void {
  handlers = h;
  return () => { if (handlers === h) handlers = null; };
}

export function toggleRecording(): void {
  if (!handlers) return;
  void (state.recording ? handlers.stop() : handlers.start());
}

export function recordAvailable(): boolean { return handlers !== null; }

export function useRecordState(): RecordState {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => state,
  );
}
