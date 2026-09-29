// noteEdit — noten bewerken als lijst en terugschrijven naar een ParsedSmf.
// Zuiver: de pianorol en de take-editor gebruiken het, tests draaien onder node.
//
// Een bewerking levert een nieuwe notenlijst; `rebuildSmf` vervangt daarmee
// alle noot-aan/uit in het bestand en laat controllers, bend, aftertouch,
// program change en SysEx staan.

import type { ParsedSmf, SmfEvent } from './smf';

export interface EditNote { note: number; start: number; end: number; vel: number; ch: number }

/** Noten uit het bestand, met kanaal; gesorteerd op start, dan toonhoogte. */
export function notesOf(f: ParsedSmf): EditNote[] {
  const open = new Map<number, { start: number; vel: number }>();
  const out: EditNote[] = [];
  for (const e of f.events) {
    const b = e.bytes, s = b[0]! & 0xF0, ch = b[0]! & 0x0F, key = (ch << 7) | (b[1] ?? 0);
    const on = s === 0x90 && (b[2] ?? 0) > 0;
    if (on || s === 0x80 || s === 0x90) {
      const o = open.get(key);
      if (o) { out.push({ note: key & 0x7F, start: o.start, end: e.t, vel: o.vel, ch }); open.delete(key); }
      if (on) open.set(key, { start: e.t, vel: b[2]! });
    }
  }
  for (const [key, o] of open) out.push({ note: key & 0x7F, start: o.start, end: f.durationMs, vel: o.vel, ch: key >> 7 });
  return sortNotes(out);
}

export function sortNotes(n: EditNote[]): EditNote[] {
  return [...n].sort((a, b) => a.start - b.start || a.note - b.note);
}

/** Alle noten vervangen; de rest van het bestand blijft. Duur groeit mee. */
export function rebuildSmf(f: ParsedSmf, notes: readonly EditNote[]): ParsedSmf {
  const rest = f.events.filter((e) => { const s = e.bytes[0]! & 0xF0; return s !== 0x90 && s !== 0x80; });
  const ev: (SmfEvent & { k: number })[] = rest.map((e) => ({ ...e, k: 1 }));
  for (const n of notes) {
    const st = Math.max(0, n.start), en = Math.max(st + 1, n.end), ch = n.ch & 0x0F;
    ev.push({ t: st, bytes: [0x90 | ch, n.note & 0x7F, Math.max(1, Math.min(127, Math.round(n.vel)))], k: 2 });
    ev.push({ t: en, bytes: [0x80 | ch, n.note & 0x7F, 0], k: 0 });
  }
  // Op hetzelfde moment: eerst noot-uit, dan controllers, dan noot-aan (herhaalde noot klinkt opnieuw).
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  const end = Math.max(f.durationMs, ...notes.map((n) => n.end));
  return { ...f, events: ev.map(({ t, bytes }) => ({ t, bytes })), durationMs: end };
}

/** Raster voor bewerken: tel-lengte, tel 1 en de onderverdeling (4 = zestienden). */
export interface EditGrid { beatMs: number; offsetMs: number; div: number }

export function snapTime(ms: number, g: EditGrid): number {
  const step = g.beatMs / Math.max(1, g.div);
  return g.offsetMs + Math.round((ms - g.offsetMs) / step) * step;
}

/** Verplaatsen in tijd en toonhoogte; lengte blijft. */
export function moveNotes(notes: readonly EditNote[], idx: readonly number[], dMs: number, dPitch: number): EditNote[] {
  const sel = new Set(idx);
  const minStart = Math.min(...idx.map((i) => notes[i]?.start ?? Infinity));
  const d = Math.max(dMs, -minStart);   // niet vóór 0
  return notes.map((n, i) => sel.has(i)
    ? { ...n, start: n.start + d, end: n.end + d, note: Math.max(0, Math.min(127, n.note + dPitch)) }
    : n);
}

/** Einde verschuiven (minstens `minMs` lang). */
export function resizeNotes(notes: readonly EditNote[], idx: readonly number[], dMs: number, minMs = 10): EditNote[] {
  const sel = new Set(idx);
  return notes.map((n, i) => sel.has(i) ? { ...n, end: Math.max(n.start + minMs, n.end + dMs) } : n);
}

export function deleteNotes(notes: readonly EditNote[], idx: readonly number[]): EditNote[] {
  const sel = new Set(idx);
  return notes.filter((_, i) => !sel.has(i));
}

export function setVelocity(notes: readonly EditNote[], idx: readonly number[], vel: number): EditNote[] {
  const sel = new Set(idx), v = Math.max(1, Math.min(127, Math.round(vel)));
  return notes.map((n, i) => sel.has(i) ? { ...n, vel: v } : n);
}

/**
 * Kwantiseren: start naar het raster, met `strength` (0..1, 1 = helemaal).
 * `ends` = ook de eindes (anders blijft de lengte gelijk).
 */
export function quantize(notes: readonly EditNote[], idx: readonly number[], g: EditGrid, strength = 1, ends = false): EditNote[] {
  const sel = new Set(idx), k = Math.max(0, Math.min(1, strength));
  return notes.map((n, i) => {
    if (!sel.has(i)) return n;
    const start = n.start + (snapTime(n.start, g) - n.start) * k;
    const len = n.end - n.start;
    const end = ends ? Math.max(start + 10, n.end + (snapTime(n.end, g) - n.end) * k) : start + len;
    return { ...n, start: Math.max(0, start), end };
  });
}

/** Controllersoort voor tekenen in de laag. */
export type DrawKind = { type: 'cc'; cc: number } | { type: 'at' } | { type: 'bend' };

/**
 * Een controllerlijn tekenen: alle events van die soort in [t0, t1] worden
 * vervangen door de getekende punten (waarde 0..1). Kanaal 1.
 */
export function drawController(f: ParsedSmf, kind: DrawKind, points: readonly { t: number; v: number }[]): ParsedSmf {
  if (!points.length) return f;
  const t0 = Math.min(...points.map((p) => p.t)), t1 = Math.max(...points.map((p) => p.t));
  const same = (b: number[]): boolean => {
    const s = b[0]! & 0xF0;
    return kind.type === 'cc' ? s === 0xB0 && b[1] === kind.cc : kind.type === 'at' ? s === 0xD0 : s === 0xE0;
  };
  const kept = f.events.filter((e) => !(same(e.bytes) && e.t >= t0 && e.t <= t1));
  const made: SmfEvent[] = [];
  let lastKey = '';
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const v = Math.max(0, Math.min(1, p.v));
    let bytes: number[];
    if (kind.type === 'bend') { const x = Math.round(v * 16383); bytes = [0xE0, x & 0x7F, x >> 7]; }
    else if (kind.type === 'at') bytes = [0xD0, Math.round(v * 127)];
    else bytes = [0xB0, kind.cc & 0x7F, Math.round(v * 127)];
    const key = bytes.join(',');
    if (key === lastKey) continue;               // geen herhaling van dezelfde waarde
    lastKey = key;
    made.push({ t: Math.max(0, p.t), bytes });
  }
  const events = [...kept, ...made].sort((a, b) => a.t - b.t);
  return { ...f, events, durationMs: Math.max(f.durationMs, t1) };
}
