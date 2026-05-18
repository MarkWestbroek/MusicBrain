import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { addPatch, devicesInFlowOrder, duplicatePatch, removePatch, renamePatch, setActivePatch, toggleBypass, } from './actions';
import { useProject } from './store';
/** Panel that lists all patches and lets the engineer switch between them,
 *  add / duplicate / remove patches, and toggle device bypass per patch.
 *  The active patch drives both the editor highlight and the simulation. */
export function PatchesPanel() {
    const project = useProject();
    const sortedPatches = [...project.patches].sort((a, b) => a.id - b.id);
    const active = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const ordered = devicesInFlowOrder(project);
    const bypassedSet = new Set(active?.bypassed ?? []);
    const catLabel = new Map(project.categories.map((c) => [c.id, c.label]));
    return (_jsxs("section", { children: [_jsxs("div", { className: "es-toolbar", children: [_jsx("button", { className: "primary", onClick: () => addPatch(`Patch ${project.patches.length}`), children: "+ Nieuwe patch" }), active && (_jsx("button", { onClick: () => duplicatePatch(active.id, `${active.name} copy`), children: "Dupliceer" })), active && project.patches.length > 1 && (_jsx("button", { className: "danger", onClick: () => removePatch(active.id), children: "Verwijder patch" })), _jsx("span", { style: { color: '#6b7280', fontSize: 12 }, children: "Klik op een effect om bypass te togglen. Uitgegrijsd = bypass (relais uit)." })] }), _jsxs("div", { className: "es-patches-layout", children: [_jsx("div", { children: _jsx("div", { className: "es-patch-list", children: sortedPatches.map((p) => (_jsxs("div", { className: "es-patch-row", "aria-selected": p.id === active?.id, onClick: () => setActivePatch(p.id), children: [_jsxs("span", { className: "es-patch-pgm", children: ["PC\u00A0", p.id + 1] }), _jsx("span", { className: "es-patch-name", children: p.name })] }, p.id))) }) }), _jsxs("div", { children: [active && (_jsx("div", { className: "es-patch-props", children: _jsxs("div", { style: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }, children: [_jsxs("label", { style: { fontSize: 12, flex: 1 }, children: [_jsxs("span", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { children: "Naam" }), _jsxs("span", { style: { color: '#9ca3af' }, children: [active.name.length, "/16"] })] }), _jsx("input", { type: "text", maxLength: 16, value: active.name, onChange: (e) => renamePatch(active.id, e.target.value), style: { width: '100%', fontSize: 13 } }), _jsx("span", { style: { fontSize: 10, color: '#6b7280' }, children: "max. 16 tekens (past op display)" })] }), _jsxs("div", { style: { fontSize: 12, color: '#6b7280', paddingBottom: 4 }, children: ["PC\u00A0", _jsx("strong", { style: { fontSize: 14, color: '#1f2933' }, children: active.id + 1 })] })] }) })), _jsx("h3", { style: { margin: '12px 0 8px 0' }, children: active ? `${active.name}` : 'Geen patch' }), ordered.length === 0 && (_jsx("div", { className: "es-empty", children: "Nog geen effectapparaten. Voeg ze toe in tab \u201CEffect-chain\u201D." })), ordered.length > 0 && (_jsxs("div", { className: "es-chain-view", children: [_jsx("div", { className: "es-arrow active", children: "IN \u25B6" }), ordered.map((d, i) => {
                                        const bypassed = bypassedSet.has(d.id);
                                        return (_jsxs("span", { style: { display: 'contents' }, children: [_jsxs("div", { className: `es-effect-card ${bypassed ? 'bypassed' : 'active'}`, onClick: () => active && toggleBypass(active.id, d.id), title: bypassed ? 'Klik om te activeren' : 'Klik om te bypassen', children: [d.imageDataUrl
                                                            ? _jsx("img", { src: d.imageDataUrl, alt: d.model, style: { width: '100%', height: 60, objectFit: 'contain', background: '#f5f7fa', borderRadius: 4 } })
                                                            : _jsx("div", { style: {
                                                                    height: 60, display: 'flex', alignItems: 'center',
                                                                    justifyContent: 'center', fontSize: 28, color: '#9ca3af',
                                                                }, children: "\uD83C\uDF9B\uFE0F" }), _jsx("div", { style: { fontWeight: 600, fontSize: 12, marginTop: 4 }, children: d.brand }), _jsx("div", { style: { fontSize: 11, color: '#4b5563' }, children: d.model }), _jsxs("div", { style: { fontSize: 10, color: '#6b7280', marginTop: 2 }, children: [catLabel.get(d.categoryId), " \u00B7 R", d.relayIndex >= 0 ? d.relayIndex + 1 : '?'] })] }), i < ordered.length - 1 && (_jsx("div", { className: `es-arrow ${!bypassed && !bypassedSet.has(ordered[i + 1].id) ? 'active' : ''}`, children: "\u25B6" }))] }, d.id));
                                    }), _jsx("div", { className: `es-arrow ${ordered.length > 0 && !bypassedSet.has(ordered[ordered.length - 1].id) ? 'active' : ''}`, children: "\u25B6 OUT" })] })), active && ordered.length > 0 && (_jsxs("div", { style: { marginTop: 12, fontSize: 12, color: '#4b5563' }, children: [_jsx("strong", { children: "Relais-masker:" }), ' ', _jsx("code", { children: formatRelayMask(active, project.devices, project.relayCount) })] }))] })] })] }));
}
function formatRelayMask(patch, devices, relayCount) {
    const bypassed = new Set(patch.bypassed);
    let mask = 0;
    for (const d of devices) {
        if (d.relayIndex < 0 || d.relayIndex >= relayCount)
            continue;
        if (!bypassed.has(d.id))
            mask |= (1 << d.relayIndex);
    }
    const hex = mask.toString(16).padStart(Math.ceil(relayCount / 4), '0').toUpperCase();
    const bin = mask.toString(2).padStart(relayCount, '0');
    return `0x${hex}  (${bin})`;
}
