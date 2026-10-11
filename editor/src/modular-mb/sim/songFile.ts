// songFile: een song (vier sporen) als één bestand op schijf, en terug.
//
// Bewaren in de browser (songStore, ⤓) blijft op dat ene apparaat. Dit
// bestand neem je mee: naar een andere computer, een back-up, of iemand
// anders. Het is een gewone zip (`<naam>.mmbsong.zip`), dus ook zonder de
// editor te openen:
//
//   song.json           tempo, maatsoort, lus, en per spoor naam, volume,
//                       pan, mute, MIDI, knopbewegingen en de patch
//   <n>-<naam>.wav      de opname van spoor n (24 bit)
//   <n>-<naam>.mid      de MIDI van spoor n, voor een DAW
//   <n>-<naam>.auto.json  de knopbewegingen van spoor n, als ze er zijn
//
// Inlezen gebruikt alleen song.json en de wavs; de .mid en .auto.json zijn
// er voor wie de zip uitpakt.

import { trackAutomationFile } from '../automation';
import { zipStore } from './exportDawProject';
import { encodeSmf } from './midiRecorder';
import { MAX_TRACKS, songMs, type Song } from './song';
import { fromStored, type StoredSong } from './songStore';
import { parseWav } from './takeEdit';
import { encodeWav } from './wavRecorder';

export const SONG_FILE_VERSION = 1;

interface SongJsonTrack {
  id: string; name: string; gain: number; pan: number; mute: boolean;
  /** Bestandsnaam van de wav in de zip; null = leeg spoor. */
  wav: string | null;
  midi: StoredSong['tracks'][number]['midi'];
  automation: NonNullable<StoredSong['tracks'][number]['automation']>;
  patch: unknown;
}
interface SongJson {
  format: 'musicbrain-song'; version: number;
  id: string; name: string; bpm: number; beatsPerBar: number; metronome: boolean;
  loop: Song['loop']; savedAt: number;
  tracks: SongJsonTrack[];
}

export class SongFileError extends Error {}

const safe = (s: string): string => s.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function songFileName(song: Song): string {
  return `${safe(song.name) || 'song'}.mmbsong.zip`;
}

/** De song als zip-bestand. */
export function songToFile(song: Song, savedAt = Date.now()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [];
  const tracks: SongJsonTrack[] = song.tracks.slice(0, MAX_TRACKS).map((t, i) => {
    const stem = `${i + 1}-${safe(t.name) || 'spoor'}`;
    let wav: string | null = null;
    if (t.audio) {
      wav = `${stem}.wav`;
      files.push({ name: wav, data: new Uint8Array(encodeWav(t.audio.channels, t.audio.sampleRate, 'i24')) });
      files.push({ name: `${stem}.mid`, data: encodeSmf(t.midi, { lengthMs: songMs(song), name: t.name, bpm: song.bpm, beatsPerBar: song.beatsPerBar }) });
      const auto = trackAutomationFile(t.patch, t.automation ?? [], songMs(song));
      if (auto) files.push({ name: `${stem}.auto.json`, data: enc.encode(JSON.stringify(auto)) });
    }
    return { id: t.id, name: t.name, gain: t.gain, pan: t.pan, mute: t.mute, wav, midi: t.midi, automation: t.automation ?? [], patch: t.patch };
  });
  const json: SongJson = {
    format: 'musicbrain-song', version: SONG_FILE_VERSION,
    id: song.id, name: song.name, bpm: song.bpm, beatsPerBar: song.beatsPerBar, metronome: song.metronome, loop: song.loop, savedAt, tracks,
  };
  return zipStore([{ name: 'song.json', data: enc.encode(JSON.stringify(json)) }, ...files]);
}

/** Leest een zip zonder compressie (zoals zipStore hem schrijft). Een zip
 *  die opnieuw is ingepakt met compressie geeft een duidelijke fout. */
export function unzipStore(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Het einde van de centrale map: van achteren zoeken (er kan commentaar achter staan).
  let eocd = -1;
  for (let p = buf.length - 22; p >= Math.max(0, buf.length - 22 - 65535); p--) {
    if (dv.getUint32(p, true) === 0x06054B50) { eocd = p; break; }
  }
  if (eocd < 0) throw new SongFileError('Geen zip-bestand.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014B50) throw new SongFileError('Zip beschadigd (centrale map).');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (method !== 0) throw new SongFileError(`${name} is gecomprimeerd; laad het bestand zoals de editor het bewaarde (niet opnieuw inpakken).`);
    if (dv.getUint32(local, true) !== 0x04034B50) throw new SongFileError('Zip beschadigd (bestandskop).');
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.set(name.split('/').pop()!, buf.subarray(start, start + size));
  }
  return out;
}

/** Een song uit een bestand van songToFile. Krijgt een nieuwe id, zodat
 *  bewaren in de browser geen bestaande song overschrijft. */
export function songFromFile(buf: Uint8Array, newId: () => string): Song {
  const files = unzipStore(buf);
  const jsonBytes = files.get('song.json');
  if (!jsonBytes) throw new SongFileError('Geen song.json in de zip; is dit een song van de MusicBrain-editor?');
  let json: SongJson;
  try { json = JSON.parse(new TextDecoder().decode(jsonBytes)) as SongJson; } catch { throw new SongFileError('song.json is geen geldige JSON.'); }
  if (json.format !== 'musicbrain-song' || !Array.isArray(json.tracks)) throw new SongFileError('song.json is geen MusicBrain-song.');
  const stored: StoredSong = {
    id: newId(), name: json.name ?? '', bpm: json.bpm, beatsPerBar: json.beatsPerBar, metronome: json.metronome,
    loop: json.loop ?? null, savedAt: json.savedAt ?? Date.now(),
    tracks: json.tracks.map((t) => {
      const bytes = t.wav ? files.get(t.wav) : undefined;
      if (t.wav && !bytes) throw new SongFileError(`${t.wav} ontbreekt in de zip.`);
      const w = bytes ? parseWav(bytes) : null;
      const channels = w ? (w.channels.length === 1 ? [w.channels[0]!, w.channels[0]!] : w.channels.slice(0, 2)) : [];
      return {
        id: t.id, name: t.name, gain: t.gain, pan: t.pan, mute: t.mute,
        sampleRate: w?.sampleRate ?? 0,
        channels: channels.map((c) => c.slice().buffer),
        midi: t.midi ?? [], automation: t.automation ?? [],
        patch: t.patch ? JSON.stringify(t.patch) : null,
      };
    }),
  };
  return fromStored(stored);
}
