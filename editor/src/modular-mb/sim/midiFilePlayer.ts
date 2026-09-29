// midiFilePlayer — een .mid afspelen in de sim, eventueel in een lus, voor
// testen zonder handen. Werkt als vierde MIDI-bron naast klavier, sequence
// en Web MIDI; de opnames van de sim (.mid naast de .wav) passen er direct in.
//
// `parseSmf` is zuiver: SMF type 0 en 1, running status, tempowissels (ook
// uit andere sporen dan het eerste), SMPTE-tijdbasis. Meta en SysEx worden
// overgeslagen. Alle sporen worden samengevoegd tot één lijst in ms.

import type { MidiEvent, MidiListener, MidiSource } from './MidiSource';
import { encodeSmf, MARKER_LOOP_START, MARKER_LOOP_END, MARKER_TEL1 } from './midiRecorder';
import { parseSmf, noteSpans, controllerSeries, SmfError, type ParsedSmf, type SmfEvent, type LoopRegion, type Grid, type NoteSpan, type CtlKind, type CtlSeries } from '../../take-player/smf';
import { normRegion, type Playback, type PlayerState } from '../../take-player/playback';

// Het lezen van .mid zit in take-player (ook voor de Imprint-widget); hier
// opnieuw uitgevoerd zodat bestaande imports blijven werken.
export { parseSmf, noteSpans, controllerSeries, SmfError };
export type { ParsedSmf, SmfEvent, LoopRegion, Grid, NoteSpan, CtlKind, CtlSeries, PlayerState };

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

/**
 * Speelt een geladen bestand af zodra de sim de bron start. `now` en de
 * timer zijn injecteerbaar voor tests. Springen (seek) en een lusvenster
 * zoals in een DAW; na een sprong krijgt de patch de laatste stand van de
 * controllers, pitch bend en aftertouch mee ("chase").
 */
export class MidiFileSource implements MidiSource, Playback {
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
    this.loopRegion = normRegion(r, this.file?.durationMs ?? 0);
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
