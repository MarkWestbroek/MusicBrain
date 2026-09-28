// midiFilePlayer — een .mid afspelen in de sim, eventueel in een lus, voor
// testen zonder handen. Werkt als vierde MIDI-bron naast klavier, sequence
// en Web MIDI; de opnames van de sim (.mid naast de .wav) passen er direct in.
//
// `parseSmf` is zuiver: SMF type 0 en 1, running status, tempowissels (ook
// uit andere sporen dan het eerste), SMPTE-tijdbasis. Meta en SysEx worden
// overgeslagen. Alle sporen worden samengevoegd tot één lijst in ms.

import type { MidiEvent, MidiListener, MidiSource } from './MidiSource';

export interface SmfEvent { t: number; bytes: number[] }
export interface ParsedSmf { events: SmfEvent[]; durationMs: number; name?: string; tracks: number }

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
  return { events, durationMs: toMs(endTick), name: name || undefined, tracks: ntrks };
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

export interface PlayerState { name: string | null; playing: boolean; loop: boolean; posMs: number; durationMs: number; events: number }

/**
 * Speelt een geladen bestand af zodra de sim de bron start. `now` en de
 * timer zijn injecteerbaar voor tests.
 */
export class MidiFileSource implements MidiSource {
  readonly id = 'file';
  readonly label = 'MIDI-bestand';
  private listeners = new Set<MidiListener>();
  private stateListeners = new Set<() => void>();
  private file: ParsedSmf | null = null;
  private fileName: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = 0;
  private idx = 0;
  private held = new Set<number>();
  loop = true;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly tickMs = 5,
  ) {}

  subscribe(fn: MidiListener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onState(fn: () => void): () => void { this.stateListeners.add(fn); return () => { this.stateListeners.delete(fn); }; }
  private changed(): void { this.stateListeners.forEach((fn) => fn()); }

  load(file: ParsedSmf, name: string): void {
    const wasPlaying = this.timer !== null;
    this.halt();
    this.file = file; this.fileName = name;
    if (wasPlaying) this.start(); else this.changed();
  }

  setLoop(on: boolean): void { this.loop = on; this.changed(); }

  state(): PlayerState {
    return {
      name: this.fileName, playing: this.timer !== null, loop: this.loop,
      posMs: this.timer ? Math.max(0, this.now() - this.t0) : 0,
      durationMs: this.file?.durationMs ?? 0, events: this.file?.events.length ?? 0,
    };
  }

  describe(): string {
    return this.fileName ? `${this.fileName}${this.timer ? ' — speelt' : ''}` : 'geen bestand geladen';
  }

  start(): void {
    if (!this.file || this.timer) return;
    this.t0 = this.now(); this.idx = 0;
    this.timer = setInterval(() => this.pump(), this.tickMs);
    this.pump();
    this.changed();
  }

  stop(): void { this.halt(); this.changed(); }

  /** Terug naar het begin zonder te stoppen. */
  restart(): void { if (this.timer) { this.releaseAll(); this.t0 = this.now(); this.idx = 0; this.changed(); } }

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
    const pos = this.now() - this.t0;
    while (this.idx < f.events.length && f.events[this.idx]!.t <= pos) {
      const e = toMidiEvent(f.events[this.idx]!.bytes);
      this.idx++;
      if (e) this.emit(e);
    }
    if (this.idx >= f.events.length && pos >= f.durationMs) {
      this.releaseAll();
      if (this.loop && f.events.length > 0) {
        this.t0 += Math.max(f.durationMs, 1); this.idx = 0;
      } else {
        this.halt(); this.changed();
      }
    }
  }
}
