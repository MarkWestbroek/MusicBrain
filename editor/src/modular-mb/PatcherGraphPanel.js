import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patcher — Graph view (v2).
//
// Each module placed in the active patch's rack is rendered as a ReactFlow
// node containing the full SVG ModulePanel; ports of the module become
// ReactFlow handles on the node's borders. Cables (edges) follow the same
// signal-type colour rules. Knob/slider/switch values are read from and
// written back to `patch.controlState`.
//
// Module positions in the graph mirror their rack slot (row × HP), so the
// graph view is a free zoom/pan of the same physical layout.
import { useCallback, useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, ConnectionMode, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { canConnect, resolvePorts, SIGNAL_COLOUR, SIGNAL_LABEL, MM_PER_HP, PANEL_HEIGHT_MM, } from './types';
const PX_PER_MM = 2.4;
function ModuleNode({ data }) {
    const { module: m, types, controlState, patchId } = data;
    const ports = resolvePorts(m, types);
    const heightMm = m.visual.heightMm ?? PANEL_HEIGHT_MM;
    const widthMm = m.visual.hpWidth * MM_PER_HP;
    function setControl(controlId, value) {
        updateProject((p) => ({
            ...p,
            patches: p.patches.map((px) => {
                if (px.id !== patchId)
                    return px;
                const prev = px.controlState[m.id] ?? {};
                return {
                    ...px,
                    controlState: { ...px.controlState, [m.id]: { ...prev, [controlId]: value } },
                };
            }),
        }));
    }
    return (_jsxs("div", { className: "nopan nowheel", style: { position: 'relative', background: '#0f172a', borderRadius: 4 }, children: [_jsx(ModulePanel, { module: m, types: types, controlState: controlState, onControlChange: setControl, pxPerMm: PX_PER_MM, showPortLabels: true }), ports.map((p) => {
                const pl = m.visual.portPlacements[p.id];
                if (!pl)
                    return null;
                const left = pl.x * PX_PER_MM;
                const top = pl.y * PX_PER_MM;
                return (_jsx(Handle, { id: p.id, type: p.direction === 'in' ? 'target' : 'source', position: p.direction === 'in' ? Position.Left : Position.Right, isConnectable: true, style: {
                        left, top,
                        transform: 'translate(-50%, -50%)',
                        width: 18, height: 18,
                        background: SIGNAL_COLOUR[p.signalType],
                        border: '2px solid #fff',
                        borderRadius: '50%',
                        opacity: 0.55,
                        pointerEvents: 'all',
                    } }, p.id));
            }), _jsx("div", { style: { width: widthMm * PX_PER_MM, height: heightMm * PX_PER_MM, pointerEvents: 'none', position: 'absolute', top: 0, left: 0 } })] }));
}
const nodeTypes = { module: ModuleNode };
// ── Inner panel (inside ReactFlowProvider) ─────────────────────────────
function PatcherGraphInner({ patchId }) {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === patchId);
    const rack = project.racks.find((r) => r.id === patch.rackId);
    const placedModules = useMemo(() => {
        return rack.slots
            .map((s) => {
            const m = project.modules.find((x) => x.id === s.moduleId);
            return m ? { slot: s, module: m } : null;
        })
            .filter((x) => x !== null);
    }, [rack.slots, project.modules]);
    const nodes = useMemo(() => placedModules.map(({ slot, module: m }) => ({
        id: m.id,
        type: 'module',
        position: {
            x: slot.hpOffset * MM_PER_HP * PX_PER_MM,
            y: slot.row * (PANEL_HEIGHT_MM + 6) * PX_PER_MM,
        },
        data: {
            module: m,
            types: project.moduleTypes,
            controlState: patch.controlState[m.id] ?? {},
            patchId,
        },
        // Lock dragging — position derives from rack.
        draggable: false,
    })), [placedModules, project.moduleTypes, patch.controlState, patchId]);
    const edges = useMemo(() => patch.connections.map((c) => {
        const srcMod = project.modules.find((m) => m.id === c.from.moduleId);
        const srcPort = srcMod && resolvePorts(srcMod, project.moduleTypes)
            .find((p) => p.id === c.from.portId);
        const colour = srcPort ? SIGNAL_COLOUR[srcPort.signalType] : '#475569';
        return {
            id: c.id,
            source: c.from.moduleId, sourceHandle: c.from.portId,
            target: c.to.moduleId, targetHandle: c.to.portId,
            // zIndex tilt edges above the node-panel (default they render below)
            zIndex: 1000,
            style: { stroke: colour, strokeWidth: 2.4, filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.7))' },
        };
    }), [patch.connections, project.modules, project.moduleTypes]);
    const onNodesChange = useCallback((_changes) => {
        // Positions are fixed (driven by rack). Nothing to persist.
    }, []);
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
        if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) {
            console.warn('[patcher] connection missing source/target/handle', c);
            return;
        }
        // ConnectionMode=Loose: source/target may be reversed if user dragged in→out.
        // Normalise so srcPort is always the output.
        let aMod = project.modules.find((m) => m.id === c.source);
        let bMod = project.modules.find((m) => m.id === c.target);
        if (!aMod || !bMod)
            return;
        let aPort = resolvePorts(aMod, project.moduleTypes).find((p) => p.id === c.sourceHandle);
        let bPort = resolvePorts(bMod, project.moduleTypes).find((p) => p.id === c.targetHandle);
        if (!aPort || !bPort)
            return;
        if (aPort.direction === 'in' && bPort.direction === 'out') {
            [aMod, bMod] = [bMod, aMod];
            [aPort, bPort] = [bPort, aPort];
        }
        if (aPort.direction !== 'out' || bPort.direction !== 'in') {
            console.warn('[patcher] rejected: need out→in', { aPort, bPort });
            return;
        }
        const srcMod = aMod, dstMod = bMod, srcPort = aPort, dstPort = bPort;
        if (!canConnect(srcPort.signalType, dstPort.signalType)) {
            console.warn('[patcher] rejected: incompatible signal types', srcPort.signalType, '→', dstPort.signalType);
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
        console.log('[patcher] connected', srcMod.name, srcPort.name, '→', dstMod.name, dstPort.name);
    }, [project.modules, project.moduleTypes, patchId]);
    return (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }, children: [_jsx("div", { style: {
                    height: 620, border: '1px solid #cbd2d9', borderRadius: 6,
                    background: '#0f172a', userSelect: 'none',
                }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, connectionMode: ConnectionMode.Loose, deleteKeyCode: "Delete", fitView: true, minZoom: 0.3, maxZoom: 2, proOptions: { hideAttribution: true }, children: [_jsx(Background, { gap: 20, color: "#1e293b" }), _jsx(Controls, { showInteractive: false })] }) }), _jsx(Legend, {})] }));
}
function Legend() {
    return (_jsxs("aside", { style: {
            border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: 'white',
        }, children: [_jsx("h3", { style: { marginTop: 0, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', color: '#374151' }, children: "Signaal-types" }), ['cv', 'gate', 'trigger', 'audio', 'midi'].map((t) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, lineHeight: '18px', fontSize: 11 }, children: [_jsx("span", { style: {
                            display: 'inline-block', width: 18, height: 3,
                            background: SIGNAL_COLOUR[t], borderRadius: 1,
                        } }), SIGNAL_LABEL[t]] }, t))), _jsx("p", { style: { fontSize: 11, color: '#6b7280', marginTop: 10 }, children: "Sleep van een uit-jack naar een in-jack om te patchen. Selecteer een kabel en druk Delete om te verwijderen." }), _jsx("p", { style: { fontSize: 11, color: '#6b7280' }, children: "Knoppen/schuiven/schakelaars zijn live: ze tonen en wijzigen de toestand van de huidige patch." })] }));
}
export function PatcherGraphPanel(props) {
    return (_jsx(ReactFlowProvider, { children: _jsx(PatcherGraphInner, { ...props }) }));
}
