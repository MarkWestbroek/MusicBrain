// Het sporenpaneel van de speelmodus (doc/plans/overdub.md): vier sporen
// onder het klavier. Klapt open met ≣ in de werkbalk (FrontKeys).
//
//   1. ● op een spoor: één maat aftellen (metronoom), dan opnemen zo lang
//      je speelt, tot ■. De andere sporen spelen mee.
//   2. Daarna: een regio (van maat … tot maat) en de lus aan; ▶ loopt de
//      regio en ● op een spoor neemt de volgende ronde op in dat spoor
//      (drop-in), zo vaak je wilt.
//   3. Tevreden: volume en pan per spoor, ⤓ bewaren, ⤴ exporteren.
//
// Bewaren is een handeling (⤓): nooit automatisch.

import { useEffect, useState, useSyncExternalStore } from 'react';

import { nlen, useLang } from '../../i18n';
import { setPatchControl } from '../setPatchControl';
import { getProject, useModularProject } from '../store';
import { downloadBlob, encodeSmf, patchSnapshot, patchTempo, tempoControl } from './midiRecorder';
import { TOOLBAR_BTN } from './ScreenKeys';
import { MAX_TRACKS, barMs, exportFiles, songBars, songMs } from './song';
import { deleteSong, listSongs, loadSong, saveSong, type SongSummary } from './songStore';
import { getSongTransport, type SongTransport } from './SongTransport';
import { encodeWav } from './wavRecorder';

/** De patch van nu, voor het spoor: naam, tempo, momentopname. */
function currentPatchInfo(): { name: string; bpm: number | null; snapshot: ReturnType<typeof patchSnapshot> | null } {
  const project = getProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  if (!patch) return { name: '', bpm: null, snapshot: null };
  return { name: patch.name, bpm: patchTempo(project, patch), snapshot: patchSnapshot(project, patch) };
}

export function useSongTransport(): SongTransport {
  const t = getSongTransport(currentPatchInfo);
  useSyncExternalStore(t.subscribe.bind(t), t.getState.bind(t));
  return t;
}

const btn: React.CSSProperties = { ...TOOLBAR_BTN, padding: '0 8px' };
const small: React.CSSProperties = { fontSize: 11, color: '#64748b' };
const fmt = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export function OverdubPanel(): JSX.Element {
  useLang();
  const t = useSongTransport();
  const { song, phase, armed, waiting, error } = t.getState();
  const busy = phase === 'countIn' || phase === 'recording' || waiting;
  const hasAudio = song.tracks.some((x) => x.audio);
  const bars = songBars(song);
  const total = songMs(song);
  const loopOn = !!song.loop && hasAudio;
  const [pos, setPos] = useState(0);
  const [saved, setSaved] = useState<SongSummary[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Tempo gelijk houden met de patch (ritmebox, klok): voor het eerste spoor
  // volgt de song de patch; daarna volgt de patch de song, zodat een
  // ritmebox op spoor 2 in de maat van spoor 1 loopt.
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  const tempo = patch ? tempoControl(project, patch) : null;
  useEffect(() => {
    if (!patch || !tempo || tempo.bpm === song.bpm) return;
    if (!hasAudio) t.setBpm(tempo.bpm);
    else setPatchControl(patch.id, tempo.moduleId, 'tempo', song.bpm);
  }, [patch?.id, tempo?.moduleId, tempo?.bpm, song.bpm, hasAudio]);   // eslint-disable-line react-hooks/exhaustive-deps

  // De positie in de song, voor de balkjes en de teller.
  useEffect(() => {
    if (phase === 'idle') { setPos(0); return undefined; }
    let raf = 0;
    const tick = (): void => { setPos(t.positionMs()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, t]);

  async function save(): Promise<void> {
    const name = window.prompt(nlen('Naam van de song:', 'Name of the song:'), song.name || currentPatchInfo().name);
    if (name === null) return;
    t.setName(name.trim() || song.name);
    setMsg((await saveSong(t.song)) ? nlen('Bewaard in de browser.', 'Saved in the browser.') : nlen('Bewaren mislukt (geen opslag).', 'Could not save (no storage).'));
    setSaved(null);
  }
  function exportAll(): void {
    const files = exportFiles(song, {
      wav: (ch, rate) => encodeWav(ch, rate, 'i24'),
      smf: (events, o) => encodeSmf(events, o),
    });
    for (const f of files) downloadBlob(f.blob, f.name, f.blob.type);
    setMsg(nlen(`${files.length} bestanden gedownload.`, `${files.length} files downloaded.`));
  }
  async function openList(): Promise<void> { setSaved(await listSongs()); }
  async function load(id: string): Promise<void> {
    const s = await loadSong(id);
    if (s) { t.setSong(s); setSaved(null); setMsg(null); }
  }
  const setLoopBars = (from: number, to: number): void => t.setLoop({ from, to });

  const rows = Array.from({ length: MAX_TRACKS }, (_, i) => song.tracks[i]);
  const bpmLocked = hasAudio;
  const recordTitle = (filled: boolean): string => loopOn
    ? nlen('Drop-in: de volgende ronde van de lus opnemen in dit spoor', 'Drop-in: record the next round of the loop into this track')
    : filled ? nlen('Dit spoor opnieuw opnemen (aftellen, dan tot ■)', 'Record this track again (count-in, then until ■)')
    : nlen('Dit spoor opnemen: één maat aftellen, dan zo lang je speelt, tot ■', 'Record this track: one bar count-in, then for as long as you play, until ■');

  return (
    <div data-tour="keys-tracks-panel" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: 8, border: '1px solid #cbd2d9', borderRadius: 8, background: '#f8fafc', fontSize: 12 }}>
      {rows.map((tr, i) => {
        const isArmed = armed === i;
        const filled = !!tr?.audio;
        const trackMs = tr?.audio ? tr.audio.channels[0]!.length / tr.audio.sampleRate * 1000 : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => void t.record(i)} disabled={busy}
              title={recordTitle(filled)} aria-label={nlen(`Spoor ${i + 1} opnemen`, `Record track ${i + 1}`)}
              style={{ ...btn, width: 32, padding: 0, color: '#dc2626', fontWeight: 700, background: isArmed ? (phase === 'recording' ? '#fecaca' : '#fde68a') : undefined }}>
              {isArmed && phase !== 'recording' ? '…' : '●'}
            </button>
            <span style={{ width: 12, color: '#94a3b8' }}>{i + 1}</span>
            <span style={{ flex: '1 1 80px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: filled || isArmed ? '#0f172a' : '#94a3b8' }}>
              {tr?.name || (isArmed ? currentPatchInfo().name : '—')}
            </span>
            {/* Balkje: het spoor op de lengte van de song, de regio, en de positie. */}
            <span style={{ flex: '2 1 90px', height: 10, borderRadius: 3, background: '#e2e8f0', position: 'relative', overflow: 'hidden' }}>
              {filled && total > 0 && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, trackMs / total * 100)}%`, background: '#cbd5e1' }} />}
              {song.loop && total > 0 && (
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${song.loop.from * barMs(song) / total * 100}%`, width: `${(song.loop.to - song.loop.from) * barMs(song) / total * 100}%`, background: loopOn ? 'rgba(251,191,36,0.45)' : 'rgba(148,163,184,0.3)' }} />
              )}
              {phase !== 'idle' && pos >= 0 && total > 0 && (
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(100, pos / total * 100)}%`, width: 2, background: isArmed && phase === 'recording' ? '#dc2626' : '#2563eb' }} />
              )}
            </span>
            <input type="range" min={0} max={1} step={0.01} value={tr?.gain ?? 0.8} disabled={!tr}
              onChange={(e) => t.setTrack(i, { gain: Number(e.target.value) })} title={nlen('Volume', 'Volume')} style={{ width: 54 }} />
            <input type="range" min={-1} max={1} step={0.05} value={tr?.pan ?? 0} disabled={!tr}
              onChange={(e) => t.setTrack(i, { pan: Number(e.target.value) })} title={nlen('Pan', 'Pan')} style={{ width: 44 }} />
            <button type="button" onClick={() => t.setTrack(i, { mute: !tr?.mute })} disabled={!filled}
              title={nlen('Dempen', 'Mute')} aria-label={nlen('Dempen', 'Mute')} style={{ ...btn, padding: '0 6px', opacity: tr?.mute ? 0.4 : 1 }}>🔈</button>
            <button type="button" onClick={() => { if (window.confirm(nlen('Dit spoor weggooien?', 'Discard this track?'))) t.clearTrack(i); }} disabled={!filled || busy}
              title={nlen('Spoor weg', 'Remove track')} aria-label={nlen('Spoor weg', 'Remove track')} style={{ ...btn, padding: '0 6px' }}>✕</button>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #e2e8f0' }}>
        <button type="button" onClick={() => (phase === 'idle' ? void t.play() : t.stop())} disabled={!hasAudio && phase === 'idle'}
          style={{ ...btn, fontWeight: 700 }} aria-label={phase === 'idle' ? nlen('Afspelen', 'Play') : nlen('Stop', 'Stop')}>
          {phase === 'idle' ? '▶' : '■'}
        </button>
        <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 72 }}>{fmt(Math.max(0, pos))} / {fmt(total)}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={bpmLocked ? nlen('Het tempo ligt vast zodra er een spoor is', 'The tempo is fixed once a track exists') : nlen('Tempo van de metronoom en de maten', 'Tempo of the metronome and the bars')}>
          <input type="number" min={40} max={240} value={song.bpm} disabled={bpmLocked || busy}
            onChange={(e) => t.setBpm(Number(e.target.value))} style={{ width: 52, fontSize: 12 }} /> bpm
        </label>
        {tempo && <span style={small} title={nlen('De tempoknop van de patch loopt mee', 'The tempo knob of the patch follows')}>⟲ {patch?.name}</span>}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={nlen('Metronoom tijdens afspelen en opnemen (het aftellen tikt altijd)', 'Metronome while playing and recording (the count-in always ticks)')}>
          <input type="checkbox" checked={song.metronome} onChange={(e) => t.setMetronome(e.target.checked)} /> {nlen('metronoom', 'metronome')}
        </label>
      </div>
      {hasAudio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
             title={nlen('Regio: een stuk van de song om te loopen; ● op een spoor neemt dan de volgende ronde op (drop-in)', 'Region: a part of the song to loop; ● on a track then records the next round (drop-in)')}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={!!song.loop} disabled={busy}
              onChange={(e) => (e.target.checked ? setLoopBars(0, Math.min(bars, 2)) : t.setLoop(null))} /> {nlen('lus', 'loop')}
          </label>
          {song.loop && (
            <>
              {nlen('maat', 'bar')}
              <select value={song.loop.from + 1} disabled={busy} onChange={(e) => setLoopBars(Number(e.target.value) - 1, Math.max(Number(e.target.value), song.loop!.to))} style={{ fontSize: 12, height: 24 }}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b + 1}>{b + 1}</option>)}
              </select>
              {nlen('t/m', 'to')}
              <select value={song.loop.to} disabled={busy} onChange={(e) => setLoopBars(Math.min(song.loop!.from, Number(e.target.value) - 1), Number(e.target.value))} style={{ fontSize: 12, height: 24 }}>
                {Array.from({ length: bars }, (_, b) => <option key={b} value={b + 1}>{b + 1}</option>)}
              </select>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => void save()} disabled={busy} style={btn} title={nlen('Bewaar de song in de browser (met de mix)', 'Save the song in the browser (with the mix)')}>⤓ {nlen('bewaren', 'save')}</button>
          <button type="button" onClick={exportAll} disabled={busy} style={btn} title={nlen('Exporteren: de mix als wav, en per spoor mid + patch', 'Export: the mix as wav, and mid + patch per track')}>⤴ {nlen('export', 'export')}</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => void openList()} disabled={busy} style={btn} title={nlen('Een bewaarde song laden', 'Load a saved song')}>📂 {nlen('laden', 'load')}</button>
        <span style={{ flex: 1 }} />
        {(msg || error) && <span style={{ ...small, color: error ? '#b91c1c' : small.color }}>{error ?? msg}</span>}
      </div>
      {saved && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {saved.length === 0 && <span style={small}>{nlen('Nog geen bewaarde songs.', 'No saved songs yet.')}</span>}
          {saved.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => void load(s.id)} style={{ ...btn, flex: 1, justifyContent: 'flex-start' }}>
                {s.name || nlen('(zonder naam)', '(no name)')} · {s.tracks} {nlen('sporen', 'tracks')} · {s.bpm} bpm · {new Date(s.savedAt).toLocaleDateString()}
              </button>
              <button type="button" onClick={() => { if (window.confirm(nlen('Deze song verwijderen?', 'Delete this song?'))) void deleteSong(s.id).then(openList); }} style={{ ...btn, padding: '0 6px' }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setSaved(null)} style={{ ...btn, alignSelf: 'flex-start' }}>{nlen('sluiten', 'close')}</button>
        </div>
      )}
      <span style={small}>
        {phase === 'countIn' ? nlen('Aftellen…', 'Counting in…')
          : waiting ? nlen('Klaar voor de volgende ronde…', 'Ready for the next round…')
          : phase === 'recording' ? nlen(`Opnemen op de patch van nu: ${currentPatchInfo().name} — ■ om te stoppen`, `Recording on the current patch: ${currentPatchInfo().name} — ■ to stop`)
          : !hasAudio ? nlen('● bij een spoor: één maat aftellen, dan spelen zo lang je wilt, ■ om te stoppen. Kies daarna een andere patch voor het volgende spoor.',
                            '● on a track: one bar count-in, then play for as long as you like, ■ to stop. Then choose another patch for the next track.')
          : nlen('Nog een spoor: ● erbij. Een stuk overdoen: lus aan, de maten kiezen, ▶, en ● op het spoor neemt de volgende ronde op.',
                 'Another track: ● on it. To redo a part: loop on, pick the bars, ▶, and ● on the track records the next round.')}
      </span>
    </div>
  );
}
