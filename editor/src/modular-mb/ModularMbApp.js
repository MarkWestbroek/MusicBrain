import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.
import { useState } from 'react';
import { useModularProject } from './store';
import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { PatcherPanel } from './PatcherPanel';
import { SimulationPanel } from './SimulationPanel';
const TABS = [
    { id: 'patches', label: 'Patches' },
    { id: 'modules', label: 'Modules' },
    { id: 'categories', label: 'Categorieën' },
    { id: 'patcher', label: 'Patcher' },
    { id: 'simulation', label: 'Simulatie' },
];
export function ModularMbApp() {
    const project = useModularProject();
    const [tab, setTab] = useState('patcher');
    return (_jsxs("section", { style: { fontFamily: 'system-ui, sans-serif' }, children: [_jsxs("div", { style: {
                    display: 'flex', alignItems: 'baseline', gap: 12,
                    padding: '4px 0 8px', borderBottom: '1px solid #e2e8f0', marginBottom: 12,
                }, children: [_jsx("strong", { style: { fontSize: 14 }, children: project.name }), _jsxs("span", { style: { fontSize: 11, color: '#6b7280' }, children: [project.modules.length, " modules \u00B7 ", project.patches.length, " patches"] })] }), _jsx("nav", { style: { display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12 }, children: TABS.map((t) => (_jsx("button", { onClick: () => setTab(t.id), "aria-selected": tab === t.id, style: {
                        padding: '6px 14px',
                        borderRadius: '6px 6px 0 0',
                        border: '1px solid #cbd2d9',
                        borderBottom: 'none',
                        background: tab === t.id ? '#ffffff' : '#f5f7fa',
                        fontWeight: tab === t.id ? 600 : 400,
                        cursor: 'pointer',
                        fontSize: 13,
                        position: 'relative',
                        top: tab === t.id ? 1 : 0,
                    }, children: t.label }, t.id))) }), tab === 'patches' && _jsx(PatchesPanel, {}), tab === 'modules' && _jsx(ModulesPanel, {}), tab === 'categories' && _jsx(CategoriesPanel, {}), tab === 'patcher' && _jsx(PatcherPanel, {}), tab === 'simulation' && _jsx(SimulationPanel, {})] }));
}
