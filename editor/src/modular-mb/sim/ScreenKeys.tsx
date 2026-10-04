// Schermtoetsenbord dat ook op een telefoon werkt (patch-front §6,
// spelermodus). Het toetsengebied is een eigen zone:
//   • `touch-action: none`: een scheve tik of een vinger die over de toetsen
//     glijdt schuift of zoomt de pagina niet;
//   • geen tekstselectie en geen lang-druk-menu (callout, contextmenu);
//   • pointer-events met capture op het hele klavier: per vinger (pointerId)
//     één noot; glijden naar een andere toets wisselt de noot (legato over
//     het klavier), loslaten of annuleren laat los; meerdere vingers tegelijk
//     zijn meerdere noten;
//   • aanslag uit de plek op de toets: laag op de toets is hard.
// De component weet niets van de engine: hij roept onNoteOn/onNoteOff.

import { useRef, useState } from 'react';

import { KEY_H, KEY_W, keyAt, keyLayout, layoutWidth, velocityAt, type KeyRect } from './screenKeysLayout';

export function ScreenKeys({ octave, octaves = 2, onNoteOn, onNoteOff, onOctave, maxWidth = 560, hint }: {
  octave: number; octaves?: number;
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onOctave?: (delta: number) => void;
  maxWidth?: number;
  /** Tekst rechts van de octaafknoppen (bv. de computertoetsen). */
  hint?: string;
}): JSX.Element {
  const keys = keyLayout((octave + 1) * 12, octaves);
  const width = layoutWidth(keys);
  const svgRef = useRef<SVGSVGElement>(null);
  // pointerId → midi; en de ingedrukte noten voor de kleur.
  const held = useRef(new Map<number, number>());
  const [down, setDown] = useState<Set<number>>(new Set());

  function pointOf(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = width / r.width, sy = KEY_H / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }
  function press(pointerId: number, k: KeyRect, y: number): void {
    const prev = held.current.get(pointerId);
    if (prev === k.midi) return;
    if (prev !== undefined) release(pointerId);
    held.current.set(pointerId, k.midi);
    onNoteOn(k.midi, velocityAt(k, y));
    setDown(new Set(held.current.values()));
  }
  function release(pointerId: number): void {
    const midi = held.current.get(pointerId);
    if (midi === undefined) return;
    held.current.delete(pointerId);
    // Alleen noteOff als geen andere vinger dezelfde noot nog vasthoudt.
    if (![...held.current.values()].includes(midi)) onNoteOff(midi);
    setDown(new Set(held.current.values()));
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pointOf(e);
    const k = keyAt(keys, x, y);
    if (k) press(e.pointerId, k, y);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!held.current.has(e.pointerId)) return;
    const { x, y } = pointOf(e);
    const k = keyAt(keys, x, y);
    if (k) press(e.pointerId, k, y);
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>): void => { release(e.pointerId); };

  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth }}>
      {onOctave && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onOctave(-1)} style={btn}>− octaaf</button>
          <span style={{ fontSize: 12 }}>octaaf {octave}</span>
          <button type="button" onClick={() => onOctave(1)} style={btn}>+ octaaf</button>
          {hint && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>{hint}</span>}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${KEY_H}`}
        width="100%"
        style={{
          display: 'block', height: 'auto', aspectRatio: `${width} / ${KEY_H}`,
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          // iOS: geen "kopieer/zoek"-callout bij lang drukken op de toetsen.
          WebkitTouchCallout: 'none',
          cursor: 'pointer',
        } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        aria-label="Toetsenbord"
      >
        {keys.filter((k) => !k.black).map((k) => (
          <g key={k.midi} pointerEvents="none">
            <rect x={k.x} y={k.y} width={k.w} height={k.h} rx={1.5}
              fill={down.has(k.midi) ? '#fde68a' : '#fafafa'} stroke="#1f2937" strokeWidth={0.8} />
            <text x={k.x + k.w / 2} y={k.h - 6} fontSize={9} textAnchor="middle" fill="#475569">
              {k.label}{k.label === 'C' ? Math.floor(k.midi / 12) - 1 : ''}
            </text>
          </g>
        ))}
        {keys.filter((k) => k.black).map((k) => (
          <rect key={k.midi} pointerEvents="none" x={k.x} y={k.y} width={k.w} height={k.h} rx={1.2}
            fill={down.has(k.midi) ? '#d97706' : '#1f2937'} stroke="#000" strokeWidth={0.8} />
        ))}
      </svg>
    </div>
  );
}

export { KEY_W as SCREEN_KEY_W };
