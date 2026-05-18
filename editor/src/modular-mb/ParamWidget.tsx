// Reusable MVC widget for editing a single numeric parameter.
//
// All three view modes (knob, slider, numeric) operate on the same
// `value`/`onChange` props — so a parameter living in
// `patch.moduleSettings[moduleId][paramId]` can be displayed/edited as
// any of these without state divergence.

import { useRef, type CSSProperties } from 'react';

export type KnobView = 'knob' | 'slider' | 'numeric' | 'toggle';

export interface ParamWidgetProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  view?: KnobView;
  /** Allow the user to switch between views on-the-fly. */
  switchable?: boolean;
  onChange: (v: number) => void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Map value→0..1 and back, respecting the param's range. */
const norm   = (v: number, lo: number, hi: number) => (v - lo) / (hi - lo || 1);
const denorm = (n: number, lo: number, hi: number) => lo + n * (hi - lo);

/** Rotary knob with drag-to-change. ~140 px of vertical drag = full range. */
function KnobView({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startVal = useRef(0);

  const n = clamp(norm(value, min, max), 0, 1);
  // Knob sweep: -135° (min) .. +135° (max), with 0 at top.
  const angle = -135 + n * 270;

  function onPointerDown(e: React.PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startVal.current = value;
  }
  function onPointerMove(e: React.PointerEvent): void {
    if (!(e.buttons & 1)) return;
    const dy = startY.current - e.clientY;            // up = positive
    const delta = (dy / 140) * (max - min);
    onChange(clamp(startVal.current + delta, min, max));
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      style={{
        width: 38, height: 38, borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 25%, #e5e7eb, #94a3b8)',
        border: '1px solid #475569',
        position: 'relative', cursor: 'ns-resize', touchAction: 'none',
        userSelect: 'none',
      }}
      title={`${value.toFixed(2)} (${min}…${max}) — drag verticaal`}
    >
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 2, height: 14, background: '#0f172a',
        transformOrigin: '50% 100%',
        transform: `translate(-50%, -100%) rotate(${angle}deg)`,
      }} />
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: 10, color: '#6b7280', textAlign: 'center',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

export function ParamWidget(props: ParamWidgetProps): JSX.Element {
  const { label, value, min, max, step = (max - min) / 100, unit, onChange } = props;
  const view = props.view ?? 'knob';

  const valStr = `${value.toFixed(Math.abs(max - min) < 2 ? 2 : 1)}${unit ? ' ' + unit : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 64 }}>
      {view === 'knob' && (
        <KnobView value={value} min={min} max={max} onChange={onChange} />
      )}
      {view === 'slider' && (
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      )}
      {view === 'numeric' && (
        <input
          type="number"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, min, max))}
          style={{ width: '100%', fontSize: 12, textAlign: 'center' }}
        />
      )}
      {view === 'toggle' && (
        <input
          type="checkbox"
          checked={value >= (min + max) / 2}
          onChange={(e) => onChange(e.target.checked ? max : min)}
        />
      )}
      <span style={labelStyle} title={`${label} = ${valStr}`}>{label}</span>
      {view === 'knob' && <span style={{ fontSize: 10, color: '#475569' }}>{valStr}</span>}
    </div>
  );
}

// Keep a stable export name for the silenced denorm helper so future
// dial / circular-slider views can use it without re-deriving the math.
export const _unused_denorm = denorm;
