// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.
//
// Project bar (name / version / description) is analogous to the ES project
// bar and reuses the same `.es-projectbar*` CSS classes.

import { useEffect, useRef, useState } from 'react';
import { setProject, updateProject, useModularProject, getProject, undo, redo } from './store';
import { emptyModularProject } from './types';
import { seedExampleModules, seedInternals, seedTestPatch, seedCvBridgePatch, seedPolyVoicePatch, seedSoloVoicePatch, type PolySeedOptions } from './seedModules';
import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { RackPanel } from './RackPanel';
import { PatcherPanel } from './PatcherPanel';
import { SimulationPanel } from './SimulationPanel';
import { ControlSurfacePanel } from './ControlSurfacePanel';
import { PresetsModal } from './PresetsModal';
import { TeensyLinkModal } from './TeensyLinkModal';
// Reuse the ES project-bar CSS classes (.es-projectbar*) — same visual language.
import '../effect-switcher/styles.css';

type Tab = 'patches' | 'modules' | 'rack' | 'categories' | 'patcher' | 'simulation' | 'surface';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categorieën' },
  { id: 'modules',    label: 'Modules' },
  { id: 'rack',       label: 'Rack' },
  { id: 'patches',    label: 'Patches' },
  { id: 'patcher',    label: 'Patcher' },
  { id: 'simulation', label: 'Simulatie' },
  { id: 'surface',    label: 'Surface' },
];

export function ModularMbApp(): JSX.Element {
  const project = useModularProject();
  const [tab,         setTab]         = useState<Tab>('patcher');
  const [editingName, setEditingName] = useState(false);
  const [editingVer,  setEditingVer]  = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showTeensy,  setShowTeensy]  = useState(false);
  const [showPoly,    setShowPoly]    = useState(false);
  const [showStress,  setShowStress]  = useState(false);
  const [showSolo,    setShowSolo]    = useState(false);
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
            onClick={() => setShowPresets(true)}
            title="Presets opslaan/laden (project of per module)"
          >💾 Presets</button>
          <button
            onClick={() => setShowTeensy(true)}
            title="Verbinden met Teensy via USB Serial en config pushen"
          >🔌 Teensy</button>
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
          <button
            onClick={() => setProject(seedCvBridgePatch(getProject()))}
            title="CV-bridge patch: MidiIn → VCO → VCF → VCA, 2×AHDSR (filter+amp), velocity via CvMath."
          >✨ CV-bridge</button>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowPoly((v) => !v)}
              title="Seed een N-stemmige polyfonie-testpatch (ADR 0011): MidiIn (N stemmen) → N× voice-keten → MIXER → OUT. N≤4=4-in mixer, N≤8=8-in, N≤16=16-in."
            >✨ Poly ▾</button>
            {showPoly && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 20,
                  background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth: 150,
                  display: 'flex', flexDirection: 'column',
                }}
                onMouseLeave={() => setShowPoly(false)}
              >
                {[1, 2, 4, 8, 16].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setProject(seedPolyVoicePatch(getProject(), n)); setShowPoly(false); }}
                    style={{
                      textAlign: 'left', border: 'none', background: 'transparent',
                      padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    }}
                    title={`${n}-stemmige patch${n > 8 ? ' (16-in mixer)' : n > 4 ? ' (8-in mixer)' : ''}`}
                  >{n}-stemmig{n === 1 ? ' (mono)' : ''}</button>
                ))}
              </div>
            )}
          </span>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowSolo((v) => !v)}
              title="Solo-seeds: de kortst mogelijke speelbare patch rond één instrument (MidiIn → module → OUT) — om Rings/Plaits/Elements/STK te leren kennen."
            >🎹 Solo ▾</button>
            {showSolo && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 20,
                  background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth: 210,
                  display: 'flex', flexDirection: 'column',
                }}
                onMouseLeave={() => setShowSolo(false)}
              >
                {([
                  { label: '💍 Rings (resonator)', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 } },
                  { label: '🎛️ Plaits (16 engines)', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 } },
                  { label: '💎 Elements (modaal)', t: 'tp_mmb_elements', n: 'Elements', l: 'out_l', r: 'out_r',
                    c: { strike: 0.8, space: 0.5, level: 0.8 } },
                  { label: '🎻 STK (9 instrumenten)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 0, level: 0.8 } },
                ] as { label: string; t: string; n: string; l: string; r: string; c: Record<string, number> }[]).map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setProject(seedSoloVoicePatch(getProject(), s.t, s.n, s.l, s.r, s.c)); setShowSolo(false); }}
                    style={{
                      textAlign: 'left', border: 'none', background: 'transparent',
                      padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    }}
                  >{s.label}</button>
                ))}
              </div>
            )}
          </span>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowStress((v) => !v)}
              title="Stress-seeds: energievretende varianten van de poly-patch om de Teensy te pushen. Kijk in de status-strip (CPU / blocks / loop) hoe ver hij gaat."
            >🔥 Stress ▾</button>
            {showStress && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 20,
                  background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth: 240,
                  display: 'flex', flexDirection: 'column',
                }}
                onMouseLeave={() => setShowStress(false)}
              >
                {([
                  { label: '🪕 Strings ×16 (Karplus-Strong)', n: 16, o: { voiceSource: 'string' } },
                  // Ladder is duur (2× oversampling): ×8 verzadigde de audio-
                  // ISR (>90% CPU → kraken); ×4 is de veilige stress-grens.
                  { label: '🪜 Ladder-filter ×4 (Moog)',      n: 4,  o: { filterType: 'ladder' } },
                  { label: '⚡ MS-20 scream ×6 (Korg35)',     n: 6,  o: { filterType: 'ms20' } },
                  // STK Bowed ×8 liep tegen heap-OOM (delay-lines); ×4 past.
                  { label: '🎻 STK Bowed ×4',                 n: 4,  o: { voiceSource: 'stk', stkSound: 2 } },
                  { label: '🌀 Comb per stem ×16',            n: 16, o: { perVoiceFx: 'comb' } },
                  { label: '〰️ CV-storm ×8 (LFO per stem)',   n: 8,  o: { perVoiceLfo: true } },
                  { label: '🔁 Echo-bus ×8 (2× 0,5 s)',       n: 8,  o: { busEchoSeconds: 0.5 } },
                  { label: '💎 Elements + 4-stemmig',         n: 4,  o: { withElements: true } },
                  { label: '🔥 Alles tegelijk ×8',            n: 8,  o: {
                      voiceSource: 'string', perVoiceFx: 'comb', perVoiceLfo: true,
                      busEchoSeconds: 0.5, withElements: true } },
                ] as { label: string; n: number; o: PolySeedOptions }[]).map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setProject(seedPolyVoicePatch(getProject(), s.n, s.o)); setShowStress(false); }}
                    style={{
                      textAlign: 'left', border: 'none', background: 'transparent',
                      padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    }}
                  >{s.label}</button>
                ))}
              </div>
            )}
          </span>
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
      {/* Surface-paneel is UI over de singleton surfaceBridge: de MIDI-
          koppeling zelf blijft actief als je naar een andere tab gaat. */}
      {tab === 'surface'    && <ControlSurfacePanel />}
      {/* SimulationPanel blijft altijd gemount zodat de audio-engine en de
          gekozen MIDI-bron (bv. de auto-sequence) blijven draaien als je
          naar een andere tab gaat om aan knoppen te draaien of te patchen. */}
      <div style={{ display: tab === 'simulation' ? 'block' : 'none' }}>
        <SimulationPanel />
      </div>

      {showPresets && <PresetsModal onClose={() => setShowPresets(false)} />}
      {showTeensy  && <TeensyLinkModal onClose={() => setShowTeensy(false)} />}
    </section>
  );
}
