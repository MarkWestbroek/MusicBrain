// midiFilePlayer — een .mid afspelen in de sim, eventueel in een lus, voor
// testen zonder handen. Werkt als vierde MIDI-bron naast klavier, sequence
// en Web MIDI; de opnames van de sim (.mid naast de .wav) passen er direct in.
//
// `parseSmf` is zuiver: SMF type 0 en 1, running status, tempowissels (ook
// uit andere sporen dan het eerste), SMPTE-tijdbasis. Meta en SysEx worden
// overgeslagen. Alle sporen worden samengevoegd tot één lijst in ms.

import type { MidiEvent, MidiListener, MidiSource } from './MidiSource';
import { encodeSmf, MARKER_LOOP_START, MARKER_LOOP_END, MARKER_TEL1 } from './midiRecorder';

export interface SmfEvent { t: number; bytes: number[] }
export interface ParsedSmf {
  events: SmfEvent[]; durationMs: number; name?: string; tracks: number;
  /** Eerste tempo in het bestand (120 als er geen staat): voor de tellen in de pianorol. */
  bpm: number;
  /** Maatsoort-teller (4 als er geen staat). */
  beatsPerBar: number;
  /** Uit markers "loopStart"/"loopEnd" (ms), als beide er staan. */
  loop?: { start: number; end: number };
  /** Uit marker "MMB tel 1" (ms): waar tel 1 van het raster ligt. */
  tel1Ms?: number;
}

export class SmfError extends Error {}

export function parseSmf(buf: Uint8Array): ParsedSmf {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number): string => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.length < 14 || tag(0) !== 'MThd') throw new SmfError('Geen MIDI-bestand (MThd ontbreekt).');
  const hdrLen = dv.getUint32(4);
  const ntrks = dv.getUint16(10);
  const division = dv.getUint16(12);
  let p = 8 + hdrLen;

  // Ruwe events per spoor in ticks, tempo's apart.
  type Raw = { tick: number; bytes: number[]; order: number };
  const raws: Raw[] = [];
  const tempos: { tick: number; us: number }[] = [];
  let name: string | undefined;
  let timeSigNum: number | undefined;
  const markers: { tick: number; text: string }[] = [];
  let order = 0;
  let endTick = 0;
  for (let tr = 0; tr < ntrks && p + 8 <= buf.length; tr++) {
    const len = dv.getUint32(p + 4);
    const isTrk = tag(p) === 'MTrk';
    let q = p + 8;
    const end = Math.min(buf.length, q + len);
    p = q + len;
    if (!isTrk) { tr--; continue; }
    let tick = 0, running = 0;
    const vl = (): number => { let v = 0, c = 0; do { c = buf[q++] ?? 0; v = (v << 7) | (c & 0x7F); } while (c & 0x80 && q < end); return v; };
    while (q < end) {
      tick += vl();
      let s = buf[q]!;
      if (s < 0x80) { s = running; } else { q++; }
      if (s === 0xFF) {
        const type = buf[q++]!; const n = vl();
        if (type === 0x51 && n === 3) tempos.push({ tick, us: (buf[q]! << 16) | (buf[q + 1]! << 8) | buf[q + 2]! });
        if (type === 0x58 && n >= 1 && timeSigNum === undefined) timeSigNum = buf[q]!;
        if (type === 0x06) markers.push({ tick, text: new TextDecoder().decode(buf.slice(q, q + n)).trim() });
        if (type === 0x03 && name === undefined && tr === 0) name = new TextDecoder().decode(buf.slice(q, q + n));
        if (type === 0x2F) { endTick = Math.max(endTick, tick); }
        q += n; continue;
      }
      if (s === 0xF0 || s === 0xF7) { q += vl(); continue; }
      if (s < 0x80) break;                       // kapot spoor: niet verder gokken
      running = s;
      const hi = s & 0xF0;
      const n = hi === 0xC0 || hi === 0xD0 ? 1 : 2;
      const bytes = [s, buf[q]! & 0x7F];
      if (n === 2) bytes.push(buf[q + 1]! & 0x7F);
      q += n;
      raws.push({ tick, bytes, order: order++ });
      endTick = Math.max(endTick, tick);
    }
  }

  // Ticks → ms met de tempokaart.
  const toMs = (() => {
    if (division & 0x8000) {
      const fps = 256 - (division >> 8), tpf = division & 0xFF;
      return (tick: number): number => (tick / (fps * tpf)) * 1000;
    }
    const ppq = division || 480;
    const map = tempos.sort((a, b) => a.tick - b.tick);
    return (tick: number): number => {
      let ms = 0, lastTick = 0, us = 500_000;
      for (const tp of map) {
        if (tp.tick >= tick) break;
        ms += ((tp.tick - lastTick) * us) / ppq / 1000;
        lastTick = tp.tick; us = tp.us;
      }
      return ms + ((tick - lastTick) * us) / ppq / 1000;
    };
  })();

  raws.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const events = raws.map((r) => ({ t: toMs(r.tick), bytes: r.bytes }));
  const firstTempo = [...tempos].sort((a, b) => a.tick - b.tick)[0]?.us ?? 500_000;
  const markerMs = (text: string): number | undefined => {
    const m = markers.find((x) => x.text.toLowerCase() === text.toLowerCase());
    return m ? toMs(m.tick) : undefined;
  };
  const ls = markerMs('loopStart'), le = markerMs('loopEnd'), tel1 = markerMs('MMB tel 1');
  return {
    events, durationMs: toMs(endTick), name: name || undefined, tracks: ntrks,
    bpm: division & 0x8000 ? 120 : 60_000_000 / firstTempo, beatsPerBar: timeSigNum || 4,
    ...(ls !== undefined && le !== undefined && le > ls ? { loop: { start: ls, end: le } } : {}),
    ...(tel1 !== undefined ? { tel1Ms: tel1 } : {}),
  };
}

/** Eén kanaalbericht → MidiEvent van de sim (zelfde regels als WebMidiSource). */
export function toMidiEvent(b: readonly number[]): MidiEvent | null {
  const s = (b[0] ?? 0) & 0xF0, d1 = b[1] ?? 0, d2 = b[2] ?? 0;
  if (s === 0x90 && d2 > 0) return { kind: 'noteOn', note: d1, velocity: d2 / 127 };
  if (s === 0x80 || s === 0x90) return d2 > 0 && s === 0x80 ? { kind: 'noteOff', note: d1, release: d2 / 127 } : { kind: 'noteOff', note: d1 };
  if (s === 0xD0) return { kind: 'pressure', value: d1 };
  if (s === 0xA0) return { kind: 'polyPressure', note: d1, value: d2 };
  if (s === 0xB0) return { kind: 'cc', controller: d1, value: d2 };
  if (s === 0xC0) return { kind: 'program', program: d1 };
  if (s === 0xE0) return { kind: 'pitchBend', value: (d2 << 7) | d1 };
  return null;
}

export interface LoopRegion { start: number; end: number }

/** Maatraster van de pianorol: tempo, waar tel 1 valt, tellen per maat. */
export interface Grid { bpm: number; offsetMs: number; beatsPerBar: number }

export interface PlayerState {
  name: string | null; playing: boolean; loop: boolean;
  /** Positie in het bestand (ms), ook als hij stilstaat (startpunt). */
  posMs: number; durationMs: number; events: number;
  region: LoopRegion | null;
}

/** Noten als balkjes voor de pianorol: van noot-aan tot noot-uit. */
export interface NoteSpan { note: number; start: number; end: number; vel: number }

export function noteSpans(f: ParsedSmf): NoteSpan[] {
  const open = new Map<number, { start: number; vel: number }>();   // (kanaal<<7|noot)
  const out: NoteSpan[] = [];
  for (const e of f.events) {
    const s = e.bytes[0]! & 0xF0, key = ((e.bytes[0]! & 0x0F) << 7) | e.bytes[1]!;
    const on = s === 0x90 && (e.bytes[2] ?? 0) > 0;
    if (on || s === 0x80 || s === 0x90) {
      const o = open.get(key);
      if (o) { out.push({ note: key & 0x7F, start: o.start, end: e.t, vel: o.vel }); open.delete(key); }
      if (on) open.set(key, { start: e.t, vel: e.bytes[2]! });
    }
  }
  for (const [key, o] of open) out.push({ note: key & 0x7F, start: o.start, end: f.durationMs, vel: o.vel });
  return out.sort((a, b) => a.start - b.start);
}

/** Controllers voor de laag onder de noten: stappen (t, 0..1) per soort. */
export type CtlKind = 'mod' | 'at' | 'bend' | 'cc';
export interface CtlSeries { kind: CtlKind; label: string; points: { t: number; v: number }[] }

export function controllerSeries(f: ParsedSmf): CtlSeries[] {
  const by = new Map<string, CtlSeries>();
  const add = (key: string, kind: CtlKind, label: string, t: number, v: number): void => {
    let s = by.get(key);
    if (!s) { s = { kind, label, points: [] }; by.set(key, s); }
    s.points.push({ t, v });
  };
  for (const e of f.events) {
    const b = e.bytes, s = b[0]! & 0xF0;
    if (s === 0xB0 && b[1] === 1) add('mod', 'mod', 'Modwheel', e.t, b[2]! / 127);
    else if (s === 0xB0 && b[1]! < 120) add(`cc${b[1]}`, 'cc', `CC ${b[1]}`, e.t, b[2]! / 127);
    else if (s === 0xD0) add('at', 'at', 'Aftertouch', e.t, b[1]! / 127);
    else if (s === 0xA0) add('at', 'at', 'Aftertouch', e.t, b[2]! / 127);
    else if (s === 0xE0) add('bend', 'bend', 'Pitch bend', e.t, (((b[2]! << 7) | b[1]!) / 16383));
  }
  const order: CtlKind[] = ['mod', 'at', 'bend', 'cc'];
  return [...by.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
}

/**
 * Speelt een geladen bestand af zodra de sim de bron start. `now` en de
 * timer zijn injecteerbaar voor tests. Springen (seek) en een lusvenster
 * zoals in een DAW; na een sprong krijgt de patch de laatste stand van de
 * controllers, pitch bend en aftertouch mee ("chase").
 */
export class MidiFileSource implements MidiSource {
  readonly id = 'file';
  readonly label = 'MIDI-bestand';
  private listeners = new Set<MidiListener>();
  private stateListeners = new Set<() => void>();
  private file: ParsedSmf | null = null;
  private fileName: string | null = null;
  /** Waar dit bestand vandaan komt, als het uit de library kwam (voor terugzetten). */
  private fileOrigin: { slug: string } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = 0;
  private idx = 0;
  private held = new Set<number>();
  /** Startpunt als hij stilstaat (ms in het bestand). */
  private startAt = 0;
  private loopRegion: LoopRegion | null = null;
  /** Eigen raster (tempo/tel 1) bovenop wat het bestand zegt; alleen voor weergave. */
  private gridOverride: Partial<Grid> | null = null;
  /** Afspeelsnelheid (1 = zoals opgenomen). Alleen voor de sim; een widget met audio laat hem op 1. */
  private speed = 1;
  loop = true;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly tickMs = 5,
  ) {}

  subscribe(fn: MidiListener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onState(fn: () => void): () => void { this.stateListeners.add(fn); return () => { this.stateListeners.delete(fn); }; }
  private changed(): void { this.stateListeners.forEach((fn) => fn()); }

  load(file: ParsedSmf, name: string, origin: { slug: string } | null = null): void {
    const wasPlaying = this.timer !== null;
    this.fileOrigin = origin;
    this.halt();
    this.file = file; this.fileName = name; this.startAt = 0; this.gridOverride = null;
    this.loopRegion = file.loop ? { ...file.loop } : null;
    if (wasPlaying) this.start(); else this.changed();
  }

  parsed(): ParsedSmf | null { return this.file; }

  origin(): { slug: string } | null { return this.fileOrigin; }
  fileNameOf(): string | null { return this.fileName; }

  /** Het raster: dat van het bestand, met je eigen tempo/tel 1 erover. */
  grid(): Grid {
    const base: Grid = { bpm: this.file?.bpm ?? 120, offsetMs: this.file?.tel1Ms ?? 0, beatsPerBar: this.file?.beatsPerBar ?? 4 };
    return { ...base, ...(this.gridOverride ?? {}) };
  }

  /** Eigen tempo/tel 1 zetten; null = terug naar het bestand. */
  setGrid(g: Partial<Grid> | null): void {
    if (g && g.bpm !== undefined) g = { ...g, bpm: Math.max(20, Math.min(400, g.bpm)) };
    this.gridOverride = g ? { ...(this.gridOverride ?? {}), ...g } : null;
    this.changed();
  }

  gridIsCustom(): boolean { return this.gridOverride !== null; }

  getSpeed(): number { return this.speed; }

  /** Sneller of trager afspelen (0,25–4); de plek in het bestand blijft staan. */
  setSpeed(x: number): void {
    const next = Math.max(0.25, Math.min(4, x));
    if (next === this.speed) return;
    const pos = this.position();
    this.speed = next;
    if (this.timer) this.t0 = this.now() - pos / next;
    this.changed();
  }

  setLoop(on: boolean): void { this.loop = on; this.changed(); }

  /** Lusvenster (ms); null = het hele bestand. Korter dan 20 ms = geen venster. */
  setRegion(r: LoopRegion | null): void {
    const d = this.file?.durationMs ?? 0;
    if (r) {
      const start = Math.max(0, Math.min(r.start, r.end)), end = Math.min(d, Math.max(r.start, r.end));
      this.loopRegion = end - start >= 20 ? { start, end } : null;
    } else this.loopRegion = null;
    if (this.loopRegion) this.loop = true;
    this.changed();
  }

  /** Waar de lus terugspringt en waar hij eindigt. */
  private bounds(): LoopRegion {
    return this.loopRegion ?? { start: 0, end: this.file?.durationMs ?? 0 };
  }

  position(): number {
    return this.timer ? Math.max(0, (this.now() - this.t0) * this.speed) : this.startAt;
  }

  state(): PlayerState {
    return {
      name: this.fileName, playing: this.timer !== null, loop: this.loop,
      posMs: this.position(), durationMs: this.file?.durationMs ?? 0,
      events: this.file?.events.length ?? 0, region: this.loopRegion,
    };
  }

  describe(): string {
    return this.fileName ? `${this.fileName}${this.timer ? ' — speelt' : ''}` : 'geen bestand geladen';
  }

  start(): void {
    if (!this.file || this.timer) return;
    this.jump(this.startAt);
    this.timer = setInterval(() => this.pump(), this.tickMs);
    this.pump();
    this.changed();
  }

  stop(): void {
    if (this.timer) this.startAt = this.position();
    this.halt();
    this.changed();
  }

  /** Terug naar het begin (van het lusvenster) zonder te stoppen. */
  restart(): void { this.seek(this.bounds().start); }

  /** Pauze: stilzetten op de huidige plek (zelfde als stop). */
  pause(): void { this.stop(); }

  /** Stop en terug naar het begin (van het lusvenster). */
  rewind(): void { this.stop(); this.startAt = this.bounds().start; this.changed(); }

  /** Spring naar `ms` in het bestand; speelt hij, dan loopt hij daar verder. */
  seek(ms: number): void {
    const d = this.file?.durationMs ?? 0;
    const at = Math.max(0, Math.min(d, ms));
    if (this.timer) this.jump(at); else this.startAt = at;
    this.changed();
  }

  /** Noten los, positie zetten, controllerstand van vóór `ms` nazenden. */
  private jump(ms: number): void {
    const f = this.file;
    this.releaseAll();
    this.t0 = this.now() - ms / this.speed;
    if (!f) { this.idx = 0; return; }
    let i = 0;
    const last = new Map<string, number[]>();   // laatste stand per soort
    while (i < f.events.length && f.events[i]!.t < ms) {
      const b = f.events[i]!.bytes, s = b[0]! & 0xF0;
      if (s === 0xB0) last.set(`cc${b[0]}:${b[1]}`, b);
      else if (s === 0xE0 || s === 0xD0) last.set(`s${b[0]}`, b);
      i++;
    }
    this.idx = i;
    for (const b of last.values()) { const e = toMidiEvent(b); if (e) this.emit(e); }
  }

  private halt(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.releaseAll();
  }

  private releaseAll(): void {
    for (const n of this.held) this.emit({ kind: 'noteOff', note: n });
    this.held.clear();
  }

  private emit(e: MidiEvent): void {
    if (e.kind === 'noteOn') this.held.add(e.note);
    if (e.kind === 'noteOff') this.held.delete(e.note);
    this.listeners.forEach((fn) => fn(e));
  }

  /** Verstuurt alles wat aan de beurt is; publiek voor tests. */
  pump(): void {
    const f = this.file;
    if (!f) return;
    const b = this.bounds();
    const pos = (this.now() - this.t0) * this.speed;
    const until = this.loop ? Math.min(pos, b.end) : pos;
    while (this.idx < f.events.length && f.events[this.idx]!.t <= until) {
      const ev = f.events[this.idx]!;
      // In een lusvenster hoort een noot-aan precies op het einde bij de volgende ronde.
      if (this.loop && this.loopRegion && ev.t >= b.end && (ev.bytes[0]! & 0xF0) === 0x90 && (ev.bytes[2] ?? 0) > 0) break;
      const e = toMidiEvent(ev.bytes);
      this.idx++;
      if (e) this.emit(e);
    }
    const atEnd = this.loop ? pos >= b.end : (this.idx >= f.events.length && pos >= f.durationMs);
    if (!atEnd) return;
    if (this.loop && f.events.length > 0 && b.end > b.start) {
      this.jump(b.start);
    } else {
      this.halt(); this.startAt = 0; this.changed();
    }
  }
}

/**
 * Het geladen bestand opnieuw schrijven met het raster en het lusvenster van
 * nu: tempo en maatsoort in de kop, tel 1 en de lus als markers. De tijden van
 * de noten blijven exact (ms), alleen de ticks verschuiven mee met het tempo.
 */
export function encodeEdited(src: MidiFileSource): Uint8Array<ArrayBuffer> | null {
  const f = src.parsed();
  if (!f) return null;
  const g = src.grid();
  const r = src.state().region;
  const markers: { t: number; text: string }[] = [];
  if (g.offsetMs > 0) markers.push({ t: g.offsetMs, text: MARKER_TEL1 });
  if (r) markers.push({ t: r.start, text: MARKER_LOOP_START }, { t: r.end, text: MARKER_LOOP_END });
  return encodeSmf(
    f.events.map((e) => ({ t: e.t, status: e.bytes[0]!, d1: e.bytes[1] ?? 0, d2: e.bytes[2] ?? 0 })),
    { lengthMs: f.durationMs, name: f.name, bpm: g.bpm, beatsPerBar: g.beatsPerBar, markers },
  );
}
