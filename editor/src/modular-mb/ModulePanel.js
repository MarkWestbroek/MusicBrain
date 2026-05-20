import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { MM_PER_HP, PANEL_HEIGHT_MM, SIGNAL_COLOUR, defaultValueOf, resolveControls, resolvePorts, } from './types';
// ── Panel background ───────────────────────────────────────────────────
const TEXTURE_FILL = {
    'aluminum': '#cbd0d4',
    'pcb-black': '#15171b',
    'mi-cream': '#f5efe1',
    'gold-plate': '#d4b863',
    'wood': '#6b4423',
};
const TEXTURE_TEXT = {
    'aluminum': '#1f2937',
    'pcb-black': '#f3f4f6',
    'mi-cream': '#222',
    'gold-plate': '#1a1300',
    'wood': '#fff',
};
// ── Sizes per control "size" ───────────────────────────────────────────
const KNOB_R = { small: 3.2, medium: 5.5, large: 8.5 };
const JACK_R = 2.6;
export function ModulePanel({ module: mod, types, controlState, onControlChange, onPortClick, highlightedPortId, pxPerMm = 3, showPortLabels = true, }) {
    const visual = mod.visual;
    const widthMm = visual.hpWidth * MM_PER_HP;
    const heightMm = visual.heightMm ?? PANEL_HEIGHT_MM;
    const fill = visual.baseColor ?? TEXTURE_FILL[visual.texture];
    const textCol = TEXTURE_TEXT[visual.texture] ?? '#000';
    const controls = resolveControls(mod, types);
    const ports = resolvePorts(mod, types);
    return (_jsxs("svg", { width: widthMm * pxPerMm, height: heightMm * pxPerMm, viewBox: `0 0 ${widthMm} ${heightMm}`, style: { display: 'block', fontFamily: 'system-ui, sans-serif' }, children: [_jsx("rect", { x: 0, y: 0, width: widthMm, height: heightMm, rx: 1.2, ry: 1.2, fill: fill, stroke: "#222", strokeWidth: 0.15 }), [[3, 3], [widthMm - 3, 3], [3, heightMm - 3], [widthMm - 3, heightMm - 3]].map(([x, y], i) => (_jsx("circle", { cx: x, cy: y, r: 1.2, fill: "#666", stroke: "#333", strokeWidth: 0.1 }, i))), (visual.decorations ?? []).map((d, i) => (_jsx(Decoration, { dec: d, textCol: textCol }, `dec-${i}`))), (visual.texts ?? []).map((t, i) => (_jsx("text", { x: t.x, y: t.y, fontSize: t.fontSize ?? 2.4, fill: t.color ?? textCol, textAnchor: t.align ?? 'middle', fontWeight: 500, children: t.text }, `txt-${i}`))), ports.map((p) => {
                const pl = visual.portPlacements[p.id];
                if (!pl)
                    return null;
                return (_jsx(PortGlyph, { port: p, x: pl.x, y: pl.y, labelPos: pl.labelPos ?? 'below', showLabel: showPortLabels, highlighted: highlightedPortId === p.id, onClick: onPortClick ? () => onPortClick(p.id, p) : undefined, textCol: textCol }, `port-${p.id}`));
            }), controls.map((c) => {
                const cp = visual.controlPlacements[c.id];
                if (!cp)
                    return null;
                const value = controlState?.[c.id] ?? defaultValueOf(c);
                return (_jsx(ControlGlyph, { control: c, x: cp.x, y: cp.y, rotation: cp.rotation ?? 0, sizeOverride: cp.sizeOverride, value: value, onChange: onControlChange ? (v) => onControlChange(c.id, v) : undefined, textCol: textCol }, `ctl-${c.id}`));
            })] }));
}
// ── Decorations ────────────────────────────────────────────────────────
function Decoration({ dec, textCol }) {
    switch (dec.kind) {
        case 'rect':
            return _jsx("rect", { x: dec.x, y: dec.y, width: dec.w ?? 0, height: dec.h ?? 0, fill: dec.color ?? '#888', opacity: 0.85, rx: 0.5 });
        case 'line':
            return _jsx("line", { x1: dec.x, y1: dec.y, x2: dec.x2 ?? dec.x, y2: dec.y2 ?? dec.y, stroke: dec.color ?? '#444', strokeWidth: 0.3 });
        case 'text':
            return _jsx("text", { x: dec.x, y: dec.y, fontSize: dec.fontSize ?? 2, fill: dec.color ?? textCol, textAnchor: "middle", children: dec.text });
        case 'tubeSlot':
            return (_jsxs("g", { children: [_jsx("rect", { x: dec.x - (dec.w ?? 8) / 2, y: dec.y, width: dec.w ?? 8, height: dec.h ?? 30, fill: "#0a0a0a", rx: 2, stroke: "#444", strokeWidth: 0.2 }), _jsx("ellipse", { cx: dec.x, cy: dec.y + (dec.h ?? 30) / 2, rx: (dec.w ?? 8) / 3, ry: (dec.h ?? 30) / 4, fill: "#3a2d1a", opacity: 0.6 })] }));
        case 'ledMarker':
            return _jsx("circle", { cx: dec.x, cy: dec.y, r: 0.8, fill: dec.color ?? '#22c55e' });
        case 'jackBlock':
            return _jsx("rect", { x: dec.x, y: dec.y, width: dec.w ?? 10, height: dec.h ?? 10, fill: "#5b6470", rx: 0.8 });
    }
}
// ── Port glyph ─────────────────────────────────────────────────────────
function PortGlyph({ port, x, y, labelPos, showLabel, highlighted, onClick, textCol, }) {
    const colour = SIGNAL_COLOUR[port.signalType];
    const label = port.name;
    const lx = labelPos === 'left' ? x - JACK_R - 0.6
        : labelPos === 'right' ? x + JACK_R + 0.6
            : x;
    const ly = labelPos === 'above' ? y - JACK_R - 0.6
        : labelPos === 'below' ? y + JACK_R + 2.0
            : y + 0.6;
    const anchor = labelPos === 'left' ? 'end' :
        labelPos === 'right' ? 'start' : 'middle';
    return (_jsxs("g", { style: { cursor: onClick ? 'pointer' : 'default' }, onClick: onClick, children: [_jsx("circle", { cx: x, cy: y, r: JACK_R + 0.4, fill: colour, opacity: highlighted ? 1 : 0.85 }), _jsx("circle", { cx: x, cy: y, r: JACK_R, fill: "#1a1a1a", stroke: "#000", strokeWidth: 0.15 }), port.direction === 'out' ? (_jsxs(_Fragment, { children: [_jsx("circle", { cx: x, cy: y, r: JACK_R - 0.8, fill: colour }), _jsx("circle", { cx: x - 0.5, cy: y - 0.5, r: 0.6, fill: "rgba(255,255,255,0.55)" }), _jsx("polygon", { points: `${x + JACK_R - 0.2},${y - JACK_R - 0.4} ${x + JACK_R + 1.2},${y - JACK_R - 1.4} ${x + JACK_R + 1.2},${y - JACK_R + 0.4}`, fill: colour, stroke: "#000", strokeWidth: 0.1 })] })) : (_jsxs(_Fragment, { children: [_jsx("circle", { cx: x, cy: y, r: JACK_R - 0.8, fill: "#050505" }), _jsx("circle", { cx: x, cy: y, r: JACK_R - 1.2, fill: "none", stroke: colour, strokeWidth: 0.25, opacity: 0.6 }), _jsx("polygon", { points: `${x + JACK_R - 0.2},${y - JACK_R - 1.4} ${x + JACK_R + 1.2},${y - JACK_R - 0.4} ${x + JACK_R - 0.2},${y - JACK_R + 0.4}`, fill: "none", stroke: colour, strokeWidth: 0.3 })] })), showLabel && labelPos !== 'none' && (_jsx("text", { x: lx, y: ly, fontSize: 1.6, fill: textCol, textAnchor: anchor, fontWeight: 500, children: label }))] }));
}
// ── Control glyphs ─────────────────────────────────────────────────────
function ControlGlyph(props) {
    const { control: c, x, y, rotation, sizeOverride, value, onChange, textCol } = props;
    switch (c.kind) {
        case 'knob':
            return _jsx(KnobGlyph, { c: c, x: x, y: y, sizeOverride: sizeOverride, value: typeof value === 'number' ? value : c.defaultValue, onChange: onChange, textCol: textCol });
        case 'slider':
            return _jsx(SliderGlyph, { c: c, x: x, y: y, rotation: rotation, value: typeof value === 'number' ? value : c.defaultValue, onChange: onChange, textCol: textCol });
        case 'toggle':
            return _jsx(ToggleGlyph, { c: c, x: x, y: y, value: typeof value === 'boolean' ? value : c.defaultValue, onChange: onChange, textCol: textCol });
        case 'switch':
            return _jsx(SwitchGlyph, { c: c, x: x, y: y, value: typeof value === 'number' ? value : c.defaultIndex, onChange: onChange, textCol: textCol });
        case 'button':
            return _jsx(ButtonGlyph, { c: c, x: x, y: y, value: typeof value === 'boolean' ? value : (c.defaultValue ?? false), onChange: onChange, textCol: textCol });
        case 'joystick':
            return _jsx(JoystickGlyph, { c: c, x: x, y: y, value: typeof value === 'object' && value !== null && 'x' in value ? value : c.defaultValue, onChange: onChange, textCol: textCol });
        case 'exotic':
            return _jsx(ExoticGlyph, { c: c, x: x, y: y, value: typeof value === 'number' ? value : c.defaultValue, textCol: textCol });
    }
}
// ── Knob ────────────────────────────────────────────────────────────────
function KnobGlyph({ c, x, y, sizeOverride, value, onChange, textCol, }) {
    const size = sizeOverride ?? c.size ?? 'medium';
    const r = KNOB_R[size] ?? KNOB_R.medium;
    const cap = c.color ?? capColourFor(c.style ?? 'generic');
    const ring = ringColourFor(c.style ?? 'generic');
    // Normalise value to 0..1 along the knob's domain
    const t = (value - c.min) / (c.max - c.min || 1);
    const tClamped = Math.max(0, Math.min(1, t));
    // Pointer sweep -135°..+135°
    const angle = (-135 + tClamped * 270) * Math.PI / 180;
    const px = x + Math.sin(angle) * (r - 0.6);
    const py = y - Math.cos(angle) * (r - 0.6);
    const dragState = useRef(null);
    const [active, setActive] = useState(false);
    function onPointerDown(e) {
        if (!onChange)
            return;
        e.target.setPointerCapture(e.pointerId);
        dragState.current = { startY: e.clientY, startVal: value };
        setActive(true);
    }
    function onPointerMove(e) {
        if (!dragState.current || !onChange)
            return;
        const dy = dragState.current.startY - e.clientY;
        const fraction = dy / 120; // 120 px ≈ full range
        const range = c.max - c.min;
        const next = clamp(dragState.current.startVal + fraction * range, c.min, c.max);
        onChange(next);
    }
    function onPointerUp(e) {
        e.target.releasePointerCapture?.(e.pointerId);
        dragState.current = null;
        setActive(false);
    }
    return (_jsxs("g", { style: { cursor: onChange ? 'ns-resize' : 'default' }, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, children: [_jsx("circle", { cx: x, cy: y, r: r + 0.6, fill: ring, opacity: 0.9 }), _jsx("circle", { cx: x, cy: y, r: r, fill: cap, stroke: active ? '#fff' : '#1a1a1a', strokeWidth: active ? 0.4 : 0.2 }), _jsx("line", { x1: x, y1: y, x2: px, y2: py, stroke: pointerColourFor(c.style ?? 'generic', cap), strokeWidth: Math.max(0.4, r * 0.16), strokeLinecap: "round" }), _jsx("text", { x: x, y: y + r + 2.2, fontSize: 1.8, fill: textCol, textAnchor: "middle", fontWeight: 500, children: c.label })] }));
}
function capColourFor(style) {
    switch (style) {
        case 'mutable-large': return '#ffffff'; // overridden via .color usually
        case 'mutable-small': return '#1a1a1a';
        case 'davies-1900h': return '#0a0a0a';
        case 'rogan-pointer': return '#222';
        case 'bakelite-pointer': return '#1a1a1a';
        case 'thonk-d-shaft': return '#2a2a2a';
        case 'tube': return '#3a2d1a';
        default: return '#262626';
    }
}
function ringColourFor(style) {
    switch (style) {
        case 'mutable-large': return '#cfcfcf';
        case 'davies-1900h': return '#555';
        default: return '#3a3a3a';
    }
}
function pointerColourFor(style, cap) {
    // Light pointer on dark cap, dark pointer on light cap.
    const isLight = /^#?[fF]/.test(cap) || cap === 'white' || /e[a-f0-9]/i.test(cap.slice(1, 3));
    return isLight ? '#222' : '#f3f4f6';
}
// ── Slider ──────────────────────────────────────────────────────────────
function SliderGlyph({ c, x, y, rotation, value, onChange, textCol, }) {
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
    const dragState = useRef(null);
    function onPointerDown(e) {
        if (!onChange)
            return;
        e.target.setPointerCapture(e.pointerId);
        dragState.current = { startY: e.clientY, startX: e.clientX, startVal: value };
    }
    function onPointerMove(e) {
        if (!dragState.current || !onChange)
            return;
        const d = isV
            ? (dragState.current.startY - e.clientY)
            : (e.clientX - dragState.current.startX);
        const fraction = d / 100;
        const range = c.max - c.min;
        onChange(clamp(dragState.current.startVal + fraction * range, c.min, c.max));
    }
    function onPointerUp(e) {
        e.target.releasePointerCapture?.(e.pointerId);
        dragState.current = null;
    }
    return (_jsxs("g", { transform: rotation ? `rotate(${rotation} ${x} ${y})` : undefined, style: { cursor: onChange ? (isV ? 'ns-resize' : 'ew-resize') : 'default' }, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, children: [_jsx("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: "#1a1a1a", strokeWidth: 0.6, strokeLinecap: "round" }), _jsx("rect", { x: capX - 1.5, y: capY - 0.9, width: 3, height: 1.8, fill: "#e5e7eb", stroke: "#1a1a1a", strokeWidth: 0.15, rx: 0.3 }), _jsx("text", { x: x, y: isV ? y2 + 2 : y + 3.6, fontSize: 1.6, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Toggle ──────────────────────────────────────────────────────────────
function ToggleGlyph({ c, x, y, value, onChange, textCol, }) {
    return (_jsxs("g", { style: { cursor: onChange ? 'pointer' : 'default' }, onClick: () => onChange?.(!value), children: [_jsx("rect", { x: x - 2, y: y - 3, width: 4, height: 6, fill: "#2a2a2a", rx: 0.6, stroke: "#000", strokeWidth: 0.15 }), _jsx("rect", { x: x - 1.4, y: value ? y - 2.5 : y + 0.4, width: 2.8, height: 2.1, fill: "#e5e7eb", rx: 0.3 }), _jsx("text", { x: x, y: y + 5.6, fontSize: 1.6, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Switch (multi-position) ────────────────────────────────────────────
function SwitchGlyph({ c, x, y, value, onChange, textCol, }) {
    const n = c.positions.length;
    const step = 4 / Math.max(1, n - 1);
    const idx = Math.max(0, Math.min(n - 1, value));
    return (_jsxs("g", { style: { cursor: onChange ? 'pointer' : 'default' }, onClick: () => onChange?.((idx + 1) % n), children: [_jsx("rect", { x: x - 1.6, y: y - 3, width: 3.2, height: 6, fill: "#2a2a2a", rx: 0.5, stroke: "#000", strokeWidth: 0.15 }), _jsx("rect", { x: x - 1.2, y: y - 3 + idx * step + 0.3, width: 2.4, height: 1.4, fill: "#e5e7eb", rx: 0.2 }), c.positions.map((p, i) => (_jsx("text", { x: x + 2.4, y: y - 2.4 + i * step + 1, fontSize: 1.1, fill: textCol, children: p }, i))), _jsx("text", { x: x, y: y + 5.4, fontSize: 1.5, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Button ──────────────────────────────────────────────────────────────
function ButtonGlyph({ c, x, y, value, onChange, textCol, }) {
    function handle() {
        if (!onChange)
            return;
        if (c.momentary) {
            onChange(true);
            setTimeout(() => onChange(false), 100);
        }
        else
            onChange(!value);
    }
    return (_jsxs("g", { style: { cursor: onChange ? 'pointer' : 'default' }, onClick: handle, children: [_jsx("circle", { cx: x, cy: y, r: 2.2, fill: value ? '#fbbf24' : (c.style === 'led' ? '#1a1a1a' : '#4b5563'), stroke: "#000", strokeWidth: 0.2 }), _jsx("text", { x: x, y: y + 4.4, fontSize: 1.5, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Joystick ────────────────────────────────────────────────────────────
function JoystickGlyph({ c, x, y, value, onChange, textCol, }) {
    const r = 4;
    const dotX = x + clamp(value.x, -1, 1) * r;
    const dotY = y - clamp(value.y, -1, 1) * r;
    return (_jsxs("g", { children: [_jsx("circle", { cx: x, cy: y, r: r, fill: "#1a1a1a", stroke: "#000", strokeWidth: 0.2 }), _jsx("circle", { cx: dotX, cy: dotY, r: 1, fill: "#fbbf24", style: { cursor: onChange ? 'pointer' : 'default' } }), _jsx("text", { x: x, y: y + r + 2.2, fontSize: 1.5, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Exotic ──────────────────────────────────────────────────────────────
function ExoticGlyph({ c, x, y, textCol, }) {
    return (_jsxs("g", { children: [_jsx("rect", { x: x - 3, y: y - 3, width: 6, height: 6, fill: "none", stroke: "#9333ea", strokeDasharray: "0.6 0.6", strokeWidth: 0.3 }), _jsx("text", { x: x, y: y + 0.6, fontSize: 1.4, fill: textCol, textAnchor: "middle", children: "?" }), _jsx("text", { x: x, y: y + 5, fontSize: 1.4, fill: textCol, textAnchor: "middle", children: c.label })] }));
}
// ── Helpers ────────────────────────────────────────────────────────────
function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
