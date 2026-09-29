// Take-editor: een take (wav + mid) samen bekijken, bijsnijden en exporteren.
// Stap 1 van de kleine editor: bijsnijden tot het lusvenster (audio en MIDI
// samen, sample-precies, met fades), ongedaan maken, en exporteren als
// wav + mid, als Reaper-project, of terug naar de media library (nieuwe take
// of vervangen). Openen vanuit 📚 Takes (✎), na een opname, of met bestanden.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MidiRoll } from '../../take-player/MidiRoll';
import { AudioPlayback } from '../../take-player/playback';
import { parseSmf, type ParsedSmf } from '../../take-player/smf';
import { EDITOR_PALETTE } from './MidiRoll';
import { parseWav, wavPeaks, cropWav, cropMidi, wavDurationMs, type WavData } from './takeEdit';
import { encodeWav } from './wavRecorder';
import { encodeSmf, slimSnapshot, MARKER_LOOP_START, MARKER_LOOP_END, MARKER_TEL1, type MidiEvent } from './midiRecorder';
import { buildRpp } from './exportRpp';
import { loadLibrarySettings, uploadTake, replaceAsset, slugName, splitTakeName } from './mediaLibrary';
import { encodePatchSysex, SYSEX_CMD } from './patchSysex';
import { buildConfigPayload } from '../teensyLink';
import type { ModularProject } from '../types';

export interface TakeDoc {
  /** Naam zonder extensie, bv. "mmb-koper-20260929-101500". */
  name: string;
  wav: WavData;
  midi: ParsedSmf | null;
  patch?: Blob | null;
  /** Slugs in de library, als de take daar vandaan kwam. */
  origin?: { group?: string; wav?: string; mid?: string };
}

// ── open/dicht, zonder globale store ──────────────────────────────────
const listeners = new Set<(d: TakeDoc | null) => void>();
let current: TakeDoc | null = null;
export function openTakeEditor(doc: TakeDoc): void { current = doc; listeners.forEach((fn) => fn(doc)); }
function closeTakeEditor(): void { current = null; listeners.forEach((fn) => fn(null)); }

/** Een take uit bestanden/bytes: wav verplicht, mid en patch optioneel. */
export function takeFromBytes(name: string, wav: Uint8Array, mid?: Uint8Array | null, patch?: Blob | null, origin?: TakeDoc['origin']): TakeDoc {
  return { name, wav: parseWav(wav), midi: mid ? parseSmf(mid) : null, patch: patch ?? null, origin };
}

export function TakeEditorHost(): JSX.Element | null {
  const [doc, setDoc] = useState<TakeDoc | null>(current);
  useEffect(() => { listeners.add(setDoc); return () => { listeners.delete(setDoc); }; }, []);
  return doc ? <TakeEditorWindow key={doc.name + doc.wav.channels[0]?.length} initial={doc} onClose={closeTakeEditor} /> : null;
}

/** Lege MIDI voor een take zonder .mid, zodat de rol (tijd, raster, golfvorm) er toch is. */
function emptyMidi(durationMs: number): ParsedSmf {
  return { events: [], durationMs, tracks: 1, bpm: 120, beatsPerBar: 4 };
}

/** MIDI-events van een ParsedSmf, voor opnieuw schrijven. */
function eventsOf(f: ParsedSmf): MidiEvent[] {
  return f.events.map((e) => ({ t: e.t, status: e.bytes[0]!, d1: e.bytes[1] ?? 0, d2: e.bytes[2] ?? 0 }));
}

function download(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function TakeEditorWindow({ initial, onClose }: { initial: TakeDoc; onClose: () => void }): JSX.Element {
  const [history, setHistory] = useState<TakeDoc[]>([]);
  const [doc, setDoc] = useState<TakeDoc>(initial);
  const [name, setName] = useState(() => splitTakeName(initial.name).name);
  const [fadeMs, setFadeMs] = useState(5);
  // De patch van de take als SysEx op tel 0 van de .mid: speelt een DAW de
  // .mid af naar de MusicBrain, dan komt eerst de klank mee.
  const [embedPatch, setEmbedPatch] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pos, setPos] = useState(() => ({ x: Math.max(16, (window.innerWidth - 800) / 2), y: 70 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pb, setPb] = useState<AudioPlayback | null>(null);

  const durMs = wavDurationMs(doc.wav);
  const midi = doc.midi ?? emptyMidi(durMs);
  const wavBlob = useMemo(() => new Blob([encodeWav(doc.wav.channels, doc.wav.sampleRate, 'i24')], { type: 'audio/wav' }), [doc.wav]);
  const wavUrl = useMemo(() => URL.createObjectURL(wavBlob), [wavBlob]);
  useEffect(() => () => URL.revokeObjectURL(wavUrl), [wavUrl]);
  const peaks = useMemo(() => wavPeaks(doc.wav, 1600), [doc.wav]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const p = new AudioPlayback(a, midi, doc.name);
    setPb(p);
    return () => { p.destroy(); setPb(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavUrl]);
  useEffect(() => { pb?.setFile(midi, doc.name); }, [pb, doc.midi]);
  const [, setTick] = useState(0);
  useEffect(() => pb?.onState(() => setTick((x) => x + 1)), [pb]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!drag.current) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)) });
    };
    const up = (): void => { drag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const region = pb?.state().region ?? null;
  const stem = `mmb-${slugName(name) || 'take'}-${splitTakeName(doc.name).stamp || stamp()}`;

  /** De patch als SysEx-berichten (firmwareconfig + editor-patch), of leeg. */
  async function patchSysex(): Promise<Uint8Array[]> {
    if (!embedPatch || !doc.patch) return [];
    const json = await doc.patch.text();
    const snap = JSON.parse(json) as ModularProject;
    return [
      ...await encodePatchSysex(SYSEX_CMD.firmwareConfig, buildConfigPayload(snap).json),
      ...await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify(slimSnapshot(snap))),
    ];
  }

  /** De .mid zoals hij nu is, met tel 1 en het lusvenster als markers (en de patch als SysEx). */
  async function midBytes(): Promise<Uint8Array<ArrayBuffer>> {
    const sysex = await patchSysex();
    const g = pb?.grid() ?? { bpm: midi.bpm, offsetMs: midi.tel1Ms ?? 0, beatsPerBar: midi.beatsPerBar };
    const markers: { t: number; text: string }[] = [];
    if (g.offsetMs > 0) markers.push({ t: g.offsetMs, text: MARKER_TEL1 });
    if (region) markers.push({ t: region.start, text: MARKER_LOOP_START }, { t: region.end, text: MARKER_LOOP_END });
    return encodeSmf(eventsOf(midi), { lengthMs: durMs, name: name || undefined, bpm: g.bpm, beatsPerBar: g.beatsPerBar, markers, sysex });
  }

  function crop(): void {
    if (!region) return;
    const g = pb?.grid() ?? { bpm: midi.bpm, offsetMs: 0, beatsPerBar: midi.beatsPerBar };
    const barMs = (60_000 / g.bpm) * g.beatsPerBar;
    const wav = cropWav(doc.wav, region.start, region.end, fadeMs);
    let newMidi: ParsedSmf | null = null;
    if (doc.midi) {
      const c = cropMidi(doc.midi, region.start, region.end, { tel1Ms: g.offsetMs, barMs });
      const markers = c.tel1Ms !== undefined ? [{ t: c.tel1Ms, text: MARKER_TEL1 }] : [];
      newMidi = parseSmf(encodeSmf(c.events, { lengthMs: c.lengthMs, name: doc.midi.name, bpm: g.bpm, beatsPerBar: g.beatsPerBar, markers }));
    }
    setHistory((h) => [...h, doc]);
    setDoc({ ...doc, wav, midi: newMidi });
    setMsg({ ok: true, text: `Bijgesneden tot ${((region.end - region.start) / 1000).toFixed(2)} s.` });
  }

  function undo(): void {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDoc(prev);
    setMsg(null);
  }

  async function exportFiles(): Promise<void> {
    download(wavBlob, `${stem}.wav`, 'audio/wav');
    if (doc.midi) download(await midBytes(), `${stem}.mid`, 'audio/midi');
    setMsg({ ok: true, text: `${stem}.wav${doc.midi ? ' en .mid' : ''} gedownload.` });
  }

  function exportReaper(): void {
    const g = pb?.grid() ?? { bpm: midi.bpm, offsetMs: 0, beatsPerBar: midi.beatsPerBar };
    const rpp = buildRpp({
      name: name || 'take', bpm: g.bpm, beatsPerBar: g.beatsPerBar, lengthMs: durMs,
      wavFile: `${stem}.wav`, midi: doc.midi ? eventsOf(doc.midi) : undefined, loop: region,
    });
    download(rpp, `${stem}.rpp`, 'text/plain');
    download(wavBlob, `${stem}.wav`, 'audio/wav');
    setMsg({ ok: true, text: `${stem}.rpp en .wav gedownload. Zet ze in dezelfde map en open het project in Reaper.` });
  }

  async function toLibraryNew(): Promise<void> {
    setBusy('new'); setMsg(null);
    try {
      const group = `mmb-${slugName(name) || 'take'}-${stamp()}`;
      const files = [{ name: `${group}.wav`, blob: wavBlob }];
      if (doc.midi) files.push({ name: `${group}.mid`, blob: new Blob([await midBytes()], { type: 'audio/midi' }) });
      if (doc.patch) files.push({ name: `${group}.patch.json`, blob: doc.patch });
      const assets = await uploadTake({ group, files }, loadLibrarySettings());
      setMsg({ ok: true, text: `Nieuwe take in de library: ${group} (${assets.length} bestanden).` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  }

  async function toLibraryReplace(): Promise<void> {
    const o = doc.origin;
    if (!o?.wav) return;
    setBusy('replace'); setMsg(null);
    try {
      const s = loadLibrarySettings();
      await replaceAsset(o.wav, { name: `${stem}.wav`, blob: wavBlob }, s);
      if (o.mid && doc.midi) await replaceAsset(o.mid, { name: `${stem}.mid`, blob: new Blob([await midBytes()], { type: 'audio/midi' }) }, s);
      setMsg({ ok: true, text: 'Vervangen in de library; de vorige versies blijven in de geschiedenis.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  }

  async function openFiles(list: FileList | null): Promise<void> {
    if (!list?.length) return;
    try {
      const files = [...list];
      const wav = files.find((f) => /\.wav$/i.test(f.name));
      const mid = files.find((f) => /\.midi?$/i.test(f.name));
      if (!wav) throw new Error('Kies een .wav (en eventueel de .mid erbij).');
      const next = takeFromBytes(wav.name.replace(/\.wav$/i, ''), new Uint8Array(await wav.arrayBuffer()),
        mid ? new Uint8Array(await mid.arrayBuffer()) : null);
      setHistory((h) => [...h, doc]);
      setDoc(next);
      setName(splitTakeName(next.name).name);
      setMsg(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const box: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 64, width: 800, maxWidth: 'calc(100vw - 32px)',
    background: '#ffffff', color: '#0f172a', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', fontSize: 12,
  };
  const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 12px' };
  return (
    <div style={box} role="dialog" aria-label="Take-editor">
      <div onMouseDown={(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); }}
        style={{ cursor: 'move', padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
        <strong>Take-editor</strong>
        <span style={{ color: '#6b7280' }}>
          {(durMs / 1000).toFixed(2)} s · {doc.wav.sampleRate} Hz · {doc.wav.channels.length === 2 ? 'stereo' : `${doc.wav.channels.length} kan.`}
          {doc.midi ? ` · ${doc.midi.events.length} MIDI-events` : ' · geen MIDI'}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        <button onClick={onClose} aria-label="Sluiten">✕</button>
      </div>
      <div style={row}>
        <label>Naam <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} /></label>
        <label title="Open een andere take van schijf: kies de .wav en eventueel de .mid">Openen
          <input type="file" multiple accept=".wav,.mid,.midi,audio/wav,audio/midi" onChange={(e) => { void openFiles(e.target.files); e.target.value = ''; }} style={{ width: 190 }} />
        </label>
      </div>
      <div style={{ padding: '0 12px' }}>
        <audio ref={audioRef} src={wavUrl} preload="auto" style={{ display: 'none' }} />
        {pb && <MidiRoll playback={pb} palette={EDITOR_PALETTE} tokens={false} keyScope="focus" peaks={peaks} peaksMs={durMs} label={`Take ${name}`} />}
      </div>
      <div style={row}>
        <button onClick={crop} disabled={!region} title={region ? 'Audio en MIDI samen bijsnijden tot het lusvenster' : 'Sleep eerst in de liniaal een venster'}>
          ✂ Bijsnijden tot venster
        </button>
        <label title="Korte fade in en uit tegen klikken op de knippunten">fade <input type="number" min={0} max={200} value={fadeMs}
          onChange={(e) => setFadeMs(Math.max(0, Math.min(200, Number(e.target.value) || 0)))} style={{ width: 50 }} /> ms</label>
        <button onClick={undo} disabled={!history.length} title="Laatste bewerking terugdraaien">↶ Ongedaan</button>
        <span style={{ marginLeft: 'auto' }} />
        {doc.patch && (
          <label title="De patch van de take als SysEx in de .mid (op tel 0): een DAW die de .mid naar de MusicBrain speelt, stuurt dan eerst de klank mee">
            <input type="checkbox" checked={embedPatch} onChange={(e) => setEmbedPatch(e.target.checked)} /> patch in .mid
          </label>
        )}
        <button onClick={() => void exportFiles()} title="Download de wav en de .mid (met tempo, tel 1 en lus als markers)">⤓ wav + mid</button>
        <button onClick={exportReaper} title="Download een Reaper-project (.rpp) met de wav als audiotrack en de MIDI als MIDI-track">⤓ Reaper</button>
        <button onClick={() => void toLibraryNew()} disabled={busy !== null} title="Als nieuwe take in de media library zetten">
          {busy === 'new' ? '…' : '⤴ Nieuwe take'}
        </button>
        {doc.origin?.wav && (
          <button onClick={() => void toLibraryReplace()} disabled={busy !== null} title="De wav en .mid van de oorspronkelijke take in de library vervangen (vorige versie blijft in de geschiedenis)">
            {busy === 'replace' ? '…' : '⤴ Vervangen'}
          </button>
        )}
      </div>
      {msg && <div style={{ padding: '0 12px 10px', color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.ok ? '✔' : '⚠'} {msg.text}</div>}
    </div>
  );
}
