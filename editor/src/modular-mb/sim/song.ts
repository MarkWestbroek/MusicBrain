// Song: vier sporen in de speelmodus (doc/plans/overdub.md). Dit is het
// zuivere deel, zonder Web Audio: het model, de maat-rekensom, het knippen
// en invoegen (drop-in) van een opname, de mix en de exportbestanden. De
// transport (afspelen, aftellen, opnemen, lus) staat in SongTransport.ts,
// het bewaren in songStore.ts.
//
// Een spoor is een vrije opname, zo lang als je speelt; de song is zo lang
// als het langste spoor. Een regio (van maat … tot maat) kun je daarna
// loopen en op een spoor opnieuw inspelen (drop-in), zo vaak je wilt.

import type { ModularProject } from '../types';
import type { MidiEvent } from './midiRecorder';

export const MAX_TRACKS = 4;

export interface TrackAudio { channels: Float32Array[]; sampleRate: number }

export interface SongTrack {
  id: string;
  /** Naam van de patch waarmee het spoor is ingespeeld. */
  name: string;
  gain: number;          // 0..1
  pan: number;           // −1..1
  mute: boolean;
  /** De opname, stereo; null = nog leeg. */
  audio: TrackAudio | null;
  /** De gespeelde MIDI, t in ms vanaf het begin van de song. */
  midi: MidiEvent[];
  /** Momentopname van de patch (patchSnapshot), om later opnieuw te renderen. */
  patch: ModularProject | null;
}

/** Regio in maten: `from` t/m `to` − 1 (0-based, `to` exclusief). */
export interface Region { from: number; to: number }

export interface Song {
  id: string;
  name: string;
  bpm: number;
  beatsPerBar: number;
  metronome: boolean;
  /** De regio die geloopt wordt (drop-in); null = de hele song, zonder lus. */
  loop: Region | null;
  tracks: SongTrack[];
}

let seq = 0;
const newId = (p: string): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newSong(bpm = 120): Song {
  return { id: newId('song'), name: '', bpm: clampBpm(bpm), beatsPerBar: 4, metronome: true, loop: null, tracks: [] };
}
export function emptyTrack(name: string): SongTrack {
  return { id: newId('trk'), name, gain: 0.8, pan: 0, mute: false, audio: null, midi: [], patch: null };
}
export const clampBpm = (v: number): number => (Number.isFinite(v) ? Math.max(40, Math.min(240, Math.round(v))) : 120);

/** Lengte van één tel en één maat in ms. */
export const beatMs = (s: Pick<Song, 'bpm'>): number => 60_000 / s.bpm;
export const barMs = (s: Pick<Song, 'bpm' | 'beatsPerBar'>): number => beatMs(s) * s.beatsPerBar;

/** Lengte van de song: het langste spoor, in frames op `rate` (0 zonder sporen). */
export function songFrames(song: Song, rate: number): number {
  let n = 0;
  for (const t of song.tracks) if (t.audio) n = Math.max(n, Math.round(t.audio.channels[0]!.length * rate / t.audio.sampleRate));
  return n;
}
export const songMs = (song: Song): number => songFrames(song, 1000);
/** Aantal maten (naar boven afgerond) dat de song beslaat. */
export const songBars = (song: Song): number => Math.max(0, Math.ceil(songMs(song) / barMs(song) - 1e-6));

/** Een regio in maten, begrensd op de song; null als er niets te loopen is. */
export function clampRegion(song: Song, r: Region): Region | null {
  const bars = songBars(song);
  if (bars <= 0) return null;
  const from = Math.max(0, Math.min(bars - 1, Math.floor(r.from)));
  const to = Math.max(from + 1, Math.min(bars, Math.ceil(r.to)));
  return { from, to };
}
/** De lus in ms: de regio, of de hele song. */
export function loopMs(song: Song): { start: number; end: number } {
  const r = song.loop && clampRegion(song, song.loop);
  if (!r) return { start: 0, end: songMs(song) };
  return { start: r.from * barMs(song), end: Math.min(songMs(song), r.to * barMs(song)) };
}

export function withTrack(song: Song, index: number, track: SongTrack): Song {
  const tracks = [...song.tracks];
  while (tracks.length < index) tracks.push(emptyTrack(''));
  tracks[index] = track;
  return { ...song, tracks: tracks.slice(0, MAX_TRACKS) };
}
export function withoutTrack(song: Song, index: number): Song {
  return { ...song, tracks: song.tracks.filter((_, i) => i !== index) };
}
export function filledTracks(song: Song): SongTrack[] { return song.tracks.filter((t) => t.audio !== null); }

/**
 * Knip een stuk uit een opname: vanaf `startFrame`, `frames` lang. Te kort =
 * aanvullen met nullen; een korte fade aan beide kanten (2 ms) tegen tikken.
 */
export function cutRegion(channels: readonly Float32Array[], startFrame: number, frames: number, fadeFrames = 96): Float32Array[] {
  const s = Math.max(0, Math.round(startFrame));
  return channels.map((src) => {
    const dst = new Float32Array(frames);
    const n = Math.max(0, Math.min(frames, src.length - s));
    if (n > 0) dst.set(src.subarray(s, s + n));
    const f = Math.min(fadeFrames, frames >> 1);
    for (let i = 0; i < f; i++) {
      const g = i / f;
      dst[i] = dst[i]! * g;
      dst[frames - 1 - i] = dst[frames - 1 - i]! * g;
    }
    return dst;
  });
}

/**
 * Drop-in: zet `piece` in `base` op `startFrame`, met een korte kruisfade
 * aan beide randen zodat de naad niet tikt. Steekt het stuk voorbij het
 * eind, dan groeit het spoor mee.
 */
export function punchIn(base: readonly Float32Array[], piece: readonly Float32Array[], startFrame: number, fadeFrames = 96): Float32Array[] {
  const s = Math.max(0, Math.round(startFrame));
  return base.map((b, c) => {
    const p = piece[c] ?? piece[0]!;
    const out = new Float32Array(Math.max(b.length, s + p.length));
    out.set(b);
    const f = Math.min(fadeFrames, p.length >> 1);
    for (let i = 0; i < p.length; i++) {
      const g = i < f ? i / f : i >= p.length - f ? (p.length - 1 - i) / f : 1;
      out[s + i] = out[s + i]! * (1 - g) + p[i]! * g;
    }
    return out;
  });
}

/** Equal-power pan: −1 = links, 0 = midden, +1 = rechts. */
export function panGains(pan: number): [number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  const a = ((p + 1) / 2) * (Math.PI / 2);
  return [Math.cos(a), Math.sin(a)];
}

/** De mix van de sporen (gain, pan, mute) als stereo, `frames` lang. */
export function mixdown(tracks: readonly SongTrack[], frames: number): Float32Array[] {
  const l = new Float32Array(frames), r = new Float32Array(frames);
  for (const t of tracks) {
    if (!t.audio || t.mute) continue;
    const [gl, gr] = panGains(t.pan);
    const sl = t.audio.channels[0]!, sr = t.audio.channels[1] ?? sl;
    // Een mono bron zit op beide kanalen; pan verdeelt die. Een stereo bron
    // houdt zijn beeld en schuift ermee (equal-power, zoals de MIXER).
    const n = Math.min(frames, sl.length);
    for (let i = 0; i < n; i++) {
      l[i] = l[i]! + sl[i]! * t.gain * gl * Math.SQRT2;
      r[i] = r[i]! + sr[i]! * t.gain * gr * Math.SQRT2;
    }
  }
  return [l, r];
}

/**
 * MIDI van een opname naar songtijd: `startMs` is waar het opgenomen stuk
 * begon in de opname, `lengthMs` hoe lang het is; de events komen terug
 * met t vanaf `offsetMs` (waar het stuk in de song staat). Een noot die bij
 * het begin al klinkt begint op het begin, een noot die aan het eind nog
 * klinkt krijgt daar zijn noot-uit.
 */
export function midiToRegion(events: readonly MidiEvent[], startMs: number, lengthMs: number, offsetMs = 0): MidiEvent[] {
  const out: MidiEvent[] = [];
  const held = new Map<number, number>();
  const before = new Map<number, MidiEvent>();
  for (const e of events) {
    const t = e.t - startMs;
    const hi = e.status & 0xF0, key = ((e.status & 0x0F) << 7) | e.d1;
    if (t < 0) {
      if (hi === 0x90 && e.d2 > 0) before.set(key, e);
      else if (hi === 0x80 || (hi === 0x90 && e.d2 === 0)) before.delete(key);
      continue;
    }
    if (before.size) { for (const [k, b] of before) { out.push({ ...b, t: offsetMs }); held.set(k, b.status & 0x0F); } before.clear(); }
    if (t >= lengthMs) continue;
    if (hi === 0x90 && e.d2 > 0) held.set(key, e.status & 0x0F);
    else if (hi === 0x80 || (hi === 0x90 && e.d2 === 0)) held.delete(key);
    out.push({ ...e, t: t + offsetMs });
  }
  for (const [k, b] of before) { out.push({ ...b, t: offsetMs }); held.set(k, b.status & 0x0F); }
  for (const [key, ch] of held) out.push({ t: offsetMs + lengthMs, status: 0x80 | ch, d1: key & 0x7F, d2: 0 });
  return out;
}

/** Drop-in voor de MIDI: wat van het spoor in [startMs, endMs) lag gaat weg,
 *  de nieuwe events (al in songtijd) komen ervoor in de plaats. */
export function spliceMidi(base: readonly MidiEvent[], piece: readonly MidiEvent[], startMs: number, endMs: number): MidiEvent[] {
  const kept = base.filter((e) => e.t < startMs || e.t >= endMs);
  return [...kept, ...piece].sort((a, b) => a.t - b.t);
}

export interface ExportFile { name: string; blob: Blob }
export interface Encoders {
  wav: (channels: Float32Array[], sampleRate: number) => ArrayBuffer | Uint8Array<ArrayBuffer>;
  smf: (events: readonly MidiEvent[], opts: { lengthMs: number; name?: string; bpm: number; beatsPerBar: number }) => Uint8Array<ArrayBuffer>;
}

/**
 * De exportset: `mix.wav`, en per spoor `n.mid` en `n.patch.json` (zeven
 * bestanden bij drie sporen). `withStems` zet ook `n.wav` erbij, zodat de
 * export ook zonder renderen weer te laden is.
 */
export function exportFiles(song: Song, enc: Encoders, withStems = false): ExportFile[] {
  const tracks = filledTracks(song);
  const rate = tracks[0]?.audio?.sampleRate ?? 48000;
  const frames = songFrames(song, rate);
  const base = (song.name.trim() || 'song').replace(/[^\w.-]+/g, '-');
  const files: ExportFile[] = [
    { name: `${base}-mix.wav`, blob: new Blob([enc.wav(mixdown(tracks, frames), rate)], { type: 'audio/wav' }) },
  ];
  tracks.forEach((t, i) => {
    const n = i + 1;
    files.push({ name: `${base}-${n}.mid`, blob: new Blob([enc.smf(t.midi, { lengthMs: songMs(song), name: t.name, bpm: song.bpm, beatsPerBar: song.beatsPerBar })], { type: 'audio/midi' }) });
    if (t.patch) files.push({ name: `${base}-${n}.patch.json`, blob: new Blob([JSON.stringify(t.patch, null, 1)], { type: 'application/json' }) });
    if (withStems && t.audio) files.push({ name: `${base}-${n}.wav`, blob: new Blob([enc.wav(t.audio.channels, t.audio.sampleRate)], { type: 'audio/wav' }) });
  });
  return files;
}
