import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patches tab — lijst van patches, toevoegen/verwijderen, actief maken.
// Editing of the patch contents itself happens in the Patcher tab.
import { updateProject, useModularProject } from './store';
function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
export function PatchesPanel() {
    const project = useModularProject();
    function addPatch() {
        const patch = {
            id: uid('patch'),
            name: `Patch ${project.patches.length + 1}`,
            voiceCount: 8,
            connections: [],
            moduleSettings: {},
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
    function renamePatch(id, name) {
        updateProject((p) => ({
            ...p,
            patches: p.patches.map((x) => (x.id === id ? { ...x, name } : x)),
        }));
    }
    function setActive(id) {
        updateProject((p) => ({ ...p, activePatchId: id }));
    }
    return (_jsxs("div", { children: [_jsx("div", { style: { marginBottom: 12 }, children: _jsx("button", { onClick: addPatch, className: "primary", style: { fontSize: 13 }, children: "+ Patch" }) }), project.patches.length === 0 && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Nog geen patches. Voeg er een toe en bewerk de verbindingen in de Patcher-tab." })), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: { padding: '4px 8px' }, children: "Actief" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Naam" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Verbindingen" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Env / LFO" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Stemmen" }), _jsx("th", {})] }) }), _jsx("tbody", { children: project.patches.map((x) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "radio", name: "activePatch", checked: project.activePatchId === x.id, onChange: () => setActive(x.id) }) }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "text", value: x.name, onChange: (e) => renamePatch(x.id, e.target.value), style: { width: '100%', fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: x.connections.length }), _jsxs("td", { style: { padding: '4px 8px', color: '#475569' }, children: [x.envelopes.length, " / ", x.lfos.length] }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: x.voiceCount }), _jsx("td", { style: { padding: '4px 8px', textAlign: 'right' }, children: _jsx("button", { onClick: () => removePatch(x.id), style: { fontSize: 11 }, children: "\u00D7" }) })] }, x.id))) })] })] }));
}
