import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patcher — Matrix view. Sources (rows) × targets (cols), click cells to
// (de)patch. Incompatible signal types are visually disabled.
//
// This view is one of two on the same `PatchConnection[]` model; the other
// is the Graph view. They stay in perfect sync because both read/write
// through the same store.
import { updateProject, useModularProject } from './store';
import { canConnect, SIGNAL_COLOUR } from './types';
function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
export function PatcherMatrixPanel({ patchId }) {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === patchId);
    const sources = [];
    const targets = [];
    for (const m of project.modules) {
        for (const p of m.outputs)
            sources.push({ moduleId: m.id, portId: p.id, port: p, moduleLabel: m.label });
        for (const p of m.inputs)
            targets.push({ moduleId: m.id, portId: p.id, port: p, moduleLabel: m.label });
    }
    function isConnected(s, t) {
        return patch.connections.some((c) => c.from.moduleId === s.moduleId && c.from.portId === s.portId
            && c.to.moduleId === t.moduleId && c.to.portId === t.portId);
    }
    function toggle(s, t) {
        if (!canConnect(s.port.signalType, t.port.signalType))
            return;
        updateProject((proj) => ({
            ...proj,
            patches: proj.patches.map((px) => {
                if (px.id !== patchId)
                    return px;
                const exists = px.connections.some((c) => c.from.moduleId === s.moduleId && c.from.portId === s.portId
                    && c.to.moduleId === t.moduleId && c.to.portId === t.portId);
                if (exists) {
                    return {
                        ...px,
                        connections: px.connections.filter((c) => !(c.from.moduleId === s.moduleId && c.from.portId === s.portId
                            && c.to.moduleId === t.moduleId && c.to.portId === t.portId)),
                    };
                }
                const c = {
                    id: uid('c'),
                    from: { moduleId: s.moduleId, portId: s.portId },
                    to: { moduleId: t.moduleId, portId: t.portId },
                };
                return { ...px, connections: [...px.connections, c] };
            }),
        }));
    }
    return (_jsxs("div", { children: [_jsx("div", { style: { overflow: 'auto', border: '1px solid #cbd2d9', borderRadius: 6 }, children: _jsxs("table", { style: { borderCollapse: 'collapse', fontSize: 11 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { padding: 4, background: '#f8fafc', position: 'sticky', left: 0, zIndex: 2 }, children: "bron \\ doel" }), targets.map((t) => (_jsxs("th", { style: {
                                            padding: '6px 4px', background: '#f8fafc',
                                            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                                            whiteSpace: 'nowrap', borderLeft: '1px solid #e5e7eb',
                                            minWidth: 22, fontWeight: 500,
                                            color: SIGNAL_COLOUR[t.port.signalType],
                                        }, title: `${t.moduleLabel} · ${t.port.name} (${t.port.signalType})`, children: [t.moduleLabel, ".", t.port.name] }, `${t.moduleId}.${t.portId}`)))] }) }), _jsx("tbody", { children: sources.map((s) => (_jsxs("tr", { children: [_jsxs("th", { style: {
                                            padding: '4px 8px', background: '#f8fafc', textAlign: 'left',
                                            position: 'sticky', left: 0, fontWeight: 500, whiteSpace: 'nowrap',
                                            borderTop: '1px solid #e5e7eb',
                                            color: SIGNAL_COLOUR[s.port.signalType],
                                        }, title: `${s.moduleLabel} · ${s.port.name} (${s.port.signalType})`, children: [s.moduleLabel, ".", s.port.name] }), targets.map((t) => {
                                        const ok = canConnect(s.port.signalType, t.port.signalType);
                                        const on = ok && isConnected(s, t);
                                        return (_jsx("td", { onClick: () => toggle(s, t), style: {
                                                width: 22, height: 22, textAlign: 'center',
                                                borderLeft: '1px solid #e5e7eb', borderTop: '1px solid #e5e7eb',
                                                background: on ? SIGNAL_COLOUR[s.port.signalType] : (ok ? '#ffffff' : '#f3f4f6'),
                                                color: on ? 'white' : '#9ca3af',
                                                cursor: ok ? 'pointer' : 'not-allowed',
                                                fontWeight: 700,
                                            }, children: on ? '●' : ok ? '' : '·' }, `${t.moduleId}.${t.portId}`));
                                    })] }, `${s.moduleId}.${s.portId}`))) })] }) }), _jsx("p", { style: { fontSize: 12, color: '#6b7280', marginTop: 8 }, children: "Klik een cel om bron\u2192doel te (de)patchen. Cel-kleur volgt het signaal-type van de bron. Grijze cellen zijn incompatibel." })] }));
}
