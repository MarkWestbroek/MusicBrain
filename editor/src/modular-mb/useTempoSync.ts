// De tempokoppeling (doc/plans/tempo.md): één tempo per patch, en elke
// tempoknop die volgt gaat mee. Draait één keer in de app (ModularMbApp).
//
// Wie beslist: MIDI-clock (als "volgen" aan staat en de klok loopt) > de song
// van de vierspoorsrecorder (zodra die sporen heeft) > het patchtempo.
//
//   • Patchtempo en song: de knoppen gaan via setPatchControl (de patch, de
//     simulator en de Teensy) en `patch.tempo` komt in de patch.
//   • MIDI-clock: alleen live (engine + Teensy-poke), niet in de patch, zodat
//     een DAW-klok die een fractie verloopt de patch niet steeds "gewijzigd"
//     maakt. Stopt de klok, dan gaan de knoppen terug naar de patch.

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { setPatchControl } from './setPatchControl';
import { getEngine } from './sim/engineSingleton';
import { midiMonitor } from './sim/midiMonitor';
import { getSongTransport } from './sim/SongTransport';
import { getProject, updateProject, useModularProject } from './store';
import { sendControlPoke } from './teensyLink';
import { ClockTempo, patchTempoOf, reconcileTempo, tempoModules, type TempoBoss, type TempoSource } from './tempo';
import type { Patch } from './types';

// ── gedeelde stand: MIDI-clock volgen, en wie nu de baas is ────────────────
const FOLLOW_KEY = 'mb.tempo.midiclock';
const clock = new ClockTempo();
let followMidi = (() => { try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch { return false; } })();
let current: { bpm: number; source: TempoSource } = { bpm: 120, source: 'patch' };
const listeners = new Set<() => void>();
const emit = (): void => { for (const l of listeners) l(); };
let lastSeenId = 0;

export function subscribeTempo(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function tempoNow(): { bpm: number; source: TempoSource } { return current; }
export function followsMidiClock(): boolean { return followMidi; }
export function setFollowMidiClock(on: boolean): void {
  followMidi = on;
  try { localStorage.setItem(FOLLOW_KEY, on ? '1' : '0'); } catch { /* geen opslag */ }
  if (on) void midiMonitor.startRaw();
  emit();
}
export function useTempoNow(): { bpm: number; source: TempoSource } { return useSyncExternalStore(subscribeTempo, tempoNow); }

/** Het patchtempo zetten (TAP, het getal): de koppeling neemt de knoppen mee. */
export function setPatchTempo(bpm: number): void {
  updateProject((p) => ({
    ...p,
    patches: p.patches.map((x) => (x.id === p.activePatchId ? { ...x, tempo: Math.round(bpm * 10) / 10 } : x)),
  }), { forceCommit: true });
}
/** Een module op eigen tempo zetten of weer laten volgen. */
export function setTempoOwn(moduleId: string, own: boolean): void {
  updateProject((p) => ({
    ...p,
    patches: p.patches.map((x) => {
      if (x.id !== p.activePatchId) return x;
      const set = new Set(x.tempoOwn ?? []);
      if (own) set.add(moduleId); else set.delete(moduleId);
      return { ...x, tempoOwn: set.size ? [...set] : undefined };
    }),
  }), { forceCommit: true });
}

function midiBoss(): TempoBoss | null {
  if (!followMidi) return null;
  const bpm = clock.bpm(performance.now());
  return bpm === null ? null : { source: 'midi', bpm };
}
function songBoss(): TempoBoss | null {
  const s = getSongTransport().song;
  return s.tracks.some((t) => t.audio) ? { source: 'song', bpm: s.bpm } : null;
}

/** In de app: houdt de tempoknoppen bij het ene tempo van de patch. */
export function useTempoSync(): void {
  const project = useModularProject();
  const patch = project.patches.find((x) => x.id === project.activePatchId);
  const prev = useRef<Patch | null>(null);
  const midiLive = useRef<Map<string, number>>(new Map());
  const transport = getSongTransport();
  const song = useSyncExternalStore(transport.subscribe.bind(transport), () => transport.getState().song);
  const applyRef = useRef<() => void>(() => undefined);

  // MIDI-clock: de tikken uit de ruwe ingang; tweemaal per seconde opnieuw
  // afwegen, zodat een stoppende klok de baas overdraagt en een verlopende
  // klok de knoppen meeneemt.
  useEffect(() => {
    if (followMidi) void midiMonitor.startRaw();
    const read = (): void => {
      for (const e of midiMonitor.list()) {
        if (e.id <= lastSeenId) continue;
        lastSeenId = e.id;
        if (e.dir === 'in' && e.bytes[0] === 0xF8) clock.tick(e.t);
      }
    };
    const unsub = midiMonitor.subscribe(read);
    const timer = window.setInterval(() => { if (followMidi || midiLive.current.size) applyRef.current(); }, 500);
    return () => { unsub(); window.clearInterval(timer); };
  }, []);

  function apply(): void {
    const proj = getProject();
    const p = proj.patches.find((x) => x.id === proj.activePatchId);
    if (!p) return;
    const midi = midiBoss();
    const boss = midi ?? songBoss();
    const plan = reconcileTempo(proj, p, prev.current?.id === p.id ? prev.current : null, boss);
    prev.current = p;
    const changed = plan.bpm !== current.bpm || plan.source !== current.source;
    current = { bpm: plan.bpm, source: plan.source };
    if (plan.source === 'midi') {
      // Alleen live; niet in de patch.
      const engine = getEngine();
      for (const m of tempoModules(proj, p).filter((x) => x.follows)) {
        if (Math.abs((midiLive.current.get(m.id) ?? -1) - plan.bpm) < 0.06) continue;
        midiLive.current.set(m.id, plan.bpm);
        engine.updateControl(m.id, 'tempo', plan.bpm);
        void sendControlPoke(m.id, 'tempo', plan.bpm);
      }
    } else {
      if (midiLive.current.size) {
        // De klok is gestopt: terug naar wat de patch zegt.
        const engine = getEngine();
        for (const [id] of midiLive.current) {
          const v = Number(p.controlState[id]?.tempo ?? plan.bpm);
          engine.updateControl(id, 'tempo', v);
          void sendControlPoke(id, 'tempo', v);
        }
        midiLive.current.clear();
      }
      for (const w of plan.writes) setPatchControl(p.id, w.moduleId, 'tempo', w.bpm);
      // `patch.tempo` alleen schrijven als er echt iets veranderde (een
      // verdraaide knop, de song); een afgeleid tempo laat de patch schoon.
      const stored = p.tempo ?? patchTempoOf(proj, p);
      if (Math.abs(stored - plan.patchTempo) >= 0.06) {
        updateProject((pr) => ({ ...pr, patches: pr.patches.map((x) => (x.id === p.id ? { ...x, tempo: plan.patchTempo } : x)) }), { skipHistory: true });
      }
    }
    if (changed) emit();
  }

  applyRef.current = apply;
  // Bij elke wijziging van de patch of de song opnieuw afwegen.
  useEffect(() => { apply(); }, [patch, song.bpm, song.tracks]);   // eslint-disable-line react-hooks/exhaustive-deps
}
