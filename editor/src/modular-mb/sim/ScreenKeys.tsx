// Schermtoetsenbord dat ook op een telefoon werkt (patch-front §6,
// spelermodus). Het toetsengebied is een eigen zone:
//   • `touch-action: none`: een scheve tik of een vinger die over de toetsen
//     glijdt schuift of zoomt de pagina niet;
//   • geen tekstselectie en geen lang-druk-menu (callout, contextmenu);
//   • pointer-events met capture op het hele klavier: per vinger (pointerId)
//     één noot; glijden naar een andere toets wisselt de noot (legato over
//     het klavier), loslaten of annuleren laat los; meerdere vingers tegelijk
//     zijn meerdere noten;
//   • aanslag uit de plek op de toets: laag op de toets is hard;
//   • schuiven na de aanslag: omhoog = aftertouch (per noot én kanaal), en
//     opzij = óf de noot wisselen (glijden, standaard) óf pitch bend
//     (`slide: 'bend'`: één toetsbreedte = het volle bereik); loslaten zet
//     bend en aftertouch terug.
// De component weet niets van de engine: hij roept de callbacks.

import { useRef, useState } from 'react';

import {
  KEY_H, WHEEL_W, WHEELS_W, aftertouchFor, bendFor, bendFromY, keyAt, keyLayout, layoutWidth, modFromY, velocityAt, wheelAt,
  type KeyRect, type Wheel,
} from './screenKeysLayout';

export type SlideMode = 'note' | 'bend';

export function ScreenKeys({
  octave, octaves = 2, onNoteOn, onNoteOff, onOctave, onAftertouch, onBend, onMod, slide = 'note', onSlide, maxWidth = 560, hint,
}: {
  octave: number; octaves?: number;
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onOctave?: (delta: number) => void;
  /** Omhoog schuiven na de aanslag, 0..127 per noot. */
  onAftertouch?: (midi: number, value: number) => void;
  /** Opzij schuiven in de bend-stand, en het pitchwiel: 14-bits (8192 = midden). */
  onBend?: (value14: number) => void;
  /** Het modwiel (CC 1), 0..127. Zonder deze callback zijn er geen wielen. */
  onMod?: (value: number) => void;
  /** Wat opzij schuiven doet: de noot wisselen of buigen. */
  slide?: SlideMode;
  onSlide?: (mode: SlideMode) => void;
  maxWidth?: number;
  /** Tekst rechts van de octaafknoppen (bv. de computertoetsen). */
  hint?: string;
}): JSX.Element {
  // Wielen links (alleen met onMod); de toetsen schuiven dan WHEELS_W op.
  const wheels = !!onMod;
  const off = wheels ? WHEELS_W : 0;
  const keys = keyLayout((octave + 1) * 12, octaves);
  const width = layoutWidth(keys) + off;
  const [bendPos, setBendPos] = useState(8192);
  const [modPos, setModPos] = useState(0);
  // pointerId → wiel dat deze vinger vasthoudt.
  const wheelHeld = useRef(new Map<number, Wheel>());
  const svgRef = useRef<SVGSVGElement>(null);
  // pointerId → noot en aanslagplek; en de ingedrukte noten voor de kleur.
  const held = useRef(new Map<number, { midi: number; x0: number; y0: number; at: number }>());
  const [down, setDown] = useState<Set<number>>(new Set());
  const heldNotes = () => new Set([...held.current.values()].map((h) => h.midi));

  function pointOf(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const sx = width / r.width, sy = KEY_H / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }
  function press(pointerId: number, k: KeyRect, x: number, y: number): void {
    const prev = held.current.get(pointerId);
    if (prev?.midi === k.midi) return;
    if (prev) release(pointerId);
    held.current.set(pointerId, { midi: k.midi, x0: x, y0: y, at: 0 });
    onNoteOn(k.midi, velocityAt(k, y));
    setDown(heldNotes());
  }
  function release(pointerId: number): void {
    const h = held.current.get(pointerId);
    if (!h) return;
    held.current.delete(pointerId);
    const still = heldNotes();
    // Alleen noteOff als geen andere vinger dezelfde noot nog vasthoudt.
    if (!still.has(h.midi)) {
      if (h.at > 0) onAftertouch?.(h.midi, 0);
      onNoteOff(h.midi);
    }
    if (held.current.size === 0 && slide === 'bend') onBend?.(8192);
    setDown(still);
  }
  /** Schuiven na de aanslag: omhoog = aftertouch, opzij = bend (in de bend-stand). */
  function slideTo(pointerId: number, x: number, y: number): void {
    const h = held.current.get(pointerId);
    if (!h) return;
    const at = aftertouchFor(y - h.y0);
    if (at !== h.at) { h.at = at; onAftertouch?.(h.midi, at); }
    if (slide === 'bend') onBend?.(bendFor(x - h.x0));
  }

  function wheelTo(w: Wheel, y: number): void {
    if (w === 'bend') { const v = bendFromY(y); setBendPos(v); onBend?.(v); }
    else { const v = modFromY(y); setModPos(v); onMod?.(v); }
  }
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pointOf(e);
    const w = wheels ? wheelAt(x, y) : null;
    if (w) { wheelHeld.current.set(e.pointerId, w); wheelTo(w, y); return; }
    const k = keyAt(keys, x - off, y);
    if (k) press(e.pointerId, k, x - off, y);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const { x, y } = pointOf(e);
    const w = wheelHeld.current.get(e.pointerId);
    if (w) { wheelTo(w, y); return; }
    if (!held.current.has(e.pointerId)) return;
    if (slide === 'note') {
      const k = keyAt(keys, x - off, y);
      if (k) press(e.pointerId, k, x - off, y);
    }
    slideTo(e.pointerId, x - off, y);
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>): void => {
    const w = wheelHeld.current.get(e.pointerId);
    if (w) {
      wheelHeld.current.delete(e.pointerId);
      // Het pitchwiel veert terug naar het midden; het modwiel blijft staan.
      if (w === 'bend') { setBendPos(8192); onBend?.(8192); }
      return;
    }
    release(e.pointerId);
  };

  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth }}>
      {onOctave && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onOctave(-1)} style={btn}>− octaaf</button>
          <span style={{ fontSize: 12 }}>octaaf {octave}</span>
          <button type="button" onClick={() => onOctave(1)} style={btn}>+ octaaf</button>
          {onSlide && (
            <label style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Wat opzij schuiven over de toetsen doet; omhoog schuiven is altijd aftertouch">
              opzij:
              <select value={slide} onChange={(e) => onSlide(e.target.value as SlideMode)} style={{ fontSize: 12 }}>
                <option value="note">noot wisselen</option>
                <option value="bend">buigen</option>
              </select>
            </label>
          )}
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
        {wheels && (
          <g pointerEvents="none">
            {/* Pitch bend: midden = rust; het blokje toont de stand. */}
            <rect x={2} y={0} width={WHEEL_W} height={KEY_H} rx={2} fill="#1f2937" stroke="#000" strokeWidth={0.8} />
            <line x1={2} y1={KEY_H / 2} x2={2 + WHEEL_W} y2={KEY_H / 2} stroke="#6b7280" strokeWidth={0.6} />
            <rect x={3} y={KEY_H / 2 - (bendPos - 8192) / 8191 * (KEY_H / 2 - 4) - 3} width={WHEEL_W - 2} height={6} rx={1} fill="#fbbf24" />
            <text x={2 + WHEEL_W / 2} y={KEY_H - 2} fontSize={5} textAnchor="middle" fill="#9ca3af">bend</text>
            {/* Modwiel: onder = 0. */}
            <rect x={2 + WHEEL_W + 4} y={0} width={WHEEL_W} height={KEY_H} rx={2} fill="#1f2937" stroke="#000" strokeWidth={0.8} />
            <rect x={2 + WHEEL_W + 4 + 1} y={KEY_H - 4 - (modPos / 127) * (KEY_H - 8) - 3} width={WHEEL_W - 2} height={6} rx={1} fill="#60a5fa" />
            <text x={2 + WHEEL_W + 4 + WHEEL_W / 2} y={KEY_H - 2} fontSize={5} textAnchor="middle" fill="#9ca3af">mod</text>
          </g>
        )}
        {keys.filter((k) => !k.black).map((k) => (
          <g key={k.midi} pointerEvents="none" transform={off ? `translate(${off} 0)` : undefined}>
            <rect x={k.x} y={k.y} width={k.w} height={k.h} rx={1.5}
              fill={down.has(k.midi) ? '#fde68a' : '#fafafa'} stroke="#1f2937" strokeWidth={0.8} />
            <text x={k.x + k.w / 2} y={k.h - 6} fontSize={9} textAnchor="middle" fill="#475569">
              {k.label}{k.label === 'C' ? Math.floor(k.midi / 12) - 1 : ''}
            </text>
          </g>
        ))}
        {keys.filter((k) => k.black).map((k) => (
          <rect key={k.midi} pointerEvents="none" x={k.x + off} y={k.y} width={k.w} height={k.h} rx={1.2}
            fill={down.has(k.midi) ? '#d97706' : '#1f2937'} stroke="#000" strokeWidth={0.8} />
        ))}
      </svg>
    </div>
  );
}

