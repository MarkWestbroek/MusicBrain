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
    const [showLog, setShowLog] = useState(false);
    function push(text) {
        setLog((prev) => [...prev.slice(-29), { t: Date.now(), text }]);
    }
    function onUp() { nextPatch(); push('FS▲ → next patch'); }
    function onDown() { prevPatch(); push('FS▼ → prev patch'); }
    function onPC(id) {
        const name = project.patches.find((p) => p.id === id)?.name ?? '';
        setActivePatch(id);
        push(`PC ${id + 1} → "${name}"`);
    }
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
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-sim-flow", children: [_jsxs("div", { className: "es-sim-stage", children: [_jsx("div", { className: "es-sim-stage-title", children: "Input" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }, children: [_jsx("button", { className: "es-fs-button", onClick: onUp, title: "Previous patch", children: "\u25B2" }), _jsx("button", { className: "es-fs-button", onClick: onDown, title: "Next patch", children: "\u25BC" }), _jsx("div", { style: { fontSize: 10, color: '#6b7280' }, children: "footswitch" }), _jsx("select", { value: active?.id ?? 0, onChange: (e) => onPC(parseInt(e.target.value, 10)), style: { width: '100%', fontSize: 11, marginTop: 4 }, children: project.patches.map((p) => (_jsxs("option", { value: p.id, children: ["PC ", p.id + 1, " \u2014 ", p.name] }, p.id))) })] })] }), _jsxs("div", { className: "es-sim-connector", children: [_jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-badge", children: "MIDI" }), _jsx("div", { className: "es-sim-cable" }), _jsx("span", { className: "es-sim-conn-arrow", children: "\u25B6" })] }), _jsxs("div", { className: "es-sim-stage", children: [_jsx("div", { className: "es-sim-stage-title", children: "Brain" }), _jsxs("div", { className: "es-brain es-brain--sim", children: [_jsxs("div", { children: [_jsx("span", { className: "es-brain-led" }), active?.name ?? '—'] }), _jsxs("div", { style: { color: '#a5f3fc', fontSize: 11, marginTop: 2 }, children: ["PC ", active ? active.id + 1 : '—'] })] }), _jsx("button", { className: "es-sim-log-toggle", onClick: () => setShowLog((v) => !v), children: showLog ? 'Log ▲' : 'Log ▼' }), showLog && (_jsx("div", { className: "es-sim-log", children: log.length === 0
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
