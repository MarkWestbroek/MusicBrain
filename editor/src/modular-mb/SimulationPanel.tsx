// Simulation tab — speelt de actieve patch via een minimale Tone.js-engine.
//
// Drie MIDI-bronnen zijn beschikbaar (on-screen toetsenbord, test-sequence,
// echte Web MIDI). De engine bouwt een MVP-voice (VCO → VCF → VCA met
// AHDSR-envelope) op basis van de modules+controls in de patch. Latere
// iteraties kunnen `patch.connections` echt volgen en meerdere stemmen
// ondersteunen — zie roadmap in Requirements.md §v0.3-simulatie.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useModularProject, updateProject, getProject, uid } from './store';
import { findPatchByBankProgram } from './recipe/classify';
import { SamplerBankBar } from './sim/SamplerBankBar';
import { AudioEngine, type EngineStatus } from './sim/AudioEngine';
import { getEngine } from './sim/engineSingleton';
import {
  MasterRecorder, encodeWav, dbfs, wavFileName, downloadWav,
} from './sim/wavRecorder';
import { MidiRecorder, encodeSmf, patchSnapshot, siblingName, takeTempo, patchTempo } from './sim/midiRecorder';
import {
  loadLibrarySettings, saveLibrarySettings, uploadTakeWithExtras, replaceAsset, parseTags, renameTake, splitTakeName, type LibrarySettings, type Take,
} from './sim/mediaLibrary';
import { dx7Host, WasmModule } from './runtime';
import { simSupportOf, type SimSupport } from './sim/simSupport';
import {
  ScreenKeyboardSource, TestSequenceSource, WebMidiSource, SEQUENCE_PATTERNS,
  type MidiSource, type MidiEvent, type SequencePattern,
} from './sim/MidiSource';
import { ScreenKeys, type SlideMode } from './sim/ScreenKeys';
import type { ModularProject, Patch, ControlValue } from './types';
import { MidiFileSource, parseSmf } from './sim/midiFilePlayer';
import { TakeLibraryPanel } from './sim/TakeLibraryPanel';
import { openTakeEditor, takeFromBytes } from './sim/TakeEditorWindow';
import { addPatchSnapshot } from './sim/takeLibrary';
import { SysexCollector, SYSEX_CMD, joinSysex } from './sim/patchSysex';
import { patchToSysex } from './sim/PatchExportMenu';
import { offerPatch, offerFromSysex } from './sim/PatchInbox';
import { ModlinkPanel } from './sim/ModlinkPanel';
import { setLastTake as rememberLastTake, markUploaded } from './sim/lastTakeStore';
import { MidiFileUi } from './sim/MidiFileUi';
import { midiMonitor } from './sim/midiMonitor';

type SourceId = 'screen' | 'sequence' | 'webmidi' | 'file';

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
    file:     new MidiFileSource(),
  }), []);
  // De MIDI-monitor en de LEDjes op MIDI-In lezen mee met wat de engine speelt.
  useEffect(() => { midiMonitor.attachEngine(engine); }, [engine]);

  // Standaard een extern keyboard (Web MIDI); de keuze wordt onthouden.
  const [sourceId, setSourceIdRaw] = useState<SourceId>(() => {
    try { const s = localStorage.getItem('mmb.sim.source'); if (s === 'screen' || s === 'sequence' || s === 'webmidi' || s === 'file') return s; } catch { /* geen opslag */ }
    return 'webmidi';
  });
  const setSourceId = (s: SourceId): void => { setSourceIdRaw(s); try { localStorage.setItem('mmb.sim.source', s); } catch { /* geen opslag */ } };
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
  // MIDI loopt mee (engine.onMidi); de .mid en eventueel de patch komen
  // naast de WAV, met dezelfde naam.
  const midiRecRef = useRef<MidiRecorder | null>(null);
  if (midiRecRef.current === null) midiRecRef.current = new MidiRecorder();
  const midiRec = midiRecRef.current;
  const midiUnsubRef = useRef<(() => void) | null>(null);
  const [recWithPatch, setRecWithPatch] = useState<boolean>(() => {
    try { return localStorage.getItem('mmb.rec.patchJson') !== '0'; } catch { return true; }
  });
  function toggleRecWithPatch(on: boolean): void {
    setRecWithPatch(on);
    try { localStorage.setItem('mmb.rec.patchJson', on ? '1' : '0'); } catch { /* geen opslag */ }
  }
  // Laatste opname, klaar om naar de media library te sturen (versie 2).
  const [lastTake, setLastTakeRaw] = useState<Take | null>(null);
  // Naam voor de library; de tijdstempel blijft er automatisch achter.
  const [takeName, setTakeName] = useState('');
  function setLastTake(t: Take | null): void { setLastTakeRaw(t); setTakeName(t ? splitTakeName(t.group).name : ''); }
  const [lib, setLib] = useState<LibrarySettings>(loadLibrarySettings);
  const [libOpen, setLibOpen] = useState(false);
  const [takesOpen, setTakesOpen] = useState(false);
  async function editLastTake(): Promise<void> {
    if (!lastTake) return;
    try {
      const wav = lastTake.files.find((f) => f.name.endsWith('.wav'));
      const mid = lastTake.files.find((f) => f.name.endsWith('.mid'));
      const patchFile = lastTake.files.find((f) => f.name.endsWith('.patch.json'));
      if (!wav) return;
      openTakeEditor(takeFromBytes(lastTake.group, new Uint8Array(await wav.blob.arrayBuffer()),
        mid ? new Uint8Array(await mid.blob.arrayBuffer()) : null, patchFile?.blob ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  function takeMidi(bytes: Uint8Array, name: string, slug: string): void {
    const file = sources.file as MidiFileSource;
    const parsed = parseSmf(bytes);
    file.load(parsed, name, { slug });
    void offerFromSysex(parsed.sysex, `${name}`);
    if (sourceId !== 'file') switchSource('file');
  }
  function takePatch(bytes: Uint8Array, name: string): void {
    const snap = JSON.parse(new TextDecoder().decode(bytes)) as ModularProject;
    if (!snap || !Array.isArray(snap.patches) || !Array.isArray(snap.modules)) throw new Error('Geen geldig patch-bestand.');
    const label = `Take ${name.replace(/^mmb-/, '')}`;
    updateProject((p) => addPatchSnapshot(p, snap, label, uid), { forceCommit: true });
  }
  const [libBusy, setLibBusy] = useState(false);
  const [libMsg, setLibMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function updateLib(next: LibrarySettings): void { setLib(next); saveLibrarySettings(next); }
  async function sendToLibrary(): Promise<void> {
    if (!lastTake) return;
    if (!lib.token.trim()) { setLibOpen(true); setLibMsg({ ok: false, text: 'Vul eerst een API-token in.' }); return; }
    setLibBusy(true); setLibMsg(null);
    try {
      const take = renameTake(lastTake, takeName);
      const { assets, extraErrors } = await uploadTakeWithExtras(take, lib);
      if (patch) markUploaded(patch.id, take.group);
      setLibMsg({ ok: true, text: `In de library: ${assets.length} bestand${assets.length === 1 ? '' : 'en'} in ${lib.folder || '(root)'}, koppel ${take.group}`
        + (extraErrors.length ? ` (niet mee: ${extraErrors.join('; ')})` : '') });
    } catch (err) {
      setLibMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLibBusy(false);
    }
  }
  const recStartRef = useRef(0);
  function stopMidiTap(): void { midiUnsubRef.current?.(); midiUnsubRef.current = null; }
  // Tijdens het openen van de Teensy-ingang (toestemmingsdialoog) de knop dicht.
  const [compareBusy, setCompareBusy] = useState(false);
  async function toggleCompare(): Promise<void> {
    setCompareBusy(true);
    try { await engine.setCompare(!status.compare?.on); } finally { setCompareBusy(false); }
  }

  // (Re)bouw de signal-graph zodra topologie van de patch verandert.
  // Live-knop-wijzigingen worden via engine.updateControl direct verwerkt
  // zonder rebuild (geen klikken / opnieuw starten van oscillators).
  const prevSigRef = useRef<string>('');
  const prevCtrlRef = useRef<Record<string, Record<string, unknown>>>({});
  const prevWeightRef = useRef(new Map<string, number>());   // kabel-id → laatst gezette gewicht (morph)
  useEffect(() => {
    if (!patch) return;
    // Topologie-signature: alleen connections + modules + rack-leden.
    // Het aantal stemmen en de poly-groepen horen erbij: die bepalen welke
    // stemmen de engine bouwt. Zonder deze twee deed Voices veranderen (tab
    // Patches) of een groep aanpassen niets tot er toevallig iets anders
    // wijzigde.
    // Het gewicht van een kabel (`attenuation`, morph) hoort níet bij de
    // topologie: dat gaat live via engine.setCableWeight, zie onder.
    const sig = JSON.stringify({
      conns: patch.connections.map((c) => ({ id: c.id, from: c.from, to: c.to, invert: c.invert, weighted: c.attenuation !== undefined })),
      rackIds: patch.rackIds,
      voices: patch.voiceCount,
      mods: project.modules.map((m) => ({ id: m.id, typeId: m.typeId })),
      racks: project.racks.map((r) => ({ id: r.id, slots: r.slots, groups: r.polyGroups })),
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
    // Topologie ongewijzigd → kabelgewichten (morph) en controls live.
    for (const c of patch.connections) {
      if (c.attenuation === undefined) continue;
      if (prevWeightRef.current.get(c.id) === c.attenuation) continue;
      prevWeightRef.current.set(c.id, c.attenuation);
      engine.setCableWeight(c.id, c.attenuation);
    }
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
      if (e.kind === 'noteOn')    engine.noteOn(e.note, e.velocity);
      if (e.kind === 'noteOff')   engine.noteOff(e.note, e.release);
      // Mod-wiel, bend en de twee vrije CC's: de bron zond ze al, alleen
      // luisterde hier niemand — de MOD-uitgangen van MIDI-In bleven dus op
      // nul staan terwijl de kabels in de patch lagen.
      if (e.kind === 'cc')        engine.controlChange(e.controller, e.value);
      if (e.kind === 'pitchBend') engine.pitchBend(e.value);
      if (e.kind === 'pressure')     engine.pressure(e.value);
      if (e.kind === 'polyPressure') engine.pressure(e.value, e.note);
      // Bank select (CC 0) + program change kiezen een patch: map = bank,
      // patch = program (ED-RC-8). Alleen CC 0 zonder voorafgaand program
      // onthouden we; een program zonder bank zoekt in alle mappen.
      if (e.kind === 'cc' && e.controller === 0) bankRef.current = e.value;
      // Een patch via SysEx (bv. een DAW die een .mid met patch afspeelt):
      // verzamelen en aanbieden, niet ongevraagd laden.
      if (e.kind === 'sysex') {
        void sysexIn.current.feed(e.data).then((r) => { if (r?.cmd === SYSEX_CMD.editorPatch) offerPatch(r.json, 'MIDI'); }).catch(() => {});
      }
      if (e.kind === 'program') {
        const hit = findPatchByBankProgram(getProject(), bankRef.current, e.program);
        if (hit && hit.id !== getProject().activePatchId) {
          updateProject((p) => ({ ...p, activePatchId: hit.id, activeRackId: hit.rackIds[0] ?? p.activeRackId }), { forceCommit: true });
        }
        bankRef.current = null;
      }
    });
    return () => { unsub(); };
  }, [engine, source]);
  const bankRef = useRef<number | null>(null);
  const sysexIn = useRef(new SysexCollector());

  // De actieve bron volgt de engine: draait hij, dan luistert de bron mee.
  // Dit hoort hier en niet in startAll(), want de bron kan ná ▶ Start
  // wisselen (andere radioknop, of terugkomen op dit tabblad). Zonder deze
  // koppeling bleef zo'n bron ongestart: het on-screen klavier reageerde dan
  // wel op de muis (die roept pressNote rechtstreeks aan) maar niet op de
  // computertoetsen, want die luisteraar hangt in start().
  useEffect(() => {
    if (!status.running) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        await source.start();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; source.stop(); };
  }, [source, status.running]);

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
      // De bron wordt gestart door het effect dat `status.running` volgt.
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
      midiRec.start();
      recStartRef.current = performance.now();
      // MIDI-clock van het keyboard meelezen voor het tempo van de take.
      void midiMonitor.startRaw();
      stopMidiTap();
      midiUnsubRef.current = engine.onMidi(midiRec.record);
      setRecording(true);
    } catch (err) {
      stopMidiTap();
      setRecording(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function stopRec(): Promise<void> {
    try {
      const r = await recorder.stop();
      stopMidiTap();
      const midi = midiRec.stop(r.seconds * 1000);
      setRecording(false);
      if (r.frames === 0) { setRecDone('niets opgenomen — de tap kreeg geen blokken door'); return; }
      const name = wavFileName(patch?.name ?? 'patch');
      const wav = encodeWav(r.channels, r.sampleRate, 'i24');
      downloadWav(wav, name);
      // Zelfde naam, andere extensie: zo blijft het koppel bij elkaar. Geen
      // .mid als er niets gespeeld is (bv. een drone of generatieve patch).
      const files: Take['files'] = [{ name, blob: new Blob([wav], { type: 'audio/wav' }) }];
      const extra: string[] = [];
      if (midi.length > 0) {
        const clock = midiMonitor.list().filter((e) => e.dir === 'in' && e.bytes[0] === 0xF8 && e.t >= recStartRef.current).map((e) => e.t);
        const tempo = takeTempo(clock, patch ? patchTempo(project, patch) : null);
        files.push({ name: siblingName(name, '.mid'), blob: new Blob([encodeSmf(midi, { lengthMs: r.seconds * 1000, name: patch?.name, bpm: tempo?.bpm })], { type: 'audio/midi' }) });
        extra.push(`${midi.length} MIDI-events${tempo ? ` op ${tempo.bpm} BPM (${tempo.from === 'clock' ? 'MIDI-clock' : 'klok in de patch'})` : ''}`);
      }
      if (recWithPatch && patch) {
        files.push({ name: siblingName(name, '.patch.json'), blob: new Blob([JSON.stringify(patchSnapshot(project, patch), null, 1)], { type: 'application/json' }) });
        extra.push('patch');
      }
      for (const f of files.slice(1)) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url; a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      // De patch ook als .syx in de groep (niet downloaden: dat zijn er al genoeg).
      const extras: Take['files'] = [];
      if (recWithPatch && patch) {
        try { extras.push({ name: siblingName(name, '.syx'), blob: new Blob([joinSysex(await patchToSysex(project))], { type: 'application/octet-stream' }) }); }
        catch { /* zonder .syx verder */ }
      }
      setLastTake({ group: siblingName(name, ''), files, extras });
      if (patch) rememberLastTake(patch.id, { group: siblingName(name, ''), files, extras });
      setLibMsg(null);
      const db = dbfs(r.peak);
      // De piek erbij, want een zachte render merk je anders pas als de
      // bank-import er int16 van maakt en je drie bits kwijt bent.
      const level = db === null ? 'stilte' : `piek ${db.toFixed(1)} dBFS`;
      setRecDone(`${name} · ${r.seconds.toFixed(1)} s · ${r.sampleRate} Hz · ${level}`
               + (r.clipped ? ' · ⚠ overstuurd' : '')
               + (extra.length ? ` · + ${extra.join(' + ')}` : ''));
    } catch (err) {
      stopMidiTap();
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
                  title="Schrijft de master-som rechtstreeks mee als WAV, en de gespeelde MIDI als .mid met dezelfde naam — geen BlackHole of DAW nodig">
                  ⏺ Opname
                </button>
              : <button onClick={() => void stopRec()} style={{ color: '#b91c1c', fontWeight: 600 }}>
                  ⏹ Stop · {recSecs.toFixed(1)} s
                </button>}
            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Bewaar de patch als .patch.json naast de opname (te laden via Importeren), zodat je de MIDI later opnieuw door dezelfde klank kunt sturen">
              <input type="checkbox" checked={recWithPatch} onChange={(e) => toggleRecWithPatch(e.target.checked)} />
              patch mee
            </label>
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
        <div style={row}>
          <button onClick={() => void toggleCompare()} disabled={compareBusy}
            title="Teensy in je linkeroor, simulator in je rechter — om te horen of ze gelijk klinken"
            style={status.compare?.on ? { fontWeight: 600, color: '#0369a1' } : undefined}>
            {status.compare?.on ? '⇄ Vergelijken uit' : '⇄ Vergelijk met Teensy'}
          </button>
          {status.compare?.on && (
            <span style={{ fontSize: 12, color: '#475569' }}>
              links: Teensy · rechts: simulator
            </span>
          )}
        </div>
        {status.compare?.on && (
          <p style={{ color: '#475569', fontSize: 12, margin: '6px 0 0' }}>
            Zet in Windows <em>Listen to this device</em> voor de Teensy uit, anders
            hoor je hem ook nog in het midden (zie doc/teensy-aan-de-pc.md). Een paar
            tientallen ms verschil tussen beide is normaal: klank vergelijken gaat
            prima, fase niet. <strong>⏺ Opname</strong> legt nu beide kanten vast:
            Teensy links, simulator rechts.
          </p>
        )}
        {status.mic?.on && (
          <p style={{ color: '#475569', fontSize: 12, margin: '6px 0 0' }}>
            🎤 AUDIO IN luistert naar: {status.mic.device}. Gebruik een koptelefoon,
            anders hoort de microfoon de speakers en gaat het rondzingen.
          </p>
        )}
        {status.mic?.error && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>
            ⚠ AUDIO IN: {status.mic.error}
          </p>
        )}
        {status.compare?.error && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>
            ⚠ {status.compare.error}
          </p>
        )}
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
        {!recording && (
          <div style={{ ...row, marginTop: 6 }}>
            {lastTake && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12 }}
                title="Naam van de take in de library; datum en tijd blijven erachter zodat takes uniek en op volgorde blijven">
                <input value={takeName} onChange={(e) => setTakeName(e.target.value)} disabled={libBusy}
                  onKeyDown={(e) => { if (e.key === 'Enter') void sendToLibrary(); }}
                  style={{ width: 200 }} aria-label="Naam van de take" />
                <span style={{ color: '#9ca3af' }}>-{splitTakeName(lastTake.group).stamp}</span>
              </span>
            )}
            {lastTake && (
              <button onClick={() => void sendToLibrary()} disabled={libBusy}
                title="Zet deze opname (alle bestanden, als één koppel) in de media library van musicbrain.nl">
                {libBusy ? '… bezig' : '⤴ Naar library'}
              </button>
            )}
            {lastTake && (
              <button onClick={() => void editLastTake()} title="Deze opname in de take-editor openen: bijsnijden en exporteren">✎ Bewerken</button>
            )}
            <button onClick={() => setTakesOpen((v) => !v)} style={takesOpen ? { fontWeight: 600 } : undefined}
              title="Takes uit de media library: beluisteren, de MIDI afspelen, de patch terughalen">
              📚 Takes
            </button>
            <button onClick={() => setLibOpen((v) => !v)} title="Token, map en tags voor de media library">⚙ Library</button>
            {libMsg && (
              <span style={{ fontSize: 12, color: libMsg.ok ? '#15803d' : '#b91c1c' }}>
                {libMsg.ok ? '✔' : '⚠'} {libMsg.text}
              </span>
            )}
          </div>
        )}
        {takesOpen && !recording && (
          <TakeLibraryPanel settings={lib} onMidi={takeMidi} onPatch={takePatch} />
        )}
        {libOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', fontSize: 12, marginTop: 6, maxWidth: 520 }}>
            <label htmlFor="lib-token">API-token</label>
            <input id="lib-token" type="password" value={lib.token} placeholder="imp_… (admin → account → API tokens, vinkje upload media)"
              onChange={(e) => updateLib({ ...lib, token: e.target.value })} />
            <label htmlFor="lib-folder">Map</label>
            <input id="lib-folder" value={lib.folder} onChange={(e) => updateLib({ ...lib, folder: e.target.value })} />
            <label htmlFor="lib-tags">Tags</label>
            <input id="lib-tags" defaultValue={lib.tags.join(', ')} placeholder="komma-gescheiden"
              onBlur={(e) => updateLib({ ...lib, tags: parseTags(e.target.value) })} />
            <label htmlFor="lib-endpoint">Endpoint</label>
            <input id="lib-endpoint" value={lib.endpoint} onChange={(e) => updateLib({ ...lib, endpoint: e.target.value })} />
            <span />
            <span style={{ color: '#6b7280' }}>
              Het token blijft alleen in deze browser. Maak het aan op musicbrain.nl/admin: account-icoon onderin → API tokens,
              vinkje upload media. Het wordt één keer getoond. Voor een lokale MusicBrain: zet het endpoint op http://localhost:…/api/media.
            </span>
          </div>
        )}
        {error && (
          <p style={{ color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }}>
            ⚠ {error}
          </p>
        )}
      </fieldset>

      {/* Samplebank vanzelf van de server (ED-SIM-BANK). */}
      {patch && <SamplerBankBar project={project} patch={patch} />}

      <fieldset style={fs}>
        <legend style={lg}>MIDI-bron</legend>
        <div style={row}>
          {(['screen','sequence','webmidi','file'] as const).map((id) => (
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
        <SourceControls source={source} sourceId={sourceId} running={status.running} onStartSim={() => void startAll()}
          onReplace={async (slug, name, bytes) => (await replaceAsset(slug, { name, blob: new Blob([bytes], { type: 'audio/midi' }) }, lib)).slug} />
      </fieldset>

      <ModlinkPanel />

      <ModuleMatchSummary project={project} patch={patch} />
    </div>
  );
}

function SourceControls({ source, sourceId, running, onStartSim, onReplace }: {
  source: MidiSource; sourceId: SourceId; running: boolean; onStartSim: () => void;
  onReplace: (slug: string, name: string, bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}): JSX.Element {
  if (sourceId === 'file')     return <MidiFileUi source={source as MidiFileSource} running={running} onStartSim={onStartSim} onReplace={onReplace} />;
  if (sourceId === 'screen')   return <ScreenKeyboardUi source={source as ScreenKeyboardSource} />;
  if (sourceId === 'sequence') return <SequenceUi      source={source as TestSequenceSource} />;
  return <WebMidiUi source={source as WebMidiSource} />;
}

function ScreenKeyboardUi({ source }: { source: ScreenKeyboardSource }): JSX.Element {
  const [octave, setOctave] = useState(source.getOctave());
  const [slide, setSlide] = useState<SlideMode>('note');
  function shift(d: number): void {
    source.setOctave(octave + d);
    setOctave(source.getOctave());
  }
  return (
    <div style={{ marginTop: 6 }}>
      <ScreenKeys octave={octave} onOctave={shift} slide={slide} onSlide={setSlide}
        onNoteOn={(midi, vel) => source.pressNote(midi, vel)}
        onNoteOff={(midi) => source.releaseNote(midi)}
        onAftertouch={(midi, v) => source.aftertouch(midi, v)}
        onBend={(v) => source.bend(v)}
        hint="Computertoetsen: A S D F G H J K (witte), W E T Y U (zwarte); Z/X octaaf" />
    </div>
  );
}

function SequenceUi({ source }: { source: TestSequenceSource }): JSX.Element {
  const [bpm, setBpm] = useState(source.getBpm());
  const [pattern, setPattern] = useState<SequencePattern>(source.getPattern());
  const info = SEQUENCE_PATTERNS.find((p) => p.id === pattern) ?? SEQUENCE_PATTERNS[0]!;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={row}>
        <label style={{ fontSize: 12 }}>
          Patroon:
          <select value={pattern}
            onChange={(e) => {
              const p = e.target.value as SequencePattern;
              setPattern(p); source.setPattern(p);
            }}
            style={{ marginLeft: 6 }}>
            {SEQUENCE_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
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
      </div>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>
        {info.hint} Loopt zodra je op Start klikt.
      </p>
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

/**
 * Wat van deze patch speelt er, en waarmee? Vroeger stond hier een telling per
 * categorie met de mededeling dat de engine "de eerste module per categorie"
 * pakt — dat was de MVP en klopt al lang niet meer: de engine volgt de kabels
 * en vouwt poly-groepen uit. De vraag die je wél hebt als je iets niet hoort,
 * is of een module überhaupt gesimuleerd wordt. Dat staat hier nu.
 */
function ModuleMatchSummary({ project, patch }: {
  project: ModularProject; patch: Patch;
}): JSX.Element {
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const seen = new Set<string>();
  const byKind: Record<SimSupport, string[]> = { wasm: [], tone: [], none: [] };
  for (const r of racks) for (const slot of r.slots) {
    if (seen.has(slot.moduleId)) continue;
    seen.add(slot.moduleId);
    const m = project.modules.find((mm) => mm.id === slot.moduleId);
    const t = m && project.moduleTypes.find((tt) => tt.id === m.typeId);
    if (!t) continue;
    byKind[simSupportOf(t, project.moduleTypes, project.categories)]
      .push(t.variant || t.id);
  }
  const tally = (ids: string[]): string => {
    const n = new Map<string, number>();
    for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
    return [...n].map(([id, c]) => (c > 1 ? `${id} ×${c}` : id)).join(', ');
  };
  const rows: { kind: SimSupport; label: string; uitleg: string; kleur: string }[] = [
    { kind: 'wasm', label: 'Zelfde DSP als de Teensy', kleur: '#065f46',
      uitleg: 'de C++-kern van de firmware, als wasm' },
    { kind: 'tone', label: 'Web-Audio-benadering', kleur: '#92400e',
      uitleg: 'klinkt als het idee, niet sample-voor-sample als de Teensy' },
    { kind: 'none', label: 'Stil', kleur: '#b91c1c',
      uitleg: 'de engine bouwt hier niets voor' },
  ];
  return (
    <fieldset style={fs}>
      <legend style={lg}>Wat speelt er</legend>
      <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kind}>
              <td style={{ padding: '2px 12px 2px 0', color: r.kleur, whiteSpace: 'nowrap',
                           verticalAlign: 'top', fontWeight: 600 }}>
                {byKind[r.kind].length}× {r.label}
              </td>
              <td style={{ padding: '2px 0', color: '#475569' }}>
                {byKind[r.kind].length > 0 ? tally(byKind[r.kind]) : <em>{r.uitleg}</em>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {byKind.none.length > 0 && (
        <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>
          Stille modules staan wel in het rack en gaan gewoon mee naar de Teensy;
          alleen de simulator kan ze nog niet spelen.
        </p>
      )}
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
