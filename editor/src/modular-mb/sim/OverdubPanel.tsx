// Het sporenpaneel van de speelmodus (doc/plans/overdub.md): vier sporen
// onder het klavier. Klapt open met ≣ in de werkbalk (FrontKeys). Per
// spoor: ● opnemen (of opnieuw), de patchnaam, een balkje met de positie
// in de lus, volume, pan, dempen, weg. Eronder de regio (tempo, maten),
// de metronoom, ▶/■, bewaren, laden en exporteren.
//
// Bewaren is een handeling (⤓): nooit automatisch. Exporteren geeft de
// mix en per spoor mid + patch (song.exportFiles).

import { useEffect, useState, useSyncExternalStore } from 'react';

import { nlen, useLang } from '../../i18n';
import { downloadBlob, encodeSmf, patchSnapshot, patchTempo } from './midiRecorder';
import { MAX_TRACKS, exportFiles, type Song } from './song';
import { deleteSong, listSongs, loadSong, saveSong, type SongSummary } from './songStore';
import { getSongTransport, type SongTransport } from './SongTransport';
import { encodeWav } from './wavRecorder';
import { getProject } from '../store';
import { TOOLBAR_BTN } from './ScreenKeys';

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

export function OverdubPanel(): JSX.Element {
  useLang();
  const t = useSongTransport();
  const { song, phase, armed, error } = t.getState();
  const busy = phase === 'countIn' || phase === 'recording';
  const hasAudio = song.tracks.some((x) => x.audio);
  const [pos, setPos] = useState(0);
  const [saved, setSaved] = useState<SongSummary[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // De positie in de lus, voor de balkjes.
  useEffect(() => {
    if (phase === 'idle') { setPos(0); return undefined; }
    let raf = 0;
    const tick = (): void => { setPos(t.position()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, t]);

  // Nieuwe song: tempo van de patch van nu, als die er een heeft.
  function adoptPatchTempo(): void {
    const bpm = currentPatchInfo().bpm;
    if (bpm) t.setRegion(bpm, song.bars);
  }

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

  const rows = Array.from({ length: MAX_TRACKS }, (_, i) => song.tracks[i]);
  const regionLocked = hasAudio;

  return (
    <div data-tour="keys-tracks-panel" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: 8, border: '1px solid #cbd2d9', borderRadius: 8, background: '#f8fafc', fontSize: 12 }}>
      {rows.map((tr, i) => {
        const isArmed = armed === i;
        const filled = !!tr?.audio;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={() => void t.record(i)} disabled={busy}
              title={filled ? nlen('Dit spoor opnieuw opnemen', 'Record this track again') : nlen('Dit spoor opnemen: één maat aftellen, dan één regio', 'Record this track: one bar count-in, then one region')}
              aria-label={nlen(`Spoor ${i + 1} opnemen`, `Record track ${i + 1}`)}
              style={{ ...btn, width: 32, padding: 0, color: '#dc2626', fontWeight: 700, background: isArmed ? (phase === 'countIn' ? '#fde68a' : '#fecaca') : undefined }}>
              {isArmed && phase === 'countIn' ? '…' : '●'}
            </button>
            <span style={{ width: 12, color: '#94a3b8' }}>{i + 1}</span>
            <span style={{ flex: '1 1 80px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: filled || isArmed ? '#0f172a' : '#94a3b8' }}>
              {tr?.name || (isArmed ? currentPatchInfo().name : '—')}
            </span>
            {/* Balkje: de regio, met de positie. */}
            <span style={{ flex: '2 1 90px', height: 10, borderRadius: 3, background: filled ? '#cbd5e1' : '#e2e8f0', position: 'relative', overflow: 'hidden' }}>
              {(filled || isArmed) && phase !== 'idle' && pos >= 0 && (
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(pos * 100)}%`, background: isArmed && phase === 'recording' ? '#f87171' : '#60a5fa' }} />
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
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={regionLocked ? nlen('De regio ligt vast zodra er een spoor is', 'The region is fixed once a track exists') : nlen('Tempo van de regio', 'Tempo of the region')}>
          <input type="number" min={40} max={240} value={song.bpm} disabled={regionLocked || busy}
            onChange={(e) => t.setRegion(Number(e.target.value), song.bars)} style={{ width: 52, fontSize: 12 }} /> bpm
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={nlen('Lengte van de regio in maten', 'Length of the region in bars')}>
          <select value={song.bars} disabled={regionLocked || busy} onChange={(e) => t.setRegion(song.bpm, Number(e.target.value))} style={{ fontSize: 12, height: 24 }}>
            {[1, 2, 4, 8].map((b) => <option key={b} value={b}>{b}</option>)}
          </select> {nlen('maten', 'bars')}
        </label>
        {!regionLocked && currentPatchInfo().bpm && currentPatchInfo().bpm !== song.bpm && (
          <button type="button" onClick={adoptPatchTempo} style={btn} title={nlen('Neem het tempo van de patch over', 'Take the tempo from the patch')}>⟲ {currentPatchInfo().bpm}</button>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title={nlen('Metronoom tijdens afspelen en opnemen (het aftellen tikt altijd)', 'Metronome while playing and recording (the count-in always ticks)')}>
          <input type="checkbox" checked={song.metronome} onChange={(e) => t.setMetronome(e.target.checked)} /> {nlen('metronoom', 'metronome')}
        </label>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => void save()} disabled={!hasAudio || busy} style={btn} title={nlen('Bewaar de song in de browser (met de mix)', 'Save the song in the browser (with the mix)')}>⤓ {nlen('bewaren', 'save')}</button>
        <button type="button" onClick={() => void openList()} disabled={busy} style={btn} title={nlen('Een bewaarde song laden', 'Load a saved song')}>📂</button>
        <button type="button" onClick={exportAll} disabled={!hasAudio || busy} style={btn} title={nlen('Exporteren: de mix als wav, en per spoor mid + patch', 'Export: the mix as wav, and mid + patch per track')}>⤴ {nlen('export', 'export')}</button>
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
      {(msg || error) && <span style={{ ...small, color: error ? '#b91c1c' : small.color }}>{error ?? msg}</span>}
      <span style={small}>
        {phase === 'countIn' ? nlen('Aftellen…', 'Counting in…')
          : phase === 'recording' ? nlen(`Opnemen op de patch van nu: ${currentPatchInfo().name}`, `Recording on the current patch: ${currentPatchInfo().name}`)
          : nlen('● bij een spoor: één maat aftellen, dan één regio op de patch van nu. Kies daarna een andere patch voor het volgende spoor.',
                 '● on a track: one bar count-in, then one region on the current patch. Then choose another patch for the next track.')}
      </span>
    </div>
  );
}

export type { Song };
