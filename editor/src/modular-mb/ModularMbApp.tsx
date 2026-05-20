// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.
//
// Project bar (name / version / description) is analogous to the ES project
// bar and reuses the same `.es-projectbar*` CSS classes.

import { useEffect, useRef, useState } from 'react';
import { setProject, updateProject, useModularProject, getProject, undo, redo } from './store';
import { emptyModularProject } from './types';
import { seedExampleModules, seedInternals, seedTestPatch } from './seedModules';
import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { RackPanel } from './RackPanel';
import { PatcherPanel } from './PatcherPanel';
import { SimulationPanel } from './SimulationPanel';
// Reuse the ES project-bar CSS classes (.es-projectbar*) — same visual language.
import '../effect-switcher/styles.css';

type Tab = 'patches' | 'modules' | 'rack' | 'categories' | 'patcher' | 'simulation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categorieën' },
  { id: 'modules',    label: 'Modules' },
  { id: 'rack',       label: 'Rack' },
  { id: 'patches',    label: 'Patches' },
  { id: 'patcher',    label: 'Patcher' },
  { id: 'simulation', label: 'Simulatie' },
];

export function ModularMbApp(): JSX.Element {
  const project = useModularProject();
  const [tab,         setTab]         = useState<Tab>('patcher');
  const [editingName, setEditingName] = useState(false);
  const [editingVer,  setEditingVer]  = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ─── Global undo/redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ───────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Sla over als focus in een tekstveld zit — daar geldt native undo.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Filename: yyyy-mm-dd-hhmmss-Naam-vVersie-(Opmerking).json ───────
  function defaultFilename(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const safeName = (project.name || 'mmb').replace(/[^a-z0-9._-]+/gi, '_');
    const ver = project.configVersion ? `-v${project.configVersion}` : '';
    let desc = '';
    if (project.description) {
      const firstLine = project.description.split(/\r?\n/)[0] ?? '';
      const safe = firstLine.replace(/[^a-z0-9 ._-]+/gi, '_').trim().slice(0, 32).trimEnd();
      if (safe) desc = `-(${safe})`;
    }
    return `${date}-${time}-${safeName}${ver}${desc}.json`;
  }

  // ─── Export to JSON ───────────────────────────────────────────────────
  function onExport(): void {
    const suggested = defaultFilename();
    const chosen = window.prompt('Opslaan als:', suggested);
    if (chosen === null) return;
    const finalName = chosen.trim().length > 0
      ? (chosen.endsWith('.json') ? chosen : chosen + '.json')
      : suggested;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = finalName; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Import from JSON ─────────────────────────────────────────────────
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!setProject(parsed)) {
          alert('Ongeldig formaat — verwacht MMB JSON (v1 of v2).');
          return;
        }
      } catch {
        alert('Kon het bestand niet verwerken. Zorg dat het een geldig MMB-JSON is.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <section style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Project header bar ── */}
      <div className="es-projectbar">

        {editingName ? (
          <input autoFocus type="text" defaultValue={project.name} placeholder="Projectnaam"
            maxLength={60} className="es-projectbar-name-input"
            onBlur={(e) => {
              updateProject((p) => ({ ...p, name: e.target.value.trim() || 'MMB' }));
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                updateProject((p) => ({ ...p, name: (e.target as HTMLInputElement).value.trim() || 'MMB' }));
                setEditingName(false);
              }
            }}
          />
        ) : (
          <span className={`es-projectbar-name${project.name ? '' : ' es-projectbar-name--empty'}`}
            onClick={() => setEditingName(true)} title="Klik om naam te wijzigen">
            {project.name || 'Naamloos'}
          </span>
        )}

        {editingVer ? (
          <input autoFocus type="text" defaultValue={project.configVersion ?? ''} placeholder="1.0"
            maxLength={16} className="es-projectbar-ver-input"
            onBlur={(e) => {
              updateProject((p) => ({ ...p, configVersion: e.target.value.trim() || undefined }));
              setEditingVer(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                updateProject((p) => ({ ...p, configVersion: (e.target as HTMLInputElement).value.trim() || undefined }));
                setEditingVer(false);
              }
            }}
          />
        ) : (
          <span className="es-projectbar-ver"
            onClick={() => setEditingVer(true)} title="Klik om versie te wijzigen">
            {project.configVersion ? `v${project.configVersion}` : 'v—'}
          </span>
        )}

        <span className="es-projectbar-sep">|</span>

        {editingDesc ? (
          <input autoFocus type="text" defaultValue={project.description ?? ''} placeholder="Opmerking…"
            maxLength={120} className="es-projectbar-desc-input"
            onBlur={(e) => {
              updateProject((p) => ({ ...p, description: e.target.value.trim() || undefined }));
              setEditingDesc(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                updateProject((p) => ({ ...p, description: (e.target as HTMLInputElement).value.trim() || undefined }));
                setEditingDesc(false);
              }
            }}
          />
        ) : (
          <span className={`es-projectbar-desc${project.description ? '' : ' es-projectbar-desc--empty'}`}
            onClick={() => setEditingDesc(true)} title="Klik om opmerking te wijzigen">
            {project.description || 'Opmerking…'}
          </span>
        )}

        <span className="es-projectbar-sep">|</span>
        <span className="es-projectbar-stats">
          {project.modules.length} modules · {project.patches.length} patches
        </span>

        <div className="es-projectbar-actions">
          <button onClick={onExport} title="Project downloaden als JSON">↓ Exporteer</button>
          <button onClick={() => importRef.current?.click()} title="JSON-bestand laden">↑ Importeer</button>
          <input ref={importRef} type="file" accept=".json,application/json"
            style={{ display: 'none' }} onChange={onImportFile} />
          <button
            onClick={() => setProject(seedExampleModules(getProject()))}
            title="Voeg 6 voorbeeld-modules toe aan dit project en plaats ze in het actieve rack"
          >✨ Voorbeelden</button>
          <button
            onClick={() => setProject(seedInternals(getProject()))}
            title="Voeg MMB-modules (AHDSR, LFO, S&H, VCO, VCF, VCA, OUT, SEQ-8) toe aan het virtuele rack"
          >✨ Internals</button>
          <button
            onClick={() => setProject(seedTestPatch(getProject()))}
            title="Maak een nieuw Test rack + Test patch: VCO → VCF → VCA → OUT met ENV → VCA. Klaar om in de Simulatie-tab af te spelen."
          >✨ Test-patch</button>
          <button className="es-projectbar-reset"
            onClick={() => { if (confirm('Project wissen en opnieuw beginnen?')) setProject(emptyModularProject()); }}
          >Nieuw</button>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            style={{
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
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'patches'    && <PatchesPanel />}
      {tab === 'modules'    && <ModulesPanel />}
      {tab === 'rack'       && <RackPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'patcher'    && <PatcherPanel />}
      {/* SimulationPanel blijft altijd gemount zodat de audio-engine en de
          gekozen MIDI-bron (bv. de auto-sequence) blijven draaien als je
          naar een andere tab gaat om aan knoppen te draaien of te patchen. */}
      <div style={{ display: tab === 'simulation' ? 'block' : 'none' }}>
        <SimulationPanel />
      </div>
    </section>
  );
}
