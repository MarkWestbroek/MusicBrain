import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { devicesInFlowOrder, nextPatch, prevPatch, setActivePatch } from './actions';
import { useProject } from './store';
export function SimulationPanel() {
    const project = useProject();
    const active = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const ordered = devicesInFlowOrder(project);
    const bypassed = new Set(active?.bypassed ?? []);
    const catLabel = new Map(project.categories.map((c) => [c.id, c.label]));
    const [log, setLog] = useState([]);
    const [compact, setCompact] = useState(true);
    function push(text) {
        setLog((prev) => [...prev.slice(-19), { t: Date.now(), text }]);
    }
    function onUp() { prevPatch(); push('FS▲ → prev'); }
    function onDown() { nextPatch(); push('FS▼ → next'); }
    function onPC(id) { setActivePatch(id); push(`PC ${id}`); }
    // Reset log when project resets
    useEffect(() => {
        if (project.patches.length === 0)
            setLog([]);
    }, [project.patches.length]);
    const visibleEffects = compact ? ordered.filter((d) => !bypassed.has(d.id)) : ordered;
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-toolbar", children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: compact, onChange: (e) => setCompact(e.target.checked) }), "Compact: alleen actieve effecten tonen"] }), _jsxs("span", { style: { color: '#6b7280', fontSize: 12 }, children: ["(Stuur ook via PC\u00A00..", project.patches.length - 1, ")"] })] }), _jsxs("div", { className: "es-sim", children: [_jsxs("div", { className: "es-sim-col", children: [_jsx("h3", { children: "Input" }), _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { children: _jsx("button", { className: "es-fs-button", onClick: onUp, title: "Vorige patch", children: "\u25B2" }) }), _jsx("div", { children: _jsx("button", { className: "es-fs-button", onClick: onDown, title: "Volgende patch", children: "\u25BC" }) }), _jsx("div", { style: { marginTop: 10, fontSize: 12, color: '#6b7280' }, children: "footswitches" }), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("select", { value: active?.id ?? 0, onChange: (e) => onPC(parseInt(e.target.value, 10)), style: { width: '100%', fontSize: 12, padding: 4 }, children: project.patches.map((p) => (_jsxs("option", { value: p.id, children: ["PC ", p.id, " \u2014 ", p.name] }, p.id))) }), _jsx("div", { style: { fontSize: 11, color: '#6b7280', marginTop: 4 }, children: "MIDI ProgramChange" })] })] })] }), _jsxs("div", { className: "es-sim-col", children: [_jsx("h3", { children: "Brain" }), _jsxs("div", { className: "es-brain", children: [_jsxs("div", { children: [_jsx("span", { className: "es-brain-led" }), " active"] }), _jsx("div", { style: { marginTop: 6, fontSize: 14 }, children: active ? `PC ${active.id}` : '—' }), _jsx("div", { style: { color: '#a5f3fc', marginBottom: 8 }, children: active?.name }), _jsx("div", { style: { borderTop: '1px solid #334155', paddingTop: 6, color: '#94a3b8', fontSize: 11 }, children: "event log" }), _jsxs("div", { style: { maxHeight: 90, overflowY: 'auto', marginTop: 4 }, children: [log.length === 0 && _jsx("div", { style: { color: '#475569' }, children: "\u2014" }), [...log].reverse().map((e, i) => (_jsxs("div", { children: [new Date(e.t).toLocaleTimeString(), " ", e.text] }, e.t + '_' + i)))] })] }), _jsx("div", { style: { fontSize: 11, color: '#6b7280', marginTop: 6 }, children: "(toekomst: MIDI-out per patch tonen)" })] }), _jsxs("div", { className: "es-sim-col", children: [_jsx("h3", { children: "Output \u2014 effects" }), visibleEffects.length === 0 && (_jsx("div", { className: "es-empty", style: { padding: 12 }, children: ordered.length === 0
                                    ? 'Geen apparaten gedefinieerd.'
                                    : 'Alle effecten zijn bypassed (clean).' })), _jsx("div", { className: "es-sim-compact", children: visibleEffects.map((d, i) => (_jsxs("span", { style: { display: 'contents' }, children: [_jsxs("div", { className: "es-sim-pedal", style: {
                                                opacity: bypassed.has(d.id) ? 0.35 : 1,
                                                filter: bypassed.has(d.id) ? 'grayscale(0.7)' : 'none',
                                            }, title: `${d.brand} ${d.model} — relais ${d.relayIndex >= 0 ? d.relayIndex + 1 : '?'}`, children: [_jsx("div", { children: catLabel.get(d.categoryId) }), _jsxs("div", { style: { fontWeight: 400, fontSize: 11, marginTop: 2 }, children: [d.brand, " ", d.model] })] }), i < visibleEffects.length - 1 && _jsx("span", { style: { fontSize: 18, color: '#16a34a' }, children: "\u25B6" })] }, d.id))) }), _jsxs("div", { style: { marginTop: 12, fontSize: 12, color: '#4b5563' }, children: ["Relais:\u00A0", _jsx("code", { children: relayBitView(active?.bypassed ?? [], project.devices, project.relayCount) })] })] })] })] }));
}
function relayBitView(bypassed, devices, relayCount) {
    const bp = new Set(bypassed);
    const bits = [];
    for (let i = 0; i < relayCount; i += 1) {
        const dev = devices.find((d) => d.relayIndex === i);
        if (!dev) {
            bits.push('.');
            continue;
        }
        bits.push(bp.has(dev.id) ? '0' : '1');
    }
    return bits.join('');
}
