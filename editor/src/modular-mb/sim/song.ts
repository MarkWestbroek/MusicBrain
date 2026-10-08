// Song: vier sporen in de speelmodus (doc/plans/overdub.md). Dit is het
// zuivere deel, zonder Web Audio: het model, de regio-rekensom, het
// knippen van een opname op de regio, de mix en de exportbestanden. De
// transport (afspelen, aftellen, opnemen) staat in SongTransport.ts, het
// bewaren in songStore.ts.
//
// Een spoor is precies één regio lang: `bars` maten op `bpm`. Afspelen is
// de som van de sporen (wav) plus wat je live speelt; wat op een spoor
// komt is de patch van dat moment, via de recorder-tap van de engine.

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
  /** Eén regio, stereo; null = nog leeg. */
  audio: TrackAudio | null;
  /** De gespeelde MIDI, t in ms vanaf het begin van de regio. */
  midi: MidiEvent[];
  /** Momentopname van de patch (patchSnapshot), om later opnieuw te renderen. */
  patch: ModularProject | null;
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  beatsPerBar: number;
  metronome: boolean;
  tracks: SongTrack[];
}

let seq = 0;
const newId = (p: string): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newSong(bpm = 120, bars = 2): Song {
  return { id: newId('song'), name: '', bpm: clampBpm(bpm), bars: clampBars(bars), beatsPerBar: 4, metronome: true, tracks: [] };
}
export function emptyTrack(name: string): SongTrack {
  return { id: newId('trk'), name, gain: 0.8, pan: 0, mute: false, audio: null, midi: [], patch: null };
}
export const clampBpm = (v: number): number => (Number.isFinite(v) ? Math.max(40, Math.min(240, Math.round(v))) : 120);
export const clampBars = (v: number): number => (Number.isFinite(v) ? Math.max(1, Math.min(16, Math.round(v))) : 2);

/** Lengte van één tel, van de aftelmaat en van de regio, in ms. */
export const beatMs = (s: Pick<Song, 'bpm'>): number => 60_000 / s.bpm;
export const countInMs = (s: Pick<Song, 'bpm' | 'beatsPerBar'>): number => beatMs(s) * s.beatsPerBar;
export const regionMs = (s: Pick<Song, 'bpm' | 'beatsPerBar' | 'bars'>): number => countInMs(s) * s.bars;
export const regionFrames = (s: Pick<Song, 'bpm' | 'beatsPerBar' | 'bars'>, sampleRate: number): number =>
  Math.round((regionMs(s) / 1000) * sampleRate);

/** Hoe de sporen in de song verdeeld zijn over de vier plekken. */
export function trackAt(song: Song, index: number): SongTrack | undefined { return song.tracks[index]; }
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
 * Knip de regio uit een opname: `startFrame` is waar de regio begint in de
 * opgenomen buffer, `frames` de lengte. Te kort = aanvullen met nullen; en
 * een korte fade aan beide kanten (2 ms), zodat de lus niet tikt op de naad.
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
 * MIDI van een opname naar regio-tijd: `regionStartMs` is waar de regio
 * begon in de opname (na het aftellen). Wat vóór de regio of na het eind
 * valt gaat weg; een noot die nog klinkt aan het eind krijgt een noot-uit
 * op het eind, zodat de .mid netjes sluit.
 */
export function midiToRegion(events: readonly MidiEvent[], regionStartMs: number, lengthMs: number): MidiEvent[] {
  const out: MidiEvent[] = [];
  const held = new Map<number, number>();
  // Een noot die tijdens het aftellen begon en bij de regio nog klinkt,
  // begint in de .mid op 0 — anders mist een latere render die noot.
  const before = new Map<number, MidiEvent>();
  for (const e of events) {
    const t = e.t - regionStartMs;
    const hi = e.status & 0xF0, key = ((e.status & 0x0F) << 7) | e.d1;
    if (t < 0) {
      if (hi === 0x90 && e.d2 > 0) before.set(key, e);
      else if (hi === 0x80 || (hi === 0x90 && e.d2 === 0)) before.delete(key);
      continue;
    }
    if (before.size) { for (const [k, b] of before) { out.push({ ...b, t: 0 }); held.set(k, b.status & 0x0F); } before.clear(); }
    if (t >= lengthMs) continue;
    if (hi === 0x90 && e.d2 > 0) held.set(key, e.status & 0x0F);
    else if (hi === 0x80 || (hi === 0x90 && e.d2 === 0)) held.delete(key);
    out.push({ ...e, t });
  }
  for (const [k, b] of before) { out.push({ ...b, t: 0 }); held.set(k, b.status & 0x0F); }
  for (const [key, ch] of held) out.push({ t: lengthMs, status: 0x80 | ch, d1: key & 0x7F, d2: 0 });
  return out;
}

/** Hoe laat alles moet beginnen, in contexttijd: aftellen vanaf `at`, de
 *  regio daarna, en waar de opname dan geknipt moet worden. */
export function schedule(song: Song, at: number): { countIn: number; region: number; end: number } {
  const countIn = at;
  const region = at + countInMs(song) / 1000;
  return { countIn, region, end: region + regionMs(song) / 1000 };
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
  const frames = regionFrames(song, rate);
  const base = (song.name.trim() || 'song').replace(/[^\w.-]+/g, '-');
  const files: ExportFile[] = [
    { name: `${base}-mix.wav`, blob: new Blob([enc.wav(mixdown(tracks, frames), rate)], { type: 'audio/wav' }) },
  ];
  tracks.forEach((t, i) => {
    const n = i + 1;
    files.push({ name: `${base}-${n}.mid`, blob: new Blob([enc.smf(t.midi, { lengthMs: regionMs(song), name: t.name, bpm: song.bpm, beatsPerBar: song.beatsPerBar })], { type: 'audio/midi' }) });
    if (t.patch) files.push({ name: `${base}-${n}.patch.json`, blob: new Blob([JSON.stringify(t.patch, null, 1)], { type: 'application/json' }) });
    if (withStems && t.audio) files.push({ name: `${base}-${n}.wav`, blob: new Blob([enc.wav(t.audio.channels, t.audio.sampleRate)], { type: 'audio/wav' }) });
  });
  return files;
}
