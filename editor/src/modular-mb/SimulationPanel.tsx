// Simulation tab — speelt de actieve patch via een minimale Tone.js-engine.
//
// Drie MIDI-bronnen zijn beschikbaar (on-screen toetsenbord, test-sequence,
// echte Web MIDI). De engine bouwt een MVP-voice (VCO → VCF → VCA met
// AHDSR-envelope) op basis van de modules+controls in de patch. Latere
// iteraties kunnen `patch.connections` echt volgen en meerdere stemmen
// ondersteunen — zie roadmap in Requirements.md §v0.3-simulatie.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useModularProject } from './store';
import { AudioEngine, type EngineStatus } from './sim/AudioEngine';
import { getEngine } from './sim/engineSingleton';
import {
  MasterRecorder, encodeWav, dbfs, wavFileName, downloadWav,
} from './sim/wavRecorder';
import { dx7Host, WasmModule } from './runtime';
import {
  ScreenKeyboardSource, TestSequenceSource, WebMidiSource,
  type MidiSource, type MidiEvent,
} from './sim/MidiSource';
import type { ModularProject, Patch, ControlValue } from './types';

type SourceId = 'screen' | 'sequence' | 'webmidi';

export function SimulationPanel(): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId)
             ?? project.patches[0];

  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = getEngine();
  const engine = engineRef.current;

  const sources = useMemo<Record<SourceId, MidiSource>>(() => ({
    screen:   new ScreenKeyboardSource(),
    sequence: new TestSequenceSource(),
    webmidi:  new WebMidiSource(),
  }), []);

  const [sourceId, setSourceId] = useState<SourceId>('sequence');
  const source = sources[sourceId];

  const [status, setStatus] = useState<EngineStatus>(
    { running: false, voiceFreqHz: 0, level: 0, liveControls: {} });
  const [masterVol, setMasterVol] = useState(0.7);
  const [error, setError] = useState<string | null>(null);

  // Opname van de master-som. De recorder leeft buiten React (hij hangt aan de
  // audiograaf), dus alleen de afgeleide tijd en de nabeschouwing staan in
  // state.
  const recRef = useRef<MasterRecorder | null>(null);
  if (recRef.current === null) recRef.current = new MasterRecorder();
  const recorder = recRef.current;
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [recDone, setRecDone] = useState<string | null>(null);

  // (Re)bouw de signal-graph zodra topologie van de patch verandert.
  // Live-knop-wijzigingen worden via engine.updateControl direct verwerkt
  // zonder rebuild (geen klikken / opnieuw starten van oscillators).
  const prevSigRef = useRef<string>('');
  const prevCtrlRef = useRef<Record<string, Record<string, unknown>>>({});
  useEffect(() => {
    if (!patch) return;
    // Topologie-signature: alleen connections + modules + rack-leden.
    const sig = JSON.stringify({
      conns: patch.connections,
      rackIds: patch.rackIds,
      mods: project.modules.map((m) => ({ id: m.id, typeId: m.typeId })),
      racks: project.racks.map((r) => ({ id: r.id, slots: r.slots })),
    });
    if (sig !== prevSigRef.current) {
      prevSigRef.current = sig;
      prevCtrlRef.current = JSON.parse(JSON.stringify(patch.controlState ?? {}));
      const wasRunning = status.running;
      engine.build(project, patch);
      engine.setMasterVolume(masterVol);
      if (wasRunning) { void engine.start(); }
      return;
    }
    // Topologie ongewijzigd → diff controls en push live.
    const next = patch.controlState ?? {};
    const prev = prevCtrlRef.current;
    let needRebuild = false;
    for (const mid of Object.keys(next)) {
      const nv = next[mid] ?? {};
      const pv = prev[mid] ?? {};
      for (const k of Object.keys(nv)) {
        if (pv[k] !== nv[k]) {
          const handled = engine.updateControl(mid, k, nv[k] as ControlValue);
          if (!handled) needRebuild = true;
        }
      }
    }
    prevCtrlRef.current = JSON.parse(JSON.stringify(next));
    if (needRebuild) {
      const wasRunning = status.running;
      engine.build(project, patch);
      if (wasRunning) { void engine.start(); }
    }
    // status.running bewust uit deps gelaten — anders looped het.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, project, patch]);

  // Master-volume apart — verandert niet de hele engine.
  useEffect(() => { engine.setMasterVolume(masterVol); }, [engine, masterVol]);

  useEffect(() => {
    const unsub = source.subscribe((e: MidiEvent) => {
      if (e.kind === 'noteOn')  engine.noteOn(e.note, e.velocity);
      if (e.kind === 'noteOff') engine.noteOff(e.note);
    });
    return () => { unsub(); };
  }, [engine, source]);

  useEffect(() => engine.subscribe(setStatus), [engine]);

  // De DX7- en wasm-statusregels komen uit statische velden die asynchroon
  // bijgewerkt worden (worklet geladen, voice-naam, actieve stemmen). Zonder
  // eigen tik blijft er "worklet laden…" staan lang nadat hij klaar is — en
  // dan lees je een verkeerde diagnose. Alleen hertekenen als de tekst wijzigt.
  const [engineInfo, setEngineInfo] = useState('');
  useEffect(() => {
    const tick = (): void => {
      const next = `${dx7Host.info() ?? ''}|${WasmModule.info() ?? ''}`;
      setEngineInfo((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);
  void engineInfo;

  useEffect(() => () => {
    Object.values(sources).forEach((s) => s.stop());
    // engine is singleton — niet disposen op unmount.
  }, [engine, sources]);

  useEffect(() => {
    if (!recording) return undefined;
    const id = window.setInterval(() => setRecSecs(recorder.seconds), 200);
    return () => window.clearInterval(id);
  }, [recording, recorder]);

  async function startAll(): Promise<void> {
    try {
      setError(null);
      await engine.start();
      await source.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  function stopAll(): void {
    source.stop();
    engine.stop();
  }

  async function startRec(): Promise<void> {
    try {
      setError(null); setRecDone(null); setRecSecs(0);
      // Opnemen terwijl de engine stilstaat levert een bestand vol nullen op;
      // dan is meteen starten wat je bedoelde.
      if (!status.running) await startAll();
      await recorder.start(engine.recorderTap());
      setRecording(true);
    } catch (err) {
      setRecording(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function stopRec(): Promise<void> {
    try {
      const r = await recorder.stop();
      setRecording(false);
      if (r.frames === 0) { setRecDone('niets opgenomen — de tap kreeg geen blokken door'); return; }
      const name = wavFileName(patch?.name ?? 'patch');
      downloadWav(encodeWav(r.channels, r.sampleRate, 'i24'), name);
      const db = dbfs(r.peak);
      // De piek erbij, want een zachte render merk je anders pas als de
      // bank-import er int16 van maakt en je drie bits kwijt bent.
      const level = db === null ? 'stilte' : `piek ${db.toFixed(1)} dBFS`;
      setRecDone(`${name} · ${r.seconds.toFixed(1)} s · ${r.sampleRate} Hz · ${level}`
               + (r.clipped ? ' · ⚠ overstuurd' : ''));
    } catch (err) {
      setRecording(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function switchSource(next: SourceId): void {
    source.stop();
    setSourceId(next);
  }

  if (!patch) {
    return (
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Selecteer eerst een patch in de Patches-tab.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <fieldset style={fs}>
        <legend style={lg}>Patch & Engine</legend>
        <div style={row}>
          <span><strong>Patch:</strong> {patch.name}</span>
          <span style={{ color: '#475569' }}>
            voice = VCO → VCF → VCA · {status.voiceFreqHz > 0
              ? `${status.voiceFreqHz.toFixed(1)} Hz`
              : '— (geen noot)'}
          </span>
          <NoteReadout note={status.lastNote} />
          {dx7Host.info() && (
            <span style={{ color: dx7Host.lastError ? '#b91c1c' : '#475569' }} title="DX7 (msfa-kern) als wasm — één stem per instantie, poly via PolyGroup">
              {dx7Host.info()}
            </span>
          )}
          {WasmModule.info() && (
            <span style={{ color: WasmModule.lastError ? '#b91c1c' : '#475569' }} title="Teensy-modules als wasm in de browser (tools/mmb-wasm)">
              {WasmModule.info()}
            </span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            {!status.running
              ? <button onClick={startAll} className="primary">▶ Start</button>
              : <button onClick={stopAll}>■ Stop</button>}
            {!recording
              ? <button onClick={() => void startRec()}
                  title="Schrijft de master-som rechtstreeks mee als WAV — geen BlackHole of DAW nodig">
                  ⏺ Opname
                </button>
              : <button onClick={() => void stopRec()} style={{ color: '#b91c1c', fontWeight: 600 }}>
                  ⏹ Stop · {recSecs.toFixed(1)} s
                </button>}
          </span>
        </div>
        <div style={row}>
          <label style={{ fontSize: 12 }}>
            Master volume:
            <input type="range" min={0} max={1} step={0.01} value={masterVol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMasterVol(v); engine.setMasterVolume(v);
              }}
              style={{ width: 160, marginLeft: 8, verticalAlign: 'middle' }} />
            <span style={{ marginLeft: 6, color: '#475569' }}>
              {Math.round(masterVol * 100)}%
            </span>
          </label>
          <LevelMeter level={status.level} />
        </div>
        {recording && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>
            ⏺ Opname loopt — speel je noten en klik dan op <em>Stop</em>.
            Het volume hierboven zit in de opname, dus laat het staan waar het staat.
          </p>
        )}
        {recDone && !recording && (
          <p style={{ color: '#475569', fontSize: 12, margin: '6px 0 0' }}>
            ✔ {recDone}
          </p>
        )}
        {error && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>
            ⚠ {error}
          </p>
        )}
      </fieldset>

      <fieldset style={fs}>
        <legend style={lg}>MIDI-bron</legend>
        <div style={row}>
          {(['screen','sequence','webmidi'] as const).map((id) => (
            <label key={id} style={{ fontSize: 12 }}>
              <input type="radio" name="midisrc" checked={sourceId === id}
                onChange={() => switchSource(id)} />
              {' '}{sources[id].label}
              {id === 'webmidi' && !WebMidiSource.isSupported()
                ? <span style={{ color: '#b91c1c' }}> (niet ondersteund)</span>
                : null}
            </label>
          ))}
        </div>
        <SourceControls source={source} sourceId={sourceId} />
      </fieldset>

      <ModuleMatchSummary project={project} patch={patch} />
    </div>
  );
}

function SourceControls({ source, sourceId }: {
  source: MidiSource; sourceId: SourceId;
}): JSX.Element {
  if (sourceId === 'screen')   return <ScreenKeyboardUi source={source as ScreenKeyboardSource} />;
  if (sourceId === 'sequence') return <SequenceUi      source={source as TestSequenceSource} />;
  return <WebMidiUi source={source as WebMidiSource} />;
}

function ScreenKeyboardUi({ source }: { source: ScreenKeyboardSource }): JSX.Element {
  const [octave, setOctave] = useState(source.getOctave());
  function shift(d: number): void {
    source.setOctave(octave + d);
    setOctave(source.getOctave());
  }
  const startNote = (octave + 1) * 12;
  const keys: { midi: number; black: boolean; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const midi = startNote + i;
    const note = midi % 12;
    const black = [1, 3, 6, 8, 10].includes(note);
    const labels = ['C','','D','','E','F','','G','','A','','B'];
    keys.push({ midi, black, label: labels[note] ?? '' });
  }
  const wKeys = keys.filter((k) => !k.black);
  const W = 22, H = 90;

  function press(midi: number, e: React.PointerEvent<SVGRectElement>): void {
    (e.target as Element).setPointerCapture(e.pointerId);
    source.pressNote(midi);
  }
  const release = (midi: number): void => source.releaseNote(midi);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={row}>
        <button onClick={() => shift(-1)} style={btn}>− octaaf</button>
        <span style={{ fontSize: 12 }}>octaaf {octave} (toetsen Z/X)</span>
        <button onClick={() => shift(1)} style={btn}>+ octaaf</button>
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>
          Computertoetsen: A S D F G H J K (witte), W E T Y U (zwarte)
        </span>
      </div>
      <svg width={wKeys.length * W} height={H}
        style={{ display: 'block', marginTop: 8, userSelect: 'none' }}>
        {wKeys.map((k, i) => (
          <g key={k.midi}>
            <rect x={i * W} y={0} width={W - 1} height={H}
              fill="#fafafa" stroke="#1f2937"
              onPointerDown={(e) => press(k.midi, e)}
              onPointerUp={() => release(k.midi)}
              onPointerCancel={() => release(k.midi)}
              onPointerLeave={(e) => { if (e.buttons) release(k.midi); }}
              style={{ cursor: 'pointer' }} />
            <text x={i * W + (W - 1) / 2} y={H - 6} fontSize={9}
              textAnchor="middle" fill="#475569" pointerEvents="none">
              {k.label}{k.label === 'C' ? Math.floor(k.midi / 12) - 1 : ''}
            </text>
          </g>
        ))}
        {keys.filter((k) => k.black).map((k) => {
          const whiteIdx = wKeys.findIndex((w) => w.midi === k.midi - 1);
          const cx = (whiteIdx + 1) * W - (W * 0.35);
          return (
            <rect key={k.midi}
              x={cx} y={0} width={W * 0.7} height={H * 0.6}
              fill="#1f2937" stroke="#000"
              onPointerDown={(e) => press(k.midi, e)}
              onPointerUp={() => release(k.midi)}
              onPointerCancel={() => release(k.midi)}
              onPointerLeave={(e) => { if (e.buttons) release(k.midi); }}
              style={{ cursor: 'pointer' }} />
          );
        })}
      </svg>
    </div>
  );
}

function SequenceUi({ source }: { source: TestSequenceSource }): JSX.Element {
  const [bpm, setBpm] = useState(source.getBpm());
  return (
    <div style={row}>
      <label style={{ fontSize: 12 }}>
        Tempo:
        <input type="number" min={30} max={300} value={bpm}
          onChange={(e) => {
            const v = Math.max(30, Math.min(300, Number(e.target.value) || 120));
            setBpm(v); source.setBpm(v);
          }}
          style={{ width: 60, marginLeft: 6 }} />
        <span style={{ marginLeft: 4 }}>BPM</span>
      </label>
      <span style={{ fontSize: 11, color: '#6b7280' }}>
        Speelt een C–E–G–C–G–E lus zodra je op Start klikt.
      </span>
    </div>
  );
}

function WebMidiUi({ source }: { source: WebMidiSource }): JSX.Element {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!WebMidiSource.isSupported()) {
    return (
      <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>
        Web MIDI is niet beschikbaar in deze browser. Gebruik Chrome/Edge,
        recente Firefox of Safari 18+. Op Firefox kan het achter
        <code> dom.webmidi.enabled </code> verborgen zitten.
      </p>
    );
  }
  return (
    <p style={{ fontSize: 12, margin: 0, color: '#475569' }}>
      Verbonden apparaten: <strong>{source.describe?.() ?? '—'}</strong>
      {' '}— klik op <em>Start</em> hierboven om toestemming te vragen en het
      eerste device te koppelen.
    </p>
  );
}

function LevelMeter({ level }: { level: number }): JSX.Element {
  return (
    <div style={{ flex: 1, height: 12, marginLeft: 12,
                  background: '#0f172a', borderRadius: 3, overflow: 'hidden',
                  border: '1px solid #1e293b' }}>
      <div style={{
        height: '100%',
        width: `${Math.round(level * 100)}%`,
        background: level > 0.95 ? '#dc2626' : 'linear-gradient(90deg,#10b981,#fbbf24,#dc2626)',
        transition: 'width 60ms linear',
      }} />
    </div>
  );
}

function ModuleMatchSummary({ project, patch }: {
  project: ModularProject; patch: Patch;
}): JSX.Element {
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const counts: Record<string, number> = {};
  for (const r of racks) for (const slot of r.slots) {
    const m = project.modules.find((mm) => mm.id === slot.moduleId);
    if (!m) continue;
    const t = project.moduleTypes.find((tt) => tt.id === m.typeId);
    const c = project.categories.find((cc) => cc.id === t?.categoryId);
    const k = String(c?.kind ?? 'unknown');
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return (
    <fieldset style={fs}>
      <legend style={lg}>Engine-mapping</legend>
      <p style={{ fontSize: 12, margin: '0 0 6px', color: '#475569' }}>
        De MVP-engine pakt de eerste module per categorie. Latere iteraties
        volgen <code>patch.connections</code> echt en bouwen een volledige
        signal-graph.
      </p>
      <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          {(['vco','vcf','vca','envelope','lfo'] as const).map((k) => (
            <tr key={k}>
              <td style={{ padding: '2px 12px 2px 0', color: '#374151' }}>{k.toUpperCase()}</td>
              <td style={{ padding: '2px 0', color: counts[k] ? '#065f46' : '#9ca3af' }}>
                {counts[k]
                  ? `${counts[k]} module${counts[k] > 1 ? 's' : ''} aanwezig`
                  : 'niet gevonden — default-waarden'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}

const fs: React.CSSProperties = {
  border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: '#ffffff',
};
const lg: React.CSSProperties = {
  padding: '0 6px', fontSize: 12, color: '#374151',
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
};
const btn: React.CSSProperties = { fontSize: 12 };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Laatst ontvangen noot met velocity — een balkje erbij, want bij een
 * multisampler is de vraag meestal niet *of* er een noot binnenkomt maar of de
 * aanslag echt varieert. De zonegrenzen van de meegeleverde testbank liggen op
 * 42 en 85; die staan als streepjes in de balk, zodat je ziet wanneer je in een
 * andere velocity-laag terechtkomt.
 */
function NoteReadout({ note }: { note?: { midi: number; vel: number; ts: number; on: boolean } }): JSX.Element {
  if (!note) return <span style={{ color: '#94a3b8' }}>geen noot ontvangen</span>;
  const name = `${NOTE_NAMES[note.midi % 12]}${Math.floor(note.midi / 12) - 1}`;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#334155' }}
      title="Laatste note-on: noot, MIDI-nummer en velocity zoals de engine ze doorgeeft">
      <strong style={{ opacity: note.on ? 1 : 0.45 }}>{name}</strong>
      <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{note.midi}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>vel {String(note.vel).padStart(3)}</span>
      <span style={{ position: 'relative', width: 90, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{
          position: 'absolute', inset: 0, width: `${(note.vel / 127) * 100}%`,
          background: note.vel < 43 ? '#38bdf8' : note.vel < 86 ? '#22c55e' : '#f59e0b',
        }} />
        {[42, 85].map((b) => (
          <span key={b} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(b / 127) * 100}%`, width: 1, background: '#94a3b8' }} />
        ))}
      </span>
    </span>
  );
}
