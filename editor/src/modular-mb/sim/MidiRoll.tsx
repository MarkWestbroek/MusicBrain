// Pianorol voor de MIDI-bestandsspeler, zoals in een DAW:
//   - noten als balkjes (dekking = velocity), tellen en maten als raster;
//   - afspeelkop; klik of sleep in de noten = springen;
//   - sleep in de liniaal = lusvenster (klikt op tellen, Alt = vrij),
//     klik in de liniaal = springen, dubbelklik = lusvenster weg.

import { useEffect, useMemo, useRef, useState } from 'react';
import { noteSpans, type MidiFileSource } from './midiFilePlayer';

const H = 132, RULER = 18;

export function MidiRoll({ source }: { source: MidiFileSource }): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [, setTick] = useState(0);
  useEffect(() => source.onState(() => setTick((x) => x + 1)), [source]);
  const file = source.parsed();
  const spans = useMemo(() => (file ? noteSpans(file) : []), [file]);
  const st = source.state();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dur = Math.max(1, st.durationMs);
  const beatMs = file ? 60_000 / file.bpm : 500;
  const bar = file?.beatsPerBar ?? 4;
  const xOf = (ms: number): number => (ms / dur) * width;
  const msOf = (x: number): number => Math.max(0, Math.min(dur, (x / width) * dur));
  const snap = (ms: number, free: boolean): number => (free ? ms : Math.round(ms / beatMs) * beatMs);

  const lo = spans.length ? Math.min(...spans.map((s) => s.note)) - 2 : 48;
  const hi = spans.length ? Math.max(...spans.map((s) => s.note)) + 2 : 72;
  const rows = Math.max(1, hi - lo + 1);

  // Tekenen: statisch deel bij elke render, afspeelkop per frame zolang hij speelt.
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
      // Lusvenster
      if (s.region) {
        const x0 = xOf(s.region.start), x1 = xOf(s.region.end);
        g.fillStyle = 'rgba(245, 158, 11, 0.16)'; g.fillRect(x0, RULER, x1 - x0, H - RULER);
        g.fillStyle = '#f59e0b'; g.fillRect(x0, 2, x1 - x0, RULER - 4);
      }
      // Raster: tellen en maten (dunner bij veel tellen)
      const beats = Math.floor(dur / beatMs);
      const every = beats > 240 ? bar * 4 : beats > 64 ? bar : 1;
      g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
      for (let b = 0; b <= beats; b += every) {
        const x = Math.round(xOf(b * beatMs)) + 0.5, isBar = b % bar === 0;
        g.strokeStyle = isBar ? '#334155' : '#1e293b'; g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
        if (isBar && (every > 1 || xOf(bar * beatMs) > 22)) { g.fillStyle = '#94a3b8'; g.fillText(String(b / bar + 1), x + 3, RULER / 2); }
      }
      // Noten
      const rh = (H - RULER - 4) / rows;
      for (const n of spans) {
        const x = xOf(n.start), w = Math.max(1.5, xOf(n.end) - x), y = RULER + 2 + (hi - n.note) * rh;
        g.fillStyle = `rgba(56, 189, 248, ${0.35 + 0.65 * (n.vel / 127)})`;
        g.fillRect(x, y, w, Math.max(1.5, rh - 1));
      }
      // Afspeelkop
      const px = Math.round(xOf(s.posMs)) + 0.5;
      g.strokeStyle = s.playing ? '#ef4444' : '#f87171'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); g.lineWidth = 1;
      if (s.playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });

  // Slepen
  const drag = useRef<{ kind: 'ruler' | 'notes'; x0: number; moved: boolean } | null>(null);
  const localX = (e: React.PointerEvent): number => e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0);
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

  if (!file) return <div ref={wrapRef} style={{ width: '100%' }} />;
  const fmt = (ms: number): string => `${Math.floor(ms / 60_000)}:${((ms % 60_000) / 1000).toFixed(1).padStart(4, '0')}`;
  return (
    <div ref={wrapRef} style={{ width: '100%', marginTop: 6 }}>
      <canvas ref={canvasRef} style={{ width, height: H, display: 'block', borderRadius: 4, cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { if (e.clientY - e.currentTarget.getBoundingClientRect().top < RULER) source.setRegion(null); }}
        aria-label="Pianorol: klik om te springen, sleep in de liniaal voor een lusvenster" />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: '#64748b', marginTop: 3, flexWrap: 'wrap' }}>
        <span>{fmt(st.posMs)} / {fmt(st.durationMs)} · {Math.round(file.bpm)} BPM</span>
        {st.region
          ? <span style={{ color: '#b45309' }}>lus {fmt(st.region.start)}–{fmt(st.region.end)}{' '}
              <button onClick={() => source.setRegion(null)} style={{ fontSize: 11 }}>venster weg</button></span>
          : <span>Sleep in de liniaal voor een lusvenster (klikt op tellen, Alt = vrij). Klik in de noten om te springen.</span>}
      </div>
    </div>
  );
}
