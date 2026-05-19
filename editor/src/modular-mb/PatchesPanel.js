import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patches tab — list/CRUD of Patches. Each patch is bound to one Rack
// and carries per-(module, control) state. Editing the cables happens
// in the Patcher tab.
import { updateProject, useModularProject, uid } from './store';
export function PatchesPanel() {
    const project = useModularProject();
    function addPatch() {
        const physical = project.racks.find((r) => r.id === project.activeRackId)
            ?? project.racks.find((r) => r.kind !== 'internal')
            ?? project.racks[0];
        if (!physical) {
            alert('Maak eerst een rack aan (Rack-tab).');
            return;
        }
        const internal = project.racks.find((r) => r.kind === 'internal');
        const rackIds = internal && internal.id !== physical.id
            ? [physical.id, internal.id]
            : [physical.id];
        const patch = {
            id: uid('patch'),
            name: `Patch ${project.patches.length + 1}`,
            voiceCount: 8,
            rackIds,
            connections: [],
            controlState: {},
            envelopes: [],
            lfos: [],
        };
        updateProject((p) => ({
            ...p,
            patches: [...p.patches, patch],
            activePatchId: p.activePatchId ?? patch.id,
        }));
    }
    function removePatch(id) {
        updateProject((p) => ({
            ...p,
            patches: p.patches.filter((x) => x.id !== id),
            activePatchId: p.activePatchId === id ? undefined : p.activePatchId,
        }));
    }
    function patch(id, fn) {
        updateProject((p) => ({
            ...p,
            patches: p.patches.map((x) => x.id === id ? fn(x) : x),
        }));
    }
    function setActive(id) {
        updateProject((p) => ({ ...p, activePatchId: id }));
    }
    return (_jsxs("div", { children: [_jsx("div", { style: { marginBottom: 12 }, children: _jsx("button", { onClick: addPatch, className: "primary", style: { fontSize: 13 }, children: "+ Patch" }) }), project.patches.length === 0 && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Nog geen patches. Maak er een aan en bewerk de verbindingen in de Patcher-tab." })), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: { padding: '4px 8px' }, children: "Actief" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Naam" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Racks" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Verbindingen" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Env / LFO" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Stemmen" }), _jsx("th", {})] }) }), _jsx("tbody", { children: project.patches.map((x) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "radio", name: "activePatch", checked: project.activePatchId === x.id, onChange: () => setActive(x.id) }) }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "text", value: x.name, onChange: (e) => patch(x.id, (p) => ({ ...p, name: e.target.value })), style: { width: '100%', fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6 }, children: project.racks.map((r) => {
                                            const on = x.rackIds.includes(r.id);
                                            return (_jsxs("label", { style: { fontSize: 11, display: 'inline-flex', gap: 3, alignItems: 'center',
                                                    padding: '1px 6px', borderRadius: 10,
                                                    background: on ? (r.kind === 'internal' ? '#1d4ed8' : '#475569') : '#e5e7eb',
                                                    color: on ? 'white' : '#374151', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: on, onChange: (e) => patch(x.id, (p) => ({
                                                            ...p,
                                                            rackIds: e.target.checked
                                                                ? Array.from(new Set([...p.rackIds, r.id]))
                                                                : p.rackIds.filter((id) => id !== r.id),
                                                        })), style: { margin: 0 } }), r.name, r.kind === 'internal' ? ' 🧠' : ''] }, r.id));
                                        }) }) }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: x.connections.length }), _jsxs("td", { style: { padding: '4px 8px', color: '#475569' }, children: [x.envelopes.length, " / ", x.lfos.length] }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: _jsx("input", { type: "number", min: 1, max: 64, value: x.voiceCount, onChange: (e) => patch(x.id, (p) => ({ ...p, voiceCount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) })), style: { width: 50, fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px', textAlign: 'right' }, children: _jsx("button", { onClick: () => removePatch(x.id), style: { fontSize: 11 }, children: "\u00D7" }) })] }, x.id))) })] })] }));
}
