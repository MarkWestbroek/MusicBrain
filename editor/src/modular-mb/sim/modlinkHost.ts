// modlinkHost — de editor als "host" van modlink (editor/modlink/relay.ts):
// telefoons (pad-phone.html) sturen per aanraakpunt X en Y als waarde 0..1;
// hier kies je per as wat dat wordt: aftertouch, pitch bend, modwheel of een
// CC. Het doorgeefluik zit in de Vite-dev-server, dus dit werkt met
// `npm run dev`, niet op editor.musicbrain.nl.
//
// Zuiver deel (as → MIDI, nummering, labels) staat los van de verbinding,
// zodat het onder node te testen is.

export const CC_BASE = 40;
export const CC_PER_SURFACE = 6;   // 3 aanraakpunten × X/Y

export type AxisTarget =
  | { kind: 'none' }
  | { kind: 'at' }
  | { kind: 'bend' }
  | { kind: 'cc'; cc: number };

export interface AxisMap {
  target: AxisTarget;
  /** Terug naar rust bij loslaten (aftertouch → 0, bend → midden, CC → 0). */
  spring: boolean;
}

/** Standaard: punt 1 = cutoff (X) en aftertouch (Y), punt 2 = bend en modwheel, punt 3 = resonantie en expressie. */
export function defaultMap(): AxisMap[] {
  return [
    { target: { kind: 'cc', cc: 74 }, spring: false },
    { target: { kind: 'at' }, spring: true },
    { target: { kind: 'bend' }, spring: true },
    { target: { kind: 'cc', cc: 1 }, spring: false },
    { target: { kind: 'cc', cc: 71 }, spring: false },
    { target: { kind: 'cc', cc: 11 }, spring: false },
  ];
}

/** "schuif 3 · punt 2 X": in de faderstand is as i schuif i+1, in de XY-stand de X (even i) of Y (oneven i) van punt i/2 + 1. */
/**
 * Een CC-nummer dat op dit vlak nog niet gebruikt wordt, voor als je een as
 * op "CC …" zet: eerst de vrije reeks 20–31, dan 102–119.
 */
export function freeCc(map: readonly AxisMap[], except: number): number {
  const used = new Set(map.filter((_, i) => i !== except).flatMap((m) => m.target.kind === 'cc' ? [m.target.cc] : []));
  for (const cc of [...Array.from({ length: 12 }, (_, k) => 20 + k), ...Array.from({ length: 18 }, (_, k) => 102 + k)]) if (!used.has(cc)) return cc;
  return 20;
}

export function axisName(i: number): string {
  return `schuif ${i + 1} · punt ${Math.floor(i / 2) + 1} ${i % 2 ? 'Y' : 'X'}`;
}

const CC_NAMES: Record<number, string> = { 1: 'Modwheel', 2: 'Breath', 7: 'Volume', 10: 'Pan', 11: 'Expressie', 64: 'Sustain', 71: 'Resonantie', 74: 'Cutoff' };

export function targetLabel(t: AxisTarget): string {
  switch (t.kind) {
    case 'none': return 'vrij';
    case 'at': return 'Aftertouch';
    case 'bend': return 'Pitch bend';
    case 'cc': return CC_NAMES[t.cc] ? `${CC_NAMES[t.cc]} (CC ${t.cc})` : `CC ${t.cc}`;
  }
}

export function ccBaseForSlot(slot: number): number { return CC_BASE + (slot - 1) * CC_PER_SURFACE; }

/** cc van het doorgeefluik → { slot, axis }, of null buiten het bereik. */
export function slotAxisOf(cc: number): { slot: number; axis: number } | null {
  if (cc < CC_BASE) return null;
  return { slot: Math.floor((cc - CC_BASE) / CC_PER_SURFACE) + 1, axis: (cc - CC_BASE) % CC_PER_SURFACE };
}

export type MidiOut =
  | { kind: 'cc'; cc: number; value: number }      // 0..127
  | { kind: 'at'; value: number }                   // 0..127
  | { kind: 'bend'; value: number };                // 0..16383, 8192 = midden

/** Waarde 0..1 (of loslaten) → één MIDI-bericht, of null. */
export function midiFor(m: AxisMap, v: number, up = false): MidiOut | null {
  const x = Math.max(0, Math.min(1, v));
  if (up && !m.spring) return null;
  switch (m.target.kind) {
    case 'none': return null;
    case 'at': return { kind: 'at', value: up ? 0 : Math.round(x * 127) };
    case 'bend': return { kind: 'bend', value: up ? 8192 : Math.round(x * 16383) };
    case 'cc': return { kind: 'cc', cc: m.target.cc & 0x7F, value: up ? 0 : Math.round(x * 127) };
  }
}

/** Labels voor alle telefoons: wat elke as bestuurt (getoond op het toestel). */
export function labelsFor(slots: readonly number[], maps: (slot: number) => AxisMap[]): { cc: number; label: string }[] {
  const out: { cc: number; label: string }[] = [];
  for (const slot of slots) {
    const m = maps(slot);
    for (let i = 0; i < CC_PER_SURFACE; i++) {
      out.push({ cc: ccBaseForSlot(slot) + i, label: targetLabel(m[i]?.target ?? { kind: 'none' }) + (m[i]?.spring ? ' ↺' : '') });
    }
  }
  return out;
}

export interface Peer { id: number; role: 'surface' | 'host'; name: string; slot: number }

/** Verbinding met het doorgeefluik, met herverbinden. */
export class ModlinkHost {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tries = 0;
  private closed = false;
  state: 'verbinden' | 'verbonden' | 'weg' = 'verbinden';
  peers: Peer[] = [];

  constructor(
    private readonly url: string,
    private readonly on: {
      value(m: { cc: number; v: number; up?: boolean }): void;
      change(): void;
    },
  ) { this.open(); }

  private open(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.retry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.tries = 0; ws.send(JSON.stringify({ t: 'hello', role: 'host', name: 'MusicBrain-editor' })); };
    ws.onmessage = (e) => {
      let m: { t?: string; list?: Peer[]; cc?: number; v?: number; up?: boolean };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'welcome') { this.state = 'verbonden'; this.on.change(); }
      else if (m.t === 'peers') { this.peers = m.list ?? []; this.on.change(); }
      else if (m.t === 'v' && typeof m.cc === 'number' && typeof m.v === 'number') this.on.value({ cc: m.cc, v: m.v, up: m.up === true });
    };
    ws.onclose = () => { this.ws = null; if (this.state !== 'weg') { this.state = 'weg'; this.on.change(); } this.retry(); };
    ws.onerror = () => { try { ws.close(); } catch { /* onclose volgt */ } };
  }

  private retry(): void {
    if (this.closed || this.timer) return;
    const wait = Math.min(10_000, 500 * 2 ** this.tries++);
    this.timer = setTimeout(() => { this.timer = null; this.open(); }, wait);
  }

  sendLabels(items: { cc: number; label: string }[]): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'labels', items }));
  }

  surfaces(): Peer[] { return this.peers.filter((p) => p.role === 'surface').sort((a, b) => a.slot - b.slot); }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try { this.ws?.close(); } catch { /* al dicht */ }
    this.ws = null;
  }
}
