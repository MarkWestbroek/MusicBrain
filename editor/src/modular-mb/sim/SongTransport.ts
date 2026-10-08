// SongTransport: de vierspoors recorder van de speelmodus
// (doc/plans/overdub.md). Speelt de sporen van een Song in een lus, telt
// één maat af en neemt dan precies één regio op van wat de engine speelt.
//
// Tijd: alles staat op de klok van de AudioContext. De spelers van de sporen
// zijn AudioBufferSourceNodes met `loop`, gestart op één gepland moment; de
// recorder (MasterRecorder) meldt het contextframe waarop hij begon, dus de
// regio wordt sample-precies uit de opname geknipt (song.cutRegion). Het
// nieuwe spoor valt na het opnemen meteen in de lus, op de plek waar de
// anderen zijn (`start(when, offset)`).
//
// Wat je hoort: de sporen en de metronoom gaan rechtstreeks naar de
// luidsprekers, buiten de `speakers`-bus van de engine om — de recorder tapt
// die bus, dus op een nieuw spoor komt alleen de patch.

import * as Tone from 'tone';

import type { ModularProject } from '../types';
import type { AudioEngine } from './AudioEngine';
import { getEngine } from './engineSingleton';
import { MidiRecorder } from './midiRecorder';
import {
  MAX_TRACKS, cutRegion, emptyTrack, midiToRegion, newSong, regionFrames, regionMs, schedule, withTrack, withoutTrack,
  type Song, type SongTrack,
} from './song';
import { MasterRecorder } from './wavRecorder';

export type Phase = 'idle' | 'countIn' | 'recording' | 'playing';
export interface TransportState {
  song: Song;
  phase: Phase;
  /** Spoor dat opgenomen wordt (of waarvoor afgeteld wordt). */
  armed: number | null;
  error: string | null;
}
/** Wat het spoor over de patch van dat moment onthoudt. */
export interface PatchInfo { name: string; bpm: number | null; snapshot: ModularProject | null }

interface Player { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; trackId: string }

export class SongTransport {
  private state: TransportState;
  private listeners = new Set<() => void>();
  private players: Player[] = [];
  private recorder = new MasterRecorder();
  private midiRec = new MidiRecorder();
  private midiUnsub: (() => void) | null = null;
  /** Contexttijd waarop de lus (de regio) begon; de sporen lopen daar vanaf rond. */
  private loopStart = 0;
  private metroTimer: number | null = null;
  private metroNext = 0;          // volgende tel (contexttijd) om te plannen
  private metroUntil = Infinity;  // tot wanneer de metronoom tikt
  private endTimer: number | null = null;

  constructor(private readonly engine: AudioEngine = getEngine(), private readonly info: () => PatchInfo = () => ({ name: '', bpm: null, snapshot: null })) {
    this.state = { song: newSong(), phase: 'idle', armed: null, error: null };
  }

  // ── stand ─────────────────────────────────────────────────────────────
  getState(): TransportState { return this.state; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(next: Partial<TransportState>): void { this.state = { ...this.state, ...next }; for (const l of this.listeners) l(); }
  get song(): Song { return this.state.song; }

  /** Positie in de regio, 0..1 (voor de balkjes); tijdens het aftellen negatief. */
  position(): number {
    if (this.state.phase === 'idle') return 0;
    const len = regionMs(this.song) / 1000;
    const t = this.ctx().currentTime - this.loopStart;
    if (t < 0) return t / len;
    return (t % len) / len;
  }

  // ── song ──────────────────────────────────────────────────────────────
  setSong(song: Song): void { this.stop(); this.set({ song }); }
  setRegion(bpm: number, bars: number): void {
    if (this.song.tracks.some((t) => t.audio)) return;   // de regio ligt vast zodra er een spoor is
    this.set({ song: { ...newSong(bpm, bars), id: this.song.id, name: this.song.name, metronome: this.song.metronome, tracks: this.song.tracks } });
  }
  setName(name: string): void { this.set({ song: { ...this.song, name } }); }
  setMetronome(on: boolean): void { this.set({ song: { ...this.song, metronome: on } }); }
  setTrack(i: number, patch: Partial<Pick<SongTrack, 'gain' | 'pan' | 'mute'>>): void {
    const t = this.song.tracks[i];
    if (!t) return;
    const next = { ...t, ...patch };
    this.set({ song: withTrack(this.song, i, next) });
    const p = this.players.find((x) => x.trackId === t.id);
    if (p) { p.gain.gain.value = next.mute ? 0 : next.gain; p.pan.pan.value = next.pan; }
  }
  clearTrack(i: number): void {
    const t = this.song.tracks[i];
    if (!t) return;
    this.stopPlayer(t.id);
    const song = withoutTrack(this.song, i);
    this.set({ song });
    if (song.tracks.every((x) => !x.audio)) this.stop();
  }

  // ── transport ─────────────────────────────────────────────────────────
  async play(): Promise<void> {
    if (this.state.phase !== 'idle') return;
    if (!this.song.tracks.some((t) => t.audio)) return;
    await this.engine.start();
    const at = this.ctx().currentTime + 0.1;
    this.loopStart = at;
    this.startPlayers(at);
    if (this.song.metronome) this.startMetronome(at, Infinity);
    this.set({ phase: 'playing', armed: null, error: null });
  }

  stop(): void {
    if (this.endTimer !== null) { window.clearTimeout(this.endTimer); this.endTimer = null; }
    this.stopMetronome();
    for (const p of this.players) this.stopPlayer(p.trackId);
    this.midiUnsub?.(); this.midiUnsub = null;
    if (this.recorder.active) void this.recorder.stop().catch(() => undefined);
    if (this.midiRec.active) this.midiRec.stop(0);
    this.set({ phase: 'idle', armed: null });
  }

  /**
   * Spoor `i` opnemen: één maat aftellen, dan één regio. De andere sporen
   * spelen mee vanaf het begin van de regio. Daarna loopt de lus door, mét
   * het nieuwe spoor.
   */
  async record(i: number): Promise<void> {
    if (i < 0 || i >= MAX_TRACKS) return;
    if (this.state.phase === 'countIn' || this.state.phase === 'recording') return;
    this.stop();
    try {
      await this.engine.start();
      const ctx = this.ctx();
      await this.recorder.start(this.engine.recorderTap());
      const ctxAtStart = ctx.currentTime;
      const perfAtStart = performance.now();
      this.midiRec.start(perfAtStart);
      this.midiUnsub = this.engine.onMidi(this.midiRec.record);

      const plan = schedule(this.song, ctxAtStart + 0.15);
      this.loopStart = plan.region;
      this.startPlayers(plan.region, i);
      // Aftellen tikt altijd; daarna alleen met de metronoom aan.
      this.startMetronome(plan.countIn, this.song.metronome ? Infinity : plan.region);
      this.set({ phase: 'countIn', armed: i, error: null });
      window.setTimeout(() => { if (this.state.armed === i && this.state.phase === 'countIn') this.set({ phase: 'recording' }); },
        Math.max(0, (plan.region - ctx.currentTime) * 1000));

      const finish = async (): Promise<void> => {
        this.endTimer = null;
        if (this.state.armed !== i) return;
        this.midiUnsub?.(); this.midiUnsub = null;
        const r = await this.recorder.stop();
        const first = this.recorder.startFrame ?? Math.round(ctxAtStart * r.sampleRate);
        const startFrame = Math.round(plan.region * r.sampleRate) - first;
        const frames = regionFrames(this.song, r.sampleRate);
        const channels = cutRegion(r.channels, startFrame, frames);
        const events = this.midiRec.stop(0);
        const midi = midiToRegion(events, (plan.region - ctxAtStart) * 1000, regionMs(this.song));
        const info = this.info();
        const prev = this.song.tracks[i];
        const track: SongTrack = {
          ...(prev ?? emptyTrack(info.name)),
          name: info.name || prev?.name || `Spoor ${i + 1}`,
          audio: { channels, sampleRate: r.sampleRate }, midi, patch: info.snapshot,
        };
        const song = withTrack(this.song, i, track);
        this.set({ song, phase: 'playing', armed: null });
        // Meteen mee in de lus, op de plek waar de anderen nu zijn.
        this.startPlayer(track, this.ctx().currentTime + 0.05, true);
        if (!this.song.metronome) this.stopMetronome();
      };
      this.endTimer = window.setTimeout(() => { void finish().catch((e) => this.set({ error: String(e), phase: 'idle', armed: null })); },
        Math.max(0, (plan.end - ctx.currentTime) * 1000) + 60);
    } catch (e) {
      this.stop();
      this.set({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ── spelers ───────────────────────────────────────────────────────────
  private ctx(): AudioContext { return Tone.getContext().rawContext as AudioContext; }
  private startPlayers(at: number, except?: number): void {
    this.song.tracks.forEach((t, k) => { if (t.audio && k !== except) this.startPlayer(t, at, false); });
  }
  private startPlayer(t: SongTrack, when: number, inLoop: boolean): void {
    if (!t.audio) return;
    this.stopPlayer(t.id);
    const ctx = this.ctx();
    const { channels, sampleRate } = t.audio;
    const buf = ctx.createBuffer(2, channels[0]!.length, sampleRate);
    buf.getChannelData(0).set(channels[0]!);
    buf.getChannelData(1).set(channels[1] ?? channels[0]!);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = ctx.createGain(); gain.gain.value = t.mute ? 0 : t.gain;
    const pan = ctx.createStereoPanner(); pan.pan.value = t.pan;
    src.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
    // In een lopende lus: beginnen waar de anderen nu zijn.
    const len = buf.duration;
    const offset = inLoop ? ((when - this.loopStart) % len + len) % len : 0;
    src.start(when, offset);
    this.players.push({ src, gain, pan, trackId: t.id });
  }
  private stopPlayer(trackId: string): void {
    const i = this.players.findIndex((p) => p.trackId === trackId);
    if (i < 0) return;
    const p = this.players[i]!;
    try { p.src.stop(); } catch { /* al gestopt */ }
    p.src.disconnect(); p.gain.disconnect(); p.pan.disconnect();
    this.players.splice(i, 1);
  }

  // ── metronoom ─────────────────────────────────────────────────────────
  private startMetronome(from: number, until: number): void {
    this.stopMetronome();
    this.metroNext = from; this.metroUntil = until;
    const beat = 60 / this.song.bpm;
    const tick = (): void => {
      const ctx = this.ctx();
      while (this.metroNext < ctx.currentTime + 0.3 && this.metroNext < this.metroUntil) {
        const n = Math.round((this.metroNext - from) / beat);
        this.click(this.metroNext, n % this.song.beatsPerBar === 0);
        this.metroNext += beat;
      }
      if (this.metroNext >= this.metroUntil) { this.stopMetronome(); return; }
      this.metroTimer = window.setTimeout(tick, 100);
    };
    tick();
  }
  private stopMetronome(): void {
    if (this.metroTimer !== null) { window.clearTimeout(this.metroTimer); this.metroTimer = null; }
  }
  private click(at: number, accent: boolean): void {
    const ctx = this.ctx();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    g.gain.setValueAtTime(accent ? 0.35 : 0.22, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(at); osc.stop(at + 0.05);
  }
}

// ── één transport voor de pagina ───────────────────────────────────────────
let shared: SongTransport | null = null;
export function getSongTransport(info?: () => PatchInfo): SongTransport {
  if (!shared) shared = new SongTransport(getEngine(), info);
  return shared;
}
