import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { CategoriesPanel } from './CategoriesPanel';
import { ChainPanel } from './ChainPanel';
import { PatchesPanel } from './PatchesPanel';
import { SimulationPanel } from './SimulationPanel';
import { SettingsButton } from './SettingsPanel';
import { loadProject, resetProject, seedDemo, setProjectConfigVersion, setProjectDescription, setProjectName, } from './actions';
import { useProject } from './store';
import { getLang, setLang, subscribeLang, t } from '../i18n';
import './styles.css';
/** Root component for the effect-switcher sub-application.
 *  Owns the tab strip, project bar (name / description / version), language
 *  switcher, import/export, and the demo/reset actions. */
export function EffectSwitcherApp() {
    const project = useProject();
    const [tab, setTab] = useState('patches');
    const [editingName, setEditingName] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [editingVer, setEditingVer] = useState(false);
    const importRef = useRef(null);
    // Force re-render when language changes
    const [, setLangTick] = useState(0);
    useEffect(() => subscribeLang(() => setLangTick((n) => n + 1)), []);
    /** Build a safe filename from the project name and configVersion.
     *  Non-alphanumeric characters are replaced with `_`. */
    function defaultFilename() {
        const safeName = (project.name ?? 'config').replace(/[^a-z0-9._-]+/gi, '_');
        const ver = project.configVersion ? `-v${project.configVersion}` : '';
        return `musicbrain-${safeName}${ver}-${new Date().toISOString().slice(0, 10)}.json`;
    }
    /** Export the current project to a JSON file. Prompts the user for a
     *  filename (pre-filled with the safe project name + config version). */
    function onExport() {
        const suggested = defaultFilename();
        const chosen = window.prompt('Save as filename:', suggested);
        if (chosen === null)
            return;
        const finalName = chosen.trim().length > 0
            ? (chosen.endsWith('.json') ? chosen : chosen + '.json')
            : suggested;
        const json = JSON.stringify(project, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalName;
        a.click();
        URL.revokeObjectURL(url);
    }
    /** Handle a file picked by the hidden `<input type="file">`. Reads the
     *  JSON, validates it has `version: 1`, then calls `loadProject`. */
    function onImportFile(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed || parsed.version !== 1) {
                    alert('Unsupported format — schema version must be 1.');
                    return;
                }
                loadProject(parsed);
            }
            catch {
                alert('Could not parse the file. Make sure it is a valid MusicBrain JSON.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }
    return (_jsxs("div", { className: "es-app", children: [_jsxs("div", { className: "es-projectbar", children: [editingName ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.name ?? '', placeholder: t('app.projectName'), maxLength: 60, className: "es-projectbar-name-input", onBlur: (e) => { setProjectName(e.target.value); setEditingName(false); }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                setProjectName(e.target.value);
                                setEditingName(false);
                            }
                        } })) : (_jsx("span", { className: `es-projectbar-name${project.name ? '' : ' es-projectbar-name--empty'}`, onClick: () => setEditingName(true), title: "Click to edit project name", children: project.name ?? t('app.untitled') })), editingVer ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.configVersion ?? '', placeholder: "1.0.0", maxLength: 16, className: "es-projectbar-ver-input", onBlur: (e) => { setProjectConfigVersion(e.target.value); setEditingVer(false); }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                setProjectConfigVersion(e.target.value);
                                setEditingVer(false);
                            }
                        } })) : (_jsx("span", { className: "es-projectbar-ver", onClick: () => setEditingVer(true), title: "Click to edit config version (semver-ish; you bump it yourself)", children: project.configVersion ? `v${project.configVersion}` : 'v—' })), _jsx("span", { className: "es-projectbar-sep", children: "|" }), editingDesc ? (_jsx("input", { autoFocus: true, type: "text", defaultValue: project.description ?? '', placeholder: t('app.description'), maxLength: 120, className: "es-projectbar-desc-input", onBlur: (e) => { setProjectDescription(e.target.value); setEditingDesc(false); }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                                setProjectDescription(e.target.value);
                                setEditingDesc(false);
                            }
                        } })) : (_jsx("span", { className: `es-projectbar-desc${project.description ? '' : ' es-projectbar-desc--empty'}`, onClick: () => setEditingDesc(true), title: "Click to edit description", children: project.description ?? t('app.description') })), _jsx("span", { className: "es-projectbar-sep", children: "|" }), _jsx("span", { className: "es-projectbar-stats", children: t('app.stats', { n: project.devices.length, p: project.patches.length, r: project.relayCount }) }), _jsxs("div", { className: "es-projectbar-actions", children: [_jsxs("select", { value: getLang(), onChange: (e) => setLang(e.target.value), title: "Language / Taal", style: { fontSize: 11, padding: '2px 4px' }, children: [_jsx("option", { value: "en", children: "EN" }), _jsx("option", { value: "nl", children: "NL" })] }), _jsx("button", { onClick: onExport, title: "Download JSON", children: t('app.exportJson') }), _jsx("button", { onClick: () => importRef.current?.click(), title: "Load JSON file", children: t('app.importJson') }), _jsx("input", { ref: importRef, type: "file", accept: ".json,application/json", style: { display: 'none' }, onChange: onImportFile }), _jsx("button", { onClick: seedDemo, title: "Load demo data", children: t('app.demo') }), _jsx("button", { className: "es-projectbar-reset", onClick: () => { if (confirm(t('app.resetConfirm')))
                                    resetProject(); }, children: t('app.reset') }), _jsx(SettingsButton, {})] })] }), _jsxs("div", { className: "es-tabs", children: [_jsx("button", { className: "es-tab", "aria-selected": tab === 'patches', onClick: () => setTab('patches'), children: t('tab.patches') }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'chain', onClick: () => setTab('chain'), children: t('tab.chain') }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'categories', onClick: () => setTab('categories'), children: t('tab.categories') }), _jsx("button", { className: "es-tab", "aria-selected": tab === 'simulation', onClick: () => setTab('simulation'), children: t('tab.simulation') })] }), tab === 'patches' && _jsx(PatchesPanel, {}), tab === 'chain' && _jsx(ChainPanel, {}), tab === 'categories' && _jsx(CategoriesPanel, {}), tab === 'simulation' && _jsx(SimulationPanel, {})] }));
}
