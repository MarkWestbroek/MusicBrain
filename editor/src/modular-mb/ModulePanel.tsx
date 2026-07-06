// ModulePanel — schematic SVG rendering of a Module's front panel.
//
// Pure presentation. Reads:
//   • `module.visual`   — panel size, texture, decorations, placements
//   • resolved controls — knob/slider/switch/etc. definitions
//   • resolved ports    — jack definitions
//   • `controlState`    — current values per controlId (optional;
//                         falls back to each control's defaultValue)
//
// All coordinates are in millimetres; we convert to SVG user units 1:1 and
// rely on CSS `width`/`height` for actual display scaling.

import { useRef, useState } from 'react';
import {
  type ModuleInstance,
  type ModuleType,
  type Control,
  type ControlValue,
  type Port,
  MM_PER_HP,
  PANEL_HEIGHT_MM,
  SIGNAL_COLOUR,
  defaultValueOf,
  resolveControls,
  resolvePorts,
} from './types';

// ── Panel background ───────────────────────────────────────────────────

const TEXTURE_FILL: Record<string, string> = {
  'aluminum':  '#cbd0d4',
  'pcb-black': '#15171b',
  'mi-cream':  '#f5efe1',
  'gold-plate':'#d4b863',
  'wood':      '#6b4423',
};
const TEXTURE_TEXT: Record<string, string> = {
  'aluminum':  '#1f2937',
  'pcb-black': '#f3f4f6',
  'mi-cream':  '#222',
  'gold-plate':'#1a1300',
  'wood':      '#fff',
};

// ── Sizes per control "size" ───────────────────────────────────────────

const KNOB_R: Record<string, number> = { small: 3.2, medium: 5.5, large: 8.5 };
const JACK_R = 2.6;

// ──────────────────────────────────────────────────────────────────────────

export interface ModulePanelProps {
  module: ModuleInstance;
  types: ModuleType[];
  /** Optional live state (controlId → value). */
  controlState?: Record<string, ControlValue>;
  /** Called when a control value changes (omit for read-only). */
  onControlChange?: (controlId: string, value: ControlValue) => void;
  /** Called when a port is clicked (patching). */
  onPortClick?: (portId: string, port: Port) => void;
  /** Highlight ports currently being patched. */
  highlightedPortId?: string;
  /** Pixels per millimetre (default 3 → comfortable patcher zoom). */
  pxPerMm?: number;
  /** Show port labels (default true). */
  showPortLabels?: boolean;
  /** Controls that are inactive in the current context (e.g. `steal` in a
   *  monophonic patch). Rendered greyed-out and non-interactive. */
  disabledControlIds?: ReadonlySet<string>;
}

export function ModulePanel({
  module: mod,
  types,
  controlState,
  onControlChange,
  onPortClick,
  highlightedPortId,
  pxPerMm = 3,
  showPortLabels = true,
  disabledControlIds,
}: ModulePanelProps): JSX.Element {
  const visual   = mod.visual;
  const widthMm  = visual.hpWidth * MM_PER_HP;
  const heightMm = visual.heightMm ?? PANEL_HEIGHT_MM;
  const fill     = visual.baseColor ?? TEXTURE_FILL[visual.texture];
  const textCol  = TEXTURE_TEXT[visual.texture] ?? '#000';

  const controls = resolveControls(mod, types);
  const ports    = resolvePorts(mod, types);

  // Cell-group overlays (ED-CG-1): a `role:'multi'` module hosts N internal
  // cells (e.g. a quad-VCO). Draw a faint box + index label behind the ports
  // and controls of each cell so the repeated structure is legible ("inzoom"
  // op de cellen). Purely presentational — derived from the type's cellGroups.
  const type = types.find((t) => t.id === mod.typeId);
  const cellBoxes = computeCellBoxes(type, visual);

  return (
    <svg
      width={widthMm * pxPerMm}
      height={heightMm * pxPerMm}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Panel background */}
      <rect x={0} y={0} width={widthMm} height={heightMm}
        rx={1.2} ry={1.2}
        fill={fill} stroke="#222" strokeWidth={0.15} />

      {/* Mounting screws (corners) */}
      {[[3, 3], [widthMm - 3, 3], [3, heightMm - 3], [widthMm - 3, heightMm - 3]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.2} fill="#666" stroke="#333" strokeWidth={0.1} />
      ))}

      {/* Cell-group boxes (behind decorations/ports) */}
      {cellBoxes.map((b) => (
        <g key={`cell-${b.key}`}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={1.2}
            fill="#ffffff" fillOpacity={0.04}
            stroke={b.color} strokeOpacity={0.5} strokeWidth={0.25}
            strokeDasharray="1.2 1.0" />
          <text x={b.x + b.w / 2} y={b.y + 2.4} fontSize={1.7}
            fill={b.color} fillOpacity={0.85} textAnchor="middle" fontWeight={600}>
            {b.label}
          </text>
        </g>
      ))}

      {/* Decorations */}
      {(visual.decorations ?? []).map((d, i) => (
        <Decoration key={`dec-${i}`} dec={d} textCol={textCol} />
      ))}

      {/* Text labels */}
      {(visual.texts ?? []).map((t, i) => (
        <text key={`txt-${i}`} x={t.x} y={t.y}
          fontSize={t.fontSize ?? 2.4}
          fill={t.color ?? textCol}
          textAnchor={t.align ?? 'middle'}
          fontWeight={500}>
          {t.text}
        </text>
      ))}

      {/* Ports */}
      {ports.map((p) => {
        const pl = visual.portPlacements[p.id];
        if (!pl) return null;
        return (
          <PortGlyph
            key={`port-${p.id}`}
            port={p} x={pl.x} y={pl.y}
            labelPos={pl.labelPos ?? 'below'}
            showLabel={showPortLabels}
            highlighted={highlightedPortId === p.id}
            onClick={onPortClick ? () => onPortClick(p.id, p) : undefined}
            textCol={textCol}
          />
        );
      })}

      {/* Controls */}
      {controls.map((c) => {
        const cp = visual.controlPlacements[c.id];
        if (!cp) return null;
        const value = controlState?.[c.id] ?? defaultValueOf(c);
        const disabled = disabledControlIds?.has(c.id) ?? false;
        return (
          <g key={`ctl-${c.id}`}
            opacity={disabled ? 0.35 : 1}
            style={disabled ? { pointerEvents: 'none' } : undefined}>
            {disabled && <title>Niet actief in deze patch</title>}
            <ControlGlyph
              control={c}
              x={cp.x} y={cp.y}
              rotation={cp.rotation ?? 0}
              sizeOverride={cp.sizeOverride}
              value={value}
              controls={controls}
              controlState={controlState}
              onChange={!disabled && onControlChange ? (v) => onControlChange(c.id, v) : undefined}
              textCol={textCol}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Cell-group overlay geometry ────────────────────────────────────────

interface CellBox {
  key: string; label: string; color: string;
  x: number; y: number; w: number; h: number;
}

const CELL_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24',
                     '#f472b6', '#22d3ee', '#fb923c', '#4ade80'];

/** Build one box per cell of every `cellGroups` entry on the module type.
 *  `portIds`/`controlIds` on a CellGroup are BASE names (e.g. `"voct"`); the
 *  concrete placement keys append the 1-based cell index as `"voct_1"` or
 *  `"pan1"`. We try both spellings. Each box bounds that cell's placements
 *  with a little padding. Returns [] when the type has no cell-groups, so
 *  non-multi modules render exactly as before. */
function computeCellBoxes(
  type: ModuleType | undefined,
  visual: ModuleInstance['visual'],
): CellBox[] {
  const groups = type?.cellGroups;
  if (!groups || groups.length === 0) return [];

  const boxes: CellBox[] = [];
  const PAD = 1.4;          // breathing room beyond the glyph extents
  const LABEL_BELOW = 2.6;  // ports/knobs carry a label underneath

  // Resolve a base id (+cell index) to its placement AND glyph half-extents,
  // so the box wraps the *whole* jack/knob and its label — not just the centre
  // point (which made the dashed box look like it sat *inside* the cell).
  const placementOf = (
    base: string,
    cell: number,
  ): { x: number; y: number; rx: number; ry: number; below: number } | undefined => {
    for (const id of [`${base}_${cell}`, `${base}${cell}`, base]) {
      const pp = visual.portPlacements[id];
      if (pp) return { x: pp.x, y: pp.y, rx: JACK_R, ry: JACK_R, below: LABEL_BELOW };
      const cp = visual.controlPlacements[id];
      if (cp) {
        const ctl = type?.controls?.find((c) => c.id === id);
        const size = cp.sizeOverride ?? (ctl && 'size' in ctl ? ctl.size : undefined) ?? 'medium';
        const r = KNOB_R[size] ?? KNOB_R.medium!;
        return { x: cp.x, y: cp.y, rx: r, ry: r, below: LABEL_BELOW };
      }
    }
    return undefined;
  };

  groups.forEach((g, gi) => {
    const bases = [...g.portIds, ...g.controlIds, ...(g.displayIds ?? [])];
    for (let cell = 1; cell <= g.count; ++cell) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let any = false;
      for (const base of bases) {
        const pl = placementOf(base, cell);
        if (!pl) continue;
        any = true;
        minX = Math.min(minX, pl.x - pl.rx);
        maxX = Math.max(maxX, pl.x + pl.rx);
        minY = Math.min(minY, pl.y - pl.ry);
        maxY = Math.max(maxY, pl.y + pl.ry + pl.below);
      }
      if (!any) continue;
      minX -= PAD;
      maxX += PAD;
      minY -= PAD + 1.8; // extra room above for the cell label
      maxY += PAD;
      boxes.push({
        key: `${g.id}-${cell}`,
        label: `${cell}/${g.count}`,
        color: CELL_COLORS[gi % CELL_COLORS.length]!,
        x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      });
    }
  });

  return boxes;
}

// ── Decorations ────────────────────────────────────────────────────────

function Decoration({ dec, textCol }: { dec: import('./types').PanelDecoration; textCol: string }): JSX.Element | null {
  switch (dec.kind) {
    case 'rect':
      return <rect x={dec.x} y={dec.y} width={dec.w ?? 0} height={dec.h ?? 0}
        fill={dec.color ?? '#888'} opacity={0.85} rx={0.5} />;
    case 'line':
      return <line x1={dec.x} y1={dec.y} x2={dec.x2 ?? dec.x} y2={dec.y2 ?? dec.y}
        stroke={dec.color ?? '#444'} strokeWidth={0.3} />;
    case 'text':
      return <text x={dec.x} y={dec.y} fontSize={dec.fontSize ?? 2}
        fill={dec.color ?? textCol} textAnchor="middle">{dec.text}</text>;
    case 'tubeSlot':
      return (
        <g>
          <rect x={dec.x - (dec.w ?? 8) / 2} y={dec.y} width={dec.w ?? 8} height={dec.h ?? 30}
            fill="#0a0a0a" rx={2} stroke="#444" strokeWidth={0.2} />
          <ellipse cx={dec.x} cy={dec.y + (dec.h ?? 30) / 2}
            rx={(dec.w ?? 8) / 3} ry={(dec.h ?? 30) / 4}
            fill="#3a2d1a" opacity={0.6} />
        </g>
      );
    case 'ledMarker':
      return <circle cx={dec.x} cy={dec.y} r={0.8} fill={dec.color ?? '#22c55e'} />;
    case 'jackBlock':
      return <rect x={dec.x} y={dec.y} width={dec.w ?? 10} height={dec.h ?? 10}
        fill="#5b6470" rx={0.8} />;
  }
}

// ── Port glyph ─────────────────────────────────────────────────────────

function PortGlyph({
  port, x, y, labelPos, showLabel, highlighted, onClick, textCol,
}: {
  port: Port; x: number; y: number;
  labelPos: 'above' | 'below' | 'left' | 'right' | 'none';
  showLabel: boolean;
  highlighted: boolean;
  onClick?: () => void;
  textCol: string;
}): JSX.Element {
  const colour = SIGNAL_COLOUR[port.signalType];
  const label = port.name;
  const lx = labelPos === 'left'  ? x - JACK_R - 0.6
           : labelPos === 'right' ? x + JACK_R + 0.6
           : x;
  const ly = labelPos === 'above' ? y - JACK_R - 0.6
           : labelPos === 'below' ? y + JACK_R + 2.0
           : y + 0.6;
  const anchor: 'start' | 'middle' | 'end' =
    labelPos === 'left' ? 'end' :
    labelPos === 'right' ? 'start' : 'middle';
  return (
    <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      {/* outer ring (colour-coded by signal type) */}
      <circle cx={x} cy={y} r={JACK_R + 0.4} fill={colour} opacity={highlighted ? 1 : 0.85} />
      {/* socket body */}
      <circle cx={x} cy={y} r={JACK_R} fill="#1a1a1a" stroke="#000" strokeWidth={0.15} />
      {port.direction === 'out' ? (
        <>
          {/* OUTPUT: gevulde gekleurde plug-kop */}
          <circle cx={x} cy={y} r={JACK_R - 0.8} fill={colour} />
          <circle cx={x - 0.5} cy={y - 0.5} r={0.6} fill="rgba(255,255,255,0.55)" />
          {/* OUTPUT arrow: wijst naar BUITEN (rechts) → signaal verlaat de jack */}
          <polygon
            points={`${x + JACK_R - 0.2},${y - JACK_R - 1.4} ${x + JACK_R + 1.2},${y - JACK_R - 0.4} ${x + JACK_R - 0.2},${y - JACK_R + 0.4}`}
            fill={colour} stroke="#000" strokeWidth={0.1} />
        </>
      ) : (
        <>
          {/* INPUT: holle donkere socket met kleine cv-rand */}
          <circle cx={x} cy={y} r={JACK_R - 0.8} fill="#050505" />
          <circle cx={x} cy={y} r={JACK_R - 1.2} fill="none"
            stroke={colour} strokeWidth={0.25} opacity={0.6} />
          {/* INPUT arrow: LINKSboven, wijst naar BINNEN (tip rechts, naar de jack toe) */}
          <polygon
            points={`${x - JACK_R - 1.2},${y - JACK_R - 1.4} ${x - JACK_R + 0.2},${y - JACK_R - 0.5} ${x - JACK_R - 1.2},${y - JACK_R + 0.4}`}
            fill="none" stroke={colour} strokeWidth={0.3} />
        </>
      )}
      {showLabel && labelPos !== 'none' && (
        <text x={lx} y={ly} fontSize={1.6} fill={textCol} textAnchor={anchor}
          fontWeight={500}>{label}</text>
      )}
    </g>
  );
}

// ── Control glyphs ─────────────────────────────────────────────────────

function ControlGlyph(props: {
  control: Control; x: number; y: number; rotation: number;
  sizeOverride?: 'small' | 'medium' | 'large';
  value: ControlValue;
  controls?: Control[];
  controlState?: Record<string, ControlValue>;
  onChange?: (v: ControlValue) => void;
  textCol: string;
}): JSX.Element | null {
  const { control: c, x, y, rotation, sizeOverride, value, controls, controlState, onChange, textCol } = props;
  switch (c.kind) {
    case 'knob':
      return <KnobGlyph c={c} x={x} y={y} sizeOverride={sizeOverride}
        value={typeof value === 'number' ? value : c.defaultValue}
        onChange={onChange} textCol={textCol} />;
    case 'slider':
      return <SliderGlyph c={c} x={x} y={y} rotation={rotation}
        value={typeof value === 'number' ? value : c.defaultValue}
        onChange={onChange} textCol={textCol} />;
    case 'toggle':
      return <ToggleGlyph c={c} x={x} y={y}
        value={typeof value === 'boolean' ? value : c.defaultValue}
        onChange={onChange} textCol={textCol} />;
    case 'switch':
      return <SwitchGlyph c={c} x={x} y={y}
        value={typeof value === 'number' ? value : c.defaultIndex}
        onChange={onChange} textCol={textCol} />;
    case 'button':
      return <ButtonGlyph c={c} x={x} y={y}
        value={typeof value === 'boolean' ? value : (c.defaultValue ?? false)}
        onChange={onChange} textCol={textCol} />;
    case 'joystick':
      return <JoystickGlyph c={c} x={x} y={y}
        value={typeof value === 'object' && value !== null && 'x' in value ? value : c.defaultValue}
        onChange={onChange} textCol={textCol} />;
    case 'exotic':
      return <ExoticGlyph c={c} x={x} y={y}
        value={typeof value === 'number' ? value : c.defaultValue}
        textCol={textCol} />;
    case 'display':
      return <DisplayGlyph c={c} x={x} y={y}
        controls={controls} controlState={controlState}
        textCol={textCol} />;
    case 'led':
      return <LedGlyph c={c} x={x} y={y}
        controlState={controlState}
        textCol={textCol} />;
  }
}

// ── Knob ────────────────────────────────────────────────────────────────

function KnobGlyph({
  c, x, y, sizeOverride, value, onChange, textCol,
}: {
  c: import('./types').KnobControl;
  x: number; y: number;
  sizeOverride?: 'small' | 'medium' | 'large';
  value: number; onChange?: (v: number) => void;
  textCol: string;
}): JSX.Element {
  const size = sizeOverride ?? c.size ?? 'medium';
  const r = KNOB_R[size] ?? KNOB_R.medium!;
  const cap = c.color ?? capColourFor(c.style ?? 'generic');
  const ring = ringColourFor(c.style ?? 'generic');

  // Normalise value to 0..1 along the knob's domain
  const t = (value - c.min) / (c.max - c.min || 1);
  const tClamped = Math.max(0, Math.min(1, t));
  // Pointer sweep -135°..+135°
  const angle = (-135 + tClamped * 270) * Math.PI / 180;
  const px = x + Math.sin(angle) * (r - 0.6);
  const py = y - Math.cos(angle) * (r - 0.6);

  const dragState = useRef<{ startY: number; startVal: number } | null>(null);
  const [active, setActive] = useState(false);

  function onPointerDown(e: React.PointerEvent<SVGGElement>): void {
    if (!onChange) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startVal: value };
    setActive(true);
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>): void {
    if (!dragState.current || !onChange) return;
    const dy = dragState.current.startY - e.clientY;
    const fraction = dy / 120;     // 120 px ≈ full range
    const range = c.max - c.min;
    let next = clamp(dragState.current.startVal + fraction * range, c.min, c.max);
    // Click-detents: snap to multiples of ticks.every when defined.
    if (c.ticks?.every) {
      next = Math.round(next / c.ticks.every) * c.ticks.every;
      next = clamp(next, c.min, c.max);
    }
    // Quantisation step (e.g. integer CC-number pickers).
    if (c.step) {
      next = Math.round(next / c.step) * c.step;
      next = clamp(next, c.min, c.max);
    }
    onChange(next);
  }
  function onPointerUp(e: React.PointerEvent<SVGGElement>): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
    setActive(false);
  }

  return (
    <g style={{ cursor: onChange ? 'ns-resize' : 'default' }}
       onPointerDown={onPointerDown} onPointerMove={onPointerMove}
       onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {/* tick marks (rotary-stepper) */}
      {c.ticks ? <KnobTicks c={c} x={x} y={y} r={r} /> : null}
      {/* knurled skirt */}
      <circle cx={x} cy={y} r={r + 0.6} fill={ring} opacity={0.9} />
      {/* cap */}
      <circle cx={x} cy={y} r={r} fill={cap}
        stroke={active ? '#fff' : '#1a1a1a'} strokeWidth={active ? 0.4 : 0.2} />
      {/* pointer line */}
      <line x1={x} y1={y} x2={px} y2={py}
        stroke={pointerColourFor(c.style ?? 'generic', cap)}
        strokeWidth={Math.max(0.4, r * 0.16)} strokeLinecap="round" />
      {/* label below */}
      <text x={x} y={y + r + 2.2} fontSize={1.8} fill={textCol}
        textAnchor="middle" fontWeight={500}>{c.label}</text>
    </g>
  );
}

function KnobTicks({
  c, x, y, r,
}: {
  c: import('./types').KnobControl;
  x: number; y: number; r: number;
}): JSX.Element {
  const every = c.ticks?.every ?? 1;
  const highlight = new Set(c.ticks?.highlight ?? []);
  const range = c.max - c.min;
  if (range <= 0) return <g />;
  const marks: JSX.Element[] = [];
  // Outer ring radii.
  const r0 = r + 0.9;
  for (let v = c.min; v <= c.max + 1e-6; v += every) {
    const t = (v - c.min) / range;
    const a = (-135 + t * 270) * Math.PI / 180;
    const sx = x + Math.sin(a) * r0;
    const sy = y - Math.cos(a) * r0;
    const isBold = highlight.has(Math.round(v));
    const len = isBold ? 1.6 : 0.7;
    const ex = x + Math.sin(a) * (r0 + len);
    const ey = y - Math.cos(a) * (r0 + len);
    marks.push(
      <line key={v}
        x1={sx} y1={sy} x2={ex} y2={ey}
        stroke={isBold ? '#fbbf24' : '#475569'}
        strokeWidth={isBold ? 0.4 : 0.18}
        strokeLinecap="round" />
    );
    if (isBold) {
      marks.push(
        <text key={`l${v}`}
          x={x + Math.sin(a) * (r0 + len + 1.4)}
          y={y - Math.cos(a) * (r0 + len + 1.4) + 0.6}
          fontSize={1.3} fill="#fbbf24" textAnchor="middle" fontWeight={600}>
          {Math.round(v)}
        </text>
      );
    }
  }
  return <g>{marks}</g>;
}

function capColourFor(style: import('./types').KnobStyle): string {
  switch (style) {
    case 'mutable-large':  return '#ffffff';   // overridden via .color usually
    case 'mutable-small':  return '#1a1a1a';
    case 'davies-1900h':   return '#0a0a0a';
    case 'rogan-pointer':  return '#222';
    case 'bakelite-pointer':return '#1a1a1a';
    case 'thonk-d-shaft':  return '#2a2a2a';
    case 'tube':           return '#3a2d1a';
    default:               return '#262626';
  }
}
function ringColourFor(style: import('./types').KnobStyle): string {
  switch (style) {
    case 'mutable-large': return '#cfcfcf';
    case 'davies-1900h':  return '#555';
    default:              return '#3a3a3a';
  }
}
function pointerColourFor(style: import('./types').KnobStyle, cap: string): string {
  // Light pointer on dark cap, dark pointer on light cap.
  const isLight = /^#?[fF]/.test(cap) || cap === 'white' || /e[a-f0-9]/i.test(cap.slice(1, 3));
  return isLight ? '#222' : '#f3f4f6';
}

// ── Slider ──────────────────────────────────────────────────────────────

function SliderGlyph({
  c, x, y, rotation, value, onChange, textCol,
}: {
  c: import('./types').SliderControl;
  x: number; y: number; rotation: number;
  value: number; onChange?: (v: number) => void;
  textCol: string;
}): JSX.Element {
  const len = c.lengthMm ?? 18;
  const isV = c.orientation === 'v';
  const t = (value - c.min) / (c.max - c.min || 1);
  const tC = Math.max(0, Math.min(1, t));
  // Track centred on (x,y), runs along orientation
  const x1 = isV ? x : x - len / 2;
  const y1 = isV ? y - len / 2 : y;
  const x2 = isV ? x : x + len / 2;
  const y2 = isV ? y + len / 2 : y;
  const capX = isV ? x : x1 + tC * len;
  const capY = isV ? y2 - tC * len : y;

  const dragState = useRef<{ startY: number; startX: number; startVal: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<SVGGElement>): void {
    if (!onChange) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startX: e.clientX, startVal: value };
  }
  function onPointerMove(e: React.PointerEvent<SVGGElement>): void {
    if (!dragState.current || !onChange) return;
    const d = isV
      ? (dragState.current.startY - e.clientY)
      : (e.clientX - dragState.current.startX);
    const fraction = d / 100;
    const range = c.max - c.min;
    onChange(clamp(dragState.current.startVal + fraction * range, c.min, c.max));
  }
  function onPointerUp(e: React.PointerEvent<SVGGElement>): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  }

  return (
    <g transform={rotation ? `rotate(${rotation} ${x} ${y})` : undefined}
       style={{ cursor: onChange ? (isV ? 'ns-resize' : 'ew-resize') : 'default' }}
       onPointerDown={onPointerDown} onPointerMove={onPointerMove}
       onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#1a1a1a" strokeWidth={0.6} strokeLinecap="round" />
      <rect x={capX - 1.5} y={capY - 0.9} width={3} height={1.8}
        fill="#e5e7eb" stroke="#1a1a1a" strokeWidth={0.15} rx={0.3} />
      <text x={x} y={isV ? y2 + 2 : y + 3.6} fontSize={1.6}
        fill={textCol} textAnchor="middle">{c.label}</text>
    </g>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────

function ToggleGlyph({
  c, x, y, value, onChange, textCol,
}: {
  c: import('./types').ToggleControl;
  x: number; y: number;
  value: boolean; onChange?: (v: boolean) => void;
  textCol: string;
}): JSX.Element {
  return (
    <g style={{ cursor: onChange ? 'pointer' : 'default' }}
       onClick={() => onChange?.(!value)}>
      {/* Label boven het schakelaartje, zodat "up = on" visueel klopt
          (label staat aan de "aan"-kant). */}
      <text x={x} y={y - 4.4} fontSize={1.6} fill={textCol} textAnchor="middle">
        {c.label}
      </text>
      <rect x={x - 2} y={y - 3} width={4} height={6} fill="#2a2a2a" rx={0.6}
        stroke="#000" strokeWidth={0.15} />
      <rect x={x - 1.4} y={value ? y - 2.5 : y + 0.4} width={2.8} height={2.1}
        fill="#e5e7eb" rx={0.3} />
      {/* Statusletter rechts van het schakelaartje. */}
      <text x={x + 3.2} y={y + 0.7} fontSize={1.3} fill={value ? '#22c55e' : '#6b7280'}>
        {value ? 'on' : 'off'}
      </text>
    </g>
  );
}

// ── Switch (multi-position) ────────────────────────────────────────────

function SwitchGlyph({
  c, x, y, value, onChange, textCol,
}: {
  c: import('./types').SwitchControl;
  x: number; y: number;
  value: number; onChange?: (v: number) => void;
  textCol: string;
}): JSX.Element {
  const n = c.positions.length;
  const step = 4 / Math.max(1, n - 1);
  const idx = Math.max(0, Math.min(n - 1, value));
  return (
    <g style={{ cursor: onChange ? 'pointer' : 'default' }}
       onClick={() => onChange?.((idx + 1) % n)}>
      <rect x={x - 1.6} y={y - 3} width={3.2} height={6} fill="#2a2a2a" rx={0.5}
        stroke="#000" strokeWidth={0.15} />
      <rect x={x - 1.2} y={y - 3 + idx * step + 0.3} width={2.4} height={1.4}
        fill="#e5e7eb" rx={0.2} />
      {c.positions.map((p, i) => (
        <text key={i} x={x + 2.4} y={y - 2.4 + i * step + 1} fontSize={1.6}
          fill={textCol}>{p}</text>
      ))}
      <text x={x} y={y + 5.4} fontSize={1.5} fill={textCol} textAnchor="middle">{c.label}</text>
    </g>
  );
}

// ── Button ──────────────────────────────────────────────────────────────

function ButtonGlyph({
  c, x, y, value, onChange, textCol,
}: {
  c: import('./types').ButtonControl;
  x: number; y: number;
  value: boolean; onChange?: (v: boolean) => void;
  textCol: string;
}): JSX.Element {
  function handle(): void {
    if (!onChange) return;
    if (c.momentary) { onChange(true); setTimeout(() => onChange(false), 100); }
    else onChange(!value);
  }
  return (
    <g style={{ cursor: onChange ? 'pointer' : 'default' }} onClick={handle}>
      <circle cx={x} cy={y} r={2.2}
        fill={value ? '#fbbf24' : (c.style === 'led' ? '#1a1a1a' : '#4b5563')}
        stroke="#000" strokeWidth={0.2} />
      <text x={x} y={y + 4.4} fontSize={1.5} fill={textCol} textAnchor="middle">{c.label}</text>
    </g>
  );
}

// ── Joystick ────────────────────────────────────────────────────────────

function JoystickGlyph({
  c, x, y, value, onChange, textCol,
}: {
  c: import('./types').JoystickControl;
  x: number; y: number;
  value: { x: number; y: number };
  onChange?: (v: { x: number; y: number }) => void;
  textCol: string;
}): JSX.Element {
  const r = 4;
  const dotX = x + clamp(value.x, -1, 1) * r;
  const dotY = y - clamp(value.y, -1, 1) * r;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#1a1a1a" stroke="#000" strokeWidth={0.2} />
      <circle cx={dotX} cy={dotY} r={1} fill="#fbbf24"
        style={{ cursor: onChange ? 'pointer' : 'default' }} />
      <text x={x} y={y + r + 2.2} fontSize={1.5} fill={textCol} textAnchor="middle">{c.label}</text>
    </g>
  );
}

// ── Exotic ──────────────────────────────────────────────────────────────

function ExoticGlyph({
  c, x, y, textCol,
}: {
  c: import('./types').ExoticControl;
  x: number; y: number; value: number;
  textCol: string;
}): JSX.Element {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={6} height={6} fill="none"
        stroke="#9333ea" strokeDasharray="0.6 0.6" strokeWidth={0.3} />
      <text x={x} y={y + 0.6} fontSize={1.4} fill={textCol} textAnchor="middle">?</text>
      <text x={x} y={y + 5} fontSize={1.4} fill={textCol} textAnchor="middle">{c.label}</text>
    </g>
  );
}

// ── Display (read-only) ─────────────────────────────────────────────────

function DisplayGlyph({
  c, x, y, controls, controlState, textCol,
}: {
  c: import('./types').DisplayControl;
  x: number; y: number;
  controls?: Control[];
  controlState?: Record<string, ControlValue>;
  textCol: string;
}): JSX.Element {
  const style = c.style ?? 'led';
  // Resolve waarde
  let display = c.text ?? '';
  const numOf = (id?: string): number => {
    if (!id) return 0;
    const v = controlState?.[id];
    if (typeof v === 'number') return Math.round(v);
    const bound = controls?.find((x2) => x2.id === id);
    const dv = bound ? defaultValueOf(bound) : 0;
    return typeof dv === 'number' ? Math.round(dv) : 0;
  };
  if (c.lookup) {
    display = c.lookup[numOf(c.bindTo2)]?.[numOf(c.bindTo)] ?? c.text ?? '--';
  } else if (c.bindTo) {
    const v = controlState?.[c.bindTo];
    if (v === undefined) {
      // Probeer default uit de gekoppelde control op te halen.
      const bound = controls?.find((x2) => x2.id === c.bindTo);
      const dv = bound ? defaultValueOf(bound) : undefined;
      display = formatDisplay(dv, c.format);
    } else {
      display = formatDisplay(v, c.format);
    }
  }
  // Pad/cap naar `digits` tekens (lookup-tekst links uitgelijnd).
  const text = display.length > c.digits
    ? display.slice(0, c.digits)
    : c.lookup ? display.padEnd(c.digits, ' ')
               : display.padStart(c.digits, ' ');

  const sizeKey = c.size ?? 'medium';
  const charW = sizeKey === 'large' ? 3.4 : sizeKey === 'small' ? 1.4 : 2.0;
  const fontSize = sizeKey === 'large' ? 4.6 : sizeKey === 'small' ? 2.0 : 2.8;
  const h = sizeKey === 'large' ? 7.2 : sizeKey === 'small' ? 3.2 : 4.4;
  const labelOffset = sizeKey === 'large' ? 1.2 : 0.8;
  const yText = sizeKey === 'large' ? y + 2.0 : sizeKey === 'small' ? y + 1.0 : y + 1.3;
  const w = c.digits * charW + 2.0;
  const bg = style === 'oled' ? '#0a1424' : style === 'led-green' ? '#06140a' : '#1a0a0a';
  const fg = style === 'oled' ? '#67e8f9' : style === 'led-green' ? '#4ade80' : '#f87171';
  return (
    <g>
      {c.label && (
        <text x={x} y={y - h / 2 - labelOffset} fontSize={1.4} fill={textCol} textAnchor="middle">
          {c.label}
        </text>
      )}
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={0.6}
        fill={bg} stroke="#000" strokeWidth={0.25} />
      <text x={x} y={yText} fontSize={fontSize} fill={fg}
        textAnchor="middle" fontFamily="ui-monospace, monospace"
        style={{ letterSpacing: '0.08em' }}>
        {text}
      </text>
    </g>
  );
}

function formatDisplay(v: ControlValue | undefined, fmt?: import('./types').DisplayControl['format']): string {
  if (v === undefined || v === null) return '--';
  if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
  if (typeof v === 'object') return '...';
  // numeric
  switch (fmt) {
    case 'int':    return String(Math.round(v));
    case 'float1': return v.toFixed(1);
    case 'float2': return v.toFixed(2);
    case 'midi':   return String(Math.round(v));
    case 'onoff':  return v > 0 ? 'ON' : 'OFF';
    default:       return String(Math.round(v));
  }
}

// ── LED (read-only indicator) ───────────────────────────────────────────

function LedGlyph({
  c, x, y, controlState, textCol,
}: {
  c: import('./types').LedControl;
  x: number; y: number;
  controlState?: Record<string, ControlValue>;
  textCol: string;
}): JSX.Element {
  const sizeR = c.size === 'large' ? 1.6 : c.size === 'small' ? 0.7 : 1.1;
  const colour = c.color ?? '#22c55e';
  let on = true;
  if (c.bindTo) {
    const v = controlState?.[c.bindTo];
    if (c.bindMatch !== undefined) {
      on = typeof v === 'number' && v === c.bindMatch;
    } else {
      on = typeof v === 'boolean' ? v : typeof v === 'number' ? v > 0 : false;
    }
  }
  return (
    <g>
      <circle cx={x} cy={y} r={sizeR + 0.4} fill="#0a0a0a" />
      <circle cx={x} cy={y} r={sizeR} fill={on ? colour : '#333'}
        style={on ? { filter: `drop-shadow(0 0 ${sizeR * 1.4}px ${colour})` } : undefined} />
      {c.label && (
        <text x={x} y={y + sizeR + 2.4} fontSize={1.2} fill={textCol} textAnchor="middle">
          {c.label}
        </text>
      )}
    </g>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
