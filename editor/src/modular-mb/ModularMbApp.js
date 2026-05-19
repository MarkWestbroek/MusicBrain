import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.
//
// Project bar (name / version / description) is analogous to the ES project
// bar and reuses the same `.es-projectbar*` CSS classes.
import { useRef, useState } from 'react';
import { setProject, updateProject, useModularProject, getProject } from './store';
import { emptyModularProject } from './types';
import { seedExampleModules } from './seedModules';
import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { RackPanel } from './RackPanel';
import { PatcherPanel } from './PatcherPanel';
import { SimulationPanel } from './SimulationPanel';
// Reuse the ES project-bar CSS classes (.es-projectbar*) — same visual language.
import '../effect-switcher/styles.css';
const TABS = [
    { id: 'patches', label: 'Patches' },
    { id: 'modules', label: 'Modules' },
    { id: 'rack', label: 'Rack' },
    { id: 'categories', label: 'Categorieën' },
    { id: 'patcher', label: 'Patcher' },
    { id: 'simulation', label: 'Simulatie' },
];
export function ModularMbApp() {
    const project = useModularProject();
    const [tab, setTab] = useState('patcher');
    const [editingName, setEditingName] = useState(false);
    const [editingVer, setEditingVer] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const importRef = useRef(null);
    // ─── Filename: yyyy-mm-dd-hhmmss-Naam-vVersie-(Opmerking).json ───────
    function defaultFilename() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const safeName = (project.name || 'mmb').replace(/[^a-z0-9._-]+/gi, '_');
        const ver = project.configVersion ? `-v${project.configVersion}` : '';
        let desc = '';
        if (project.description) {
            const firstLine = project.description.split(/\r?\n/)[0] ?? '';
            const safe = firstLine.replace(/[^a-z0-9 ._-]+/gi, '_').trim().slice(0, 32).trimEnd();
            if (safe)
                desc = `-(${safe})`;
        }
        return `${date}-${time}-${safeName}${ver}${desc}.json`;
    }
    // ─── Export to JSON ───────────────────────────────────────────────────
    function onExport() {
        const suggested = defaultFilename();
        const chosen = window.prompt('Opslaan als:', suggested);
        if (chosen === null)
            return;
        const finalName = chosen.trim().length > 0
            ? (chosen.endsWith('.json') ? chosen : chosen + '.json')
            : suggested;
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        a.click();
        URL.revokeObjectURL(url);
    }
    // ─── Import from JSON ─────────────────────────────────────────────────
    function onImportFile(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!setProject(parsed)) {
                    alert('Ongeldig formaat — verwacht MMB JSON (v1 of v2).');
                    return;
                }
            }
            catch {
                alert('Kon het bestand niet verwerken. Zorg dat het een geldig MMB-JSON is.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
    return (_jsxs("section", { style: { fontFamily: 'system-ui, sans-serif' }, children: [_jsxs("div", { className: "es-projectbar", children: [editingName ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.name, placeholder: "Projectnaam", maxLength: 60, className: "es-projectbar-name-input", onBlur: (e) => {
                            updateProject((p) => ({ ...p, name: e.target.value.trim() || 'MMB' }));
                            setEditingName(false);
                        }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                updateProject((p) => ({ ...p, name: e.target.value.trim() || 'MMB' }));
                                setEditingName(false);
                            }
                        } })) : (_jsx("span", { className: `es-projectbar-name${project.name ? '' : ' es-projectbar-name--empty'}`, onClick: () => setEditingName(true), title: "Klik om naam te wijzigen", children: project.name || 'Naamloos' })), editingVer ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.configVersion ?? '', placeholder: "1.0", maxLength: 16, className: "es-projectbar-ver-input", onBlur: (e) => {
                            updateProject((p) => ({ ...p, configVersion: e.target.value.trim() || undefined }));
                            setEditingVer(false);
                        }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                updateProject((p) => ({ ...p, configVersion: e.target.value.trim() || undefined }));
                                setEditingVer(false);
                            }
                        } })) : (_jsx("span", { className: "es-projectbar-ver", onClick: () => setEditingVer(true), title: "Klik om versie te wijzigen", children: project.configVersion ? `v${project.configVersion}` : 'v—' })), _jsx("span", { className: "es-projectbar-sep", children: "|" }), editingDesc ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.description ?? '', placeholder: "Opmerking\u2026", maxLength: 120, className: "es-projectbar-desc-input", onBlur: (e) => {
                            updateProject((p) => ({ ...p, description: e.target.value.trim() || undefined }));
                            setEditingDesc(false);
                        }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                updateProject((p) => ({ ...p, description: e.target.value.trim() || undefined }));
                                setEditingDesc(false);
                            }
                        } })) : (_jsx("span", { className: `es-projectbar-desc${project.description ? '' : ' es-projectbar-desc--empty'}`, onClick: () => setEditingDesc(true), title: "Klik om opmerking te wijzigen", children: project.description || 'Opmerking…' })), _jsx("span", { className: "es-projectbar-sep", children: "|" }), _jsxs("span", { className: "es-projectbar-stats", children: [project.modules.length, " modules \u00B7 ", project.patches.length, " patches"] }), _jsxs("div", { className: "es-projectbar-actions", children: [_jsx("button", { onClick: onExport, title: "Project downloaden als JSON", children: "\u2193 Exporteer" }), _jsx("button", { onClick: () => importRef.current?.click(), title: "JSON-bestand laden", children: "\u2191 Importeer" }), _jsx("input", { ref: importRef, type: "file", accept: ".json,application/json", style: { display: 'none' }, onChange: onImportFile }), _jsx("button", { onClick: () => setProject(seedExampleModules(getProject())), title: "Voeg 6 voorbeeld-modules toe aan dit project en plaats ze in het actieve rack", children: "\u2728 Voorbeelden" }), _jsx("button", { className: "es-projectbar-reset", onClick: () => { if (confirm('Project wissen en opnieuw beginnen?'))
                                    setProject(emptyModularProject()); }, children: "Nieuw" })] })] }), _jsx("nav", { style: { display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12 }, children: TABS.map((t) => (_jsx("button", { onClick: () => setTab(t.id), "aria-selected": tab === t.id, style: {
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
                    }, children: t.label }, t.id))) }), tab === 'patches' && _jsx(PatchesPanel, {}), tab === 'modules' && _jsx(ModulesPanel, {}), tab === 'rack' && _jsx(RackPanel, {}), tab === 'categories' && _jsx(CategoriesPanel, {}), tab === 'patcher' && _jsx(PatcherPanel, {}), tab === 'simulation' && _jsx(SimulationPanel, {})] }));
}
