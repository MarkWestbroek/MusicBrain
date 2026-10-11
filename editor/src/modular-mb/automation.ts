// Automation: knopbewegingen in de opname (ED-SM-10, doc/plans/automation.md).
//
// Opnemen: zolang ⏺ loopt schrijft de recorder elke controlwijziging mee die
// via setPatchControl gaat (muis op front of patcher, Roto-Control, een
// gebonden MIDI-knop). Hoogstens één waarde per knop per 10 ms; de eerste
// aanraking zet ook de stand van vóór de beweging op t = 0, zodat afspelen
// vanaf het begin klopt.
//
// Bewaren: `<take>.auto.json` naast wav, mid en patch.json. Gebonden knoppen
// gaan er ook als CC in de .mid bij, zodat een DAW ze als CC-lane ziet.
//
// Afspelen: via het previewpad (controlPreview.ts), niet via de patch. De
// panelen tonen de waarde (de knoppen draaien mee); bij stoppen gaat alles
// terug op de patchwaarde. Draai je tijdens het afspelen zelf aan een knop,
// dan wint jij: die knop speelt niet meer mee tot de volgende start.
//
// Een take kan op een andere patch landen dan waarop hij is opgenomen (de
// patch uit de library krijgt nieuwe id's). Elke knop staat daarom ook als
// (moduletype, volgnummer van dat type in de patch) in het bestand; daarmee
// vindt het afspelen de module terug.

import { previewControl, showControl } from './controlPreview';
import { onControlWrite, writePatchControl, type ControlWrite } from './setPatchControl';
import { valueToCc } from './surfaceBridge';
import { defaultValueOf, resolveControls, type ControlValue, type MidiBinding, type ModularProject, type Patch } from './types';
import type { MidiEvent } from './sim/midiRecorder';

export interface AutomationEvent {
  /** ms vanaf het begin van de take (zoals MidiEvent). */
  t: number;
  /** De module waar je aan draaide (bij poly: de master). */
  moduleId: string;
  controlId: string;
  value: number | boolean;
  /** Front-knop van een stereopaar: schrijft naar allebei. */
  twins?: true;
}

export interface AutomationControlInfo {
  label: string;
  min?: number;
  max?: number;
  unit?: string;
  /** Om de module op een andere patch terug te vinden. */
  typeId: string;
  ordinal: number;
}

export interface AutomationFile {
  version: 1;
  patchId: string;
  lengthMs: number;
  /** Sleutel `moduleId/controlId`. */
  controls: Record<string, AutomationControlInfo>;
  events: AutomationEvent[];
  /** CC-lanes die ook in de .mid staan (gebonden knoppen); de speler slaat
   *  die CC's over, anders komt de beweging twee keer aan. */
  cc?: { ch: number; cc: number }[];
}

export const AUTOMATION_MIN_MS = 10;
export const keyOf = (moduleId: string, controlId: string): string => `${moduleId}/${controlId}`;

// ── opnemen ───────────────────────────────────────────────────────────────

export class AutomationRecorder {
  private events: AutomationEvent[] = [];
  /** Per knop: index van het laatste event dat nog bijgewerkt mag worden. */
  private last = new Map<string, number>();
  private t0 = 0;
  private patchId = '';
  private running = false;
  private defaultOf: (moduleId: string, controlId: string) => ControlValue | undefined = () => undefined;

  get active(): boolean { return this.running; }
  get count(): number { return this.events.length; }

  start(patchId: string, opts: { now?: number; defaultOf?: (moduleId: string, controlId: string) => ControlValue | undefined } = {}): void {
    this.events = []; this.last.clear();
    this.t0 = opts.now ?? performance.now();
    this.patchId = patchId;
    if (opts.defaultOf) this.defaultOf = opts.defaultOf;
    this.running = true;
  }

  /** Voor onControlWrite. */
  readonly record = (w: ControlWrite, now = performance.now()): void => {
    if (!this.running || w.patchId !== this.patchId) return;
    if (typeof w.value !== 'number' && typeof w.value !== 'boolean') return;
    const t = Math.max(0, now - this.t0);
    const key = keyOf(w.moduleId, w.controlId);
    const twins = w.twins ? { twins: true as const } : {};
    const li = this.last.get(key);
    if (li === undefined) {
      // Eerste aanraking: de stand van daarvoor op t = 0.
      const prev = w.prev ?? this.defaultOf(w.moduleId, w.controlId);
      if ((typeof prev === 'number' || typeof prev === 'boolean') && prev !== w.value)
        this.events.push({ t: 0, moduleId: w.moduleId, controlId: w.controlId, value: prev, ...twins });
    } else {
      const e = this.events[li]!;
      if (e.value === w.value) return;
      if (t - e.t < AUTOMATION_MIN_MS) { e.value = w.value; return; }
    }
    this.last.set(key, this.events.length);
    this.events.push({ t, moduleId: w.moduleId, controlId: w.controlId, value: w.value, ...twins });
  };

  /** Stopt en geeft de events op tijd terug. */
  stop(): AutomationEvent[] {
    this.running = false;
    const out = this.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
    this.events = []; this.last.clear();
    return out;
  }
}

/** Een recorder die meeluistert op setPatchControl; `dispose` haakt af. */
export function listenAutomation(rec: AutomationRecorder): () => void {
  return onControlWrite((w) => rec.record(w));
}

// ── bewaren ───────────────────────────────────────────────────────────────

/** Module-id's van de patch in rackvolgorde (rack, dan slot). */
function patchModuleIds(project: ModularProject, patch: Patch): string[] {
  const out: string[] = [];
  for (const rid of patch.rackIds) {
    const r = project.racks.find((x) => x.id === rid);
    for (const s of r?.slots ?? []) if (!out.includes(s.moduleId)) out.push(s.moduleId);
  }
  return out;
}

export function buildAutomationFile(
  project: ModularProject, patch: Patch, events: readonly AutomationEvent[], lengthMs: number,
): AutomationFile {
  const ids = patchModuleIds(project, patch);
  const controls: Record<string, AutomationControlInfo> = {};
  for (const e of events) {
    const key = keyOf(e.moduleId, e.controlId);
    if (controls[key]) continue;
    const m = project.modules.find((x) => x.id === e.moduleId);
    if (!m) continue;
    const c = resolveControls(m, project.moduleTypes).find((x) => x.id === e.controlId);
    const sameType = ids.filter((id) => project.modules.find((x) => x.id === id)?.typeId === m.typeId);
    controls[key] = {
      label: patch.controlLabels?.[m.id]?.[e.controlId] ?? c?.label ?? e.controlId,
      ...(c && (c.kind === 'knob' || c.kind === 'slider') ? { min: c.min, max: c.max, ...(c.unit ? { unit: c.unit } : {}) } : {}),
      typeId: m.typeId,
      ordinal: Math.max(0, sameType.indexOf(m.id)),
    };
  }
  return { version: 1, patchId: patch.id, lengthMs: Math.round(lengthMs), controls, events: events.filter((e) => controls[keyOf(e.moduleId, e.controlId)]) };
}

/** Gebonden knoppen als CC, voor de .mid. Eén binding per knop (de eerste). */
export function automationCc(file: AutomationFile, bindings: readonly MidiBinding[]): { events: MidiEvent[]; lanes: { ch: number; cc: number }[] } {
  const events: MidiEvent[] = [];
  const lanes: { ch: number; cc: number }[] = [];
  for (const e of file.events) {
    if (typeof e.value !== 'number') continue;
    const b = bindings.find((x) => x.mod === e.moduleId && x.ctrl === e.controlId);
    if (!b) continue;
    const ch = b.ch >= 1 && b.ch <= 16 ? b.ch : 1;
    const d2 = Math.max(0, Math.min(127, valueToCc(b, e.value)));
    const prev = [...events].reverse().find((x) => x.status === (0xB0 | (ch - 1)) && x.d1 === b.cc);
    if (prev && prev.d2 === d2) continue;
    events.push({ t: e.t, status: 0xB0 | (ch - 1), d1: b.cc, d2 });
    if (!lanes.some((l) => l.ch === ch && l.cc === b.cc)) lanes.push({ ch, cc: b.cc });
  }
  return { events, lanes };
}

/** De labels van de bewogen knoppen ("Cutoff, Drive"); zonder de beginstanden. */
export function movedLabels(file: AutomationFile): string[] {
  const seen = new Set<string>();
  for (const e of file.events) if (e.t > 0) seen.add(keyOf(e.moduleId, e.controlId));
  return [...seen].map((k) => file.controls[k]?.label ?? k);
}

export function parseAutomation(bytes: Uint8Array | string): AutomationFile {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
  const f = JSON.parse(text) as AutomationFile;
  if (!f || f.version !== 1 || !Array.isArray(f.events) || typeof f.controls !== 'object')
    throw new Error('Geen geldig automation-bestand (.auto.json).');
  return f;
}

// ── afspelen ──────────────────────────────────────────────────────────────

/** Wat de MIDI-speler met automation doet; los van engine en store te testen. */
export interface AutomationSink {
  apply(e: AutomationEvent): void;
  /** Alles terug op de patchwaarde; aangeroepen bij stoppen. */
  restore(): void;
  dispose?(): void;
}

/** Waar een knop uit het bestand op deze patch staat, of null. */
export function resolveTarget(
  file: AutomationFile, project: ModularProject, patch: Patch, moduleId: string,
): string | null {
  const ids = patchModuleIds(project, patch);
  if (ids.includes(moduleId)) return moduleId;
  const info = Object.entries(file.controls).find(([k]) => k.startsWith(`${moduleId}/`))?.[1];
  if (!info) return null;
  const sameType = ids.filter((id) => project.modules.find((x) => x.id === id)?.typeId === info.typeId);
  return sameType[info.ordinal] ?? null;
}

/** De echte sink: engine en Teensy via het previewpad, de panelen tonen het. */
export function automationSink(file: AutomationFile, getProject: () => ModularProject): AutomationSink {
  /** key → doelen waarop de waarde nu staat (om terug te zetten). */
  const touched = new Map<string, { patchId: string; moduleId: string; controlId: string; targets: string[] }>();
  /** Knoppen waar je zelf aan draaide tijdens het afspelen. */
  const yours = new Set<string>();
  const resolved = new Map<string, string | null>();   // patchId|moduleId → module op deze patch

  const unsub = onControlWrite((w) => {
    for (const [k, t] of touched) {
      if (t.patchId !== w.patchId || t.controlId !== w.controlId || !t.targets.includes(w.moduleId)) continue;
      yours.add(k);
      showControl(t.targets, t.controlId, undefined);
      touched.delete(k);
    }
  });

  return {
    apply(e) {
      const key = keyOf(e.moduleId, e.controlId);
      if (yours.has(key)) return;
      const project = getProject();
      const patch = project.patches.find((x) => x.id === project.activePatchId);
      if (!patch) return;
      const rk = `${patch.id}|${e.moduleId}`;
      if (!resolved.has(rk)) resolved.set(rk, resolveTarget(file, project, patch, e.moduleId));
      const mod = resolved.get(rk);
      if (!mod) return;
      const { targets } = writePatchControl(project, patch.id, mod, e.controlId, e.value, { twins: Boolean(e.twins) });
      if (targets.length === 0) return;
      previewControl(e.controlId, targets, e.value);
      showControl(targets, e.controlId, e.value);
      touched.set(key, { patchId: patch.id, moduleId: mod, controlId: e.controlId, targets });
    },
    restore() {
      const project = getProject();
      for (const t of touched.values()) {
        const patch = project.patches.find((x) => x.id === t.patchId);
        const m = project.modules.find((x) => x.id === t.moduleId);
        const c = m ? resolveControls(m, project.moduleTypes).find((x) => x.id === t.controlId) : undefined;
        const back = patch?.controlState[t.moduleId]?.[t.controlId] ?? (c ? defaultValueOf(c) : undefined);
        if (back !== undefined) previewControl(t.controlId, t.targets, back);
        showControl(t.targets, t.controlId, undefined);
      }
      touched.clear();
      yours.clear();
    },
    dispose() { this.restore(); unsub(); },
  };
}

// ── sporen (stap 2) ───────────────────────────────────────────────────────

/** Automation van een opname naar songtijd, zoals `midiToRegion`: `startMs`
 *  is waar het stuk in de opname begon, `lengthMs` hoe lang het is. De stand
 *  van vóór het begin komt op `offsetMs` ("chase"); wat erna komt valt weg. */
export function automationToRegion(events: readonly AutomationEvent[], startMs: number, lengthMs: number, offsetMs = 0): AutomationEvent[] {
  const before = new Map<string, AutomationEvent>();
  const inside: AutomationEvent[] = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const t = e.t - startMs;
    if (t < 0) { before.set(keyOf(e.moduleId, e.controlId), e); continue; }
    if (t >= lengthMs) continue;
    inside.push({ ...e, t: t + offsetMs });
  }
  return [...[...before.values()].map((e) => ({ ...e, t: offsetMs })), ...inside];
}

/** Drop-in: wat het spoor in [startMs, endMs) had gaat weg, het nieuwe stuk
 *  komt ervoor in de plaats. Op `endMs` gaat elke knop die in de regio
 *  bewoog terug naar de stand die het spoor daar had, zodat de rest van de
 *  song klinkt zoals hij was. */
export function spliceAutomation(base: readonly AutomationEvent[], piece: readonly AutomationEvent[], startMs: number, endMs: number): AutomationEvent[] {
  const kept = base.filter((e) => e.t < startMs || e.t >= endMs);
  const keys = new Map<string, AutomationEvent>();
  for (const e of [...piece, ...base.filter((x) => x.t >= startMs && x.t < endMs)]) {
    const k = keyOf(e.moduleId, e.controlId);
    if (!keys.has(k)) keys.set(k, e);
  }
  const restore: AutomationEvent[] = [];
  for (const [k, first] of keys) {
    if (kept.some((e) => e.t === endMs && keyOf(e.moduleId, e.controlId) === k)) continue;
    const was = base.filter((e) => e.t < endMs && keyOf(e.moduleId, e.controlId) === k).at(-1);
    // Had het spoor deze knop nooit: terug naar waar het nieuwe stuk begon.
    const from = was ?? piece.find((e) => keyOf(e.moduleId, e.controlId) === k) ?? first;
    restore.push({ ...from, t: endMs });
  }
  return [...kept, ...piece, ...restore].map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
}

/** Het automation-bestand van een spoor: labels en bereik uit de patch-
 *  momentopname van dat spoor. Null zonder events of zonder momentopname. */
export function trackAutomationFile(snapshot: ModularProject | null, events: readonly AutomationEvent[], lengthMs: number): AutomationFile | null {
  if (!snapshot || events.length === 0) return null;
  const patch = snapshot.patches.find((x) => x.id === snapshot.activePatchId) ?? snapshot.patches[0];
  return patch ? buildAutomationFile(snapshot, patch, events, lengthMs) : null;
}

/** Eén lijn per bewogen knop, om te tekenen: punten (t, 0..1) met de stand
 *  die blijft staan tot het volgende punt. */
export interface AutomationLane { key: string; label: string; points: { t: number; y: number }[] }
export function automationLanes(file: AutomationFile): AutomationLane[] {
  const by = new Map<string, AutomationEvent[]>();
  for (const e of file.events) {
    const k = keyOf(e.moduleId, e.controlId);
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  const lanes: AutomationLane[] = [];
  for (const [k, evs] of by) {
    if (!evs.some((e) => e.t > 0)) continue;   // alleen een beginstand: niet bewogen
    const info = file.controls[k];
    const nums = evs.map((e) => (typeof e.value === 'boolean' ? (e.value ? 1 : 0) : e.value));
    let lo = info?.min ?? Math.min(...nums), hi = info?.max ?? Math.max(...nums);
    if (typeof evs[0]!.value === 'boolean') { lo = 0; hi = 1; }
    const span = hi - lo || 1;
    lanes.push({ key: k, label: info?.label ?? k, points: evs.map((e, i) => ({ t: e.t, y: Math.max(0, Math.min(1, (nums[i]! - lo) / span)) })) });
  }
  return lanes;
}
