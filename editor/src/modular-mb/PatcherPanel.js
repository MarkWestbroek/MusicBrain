import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Patcher tab — hosts two interchangeable views on the same patch model:
//   • Graph view  (PatcherGraphPanel)  — draw cables between modules
//   • Matrix view (PatcherMatrixPanel) — source × destination grid
//
// Both views read/write the same `PatchConnection[]` array; switching is
// purely a presentation choice (model-view-controller pattern).
import { useState } from 'react';
import { useModularProject } from './store';
import { PatcherGraphPanel } from './PatcherGraphPanel';
import { PatcherMatrixPanel } from './PatcherMatrixPanel';
export function PatcherPanel() {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const [view, setView] = useState('graph');
    if (!patch) {
        return (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Selecteer eerst een patch in de Patches-tab (of maak er een aan)." }));
    }
    const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
    const totalSlots = racks.reduce((n, r) => n + r.slots.length, 0);
    if (racks.length === 0 || totalSlots === 0) {
        return (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "De geselecteerde racks zijn leeg of niet meer aanwezig. Vink in de Patches-tab de juiste racks aan en plaats modules in de Rack-tab." }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }, children: [_jsxs("span", { style: { fontSize: 13, color: '#475569' }, children: ["Patch: ", _jsx("strong", { children: patch.name }), " \u00A0\u00B7\u00A0 ", patch.connections.length, " verbindingen"] }), _jsx("div", { style: {
                            marginLeft: 'auto', display: 'flex', gap: 0,
                            border: '1px solid #cbd2d9', borderRadius: 6, overflow: 'hidden',
                        }, children: ['graph', 'matrix'].map((v) => (_jsx("button", { onClick: () => setView(v), style: {
                                padding: '4px 12px',
                                border: 'none',
                                background: view === v ? '#2563eb' : '#f5f7fa',
                                color: view === v ? 'white' : '#1f2933',
                                fontSize: 12,
                                fontWeight: view === v ? 600 : 400,
                                cursor: 'pointer',
                            }, children: v === 'graph' ? 'Graph' : 'Matrix' }, v))) })] }), view === 'graph' && _jsx(PatcherGraphPanel, { patchId: patch.id }), view === 'matrix' && _jsx(PatcherMatrixPanel, { patchId: patch.id })] }));
}
