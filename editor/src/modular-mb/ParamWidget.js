import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Reusable MVC widget for editing a single numeric parameter.
//
// All three view modes (knob, slider, numeric) operate on the same
// `value`/`onChange` props — so a parameter living in
// `patch.moduleSettings[moduleId][paramId]` can be displayed/edited as
// any of these without state divergence.
import { useRef } from 'react';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Map value→0..1 and back, respecting the param's range. */
const norm = (v, lo, hi) => (v - lo) / (hi - lo || 1);
const denorm = (n, lo, hi) => lo + n * (hi - lo);
/** Rotary knob with drag-to-change. ~140 px of vertical drag = full range. */
function KnobView({ value, min, max, onChange }) {
    const ref = useRef(null);
    const startY = useRef(0);
    const startVal = useRef(0);
    const n = clamp(norm(value, min, max), 0, 1);
    // Knob sweep: -135° (min) .. +135° (max), with 0 at top.
    const angle = -135 + n * 270;
    function onPointerDown(e) {
        e.target.setPointerCapture(e.pointerId);
        startY.current = e.clientY;
        startVal.current = value;
    }
    function onPointerMove(e) {
        if (!(e.buttons & 1))
            return;
        const dy = startY.current - e.clientY; // up = positive
        const delta = (dy / 140) * (max - min);
        onChange(clamp(startVal.current + delta, min, max));
    }
    return (_jsx("div", { ref: ref, onPointerDown: onPointerDown, onPointerMove: onPointerMove, style: {
            width: 38, height: 38, borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 25%, #e5e7eb, #94a3b8)',
            border: '1px solid #475569',
            position: 'relative', cursor: 'ns-resize', touchAction: 'none',
            userSelect: 'none',
        }, title: `${value.toFixed(2)} (${min}…${max}) — drag verticaal`, children: _jsx("div", { style: {
                position: 'absolute', left: '50%', top: '50%',
                width: 2, height: 14, background: '#0f172a',
                transformOrigin: '50% 100%',
                transform: `translate(-50%, -100%) rotate(${angle}deg)`,
            } }) }));
}
const labelStyle = {
    fontSize: 10, color: '#6b7280', textAlign: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
export function ParamWidget(props) {
    const { label, value, min, max, step = (max - min) / 100, unit, onChange } = props;
    const view = props.view ?? 'knob';
    const valStr = `${value.toFixed(Math.abs(max - min) < 2 ? 2 : 1)}${unit ? ' ' + unit : ''}`;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 64 }, children: [view === 'knob' && (_jsx(KnobView, { value: value, min: min, max: max, onChange: onChange })), view === 'slider' && (_jsx("input", { type: "range", min: min, max: max, step: step, value: value, onChange: (e) => onChange(parseFloat(e.target.value)), style: { width: '100%' } })), view === 'numeric' && (_jsx("input", { type: "number", min: min, max: max, step: step, value: value, onChange: (e) => onChange(clamp(parseFloat(e.target.value) || 0, min, max)), style: { width: '100%', fontSize: 12, textAlign: 'center' } })), view === 'toggle' && (_jsx("input", { type: "checkbox", checked: value >= (min + max) / 2, onChange: (e) => onChange(e.target.checked ? max : min) })), _jsx("span", { style: labelStyle, title: `${label} = ${valStr}`, children: label }), view === 'knob' && _jsx("span", { style: { fontSize: 10, color: '#475569' }, children: valStr })] }));
}
// Keep a stable export name for the silenced denorm helper so future
// dial / circular-slider views can use it without re-deriving the math.
export const _unused_denorm = denorm;
