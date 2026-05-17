import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, applyNodeChanges, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { addDevice, addEdge as addChainEdge, autoAssignRelays, moveDevice, removeDevice, removeEdge as removeChainEdge, setRelayCount, updateDevice, } from './actions';
import { useProject } from './store';
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
    const [searching, setSearching] = useState(false);
    const [pasteUrl, setPasteUrl] = useState('');
    const fileRef = useRef(null);
    const onSelect = useCallback((id) => setSelectedId(id), []);
    const nodes = useMemo(() => {
        const result = [
            {
                id: 'input',
                type: 'endpoint',
                position: { x: -40, y: 200 },
                data: { label: 'IN' },
                draggable: false,
                selectable: false,
            },
            {
                id: 'output',
                type: 'endpoint',
                position: {
                    x: Math.max(1200, 80 + project.devices.length * 220 + 80),
                    y: 200,
                },
                data: { label: 'OUT' },
                draggable: false,
                selectable: false,
            },
        ];
        const catLabel = new Map(project.categories.map((c) => [c.id, c.label]));
        for (const d of project.devices) {
            result.push({
                id: d.id,
                type: 'device',
                position: { x: d.x, y: d.y },
                data: {
                    device: d,
                    categoryLabel: catLabel.get(d.categoryId) ?? d.categoryId,
                    onSelect,
                },
            });
        }
        return result;
    }, [project.devices, project.categories, onSelect]);
    const edges = useMemo(() => project.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        reconnectable: true,
        style: { stroke: '#374151', strokeWidth: 3 },
    })), [project.edges]);
    const onNodesChange = useCallback((changes) => {
        // Apply locally to compute positions, persist on drag-stop
        for (const ch of changes) {
            if (ch.type === 'position' && ch.position && !ch.dragging) {
                moveDevice(ch.id, Math.round(ch.position.x), Math.round(ch.position.y));
            }
            if (ch.type === 'remove' && ch.id !== 'input' && ch.id !== 'output') {
                removeDevice(ch.id);
            }
        }
        // For visual smoothness during drag, applyNodeChanges is needed only when
        // React Flow controls node state. Since we recompute nodes every render
        // from project state, ignore intermediate non-final position changes.
        void applyNodeChanges;
    }, []);
    const onEdgesChange = useCallback((changes) => {
        for (const ch of changes) {
            if (ch.type === 'remove')
                removeChainEdge(ch.id);
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
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-toolbar", children: [_jsx("button", { className: "primary", onClick: () => addDevice({}), children: "+ Effect" }), _jsx("button", { onClick: autoAssignRelays, title: "Topologische volgorde \u2192 relais 1..n", children: "Auto-assign relais" }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: ["Relais:", _jsx("input", { type: "number", min: 1, max: 32, value: project.relayCount, onChange: (e) => setRelayCount(parseInt(e.target.value, 10) || 16), style: { width: 60 } })] }), _jsx("span", { style: { color: '#6b7280', fontSize: 12 }, children: "Sleep tussen handles om signaalpad te tekenen. Klik op een node om te bewerken." })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }, children: [_jsx("div", { className: "es-chain", children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, nodeTypes: nodeTypes, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, onReconnect: onReconnect, deleteKeyCode: "Delete", fitView: true, proOptions: { hideAttribution: true }, children: [_jsx(Background, { gap: 20 }), _jsx(Controls, { showInteractive: false })] }) }), _jsxs("aside", { style: { border: '1px solid #cbd2d9', borderRadius: 6, padding: 12, background: 'white' }, children: [_jsx("h3", { style: { marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: '#6b7280' }, children: "Eigenschappen" }), !selected && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Klik op een apparaat om eigenschappen te bewerken." })), selected && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Merk", _jsx("input", { type: "text", value: selected.brand, onChange: (e) => updateDevice(selected.id, { brand: e.target.value }), style: { width: '100%' } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Model", _jsx("input", { type: "text", value: selected.model, onChange: (e) => updateDevice(selected.id, { model: e.target.value }), style: { width: '100%' } })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Categorie", _jsx("select", { value: selected.categoryId, onChange: (e) => updateDevice(selected.id, { categoryId: e.target.value }), style: { width: '100%' }, children: project.categories.map((c) => (_jsx("option", { value: c.id, children: c.label }, c.id))) })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Relais (1..", project.relayCount, "; 0 = niet toegekend)", _jsx("input", { type: "number", min: 0, max: project.relayCount, value: selected.relayIndex < 0 ? 0 : selected.relayIndex + 1, onChange: (e) => {
                                                    const v = parseInt(e.target.value, 10) || 0;
                                                    updateDevice(selected.id, { relayIndex: v <= 0 ? -1 : v - 1 });
                                                }, style: { width: '100%' } })] }), _jsxs("div", { style: { fontSize: 12 }, children: ["Plaatje:", selected.imageDataUrl && (_jsx("img", { src: selected.imageDataUrl, alt: "", style: { width: '100%', maxHeight: 120, objectFit: 'contain', display: 'block', margin: '4px 0', background: '#f5f7fa', borderRadius: 4 } })), _jsxs("div", { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }, children: [_jsx("button", { onClick: () => fileRef.current?.click(), children: selected.imageDataUrl ? 'Vervangen' : 'Uploaden' }), _jsx("button", { onClick: () => { void onAutoSearch(); }, disabled: searching || !selected.brand || !selected.model, title: "Zoek plaatje op Wikipedia. Als niet gevonden, opent Google Afbeeldingen.", children: searching ? 'Zoeken…' : '🔍 Auto-zoek' }), selected.imageDataUrl && (_jsx("button", { className: "danger", onClick: () => updateDevice(selected.id, { imageDataUrl: undefined }), children: "\u2715" }))] }), _jsxs("div", { style: { display: 'flex', gap: 4, marginTop: 6 }, children: [_jsx("input", { type: "url", placeholder: "Plak afbeelding-URL\u2026", value: pasteUrl, onChange: (e) => setPasteUrl(e.target.value), style: { flex: 1, fontSize: 11, padding: '3px 6px' } }), _jsx("button", { onClick: onPasteUrl, disabled: !pasteUrl.trim(), children: "OK" })] }), _jsx("input", { ref: fileRef, type: "file", accept: "image/*", style: { display: 'none' }, onChange: onImageChange })] }), _jsx("button", { className: "danger", onClick: () => { removeDevice(selected.id); setSelectedId(null); }, children: "Verwijder apparaat" })] }))] })] })] }));
}
export function ChainPanel() {
    return (_jsx(ReactFlowProvider, { children: _jsx(ChainPanelInner, {}) }));
}
