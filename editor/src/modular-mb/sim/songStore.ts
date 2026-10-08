// songStore: songs (overdub, vier sporen) bewaren in de browser, IndexedDB
// `mmb-songs`. Bewaren is een handeling van de speler (⤓), nooit
// automatisch. De sporen gaan erin als ruwe stereo-floats, zodat laden
// geen renderen vraagt; de mixdown wordt bij het laden opnieuw gemaakt.

import type { ModularProject } from '../types';
import type { MidiEvent } from './midiRecorder';
import { MAX_TRACKS, clampBpm, clampRegion, type Region, type Song, type SongTrack } from './song';

const DB = 'mmb-songs';
const STORE = 'songs';

export interface StoredTrack {
  id: string; name: string; gain: number; pan: number; mute: boolean;
  sampleRate: number;
  /** Per kanaal de floats; leeg = nog geen opname. */
  channels: ArrayBuffer[];
  midi: MidiEvent[];
  patch: string | null;
}
export interface StoredSong {
  id: string; name: string; bpm: number; beatsPerBar: number; metronome: boolean;
  loop: Region | null;
  savedAt: number;
  tracks: StoredTrack[];
}
export interface SongSummary { id: string; name: string; bpm: number; tracks: number; savedAt: number }

// ── zuiver, voor de tests ──────────────────────────────────────────────────
export function toStored(song: Song, savedAt = Date.now()): StoredSong {
  return {
    id: song.id, name: song.name, bpm: song.bpm, beatsPerBar: song.beatsPerBar, metronome: song.metronome, loop: song.loop, savedAt,
    tracks: song.tracks.slice(0, MAX_TRACKS).map((t) => ({
      id: t.id, name: t.name, gain: t.gain, pan: t.pan, mute: t.mute,
      sampleRate: t.audio?.sampleRate ?? 0,
      channels: t.audio ? t.audio.channels.map((c) => c.slice().buffer) : [],
      midi: t.midi,
      patch: t.patch ? JSON.stringify(t.patch) : null,
    })),
  };
}

export function fromStored(s: StoredSong): Song {
  const tracks: SongTrack[] = (s.tracks ?? []).slice(0, MAX_TRACKS).map((t) => ({
    id: t.id, name: t.name ?? '', gain: finite(t.gain, 0.8), pan: finite(t.pan, 0), mute: !!t.mute,
    audio: t.channels?.length ? { channels: t.channels.map((b) => new Float32Array(b)), sampleRate: t.sampleRate } : null,
    midi: Array.isArray(t.midi) ? t.midi : [],
    patch: parsePatch(t.patch),
  }));
  const song: Song = {
    id: s.id, name: s.name ?? '', bpm: clampBpm(s.bpm),
    beatsPerBar: Math.max(1, Math.min(16, Math.round(s.beatsPerBar || 4))), metronome: s.metronome !== false, loop: null, tracks,
  };
  const r = s.loop;
  song.loop = r && typeof r.from === 'number' && typeof r.to === 'number' ? clampRegion(song, r) : null;
  return song;
}
const finite = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
function parsePatch(text: string | null): ModularProject | null {
  if (!text) return null;
  try { return JSON.parse(text) as ModularProject; } catch { return null; }
}
export function summaryOf(s: StoredSong): SongSummary {
  return { id: s.id, name: s.name, bpm: s.bpm, tracks: (s.tracks ?? []).filter((t) => t.channels?.length).length, savedAt: s.savedAt };
}

// ── IndexedDB ─────────────────────────────────────────────────────────────
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
function request<T>(r: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => { r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); });
}

export async function listSongs(): Promise<SongSummary[]> {
  const db = await openDb();
  if (!db) return [];
  const all = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  db.close();
  return ((all ?? []) as StoredSong[]).map(summaryOf).sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveSong(song: Song): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const ok = (await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(toStored(song)))) !== undefined;
  db.close();
  return ok;
}

export async function loadSong(id: string): Promise<Song | null> {
  const db = await openDb();
  if (!db) return null;
  const s = await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id));
  db.close();
  return s ? fromStored(s as StoredSong) : null;
}

export async function deleteSong(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  db.close();
}
