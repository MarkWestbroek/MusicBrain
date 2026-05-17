import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { addCategory, removeCategory, renameCategory } from './actions';
import { useProject } from './store';
export function CategoriesPanel() {
    const project = useProject();
    const [draft, setDraft] = useState('');
    function commitAdd() {
        if (!draft.trim())
            return;
        addCategory(draft);
        setDraft('');
    }
    return (_jsxs("section", { children: [_jsx("p", { style: { color: '#4b5563', fontSize: 13 }, children: "Categorie\u00EBn worden gebruikt om effectapparaten te groeperen. Een categorie kan alleen verwijderd worden als geen enkel apparaat hem nog gebruikt." }), _jsxs("div", { className: "es-toolbar", children: [_jsx("input", { type: "text", placeholder: "Nieuwe categorie\u2026", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                            commitAdd(); }, style: { minWidth: 220 } }), _jsx("button", { className: "primary", onClick: commitAdd, children: "Toevoegen" })] }), _jsx("div", { className: "es-cat-list", children: project.categories.map((c) => {
                    const inUse = project.devices.some((d) => d.categoryId === c.id);
                    return (_jsxs("div", { className: "es-cat-item", children: [_jsx("input", { value: c.label, onChange: (e) => renameCategory(c.id, e.target.value) }), _jsx("span", { style: { fontSize: 11, color: '#6b7280' }, children: inUse ? '(in gebruik)' : '' }), _jsx("button", { className: "danger", disabled: inUse, onClick: () => removeCategory(c.id), title: inUse ? 'In gebruik door één of meer apparaten' : 'Verwijderen', style: { padding: '2px 8px', fontSize: 12 }, children: "\u2715" })] }, c.id));
                }) })] }));
}
