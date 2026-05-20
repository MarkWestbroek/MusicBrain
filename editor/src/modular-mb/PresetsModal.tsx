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
import {
  type PatchPresetData,
  type ModulePresetData,
  loadLibrary,
  savePatchPreset,
  deletePatchPreset,
  renamePatchPreset,
  saveModulePreset,
  deleteModulePreset,
  renameModulePreset,
  applyModulePreset,
  exportLibraryJson,
  importLibraryJson,
  factoryPatchPresets,
  factoryModulePresets,
} from './presets';

interface PresetsModalProps {
  onClose: () => void;
}

export function PresetsModal({ onClose }: PresetsModalProps): JSX.Element {
  const project = useModularProject();
  const [tab, setTab]   = useState<'patches' | 'modules'>('patches');
  const [, setBump]     = useState(0);
  const refresh = (): void => setBump((n) => n + 1);

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lib = loadLibrary();

  // ── Export / Import handlers ──────────────────────────────────────────
  function onExportLibrary(): void {
    const blob = new Blob([exportLibraryJson()], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date();
    const pad  = (n: number) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `mmb-presets-${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportLibrary(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importLibraryJson(reader.result as string);
      if (!result) {
        alert('Ongeldig preset-bestand (verwacht mmb-presets v1).');
      } else {
        alert(`Geïmporteerd: ${result.patches} patch-preset(s), ${result.modules} module-preset(s).`);
        refresh();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0f172a', color: '#e2e8f0',
          border: '1px solid #334155', borderRadius: 8,
          width: 'min(800px, 92vw)', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          fontFamily: 'system-ui, sans-serif', fontSize: 13,
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid #334155',
        }}>
          <strong style={{ fontSize: 15 }}>💾 Presets</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn} onClick={onExportLibrary} title="Exporteer alle presets als .json">↓ Export</button>
            <label style={{ ...btn, display: 'inline-block' }} title="Importeer presets uit .json">
              ↑ Import
              <input type="file" accept=".json,application/json"
                style={{ display: 'none' }} onChange={onImportLibrary} />
            </label>
            <button style={{ ...btn, color: '#fca5a5' }} onClick={onClose}>✕ Sluit</button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 16px 0', borderBottom: '1px solid #334155' }}>
          {(['patches', 'modules'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px 6px 0 0',
                border: '1px solid #334155',
                borderBottom: 'none',
                background: tab === t ? '#1e293b' : 'transparent',
                color: tab === t ? '#fbbf24' : '#cbd5e1',
                fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer', fontSize: 13,
              }}
            >
              {t === 'patches' ? 'Patch presets' : 'Module presets'}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {tab === 'patches'
            ? <PatchPresetsTab project={project} userPresets={lib.patches} onChange={refresh} onClose={onClose} />
            : <ModulePresetsTab userPresets={lib.modules} onChange={refresh} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Patch-presets tab
// ═══════════════════════════════════════════════════════════════════════

interface PatchTabProps {
  project: ReturnType<typeof getProject>;
  userPresets: PatchPresetData[];
  onChange: () => void;
  onClose: () => void;
}

function PatchPresetsTab({ project, userPresets, onChange, onClose }: PatchTabProps): JSX.Element {
  const [name, setName] = useState('');

  function onSave(): void {
    const n = name.trim();
    if (!n) { alert('Geef de preset een naam.'); return; }
    savePatchPreset(n, project, project.description);
    setName('');
    onChange();
  }

  function loadFactory(id: string): void {
    const fp = factoryPatchPresets.find((x) => x.id === id);
    if (!fp) return;
    if (!confirm(`Huidige project vervangen door factory-preset "${fp.name}"?`)) return;
    setProject(fp.apply());
    onClose();
  }

  function loadUser(p: PatchPresetData): void {
    if (!confirm(`Huidige project vervangen door "${p.name}"?`)) return;
    setProject(p.project);
    onClose();
  }

  function onDelete(p: PatchPresetData): void {
    if (!confirm(`Preset "${p.name}" verwijderen?`)) return;
    deletePatchPreset(p.id);
    onChange();
  }

  function onRename(p: PatchPresetData): void {
    const next = prompt('Nieuwe naam:', p.name);
    if (next === null) return;
    renamePatchPreset(p.id, next);
    onChange();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: '#94a3b8' }}>
        Een <em>patch-preset</em> bewaart het complete project (alle modules, racks, patches, kabels en knopstanden).
        Laden vervangt het huidige project.
      </p>

      {/* Save current */}
      <div style={section}>
        <div style={sectionTitle}>Huidig project opslaan als preset</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="Preset-naam…"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
            style={input}
          />
          <button style={btnPrimary} onClick={onSave}>💾 Opslaan</button>
        </div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {project.modules.length} modules · {project.patches.length} patch(es)
        </div>
      </div>

      {/* Factory */}
      <div style={section}>
        <div style={sectionTitle}>Factory presets ({factoryPatchPresets.length})</div>
        <ul style={list}>
          {factoryPatchPresets.map((fp) => (
            <li key={fp.id} style={listItem}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{fp.name}</div>
                <div style={meta}>{fp.description}</div>
              </div>
              <button style={btn} onClick={() => loadFactory(fp.id)}>↻ Laden</button>
            </li>
          ))}
        </ul>
      </div>

      {/* User */}
      <div style={section}>
        <div style={sectionTitle}>Eigen presets ({userPresets.length})</div>
        {userPresets.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic' }}>Nog geen eigen presets opgeslagen.</div>
        ) : (
          <ul style={list}>
            {[...userPresets].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
              <li key={p.id} style={listItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={meta}>
                    {p.project.modules.length} modules · {new Date(p.createdAt).toLocaleString()}
                    {p.description ? ` · ${p.description}` : ''}
                  </div>
                </div>
                <button style={btn} onClick={() => loadUser(p)}>↻ Laden</button>
                <button style={btn} onClick={() => onRename(p)}>✎</button>
                <button style={{ ...btn, color: '#fca5a5' }} onClick={() => onDelete(p)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Module-presets tab
// ═══════════════════════════════════════════════════════════════════════

interface ModuleTabProps {
  userPresets: ModulePresetData[];
  onChange: () => void;
}

function ModulePresetsTab({ userPresets, onChange }: ModuleTabProps): JSX.Element {
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

  const [selectedModuleId, setSelectedModuleId] = useState<string>(moduleOptions[0]?.id ?? '');
  const [name, setName] = useState('');

  const selectedModule = project.modules.find((m) => m.id === selectedModuleId);
  const selectedType   = selectedModule
    ? project.moduleTypes.find((t) => t.id === selectedModule.typeId)
    : undefined;
  const currentValues  = (activePatch && selectedModuleId)
    ? (activePatch.controlState[selectedModuleId] ?? {})
    : {};

  // Combine factory + user presets, filtered by selected module's typeId.
  const matchingFactory = selectedModule
    ? factoryModulePresets.filter((p) => p.typeId === selectedModule.typeId)
    : [];
  const matchingUser = selectedModule
    ? userPresets.filter((p) => p.typeId === selectedModule.typeId)
    : [];

  function onSave(): void {
    if (!selectedModule || !activePatch) { alert('Geen actieve module/patch.'); return; }
    const n = name.trim();
    if (!n) { alert('Geef de preset een naam.'); return; }
    saveModulePreset(n, selectedModule.typeId, currentValues);
    setName('');
    onChange();
  }

  function onLoad(preset: ModulePresetData): void {
    if (!selectedModule) return;
    const next = applyModulePreset(getProject(), preset, selectedModule.id);
    if (!next) { alert('Kon preset niet toepassen (verkeerd module-type of geen actieve patch).'); return; }
    setProject(next);
  }

  function onDelete(preset: ModulePresetData): void {
    if (!confirm(`Module-preset "${preset.name}" verwijderen?`)) return;
    deleteModulePreset(preset.id);
    onChange();
  }

  function onRename(preset: ModulePresetData): void {
    const next = prompt('Nieuwe naam:', preset.name);
    if (next === null) return;
    renameModulePreset(preset.id, next);
    onChange();
  }

  if (moduleOptions.length === 0) {
    return <div style={{ color: '#94a3b8' }}>Geen modules in het project.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, color: '#94a3b8' }}>
        Een <em>module-preset</em> bewaart enkel de knopstanden van één module.
        Laden kopieert de waarden naar de geselecteerde module van hetzelfde type.
      </p>

      {/* Module picker */}
      <div style={section}>
        <div style={sectionTitle}>Doel-module</div>
        <select
          value={selectedModuleId}
          onChange={(e) => setSelectedModuleId(e.target.value)}
          style={{ ...input, width: '100%' }}
        >
          {moduleOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <div style={meta}>
          Type: {selectedType ? `${selectedType.id} (${selectedType.variant})` : '—'} ·
          Controls: {Object.keys(currentValues).length}
        </div>
      </div>

      {/* Save current */}
      <div style={section}>
        <div style={sectionTitle}>Huidige knopstand opslaan</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" placeholder="Preset-naam…"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
            style={input}
          />
          <button style={btnPrimary} onClick={onSave}>💾 Opslaan</button>
        </div>
      </div>

      {/* Factory matching */}
      <div style={section}>
        <div style={sectionTitle}>Factory ({matchingFactory.length})</div>
        {matchingFactory.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic' }}>Geen factory-presets voor dit module-type.</div>
        ) : (
          <ul style={list}>
            {matchingFactory.map((p) => (
              <li key={p.id} style={listItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={meta}>{p.description}</div>
                </div>
                <button style={btn} onClick={() => onLoad(p)}>↻ Laden</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* User matching */}
      <div style={section}>
        <div style={sectionTitle}>Eigen ({matchingUser.length})</div>
        {matchingUser.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic' }}>Geen eigen presets voor dit type.</div>
        ) : (
          <ul style={list}>
            {[...matchingUser].sort((a, b) => b.createdAt - a.createdAt).map((p) => (
              <li key={p.id} style={listItem}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={meta}>{new Date(p.createdAt).toLocaleString()}</div>
                </div>
                <button style={btn} onClick={() => onLoad(p)}>↻ Laden</button>
                <button style={btn} onClick={() => onRename(p)}>✎</button>
                <button style={{ ...btn, color: '#fca5a5' }} onClick={() => onDelete(p)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════════════

const btn: React.CSSProperties = {
  padding: '4px 10px', background: '#1e293b', color: '#e2e8f0',
  border: '1px solid #334155', borderRadius: 4, cursor: 'pointer',
  fontSize: 12,
};
const btnPrimary: React.CSSProperties = {
  ...btn, background: '#fbbf24', color: '#0f172a', borderColor: '#fbbf24',
  fontWeight: 600,
};
const input: React.CSSProperties = {
  flex: 1, padding: '4px 8px', background: '#1e293b', color: '#e2e8f0',
  border: '1px solid #334155', borderRadius: 4, fontSize: 13,
};
const section: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: 10, background: '#1e293b', border: '1px solid #334155',
  borderRadius: 6,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 11, color: '#94a3b8', textTransform: 'uppercase',
  letterSpacing: 0.5, fontWeight: 600,
};
const list: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
};
const listItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 8px', background: '#0f172a',
  border: '1px solid #334155', borderRadius: 4,
};
const meta: React.CSSProperties = {
  fontSize: 11, color: '#64748b',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
