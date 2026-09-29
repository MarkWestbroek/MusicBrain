// MidiRoll — pianorol met transport, zoals in een DAW. Praat met een Playback
// (de sim-speler van de editor, of AudioPlayback die een <audio> volgt).
//
//   - noten als balkjes (dekking = velocity), maten en tellen als raster,
//     controller-laag onderin (modwheel, aftertouch, pitch bend, CC's);
//   - afspeelkop; klik of sleep in de noten = springen;
//   - liniaal: sleep buiten het venster = nieuw lusvenster, sleep bij een rand
//     = die rand verschuiven, binnen = dubbelklik haalt het weg; klikt op
//     tellen, Alt = vrij;
//   - transport ⏪ maat terug · ▶/⏸ · ■ stop · ⏩ maat verder (dubbelklik of
//     Shift = naar begin/einde);
//   - toetsen met focus in de rol: spatie = afspelen/pauze, ←/→ = maat,
//     Home/End = begin/einde. keyScope 'window' laat spatie ook zonder focus
//     werken (editor), 'focus' alleen met focus (widget: geen scroll-kaping);
//   - kleuren: CSS-tokens van de site (--accent, --surface, … met --color-*
//     als tweede keus), anders het meegegeven palet; volgt themawissels;
//   - breedte volgt de ruimte; hoogte vast (prop) of met de greep.
//
// Alleen React als afhankelijkheid. Canvas alleen client-side (in effects).

import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { noteSpans, controllerSeries, type CtlKind } from './smf';
import type { Playback } from './playback';

const RULER = 18;
const H_KEY = 'mmb.midiroll.h';

/**
 * Een maat terug of verder vanaf `pos`. Terug gaat naar het begin van de
 * huidige maat, of naar de vorige als je er net (< 250 ms) in zit, zoals
 * in de meeste DAW's.
 */
export function barStep(pos: number, barMs: number, dir: 1 | -1, durationMs: number, offsetMs = 0): number {
  if (barMs <= 0) return pos;
  const rel = pos - offsetMs;
  const t = dir > 0
    ? (Math.floor(rel / barMs + 1e-6) + 1) * barMs
    : Math.floor((rel - 250) / barMs) * barMs;
  return Math.max(0, Math.min(durationMs, t + offsetMs));
}

/** Tempo uit getikte tijden (ms): gemiddelde van de laatste vier tussenpozen. */
export function tapTempo(taps: readonly number[]): number | null {
  const t = taps.slice(-5);
  if (t.length < 2) return null;
  const avg = (t[t.length - 1]! - t[0]!) / (t.length - 1);
  return avg > 0 ? Math.round((60_000 / avg) * 10) / 10 : null;
}

/** Waar een klik in de liniaal valt t.o.v. het lusvenster (in pixels). */
export type RulerHit = 'left' | 'right' | 'inside' | 'outside';
export function rulerHit(x: number, region: { x0: number; x1: number } | null, grab = 7): RulerHit {
  if (!region) return 'outside';
  const { x0, x1 } = region;
  // Bij een heel smal venster wint de dichtstbijzijnde rand.
  const dl = Math.abs(x - x0), dr = Math.abs(x - x1);
  if (dl <= grab || dr <= grab) return dl <= dr ? 'left' : 'right';
  return x > x0 && x < x1 ? 'inside' : 'outside';
}

/** Om de hoeveel maten een lijn/label, zodat ze minstens `minPx` uit elkaar staan. */
export function barEvery(barPx: number, minPx: number): number {
  let k = 1;
  while (k * barPx < minPx && k < 4096) k *= 2;
  return k;
}

/** Kleuren per rol. */
export interface Palette {
  bg: string; surface: string; line: string; label: string;
  notes: string; playhead: string; region: string;
  mod: string; at: string; bend: string; cc: string;
}

/** Welke CSS-tokens per rol gelezen worden (eerste die bestaat wint). */
export const PALETTE_TOKENS: Record<keyof Palette, string[]> = {
  bg: ['--background', '--color-background'],
  surface: ['--surface', '--color-surface'],
  line: ['--border', '--color-line'],
  label: ['--muted', '--color-muted'],
  notes: ['--accent', '--color-accent'],
  playhead: ['--foreground', '--color-foreground'],
  region: ['--accent', '--color-accent'],
  mod: ['--accent-2', '--color-accent-2'],
  at: ['--accent-strong', '--color-accent-strong'],
  bend: ['--foreground', '--color-foreground'],
  cc: ['--muted', '--color-muted'],
};

/** Palet uit CSS-tokens (als `tokens`), anders uit `palette`, anders de tekstkleur. */
export function resolvePalette(
  read: (name: string) => string, textColor: string, palette: Partial<Palette> = {}, tokens = true,
): Palette {
  const out = {} as Palette;
  for (const role of Object.keys(PALETTE_TOKENS) as (keyof Palette)[]) {
    let v = '';
    if (tokens) for (const t of PALETTE_TOKENS[role]) { v = read(t).trim(); if (v) break; }
    out[role] = v || palette[role] || textColor;
  }
  return out;
}

/** Korte samenvatting voor schermlezers en het tekstalternatief. */
export function describeRoll(bars: number, notes: number, controllers: string[]): string {
  const c = controllers.length ? `, met ${controllers.join(', ').toLowerCase()}` : '';
  return `Pianorol: ${bars} ${bars === 1 ? 'maat' : 'maten'}, ${notes} ${notes === 1 ? 'noot' : 'noten'}${c}`;
}

type IconKind = 'back' | 'play' | 'pause' | 'stop' | 'fwd';
function Icon({ kind }: { kind: IconKind }): ReactElement {
  const p: Record<IconKind, ReactElement> = {
    back:  <><path d="M8 3 L1 8 L8 13 Z" /><path d="M15 3 L8 8 L15 13 Z" /></>,
    play:  <path d="M5 2.5 L13.5 8 L5 13.5 Z" />,
    pause: <><rect x="4" y="3" width="3" height="10" /><rect x="9" y="3" width="3" height="10" /></>,
    stop:  <rect x="3.5" y="3.5" width="9" height="9" />,
    fwd:   <><path d="M1 3 L8 8 L1 13 Z" /><path d="M8 3 L15 8 L8 13 Z" /></>,
  };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{p[kind]}</svg>;
}

function loadHeight(): number {
  try { const v = Number(localStorage.getItem(H_KEY)); if (v >= 60 && v <= 480) return v; } catch { /* geen opslag */ }
  return 132;
}

const FOCUS_CSS = '.mmbroll :focus-visible,.mmbroll:focus-visible{outline:2px solid var(--accent,var(--color-accent,Highlight));outline-offset:2px}';

export interface MidiRollProps {
  playback: Playback;
  /** Kan er geluid uit? Zo niet, dan roept ▶ eerst onRequestStart aan. */
  canPlay?: boolean;
  onRequestStart?: () => void;
  /** Vaste hoogte (widget); zonder = verstelbaar met de greep (onthouden). */
  height?: number;
  /** Tempo/tap/tel 1-bediening tonen (editor). */
  gridControls?: boolean;
  /** 'focus' (standaard): toetsen alleen met focus in de rol. 'window': spatie ook zonder focus. */
  keyScope?: 'focus' | 'window';
  /** Kleuren als de site geen tokens heeft (of tokens={false}). */
  palette?: Partial<Palette>;
  tokens?: boolean;
  /** Uitlegregel onder de rol tonen. */
  hints?: boolean;
  /** Naam voor schermlezers (standaard "Pianorol"). */
  label?: string;
  /** Controller-laag (modwheel, aftertouch, bend, CC) tonen; standaard aan. */
  controllers?: boolean;
}

export function MidiRoll({
  playback: src, canPlay = true, onRequestStart, height, gridControls = false,
  keyScope = 'focus', palette, tokens = true, hints = true, label, controllers = true,
}: MidiRollProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hintId = useId();
  const [width, setWidth] = useState(600);
  const [userH, setUserH] = useState(() => (height === undefined ? loadHeight() : height));
  const H = height ?? userH;
  const [, setTick] = useState(0);
  useEffect(() => src.onState(() => setTick((x) => x + 1)), [src]);
  const file = src.parsed();
  const spans = useMemo(() => (file ? noteSpans(file) : []), [file]);
  const ctl = useMemo(() => (file && controllers ? controllerSeries(file) : []), [file, controllers]);
  // Laag onderin voor modwheel/aftertouch/bend/CC, alleen als ze er zijn.
  const LANE = ctl.length && H >= 90 ? Math.round(Math.min(40, Math.max(22, H * 0.2))) : 0;
  const st = src.state();

  // Kleuren: tokens/palet, opnieuw bij een themawissel (data-theme/class op <html>).
  const [pal, setPal] = useState<Palette>(() => resolvePalette(() => '', 'currentColor', palette, false));
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = (): void => {
      const cs = getComputedStyle(el);
      setPal(resolvePalette((n) => cs.getPropertyValue(n), cs.color || 'currentColor', palette, tokens));
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => mo.disconnect();
    // palette is meestal een constante; op identiteit vergelijken is genoeg.
  }, [palette, tokens, file]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.max(120, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [file]);

  // Tijdens spelen de tijd onder de rol bijwerken (de canvas tekent zelf per frame).
  useEffect(() => {
    if (!st.playing) return undefined;
    const id = window.setInterval(() => setTick((x) => x + 1), 200);
    return () => window.clearInterval(id);
  }, [st.playing]);

  const dur = Math.max(1, st.durationMs);
  const grid = src.grid();
  const beatMs = 60_000 / grid.bpm;
  const bar = grid.beatsPerBar;
  const barMs = beatMs * bar;
  const off = grid.offsetMs;
  const xOf = (ms: number): number => (ms / dur) * width;
  const msOf = (x: number): number => Math.max(0, Math.min(dur, (x / width) * dur));
  const snap = (ms: number, free: boolean): number => (free ? ms : off + Math.round((ms - off) / beatMs) * beatMs);

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
      g.globalAlpha = 1;
      g.fillStyle = pal.bg; g.fillRect(0, 0, width, H);
      g.fillStyle = pal.surface; g.fillRect(0, 0, width, RULER);
      const s = src.state();
      if (s.region) {
        const x0 = xOf(s.region.start), x1 = xOf(s.region.end);
        g.fillStyle = pal.region;
        g.globalAlpha = 0.16; g.fillRect(x0, RULER, x1 - x0, H - RULER);
        g.globalAlpha = 1; g.fillRect(x0, 2, x1 - x0, RULER - 4);
      }
      // Raster: dunner naarmate de rol smaller is. Tel 1 ligt op `off`.
      const barPx = xOf(barMs), beatPx = barPx / bar;
      const lineEvery = barEvery(barPx, 6), labelEvery = barEvery(barPx, 28);
      const firstBar = Math.floor(-off / barMs), lastBar = Math.ceil((dur - off) / barMs);
      g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
      g.strokeStyle = pal.line;
      if (beatPx >= 8) {
        g.globalAlpha = 0.45;
        for (let b = firstBar * bar; b <= lastBar * bar; b++) {
          if (b % bar === 0) continue;
          const x = Math.round(xOf(off + b * beatMs)) + 0.5;
          if (x < 0 || x > width) continue;
          g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
        }
        g.globalAlpha = 1;
      }
      for (let m = firstBar; m <= lastBar; m++) {
        if (((m % lineEvery) + lineEvery) % lineEvery !== 0) continue;
        const x = Math.round(xOf(off + m * barMs)) + 0.5;
        if (x < 0 || x > width) continue;
        g.strokeStyle = m === 0 && off > 0 ? pal.label : pal.line;
        g.beginPath(); g.moveTo(x, RULER); g.lineTo(x, H); g.stroke();
        if (m >= 0 && m % labelEvery === 0) { g.fillStyle = pal.label; g.fillText(String(m + 1), x + 3, RULER / 2); }
      }
      const rh = (H - RULER - LANE - 4) / rows;
      g.fillStyle = pal.notes;
      for (const n of spans) {
        const x = xOf(n.start), w = Math.max(1.5, xOf(n.end) - x), y = RULER + 2 + (hi - n.note) * rh;
        g.globalAlpha = 0.35 + 0.65 * (n.vel / 127);
        g.fillRect(x, y, w, Math.max(1.5, rh - 1));
      }
      g.globalAlpha = 1;
      if (LANE) {
        const top = H - LANE;
        g.fillStyle = pal.surface; g.fillRect(0, top, width, LANE);
        g.strokeStyle = pal.line; g.beginPath(); g.moveTo(0, top + 0.5); g.lineTo(width, top + 0.5); g.stroke();
        const yOf = (v: number): number => top + 2 + (1 - v) * (LANE - 4);
        g.lineWidth = 1.5;
        for (const series of ctl) {
          g.strokeStyle = pal[series.kind]; g.globalAlpha = series.kind === 'cc' ? 0.6 : 0.9;
          g.beginPath();
          series.points.forEach((p, i) => {
            const x = xOf(p.t), y = yOf(p.v);
            if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            const next = series.points[i + 1];
            g.lineTo(next ? xOf(next.t) : width, y);            // stap: waarde blijft staan
          });
          g.stroke();
        }
        g.globalAlpha = 1; g.lineWidth = 1;
      }
      const px = Math.round(xOf(s.posMs)) + 0.5;
      g.strokeStyle = pal.playhead; g.lineWidth = 1.5; g.globalAlpha = s.playing ? 1 : 0.7;
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); g.lineWidth = 1; g.globalAlpha = 1;
      if (s.playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });

  // Slepen in de rol
  type Drag = { kind: 'draw' | 'left' | 'right' | 'inside' | 'notes'; x0: number; moved: boolean; fixed?: number };
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState('pointer');
  const regionPx = (): { x0: number; x1: number } | null => st.region ? { x0: xOf(st.region.start), x1: xOf(st.region.end) } : null;
  const localX = (e: React.PointerEvent | React.MouseEvent): number => e.clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0);
  const inRegion = (x: number): boolean => !!st.region && msOf(x) >= st.region.start && msOf(x) <= st.region.end;
  function down(e: React.PointerEvent<HTMLCanvasElement>): void {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const x = localX(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (y >= RULER) { drag.current = { kind: 'notes', x0: x, moved: false }; src.seek(msOf(x)); return; }
    const hit = rulerHit(x, regionPx());
    const r = st.region;
    drag.current = hit === 'left' && r ? { kind: 'left', x0: x, moved: false, fixed: r.end }
      : hit === 'right' && r ? { kind: 'right', x0: x, moved: false, fixed: r.start }
      : { kind: hit === 'inside' ? 'inside' : 'draw', x0: x, moved: false };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    const x = localX(e);
    if (!d) {
      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
      const hit = y < RULER ? rulerHit(x, regionPx()) : 'outside';
      const c = hit === 'left' || hit === 'right' ? 'ew-resize' : 'pointer';
      if (c !== cursor) setCursor(c);
      return;
    }
    if (Math.abs(x - d.x0) > 3) d.moved = true;
    if (d.kind === 'notes') src.seek(msOf(x));
    else if ((d.kind === 'left' || d.kind === 'right') && d.fixed !== undefined) src.setRegion({ start: snap(msOf(x), e.altKey), end: d.fixed });
    else if (d.kind === 'draw' && d.moved) src.setRegion({ start: snap(msOf(d.x0), e.altKey), end: snap(msOf(x), e.altKey) });
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    drag.current = null;
    if ((d?.kind === 'draw' || d?.kind === 'inside') && !d.moved) src.seek(msOf(localX(e)));
  }

  const taps = useRef<number[]>([]);
  function tap(): void {
    const now = performance.now();
    if (taps.current.length && now - taps.current[taps.current.length - 1]! > 2000) taps.current = [];
    taps.current.push(now);
    const bpm = tapTempo(taps.current);
    if (bpm) src.setGrid?.({ bpm });
  }

  function play(): void {
    if (canPlay) src.start(); else onRequestStart?.();
  }
  function toggle(): void {
    if (src.state().playing) src.pause(); else if (canPlay || onRequestStart) play();
  }
  const step = (dir: 1 | -1, edge: boolean): void => {
    const r = src.state().region;
    if (edge) src.seek(dir < 0 ? (r?.start ?? 0) : (r?.end ?? dur));
    else src.seek(barStep(src.position(), barMs, dir, dur, off));
  };

  const typing = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  };
  /** Toetsen met focus in de rol. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || !file) return;
    if (e.code === 'Space') { if (!e.repeat) toggle(); }
    else if (e.key === 'ArrowLeft') step(-1, e.shiftKey);
    else if (e.key === 'ArrowRight') step(1, e.shiftKey);
    else if (e.key === 'Home') step(-1, true);
    else if (e.key === 'End') step(1, true);
    else return;
    e.preventDefault();
  }
  // keyScope 'window': spatie ook zonder focus, zolang de rol te zien is
  // (de editor houdt verborgen tabs gemount) en je niet typt.
  useEffect(() => {
    if (keyScope !== 'window') return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing(e.target) || !wrapRef.current || wrapRef.current.offsetParent === null || !src.parsed()) return;
      if (wrapRef.current.contains(e.target as Node)) return;   // dat doet onKeyDown al
      if (!src.state().playing && !canPlay && !onRequestStart) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

  // Zonder bestand: een lege plek met de juiste hoogte (geen verspringen).
  if (!file) return <div ref={wrapRef} className="mmbroll" style={{ width: '100%', minHeight: height ?? 0 }} />;

  const fmt = (ms: number): string => `${Math.floor(ms / 60_000)}:${((ms % 60_000) / 1000).toFixed(1).padStart(4, '0')}`;
  const tbtn: React.CSSProperties = {
    width: 34, height: 26, padding: 0, fontSize: 14, lineHeight: '24px', textAlign: 'center',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const bars = Math.max(1, Math.ceil((dur - off) / barMs));
  const ctlKinds = (['mod', 'at', 'bend', 'cc'] as const).filter((k) => ctl.some((c) => c.kind === k));
  const ctlLabel = (k: CtlKind): string => k === 'cc' ? ctl.filter((c) => c.kind === 'cc').map((c) => c.label).join(', ') : ctl.find((c) => c.kind === k)!.label;
  const summary = describeRoll(bars, spans.length, ctlKinds.map(ctlLabel)).replace(/^Pianorol/, label ?? 'Pianorol');
  return (
    <div ref={wrapRef} className="mmbroll" role="group" tabIndex={0} onKeyDown={onKeyDown}
      aria-label={`${label ?? 'Pianorol'}: spatie = afspelen/pauze, pijltjes = maat, Home/End = begin/einde`}
      style={{ width: '100%', marginTop: 6 }}>
      <style>{FOCUS_CSS}</style>
      <canvas ref={canvasRef} role="img" aria-label={summary} aria-describedby={hints ? hintId : undefined}
        style={{ width, height: H, display: 'block', borderRadius: height === undefined ? '4px 4px 0 0' : 4, cursor, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { if (inRegion(localX(e))) src.setRegion(null); }} />
      {height === undefined && (
        <div onPointerDown={gripDown} onPointerMove={gripMove} onPointerUp={gripUp} title="Sleep om de hoogte te veranderen"
          style={{ height: 6, background: pal.surface, borderRadius: '0 0 4px 4px', cursor: 'ns-resize', touchAction: 'none',
            display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 28, height: 2, borderRadius: 1, background: pal.line }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: pal.label, marginTop: 4, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <button type="button" style={tbtn} onClick={(e) => step(-1, e.shiftKey)} onDoubleClick={() => step(-1, true)}
            title="Eén maat terug (dubbelklik of Shift: naar het begin)" aria-label="Maat terug"><Icon kind="back" /></button>
          <button type="button" style={tbtn} onClick={toggle} disabled={!st.playing && !canPlay && !onRequestStart}
            aria-pressed={st.playing} aria-label="Afspelen"
            title={st.playing ? 'Pauze (spatie)' : canPlay ? 'Afspelen vanaf de afspeelkop (spatie)' : 'Starten en afspelen vanaf de afspeelkop'}>
            <Icon kind={st.playing ? 'pause' : 'play'} />
          </button>
          <button type="button" style={tbtn} onClick={() => src.rewind()} title="Stop en terug naar het begin (van het lusvenster)"
            disabled={!st.playing && st.posMs === (st.region?.start ?? 0)} aria-label="Stop"><Icon kind="stop" /></button>
          <button type="button" style={tbtn} onClick={(e) => step(1, e.shiftKey)} onDoubleClick={() => step(1, true)}
            title="Eén maat verder (dubbelklik of Shift: naar het einde)" aria-label="Maat verder"><Icon kind="fwd" /></button>
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }} aria-live="off">{fmt(st.posMs)} / {fmt(st.durationMs)}</span>
        {gridControls && src.setGrid && (
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
            title="Raster van de pianorol (alleen weergave, lusvenster en maat-stappen). Een sim-opname staat op 120; zet hier je eigen tempo.">
            <input type="number" min={20} max={400} step={0.1} value={Math.round(grid.bpm * 10) / 10}
              onChange={(e) => { const v = Number(e.target.value); if (v >= 20 && v <= 400) src.setGrid!({ bpm: v }); }}
              style={{ width: 58, fontSize: 11 }} aria-label="Tempo in BPM" /> BPM
            <button type="button" style={{ fontSize: 11 }} onClick={tap} title="Tik op de tel om het tempo te zetten">tap</button>
            <button type="button" style={{ fontSize: 11 }} onClick={() => src.setGrid!({ offsetMs: src.position() })}
              title="Leg tel 1 van het raster op de afspeelkop">tel 1 hier</button>
            {src.gridIsCustom?.() && (
              <button type="button" style={{ fontSize: 11 }} onClick={() => src.setGrid!(null)}
                title={`Terug naar het raster van het bestand (${Math.round(file.bpm * 10) / 10} BPM)`} aria-label="Raster terug naar het bestand">↺</button>
            )}
          </span>
        )}
        {!gridControls && <span>{Math.round(grid.bpm * 10) / 10} BPM</span>}
        {st.region
          ? <span style={{ color: pal.region }} title="Dubbelklik op het venster om het weg te halen">lus {fmt(st.region.start)}–{fmt(st.region.end)}</span>
          : hints ? <span id={hintId}>Sleep in de liniaal voor een lusvenster (klikt op tellen, Alt = vrij). Spatie = afspelen/pauze.</span> : null}
        {ctlKinds.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 8 }} title="Controller-laag onderin de rol">
            {ctlKinds.map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span aria-hidden="true" style={{ width: 10, height: 3, background: pal[k], display: 'inline-block', borderRadius: 1 }} />
                {ctlLabel(k)}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
