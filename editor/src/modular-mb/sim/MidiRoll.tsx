// Pianorol met transport voor de MIDI-bestandsspeler, zoals in een DAW:
//   - noten als balkjes (dekking = velocity), maten en tellen als raster;
//   - afspeelkop; klik of sleep in de noten = springen;
//   - sleep in de liniaal = lusvenster (klikt op tellen, Alt = vrij);
//     dubbelklik op het oranje venster = weg;
//   - transport: ⏪ maat terug · ▶/⏸ · ■ stop · ⏩ maat verder
//     (dubbelklik of Shift = naar begin/einde);
//   - breedte volgt de ruimte; hoogte met de greep onderaan (of vast via prop).

import { useEffect, useMemo, useRef, useState } from 'react';
import { noteSpans, type MidiFileSource } from './midiFilePlayer';

const RULER = 18;
const H_KEY = 'mmb.midiroll.h';

/**
 * Een maat terug of verder vanaf `pos`. Terug gaat naar het begin van de
 * huidige maat, of naar de vorige als je er net (< 250 ms) in zit, zoals
 * in de meeste DAW's.
 */
export function barStep(pos: number, barMs: number, dir: 1 | -1, durationMs: number): number {
  if (barMs <= 0) return pos;
  const t = dir > 0
    ? (Math.floor(pos / barMs + 1e-6) + 1) * barMs
    : Math.floor(Math.max(0, pos - 250) / barMs) * barMs;
  return Math.max(0, Math.min(durationMs, t));
}

/** Om de hoeveel maten een lijn/label, zodat ze minstens `minPx` uit elkaar staan. */
export function barEvery(barPx: number, minPx: number): number {
  let k = 1;
  while (k * barPx < minPx && k < 4096) k *= 2;
  return k;
}

/** Transport-iconen als SVG: overal even groot en in de tekstkleur (emoji verschillen per systeem). */
type IconKind = 'back' | 'play' | 'pause' | 'stop' | 'fwd';
function Icon({ kind }: { kind: IconKind }): JSX.Element {
  const p: Record<IconKind, JSX.Element> = {
    back:  <><path d="M8 3 L1 8 L8 13 Z" /><path d="M15 3 L8 8 L15 13 Z" /></>,
    play:  <path d="M5 2.5 L13.5 8 L5 13.5 Z" />,
    pause: <><rect x="4" y="3" width="3" height="10" /><rect x="9" y="3" width="3" height="10" /></>,
    stop:  <rect x="3.5" y="3.5" width="9" height="9" />,
    fwd:   <><path d="M1 3 L8 8 L1 13 Z" /><path d="M8 3 L15 8 L8 13 Z" /></>,
  };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>{p[kind]}</svg>;
}

function loadHeight(): number {
  try { const v = Number(localStorage.getItem(H_KEY)); if (v >= 60 && v <= 480) return v; } catch { /* geen opslag */ }
  return 132;
}

export function MidiRoll({ source, canPlay = true, height }: {
  source: MidiFileSource;
  /** Transport-knoppen voor afspelen alleen als de klankbron klaar is (sim draait). */
  canPlay?: boolean;
  /** Vaste hoogte (bv. in een widget); zonder = verstelbaar met de greep. */
  height?: number;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [userH, setUserH] = useState(loadHeight);
  const H = height ?? userH;
  const [, setTick] = useState(0);
  useEffect(() => source.onState(() => setTick((x) => x + 1)), [source]);
  const file = source.parsed();
  const spans = useMemo(() => (file ? noteSpans(file) : []), [file]);
  const st = source.state();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(120, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tijdens spelen de tijd onder de rol bijwerken (de canvas tekent zelf per frame).
  useEffect(() => {
    if (!st.playing) return undefined;
    const id = window.setInterval(() => setTick((x) => x + 1), 200);
    return () => window.clearInterval(id);
  }, [st.playing]);

  const dur = Math.max(1, st.durationMs);
  const beatMs = file ? 60_000 / file.bpm : 500;
  const bar = file?.beatsPerBar ?? 4;
  const barMs = beatMs * bar;
  const xOf = (ms: number): number => (ms / dur) * width;
  const msOf = (x: number): number => Math.max(0, Math.min(dur, (x / width) * dur));
  const snap = (ms: number, free: boolean): number => (free ? ms : Math.round(ms / beatMs) * beatMs);

  const lo = spans.length ? Math.min(...spans.map((s) => s.note)) - 2 : 48;
  const hi = spans.length ? Math.max(...spans.map((s) => s.note)) + 2 : 72;
  const rows = Math.max(1, hi - lo + 1);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return undefined;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    if (!g) return undefined;
    let raf = 0;
    const draw = (): void => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, width, H);
      g.fillStyle = '#1e293b'; g.fillRect(0, 0, width, RULER);
      const s = source.state();
      if (s.region) {
        const x0 = xOf(s.region.start), x1 = xOf(s.region.end);
        g.fillStyle = 'rgba(245, 158, 11, 0.16)'; g.fillRect(x0, RULER, x1 - x0, H - RULER);
        g.fillStyle = '#f59e0b'; g.fillRect(x0, 2, x1 - x0, RULER - 4);
      }
      // Raster: dunner naarmate de rol smaller is.
      const barPx = xOf(barMs), beatPx = barPx / bar;
      const lineEvery = barEvery(barPx, 6), labelEvery = barEvery(barPx, 28);
      const bars = Math.ceil(dur / barMs);
      g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
      if (beatPx >= 8) {
        g.strokeStyle = '#1e293b';
        for (let b = 0; b * beatMs <= dur; b++) {
          if (b % bar === 0) continue;
          const x = Math.round(xOf(b * beatMs)) + 0.5;
          g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
        }
      }
      for (let m = 0; m <= bars; m += lineEvery) {
        const x = Math.round(xOf(m * barMs)) + 0.5;
        g.strokeStyle = '#334155'; g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
        if (m % labelEvery === 0) { g.fillStyle = '#94a3b8'; g.fillText(String(m + 1), x + 3, RULER / 2); }
      }
      const rh = (H - RULER - 4) / rows;
      for (const n of spans) {
        const x = xOf(n.start), w = Math.max(1.5, xOf(n.end) - x), y = RULER + 2 + (hi - n.note) * rh;
        g.fillStyle = `rgba(56, 189, 248, ${0.35 + 0.65 * (n.vel / 127)})`;
        g.fillRect(x, y, w, Math.max(1.5, rh - 1));
      }
      const px = Math.round(xOf(s.posMs)) + 0.5;
      g.strokeStyle = s.playing ? '#ef4444' : '#f87171'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); g.lineWidth = 1;
      if (s.playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });

  // Slepen in de rol
  const drag = useRef<{ kind: 'ruler' | 'notes'; x0: number; moved: boolean } | null>(null);
  const localX = (e: React.PointerEvent | React.MouseEvent): number => e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0);
  const inRegion = (x: number): boolean => !!st.region && msOf(x) >= st.region.start && msOf(x) <= st.region.end;
  function down(e: React.PointerEvent<HTMLCanvasElement>): void {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const x = localX(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: y < RULER ? 'ruler' : 'notes', x0: x, moved: false };
    if (drag.current.kind === 'notes') source.seek(msOf(x));
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    if (!d) return;
    const x = localX(e);
    if (Math.abs(x - d.x0) > 3) d.moved = true;
    if (d.kind === 'notes') source.seek(msOf(x));
    else if (d.moved) source.setRegion({ start: snap(msOf(d.x0), e.altKey), end: snap(msOf(x), e.altKey) });
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'ruler' && !d.moved) source.seek(msOf(localX(e)));
  }

  // Hoogte verslepen
  const hDrag = useRef<{ y0: number; h0: number } | null>(null);
  function gripDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    hDrag.current = { y0: e.clientY, h0: userH };
  }
  function gripMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!hDrag.current) return;
    setUserH(Math.max(60, Math.min(480, Math.round(hDrag.current.h0 + e.clientY - hDrag.current.y0))));
  }
  function gripUp(): void {
    hDrag.current = null;
    try { localStorage.setItem(H_KEY, String(userH)); } catch { /* geen opslag */ }
  }

  if (!file) return <div ref={wrapRef} style={{ width: '100%' }} />;

  const fmt = (ms: number): string => `${Math.floor(ms / 60_000)}:${((ms % 60_000) / 1000).toFixed(1).padStart(4, '0')}`;
  const tbtn: React.CSSProperties = {
    width: 34, height: 26, padding: 0, fontSize: 14, lineHeight: '24px', textAlign: 'center',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const step = (dir: 1 | -1, edge: boolean): void => {
    const r = st.region;
    if (edge) source.seek(dir < 0 ? (r?.start ?? 0) : (r?.end ?? dur));
    else source.seek(barStep(source.position(), barMs, dir, dur));
  };
  return (
    <div ref={wrapRef} style={{ width: '100%', marginTop: 6 }}>
      <canvas ref={canvasRef} style={{ width, height: H, display: 'block', borderRadius: '4px 4px 0 0', cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { if (inRegion(localX(e))) source.setRegion(null); }}
        aria-label="Pianorol: klik om te springen, sleep in de liniaal voor een lusvenster, dubbelklik op het venster om het weg te halen" />
      {height === undefined && (
        <div onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} title="Sleep om de hoogte te veranderen"
          style={{ height: 6, background: '#1e293b', borderRadius: '0 0 4px 4px', cursor: 'ns-resize', touchAction: 'none',
            display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 28, height: 2, borderRadius: 1, background: '#475569' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#64748b', marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <button style={tbtn} onClick={(e) => step(-1, e.shiftKey)} onDoubleClick={() => step(-1, true)} title="Eén maat terug (dubbelklik of Shift: naar het begin)" aria-label="Maat terug"><Icon kind="back" /></button>
          {st.playing
            ? <button style={tbtn} onClick={() => source.pause()} title="Pauze" aria-label="Pauze"><Icon kind="pause" /></button>
            : <button style={tbtn} onClick={() => source.start()} disabled={!canPlay}
                title={canPlay ? 'Afspelen vanaf de afspeelkop' : 'Start eerst de sim'} aria-label="Afspelen"><Icon kind="play" /></button>}
          <button style={tbtn} onClick={() => source.rewind()} title="Stop en terug naar het begin (van het lusvenster)"
            disabled={!st.playing && st.posMs === (st.region?.start ?? 0)} aria-label="Stop"><Icon kind="stop" /></button>
          <button style={tbtn} onClick={(e) => step(1, e.shiftKey)} onDoubleClick={() => step(1, true)} title="Eén maat verder (dubbelklik of Shift: naar het einde)" aria-label="Maat verder"><Icon kind="fwd" /></button>
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(st.posMs)} / {fmt(st.durationMs)} · {Math.round(file.bpm)} BPM</span>
        {st.region
          ? <span style={{ color: '#b45309' }} title="Dubbelklik op het oranje venster om het weg te halen">lus {fmt(st.region.start)}–{fmt(st.region.end)}</span>
          : <span>Sleep in de liniaal voor een lusvenster (klikt op tellen, Alt = vrij).</span>}
      </div>
    </div>
  );
}
