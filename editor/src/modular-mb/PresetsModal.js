import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// PresetsModal — UI voor C2/C3 (iter-5.10).
//
// Eén modal met twee tabs:
//   • Patches  — sla huidige project op / laad een patch-preset (vervangt project)
//   • Modules  — kies een module in het project, sla zijn controlState op /
//                laad een module-preset van hetzelfde type
//
// Daarboven Import/Export voor de hele bibliotheek (.json).
import { useEffect, useState } from 'react';
import { setProject, useModularProject, getProject } from './store';
import { loadLibrary, savePatchPreset, deletePatchPreset, renamePatchPreset, saveModulePreset, deleteModulePreset, renameModulePreset, applyModulePreset, exportLibraryJson, importLibraryJson, factoryPatchPresets, factoryModulePresets, } from './presets';
export function PresetsModal({ onClose }) {
    const project = useModularProject();
    const [tab, setTab] = useState('patches');
    const [, setBump] = useState(0);
    const refresh = () => setBump((n) => n + 1);
    // ESC closes
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape')
                onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    const lib = loadLibrary();
    // ── Export / Import handlers ──────────────────────────────────────────
    function onExportLibrary() {
        const blob = new Blob([exportLibraryJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        a.href = url;
        a.download = `mmb-presets-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    function onImportLibrary(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = importLibraryJson(reader.result);
            if (!result) {
                alert('Ongeldig preset-bestand (verwacht mmb-presets v1).');
            }
            else {
                alert(`Geïmporteerd: ${result.patches} patch-preset(s), ${result.modules} module-preset(s).`);
                refresh();
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
    return (_jsx("div", { onClick: onClose, style: {
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                background: '#0f172a', color: '#e2e8f0',
                border: '1px solid #334155', borderRadius: 8,
                width: 'min(800px, 92vw)', maxHeight: '88vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                fontFamily: 'system-ui, sans-serif', fontSize: 13,
            }, children: [_jsxs("div", { style: {
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', borderBottom: '1px solid #334155',
                    }, children: [_jsx("strong", { style: { fontSize: 15 }, children: "\uD83D\uDCBE Presets" }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { style: btn, onClick: onExportLibrary, title: "Exporteer alle presets als .json", children: "\u2193 Export" }), _jsxs("label", { style: { ...btn, display: 'inline-block' }, title: "Importeer presets uit .json", children: ["\u2191 Import", _jsx("input", { type: "file", accept: ".json,application/json", style: { display: 'none' }, onChange: onImportLibrary })] }), _jsx("button", { style: { ...btn, color: '#fca5a5' }, onClick: onClose, children: "\u2715 Sluit" })] })] }), _jsx("div", { style: { display: 'flex', gap: 4, padding: '8px 16px 0', borderBottom: '1px solid #334155' }, children: ['patches', 'modules'].map((t) => (_jsx("button", { onClick: () => setTab(t), style: {
                            padding: '6px 14px',
                            borderRadius: '6px 6px 0 0',
                            border: '1px solid #334155',
                            borderBottom: 'none',
                            background: tab === t ? '#1e293b' : 'transparent',
                            color: tab === t ? '#fbbf24' : '#cbd5e1',
                            fontWeight: tab === t ? 600 : 400,
                            cursor: 'pointer', fontSize: 13,
                        }, children: t === 'patches' ? 'Patch presets' : 'Module presets' }, t))) }), _jsx("div", { style: { flex: 1, overflow: 'auto', padding: 16 }, children: tab === 'patches'
                        ? _jsx(PatchPresetsTab, { project: project, userPresets: lib.patches, onChange: refresh, onClose: onClose })
                        : _jsx(ModulePresetsTab, { userPresets: lib.modules, onChange: refresh }) })] }) }));
}
function PatchPresetsTab({ project, userPresets, onChange, onClose }) {
    const [name, setName] = useState('');
    function onSave() {
        const n = name.trim();
        if (!n) {
            alert('Geef de preset een naam.');
            return;
        }
        savePatchPreset(n, project, project.description);
        setName('');
        onChange();
    }
    function loadFactory(id) {
        const fp = factoryPatchPresets.find((x) => x.id === id);
        if (!fp)
            return;
        if (!confirm(`Huidige project vervangen door factory-preset "${fp.name}"?`))
            return;
        setProject(fp.apply());
        onClose();
    }
    function loadUser(p) {
        if (!confirm(`Huidige project vervangen door "${p.name}"?`))
            return;
        setProject(p.project);
        onClose();
    }
    function onDelete(p) {
        if (!confirm(`Preset "${p.name}" verwijderen?`))
            return;
        deletePatchPreset(p.id);
        onChange();
    }
    function onRename(p) {
        const next = prompt('Nieuwe naam:', p.name);
        if (next === null)
            return;
        renamePatchPreset(p.id, next);
        onChange();
    }
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("p", { style: { margin: 0, color: '#94a3b8' }, children: ["Een ", _jsx("em", { children: "patch-preset" }), " bewaart het complete project (alle modules, racks, patches, kabels en knopstanden). Laden vervangt het huidige project."] }), _jsxs("div", { style: section, children: [_jsx("div", { style: sectionTitle, children: "Huidig project opslaan als preset" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { type: "text", placeholder: "Preset-naam\u2026", value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    onSave(); }, style: input }), _jsx("button", { style: btnPrimary, onClick: onSave, children: "\uD83D\uDCBE Opslaan" })] }), _jsxs("div", { style: { fontSize: 11, color: '#64748b' }, children: [project.modules.length, " modules \u00B7 ", project.patches.length, " patch(es)"] })] }), _jsxs("div", { style: section, children: [_jsxs("div", { style: sectionTitle, children: ["Factory presets (", factoryPatchPresets.length, ")"] }), _jsx("ul", { style: list, children: factoryPatchPresets.map((fp) => (_jsxs("li", { style: listItem, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600 }, children: fp.name }), _jsx("div", { style: meta, children: fp.description })] }), _jsx("button", { style: btn, onClick: () => loadFactory(fp.id), children: "\u21BB Laden" })] }, fp.id))) })] }), _jsxs("div", { style: section, children: [_jsxs("div", { style: sectionTitle, children: ["Eigen presets (", userPresets.length, ")"] }), userPresets.length === 0 ? (_jsx("div", { style: { color: '#64748b', fontStyle: 'italic' }, children: "Nog geen eigen presets opgeslagen." })) : (_jsx("ul", { style: list, children: [...userPresets].sort((a, b) => b.createdAt - a.createdAt).map((p) => (_jsxs("li", { style: listItem, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600 }, children: p.name }), _jsxs("div", { style: meta, children: [p.project.modules.length, " modules \u00B7 ", new Date(p.createdAt).toLocaleString(), p.description ? ` · ${p.description}` : ''] })] }), _jsx("button", { style: btn, onClick: () => loadUser(p), children: "\u21BB Laden" }), _jsx("button", { style: btn, onClick: () => onRename(p), children: "\u270E" }), _jsx("button", { style: { ...btn, color: '#fca5a5' }, onClick: () => onDelete(p), children: "\u00D7" })] }, p.id))) }))] })] }));
}
function ModulePresetsTab({ userPresets, onChange }) {
    const project = useModularProject();
    const activePatch = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const moduleOptions = project.modules.map((m) => {
        const t = project.moduleTypes.find((x) => x.id === m.typeId);
        return {
            id: m.id, typeId: m.typeId,
            label: `${m.name} ${t ? `(${t.variant})` : ''}`.trim(),
        };
    });
    const [selectedModuleId, setSelectedModuleId] = useState(moduleOptions[0]?.id ?? '');
    const [name, setName] = useState('');
    const selectedModule = project.modules.find((m) => m.id === selectedModuleId);
    const selectedType = selectedModule
        ? project.moduleTypes.find((t) => t.id === selectedModule.typeId)
        : undefined;
    const currentValues = (activePatch && selectedModuleId)
        ? (activePatch.controlState[selectedModuleId] ?? {})
        : {};
    // Combine factory + user presets, filtered by selected module's typeId.
    const matchingFactory = selectedModule
        ? factoryModulePresets.filter((p) => p.typeId === selectedModule.typeId)
        : [];
    const matchingUser = selectedModule
        ? userPresets.filter((p) => p.typeId === selectedModule.typeId)
        : [];
    function onSave() {
        if (!selectedModule || !activePatch) {
            alert('Geen actieve module/patch.');
            return;
        }
        const n = name.trim();
        if (!n) {
            alert('Geef de preset een naam.');
            return;
        }
        saveModulePreset(n, selectedModule.typeId, currentValues);
        setName('');
        onChange();
    }
    function onLoad(preset) {
        if (!selectedModule)
            return;
        const next = applyModulePreset(getProject(), preset, selectedModule.id);
        if (!next) {
            alert('Kon preset niet toepassen (verkeerd module-type of geen actieve patch).');
            return;
        }
        setProject(next);
    }
    function onDelete(preset) {
        if (!confirm(`Module-preset "${preset.name}" verwijderen?`))
            return;
        deleteModulePreset(preset.id);
        onChange();
    }
    function onRename(preset) {
        const next = prompt('Nieuwe naam:', preset.name);
        if (next === null)
            return;
        renameModulePreset(preset.id, next);
        onChange();
    }
    if (moduleOptions.length === 0) {
        return _jsx("div", { style: { color: '#94a3b8' }, children: "Geen modules in het project." });
    }
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("p", { style: { margin: 0, color: '#94a3b8' }, children: ["Een ", _jsx("em", { children: "module-preset" }), " bewaart enkel de knopstanden van \u00E9\u00E9n module. Laden kopieert de waarden naar de geselecteerde module van hetzelfde type."] }), _jsxs("div", { style: section, children: [_jsx("div", { style: sectionTitle, children: "Doel-module" }), _jsx("select", { value: selectedModuleId, onChange: (e) => setSelectedModuleId(e.target.value), style: { ...input, width: '100%' }, children: moduleOptions.map((o) => (_jsx("option", { value: o.id, children: o.label }, o.id))) }), _jsxs("div", { style: meta, children: ["Type: ", selectedType ? `${selectedType.id} (${selectedType.variant})` : '—', " \u00B7 Controls: ", Object.keys(currentValues).length] })] }), _jsxs("div", { style: section, children: [_jsx("div", { style: sectionTitle, children: "Huidige knopstand opslaan" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { type: "text", placeholder: "Preset-naam\u2026", value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    onSave(); }, style: input }), _jsx("button", { style: btnPrimary, onClick: onSave, children: "\uD83D\uDCBE Opslaan" })] })] }), _jsxs("div", { style: section, children: [_jsxs("div", { style: sectionTitle, children: ["Factory (", matchingFactory.length, ")"] }), matchingFactory.length === 0 ? (_jsx("div", { style: { color: '#64748b', fontStyle: 'italic' }, children: "Geen factory-presets voor dit module-type." })) : (_jsx("ul", { style: list, children: matchingFactory.map((p) => (_jsxs("li", { style: listItem, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600 }, children: p.name }), _jsx("div", { style: meta, children: p.description })] }), _jsx("button", { style: btn, onClick: () => onLoad(p), children: "\u21BB Laden" })] }, p.id))) }))] }), _jsxs("div", { style: section, children: [_jsxs("div", { style: sectionTitle, children: ["Eigen (", matchingUser.length, ")"] }), matchingUser.length === 0 ? (_jsx("div", { style: { color: '#64748b', fontStyle: 'italic' }, children: "Geen eigen presets voor dit type." })) : (_jsx("ul", { style: list, children: [...matchingUser].sort((a, b) => b.createdAt - a.createdAt).map((p) => (_jsxs("li", { style: listItem, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 600 }, children: p.name }), _jsx("div", { style: meta, children: new Date(p.createdAt).toLocaleString() })] }), _jsx("button", { style: btn, onClick: () => onLoad(p), children: "\u21BB Laden" }), _jsx("button", { style: btn, onClick: () => onRename(p), children: "\u270E" }), _jsx("button", { style: { ...btn, color: '#fca5a5' }, onClick: () => onDelete(p), children: "\u00D7" })] }, p.id))) }))] })] }));
}
// ═══════════════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════════════
const btn = {
    padding: '4px 10px', background: '#1e293b', color: '#e2e8f0',
    border: '1px solid #334155', borderRadius: 4, cursor: 'pointer',
    fontSize: 12,
};
const btnPrimary = {
    ...btn, background: '#fbbf24', color: '#0f172a', borderColor: '#fbbf24',
    fontWeight: 600,
};
const input = {
    flex: 1, padding: '4px 8px', background: '#1e293b', color: '#e2e8f0',
    border: '1px solid #334155', borderRadius: 4, fontSize: 13,
};
const section = {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 10, background: '#1e293b', border: '1px solid #334155',
    borderRadius: 6,
};
const sectionTitle = {
    fontSize: 11, color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 0.5, fontWeight: 600,
};
const list = {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'flex', flexDirection: 'column', gap: 4,
};
const listItem = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 8px', background: '#0f172a',
    border: '1px solid #334155', borderRadius: 4,
};
const meta = {
    fontSize: 11, color: '#64748b',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
