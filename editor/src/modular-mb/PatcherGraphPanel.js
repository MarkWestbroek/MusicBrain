import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patcher — Graph view. Modules are nodes; ports are coloured handles;
// cables are edges. All state lives in the same project store as the
// matrix view, so toggling between Graph/Matrix shows the same patch.
import { useCallback, useMemo, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { updateProject, useModularProject } from './store';
import { canConnect, SIGNAL_COLOUR, SIGNAL_LABEL, } from './types';
import { ParamWidget } from './ParamWidget';
function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
function ModuleNode({ data, selected }) {
    const { module: m } = data;
    const rowH = 18;
    const maxRows = Math.max(m.inputs.length, m.outputs.length, 1);
    const bodyH = 24 + maxRows * rowH;
    const headerBg = m.visual?.color ?? kindColour(m.kind);
    return (_jsxs("div", { style: {
            width: 160,
            minHeight: bodyH,
            background: '#ffffff',
            border: selected ? '2px solid #2563eb' : '1px solid #475569',
            borderRadius: 6,
            boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
            fontSize: 11,
            overflow: 'visible',
        }, children: [_jsxs("div", { style: {
                    background: headerBg, color: 'white',
                    padding: '3px 8px', fontWeight: 600,
                    borderTopLeftRadius: 4, borderTopRightRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }, children: [_jsx("span", { children: m.label }), _jsx("span", { style: { fontSize: 9, opacity: 0.8 }, children: m.kind })] }), _jsxs("div", { style: { position: 'relative', padding: '4px 8px' }, children: [m.inputs.map((p, i) => (_jsx(PortRow, { port: p, side: "in", rowY: i * rowH + 4 }, `in.${p.id}`))), m.outputs.map((p, i) => (_jsx(PortRow, { port: p, side: "out", rowY: i * rowH + 4 }, `out.${p.id}`)))] })] }));
}
function PortRow({ port, side, rowY }) {
    const colour = SIGNAL_COLOUR[port.signalType];
    return (_jsxs("div", { style: {
            position: 'relative', height: 18, marginBottom: 0,
            display: 'flex',
            justifyContent: side === 'in' ? 'flex-start' : 'flex-end',
            alignItems: 'center',
        }, children: [_jsx(Handle, { type: side === 'in' ? 'target' : 'source', position: side === 'in' ? Position.Left : Position.Right, id: port.id, style: {
                    background: colour,
                    width: 10, height: 10,
                    border: '1.5px solid white',
                    top: rowY + 10,
                } }), _jsx("span", { style: {
                    color: colour, fontWeight: 600,
                    marginLeft: side === 'in' ? 8 : 0,
                    marginRight: side === 'out' ? 8 : 0,
                }, title: `${port.name} · ${SIGNAL_LABEL[port.signalType]}`, children: port.name })] }));
}
const nodeTypes = { module: ModuleNode };
function kindColour(kind) {
    switch (kind) {
        case 'vco': return '#0891b2';
        case 'vcf': return '#0e7490';
        case 'vca': return '#15803d';
        case 'envelope': return '#7c3aed';
        case 'lfo': return '#c026d3';
        case 'mixer': return '#475569';
        case 'breakout': return '#92400e';
        case 'midiRouter': return '#9333ea';
        case 'sequencer': return '#be123c';
        default: return '#475569';
    }
}
// ─── Panel ───────────────────────────────────────────────────────────────
function PatcherGraphInner({ patchId }) {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === patchId);
    const [selectedModuleId, setSelectedModuleId] = useState(null);
    const nodes = useMemo(() => project.modules.map((m, i) => ({
        id: m.id,
        type: 'module',
        position: { x: m.x ?? 60 + (i % 4) * 200, y: m.y ?? 60 + Math.floor(i / 4) * 180 },
        data: { module: m },
    })), [project.modules]);
    const edges = useMemo(() => patch.connections.map((c) => {
        const srcMod = project.modules.find((m) => m.id === c.from.moduleId);
        const srcPort = srcMod?.outputs.find((p) => p.id === c.from.portId);
        const colour = srcPort ? SIGNAL_COLOUR[srcPort.signalType] : '#475569';
        return {
            id: c.id,
            source: c.from.moduleId,
            sourceHandle: c.from.portId,
            target: c.to.moduleId,
            targetHandle: c.to.portId,
            style: { stroke: colour, strokeWidth: 2 },
        };
    }), [patch.connections, project.modules]);
    const onNodesChange = useCallback((changes) => {
        for (const ch of changes) {
            if (ch.type === 'position' && ch.position && !ch.dragging) {
                const id = ch.id;
                const { x, y } = ch.position;
                updateProject((p) => ({
                    ...p,
                    modules: p.modules.map((m) => (m.id === id ? { ...m, x: Math.round(x), y: Math.round(y) } : m)),
                }));
            }
            if (ch.type === 'select') {
                if (ch.selected)
                    setSelectedModuleId(ch.id);
                else if (selectedModuleId === ch.id)
                    setSelectedModuleId(null);
            }
        }
    }, [selectedModuleId]);
    const onEdgesChange = useCallback((changes) => {
        for (const ch of changes) {
            if (ch.type === 'remove') {
                const eid = ch.id;
                updateProject((p) => ({
                    ...p,
                    patches: p.patches.map((px) => px.id !== patchId ? px
                        : { ...px, connections: px.connections.filter((c) => c.id !== eid) }),
                }));
            }
        }
    }, [patchId]);
    const onConnect = useCallback((c) => {
        if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle)
            return;
        const srcMod = project.modules.find((m) => m.id === c.source);
        const dstMod = project.modules.find((m) => m.id === c.target);
        const srcPort = srcMod?.outputs.find((p) => p.id === c.sourceHandle);
        const dstPort = dstMod?.inputs.find((p) => p.id === c.targetHandle);
        if (!srcPort || !dstPort)
            return;
        if (!canConnect(srcPort.signalType, dstPort.signalType)) {
            // Silent reject; could surface a toast in a later iteration.
            return;
        }
        const conn = {
            id: uid('c'),
            from: { moduleId: c.source, portId: c.sourceHandle },
            to: { moduleId: c.target, portId: c.targetHandle },
        };
        updateProject((p) => ({
            ...p,
            patches: p.patches.map((px) => px.id !== patchId ? px
                : { ...px, connections: [...px.connections, conn] }),
        }));
    }, [project.modules, patchId]);
    const selectedModule = selectedModuleId
        ? project.modules.find((m) => m.id === selectedModuleId) ?? null
        : null;
    return (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }, children: [_jsx("div", { style: {
                    height: 540, border: '1px solid #cbd2d9', borderRadius: 6, background: '#fafbfc',
                    userSelect: 'none',
                }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, deleteKeyCode: "Delete", fitView: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { gap: 20 }), _jsx(Controls, { showInteractive: false })] }) }), _jsx(ModuleAside, { module: selectedModule, patchId: patchId })] }));
}
// ─── Properties side panel ───────────────────────────────────────────────
function ModuleAside({ module: m, patchId }) {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === patchId);
    if (!m) {
        return (_jsxs("aside", { style: asideStyle, children: [_jsx("h3", { style: asideH3, children: "Module" }), _jsx("p", { style: { color: '#6b7280', fontSize: 12 }, children: "Klik een module in de graph om parameters te bewerken." }), _jsx(Legend, {})] }));
    }
    const settings = patch.moduleSettings[m.id] ?? {};
    function setParam(paramId, value) {
        const mod = m;
        updateProject((proj) => ({
            ...proj,
            patches: proj.patches.map((px) => {
                if (px.id !== patchId)
                    return px;
                const prev = px.moduleSettings[mod.id] ?? {};
                return {
                    ...px,
                    moduleSettings: { ...px.moduleSettings, [mod.id]: { ...prev, [paramId]: value } },
                };
            }),
        }));
    }
    return (_jsxs("aside", { style: asideStyle, children: [_jsx("h3", { style: asideH3, children: m.label }), _jsxs("div", { style: { fontSize: 11, color: '#6b7280', marginBottom: 8 }, children: [m.kind, m.externallyControlled ? ' · extern bediend' : ''] }), m.params.length === 0 && (_jsx("p", { style: { color: '#6b7280', fontSize: 12, fontStyle: 'italic' }, children: "Geen instelbare parameters." })), m.params.length > 0 && (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }, children: m.params.map((p) => (_jsx(ParamWidget, { label: p.name, value: settings[p.id] ?? p.defaultValue, min: p.min, max: p.max, unit: p.unit, view: p.preferredView ?? 'knob', onChange: (v) => setParam(p.id, v) }, p.id))) })), _jsx(Legend, {})] }));
}
function Legend() {
    return (_jsxs("div", { style: { marginTop: 12, fontSize: 11, color: '#475569' }, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 4 }, children: "Kabel-types" }), ['cv', 'gate', 'trigger', 'audio', 'midi'].map((t) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, lineHeight: '18px' }, children: [_jsx("span", { style: {
                            display: 'inline-block', width: 18, height: 3,
                            background: SIGNAL_COLOUR[t], borderRadius: 1,
                        } }), SIGNAL_LABEL[t]] }, t)))] }));
}
const asideStyle = {
    border: '1px solid #cbd2d9', borderRadius: 6, padding: 12, background: 'white',
};
const asideH3 = {
    marginTop: 0, marginBottom: 4, fontSize: 13,
    textTransform: 'uppercase', color: '#374151',
};
export function PatcherGraphPanel(props) {
    return (_jsx(ReactFlowProvider, { children: _jsx(PatcherGraphInner, { ...props }) }));
}
