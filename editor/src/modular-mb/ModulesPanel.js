import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Modules tab — manages the two middle layers of the v2 model:
//   • ModuleType  — template: which ports and controls (e.g. "ladder VCF")
//   • Module      — concrete realisation: brand, model, panel visual
//
// Layout: split-pane. Left = ModuleTypes list, right = Modules list.
// Selecting a type filters the Modules table to instances of that type.
import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { MM_PER_HP, } from './types';
export function ModulesPanel() {
    const project = useModularProject();
    const [selTypeId, setSelTypeId] = useState(null);
    const [selModuleId, setSelModuleId] = useState(null);
    const selType = project.moduleTypes.find((t) => t.id === selTypeId) ?? null;
    const selModule = project.modules.find((m) => m.id === selModuleId) ?? null;
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }, children: [_jsx(TypesPane, { categories: project.categories, types: project.moduleTypes, selectedId: selTypeId, onSelect: setSelTypeId }), _jsx(ModulesPane, { types: project.moduleTypes, modules: project.modules, filterTypeId: selTypeId, selectedId: selModuleId, onSelect: setSelModuleId })] }), selType && (_jsx(TypeEditor, { type: selType, categories: project.categories })), selModule && (_jsx(ModuleEditor, { module: selModule, types: project.moduleTypes }))] }));
}
// ── ModuleType list + create ───────────────────────────────────────────
function TypesPane({ categories, types, selectedId, onSelect, }) {
    const [newCatId, setNewCatId] = useState(categories[0]?.id ?? '');
    const [newVariant, setNewVariant] = useState('');
    function addType() {
        if (!newCatId)
            return;
        const t = {
            id: uid('type'),
            categoryId: newCatId,
            variant: newVariant.trim() || `Nieuw type ${types.length + 1}`,
            ports: [],
            controls: [],
        };
        updateProject((p) => ({ ...p, moduleTypes: [...p.moduleTypes, t] }));
        setNewVariant('');
        onSelect(t.id);
    }
    function removeType(id) {
        if (!confirm('Type verwijderen? Modules van dit type behouden hun typeId maar verwijzen naar niets.'))
            return;
        updateProject((p) => ({ ...p, moduleTypes: p.moduleTypes.filter((t) => t.id !== id) }));
        if (selectedId === id)
            onSelect(null);
    }
    return (_jsxs("section", { style: paneStyle, children: [_jsx("h3", { style: paneH3, children: "ModuleTypes" }), _jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 8 }, children: [_jsx("select", { value: newCatId, onChange: (e) => setNewCatId(e.target.value), style: { fontSize: 12 }, children: categories.map((c) => _jsx("option", { value: c.id, children: c.label }, c.id)) }), _jsx("input", { type: "text", placeholder: "Variant (b.v. ladder)", value: newVariant, onChange: (e) => setNewVariant(e.target.value), style: { flex: 1, fontSize: 12 } }), _jsx("button", { onClick: addType, style: { fontSize: 12 }, children: "+ Type" })] }), _jsxs("table", { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: th, children: "Categorie" }), _jsx("th", { style: th, children: "Variant" }), _jsx("th", { style: th, children: "Ports/Ctrls" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [types.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, style: { color: '#6b7280', padding: 8 }, children: "Nog geen types. Maak een type aan om concrete modules erop te baseren." }) })), types.map((t) => {
                                const cat = categories.find((c) => c.id === t.categoryId);
                                const isSel = selectedId === t.id;
                                return (_jsxs("tr", { onClick: () => onSelect(isSel ? null : t.id), style: {
                                        background: isSel ? '#eff6ff' : undefined,
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f3f4f6',
                                    }, children: [_jsx("td", { style: td, children: cat?.label ?? t.categoryId }), _jsx("td", { style: td, children: t.variant }), _jsxs("td", { style: td, children: [t.ports.length, " / ", t.controls.length] }), _jsx("td", { style: { ...td, textAlign: 'right' }, children: _jsx("button", { onClick: (e) => { e.stopPropagation(); removeType(t.id); }, style: { fontSize: 11 }, children: "\u00D7" }) })] }, t.id));
                            })] })] })] }));
}
// ── Module list + create ────────────────────────────────────────────────
function ModulesPane({ types, modules, filterTypeId, selectedId, onSelect, }) {
    const [pickedTypeId, setPickedTypeId] = useState(types[0]?.id ?? '');
    const shown = filterTypeId ? modules.filter((m) => m.typeId === filterTypeId) : modules;
    function addModule() {
        const typeId = filterTypeId ?? pickedTypeId;
        if (!typeId)
            return;
        const t = types.find((x) => x.id === typeId);
        if (!t)
            return;
        const m = {
            id: uid('mod'),
            typeId,
            internal: false,
            name: `${t.variant} ${modules.filter((x) => x.typeId === typeId).length + 1}`,
            visual: {
                hpWidth: Math.max(6, Math.min(20, t.controls.length + 4)),
                texture: 'aluminum',
                controlPlacements: autoPlaceControls(t.controls, Math.max(6, Math.min(20, t.controls.length + 4))),
                portPlacements: autoPlacePorts(t.ports, Math.max(6, Math.min(20, t.controls.length + 4))),
            },
        };
        updateProject((p) => ({ ...p, modules: [...p.modules, m] }));
        onSelect(m.id);
    }
    function removeModule(id) {
        if (!confirm('Module verwijderen? Eventuele rack-slots en patch-verbindingen ernaartoe blijven verwijzen.'))
            return;
        updateProject((p) => ({ ...p, modules: p.modules.filter((m) => m.id !== id) }));
        if (selectedId === id)
            onSelect(null);
    }
    function rename(id, name) {
        updateProject((p) => ({
            ...p,
            modules: p.modules.map((m) => m.id === id ? { ...m, name } : m),
        }));
    }
    return (_jsxs("section", { style: paneStyle, children: [_jsxs("h3", { style: paneH3, children: ["Modules", filterTypeId ? ' (gefilterd op geselecteerd type)' : ''] }), _jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 8 }, children: [!filterTypeId && (_jsx("select", { value: pickedTypeId, onChange: (e) => setPickedTypeId(e.target.value), style: { fontSize: 12, flex: 1 }, disabled: types.length === 0, children: types.length === 0
                            ? _jsx("option", { children: "(eerst type aanmaken)" })
                            : types.map((t) => _jsx("option", { value: t.id, children: t.variant }, t.id)) })), _jsxs("button", { onClick: addModule, disabled: types.length === 0, style: { fontSize: 12 }, children: ["+ Module", filterTypeId ? ' van type' : ''] })] }), _jsxs("table", { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: th, children: "Naam" }), _jsx("th", { style: th, children: "Type" }), _jsx("th", { style: th, children: "HP" }), _jsx("th", { style: th, children: "I/O" }), _jsx("th", {})] }) }), _jsxs("tbody", { children: [shown.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, style: { color: '#6b7280', padding: 8 }, children: "Nog geen modules." }) })), shown.map((m) => {
                                const t = types.find((x) => x.id === m.typeId);
                                const isSel = selectedId === m.id;
                                const portCount = (m.portsOverride ?? t?.ports ?? []).length;
                                return (_jsxs("tr", { onClick: () => onSelect(isSel ? null : m.id), style: {
                                        background: isSel ? '#eff6ff' : (m.internal ? '#fefce8' : undefined),
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f3f4f6',
                                    }, children: [_jsx("td", { style: td, children: _jsx("input", { type: "text", value: m.name, onChange: (e) => rename(m.id, e.target.value), onClick: (e) => e.stopPropagation(), style: { width: '100%', fontSize: 12, border: 'none', background: 'transparent' } }) }), _jsx("td", { style: td, children: t?.variant ?? _jsx("span", { style: { color: '#dc2626' }, children: "?" }) }), _jsx("td", { style: td, children: m.visual.hpWidth }), _jsx("td", { style: td, children: portCount }), _jsx("td", { style: { ...td, textAlign: 'right' }, children: _jsx("button", { onClick: (e) => { e.stopPropagation(); removeModule(m.id); }, style: { fontSize: 11 }, children: "\u00D7" }) })] }, m.id));
                            })] })] })] }));
}
// ── Type editor (ports + controls CRUD) ────────────────────────────────
function TypeEditor({ type: t, categories }) {
    function update(fn) {
        updateProject((p) => ({
            ...p,
            moduleTypes: p.moduleTypes.map((x) => x.id === t.id ? fn(x) : x),
        }));
    }
    function addPort(direction) {
        const port = {
            id: uid('p'),
            name: direction === 'in' ? 'In' : 'Out',
            signalType: 'cv',
            direction,
        };
        update((x) => ({ ...x, ports: [...x.ports, port] }));
    }
    function removePort(id) {
        update((x) => ({ ...x, ports: x.ports.filter((p) => p.id !== id) }));
    }
    function patchPort(id, patch) {
        update((x) => ({
            ...x,
            ports: x.ports.map((p) => p.id === id ? { ...p, ...patch } : p),
        }));
    }
    function addControl(kind) {
        const id = uid('c');
        let c;
        switch (kind) {
            case 'knob':
                c = { kind: 'knob', id, label: 'Knob', min: 0, max: 1, defaultValue: 0.5, style: 'generic', size: 'medium' };
                break;
            case 'slider':
                c = { kind: 'slider', id, label: 'Slider', min: 0, max: 1, defaultValue: 0.5, orientation: 'v' };
                break;
            case 'toggle':
                c = { kind: 'toggle', id, label: 'Toggle', defaultValue: false };
                break;
            case 'switch':
                c = { kind: 'switch', id, label: 'Switch', positions: ['A', 'B', 'C'], defaultIndex: 0 };
                break;
            case 'button':
                c = { kind: 'button', id, label: 'Btn', momentary: true, style: 'momentary' };
                break;
            case 'joystick':
                c = { kind: 'joystick', id, label: 'Joy', axes: ['x', 'y'], defaultValue: { x: 0, y: 0 } };
                break;
            case 'exotic':
                c = { kind: 'exotic', id, label: 'X', defaultValue: 0, description: '' };
                break;
        }
        update((x) => ({ ...x, controls: [...x.controls, c] }));
    }
    function removeControl(id) {
        update((x) => ({ ...x, controls: x.controls.filter((c) => c.id !== id) }));
    }
    function patchControl(id, patch) {
        update((x) => ({
            ...x,
            controls: x.controls.map((c) => c.id === id ? { ...c, ...patch } : c),
        }));
    }
    return (_jsxs("section", { style: editorStyle, children: [_jsxs("h3", { style: editorH3, children: ["Type-editor: ", t.variant] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }, children: [_jsxs("label", { style: lbl, children: ["Categorie:", _jsx("select", { value: t.categoryId, onChange: (e) => update((x) => ({ ...x, categoryId: e.target.value })), style: { marginLeft: 4, fontSize: 12 }, children: categories.map((c) => _jsx("option", { value: c.id, children: c.label }, c.id)) })] }), _jsxs("label", { style: lbl, children: ["Variant:", _jsx("input", { type: "text", value: t.variant, onChange: (e) => update((x) => ({ ...x, variant: e.target.value })), style: { marginLeft: 4, fontSize: 12 } })] })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }, children: [_jsx("strong", { style: { fontSize: 12 }, children: "Ports" }), _jsx("button", { onClick: () => addPort('in'), style: { fontSize: 11 }, children: "+ In" }), _jsx("button", { onClick: () => addPort('out'), style: { fontSize: 11 }, children: "+ Out" })] }), _jsxs("table", { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: '#6b7280', textAlign: 'left' }, children: [_jsx("th", { style: th, children: "Dir" }), _jsx("th", { style: th, children: "Naam" }), _jsx("th", { style: th, children: "Signaal" }), _jsx("th", {})] }) }), _jsx("tbody", { children: t.ports.map((p) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: td, children: p.direction }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: p.name, onChange: (e) => patchPort(p.id, { name: e.target.value }), style: { fontSize: 12, width: '100%' } }) }), _jsx("td", { style: td, children: _jsx("select", { value: p.signalType, onChange: (e) => patchPort(p.id, { signalType: e.target.value }), style: { fontSize: 12 }, children: ['cv', 'gate', 'trigger', 'audio', 'midi'].map((s) => _jsx("option", { value: s, children: s }, s)) }) }), _jsx("td", { style: { ...td, textAlign: 'right' }, children: _jsx("button", { onClick: () => removePort(p.id), style: { fontSize: 11 }, children: "\u00D7" }) })] }, p.id))) })] })] }), _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }, children: [_jsx("strong", { style: { fontSize: 12 }, children: "Controls" }), ['knob', 'slider', 'toggle', 'switch', 'button', 'joystick', 'exotic'].map((k) => _jsxs("button", { onClick: () => addControl(k), style: { fontSize: 11 }, children: ["+ ", k] }, k))] }), _jsxs("table", { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: '#6b7280', textAlign: 'left' }, children: [_jsx("th", { style: th, children: "Kind" }), _jsx("th", { style: th, children: "Label" }), _jsx("th", { style: th, children: "Details" }), _jsx("th", {})] }) }), _jsx("tbody", { children: t.controls.map((c) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: td, children: c.kind }), _jsx("td", { style: td, children: _jsx("input", { type: "text", value: c.label, onChange: (e) => patchControl(c.id, { label: e.target.value }), style: { fontSize: 12, width: '100%' } }) }), _jsx("td", { style: { ...td, color: '#6b7280', fontSize: 11 }, children: controlDetail(c) }), _jsx("td", { style: { ...td, textAlign: 'right' }, children: _jsx("button", { onClick: () => removeControl(c.id), style: { fontSize: 11 }, children: "\u00D7" }) })] }, c.id))) })] })] })] }));
}
function controlDetail(c) {
    switch (c.kind) {
        case 'knob':
        case 'slider': return `${c.min}..${c.max}, default ${c.defaultValue}`;
        case 'exotic': return `default ${c.defaultValue}${c.description ? ' — ' + c.description : ''}`;
        case 'toggle': return `default ${c.defaultValue}`;
        case 'switch': return `${c.positions.length} posities`;
        case 'button': return c.momentary ? 'momentary' : 'latching';
        case 'joystick': return `xy default (${c.defaultValue.x}, ${c.defaultValue.y})`;
        case 'display': return `${c.digits} digits${c.bindTo ? ` → ${c.bindTo}` : ''}`;
        case 'led': return c.bindTo ? `bound to ${c.bindTo}` : 'static';
    }
}
// ── Module editor: name/brand/visual + live panel preview ──────────────
function ModuleEditor({ module: m, types }) {
    function patch(fn) {
        updateProject((p) => ({
            ...p,
            modules: p.modules.map((x) => x.id === m.id ? fn(x) : x),
        }));
    }
    return (_jsxs("section", { style: editorStyle, children: [_jsxs("h3", { style: editorH3, children: ["Module-editor: ", m.name] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, children: [_jsxs("label", { style: lbl, children: ["Naam:", _jsx("input", { value: m.name, onChange: (e) => patch((x) => ({ ...x, name: e.target.value })), style: inp })] }), _jsxs("label", { style: lbl, children: ["Type:", _jsx("select", { value: m.typeId, onChange: (e) => patch((x) => ({ ...x, typeId: e.target.value })), style: { marginLeft: 4, fontSize: 12 }, children: types.map((t) => _jsx("option", { value: t.id, children: t.variant }, t.id)) })] }), _jsxs("label", { style: lbl, children: ["Brand:", _jsx("input", { value: m.brand ?? '', placeholder: "(optioneel)", onChange: (e) => patch((x) => ({ ...x, brand: e.target.value || undefined })), style: inp })] }), _jsxs("label", { style: lbl, children: ["Model:", _jsx("input", { value: m.modelNumber ?? '', placeholder: "(optioneel)", onChange: (e) => patch((x) => ({ ...x, modelNumber: e.target.value || undefined })), style: inp })] }), _jsxs("label", { style: lbl, children: [_jsx("input", { type: "checkbox", checked: m.internal, onChange: (e) => patch((x) => ({ ...x, internal: e.target.checked })) }), "\u00A0Intern (brain levert dit)"] })] }), _jsxs("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }, children: [_jsxs("label", { style: lbl, children: ["HP:", _jsx("input", { type: "number", min: 2, max: 84, value: m.visual.hpWidth, onChange: (e) => patch((x) => ({
                                                    ...x,
                                                    visual: { ...x.visual, hpWidth: Math.max(2, Math.min(84, Number(e.target.value) || 2)) },
                                                })), style: { ...inp, width: 60 } })] }), _jsxs("label", { style: lbl, children: ["Textuur:", _jsx("select", { value: m.visual.texture, onChange: (e) => patch((x) => ({
                                                    ...x,
                                                    visual: { ...x.visual, texture: e.target.value },
                                                })), style: { marginLeft: 4, fontSize: 12 }, children: ['aluminum', 'pcb-black', 'mi-cream', 'gold-plate', 'wood'].map((tx) => _jsx("option", { value: tx, children: tx }, tx)) })] }), _jsx("button", { onClick: () => {
                                            const t = types.find((x) => x.id === m.typeId);
                                            if (!t)
                                                return;
                                            patch((x) => ({
                                                ...x,
                                                visual: {
                                                    ...x.visual,
                                                    controlPlacements: autoPlaceControls(x.controlsOverride ?? t.controls, x.visual.hpWidth),
                                                    portPlacements: autoPlacePorts(x.portsOverride ?? t.ports, x.visual.hpWidth),
                                                },
                                            }));
                                        }, style: { fontSize: 12 }, children: "Auto-layout" })] }), _jsx("textarea", { placeholder: "Notities\u2026", value: m.notes ?? '', onChange: (e) => patch((x) => ({ ...x, notes: e.target.value || undefined })), style: { width: '100%', minHeight: 50, fontSize: 12 } })] }), _jsx("div", { style: { background: '#1f2937', padding: 8, borderRadius: 6, alignSelf: 'start' }, children: _jsx(ModulePanel, { module: m, types: types, pxPerMm: 2.4 }) })] })] }));
}
// ── Auto-layout helpers ────────────────────────────────────────────────
//
// Lays controls in a grid roughly in the top half, ports in a column near
// the bottom. Designed only for "looks reasonable out of the box"; user
// can later drag in a dedicated editor.
function autoPlaceControls(controls, hpWidth) {
    const widthMm = hpWidth * MM_PER_HP;
    const cols = Math.max(1, Math.min(controls.length, Math.floor(widthMm / 14)));
    const cellW = widthMm / cols;
    const out = {};
    controls.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        out[c.id] = { x: cellW * (col + 0.5), y: 20 + row * 22 };
    });
    return out;
}
function autoPlacePorts(ports, hpWidth) {
    const widthMm = hpWidth * MM_PER_HP;
    const cols = Math.max(1, Math.min(ports.length, Math.floor(widthMm / 8)));
    const cellW = widthMm / cols;
    const out = {};
    ports.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        out[p.id] = { x: cellW * (col + 0.5), y: 95 + row * 12, labelPos: 'above' };
    });
    return out;
}
// ── Styles ─────────────────────────────────────────────────────────────
const paneStyle = {
    border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: '#ffffff',
};
const paneH3 = {
    marginTop: 0, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', color: '#374151',
};
const editorStyle = {
    border: '1px solid #cbd2d9', borderRadius: 6, padding: 12,
    background: '#f8fafc', marginBottom: 12,
};
const editorH3 = {
    marginTop: 0, marginBottom: 10, fontSize: 13, color: '#1f2937',
};
const th = { padding: '4px 6px', fontWeight: 500 };
const td = { padding: '4px 6px' };
const lbl = { fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' };
const inp = { marginLeft: 4, fontSize: 12 };
