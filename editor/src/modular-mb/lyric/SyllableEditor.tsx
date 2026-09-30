// SyllableEditor — de golfvorm van één opname met de lettergreepgrenzen erop,
// te verslepen met de muis.
//
//   slepen aan een grens     verschuiven (buren binnen een woord delen hun grens)
//   dubbelklik in een vak    daar splitsen
//   shift-klik op een grens  de twee vakken samenvoegen
//   klik in een vak          dat stukje van de opname afspelen
//   groene balk onderin      de lus (klinkerkern); sleep aan een uiteinde
//
// De grenzen zijn `Span`s in frames van de opname. Dit bestand rekent alleen
// met die getallen (zie de functies onderaan, los te testen); de analyse
// gebeurt pas als de gebruiker loslaat.
import { useEffect, useRef, useState } from 'react';

import type { Span } from './analyze';

const HEIGHT = 96;
const GRAB_PX = 7;
/** Hoogte van de groene balk (de lus) onderin. */
const SUS_H = 12;

export interface SyllableEditorProps {
  mono: Float32Array;
  rate: number;
  spans: Span[];
  texts: string[];
  /** Klinkerkern per lettergreep, in frames van de opname (of null). */
  sustain?: ({ start: number; end: number } | null)[];
  onChange(spans: Span[]): void;
  /** De groene balk (lus) van lettergreep `index` is versleept: nieuwe grenzen in frames van de opname. */
  onSustainChange?(index: number, start: number, end: number): void;
  onPlay(start: number, end: number): void;
}

/** Een grens: welke span-randen hij verplaatst. */
export interface Edge { frame: number; endOf: number | null; startOf: number | null }

/** De versleepbare grenzen: gedeelde randen binnen een woord tellen één keer. */
export function edgesOf(spans: Span[]): Edge[] {
  const edges: Edge[] = [];
  spans.forEach((s, i) => {
    const prev = spans[i - 1];
    if (!prev || prev.end !== s.start) edges.push({ frame: s.start, endOf: null, startOf: i });
    const next = spans[i + 1];
    if (next && next.start === s.end) edges.push({ frame: s.end, endOf: i, startOf: i + 1 });
    else edges.push({ frame: s.end, endOf: i, startOf: null });
  });
  return edges;
}

/** Verplaats een grens, binnen zijn buren en met een minimale lengte. */
export function moveEdge(spans: Span[], edge: Edge, frame: number, minLen: number, total: number): Span[] {
  const out = spans.map((s) => ({ ...s }));
  let lo = 0, hi = total;
  if (edge.endOf !== null) lo = out[edge.endOf]!.start + minLen;
  else if (edge.startOf !== null && edge.startOf > 0) lo = out[edge.startOf - 1]!.end;
  if (edge.startOf !== null) hi = out[edge.startOf]!.end - minLen;
  else if (edge.endOf !== null && edge.endOf + 1 < out.length) hi = out[edge.endOf + 1]!.start;
  const f = Math.round(Math.max(lo, Math.min(hi, frame)));
  if (hi < lo) return out;
  if (edge.endOf !== null) out[edge.endOf]!.end = f;
  if (edge.startOf !== null) out[edge.startOf]!.start = f;
  return out;
}

/** Splits het vak waar `frame` in valt. */
export function splitAt(spans: Span[], frame: number, minLen: number): Span[] {
  const i = spans.findIndex((s) => frame > s.start + minLen && frame < s.end - minLen);
  if (i < 0) return spans;
  const s = spans[i]!;
  const f = Math.round(frame);
  return [...spans.slice(0, i), { start: s.start, end: f, wordEnd: false }, { start: f, end: s.end, wordEnd: s.wordEnd }, ...spans.slice(i + 1)];
}

/** Voeg de twee vakken aan weerszijden van een gedeelde grens samen. */
export function mergeAt(spans: Span[], edge: Edge): Span[] {
  if (edge.endOf === null || edge.startOf === null) return spans;
  const a = spans[edge.endOf]!, b = spans[edge.startOf]!;
  return [...spans.slice(0, edge.endOf), { start: a.start, end: b.end, wordEnd: b.wordEnd }, ...spans.slice(edge.startOf + 1)];
}

export function SyllableEditor(p: SyllableEditorProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(700);
  const [live, setLive] = useState<Span[] | null>(null);
  const [liveSus, setLiveSus] = useState<{ index: number; start: number; end: number } | null>(null);
  const drag = useRef<{ edge: Edge; moved: boolean } | null>(null);
  const susDrag = useRef<{ index: number; side: 'start' | 'end'; start: number; end: number; moved: boolean } | null>(null);
  const spans = live ?? p.spans;
  const total = p.mono.length;
  const minLen = Math.round(p.rate * 0.03);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = (): void => setWidth(Math.max(200, Math.floor(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toX = (frame: number): number => (frame / Math.max(1, total)) * width;
  const toFrame = (x: number): number => (x / Math.max(1, width)) * total;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr); c.height = Math.round(HEIGHT * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, width, HEIGHT);

    // vakken, om en om getint
    spans.forEach((s, i) => {
      g.fillStyle = i % 2 ? 'rgba(59,130,246,0.10)' : 'rgba(245,158,11,0.12)';
      g.fillRect(toX(s.start), 0, toX(s.end) - toX(s.start), HEIGHT);
      const sus = liveSus?.index === i ? liveSus : p.sustain?.[i];
      if (sus && !live) {
        g.fillStyle = 'rgba(16,185,129,0.35)';
        g.fillRect(toX(sus.start), HEIGHT - SUS_H, Math.max(1, toX(sus.end) - toX(sus.start)), SUS_H);
        g.fillStyle = '#059669';
        g.fillRect(Math.round(toX(sus.start)) - 1, HEIGHT - SUS_H, 3, SUS_H);
        g.fillRect(Math.round(toX(sus.end)) - 1, HEIGHT - SUS_H, 3, SUS_H);
      }
    });

    // golfvorm: min/max per kolom
    g.strokeStyle = '#334155';
    g.beginPath();
    const mid = HEIGHT / 2 - 4, amp = HEIGHT / 2 - 12;
    let peak = 1e-6;
    for (let i = 0; i < total; i += 16) { const a = Math.abs(p.mono[i]!); if (a > peak) peak = a; }
    for (let x = 0; x < width; x++) {
      const a = Math.floor(toFrame(x)), b = Math.max(a + 1, Math.floor(toFrame(x + 1)));
      let lo = 0, hi = 0;
      const step = Math.max(1, Math.floor((b - a) / 64));
      for (let i = a; i < b && i < total; i += step) { const v = p.mono[i]!; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.moveTo(x + 0.5, mid - (hi / peak) * amp);
      g.lineTo(x + 0.5, mid - (lo / peak) * amp + 1);
    }
    g.stroke();

    // grenzen en tekst
    g.font = '12px monospace';
    g.textBaseline = 'top';
    spans.forEach((s, i) => {
      g.fillStyle = '#0f172a';
      const label = p.texts[i] || `${i + 1}`;
      const x0 = toX(s.start) + 3;
      if (toX(s.end) - toX(s.start) > 14) g.fillText(label, x0, 3);
    });
    for (const e of edgesOf(spans)) {
      const x = Math.round(toX(e.frame)) + 0.5;
      g.strokeStyle = e.endOf !== null && e.startOf !== null ? '#dc2626' : '#64748b';
      g.lineWidth = e.endOf !== null && e.startOf !== null ? 2 : 1;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, HEIGHT); g.stroke();
    }
    g.lineWidth = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spans, p.mono, p.texts, p.sustain, width, live, liveSus]);

  const edgeNear = (x: number): Edge | null => {
    let best: Edge | null = null, dist = GRAB_PX + 1;
    for (const e of edgesOf(spans)) {
      const d = Math.abs(toX(e.frame) - x);
      if (d < dist) { dist = d; best = e; }
    }
    return best;
  };
  const xOf = (e: React.PointerEvent | React.MouseEvent): number =>
    e.clientX - (canvas.current?.getBoundingClientRect().left ?? 0);
  const yOf = (e: React.PointerEvent | React.MouseEvent): number =>
    e.clientY - (canvas.current?.getBoundingClientRect().top ?? 0);
  /** Een uiteinde van een groene balk onder de muis? */
  const susHandleNear = (x: number, y: number): { index: number; side: 'start' | 'end' } | null => {
    if (y < HEIGHT - SUS_H - GRAB_PX) return null;
    let best: { index: number; side: 'start' | 'end' } | null = null, dist = GRAB_PX + 1;
    (p.sustain ?? []).forEach((sus, i) => {
      if (!sus) return;
      for (const side of ['start', 'end'] as const) {
        const d = Math.abs(toX(sus[side]) - x);
        if (d < dist) { dist = d; best = { index: i, side }; }
      }
    });
    return best;
  };

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      <canvas ref={canvas}
        style={{ width, height: HEIGHT, display: 'block', borderRadius: 4, border: '1px solid #e2e8f0', touchAction: 'none', cursor: 'col-resize' }}
        title="Sleep een grens · dubbelklik = splitsen · shift-klik op een rode grens = samenvoegen · klik = afspelen · sleep de uiteinden van de groene balk = de lus"
        onPointerDown={(e) => {
          const h = p.onSustainChange ? susHandleNear(xOf(e), yOf(e)) : null;
          if (h) {
            const sus = p.sustain![h.index]!;
            susDrag.current = { ...h, start: sus.start, end: sus.end, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          const edge = edgeNear(xOf(e));
          if (!edge) return;
          if (e.shiftKey) { p.onChange(mergeAt(spans, edge)); return; }
          drag.current = { edge, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const sd = susDrag.current;
          if (sd) {
            const sp = spans[sd.index]!;
            const minLen = Math.round(p.rate * 0.02);
            let f = Math.round(Math.max(sp.start, Math.min(sp.end, toFrame(xOf(e)))));
            if (sd.side === 'start') f = Math.min(f, sd.end - minLen); else f = Math.max(f, sd.start + minLen);
            sd[sd.side] = f; sd.moved = true;
            setLiveSus({ index: sd.index, start: sd.start, end: sd.end });
            return;
          }
          const d = drag.current;
          if (!d) {
            e.currentTarget.style.cursor = (p.onSustainChange && susHandleNear(xOf(e), yOf(e))) ? 'ew-resize'
              : edgeNear(xOf(e)) ? 'col-resize' : 'pointer';
            return;
          }
          d.moved = true;
          const next = moveEdge(live ?? p.spans, d.edge, toFrame(xOf(e)), minLen, total);
          // de gesleepte grens opnieuw opzoeken: zijn frame is veranderd
          const f = d.edge.endOf !== null ? next[d.edge.endOf]!.end : next[d.edge.startOf!]!.start;
          d.edge = { ...d.edge, frame: f };
          setLive(next);
        }}
        onPointerUp={(e) => {
          const sd = susDrag.current;
          if (sd) {
            susDrag.current = null;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* al los */ }
            setLiveSus(null);
            if (sd.moved) p.onSustainChange?.(sd.index, sd.start, sd.end);
            return;
          }
          const d = drag.current;
          drag.current = null;
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* al los */ }
          if (d?.moved && live) { p.onChange(live); setLive(null); return; }
          setLive(null);
          if (d) return;                                   // klik óp een grens: niets afspelen
          const f = toFrame(xOf(e));
          const s = spans.find((sp) => f >= sp.start && f < sp.end);
          if (s) p.onPlay(s.start, s.end);
        }}
        onDoubleClick={(e) => { p.onChange(splitAt(spans, toFrame(xOf(e)), minLen)); }}
      />
    </div>
  );
}
