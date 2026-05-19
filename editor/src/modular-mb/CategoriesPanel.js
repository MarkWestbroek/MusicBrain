import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Categorieën tab — bekijk/edit/voeg toe/verwijder ModuleCategory definitions.
import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
const KIND_OPTIONS = [
    'vco', 'vcf', 'vca',
    'mixer', 'mult', 'attenuator', 'breakout',
    'envelope', 'lfo',
    'midiRouter', 'sequencer',
    'effect', 'drum', 'noise', 'utility',
    'custom',
];
export function CategoriesPanel() {
    const project = useModularProject();
    const [newLabel, setNewLabel] = useState('');
    const [newKind, setNewKind] = useState('custom');
    function patchCategory(id, fn) {
        updateProject((p) => ({
            ...p,
            categories: p.categories.map((c) => (c.id === id ? fn(c) : c)),
        }));
    }
    function addCategory() {
        const label = newLabel.trim();
        if (!label) {
            alert('Geef de nieuwe categorie een naam.');
            return;
        }
        const id = uid('cat');
        const cat = { id, label, kind: newKind };
        updateProject((p) => ({ ...p, categories: [...p.categories, cat] }));
        setNewLabel('');
    }
    function removeCategory(id) {
        const inUse = project.moduleTypes.some((t) => t.categoryId === id);
        if (inUse) {
            alert('Categorie is in gebruik door één of meer ModuleTypes — verplaats die eerst.');
            return;
        }
        if (!confirm('Categorie verwijderen?'))
            return;
        updateProject((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== id) }));
    }
    return (_jsxs("div", { children: [_jsxs("p", { style: { color: '#6b7280', fontSize: 13, marginTop: 0 }, children: ["Categorie\u00EBn groeperen modules op type. ", _jsx("code", { children: "kind" }), " bepaalt de semantische rol (welke simulator wordt gebruikt, welke default CV- range, enz.). ", _jsx("code", { children: "label" }), " is alleen voor de UI."] }), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: { padding: '4px 8px' }, children: "Id" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Label" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Kind" }), _jsx("th", { style: { padding: '4px 8px' }, children: "CV-range" }), _jsx("th", { style: { padding: '4px 8px' }, children: "#types" }), _jsx("th", { style: { padding: '4px 8px' } })] }) }), _jsx("tbody", { children: project.categories.map((c) => {
                            const usage = project.moduleTypes.filter((t) => t.categoryId === c.id).length;
                            const isKnownKind = KIND_OPTIONS.includes(String(c.kind));
                            return (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: { padding: '4px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#475569' }, children: c.id }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "text", value: c.label, onChange: (e) => patchCategory(c.id, (cc) => ({ ...cc, label: e.target.value })), style: { width: '100%', fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsxs("select", { value: String(c.kind), onChange: (e) => patchCategory(c.id, (cc) => ({ ...cc, kind: e.target.value })), style: { fontSize: 12 }, children: [KIND_OPTIONS.map((k) => _jsx("option", { value: k, children: k }, k)), !isKnownKind && _jsxs("option", { value: String(c.kind), children: [String(c.kind), " (custom)"] })] }) }), _jsx("td", { style: { padding: '4px 8px', fontSize: 12, color: '#475569' }, children: _jsx(CvRangeEditor, { value: c.defaultCvRange, onChange: (rng) => patchCategory(c.id, (cc) => ({
                                                ...cc, defaultCvRange: rng,
                                            })) }) }), _jsx("td", { style: { padding: '4px 8px', fontSize: 12, color: '#475569', textAlign: 'center' }, children: usage }), _jsx("td", { style: { padding: '4px 8px', textAlign: 'right' }, children: _jsx("button", { onClick: () => removeCategory(c.id), disabled: usage > 0, title: usage > 0 ? `${usage} ModuleType(s) gebruiken deze categorie nog` : 'Verwijder categorie', style: { fontSize: 11 }, children: "Verwijder" }) })] }, c.id));
                        }) })] }), _jsxs("fieldset", { style: {
                    marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 6, padding: 10,
                }, children: [_jsx("legend", { style: { fontSize: 12, color: '#374151', padding: '0 6px' }, children: "Nieuwe categorie" }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }, children: [_jsxs("label", { children: ["Label:", _jsx("input", { type: "text", value: newLabel, onChange: (e) => setNewLabel(e.target.value), placeholder: "bv. Granular", style: { marginLeft: 4, fontSize: 13 } })] }), _jsxs("label", { children: ["Kind:", _jsx("select", { value: newKind, onChange: (e) => setNewKind(e.target.value), style: { marginLeft: 4, fontSize: 13 }, children: KIND_OPTIONS.map((k) => _jsx("option", { value: k, children: k }, k)) })] }), _jsx("button", { onClick: addCategory, style: { fontSize: 12 }, children: "+ Toevoegen" })] }), _jsxs("p", { style: { fontSize: 11, color: '#6b7280', marginBottom: 0, marginTop: 6 }, children: ["Tip: gebruik ", _jsx("code", { children: "custom" }), " als geen van de ingebouwde kinds past. De simulator behandelt onbekende kinds als pass-through."] })] })] }));
}
// ── CV-range editor (inline cell) ──────────────────────────────────────
function CvRangeEditor({ value, onChange }) {
    if (!value) {
        return (_jsx("button", { onClick: () => onChange({ min: -5, max: 5, bipolar: true }), style: { fontSize: 11 }, title: "Voeg een default CV-range toe voor deze categorie", children: "+ range" }));
    }
    return (_jsxs("span", { style: { display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11 }, children: [_jsx("input", { type: "number", step: "0.5", value: value.min, onChange: (e) => onChange({ ...value, min: Number(e.target.value) }), style: { width: 48, fontSize: 11 } }), _jsx("span", { children: "\u2026" }), _jsx("input", { type: "number", step: "0.5", value: value.max, onChange: (e) => onChange({ ...value, max: Number(e.target.value) }), style: { width: 48, fontSize: 11 } }), _jsx("span", { children: "V" }), _jsxs("label", { title: "Bipolair (centreert rond 0)", children: [_jsx("input", { type: "checkbox", checked: value.bipolar, onChange: (e) => onChange({ ...value, bipolar: e.target.checked }) }), "\u00B1"] }), _jsx("button", { onClick: () => onChange(undefined), style: { fontSize: 11 }, title: "Verwijder range", children: "\u00D7" })] }));
}
