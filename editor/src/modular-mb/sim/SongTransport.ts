// SongTransport: de vierspoors recorder van de speelmodus
// (doc/plans/overdub.md). Twee manieren van opnemen:
//
//   • vrij: ● op een spoor zonder lus — één maat aftellen (metronoom), dan
//     opnemen zo lang je speelt, tot ■; de andere sporen spelen mee vanaf
//     het begin. Dat wordt het hele spoor (en de song groeit mee).
//   • drop-in: zet een regio (van maat … tot maat) en de lus aan, ▶ loopt
//     de regio; ● op een spoor neemt de volgende ronde van de lus op en zet
//     die in het spoor op die plek (met kruisfades); de lus loopt door, zo
//     vaak je wilt.
//
// Tijd: alles staat op de klok van de AudioContext. De spelers van de
// sporen zijn AudioBufferSourceNodes (met `loop`, `loopStart`, `loopEnd`
// voor de regio), gestart op één gepland moment; de recorder
// (MasterRecorder) meldt het contextframe waarop hij begon, dus een stuk
// wordt sample-precies uit de opname geknipt.
//
// Wat je hoort: de sporen en de metronoom gaan rechtstreeks naar de
// luidsprekers, buiten de `speakers`-bus van de engine om — de recorder tapt
// die bus, dus op een spoor komt alleen de patch.

import * as Tone from 'tone';

import type { ModularProject } from '../types';
import type { AudioEngine } from './AudioEngine';
import { getEngine } from './engineSingleton';
import { MidiRecorder } from './midiRecorder';
import {
  MAX_TRACKS, barMs, clampRegion, cutRegion, emptyTrack, loopMs, midiToRegion, newSong, punchIn, songMs, spliceMidi, withTrack, withoutTrack,
  type Region, type Song, type SongTrack,
} from './song';
import { MasterRecorder } from './wavRecorder';

export type Phase = 'idle' | 'countIn' | 'recording' | 'playing';
export interface TransportState {
  song: Song;
  phase: Phase;
  /** Spoor dat opgenomen wordt (of klaarstaat voor de volgende ronde). */
  armed: number | null;
  /** Drop-in: klaarstaan tot de lus weer bij het begin van de regio is. */
  waiting: boolean;
  error: string | null;
}
/** Wat het spoor over de patch van dat moment onthoudt. `restart`: modules
 *  met een eigen patroon (ritmebox) die op maat 1 opnieuw moeten beginnen,
 *  anders valt hun "één" ergens in de maat. */
export interface PatchInfo { name: string; bpm: number | null; snapshot: ModularProject | null; restart?: string[] }

interface Player { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; trackId: string }

export class SongTransport {
  private state: TransportState;
  private listeners = new Set<() => void>();
  private players: Player[] = [];
  private recorder = new MasterRecorder();
  private midiRec = new MidiRecorder();
  private midiUnsub: (() => void) | null = null;
  /** Contexttijd waarop songtijd 0 ligt (de spelers lopen daar vanaf). */
  private origin = 0;
  /** Contexttijd waarop de opname (performance-klok van de MidiRecorder) begon. */
  private recCtxAt = 0;
  private metroTimer: number | null = null;
  private metroNext = 0;
  private metroUntil = Infinity;
  private metroFrom = 0;
  private endTimer: number | null = null;
  private armTimer: number | null = null;
  private restartTimer: number | null = null;

  constructor(private readonly engine: AudioEngine = getEngine(), private readonly info: () => PatchInfo = () => ({ name: '', bpm: null, snapshot: null })) {
    this.state = { song: newSong(), phase: 'idle', armed: null, waiting: false, error: null };
  }

  // ── stand ─────────────────────────────────────────────────────────────
  getState(): TransportState { return this.state; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(next: Partial<TransportState>): void { this.state = { ...this.state, ...next }; for (const l of this.listeners) l(); }
  get song(): Song { return this.state.song; }

  /** Positie in de song in ms (voor de balkjes); tijdens het aftellen negatief. */
  positionMs(): number {
    if (this.state.phase === 'idle') return 0;
    const t = (this.ctx().currentTime - this.origin) * 1000;
    if (t < 0) return t;
    const lp = this.looping();
    if (!lp) return t;
    const len = lp.end - lp.start;
    return len > 0 ? lp.start + ((t - lp.start) % len + len) % len : t;
  }
  /** De lus die nu geldt (regio én lus aan), of null. */
  private looping(): { start: number; end: number } | null {
    if (!this.song.loop) return null;
    const lp = loopMs(this.song);
    return lp.end > lp.start ? lp : null;
  }

  // ── song ──────────────────────────────────────────────────────────────
  setSong(song: Song): void { this.stop(); this.set({ song }); }
  setBpm(bpm: number): void {
    if (this.song.tracks.some((t) => t.audio)) return;   // het tempo ligt vast zodra er een spoor is
    this.set({ song: { ...this.song, bpm: newSong(bpm).bpm } });
  }
  setName(name: string): void { this.set({ song: { ...this.song, name } }); }
  setMetronome(on: boolean): void {
    this.set({ song: { ...this.song, metronome: on } });
    if (this.state.phase === 'playing') { if (on) this.startMetronome(this.origin, Infinity); else this.stopMetronome(); }
  }
  /** Regio in maten; null = geen lus. Tijdens het spelen begint de lus opnieuw. */
  setLoop(r: Region | null): void {
    const loop = r ? clampRegion(this.song, r) : null;
    const playing = this.state.phase === 'playing';
    if (playing) this.stop();
    this.set({ song: { ...this.song, loop } });
    if (playing) void this.play();
  }
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
    this.set({ song: { ...song, loop: song.loop && clampRegion(song, song.loop) } });
    if (song.tracks.every((x) => !x.audio)) this.stop();
  }

  // ── transport ─────────────────────────────────────────────────────────
  async play(): Promise<void> {
    if (this.state.phase !== 'idle') return;
    if (!this.song.tracks.some((t) => t.audio)) return;
    await this.engine.start();
    const lp = this.looping();
    const at = this.ctx().currentTime + 0.1;
    this.origin = at - (lp ? lp.start / 1000 : 0);
    this.startPlayers(at);
    if (this.song.metronome) this.startMetronome(this.origin, Infinity);
    this.set({ phase: 'playing', armed: null, waiting: false, error: null });
    if (!lp) this.endTimer = window.setTimeout(() => { this.endTimer = null; this.stop(); }, songMs(this.song) + 150);
  }

  stop(): void {
    if (this.restartTimer !== null) { window.clearTimeout(this.restartTimer); this.restartTimer = null; this.setRun(this.info().restart ?? [], true); }
    if (this.endTimer !== null) { window.clearTimeout(this.endTimer); this.endTimer = null; }
    if (this.armTimer !== null) { window.clearTimeout(this.armTimer); this.armTimer = null; }
    this.stopMetronome();
    for (const p of [...this.players]) this.stopPlayer(p.trackId);
    this.midiUnsub?.(); this.midiUnsub = null;
    const wasFree = this.state.phase === 'recording' && !this.looping() && this.state.armed !== null;
    if (wasFree) { void this.finishFree(this.state.armed!); return; }
    if (this.recorder.active) void this.recorder.stop().catch(() => undefined);
    if (this.midiRec.active) this.midiRec.stop(0);
    this.set({ phase: 'idle', armed: null, waiting: false });
  }

  /** ● op spoor `i`: vrij opnemen (geen lus) of drop-in (lus aan en spelend). */
  async record(i: number): Promise<void> {
    if (i < 0 || i >= MAX_TRACKS) return;
    if (this.looping() && this.song.tracks.some((t) => t.audio)) return this.dropIn(i);
    return this.recordFree(i);
  }

  /** Vrij: één maat aftellen, dan opnemen tot ■. */
  private async recordFree(i: number): Promise<void> {
    if (this.state.phase === 'countIn' || this.state.phase === 'recording') return;
    this.stop();
    try {
      await this.engine.start();
      const ctx = this.ctx();
      await this.recorder.start(this.engine.recorderTap());
      this.recCtxAt = ctx.currentTime;
      this.midiRec.start(performance.now());
      this.midiUnsub = this.engine.onMidi(this.midiRec.record);
      const countIn = ctx.currentTime + 0.15;
      this.origin = countIn + barMs(this.song) / 1000;
      this.restartAt(this.origin);
      this.startPlayers(this.origin, i);
      // Aftellen tikt altijd; daarna alleen met de metronoom aan.
      this.startMetronome(countIn, this.song.metronome ? Infinity : this.origin);
      this.set({ phase: 'countIn', armed: i, waiting: false, error: null });
      this.armTimer = window.setTimeout(() => { this.armTimer = null; if (this.state.armed === i && this.state.phase === 'countIn') this.set({ phase: 'recording' }); },
        Math.max(0, (this.origin - ctx.currentTime) * 1000));
    } catch (e) {
      this.stop();
      this.set({ error: e instanceof Error ? e.message : String(e) });
    }
  }
  private async finishFree(i: number): Promise<void> {
    try {
      const r = await this.recorder.stop();
      const events = this.midiRec.stop(0);
      const first = this.recorder.startFrame ?? Math.round(this.recCtxAt * r.sampleRate);
      const startFrame = Math.round(this.origin * r.sampleRate) - first;
      const frames = Math.max(0, r.frames - startFrame);
      const lengthMs = frames / r.sampleRate * 1000;
      const info = this.info();
      const prev = this.song.tracks[i];
      const track: SongTrack = {
        ...(prev ?? emptyTrack(info.name)),
        name: info.name || prev?.name || `Spoor ${i + 1}`,
        audio: frames > 0 ? { channels: cutRegion(r.channels, startFrame, frames), sampleRate: r.sampleRate } : null,
        midi: midiToRegion(events, (this.origin - this.recCtxAt) * 1000, lengthMs),
        patch: info.snapshot,
      };
      this.set({ song: withTrack(this.song, i, track), phase: 'idle', armed: null, waiting: false });
    } catch (e) {
      this.set({ phase: 'idle', armed: null, waiting: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Drop-in: de volgende ronde van de lus opnemen in spoor `i`. */
  private async dropIn(i: number): Promise<void> {
    const lp = this.looping();
    if (!lp) return;
    if (this.state.phase === 'idle') await this.play();
    if (this.state.phase !== 'playing' || this.state.armed !== null) return;
    try {
      const ctx = this.ctx();
      await this.recorder.start(this.engine.recorderTap());
      this.recCtxAt = ctx.currentTime;
      this.midiRec.start(performance.now());
      this.midiUnsub = this.engine.onMidi(this.midiRec.record);
      // De volgende keer dat de lus bij het begin van de regio is.
      const len = (lp.end - lp.start) / 1000;
      const since = ctx.currentTime - (this.origin + lp.start / 1000);
      const rounds = Math.floor(since / len) + 1;
      const start = this.origin + lp.start / 1000 + rounds * len;
      const end = start + len;
      this.restartAt(start);
      this.set({ armed: i, waiting: true, error: null });
      this.armTimer = window.setTimeout(() => { this.armTimer = null; if (this.state.armed === i) this.set({ phase: 'recording', waiting: false }); },
        Math.max(0, (start - ctx.currentTime) * 1000));
      this.endTimer = window.setTimeout(() => { this.endTimer = null; void this.finishDropIn(i, start, end).catch((e) => this.set({ error: String(e), armed: null, waiting: false, phase: 'playing' })); },
        Math.max(0, (end - ctx.currentTime) * 1000) + 60);
    } catch (e) {
      this.set({ armed: null, waiting: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  private async finishDropIn(i: number, start: number, end: number): Promise<void> {
    this.midiUnsub?.(); this.midiUnsub = null;
    const r = await this.recorder.stop();
    const events = this.midiRec.stop(0);
    if (this.state.armed !== i) return;
    const first = this.recorder.startFrame ?? Math.round(this.recCtxAt * r.sampleRate);
    const startFrame = Math.round(start * r.sampleRate) - first;
    const frames = Math.round((end - start) * r.sampleRate);
    const piece = cutRegion(r.channels, startFrame, frames);
    // De ronde begint altijd bij het begin van de regio, hoe vaak de lus ook al rond was.
    const atMs = loopMs(this.song).start;
    const info = this.info();
    const prev = this.song.tracks[i] ?? emptyTrack(info.name);
    const base = prev.audio && prev.audio.sampleRate === r.sampleRate ? prev.audio.channels : [new Float32Array(0), new Float32Array(0)];
    const audio = { channels: punchIn(base, piece, Math.round(atMs / 1000 * r.sampleRate)), sampleRate: r.sampleRate };
    const midi = spliceMidi(prev.midi, midiToRegion(events, (start - this.recCtxAt) * 1000, (end - start) * 1000, atMs), atMs, atMs + (end - start) * 1000);
    const track: SongTrack = { ...prev, name: prev.audio ? prev.name : (info.name || `Spoor ${i + 1}`), audio, midi, patch: prev.patch ?? info.snapshot };
    this.set({ song: withTrack(this.song, i, track), phase: 'playing', armed: null, waiting: false });
    // Het spoor opnieuw in de lus, op de plek waar de anderen nu zijn.
    this.startPlayer(track, this.ctx().currentTime + 0.05);
  }

  // ── patroonmodules op de maat ─────────────────────────────────────────
  /** Ritmebox en dergelijke: nu stil, en op contexttijd `at` opnieuw vanaf
   *  stap 1 (`run` 0 → 1 doet `restart()` in de kern). Live via de engine,
   *  zonder de patch te wijzigen. Een paar ms vóór `at`, want het bericht
   *  naar de worklet kost een blok. */
  private restartAt(at: number): void {
    const ids = this.info().restart ?? [];
    if (!ids.length) return;
    this.setRun(ids, false);
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => { this.restartTimer = null; this.setRun(ids, true); },
      Math.max(0, (at - this.ctx().currentTime) * 1000 - 4));
  }
  private setRun(ids: readonly string[], on: boolean): void {
    for (const id of ids) this.engine.updateControl(id, 'run', on);
  }

  // ── spelers ───────────────────────────────────────────────────────────
  private ctx(): AudioContext { return Tone.getContext().rawContext as AudioContext; }
  private startPlayers(at: number, except?: number): void {
    this.song.tracks.forEach((t, k) => { if (t.audio && k !== except) this.startPlayer(t, at); });
  }
  /** Start een spoor op contexttijd `when`, op de songpositie die daar hoort
   *  (origin); met een lus op de regio. */
  private startPlayer(t: SongTrack, when: number): void {
    if (!t.audio) return;
    this.stopPlayer(t.id);
    const ctx = this.ctx();
    const { channels, sampleRate } = t.audio;
    const buf = ctx.createBuffer(2, channels[0]!.length, sampleRate);
    buf.getChannelData(0).set(channels[0]!);
    buf.getChannelData(1).set(channels[1] ?? channels[0]!);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.looping();
    if (lp) { src.loop = true; src.loopStart = lp.start / 1000; src.loopEnd = Math.min(buf.duration, lp.end / 1000); }
    const gain = ctx.createGain(); gain.gain.value = t.mute ? 0 : t.gain;
    const pan = ctx.createStereoPanner(); pan.pan.value = t.pan;
    src.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
    let offset = when - this.origin;
    if (lp) { const len = lp.end / 1000 - lp.start / 1000; offset = lp.start / 1000 + (((offset - lp.start / 1000) % len) + len) % len; }
    if (offset < 0) { src.start(when - offset, 0); }
    else if (offset < buf.duration) src.start(when, offset);
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
    const ctx = this.ctx();
    const beat = 60 / this.song.bpm;
    // Vanaf `from`, maar niet in het verleden: de eerstvolgende tel.
    this.metroFrom = from;
    this.metroNext = from + Math.max(0, Math.ceil((ctx.currentTime - from) / beat)) * beat;
    this.metroUntil = until;
    const tick = (): void => {
      while (this.metroNext < this.ctx().currentTime + 0.3 && this.metroNext < this.metroUntil) {
        const n = Math.round((this.metroNext - this.metroFrom) / beat);
        this.click(this.metroNext, ((n % this.song.beatsPerBar) + this.song.beatsPerBar) % this.song.beatsPerBar === 0);
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
