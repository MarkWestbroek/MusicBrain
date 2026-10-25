// De freestyle-machine als pagina (spinoffs/freestyle-machine/MOCKUP.md):
// één kaal, donker scherm voor iemand die staat. Onder de motorkap draait
// de vaste patch van freestylePatch.ts in de gewone AudioEngine; deze
// pagina is de bedieningslaag (performance.ts) plus het scherm.
//
// Schermtekst in het Engels (besluit Mark 2026-10-25: hij en zijn vriend
// lezen het dan beide). Toetsen: SPACE (houden) = DROP, → of Enter = NEXT,
// F = FILL, 1–4 = stems, T = TAP, − en + = tempo een bpm, P = start/stop
// (stop = einde-fill, nog eens = meteen stil), S = SAVE, G = volgende stijl
// (genre), M = microfoon, A = Autopilot.
//
// Ringbuffer (MOCKUP.md §4.7): vanaf de eerste START neemt een
// MasterRecorder met `keepSeconds` de eindmix op (ná DROP, wat je hoort);
// SAVE schrijft de laatste twee minuten als wav. Je weet pas achteraf dat
// het goed was. Bij STOP pauzeert de buffer (anders vult stilte hem).
//
// MIC: de microfoon erbij, alleen de stem, niet naar de luidsprekers. Beat
// (kanaal 1–2) en stem (3–4) zitten in één vierkanaals ringbuffer, zodat
// ze sample-precies gelijk lopen; SAVE splitst ze in twee bestanden (beat
// en voice) om later te mixen. Echo-onderdrukking aan, zodat de beat uit
// de speaker zo min mogelijk in de stemopname lekt; met een koptelefoon is
// hij schoon.
//
// Telefoon (smal scherm): één kolom, grote knoppen voor DROP (vasthouden),
// NEXT en FILL, de stems in een 2×2-raster; tikken op de stijlnaam gaat
// naar de volgende stijl. Touch: `touch-action: none` plus een niet-
// passieve touchstart met preventDefault op de knoppen die je vasthoudt,
// zodat de pagina niet scrolt of zoomt (CLAUDE.md).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as Tone from 'tone';

import { PlayTour, playTourSeen, type PlayTourStep } from '../modular-mb/PlayTour';
import { getEngine, useEngineStatus } from '../modular-mb/sim/engineSingleton';
import { MasterRecorder, downloadWav, encodeWav, peakOf, wavFileName } from '../modular-mb/sim/wavRecorder';
import { TapTempo } from '../modular-mb/tempo';
import { buildFreestyleRig } from './freestylePatch';
import { Performance, type Fired } from './performance';
import { STEMS, STEM_LABEL, STYLES, styleById, type Stem } from './style';

const BG = '#0b0b0f', FG = '#f3f4f6', DIM = '#6b7280', AMBER = 'var(--mb-accent)';
const MONO: CSSProperties = { fontFamily: 'var(--mb-font-mono)', fontVariantNumeric: 'tabular-nums' };
/** Geen tik-oplichting, geen scrollen of zoomen vanaf een knop. */
const TOUCH: CSSProperties = { touchAction: 'none', WebkitTapHighlightColor: 'transparent', userSelect: 'none' };

function ctxNow(): number { return (Tone.getContext().rawContext as AudioContext).currentTime; }

/** De rondleiding: spotlight per knop, bij het eerste bezoek en via "?".
 *  Engels op beide plekken (de pagina is Engels); de NL-velden zijn verplicht
 *  in het staptype en krijgen dezelfde tekst. */
const TOUR_KEY = 'mb.freestyletour.v1';
/** De ringbuffer: zoveel seconden blijven bewaard. */
export const KEEP_SECONDS = 120;
const step = (anchor: string | undefined, title: string, text: string): PlayTourStep => ({ anchor, title, text, en: [title, text] });
const TOUR_STEPS: PlayTourStep[] = [
  step(undefined, 'Freestyle machine', 'A beat, an 808 and a motif that follow you. Nothing happens on the tap itself: every change lands on the next beat, bar or phrase, so press a little early and keep rapping.'),
  step('fs-start', 'Start', 'START begins the beat on the 1. On a phone this first tap also switches the sound on.'),
  step('fs-bpm', 'Tempo', 'The big number is the tempo. Tap it in time, four taps or more, and the beat follows without a jump.'),
  step('fs-beat', 'Where you are', 'The dots count 1-2-3-4, the bars show the bar in the four-bar phrase. The whole screen flashes amber on the 1 of every phrase: that is your cue.'),
  step('fs-section', 'Section and chord', 'The section you are in and the chord, so a guitarist can play along. The amber line tells what is coming ("→ HOOK on the 1").'),
  step('fs-drop', 'DROP', 'Hold it and the beat is gone, instantly, for a punchline. Let go and it comes back on the next beat.'),
  step('fs-next', 'NEXT', 'The next section: INTRO → VERSE → HOOK → BREAK. Press it mid-line; it lands on the 1 of the next phrase.'),
  step('fs-fill', 'FILL', 'A one-bar fill, starting at the next bar.'),
  step('fs-stems', 'The four parts', 'Tap a part to mute or unmute it at the next bar. An amber border means it changes at the next bar; tap again to cancel.'),
  step('fs-style', 'Style', 'Tap the style name to go to the next style: trap, boom bap, bounce. That stops the beat; press START again.'),
  step('fs-perc', 'Playing with a percussionist', 'Tick this and the hi-hats get thinner, so a djembe or shaker fits in the gaps.'),
  step('fs-save', 'It is always recording', 'From the first START the last two minutes are kept. Was that take good? Tap SAVE and you get it as a WAV file. No need to press record first.'),
  step('fs-mic', 'Record your voice too', 'MIC adds the microphone to the recording, on its own track. SAVE then gives two files, beat and voice, to mix later. Use headphones for a clean voice track.'),
  step('fs-auto', 'Autopilot', 'With autopilot on, every phrase gets a small variation and every fourth phrase ends with a fill, so one section stays alive for minutes.'),
  step('fs-start', 'Stopping', 'STOP plays an ending fill and stops after that bar. Press it again to stop at once.'),
  step(undefined, 'Have fun', 'This tour comes back with the ? at the top.'),
];

function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (): void => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Niet-passieve touchstart met preventDefault: React registreert touch-
 *  events passief, dus dit moet buiten React om. */
function useNoTouchScroll<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const stop = (ev: TouchEvent): void => { ev.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, []);
  return ref;
}

export function FreestyleApp({ onExit }: { onExit?: () => void }): JSX.Element {
  const phone = useMedia('(max-width: 700px)');
  // Stijl kiezen bouwt de patch opnieuw (andere klokuitgang voor Grids,
  // andere klank) en begint met een verse bedieningslaag.
  const [styleId, setStyleId] = useState(STYLES[0]!.id);
  const style = styleById(styleId);
  const rig = useMemo(() => buildFreestyleRig(style), [style]);
  const perf = useMemo(() => new Performance(style), [style]);
  const engine = getEngine();
  const { level } = useEngineStatus();
  const tapper = useRef(new TapTempo());
  const recorder = useRef(new MasterRecorder(KEEP_SECONDS, 4)).current;
  /** De vier kanalen: beat L/R uit de engine, stem L/R uit `voiceIn`. */
  const bus = useRef<{ merger: ChannelMergerNode; voiceIn: GainNode } | null>(null);
  const mic = useRef<{ stream: MediaStream; src: MediaStreamAudioSourceNode } | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [, bump] = useState(0);
  const [pos, setPos] = useState(() => perf.clock.position(0));
  const [log, setLog] = useState('press START');
  const [tapFlash, setTapFlash] = useState(false);
  // Rondleiding: de eerste keer vanzelf, daarna via "?".
  const [tour, setTour] = useState(() => !playTourSeen(TOUR_KEY));
  const dropRef = useNoTouchScroll<HTMLButtonElement>();
  const bpmRef = useNoTouchScroll<HTMLDivElement>();

  useEffect(() => {
    engine.build(rig.project, rig.patch);
    return () => { engine.stop(); };
  }, [engine, rig]);
  // De ringbuffers lopen zolang de pagina open is (vanaf de eerste START).
  useEffect(() => () => {
    if (recorder.active) void recorder.stop();
    mic.current?.stream.getTracks().forEach((t) => t.stop());
  }, [recorder]);
  /** De vierkanaals opnamebus, één keer: beat → kanaal 0–1, stem → 2–3. */
  const ensureBus = useCallback((): ChannelMergerNode => {
    if (bus.current) return bus.current.merger;
    const ctx = Tone.getContext().rawContext as AudioContext;
    const merger = ctx.createChannelMerger(4);
    const beatSplit = ctx.createChannelSplitter(2);
    Tone.connect(engine.recorderTap(), beatSplit);
    beatSplit.connect(merger, 0, 0); beatSplit.connect(merger, 1, 1);
    // Een mono microfoon op beide stemkanalen: expliciet stereo.
    const voiceIn = ctx.createGain();
    voiceIn.channelCount = 2; voiceIn.channelCountMode = 'explicit'; voiceIn.channelInterpretation = 'speakers';
    const voiceSplit = ctx.createChannelSplitter(2);
    voiceIn.connect(voiceSplit);
    voiceSplit.connect(merger, 0, 2); voiceSplit.connect(merger, 1, 3);
    bus.current = { merger, voiceIn };
    return merger;
  }, [engine]);

  /** Plan een pakketje op zijn contexttijd. Een paar ms vroeger: het
   *  bericht naar de worklet kost een blok. */
  const apply = useCallback((f: Fired | null) => {
    bump((n) => n + 1);                 // ook zonder pakketje: er staat nu iets anders gewapend
    if (!f) return;
    const delay = Math.max(0, (f.at - ctxNow()) * 1000 - 3);
    window.setTimeout(() => {
      for (const ch of f.changes) engine.updateControl(rig.ids[ch.module], ch.control, ch.value);
      if (f.master) engine.setMasterVolume(f.master.gain, f.master.rampS);
      // De klok uit: de ringbuffers pauzeren (de staart van een seconde mag mee).
      const run = f.changes.find((c) => c.module === 'clock' && c.control === 'run');
      if (run && run.value === false) window.setTimeout(() => recorder.pause(), 1000);
      setLog(f.label);
    }, delay);
  }, [engine, rig, recorder]);

  // Lookahead-planner en schermklok.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const f of perf.tick(ctxNow())) apply(f);
      const s = Math.floor(recorder.seconds);
      setRecSecs((prev) => (prev === s ? prev : s));
    }, 30);
    let raf = 0;
    const draw = (): void => { setPos(perf.clock.position(ctxNow())); raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw);
    return () => { window.clearInterval(id); cancelAnimationFrame(raf); };
  }, [perf, apply, recorder]);

  const start = useCallback(async () => {
    await engine.start();
    if (!recorder.active) {
      try { await recorder.start(ensureBus()); }
      catch (e) { setLog(`recorder: ${e instanceof Error ? e.message : String(e)}`); }
    }
    recorder.resume();
    apply(perf.start(ctxNow()));
  }, [engine, perf, apply, recorder, ensureBus]);
  /** SAVE: de laatste twee minuten als wav: beat, en de stem apart als de
   *  microfoon aanstaat; uit dezelfde buffer, dus gelijk lopend. */
  const save = useCallback(() => {
    if (!recorder.active || recorder.frames === 0) { setLog('nothing recorded yet — press START first'); return; }
    const when = new Date();
    const r = recorder.peek();
    const beat = r.channels.slice(0, 2);
    downloadWav(encodeWav(beat, r.sampleRate, 'i24'), wavFileName(`freestyle-${style.id}-beat`, when));
    let msg = `saved beat ${Math.round(r.seconds)} s${peakOf(beat) > 1 ? ' (clipped!)' : ''}`;
    if (micOn) {
      const v = r.channels.slice(2, 4);
      // Even later: twee downloads tegelijk houdt een browser soms tegen.
      window.setTimeout(() => downloadWav(encodeWav(v, r.sampleRate, 'i24'), wavFileName(`freestyle-${style.id}-voice`, when)), 400);
      msg += ' + voice, same length';
    }
    setLog(msg);
  }, [recorder, style, micOn]);
  /** MIC aan: microfoon openen en op de stemkanalen van de opnamebus; uit: dicht. */
  const toggleMic = useCallback(async () => {
    if (mic.current) {
      mic.current.stream.getTracks().forEach((t) => t.stop());
      try { mic.current.src.disconnect(); } catch { /* al los */ }
      mic.current = null;
      setMicOn(false); setLog('mic off');
      return;
    }
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) { setLog('this browser cannot open a microphone'); return; }
    try {
      await engine.start();
      // Echo-onderdrukking aan: de beat uit de speaker zo veel mogelijk uit de
      // stem; geen ruisfilter of AGC, die knippen medeklinkers weg.
      const stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      const ctx = Tone.getContext().rawContext as AudioContext;
      const src = ctx.createMediaStreamSource(stream);
      ensureBus();
      src.connect(bus.current!.voiceIn);
      mic.current = { stream, src };
      setMicOn(true); setLog('mic on — voice on its own track');
    } catch (e) {
      setLog(`mic: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [engine, ensureBus]);
  const stop = useCallback(() => { apply(perf.stop(ctxNow())); }, [perf, apply]);
  const tap = useCallback(() => {
    setTapFlash(true); window.setTimeout(() => setTapFlash(false), 90);
    const bpm = tapper.current.tap(performance.now());
    if (bpm !== null) apply(perf.setBpm(bpm, ctxNow()));
  }, [perf, apply]);
  const act = useCallback((fn: (now: number) => Fired | null | void) => { apply(fn(ctxNow()) ?? null); }, [apply]);
  const chooseStyle = useCallback((id: string) => {
    if (perf.running) stop();
    setStyleId(id);
    setLog(`style: ${styleById(id).name} — press START`);
  }, [perf, stop]);
  const nextStyle = useCallback(() => {
    const i = STYLES.findIndex((s) => s.id === styleId);
    chooseStyle(STYLES[(i + 1) % STYLES.length]!.id);
  }, [styleId, chooseStyle]);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.repeat || tour) return;      // de rondleiding heeft de pijltjes en Enter
      switch (e.code) {
        case 'Space': e.preventDefault(); act((t) => perf.dropDown(t)); break;
        case 'ArrowRight': case 'Enter': e.preventDefault(); act((t) => perf.next(t)); break;
        case 'KeyF': act((t) => perf.fill(t)); break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
          const stem = STEMS[Number(e.code.slice(-1)) - 1];
          if (stem) act((t) => perf.toggleStem(stem, t));
          break;
        }
        case 'KeyT': tap(); break;
        case 'KeyP': if (perf.running) stop(); else void start(); break;
        case 'KeyS': save(); break;
        case 'KeyG': nextStyle(); break;
        case 'KeyM': void toggleMic(); break;
        case 'KeyA': act((t) => perf.setAutopilot(!perf.autopilot, t)); break;
        case 'Minus': case 'NumpadSubtract': act((t) => perf.nudgeBpm(-1, t)); break;
        case 'Equal': case 'NumpadAdd': act((t) => perf.nudgeBpm(1, t)); break;
        default: return;
      }
    };
    const up = (e: KeyboardEvent): void => { if (e.code === 'Space') { e.preventDefault(); act((t) => perf.dropUp(t)); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [perf, act, tap, start, stop, nextStyle, save, toggleMic, tour]);

  const running = perf.running;
  const onOne = running && pos.bar === 0 && pos.beat === 0 && pos.frac < 0.25;
  const pending = perf.pendingLabels();
  const bpm = perf.bpm;
  const status = perf.dropped ? 'DROP — beat is out' : pending.join(' · ');

  const stemButtons = STEMS.map((s: Stem, i) => {
    const on = perf.stems[s];
    const will = perf.stemWillBe(s);
    return (
      <button key={s} type="button" onClick={() => act((t) => perf.toggleStem(s, t))}
        style={{
          ...TOUCH, padding: phone ? '16px 6px' : '18px 8px', fontSize: phone ? 16 : 18, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 8,
          background: on ? '#e5e7eb' : 'transparent', color: on ? '#111827' : DIM,
          border: `3px solid ${will !== on ? AMBER : on ? '#e5e7eb' : '#374151'}`,
        }}>
        <span style={{ ...MONO, fontSize: 12, opacity: 0.6, marginRight: 8 }}>{i + 1}</span>{STEM_LABEL[s]}
      </button>
    );
  });

  const beatDots = (
    <>
      <div data-tour="fs-beat" style={{ display: 'flex', justifyContent: 'center', gap: phone ? 12 : 18, marginTop: phone ? 10 : 28 }}>
        {[0, 1, 2, 3].map((b) => (
          <div key={b} style={{ width: phone ? 30 : 44, height: phone ? 30 : 44, borderRadius: 22, background: running && pos.beat === b ? (b === 0 ? AMBER : FG) : '#1f2937', transition: 'background 40ms' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: phone ? 8 : 14 }}>
        {[0, 1, 2, 3].map((bar) => (
          <div key={bar} style={{ width: phone ? 48 : 70, height: 10, borderRadius: 3, background: running && pos.bar === bar ? AMBER : running && bar < pos.bar ? '#4b5563' : '#1f2937' }} />
        ))}
      </div>
      <div style={{ fontSize: 13, color: DIM, marginTop: 6 }}>{running ? `bar ${pos.bar + 1} of 4 · phrase ${pos.phrase + 1}` : 'stopped'}</div>
    </>
  );

  const nudge = (delta: number): JSX.Element => (
    <button type="button" onClick={() => act((t) => perf.nudgeBpm(delta, t))} title={`Tempo ${delta > 0 ? '+' : '−'}1 (${delta > 0 ? '+' : '−'})`}
      style={{ ...TOUCH, width: phone ? 44 : 52, height: phone ? 44 : 52, borderRadius: 26, border: '2px solid #374151', background: 'transparent', color: FG, fontSize: phone ? 24 : 28, cursor: 'pointer', alignSelf: 'center', lineHeight: 1 }}>
      {delta > 0 ? '+' : '−'}
    </button>
  );
  const bpmBlock = (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: phone ? 10 : 18 }}>
      {nudge(-1)}
      <div ref={bpmRef} data-tour="fs-bpm" onPointerDown={(e) => { e.preventDefault(); tap(); }} title="Tap tempo (T)" style={{ ...TOUCH, cursor: 'pointer', display: 'inline-block' }}>
        <div style={{ ...MONO, fontSize: phone ? 'clamp(64px, 22vw, 120px)' : 'clamp(96px, 16vw, 220px)', fontWeight: 700, lineHeight: 0.95, color: tapFlash ? AMBER : FG }}>
          {bpm % 1 ? bpm.toFixed(1) : bpm}
        </div>
        <div style={{ fontSize: phone ? 13 : 16, color: DIM, marginTop: 4 }}>BPM · {style.feel} · {phone ? 'tap here' : 'tap T'}</div>
      </div>
      {nudge(1)}
    </div>
  );

  /** De grote knoppen: DROP vasthouden, NEXT, FILL. Op de laptop ook, naast de toetsen. */
  const actions = (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
      <button ref={dropRef} type="button" data-tour="fs-drop"
        onPointerDown={(e) => {
          e.preventDefault();
          // Capture: de vinger mag van de knop glijden, de up komt toch hier.
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetische pointer */ }
          act((t) => perf.dropDown(t));
        }}
        onPointerUp={() => act((t) => perf.dropUp(t))}
        onPointerCancel={() => act((t) => perf.dropUp(t))}
        style={{ ...big(perf.dropped ? AMBER : '#374151', perf.dropped ? 'var(--mb-on-accent)' : FG), ...TOUCH }}>
        DROP<span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>hold</span>
      </button>
      <button type="button" data-tour="fs-next" onClick={() => act((t) => perf.next(t))} style={{ ...big('#1f2937', FG), ...TOUCH }}>
        NEXT<span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>on the 1</span>
      </button>
      <button type="button" data-tour="fs-fill" onClick={() => act((t) => perf.fill(t))} style={{ ...big('#1f2937', FG), ...TOUCH }}>
        FILL<span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.7 }}>next bar</span>
      </button>
    </div>
  );

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: phone ? 8 : 16, position: 'relative', flexWrap: 'wrap' }}>
      {!phone && (
        <div style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM }}>
          Music<span style={{ color: AMBER }}>Brain</span> freestyle
        </div>
      )}
      <button type="button" data-tour="fs-style" onClick={nextStyle} title="Next style (G) — stops the beat"
        style={{ ...TOUCH, fontSize: 13, color: FG, background: '#1f2937', border: '1px solid #374151', borderRadius: 4, padding: '5px 10px', cursor: 'pointer' }}>
        {style.name} · {style.bpm} <span style={{ color: DIM }}>▸</span>
      </button>
      <div style={{ flex: 1 }} />
      <label data-tour="fs-perc" style={{ fontSize: 12, color: DIM, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={perf.percussionist} onChange={(e) => act((t) => perf.setPercussionist(e.target.checked, t))} />
        {phone ? 'percussionist' : 'percussionist plays along'}
      </label>
      <label data-tour="fs-auto" style={{ fontSize: 12, color: DIM, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input type="checkbox" checked={perf.autopilot} onChange={(e) => act((t) => perf.setAutopilot(e.target.checked, t))} />
        autopilot
      </label>
      <button type="button" data-tour="fs-mic" onClick={() => void toggleMic()} title="Record the microphone on its own track (M)"
        style={{ ...btn(micOn ? '#7f1d1d' : 'transparent', micOn ? FG : DIM), ...TOUCH, border: `1px solid ${micOn ? '#ef4444' : '#374151'}` }}>
        {micOn ? '● MIC' : '○ MIC'}
      </button>
      <button type="button" onClick={() => setTour(true)} title="Tour: what every button does" aria-label="Tour" style={btn('transparent', DIM)}>?</button>
      {!phone && (
        <button type="button" data-tour="fs-start" onClick={() => (running ? stop() : void start())} style={btn(running ? '#374151' : AMBER, running ? FG : 'var(--mb-on-accent)')}>
          {running ? (perf.ending ? '■ ENDING…' : '■ STOP') : '▶ START'}
        </button>
      )}
      {onExit && <button type="button" onClick={() => { if (running) stop(); onExit(); }} style={btn('transparent', DIM)} title="Back to the editor">✕</button>}
    </header>
  );

  const recLabel = recorder.active ? `● ${Math.floor(Math.min(recSecs, KEEP_SECONDS) / 60)}:${String(Math.min(recSecs, KEEP_SECONDS) % 60).padStart(2, '0')}` : '';
  const saveButton = (
    <button type="button" data-tour="fs-save" onClick={save} title="Save the last two minutes as a WAV file (S)"
      style={{ ...btn(recorder.active ? '#1f2937' : 'transparent', recorder.active ? FG : DIM), ...TOUCH, border: '1px solid #374151', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...MONO, fontSize: 12, color: recorder.active ? '#ef4444' : DIM }}>{recLabel || '○'}</span> SAVE
    </button>
  );
  const flash = <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: AMBER, opacity: onOne ? 0.22 : 0, transition: onOne ? 'none' : 'opacity 180ms' }} />;
  const meter = (
    <span data-level={level.toFixed(3)} title="output level" style={{ display: 'inline-block', width: 80, height: 8, background: '#1f2937', borderRadius: 2, alignSelf: 'center', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${Math.min(100, level * 100)}%`, height: '100%', background: level > 0.95 ? '#ef4444' : AMBER }} />
    </span>
  );

  if (phone) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: BG, color: FG, fontFamily: 'var(--mb-font-sans)', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', boxSizing: 'border-box', overflowY: 'auto', userSelect: 'none' }}>
        {flash}
        {header}
        <main style={{ textAlign: 'center', position: 'relative' }}>
          {bpmBlock}
          {beatDots}
          <div data-tour="fs-section" style={{ marginTop: 10 }}>
            <div style={{ fontSize: 'clamp(28px, 9vw, 44px)', fontWeight: 800, lineHeight: 1 }}>{perf.section.name}</div>
            <div style={{ fontSize: 'clamp(22px, 7vw, 36px)', fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>{perf.section.chord} <span style={{ fontSize: 14, color: DIM, fontWeight: 400 }}>{style.key}</span></div>
            <div style={{ minHeight: 22, fontSize: 15, color: AMBER, fontStyle: 'italic', marginTop: 4 }}>{status}</div>
          </div>
        </main>
        <section data-tour="fs-stems" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, position: 'relative' }}>{stemButtons}</section>
        <section style={{ position: 'relative' }}>{actions}</section>
        <PlayTour open={tour} onClose={() => setTour(false)} steps={TOUR_STEPS} seenKey={TOUR_KEY} lang="en" />
        <button type="button" data-tour="fs-start" onClick={() => (running ? stop() : void start())}
          style={{ ...big(running ? '#374151' : AMBER, running ? FG : 'var(--mb-on-accent)'), ...TOUCH, padding: '16px 8px', fontSize: 18, position: 'relative' }}>
          {running ? (perf.ending ? '■ ENDING…' : '■ STOP') : '▶ START'}
        </button>
        <footer style={{ display: 'flex', gap: 10, fontSize: 12, color: DIM, position: 'relative', alignItems: 'center' }}>
          {saveButton}{meter}<span style={{ ...MONO, flex: 1, textAlign: 'right' }}>{log}</span>
        </footer>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, color: FG, fontFamily: 'var(--mb-font-sans)', display: 'flex', flexDirection: 'column', padding: '16px 24px', boxSizing: 'border-box', userSelect: 'none' }}>
      {flash}
      {header}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 24, position: 'relative', minHeight: 0 }}>
        {/* Links: sectie en akkoord, voor de rapper en de gitarist. */}
        <section data-tour="fs-section">
          <div style={{ fontSize: 14, color: DIM, letterSpacing: '0.1em' }}>SECTION</div>
          <div style={{ fontSize: 'clamp(40px, 7vw, 96px)', fontWeight: 800, lineHeight: 1 }}>{perf.section.name}</div>
          <div style={{ marginTop: 28, fontSize: 14, color: DIM, letterSpacing: '0.1em' }}>KEY · CHORD</div>
          <div style={{ fontSize: 'clamp(32px, 5vw, 72px)', fontWeight: 700, lineHeight: 1.1 }}>{perf.section.chord}</div>
          <div style={{ fontSize: 18, color: DIM, marginTop: 4 }}>{style.key}</div>
          <div style={{ marginTop: 28, minHeight: 28, fontSize: 20, color: AMBER, fontStyle: 'italic' }}>{status}</div>
        </section>
        {/* Rechts: BPM groot, de tel en de maat. */}
        <section style={{ textAlign: 'center' }}>
          {bpmBlock}
          {beatDots}
        </section>
      </main>

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, position: 'relative', alignItems: 'stretch' }}>
        <div data-tour="fs-stems" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>{stemButtons}</div>
        {actions}
      </section>
      <PlayTour open={tour} onClose={() => setTour(false)} steps={TOUR_STEPS} seenKey={TOUR_KEY} lang="en" />

      <footer style={{ display: 'flex', gap: 24, marginTop: 14, fontSize: 13, color: DIM, position: 'relative', flexWrap: 'wrap' }}>
        <span><b style={{ color: FG }}>SPACE</b> hold = DROP</span>
        <span><b style={{ color: FG }}>→</b> NEXT section (lands on the 1)</span>
        <span><b style={{ color: FG }}>F</b> FILL (next bar)</span>
        <span><b style={{ color: FG }}>1–4</b> stems (next bar)</span>
        <span><b style={{ color: FG }}>T</b> tap tempo · <b style={{ color: FG }}>− +</b> 1 bpm</span>
        <span><b style={{ color: FG }}>P</b> start / stop (ending)</span>
        <span><b style={{ color: FG }}>S</b> save last 2 min</span>
        <span><b style={{ color: FG }}>M</b> mic · <b style={{ color: FG }}>A</b> autopilot · <b style={{ color: FG }}>G</b> style</span>
        <span style={{ flex: 1 }} />
        {saveButton}
        {meter}
        <span style={MONO}>{log}</span>
      </footer>
    </div>
  );
}

function btn(bg: string, fg: string): CSSProperties {
  return { padding: '8px 16px', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', border: 'none', borderRadius: 6, background: bg, color: fg, cursor: 'pointer' };
}
function big(bg: string, fg: string): CSSProperties {
  return { padding: '12px 8px', fontSize: 16, fontWeight: 800, letterSpacing: '0.08em', border: 'none', borderRadius: 8, background: bg, color: fg, cursor: 'pointer', lineHeight: 1.1 };
}
