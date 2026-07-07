// Control-surface-bridge (ED-CS-2) — WebMIDI ↔ MMB voor een motorized
// controller (Roto-Control). Zie doc/plans/control-surface.md.
//
// Inkomend (surface → MMB): een CC op de gekozen MIDI-input wordt via de
// projectbindings (project.midiMap) vertaald naar één module-control. De
// bridge werkt de editor-controlState bij (de patcher-knop beweegt mee op
// het scherm) én stuurt een controlPoke naar de Teensy — hetzelfde
// firmware-pad als de midiMap standalone gebruikt (FW-CS-1/FW-LIVE-1).
// Er wordt bewust géén rauwe CC doorgestuurd: dan zou de firmware de
// binding nogmaals toepassen en zou de editor-state achterlopen.
//
// Uitgaand (MMB → surface, de motorized feedback): een store-subscription
// diff't na elke projectwijziging de gebonden controlwaardes en stuurt
// veranderde waardes als CC naar de gekozen MIDI-output. Dat dekt
// patcher-knopdrags, preset/patch-wissels en undo/redo. Echo-onderdrukking:
// een waarde die net (< 300 ms) met dezelfde 7-bit waarde van het surface
// binnenkwam wordt niet teruggestuurd, anders vecht de motor met de hand
// van de speler (zelfde bugklasse als de note-echo-loop in main.cpp).
//
// Kanaalconventie: bindings gebruiken 1–16 (0 = omni), gelijk aan wat
// usbMIDI firmware-kant aanlevert. Omni-bindings zenden feedback op kanaal 1.

import { useSyncExternalStore } from 'react';
import { getProject, updateProject, subscribe as subscribeStore } from './store';
import { sendControlPoke } from './teensyLink';
import { polyControlTargets } from './polyExpand';
import { resolveControls } from './types';
import type { MidiBinding, ModularProject, Patch } from './types';

// ── State ────────────────────────────────────────────────────────────────

export interface MidiPortInfo { id: string; name: string }

export interface SurfaceBridgeState {
  supported: boolean;
  connected: boolean;          // WebMIDI-access verkregen
  inputs:  MidiPortInfo[];
  outputs: MidiPortInfo[];
  inputId:  string | null;
  outputId: string | null;
  /** Laatst ontvangen CC op de gekozen input — voor de UI en debugging. */
  lastCc?: { ch: number; cc: number; val: number; ts: number };
  /** Learn-modus actief: de eerstvolgende CC vult een binding-rij. */
  learning: boolean;
  error?: string;
}

let state: SurfaceBridgeState = {
  supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
  connected: false,
  inputs: [], outputs: [],
  inputId: null, outputId: null,
  learning: false,
};

const listeners = new Set<() => void>();
function emit(): void { for (const l of listeners) l(); }
function setState(next: Partial<SurfaceBridgeState>): void {
  state = { ...state, ...next };
  emit();
}

let access: MIDIAccess | null = null;
let input:  MIDIInput  | null = null;
let output: MIDIOutput | null = null;
let learnCb: ((ch: number, cc: number) => void) | null = null;

// Echo-onderdrukking + tx-dedupe, gekeyed per binding (ch:cc).
const lastRx = new Map<string, { v7: number; ts: number }>();
const lastTx = new Map<string, number>();
const ECHO_WINDOW_MS = 300;

function bindKey(b: MidiBinding): string { return `${b.ch}:${b.cc}`; }

// De Teensy enumereert zijn eigen USB-MIDI-poort; daar mag de bridge nooit
// aan hangen (lus). Zelfde heuristiek als sim/MidiSource.ts.
function isOwnDevicePort(p: MIDIInput | MIDIOutput): boolean {
  const hay = `${p.name ?? ''} ${p.manufacturer ?? ''}`.toLowerCase();
  return hay.includes('teensy') || hay.includes('musicbrain');
}

// ── Waarde ↔ CC-schaal (spiegel van firmware MidiMap::scale) ────────────

function ccToValue(b: MidiBinding, v7: number): number {
  let t = v7 / 127;
  if (b.curve === 'exp') t = t * t;
  let v = b.min + (b.max - b.min) * t;
  // Integer-controls (DX7 bank/program: step 1) krijgen hele waardes —
  // dezelfde kwantisatie als de knopdrag in de patcher.
  if (b.step && b.step > 0) {
    v = b.min + Math.round((v - b.min) / b.step) * b.step;
    v = Math.max(Math.min(b.min, b.max), Math.min(Math.max(b.min, b.max), v));
  }
  return v;
}

function valueToCc(b: MidiBinding, v: number): number {
  const span = b.max - b.min;
  let t = span !== 0 ? (v - b.min) / span : 0;
  t = Math.max(0, Math.min(1, t));
  if (b.curve === 'exp') t = Math.sqrt(t);
  return Math.round(t * 127);
}

// ── Actieve patch + gebonden waarde ──────────────────────────────────────

function activePatchOf(p: ModularProject): Patch | undefined {
  return p.patches.find((x) => x.id === p.activePatchId) ?? p.patches[0];
}

/** Huidige waarde van de gebonden control: controlState van de actieve
 *  patch, met de control-default als fallback. Alleen numerieke waardes
 *  (continue controls) doen mee; switch/toggle is een latere uitbreiding. */
function boundValue(p: ModularProject, patch: Patch, b: MidiBinding): number | null {
  const cs = patch.controlState[b.mod]?.[b.ctrl];
  if (typeof cs === 'number') return cs;
  if (cs !== undefined) return null;
  const mod = p.modules.find((m) => m.id === b.mod);
  if (!mod) return null;
  const ctrl = resolveControls(mod, p.moduleTypes).find((c) => c.id === b.ctrl);
  if (!ctrl) return null;
  if (ctrl.kind === 'knob' || ctrl.kind === 'slider' || ctrl.kind === 'exotic') {
    return ctrl.defaultValue;
  }
  return null;
}

// ── Inkomend: surface → editor-state + Teensy ────────────────────────────

function applyIncomingCc(ch1: number, cc: number, val: number): void {
  const p = getProject();
  const b = (p.midiMap?.bindings ?? [])
    .find((x) => x.cc === cc && (x.ch === 0 || x.ch === ch1));
  if (!b) return;

  lastRx.set(bindKey(b), { v7: val, ts: Date.now() });
  // Wat binnenkwam hoeft niet terug: markeer als "al verzonden".
  lastTx.set(bindKey(b), val);

  const v = ccToValue(b, val);
  const patch = activePatchOf(p);
  // Poly-fan-out: een binding op een master geldt voor alle stemmen van de
  // groep — zelfde semantiek als setControl in PatcherGraphPanel, anders
  // wisselt bv. een DX7-program maar op 1 van de 8 stemmen.
  const targets = patch ? polyControlTargets(patch, p, b.mod) : [b.mod];
  if (patch) {
    updateProject((px) => ({
      ...px,
      patches: px.patches.map((pa) => {
        if (pa.id !== patch.id) return pa;
        const cs = { ...pa.controlState };
        for (const id of targets) cs[id] = { ...(cs[id] ?? {}), [b.ctrl]: v };
        return { ...pa, controlState: cs };
      }),
    }));
  }
  for (const id of targets) void sendControlPoke(id, b.ctrl, v);
}

function onMidiMessage(ev: MIDIMessageEvent): void {
  const d = ev.data;
  if (!d || d.length < 3) return;
  const status = d[0]! & 0xf0;
  if (status !== 0xb0) return;               // alleen control change
  const ch1 = (d[0]! & 0x0f) + 1;
  const cc  = d[1]!;
  const val = d[2]!;
  setState({ lastCc: { ch: ch1, cc, val, ts: Date.now() } });
  if (learnCb) {
    const cb = learnCb;
    learnCb = null;
    setState({ learning: false });
    cb(ch1, cc);
    return;                                   // learn consumeert de CC
  }
  applyIncomingCc(ch1, cc, val);
}

// ── Uitgaand: editor-state → surface (motorized feedback) ───────────────

function diffAndSend(): void {
  if (!output) return;
  const p = getProject();
  const bindings = p.midiMap?.bindings ?? [];
  if (bindings.length === 0) return;
  const patch = activePatchOf(p);
  if (!patch) return;
  const now = Date.now();
  for (const b of bindings) {
    const v = boundValue(p, patch, b);
    if (v === null) continue;
    const v7  = valueToCc(b, v);
    const key = bindKey(b);
    if (lastTx.get(key) === v7) continue;     // ongewijzigd
    lastTx.set(key, v7);
    const rx = lastRx.get(key);
    if (rx && rx.v7 === v7 && now - rx.ts < ECHO_WINDOW_MS) continue;  // echo
    // Omni-binding (ch 0): feedback op kanaal 1.
    output.send([0xb0 | ((b.ch || 1) - 1), b.cc, v7]);
  }
}

// Levensduur = editor-sessie; doet niets zolang er geen output gekozen is.
subscribeStore(diffAndSend);

/** Stuur alle gebonden waardes opnieuw (initiële sync / "snap"). */
export function syncSurface(): void {
  lastTx.clear();
  diffAndSend();
}

// ── Persistentie van de poortkeuze ───────────────────────────────────────
// De gekozen in-/output overleeft een reload: id (stabiel per browser) met
// de poortnaam als fallback. Herstel gebeurt in refreshPorts(), dus ook als
// het apparaat pas ná het laden wordt ingeplugd (statechange).

const PORTS_STORAGE_KEY = 'mmb.surface.v1';

interface PersistedPorts {
  inputId?: string;  inputName?: string;
  outputId?: string; outputName?: string;
}

function persistPorts(): void {
  try {
    const saved: PersistedPorts = {
      inputId:    state.inputId  ?? undefined,
      inputName:  state.inputs.find((p) => p.id === state.inputId)?.name,
      outputId:   state.outputId ?? undefined,
      outputName: state.outputs.find((p) => p.id === state.outputId)?.name,
    };
    localStorage.setItem(PORTS_STORAGE_KEY, JSON.stringify(saved));
  } catch { /* private mode/quota: geen persistentie */ }
}

function loadPersistedPorts(): PersistedPorts | null {
  try {
    const raw = localStorage.getItem(PORTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedPorts : null;
  } catch { return null; }
}

function tryRestorePorts(): void {
  const saved = loadPersistedPorts();
  if (!saved) return;
  if (!state.inputId && (saved.inputId || saved.inputName)) {
    const m = state.inputs.find((p) => p.id === saved.inputId)
           ?? state.inputs.find((p) => p.name === saved.inputName);
    if (m) selectSurfaceInput(m.id);
  }
  if (!state.outputId && (saved.outputId || saved.outputName)) {
    const m = state.outputs.find((p) => p.id === saved.outputId)
           ?? state.outputs.find((p) => p.name === saved.outputName);
    if (m) selectSurfaceOutput(m.id);
  }
}

// ── Poortbeheer ──────────────────────────────────────────────────────────

function refreshPorts(): void {
  if (!access) return;
  const inputs:  MidiPortInfo[] = [];
  const outputs: MidiPortInfo[] = [];
  access.inputs.forEach((i) => {
    if (!isOwnDevicePort(i)) inputs.push({ id: i.id, name: i.name ?? i.id });
  });
  access.outputs.forEach((o) => {
    if (!isOwnDevicePort(o)) outputs.push({ id: o.id, name: o.name ?? o.id });
  });
  // Verdwenen selecties loslaten.
  const inputId  = inputs.some((x) => x.id === state.inputId)   ? state.inputId  : null;
  const outputId = outputs.some((x) => x.id === state.outputId) ? state.outputId : null;
  if (inputId  === null && input)  { input.onmidimessage = null; input = null; }
  if (outputId === null)           { output = null; }
  setState({ inputs, outputs, inputId, outputId });
  // Bewaarde keuze herstellen zodra de poort(en) er zijn — ook wanneer het
  // surface pas na het laden wordt ingeplugd.
  tryRestorePorts();
}

export async function connectSurface(): Promise<void> {
  if (!state.supported) return;
  if (access) { refreshPorts(); return; }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = refreshPorts;
    setState({ connected: true, error: undefined });
    refreshPorts();
  } catch (err) {
    setState({ error: (err as Error).message });
  }
}

export function selectSurfaceInput(id: string | null): void {
  if (input) { input.onmidimessage = null; input = null; }
  if (access && id) {
    const port = access.inputs.get(id) ?? null;
    if (port) { port.onmidimessage = onMidiMessage; input = port; }
  }
  setState({ inputId: input ? id : null });
  persistPorts();
}

export function selectSurfaceOutput(id: string | null): void {
  output = access && id ? access.outputs.get(id) ?? null : null;
  setState({ outputId: output ? id : null });
  persistPorts();
  // Nieuwe output → knoppen meteen naar de huidige stand laten draaien.
  if (output) syncSurface();
}

// Auto-herstel na een reload: alleen wanneer er een eerdere poortkeuze
// bewaard is én de browser de MIDI-permissie al verleend heeft — dan opent
// requestMIDIAccess() zonder prompt en herstelt refreshPorts() de selectie
// (inclusief een knoppen-sync via selectSurfaceOutput).
if (state.supported && loadPersistedPorts()) {
  void (async () => {
    try {
      const perm = await navigator.permissions.query({ name: 'midi' as PermissionName });
      if (perm.state === 'granted') await connectSurface();
    } catch {
      // Permissions API kent 'midi' niet (oudere browser): dan handmatig
      // verbinden via de knop.
    }
  })();
}

// ── Learn ────────────────────────────────────────────────────────────────

/** Wapen learn-modus: de eerstvolgende CC op de input gaat naar @p cb
 *  (en wordt niet toegepast). Annuleer met disarmLearn(). */
export function armLearn(cb: (ch: number, cc: number) => void): void {
  learnCb = cb;
  setState({ learning: true });
}

export function disarmLearn(): void {
  learnCb = null;
  setState({ learning: false });
}

// ── React hook ───────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSurfaceBridge(): SurfaceBridgeState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
