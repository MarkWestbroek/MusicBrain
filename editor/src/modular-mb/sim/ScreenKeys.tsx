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

import { useRef, useState, type ReactNode } from 'react';

import {
  BEND_KEYS, KEY_H, KEY_H_TALL, KEY_W, WHEEL_W, WHEELS_W, aftertouchFor, bendFor, bendFromY, keyAt, keyLayout, layoutWidth, modFromY, velocityAt, wheelAt,
  type KeyRect, type Wheel,
} from './screenKeysLayout';

export type SlideMode = 'note' | 'bend';

export function ScreenKeys({
  octave, octaves = 2, onNoteOn, onNoteOff, onOctave, onAftertouch, onBend, onMod, onSustain, pedal, slide = 'note', onSlide,
  bendKeys = 1, onBendKeys, tall = false, onTall, onPanic, extra, maxWidth = 560, hint,
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
  /** Sustainpedaal (CC 64): tik = vast/los, vasthouden = tijdelijk. */
  onSustain?: (on: boolean) => void;
  /** Pedaalschuif (expressie/wah): het label zegt welk CC-nummer, 0..127. */
  pedal?: { label: string; onChange: (value: number) => void };
  /** Wat opzij schuiven doet: de noot wisselen of buigen. */
  slide?: SlideMode;
  onSlide?: (mode: SlideMode) => void;
  /** Hoeveel toetsbreedtes opzij het volle bendbereik is (bend-stand). */
  bendKeys?: number;
  onBendKeys?: (keys: number) => void;
  /** Lange toetsen: meer weg voor aanslag en aftertouch. */
  tall?: boolean;
  onTall?: (tall: boolean) => void;
  /** Panic: alle noten uit (de engine); het klavier laat zelf ook alles los. */
  onPanic?: () => void;
  /** Extra knoppen in de werkbalk (bv. volledig scherm). */
  extra?: ReactNode;
  maxWidth?: number;
  /** Eén regel onder de toetsen (bv. "Eerste aanslag start de simulator"). */
  hint?: string;
}): JSX.Element {
  // Wielen links (alleen met onMod); de toetsen schuiven dan WHEELS_W op.
  const wheels = !!onMod;
  const off = wheels ? WHEELS_W : 0;
  const h = tall ? KEY_H_TALL : KEY_H;
  const keys = keyLayout((octave + 1) * 12, octaves, KEY_W, h);
  const width = layoutWidth(keys) + off;
  const [bendPos, setBendPos] = useState(8192);
  const [modPos, setModPos] = useState(0);
  // Sustain: vast (tik) of tijdelijk (vasthouden); pedaalstand 0..127.
  const [sustain, setSustain] = useState(false);
  const sustainDownAt = useRef(0);
  const wasLatched = useRef(false);
  const [pedalPos, setPedalPos] = useState(0);
  const setSus = (on: boolean): void => { setSustain(on); onSustain?.(on); };
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
    const sx = width / r.width, sy = h / r.height;
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
    const hd = held.current.get(pointerId);
    if (!hd) return;
    const at = aftertouchFor(y - hd.y0, h);
    if (at !== hd.at) { hd.at = at; onAftertouch?.(hd.midi, at); }
    if (slide === 'bend') onBend?.(bendFor(x - hd.x0, bendKeys));
  }

  function wheelTo(w: Wheel, y: number): void {
    if (w === 'bend') { const v = bendFromY(y, h); setBendPos(v); onBend?.(v); }
    else { const v = modFromY(y, h); setModPos(v); onMod?.(v); }
  }
  /** Alles los: elke vinger vergeten, wielen terug, en de engine erbij. */
  function panic(): void {
    for (const id of [...held.current.keys()]) release(id);
    held.current.clear();
    wheelHeld.current.clear();
    setBendPos(8192); onBend?.(8192);
    setDown(new Set());
    onPanic?.();
  }
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pointOf(e);
    const w = wheels ? wheelAt(x, y, h) : null;
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

  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 8px', cursor: 'pointer' };
  const oct: React.CSSProperties = { ...btn, fontSize: 16, fontWeight: 700, padding: '2px 12px', lineHeight: 1.2 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth, WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}>
      {/* Werkbalk: octaaf links en rechts boven het klavier (de C-labels
          tonen het octaaf), daartussen pedalen en instellingen. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', touchAction: 'none' }}>
        {onOctave && <button type="button" onClick={() => onOctave(-1)} style={oct} title="Octaaf omlaag" aria-label="Octaaf omlaag">−</button>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          {onSustain && (
            <button type="button"
              title="Sustainpedaal (CC 64): tik = vast of los, vasthouden = tijdelijk"
              onPointerDown={(e) => {
                e.preventDefault();
                sustainDownAt.current = Date.now();
                wasLatched.current = sustain;
                if (!sustain) setSus(true);
              }}
              onPointerUp={() => {
                const quick = Date.now() - sustainDownAt.current < 250;
                // Korte tik: aan en vast; stond hij al vast, dan uit. Lang
                // vasthouden: tijdelijk, dus bij loslaten weer uit.
                if (quick) setSus(!wasLatched.current);
                else setSus(false);
              }}
              onPointerCancel={() => setSus(false)}
              onContextMenu={(e) => e.preventDefault()}
              style={{ ...btn, padding: '5px 10px', fontWeight: sustain ? 700 : 400, background: sustain ? '#fde68a' : undefined, userSelect: 'none' }}>
              {sustain ? '⏺ Sustain' : '○ Sustain'}
            </button>
          )}
          {pedal && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }} title={`Pedaalschuif (expressie/wah) op de eerste CC van de MIDI-IN: ${pedal.label}, stand ${pedalPos}`}>
              {pedal.label}
              <input type="range" min={0} max={127} value={pedalPos}
                onChange={(e) => { const v = Number(e.target.value); setPedalPos(v); pedal.onChange(v); }}
                style={{ width: 84 }} />
            </label>
          )}
          {onSlide && (
            <label style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Wat opzij schuiven over de toetsen doet; omhoog schuiven is altijd aftertouch">
              opzij:
              <select value={slide} onChange={(e) => onSlide(e.target.value as SlideMode)} style={{ fontSize: 12 }}>
                <option value="note">wisselen</option>
                <option value="bend">buigen</option>
              </select>
            </label>
          )}
          {onSlide && slide === 'bend' && onBendKeys && (
            <label style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Hoeveel toetsen opzij het volle bendbereik is; het bereik in halve tonen staat op de Bend-knop van de MIDI-IN">
              over
              <select value={bendKeys} onChange={(e) => onBendKeys(Number(e.target.value))} style={{ fontSize: 12 }}>
                {BEND_KEYS.map((k) => <option key={k} value={k}>{k} {k === 1 ? 'toets' : 'toetsen'}</option>)}
              </select>
            </label>
          )}
          {onTall && (
            <button type="button" onClick={() => onTall(!tall)} style={{ ...btn, fontWeight: tall ? 700 : 400, background: tall ? '#fde68a' : undefined }}
              title="Lange toetsen: meer weg voor aanslag (laag = hard) en aftertouch (omhoog schuiven)" aria-label="Lange toetsen">
              ⇕
            </button>
          )}
          {onPanic && (
            <button type="button" onClick={panic} style={btn} title="Panic: alle noten uit (ook een hangende)" aria-label="Alle noten uit">⏹</button>
          )}
          {extra}
        </div>
        {onOctave && <button type="button" onClick={() => onOctave(1)} style={oct} title="Octaaf omhoog" aria-label="Octaaf omhoog">+</button>}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${h}`}
        width="100%"
        style={{
          display: 'block', height: 'auto', aspectRatio: `${width} / ${h}`,
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          // iOS: geen "kopieer/zoek"-callout bij lang drukken op de toetsen.
          WebkitTouchCallout: 'none',
          // Android: geen tik-oplichting over het hele toetsenbord bij elke toets.
          WebkitTapHighlightColor: 'transparent',
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
        <title>Laag op de toets is hard; omhoog schuiven is aftertouch; opzij: noot wisselen of buigen</title>
        {wheels && (
          <g pointerEvents="none">
            {/* Pitch bend: midden = rust; het blokje toont de stand. */}
            <rect x={2} y={0} width={WHEEL_W} height={h} rx={2} fill="#1f2937" stroke="#000" strokeWidth={0.8} />
            <line x1={2} y1={h / 2} x2={2 + WHEEL_W} y2={h / 2} stroke="#6b7280" strokeWidth={0.6} />
            <rect x={3} y={h / 2 - (bendPos - 8192) / 8191 * (h / 2 - 4) - 3} width={WHEEL_W - 2} height={6} rx={1} fill="#fbbf24" />
            <text x={2 + WHEEL_W / 2} y={h - 2} fontSize={5} textAnchor="middle" fill="#9ca3af">bend</text>
            {/* Modwiel: onder = 0. */}
            <rect x={2 + WHEEL_W + 4} y={0} width={WHEEL_W} height={h} rx={2} fill="#1f2937" stroke="#000" strokeWidth={0.8} />
            <rect x={2 + WHEEL_W + 4 + 1} y={h - 4 - (modPos / 127) * (h - 8) - 3} width={WHEEL_W - 2} height={6} rx={1} fill="#60a5fa" />
            <text x={2 + WHEEL_W + 4 + WHEEL_W / 2} y={h - 2} fontSize={5} textAnchor="middle" fill="#9ca3af">mod</text>
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
      {hint && <div style={{ fontSize: 11, color: '#6b7280' }}>{hint}</div>}
    </div>
  );
}

