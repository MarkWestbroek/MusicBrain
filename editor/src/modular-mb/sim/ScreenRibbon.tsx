// Lint als alternatief voor het schermtoetsenbord (Trautonium-draad): de
// plek van de vinger is een traploze toonhoogte, de hoogte op het lint (of
// echte druk van een pen of drukgevoelig scherm) is de druk. Monofoon zoals
// één manuaal: de laatst neergezette vinger speelt; tilt die op terwijl een
// andere nog ligt, dan neemt die het over (legato).
//
// Naar buiten gaan gewone MIDI-gebeurtenissen (ankernoot + pitch bend +
// aftertouch), via dezelfde callbacks als ScreenKeys; zie ribbonLayout.ts.
// Touch-regels als het klavier: `touch-action: none`, pointer-capture, geen
// tekstselectie, callout of tik-oplichting.

import { useEffect, useRef, useState } from 'react';

import { RIBBON_H, RIBBON_H_TALL, RIBBON_SEMI, RibbonPlayer, ribbonWidth } from './ribbonLayout';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function ScreenRibbon({
  startMidi, octaves = 2, tall = false, bendRange, snap, onNoteOn, onNoteOff, onBend, onAftertouch,
}: {
  startMidi: number; octaves?: number; tall?: boolean;
  /** Bendbereik van de ontvanger in halve tonen (moet gelijk zijn aan MIDI-IN `bendRange`). */
  bendRange: number;
  /** 0 = traploos, 1 = vaste halve tonen. */
  snap: number;
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onBend?: (value14: number) => void;
  onAftertouch?: (midi: number, value: number) => void;
}): JSX.Element {
  const h = tall ? RIBBON_H_TALL : RIBBON_H;
  const width = ribbonWidth(octaves);
  const svgRef = useRef<SVGSVGElement>(null);
  // De logica zit in RibbonPlayer (testbaar); props via refs, zodat een
  // wijziging van bereik of aantrekken meteen geldt zonder nieuwe speler.
  const props = useRef({ startMidi, octaves, h, bendRange, snap, onNoteOn, onNoteOff, onBend, onAftertouch });
  props.current = { startMidi, octaves, h, bendRange, snap, onNoteOn, onNoteOff, onBend, onAftertouch };
  const player = useRef<RibbonPlayer | null>(null);
  player.current ??= new RibbonPlayer(() => props.current, () => props.current);
  const [marker, setMarker] = useState<{ x: number; press: number } | null>(null);
  // Weg (andere stand, andere pagina): niets laten hangen.
  useEffect(() => () => player.current?.release(), []);

  function pointOf(e: React.PointerEvent): { x: number; y: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (width / r.width), y: (e.clientY - r.top) * (h / r.height) };
  }
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pointOf(e);
    player.current!.down(e.pointerId, x, y, e.pressure);
    setMarker(player.current!.marker());
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const { x, y } = pointOf(e);
    player.current!.move(e.pointerId, x, y, e.pressure);
    setMarker(player.current!.marker());
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>): void => {
    player.current!.up(e.pointerId);
    setMarker(player.current!.marker());
  };

  const ticks = Array.from({ length: octaves * 12 + 1 }, (_, i) => startMidi + i);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${h}`}
      width="100%"
      style={{
        display: 'block', height: 'auto', aspectRatio: `${width} / ${h}`,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', cursor: 'crosshair',
      } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      aria-label="Lint"
    >
      <title>Lint: de plek is de toonhoogte (traploos), laag op het lint is hard (druk)</title>
      <rect x={0} y={0} width={width} height={h} rx={3} fill="#2b2118" stroke="#000" strokeWidth={0.8} pointerEvents="none" />
      {/* De draad over de plaat. */}
      <line x1={2} y1={h * 0.5} x2={width - 2} y2={h * 0.5} stroke="#b8a27a" strokeWidth={1.2} pointerEvents="none" />
      {ticks.map((midi, i) => {
        const x = (i + 0.5) * RIBBON_SEMI;
        const n = midi % 12;
        const black = [1, 3, 6, 8, 10].includes(n);
        const c = n === 0;
        return (
          <g key={midi} pointerEvents="none">
            {black && <rect x={x - RIBBON_SEMI / 2} y={0} width={RIBBON_SEMI} height={h * 0.18} fill="#1a140e" />}
            <line x1={x} y1={0} x2={x} y2={c ? h : h * 0.18} stroke={c ? '#d6c4a0' : '#6b5a44'} strokeWidth={c ? 0.9 : 0.5} />
            {c && <text x={x + 1.5} y={h - 4} fontSize={7} fill="#d6c4a0">{NAMES[n]}{Math.floor(midi / 12) - 1}</text>}
          </g>
        );
      })}
      {marker && (
        <g pointerEvents="none">
          <line x1={marker.x} y1={0} x2={marker.x} y2={h} stroke="#fbbf24" strokeWidth={1.2} />
          <circle cx={marker.x} cy={h * 0.5} r={2 + 4 * marker.press / 127} fill="#fbbf24" fillOpacity={0.8} />
        </g>
      )}
    </svg>
  );
}
