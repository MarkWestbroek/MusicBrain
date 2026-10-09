// Toetsenbord onder het front (spelermodus): speelt rechtstreeks op de
// engine, los van de MIDI-bron die in de Simulatie-tab gekozen is, zodat
// een speler zonder MIDI-keyboard kan spelen zonder binnen te kijken. De
// eerste aanslag start de simulator als die nog niet loopt (een aanraking
// is de gebruikersactie die Web Audio daarvoor vraagt). Het octaaf wordt
// onthouden.

import { useEffect, useState, type RefObject } from 'react';

import { nlen, useLang } from '../i18n';
import { getEngine, useEngineStatus } from './sim/engineSingleton';
import { SUSTAIN_CC, midiInCcNumbers } from './sim/midiInCc';
import { OverdubPanel } from './sim/OverdubPanel';
import { TempoTap } from './TempoTap';
import { ribbonMidiIn } from './sim/ribbonSetup';
import { RecordButton } from './sim/RecordButton';
import { ScreenKeys, TOOLBAR_BTN, type SlideMode } from './sim/ScreenKeys';
import { useModularProject } from './store';

const OCT_KEY = 'mb.front.octave';
const SLIDE_KEY = 'mb.front.slide';
const BEND_KEY = 'mb.front.bendKeys';
const TALL_KEY = 'mb.front.tall';
const TRACKS_KEY = 'mb.front.tracks';

function remembered<T>(key: string, parse: (raw: string | null) => T): T {
  try { return parse(localStorage.getItem(key)); } catch { return parse(null); }
}
function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* geen opslag */ }
}

/** `stage`: wat er op volledig scherm gaat (front + toetsen), als de
 *  browser dat kan; de knop ⛶ staat in de werkbalk van het toetsenbord. */
/** `record`: de opnameknop in de werkbalk (speelmodus; in de expertstand
 *  staat hij rechtsboven naast ▶ Sim). Op volledig scherm altijd, want dan
 *  is die bovenbalk weg. */
export function FrontKeys({ stage, record = false }: { stage?: RefObject<HTMLElement | null>; record?: boolean } = {}): JSX.Element {
  const status = useEngineStatus();
  const project = useModularProject();
  useLang();
  // De pedaalschuif stuurt op het nummer dat de MIDI-IN van deze patch als
  // CC1# verwacht; sustain is altijd CC 64 (de patch zet CC2# daarop).
  const cc = midiInCcNumbers(project.patches.find((x) => x.id === project.activePatchId), project);
  const [octave, setOctaveState] = useState<number>(() => {
    try { const raw = localStorage.getItem(OCT_KEY); const v = raw === null ? NaN : Number(raw); return v >= 0 && v <= 8 ? v : 4; } catch { return 4; }
  });
  const [slide, setSlideState] = useState<SlideMode>(() => {
    try { return localStorage.getItem(SLIDE_KEY) === 'bend' ? 'bend' : 'note'; } catch { return 'note'; }
  });
  const setSlide = (m: SlideMode): void => { setSlideState(m); try { localStorage.setItem(SLIDE_KEY, m); } catch { /* geen opslag */ } };
  const [bendKeys, setBendKeysState] = useState<number>(() => remembered(BEND_KEY, (r) => { const v = Number(r); return v >= 1 && v <= 12 ? v : 2; }));
  const setBendKeys = (k: number): void => { setBendKeysState(k); remember(BEND_KEY, String(k)); };
  const [tall, setTallState] = useState<boolean>(() => remembered(TALL_KEY, (r) => r === '1'));
  // Het sporenpaneel (overdub) onder het klavier; alleen in de speelmodus.
  const [tracks, setTracksState] = useState<boolean>(() => remembered(TRACKS_KEY, (r) => r === '1'));
  const setTracks = (t: boolean): void => { setTracksState(t); remember(TRACKS_KEY, t ? '1' : '0'); };
  const setTall = (t: boolean): void => { setTallState(t); remember(TALL_KEY, t ? '1' : '0'); };
  // Volledig scherm (Fullscreen API): de werkbalk van het toetsenbord blijft
  // in beeld, dus ook de knop om er weer uit te komen.
  // Twee standen: 'stage' = front + toetsen, 'keys' = alleen het klavier,
  // liggend (de oriëntatie vergrendelen mag alleen op volledig scherm en
  // niet op elke telefoon; mislukt het, dan draait de gebruiker zelf).
  const canFull = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const [full, setFull] = useState(false);
  const [fullMode, setFullModeState] = useState<'stage' | 'keys'>('stage');
  const orientation = (): { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined =>
    (typeof screen !== 'undefined' ? screen.orientation : undefined) as unknown as { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined;
  const setFullMode = (m: 'stage' | 'keys'): void => {
    setFullModeState(m);
    if (stage?.current) stage.current.dataset.fullMode = m;   // FrontTab verbergt het front in de keys-stand (CSS)
    const o = orientation();
    if (m === 'keys') o?.lock?.('landscape').catch(() => { /* niet toegestaan: dan niet */ });
    else { try { o?.unlock?.(); } catch { /* idem */ } }
  };
  useEffect(() => {
    const sync = (): void => {
      const on = !!document.fullscreenElement;
      setFull(on);
      if (!on) setFullMode('stage');
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const enterFull = (m: 'stage' | 'keys'): void => {
    const el = stage?.current;
    if (!el) return;
    const go = document.fullscreenElement ? Promise.resolve() : el.requestFullscreen();
    go.then(() => setFullMode(m)).catch(() => { /* geweigerd (iframe, iOS): dan niet */ });
  };
  const exitFull = (): void => { if (document.fullscreenElement) void document.exitFullscreen(); };
  const fsBtn: React.CSSProperties = { ...TOOLBAR_BTN, padding: '0 6px' };
  const [err, setErr] = useState<string | null>(null);
  const setOctave = (d: number): void => {
    const o = Math.max(0, Math.min(8, octave + d));
    setOctaveState(o);
    try { localStorage.setItem(OCT_KEY, String(o)); } catch { /* geen opslag */ }
  };

  function noteOn(midi: number, velocity: number): void {
    const engine = getEngine();
    if (!status.running) {
      // Starten en dan pas de noot; de belofte wachten we niet af in de
      // event-handler, de noot volgt zodra de engine loopt.
      engine.start().then(() => engine.noteOn(midi, velocity)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
      return;
    }
    engine.noteOn(midi, velocity);
  }
  function noteOff(midi: number): void { getEngine().noteOff(midi); }
  // Omhoog schuiven: aftertouch per noot (poly) én als kanaaldruk, zodat
  // een patch met cv_press of per-noot-druk het allebei hoort.
  function aftertouch(midi: number, v: number): void { const e = getEngine(); e.pressure(v, midi); e.pressure(v); }
  function bend(v: number): void { getEngine().pitchBend(v); }
  function mod(v: number): void { getEngine().controlChange(1, v); }
  function sustain(on: boolean): void { getEngine().controlChange(SUSTAIN_CC, on ? 127 : 0); }
  function pedal(v: number): void { getEngine().controlChange(cc.cc1, v); }
  function panic(): void { getEngine().allNotesOff(); }

  return (
    <div>
      <ScreenKeys octave={octave} onOctave={setOctave} onNoteOn={noteOn} onNoteOff={noteOff}
        onAftertouch={aftertouch} onBend={bend} onMod={mod} onSustain={sustain}
        pedal={{ label: `${nlen('Pedaal', 'Pedal')} CC ${cc.cc1}`, onChange: pedal }} slide={slide} onSlide={setSlide}
        bendKeys={bendKeys} onBendKeys={setBendKeys} tall={tall} onTall={setTall} onPanic={panic}
        ribbon={ribbonMidiIn(project.patches.find((x) => x.id === project.activePatchId), project)}
        maxWidth={full && fullMode === 'keys' ? 4000 : 560}
        extra={canFull && stage ? (
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {(record || full) && <span data-tour="keys-record" style={{ display: 'inline-flex' }}><RecordButton compact style={fsBtn} /></span>}
            {record && <TempoTap />}
            {record && (
              <button type="button" data-tour="keys-tracks" onClick={() => setTracks(!tracks)}
                style={{ ...fsBtn, fontWeight: tracks ? 700 : 400, background: tracks ? '#fde68a' : undefined }}
                title={nlen('Sporen: vier sporen na elkaar inspelen (overdub)', 'Tracks: record four tracks one after another (overdub)')}
                aria-label={nlen('Sporen', 'Tracks')}>≣</button>
            )}
            <button type="button" data-tour="keys-full" onClick={() => enterFull('stage')} style={{ ...fsBtn, fontWeight: full && fullMode === 'stage' ? 700 : 400, background: full && fullMode === 'stage' ? '#fde68a' : undefined }}
              title={nlen('Volledig scherm: front en toetsenbord', 'Full screen: front panel and keyboard')} aria-label={nlen('Volledig scherm: front en toetsenbord', 'Full screen: front panel and keyboard')}>⛶</button>
            <button type="button" data-tour="keys-full-keys" onClick={() => enterFull('keys')} style={{ ...fsBtn, fontWeight: full && fullMode === 'keys' ? 700 : 400, background: full && fullMode === 'keys' ? '#fde68a' : undefined }}
              title={nlen('Volledig scherm: alleen het toetsenbord, liggend', 'Full screen: keyboard only, landscape')} aria-label={nlen('Volledig scherm: alleen toetsenbord', 'Full screen: keyboard only')}>🎹</button>
            {full && <button type="button" data-tour="keys-exit" onClick={exitFull} style={fsBtn} title={nlen('Volledig scherm uit', 'Leave full screen')} aria-label={nlen('Volledig scherm uit', 'Leave full screen')}>✕</button>}
          </span>
        ) : undefined}
        hint={status.running ? undefined : nlen('Eerste aanslag start de simulator', 'The first note starts the simulator')} />
      {err && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{err}</div>}
      {record && tracks && <OverdubPanel />}
    </div>
  );
}
