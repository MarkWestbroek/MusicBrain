// playback — wat de pianorol van een speler nodig heeft (Playback), en een
// speler die een <audio>-element volgt (AudioPlayback), voor een take-widget
// waar de wav het geluid is en de MIDI alleen laat zien wat er gespeeld wordt.
//
// De sim-speler van de editor (MidiFileSource) implementeert Playback ook.

import type { Grid, LoopRegion, ParsedSmf } from './smf';

export interface PlayerState {
  name: string | null;
  playing: boolean;
  /** Lust hij (in een lusvenster of over het hele bestand)? */
  loop: boolean;
  /** Positie (ms), ook als hij stilstaat (startpunt). */
  posMs: number;
  durationMs: number;
  events: number;
  region: LoopRegion | null;
}

/** Wat MidiRoll van een speler gebruikt. */
export interface Playback {
  parsed(): ParsedSmf | null;
  state(): PlayerState;
  onState(fn: () => void): () => void;
  position(): number;
  start(): void;
  pause(): void;
  /** Stop en terug naar het begin (van het lusvenster). */
  rewind(): void;
  seek(ms: number): void;
  setRegion(r: LoopRegion | null): void;
  grid(): Grid;
  /** Optioneel: raster aanpassen (tempo/tel 1), alleen weergave. */
  setGrid?(g: Partial<Grid> | null): void;
  gridIsCustom?(): boolean;
}

/** Lusvenster normaliseren: start < end, binnen [0, duur], minstens 20 ms. */
export function normRegion(r: LoopRegion | null, durationMs: number): LoopRegion | null {
  if (!r) return null;
  const start = Math.max(0, Math.min(r.start, r.end)), end = Math.min(durationMs, Math.max(r.start, r.end));
  return end - start >= 20 ? { start, end } : null;
}

/** Wat AudioPlayback van een <audio>-element gebruikt (los te testen). */
export interface AudioLike {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

/**
 * Volgt een <audio>-element: positie = currentTime, afspelen/pauze/springen
 * gaan naar de audio. Een lusvenster springt terug naar het begin zodra de
 * audio het einde passeert (gecontroleerd per animatieframe zolang hij speelt).
 * Geen snelheid: de widget blijft vast aan de audio.
 */
export class AudioPlayback implements Playback {
  private listeners = new Set<() => void>();
  private region: LoopRegion | null;
  private raf = 0;
  private readonly events = ['play', 'pause', 'seeked', 'ended', 'loadedmetadata', 'durationchange'] as const;

  constructor(
    private readonly audio: AudioLike,
    private file: ParsedSmf | null = null,
    private name: string | null = null,
    private readonly frame: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
    private readonly cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {
    this.region = file?.loop ? { ...file.loop } : null;
    for (const t of this.events) audio.addEventListener(t, this.onAudio);
  }

  /** Opruimen als de widget verdwijnt. */
  destroy(): void {
    for (const t of this.events) this.audio.removeEventListener(t, this.onAudio);
    if (this.raf) this.cancelFrame(this.raf);
    this.raf = 0;
    this.listeners.clear();
  }

  setFile(file: ParsedSmf | null, name: string | null = null): void {
    this.file = file; this.name = name;
    this.region = file?.loop ? { ...file.loop } : null;
    this.changed();
  }

  private onAudio = (): void => {
    if (!this.audio.paused && !this.raf) this.raf = this.frame(this.tick);
    this.changed();
  };

  /** Per frame zolang hij speelt: lusvenster bewaken. */
  private tick = (): void => {
    this.raf = 0;
    if (this.audio.paused) return;
    const r = this.region;
    if (r && this.position() >= r.end) this.audio.currentTime = r.start / 1000;
    this.raf = this.frame(this.tick);
  };

  private changed(): void { this.listeners.forEach((fn) => fn()); }
  onState(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  parsed(): ParsedSmf | null { return this.file; }

  private durationMs(): number {
    const d = this.audio.duration;
    return Number.isFinite(d) && d > 0 ? d * 1000 : (this.file?.durationMs ?? 0);
  }

  position(): number { return Math.max(0, this.audio.currentTime * 1000); }

  state(): PlayerState {
    return {
      name: this.name, playing: !this.audio.paused, loop: this.region !== null,
      posMs: this.position(), durationMs: this.durationMs(),
      events: this.file?.events.length ?? 0, region: this.region,
    };
  }

  start(): void {
    const r = this.region;
    // Staat de kop voorbij het lusvenster, dan begint de lus vooraan.
    if (r && this.position() >= r.end) this.audio.currentTime = r.start / 1000;
    const p = this.audio.play();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => this.changed());
  }

  pause(): void { this.audio.pause(); }

  rewind(): void {
    this.audio.pause();
    this.audio.currentTime = (this.region?.start ?? 0) / 1000;
    this.changed();
  }

  seek(ms: number): void {
    this.audio.currentTime = Math.max(0, Math.min(this.durationMs(), ms)) / 1000;
    this.changed();
  }

  setRegion(r: LoopRegion | null): void {
    this.region = normRegion(r, this.durationMs());
    this.changed();
  }

  grid(): Grid {
    return { bpm: this.file?.bpm ?? 120, offsetMs: this.file?.tel1Ms ?? 0, beatsPerBar: this.file?.beatsPerBar ?? 4 };
  }
}
