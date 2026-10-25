// De freestyle-machine als pagina (spinoffs/freestyle-machine/MOCKUP.md):
// één kaal, donker scherm voor iemand die staat. Onder de motorkap draait
// de vaste patch van freestylePatch.ts in de gewone AudioEngine; deze
// pagina is de bedieningslaag (performance.ts) plus het scherm.
//
// Schermtekst in het Engels (besluit Mark 2026-10-25: hij en zijn vriend
// lezen het dan beide). Toetsen: SPACE (houden) = DROP, → of Enter = NEXT,
// F = FILL, 1–4 = stems, T = TAP, P = start/stop.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as Tone from 'tone';

import { getEngine, useEngineStatus } from '../modular-mb/sim/engineSingleton';
import { TapTempo } from '../modular-mb/tempo';
import { buildFreestyleRig } from './freestylePatch';
import { Performance, type Fired } from './performance';
import { STEMS, STEM_LABEL, STYLES, styleById, type Stem } from './style';

const BG = '#0b0b0f', FG = '#f3f4f6', DIM = '#6b7280', AMBER = 'var(--mb-accent)';
const MONO: CSSProperties = { fontFamily: 'var(--mb-font-mono)', fontVariantNumeric: 'tabular-nums' };

function ctxNow(): number { return (Tone.getContext().rawContext as AudioContext).currentTime; }

export function FreestyleApp({ onExit }: { onExit?: () => void }): JSX.Element {
  // Stijl kiezen bouwt de patch opnieuw (andere klokuitgang voor Grids,
  // andere klank) en begint met een verse bedieningslaag.
  const [styleId, setStyleId] = useState(STYLES[0]!.id);
  const style = styleById(styleId);
  const rig = useMemo(() => buildFreestyleRig(style), [style]);
  const perf = useMemo(() => new Performance(style), [style]);
  const engine = getEngine();
  const { level } = useEngineStatus();
  const tapper = useRef(new TapTempo());
  const [, bump] = useState(0);
  const [pos, setPos] = useState(() => perf.clock.position(0));
  const [log, setLog] = useState('press START (P)');
  const [tapFlash, setTapFlash] = useState(false);

  useEffect(() => {
    engine.build(rig.project, rig.patch);
    return () => { engine.stop(); };
  }, [engine, rig]);

  /** Plan een pakketje op zijn contexttijd. Een paar ms vroeger: het
   *  bericht naar de worklet kost een blok. */
  const apply = useCallback((f: Fired | null) => {
    bump((n) => n + 1);                 // ook zonder pakketje: er staat nu iets anders gewapend
    if (!f) return;
    const delay = Math.max(0, (f.at - ctxNow()) * 1000 - 3);
    window.setTimeout(() => {
      for (const ch of f.changes) engine.updateControl(rig.ids[ch.module], ch.control, ch.value);
      if (f.master) engine.setMasterVolume(f.master.gain, f.master.rampS);
      setLog(f.label);
    }, delay);
  }, [engine, rig]);

  // Lookahead-planner en schermklok.
  useEffect(() => {
    const id = window.setInterval(() => { for (const f of perf.tick(ctxNow())) apply(f); }, 30);
    let raf = 0;
    const draw = (): void => { setPos(perf.clock.position(ctxNow())); raf = requestAnimationFrame(draw); };
    raf = requestAnimationFrame(draw);
    return () => { window.clearInterval(id); cancelAnimationFrame(raf); };
  }, [perf, apply]);

  const start = useCallback(async () => {
    await engine.start();
    apply(perf.start(ctxNow()));
  }, [engine, perf, apply]);
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
    setLog(`style: ${styleById(id).name} — press START (P)`);
  }, [perf, stop]);

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.repeat) return;
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
        default: return;
      }
    };
    const up = (e: KeyboardEvent): void => { if (e.code === 'Space') { e.preventDefault(); act((t) => perf.dropUp(t)); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [perf, act, tap, start, stop]);

  const running = perf.running;
  const onOne = running && pos.bar === 0 && pos.beat === 0 && pos.frac < 0.25;
  const pending = perf.pendingLabels();
  const bpm = perf.bpm;

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, color: FG, fontFamily: 'var(--mb-font-sans)', display: 'flex', flexDirection: 'column', padding: '16px 24px', boxSizing: 'border-box', userSelect: 'none' }}>
      {/* De flits op de "1" van elke frase: perifeer zichtbaar, ook voor de maat. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: AMBER, opacity: onOne ? 0.22 : 0, transition: onOne ? 'none' : 'opacity 180ms' }} />

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM }}>
          Music<span style={{ color: AMBER }}>Brain</span> freestyle
        </div>
        <select value={styleId} onChange={(e) => chooseStyle(e.target.value)} title="Style (stops the beat)"
          style={{ fontSize: 13, color: FG, background: '#1f2937', border: '1px solid #374151', borderRadius: 4, padding: '3px 6px' }}>
          {STYLES.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.bpm}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 13, color: DIM, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={perf.percussionist} onChange={(e) => act((t) => perf.setPercussionist(e.target.checked, t))} />
          percussionist plays along
        </label>
        <button type="button" onClick={() => (running ? stop() : void start())} style={btn(running ? '#374151' : AMBER, running ? FG : 'var(--mb-on-accent)')}>
          {running ? '■ STOP' : '▶ START'}
        </button>
        {onExit && <button type="button" onClick={() => { if (running) stop(); onExit(); }} style={btn('transparent', DIM)} title="Back to the editor">✕</button>}
      </header>

      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 24, position: 'relative', minHeight: 0 }}>
        {/* Links: sectie en akkoord, voor de rapper en de gitarist. */}
        <section>
          <div style={{ fontSize: 14, color: DIM, letterSpacing: '0.1em' }}>SECTION</div>
          <div style={{ fontSize: 'clamp(40px, 7vw, 96px)', fontWeight: 800, lineHeight: 1 }}>{perf.section.name}</div>
          <div style={{ marginTop: 28, fontSize: 14, color: DIM, letterSpacing: '0.1em' }}>KEY · CHORD</div>
          <div style={{ fontSize: 'clamp(32px, 5vw, 72px)', fontWeight: 700, lineHeight: 1.1 }}>{perf.section.chord}</div>
          <div style={{ fontSize: 18, color: DIM, marginTop: 4 }}>{style.key}</div>
          <div style={{ marginTop: 28, minHeight: 28, fontSize: 20, color: AMBER, fontStyle: 'italic' }}>
            {perf.dropped ? 'DROP — beat is out' : pending.join(' · ')}
          </div>
        </section>

        {/* Rechts: BPM groot, de tel en de maat. */}
        <section style={{ textAlign: 'center' }}>
          <div onPointerDown={(e) => { e.preventDefault(); tap(); }} title="Tap tempo (T)" style={{ cursor: 'pointer', display: 'inline-block' }}>
            <div style={{ ...MONO, fontSize: 'clamp(96px, 18vw, 220px)', fontWeight: 700, lineHeight: 0.95, color: tapFlash ? AMBER : FG }}>
              {bpm % 1 ? bpm.toFixed(1) : bpm}
            </div>
            <div style={{ fontSize: 16, color: DIM, marginTop: 4 }}>BPM · {style.feel} · tap T</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 28 }}>
            {[0, 1, 2, 3].map((b) => (
              <div key={b} style={{ width: 44, height: 44, borderRadius: 22, background: running && pos.beat === b ? (b === 0 ? AMBER : FG) : '#1f2937', transition: 'background 40ms' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            {[0, 1, 2, 3].map((bar) => (
              <div key={bar} style={{ width: 70, height: 10, borderRadius: 3, background: running && pos.bar === bar ? AMBER : running && bar < pos.bar ? '#4b5563' : '#1f2937' }} />
            ))}
          </div>
          <div style={{ fontSize: 14, color: DIM, marginTop: 8 }}>{running ? `bar ${pos.bar + 1} of 4 · phrase ${pos.phrase + 1}` : 'stopped'}</div>
        </section>
      </main>

      {/* De vier stems: aan = vol, uit = rand; gewapend = amberen rand. */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, position: 'relative' }}>
        {STEMS.map((s: Stem, i) => {
          const on = perf.stems[s];
          const will = perf.stemWillBe(s);
          return (
            <button key={s} type="button" onClick={() => act((t) => perf.toggleStem(s, t))}
              style={{
                padding: '18px 8px', fontSize: 18, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 8,
                background: on ? '#e5e7eb' : 'transparent', color: on ? '#111827' : DIM,
                border: `3px solid ${will !== on ? AMBER : on ? '#e5e7eb' : '#374151'}`,
              }}>
              <span style={{ ...MONO, fontSize: 12, opacity: 0.6, marginRight: 8 }}>{i + 1}</span>{STEM_LABEL[s]}
            </button>
          );
        })}
      </section>

      <footer style={{ display: 'flex', gap: 24, marginTop: 14, fontSize: 13, color: DIM, position: 'relative', flexWrap: 'wrap' }}>
        <span><b style={{ color: FG }}>SPACE</b> hold = DROP</span>
        <span><b style={{ color: FG }}>→</b> NEXT section (lands on the 1)</span>
        <span><b style={{ color: FG }}>F</b> FILL (next bar)</span>
        <span><b style={{ color: FG }}>1–4</b> stems (next bar)</span>
        <span><b style={{ color: FG }}>T</b> tap tempo</span>
        <span><b style={{ color: FG }}>P</b> start / stop</span>
        <span style={{ flex: 1 }} />
        {/* Uitgangsniveau: een smal balkje, ook voor de headless rooktest (data-level). */}
        <span data-level={level.toFixed(3)} title="output level" style={{ display: 'inline-block', width: 80, height: 8, background: '#1f2937', borderRadius: 2, alignSelf: 'center', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${Math.min(100, level * 100)}%`, height: '100%', background: level > 0.95 ? '#ef4444' : AMBER }} />
        </span>
        <span style={MONO}>{log}</span>
      </footer>
    </div>
  );
}

function btn(bg: string, fg: string): CSSProperties {
  return { padding: '8px 16px', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', border: 'none', borderRadius: 6, background: bg, color: fg, cursor: 'pointer' };
}
