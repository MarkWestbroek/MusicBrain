import { useEffect, useRef, useState } from 'react';
import { CategoriesPanel } from './CategoriesPanel';
import { ChainPanel } from './ChainPanel';
import { PatchesPanel } from './PatchesPanel';
import { SimulationPanel } from './SimulationPanel';
import { SettingsButton } from './SettingsPanel';
import {
  loadProject,
  resetProject,
  seedDemo,
  setProjectConfigVersion,
  setProjectDescription,
  setProjectName,
} from './actions';
import { useProject } from './store';
import type { SwitcherProject } from './types';
import { getLang, setLang, subscribeLang, t, type Lang } from '../i18n';
import './styles.css';

type SubTab = 'patches' | 'chain' | 'categories' | 'simulation';

/** Root component for the effect-switcher sub-application.
 *  Owns the tab strip, project bar (name / description / version), language
 *  switcher, import/export, and the demo/reset actions. */
export function EffectSwitcherApp(): JSX.Element {
  const project = useProject();
  const [tab, setTab] = useState<SubTab>('patches');
  const [editingName, setEditingName]   = useState(false);
  const [editingDesc, setEditingDesc]   = useState(false);
  const [editingVer,  setEditingVer]    = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Force re-render when language changes
  const [, setLangTick] = useState(0);
  useEffect(() => subscribeLang(() => setLangTick((n) => n + 1)), []);

  /** Build a safe filename from the project name and configVersion.
   *  Non-alphanumeric characters are replaced with `_`. */
  function defaultFilename(): string {
    const safeName = (project.name ?? 'config').replace(/[^a-z0-9._-]+/gi, '_');
    const ver = project.configVersion ? `-v${project.configVersion}` : '';
    return `musicbrain-${safeName}${ver}-${new Date().toISOString().slice(0, 10)}.json`;
  }

  /** Export the current project to a JSON file. Prompts the user for a
   *  filename (pre-filled with the safe project name + config version). */
  function onExport(): void {
    const suggested = defaultFilename();
    const chosen = window.prompt('Save as filename:', suggested);
    if (chosen === null) return;
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
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as SwitcherProject;
        if (!parsed || parsed.version !== 1) { alert('Unsupported format — schema version must be 1.'); return; }
        loadProject(parsed);
      } catch {
        alert('Could not parse the file. Make sure it is a valid MusicBrain JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="es-app">
      {/* ── Project header bar ── */}
      <div className="es-projectbar">
        {editingName ? (
          <input
            autoFocus
            type="text"
            defaultValue={project.name ?? ''}
            placeholder={t('app.projectName')}
            maxLength={60}
            className="es-projectbar-name-input"
            onBlur={(e) => { setProjectName(e.target.value); setEditingName(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setProjectName((e.target as HTMLInputElement).value);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <span
            className={`es-projectbar-name${project.name ? '' : ' es-projectbar-name--empty'}`}
            onClick={() => setEditingName(true)}
            title="Click to edit project name"
          >
            {project.name ?? t('app.untitled')}
          </span>
        )}

        {editingVer ? (
          <input
            autoFocus
            type="text"
            defaultValue={project.configVersion ?? ''}
            placeholder="1.0.0"
            maxLength={16}
            className="es-projectbar-ver-input"
            onBlur={(e) => { setProjectConfigVersion(e.target.value); setEditingVer(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setProjectConfigVersion((e.target as HTMLInputElement).value);
                setEditingVer(false);
              }
            }}
          />
        ) : (
          <span
            className="es-projectbar-ver"
            onClick={() => setEditingVer(true)}
            title="Click to edit config version (semver-ish; you bump it yourself)"
          >
            {project.configVersion ? `v${project.configVersion}` : 'v—'}
          </span>
        )}

        <span className="es-projectbar-sep">|</span>

        {editingDesc ? (
          <input
            autoFocus
            type="text"
            defaultValue={project.description ?? ''}
            placeholder={t('app.description')}
            maxLength={120}
            className="es-projectbar-desc-input"
            onBlur={(e) => { setProjectDescription(e.target.value); setEditingDesc(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                setProjectDescription((e.target as HTMLInputElement).value);
                setEditingDesc(false);
              }
            }}
          />
        ) : (
          <span
            className={`es-projectbar-desc${project.description ? '' : ' es-projectbar-desc--empty'}`}
            onClick={() => setEditingDesc(true)}
            title="Click to edit description"
          >
            {project.description ?? t('app.description')}
          </span>
        )}

        <span className="es-projectbar-sep">|</span>
        <span className="es-projectbar-stats">
          {t('app.stats', { n: project.devices.length, p: project.patches.length, r: project.relayCount })}
        </span>

        <div className="es-projectbar-actions">
          <select
            value={getLang()}
            onChange={(e) => setLang(e.target.value as Lang)}
            title="Language / Taal"
            style={{ fontSize: 11, padding: '2px 4px' }}
          >
            <option value="en">EN</option>
            <option value="nl">NL</option>
          </select>
          <button onClick={onExport} title="Download JSON">{t('app.exportJson')}</button>
          <button onClick={() => importRef.current?.click()} title="Load JSON file">{t('app.importJson')}</button>
          <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportFile} />
          <button onClick={seedDemo} title="Load demo data">{t('app.demo')}</button>
          <button
            className="es-projectbar-reset"
            onClick={() => { if (confirm(t('app.resetConfirm'))) resetProject(); }}
          >{t('app.reset')}</button>
          <SettingsButton />
        </div>
      </div>

      <div className="es-tabs">
        <button className="es-tab" aria-selected={tab === 'patches'}
                onClick={() => setTab('patches')}>{t('tab.patches')}</button>
        <button className="es-tab" aria-selected={tab === 'chain'}
                onClick={() => setTab('chain')}>{t('tab.chain')}</button>
        <button className="es-tab" aria-selected={tab === 'categories'}
                onClick={() => setTab('categories')}>{t('tab.categories')}</button>
        <button className="es-tab" aria-selected={tab === 'simulation'}
                onClick={() => setTab('simulation')}>{t('tab.simulation')}</button>
      </div>

      {tab === 'patches'    && <PatchesPanel />}
      {tab === 'chain'      && <ChainPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'simulation' && <SimulationPanel />}
    </div>
  );
}
