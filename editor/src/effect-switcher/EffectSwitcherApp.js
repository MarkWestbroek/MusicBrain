import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { CategoriesPanel } from './CategoriesPanel';
import { ChainPanel } from './ChainPanel';
import { PatchesPanel } from './PatchesPanel';
import { SimulationPanel } from './SimulationPanel';
import { resetProject, seedDemo } from './actions';
import { useProject } from './store';
import './styles.css';
export function EffectSwitcherApp() {
    const project = useProject();
    const [tab, setTab] = useState('patches');
    return (_jsxs("div", { className: "es-app", children: [_jsxs("div", { className: "es-tabs", children: [_jsx("button", { className: "es-tab", "aria-selected": tab === 'patches', onClick: () => setTab('patches'), children: "Patches" }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'chain', onClick: () => setTab('chain'), children: "Effect-chain" }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'categories', onClick: () => setTab('categories'), children: "Categorie\u00EBn" }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'simulation', onClick: () => setTab('simulation'), children: "Simulatie" }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }, children: [_jsxs("span", { style: { fontSize: 11, color: '#6b7280' }, children: [project.devices.length, " apparaten \u00B7 ", project.patches.length, " patches \u00B7 ", project.relayCount, " relais"] }), _jsx("button", { onClick: seedDemo, style: { fontSize: 12 }, title: "Vervang met 5 demo-pedalen en 5 patches", children: "Demo laden" }), _jsx("button", { className: "es-tab", onClick: () => {
                                    if (confirm('Project wissen?'))
                                        resetProject();
                                }, style: { fontSize: 12, color: '#b91c1c' }, children: "Reset" })] })] }), tab === 'patches' && _jsx(PatchesPanel, {}), tab === 'chain' && _jsx(ChainPanel, {}), tab === 'categories' && _jsx(CategoriesPanel, {}), tab === 'simulation' && _jsx(SimulationPanel, {})] }));
}
