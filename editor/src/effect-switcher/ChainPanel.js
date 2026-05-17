import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { addDevice, addEdge as addChainEdge, autoAssignRelays, moveDevice, removeDevice, removeEdge as removeChainEdge, setRelayCount, updateDevice, } from './actions';
import { useProject } from './store';
import { t } from '../i18n';
function AlignIcon({ kind }) {
    // 16×16 grid; three little boxes get aligned along the indicated axis.
    // Stroke is the menu text colour so it picks up CSS hover/disabled later.
    const stroke = 'currentColor';
    const rect = (x, y, w, h) => (_jsx("rect", { x: x, y: y, width: w, height: h, fill: "none", stroke: stroke, strokeWidth: "1", rx: "0.5" }));
    const line = (x1, y1, x2, y2) => (_jsx("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, strokeWidth: "1.2" }));
    switch (kind) {
        case 'top': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(1, 2, 15, 2), rect(3, 4, 4, 9), rect(9, 4, 4, 6)] }));
        case 'middle': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(1, 8, 15, 8), rect(3, 4, 4, 9), rect(9, 5, 4, 6)] }));
        case 'bottom': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(1, 14, 15, 14), rect(3, 3, 4, 10), rect(9, 7, 4, 6)] }));
        case 'left': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(2, 1, 2, 15), rect(4, 3, 9, 4), rect(4, 9, 6, 4)] }));
        case 'center': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(8, 1, 8, 15), rect(4, 3, 9, 4), rect(5, 9, 6, 4)] }));
        case 'right': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [line(14, 1, 14, 15), rect(3, 3, 10, 4), rect(7, 9, 6, 4)] }));
        case 'distH': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [rect(1, 5, 3, 6), rect(6.5, 5, 3, 6), rect(12, 5, 3, 6), line(0.5, 14.5, 15.5, 14.5)] }));
        case 'distV': return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", children: [rect(5, 1, 6, 3), rect(5, 6.5, 6, 3), rect(5, 12, 6, 3), line(14.5, 0.5, 14.5, 15.5)] }));
    }
}
function EndpointNode({ data }) {
    const d = data;
    const isInput = d.label === 'IN';
    return (_jsxs("div", { className: "es-node-endpoint", children: [d.label, isInput ? (_jsx(Handle, { type: "source", position: Position.Right })) : (_jsx(Handle, { type: "target", position: Position.Left }))] }));
}
function DeviceNode({ data, selected }) {
    const d = data;
    const relayLabel = d.device.relayIndex < 0 ? 'R—' : `R${d.device.relayIndex + 1}`;
    return (_jsxs("div", { className: `es-node${selected ? ' es-node-selected' : ''}`, onClick: () => d.onSelect(d.device.id), children: [_jsx(Handle, { type: "target", position: Position.Left }), _jsx("div", { className: "es-node-relay", children: relayLabel }), d.device.imageDataUrl
                ? _jsx("img", { src: d.device.imageDataUrl, alt: d.device.model, className: "es-node-img" })
                : _jsx("div", { className: "es-node-img-placeholder", children: "\uD83C\uDF9B\uFE0F" }), _jsx("div", { className: "es-node-brand", children: d.device.brand }), _jsx("div", { className: "es-node-model", children: d.device.model }), _jsx("div", { className: "es-node-meta", children: d.categoryLabel }), _jsx(Handle, { type: "source", position: Position.Right })] }));
}
const nodeTypes = {
    endpoint: EndpointNode,
    device: DeviceNode,
};
// ─── Main editor ───────────────────────────────────────────────────────────
// ─── Auto image search via Wikipedia ─────────────────────────────────────
async function searchWikipediaImage(brand, model) {
    const query = `${brand} ${model}`;
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
        if (!res.ok)
            return null;
        const data = await res.json();
        const thumb = data['thumbnail'];
        const imgUrl = thumb?.['source'];
        if (!imgUrl)
            return null;
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok)
            return null;
        const blob = await imgRes.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }
    catch {
        return null;
    }
}
// ─── Main editor ───────────────────────────────────────────────────────────
function ChainPanelInner() {
    const project = useProject();
    const [selectedId, setSelectedId] = useState(null);
    const [selectedNodeIds, setSelectedNodeIds] = useState(() => new Set());
    const [selectedEdgeIds, setSelectedEdgeIds] = useState(() => new Set());
    const [epPos, setEpPos] = useState(() => ({
        input: { x: -40, y: 200 },
        output: { x: Math.max(1200, 80 + 3 * 220 + 80), y: 200 },
    }));
    const [searching, setSearching] = useState(false);
    const [pasteUrl, setPasteUrl] = useState('');
    const fileRef = useRef(null);
    const onSelect = useCallback((id) => setSelectedId(id), []);
    const nodes = useMemo(() => {
        const result = [
            {
                id: 'input',
                type: 'endpoint',
                position: epPos.input,
                data: { label: 'IN' },
            },
            {
                id: 'output',
                type: 'endpoint',
                position: epPos.output,
                data: { label: 'OUT' },
            },
        ];
        const catLabel = new Map(project.categories.map((c) => [c.id, c.label]));
        for (const d of project.devices) {
            result.push({
                id: d.id,
                type: 'device',
                position: { x: d.x, y: d.y },
                selected: selectedNodeIds.has(d.id),
                data: {
                    device: d,
                    categoryLabel: catLabel.get(d.categoryId) ?? d.categoryId,
                    onSelect,
                },
            });
        }
        return result;
    }, [project.devices, project.categories, onSelect, selectedNodeIds, epPos]);
    const edges = useMemo(() => project.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        selected: selectedEdgeIds.has(e.id),
        reconnectable: true,
        markerEnd: {
            type: MarkerType.ArrowClosed, width: 12, height: 12,
            color: selectedEdgeIds.has(e.id) ? '#2563eb' : '#374151',
        },
        style: {
            stroke: selectedEdgeIds.has(e.id) ? '#2563eb' : '#374151',
            strokeWidth: selectedEdgeIds.has(e.id) ? 3 : 1.5,
        },
    })), [project.edges, selectedEdgeIds]);
    const onNodesChange = useCallback((changes) => {
        for (const ch of changes) {
            if (ch.type === 'position' && ch.position) {
                if (ch.id === 'input' || ch.id === 'output') {
                    if (!ch.dragging) {
                        const key = ch.id;
                        setEpPos((prev) => ({ ...prev, [key]: ch.position }));
                    }
                }
                else if (!ch.dragging) {
                    moveDevice(ch.id, Math.round(ch.position.x), Math.round(ch.position.y));
                }
            }
            if (ch.type === 'remove' && ch.id !== 'input' && ch.id !== 'output') {
                removeDevice(ch.id);
            }
            if (ch.type === 'select') {
                setSelectedNodeIds((prev) => {
                    const next = new Set(prev);
                    if (ch.selected) {
                        next.add(ch.id);
                        setSelectedId(ch.id);
                    }
                    else
                        next.delete(ch.id);
                    return next;
                });
            }
        }
        void applyNodeChanges;
    }, []);
    const onEdgesChange = useCallback((changes) => {
        for (const ch of changes) {
            if (ch.type === 'remove')
                removeChainEdge(ch.id);
            if (ch.type === 'select') {
                setSelectedEdgeIds((prev) => {
                    const next = new Set(prev);
                    if (ch.selected)
                        next.add(ch.id);
                    else
                        next.delete(ch.id);
                    return next;
                });
            }
        }
    }, []);
    const onConnect = useCallback((c) => {
        if (c.source && c.target)
            addChainEdge(c.source, c.target);
    }, []);
    const onReconnect = useCallback((oldEdge, newConnection) => {
        removeChainEdge(oldEdge.id);
        if (newConnection.source && newConnection.target) {
            addChainEdge(newConnection.source, newConnection.target);
        }
    }, []);
    // ─── Alignment context menu ─────────────────────────────────────────────
    const selectedDeviceIds = useMemo(() => [...selectedNodeIds].filter((id) => id !== 'input' && id !== 'output'), [selectedNodeIds]);
    const [contextMenu, setContextMenu] = useState(null);
    function handleContextMenu(e) {
        if (selectedDeviceIds.length < 2) {
            setContextMenu(null);
            return;
        }
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    }
    function alignNodes(axis, method) {
        const positions = selectedDeviceIds.map((id) => {
            const d = project.devices.find((dev) => dev.id === id);
            return { id, x: d.x, y: d.y };
        });
        const vals = positions.map((p) => p[axis]);
        const target = method === 'min' ? Math.min(...vals)
            : method === 'max' ? Math.max(...vals)
                : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        for (const p of positions) {
            moveDevice(p.id, axis === 'x' ? target : p.x, axis === 'y' ? target : p.y);
        }
        setContextMenu(null);
    }
    function distributeNodes(axis) {
        if (selectedDeviceIds.length < 3)
            return;
        const positions = selectedDeviceIds
            .map((id) => { const d = project.devices.find((dev) => dev.id === id); return { id, x: d.x, y: d.y }; })
            .sort((a, b) => a[axis] - b[axis]);
        const first = positions[0][axis];
        const last = positions[positions.length - 1][axis];
        const step = (last - first) / (positions.length - 1);
        positions.forEach((p, i) => {
            const val = Math.round(first + i * step);
            moveDevice(p.id, axis === 'x' ? val : p.x, axis === 'y' ? val : p.y);
        });
        setContextMenu(null);
    }
    const selected = project.devices.find((d) => d.id === selectedId) ?? null;
    async function onAutoSearch() {
        if (!selected)
            return;
        setSearching(true);
        const dataUrl = await searchWikipediaImage(selected.brand, selected.model);
        setSearching(false);
        if (dataUrl) {
            updateDevice(selected.id, { imageDataUrl: dataUrl });
        }
        else {
            window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${selected.brand} ${selected.model} guitar pedal`)}`, '_blank');
        }
    }
    function onPasteUrl() {
        if (!selected || !pasteUrl.trim())
            return;
        updateDevice(selected.id, { imageDataUrl: pasteUrl.trim() });
        setPasteUrl('');
    }
    function onImageChange(e) {
        const file = e.target.files?.[0];
        if (!file || !selected)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = typeof reader.result === 'string' ? reader.result : undefined;
            if (url)
                updateDevice(selected.id, { imageDataUrl: url });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }
    return (_jsxs("section", { onContextMenu: handleContextMenu, onClick: () => setContextMenu(null), children: [contextMenu && (_jsx("div", { style: { position: 'fixed', inset: 0, zIndex: 999 }, onClick: () => setContextMenu(null), onContextMenu: (e) => { e.preventDefault(); setContextMenu(null); } })), contextMenu && selectedDeviceIds.length >= 2 && (_jsxs("div", { style: {
                    position: 'fixed', left: contextMenu.x, top: contextMenu.y,
                    zIndex: 1000, background: 'white', border: '1px solid #d1d5db',
                    borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    minWidth: 210, padding: '6px 0', fontSize: 14,
                }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { style: { padding: '6px 14px 8px', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #f3f4f6', letterSpacing: '0.04em' }, children: t('align.title', { n: selectedDeviceIds.length }) }), [
                        { icon: _jsx(AlignIcon, { kind: "top" }), label: t('align.top'), fn: () => alignNodes('y', 'min') },
                        { icon: _jsx(AlignIcon, { kind: "middle" }), label: t('align.middle'), fn: () => alignNodes('y', 'avg') },
                        { icon: _jsx(AlignIcon, { kind: "bottom" }), label: t('align.bottom'), fn: () => alignNodes('y', 'max') },
                        null,
                        { icon: _jsx(AlignIcon, { kind: "left" }), label: t('align.left'), fn: () => alignNodes('x', 'min') },
                        { icon: _jsx(AlignIcon, { kind: "center" }), label: t('align.center'), fn: () => alignNodes('x', 'avg') },
                        { icon: _jsx(AlignIcon, { kind: "right" }), label: t('align.right'), fn: () => alignNodes('x', 'max') },
                        null,
                        { icon: _jsx(AlignIcon, { kind: "distH" }), label: t('align.distH'), fn: () => distributeNodes('x') },
                        { icon: _jsx(AlignIcon, { kind: "distV" }), label: t('align.distV'), fn: () => distributeNodes('y') },
                    ].map((item, i) => item === null
                        ? _jsx("hr", { style: { margin: '4px 0', border: 'none', borderTop: '1px solid #f3f4f6' } }, i)
                        : _jsxs("button", { onClick: item.fn, style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1f2937' }, onMouseEnter: (e) => { (e.currentTarget).style.background = '#eff6ff'; }, onMouseLeave: (e) => { (e.currentTarget).style.background = 'none'; }, children: [_jsx("span", { style: { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }, children: item.icon }), item.label] }, item.label))] })), _jsxs("div", { className: "es-toolbar", children: [_jsx("button", { className: "primary", onClick: () => addDevice({}), children: t('chain.addEffect') }), _jsx("button", { onClick: autoAssignRelays, title: "Topological order \u2192 relay 1..n", children: t('chain.autoAssign') }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [t('chain.relays'), _jsx("input", { type: "number", min: 1, max: 32, value: project.relayCount, onChange: (e) => setRelayCount(parseInt(e.target.value, 10) || 16), style: { width: 60 } })] }), _jsx("span", { style: { color: '#6b7280', fontSize: 12 }, children: t('chain.hint') })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }, children: [_jsx("div", { className: "es-chain", children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, onReconnect: onReconnect, deleteKeyCode: "Delete", fitView: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { gap: 20 }), _jsx(Controls, { showInteractive: false })] }) }), _jsxs("aside", { style: { border: '1px solid #cbd2d9', borderRadius: 6, padding: 12, background: 'white' }, children: [_jsx("h3", { style: { marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: '#6b7280' }, children: "Properties" }), !selected && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Click a device to edit its properties." })), selected && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Brand", _jsx("input", { type: "text", value: selected.brand, onChange: (e) => updateDevice(selected.id, { brand: e.target.value }), style: { width: '100%' } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Model", _jsx("input", { type: "text", value: selected.model, onChange: (e) => updateDevice(selected.id, { model: e.target.value }), style: { width: '100%' } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Category", _jsx("select", { value: selected.categoryId, onChange: (e) => updateDevice(selected.id, { categoryId: e.target.value }), style: { width: '100%' }, children: project.categories.map((c) => (_jsx("option", { value: c.id, children: c.label }, c.id))) })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Relay (1..", project.relayCount, "; 0 = unassigned)", _jsx("input", { type: "number", min: 0, max: project.relayCount, value: selected.relayIndex < 0 ? 0 : selected.relayIndex + 1, onChange: (e) => {
                                                    const v = parseInt(e.target.value, 10) || 0;
                                                    updateDevice(selected.id, { relayIndex: v <= 0 ? -1 : v - 1 });
                                                }, style: { width: '100%' } })] }), _jsxs("div", { style: { fontSize: 12 }, children: ["Plaatje:", selected.imageDataUrl && (_jsx("img", { src: selected.imageDataUrl, alt: "", style: { width: '100%', maxHeight: 120, objectFit: 'contain', display: 'block', margin: '4px 0', background: '#f5f7fa', borderRadius: 4 } })), _jsxs("div", { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }, children: [_jsx("button", { onClick: () => fileRef.current?.click(), children: selected.imageDataUrl ? 'Replace' : 'Upload' }), _jsx("button", { onClick: () => { void onAutoSearch(); }, disabled: searching || !selected.brand || !selected.model, title: "Search Wikipedia for image. Falls back to Google Images.", children: searching ? 'Searching…' : '🔍 Auto-search' }), selected.imageDataUrl && (_jsx("button", { className: "danger", onClick: () => updateDevice(selected.id, { imageDataUrl: undefined }), children: "\u2715" }))] }), _jsxs("div", { style: { display: 'flex', gap: 4, marginTop: 6 }, children: [_jsx("input", { type: "url", placeholder: "Paste image URL\u2026", value: pasteUrl, onChange: (e) => setPasteUrl(e.target.value), style: { flex: 1, fontSize: 11, padding: '3px 6px' } }), _jsx("button", { onClick: onPasteUrl, disabled: !pasteUrl.trim(), children: "OK" })] }), _jsx("input", { ref: fileRef, type: "file", accept: "image/*", style: { display: 'none' }, onChange: onImageChange })] }), _jsx("button", { className: "danger", onClick: () => { removeDevice(selected.id); setSelectedId(null); setSelectedNodeIds(new Set()); }, children: "Delete device" })] }))] })] })] }));
}
export function ChainPanel() {
    return (_jsx(ReactFlowProvider, { children: _jsx(ChainPanelInner, {}) }));
}
