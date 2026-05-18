import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { devicesInFlowOrder, setActivePatch } from './actions';
import { useProject } from './store';
import { EditorSimulationPanel } from './EditorSimulationPanel';
import { t } from '../i18n';
import { MidiParser, MidiType, describeMessage, hex2, serializeProgramChange, } from './midiSim';
/** Total transit time per byte across the visualised cable. The real MIDI
 *  bitrate (31 250 baud → ~320 µs per byte) is invisible to humans — we
 *  inflate it so the user can actually watch the bytes travel. */
const WIRE_TRANSIT_MS = 700;
/**
 * Top-level Simulation tab — switches between two distinct use-case views.
 * Each view simulates a *different* user story, so they intentionally show
 * different things on screen.
 */
export function SimulationPanel() {
    const [mode, setMode] = useState('box');
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-sim-modetabs", children: [_jsxs("button", { className: "es-sim-modetab", "aria-selected": mode === 'box', onClick: () => setMode('box'), children: ["\uD83C\uDFB8 ", t('sim.box.title'), _jsx("span", { className: "es-sim-modetab-sub", children: t('sim.box.subtitle') })] }), _jsxs("button", { className: "es-sim-modetab", "aria-selected": mode === 'editor', onClick: () => setMode('editor'), children: ["\uD83D\uDCBB ", t('sim.editor.title'), _jsx("span", { className: "es-sim-modetab-sub", children: t('sim.editor.subtitle') })] })] }), mode === 'box' && _jsx(BoxSimulationPanel, {}), mode === 'editor' && _jsx(EditorSimulationPanel, {})] }));
}
/**
 * "Musician using the box" — the original, on-stage view: footswitch + brain
 * + relay matrix + audio signal path. Pure offline simulation; no device
 * involvement.
 */
function BoxSimulationPanel() {
    const project = useProject();
    const active = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const ordered = devicesInFlowOrder(project);
    const bypassed = new Set(active?.bypassed ?? []);
    const catLabel = new Map(project.categories.map((c) => [c.id, c.label]));
    const [log, setLog] = useState([]);
    const [showLog, setShowLog] = useState(false);
    // ── Simulated MIDI cable: bytes currently travelling left→right ──────────
    const [wire, setWire] = useState([]);
    const nextByteId = useRef(1);
    // Parser lives on the "Brain" end of the cable. It is recreated only once;
    // its callback closes over `setActivePatch` + `push` which are stable.
    const parserRef = useRef(null);
    if (parserRef.current === null) {
        parserRef.current = new MidiParser((m) => {
            const label = describeMessage(m);
            push(`◀ MIDI in: ${label}`);
            if (m.type === MidiType.ProgramChange) {
                // The editor's SwitcherPatch.id IS the MIDI program number (see
                // types.ts). Match exactly; if no patch has that id, fall back to
                // index modulo so something audible always happens.
                const ps = projectRef.current.patches;
                if (ps.length > 0) {
                    const exact = ps.find((p) => p.id === m.data1);
                    const target = exact ?? ps[m.data1 % ps.length];
                    setActivePatch(target.id);
                }
            }
        });
    }
    // Keep a ref to the latest project so the parser callback always sees
    // current patches without resubscribing.
    const projectRef = useRef(project);
    projectRef.current = project;
    function push(text) {
        setLog((prev) => [...prev.slice(-29), { t: Date.now(), text }]);
    }
    /** Push raw bytes onto the simulated cable; they will be parsed on arrival. */
    function transmitBytes(bytes, label) {
        push(`▶ MIDI out: ${label}  [${Array.from(bytes).map(hex2).join(' ')}]`);
        const now = performance.now();
        setWire((prev) => [
            ...prev,
            // Stagger so successive bytes don't visually overlap. ~120 ms is enough
            // to keep them readable.
            ...Array.from(bytes, (value, i) => ({
                id: nextByteId.current++,
                value,
                bornAt: now + i * 120,
            })),
        ]);
    }
    function onUp() {
        const ps = projectRef.current.patches;
        if (ps.length === 0)
            return;
        const i = ps.findIndex((p) => p.id === projectRef.current.activePatchId);
        const next = ps[((i < 0 ? 0 : i) + 1) % ps.length];
        transmitBytes(serializeProgramChange(1, next.id), `PC1 #${next.id}  (▲ next)`);
    }
    function onDown() {
        const ps = projectRef.current.patches;
        if (ps.length === 0)
            return;
        const i = ps.findIndex((p) => p.id === projectRef.current.activePatchId);
        const prev = ps[((i < 0 ? 0 : i) - 1 + ps.length) % ps.length];
        transmitBytes(serializeProgramChange(1, prev.id), `PC1 #${prev.id}  (▼ prev)`);
    }
    function onPC(id) {
        const p = projectRef.current.patches.find((x) => x.id === id);
        if (!p)
            return;
        transmitBytes(serializeProgramChange(1, p.id), `PC1 #${p.id} → "${p.name}"`);
    }
    // ── Animation loop: advance the wire and dispatch bytes as they arrive ──
    // We bump a frame counter every requestAnimationFrame so the byte chips
    // are re-rendered (and their `left` is recomputed) while in flight.
    const [, setFrame] = useState(0);
    useEffect(() => {
        if (wire.length === 0)
            return;
        let raf = 0;
        const tick = () => {
            const now = performance.now();
            const arrived = [];
            const stillFlying = [];
            for (const b of wire) {
                if (now - b.bornAt >= WIRE_TRANSIT_MS)
                    arrived.push(b);
                else
                    stillFlying.push(b);
            }
            if (arrived.length > 0) {
                // Feed parser in the order they were launched.
                arrived.sort((a, b) => a.bornAt - b.bornAt);
                for (const b of arrived)
                    parserRef.current.processByte(b.value);
                setWire(stillFlying);
                return;
            }
            setFrame((f) => f + 1);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [wire]);
    useEffect(() => {
        if (project.patches.length === 0)
            setLog([]);
    }, [project.patches.length]);
    // relayIndex → true (closed/active) | false (open/bypassed) | undefined (unassigned)
    const relayState = new Map();
    for (const d of project.devices) {
        if (d.relayIndex >= 0)
            relayState.set(d.relayIndex, !bypassed.has(d.id));
    }
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-sim-flow", children: [_jsxs("div", { className: "es-sim-stage", children: [_jsx("div", { className: "es-sim-stage-title", children: "Input" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }, children: [_jsx("button", { className: "es-fs-button", onClick: onUp, title: "Previous patch", children: "\u25B2" }), _jsx("button", { className: "es-fs-button", onClick: onDown, title: "Next patch", children: "\u25BC" }), _jsx("div", { style: { fontSize: 10, color: '#6b7280' }, children: "footswitch" }), _jsx("select", { value: active?.id ?? 0, onChange: (e) => onPC(parseInt(e.target.value, 10)), style: { width: '100%', fontSize: 11, marginTop: 4 }, children: project.patches.map((p) => (_jsxs("option", { value: p.id, children: ["PC ", p.id + 1, " \u2014 ", p.name] }, p.id))) })] })] }), _jsx("div", { className: "es-sim-connector es-sim-connector--midi", children: _jsxs("div", { className: "es-sim-midi-wire", children: [_jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-badge", children: "MIDI" }), _jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-arrow", children: "\u25B6" }), wire.map((b) => {
                                    const now = performance.now();
                                    const progress = Math.max(0, Math.min(1, (now - b.bornAt) / WIRE_TRANSIT_MS));
                                    return (_jsx("span", { className: `es-sim-midi-byte${(b.value & 0x80) ? ' status' : ''}`, style: { left: `calc(${progress * 100}% - 14px)` }, title: `0x${hex2(b.value)} (${b.value})`, children: hex2(b.value) }, b.id));
                                })] }) }), _jsxs("div", { className: "es-sim-stage", children: [_jsx("div", { className: "es-sim-stage-title", children: "Brain" }), _jsxs("div", { className: "es-brain es-brain--sim", children: [_jsxs("div", { children: [_jsx("span", { className: "es-brain-led" }), active?.name ?? '—'] }), _jsxs("div", { style: { color: '#a5f3fc', fontSize: 11, marginTop: 2 }, children: ["PC ", active ? active.id + 1 : '—'] })] }), _jsx("button", { className: "es-sim-log-toggle", onClick: () => setShowLog((v) => !v), children: showLog ? 'Log ▲' : 'Log ▼' }), showLog && (_jsx("div", { className: "es-sim-log", children: log.length === 0
                                    ? _jsx("span", { style: { color: '#94a3b8', fontSize: 11 }, children: "No events yet." })
                                    : [...log].reverse().map((e, i) => (_jsxs("div", { className: "es-sim-log-entry", children: [new Date(e.t).toLocaleTimeString(), " ", e.text] }, e.t + '_' + i))) }))] }), _jsxs("div", { className: "es-sim-connector", children: [_jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-badge", children: "relay ctrl" }), _jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-arrow", children: "\u25B6" })] }), _jsxs("div", { className: "es-sim-stage", children: [_jsx("div", { className: "es-sim-stage-title", children: "Relay Matrix" }), _jsx("div", { className: "es-relay-matrix", children: Array.from({ length: project.relayCount }, (_, i) => (_jsx("div", { className: `es-relay-cell${relayState.get(i) === true ? ' closed' : ''}`, title: `R${i + 1}: ${!relayState.has(i)
                                        ? 'unassigned'
                                        : relayState.get(i) ? 'closed (active)' : 'open (bypassed)'}`, children: i + 1 }, i))) })] }), _jsxs("div", { className: "es-sim-connector", children: [_jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-arrow", children: "\u25B6" })] }), _jsxs("div", { className: "es-sim-stage es-sim-stage--out", children: [_jsx("div", { className: "es-sim-stage-title", children: "Output" }), _jsx("div", { style: { fontSize: 32, textAlign: 'center', paddingTop: 8 }, children: "\uD83D\uDD0A" })] })] }), _jsxs("div", { className: "es-sim-audio", children: [_jsx("div", { className: "es-sim-audio-ep", children: "Guitar IN" }), _jsx("div", { className: "es-sim-audio-arrow active", children: "\u25B6" }), ordered.length === 0 && (_jsx("div", { style: { color: '#6b7280', fontSize: 12, padding: '0 12px', alignSelf: 'center' }, children: "No effects defined \u2014 add them in the Effect-chain tab." })), ordered.map((d, i) => {
                        const isBypassed = bypassed.has(d.id);
                        const next = ordered[i + 1];
                        const arrowActive = !isBypassed && (!next || !bypassed.has(next.id));
                        return (_jsxs("span", { style: { display: 'contents' }, children: [_jsxs("div", { className: `es-sim-pedal-card${isBypassed ? ' bypassed' : ' active'}`, children: [_jsx("div", { className: "es-sim-pedal-relay", children: d.relayIndex >= 0 ? `R${d.relayIndex + 1}` : 'R—' }), d.imageDataUrl
                                            ? _jsx("img", { src: d.imageDataUrl, alt: d.model, className: "es-sim-pedal-img" })
                                            : _jsx("div", { className: "es-sim-pedal-img-ph", children: "\uD83C\uDF9B\uFE0F" }), _jsx("div", { className: "es-sim-pedal-brand", children: d.brand }), _jsx("div", { className: "es-sim-pedal-model", children: d.model }), _jsx("div", { className: "es-sim-pedal-cat", children: catLabel.get(d.categoryId) })] }), i < ordered.length - 1 && (_jsx("div", { className: `es-sim-audio-arrow${arrowActive ? ' active' : ''}`, children: "\u25B6" }))] }, d.id));
                    }), ordered.length > 0 && (_jsx("div", { className: `es-sim-audio-arrow${!bypassed.has(ordered[ordered.length - 1].id) ? ' active' : ''}`, children: "\u25B6" })), _jsx("div", { className: "es-sim-audio-ep", children: "Guitar OUT" })] })] }));
}
