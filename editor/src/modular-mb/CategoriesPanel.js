import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Categorieën tab — bekijk/edit ModuleCategory definitions.
// v0.1: read-only display with inline label rename.
import { updateProject, useModularProject } from './store';
export function CategoriesPanel() {
    const project = useModularProject();
    function renameCategory(id, label) {
        updateProject((p) => ({
            ...p,
            categories: p.categories.map((c) => (c.id === id ? { ...c, label } : c)),
        }));
    }
    return (_jsxs("div", { children: [_jsx("p", { style: { color: '#6b7280', fontSize: 13, marginTop: 0 }, children: "Categorie\u00EBn groeperen modules op type. Per categorie kun je standaard CV-ranges instellen die nieuwe modules erven." }), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: { padding: '4px 8px' }, children: "Id" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Label" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Kind" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Default CV range" })] }) }), _jsx("tbody", { children: project.categories.map((c) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: { padding: '4px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 11 }, children: c.id }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "text", value: c.label, onChange: (e) => renameCategory(c.id, e.target.value), style: { width: '100%', fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px', fontSize: 11, color: '#475569' }, children: c.kind }), _jsx("td", { style: { padding: '4px 8px', fontSize: 12, color: '#475569' }, children: c.defaultCvRange
                                        ? `${c.defaultCvRange.min}V .. ${c.defaultCvRange.max}V ${c.defaultCvRange.bipolar ? '(±)' : ''}`
                                        : '—' })] }, c.id))) })] })] }));
}
