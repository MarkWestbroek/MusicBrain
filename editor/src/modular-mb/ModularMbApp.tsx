// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.
//
// Project bar (name / version / description) is analogous to the ES project
// bar and reuses the same `.es-projectbar*` CSS classes.

import { useEffect, useRef, useState } from 'react';
import { setProject, updateProject, useModularProject, getProject, undo, redo, freshStart } from './store';
import { onRackFocus } from './rackFocus';
import { savePatch } from './recipe/saved';
import { SaveAsButton, SaveButton } from './PatchSave';
import { standardProject } from './demoSeeds';
import { PatchSelect } from './PatchSelect';
import { CommandPalette } from './recipe/CommandPalette';
import { Tour, tourSeen } from './recipe/Tour';
import { PlayTour, playTourSeen } from './PlayTour';
import { IntakeNotice } from './IntakeNotice';
import { PlayMenu } from './PlayMenu';
import { useWeergave } from './weergave';
import { useTempoSync } from './useTempoSync';
import { nlen, useLang } from '../i18n';
import { startDemo, DemoCaption, type DemoState, type DemoHandle } from './recipe/demo';
import type { PatchOp } from './recipe/types';
import { emptyModularProject, type ModularProject } from './types';
import { exportPanel, importPanel, parsePanelFile } from './panelIO';

import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { RackPanel } from './RackPanel';
import { PatcherPanel } from './PatcherPanel';
import { FrontTab } from './FrontTab';
import { SimulationPanel } from './SimulationPanel';
import { SimQuickBar } from './sim/SimQuickBar';
import { MidiMonitorHost } from './sim/MidiMonitorWindow';
import { TakeEditorHost } from './sim/TakeEditorWindow';
import { usePatchSysex } from './sim/PatchExportMenu';
import { ToolbarMenus } from './ToolbarMenus';
import { CmiPage4 } from './CmiPage4';
import { cmiVoices } from './cmiSync';
import { catalogMenu } from './patchCatalog';
import { PatchInboxHost } from './sim/PatchInbox';
import { PoolWindowsHost, openFromPool } from './sim/PoolWindows';
import { ControlSurfacePanel } from './ControlSurfacePanel';
import { PresetsModal } from './PresetsModal';
import { TeensyLinkModal } from './TeensyLinkModal';
import { WaveDrawModal } from './WaveDrawModal';
import { SampleModal } from './SampleModal';
import { SampleImportModal } from './SampleImportModal';
import { LyricModal } from './lyric/LyricModal';

/** Stand van de Bank-knop van de eerste ZANG-module in de actieve patch (0 als er geen is). */
function zangBankInPatch(project: ModularProject): number {
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  if (!patch) return 0;
  const zang = project.modules.find((m) => m.typeId === 'tp_mmb_zang' && patch.controlState[m.id]);
  const v = zang ? patch.controlState[zang.id]?.bank : undefined;
  return typeof v === 'number' ? v : 0;
}
import { Dx7EditorModal } from './Dx7EditorModal';
import { currentSecureContextHint } from './secureContext';
// Reuse the ES project-bar CSS classes (.es-projectbar*) — same visual language.
import '../effect-switcher/styles.css';
import { PatchBrowserHost, openPatchBrowser } from './PatchBrowser';

type Tab = 'patches' | 'modules' | 'rack' | 'categories' | 'front' | 'patcher' | 'simulation' | 'surface';

/** localStorage: '1' = de editor staat open (expert), anders dicht (speler). */
const OPEN_KEY = 'mb.front.open';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categorieën' },
  { id: 'modules',    label: 'Modules' },
  { id: 'rack',       label: 'Rack' },
  { id: 'patches',    label: 'Patches' },
  { id: 'front',      label: 'Front' },
  { id: 'patcher',    label: 'Patcher' },
  { id: 'simulation', label: 'Simulatie' },
  { id: 'surface',    label: 'Surface' },
];

export function ModularMbApp(): JSX.Element {
  // Taal van de speelmodus (?lang=en, de browser, of het wereldbolletje
  // rechtsboven); de editor achter Binnenkijken blijft Nederlands.
  useLang();
  // Eén tempo per patch: alle tempoknoppen volgen (doc/plans/tempo.md).
  useTempoSync();
  const project = useModularProject();
  // Spelermodus (patch-front §6): standaard dicht (alleen het front), want
  // zonder login ben je geen expert. "Binnenkijken" opent de hele editor en
  // wordt onthouden; "Dicht" sluit en wordt ook onthouden.
  // Eerste keer: de standaardset, zodat je niet met "Er is nog geen patch"
  // begint maar met een lijst om uit te kiezen en een front om op te spelen.
  useEffect(() => {
    if (freshStart && getProject().patches.length === 0) setProject(standardProject());
  }, []);
  const playerPatch = project.patches.find((p) => p.id === project.activePatchId);
  // Telefoon: patchkeuze en ⋯ op één regel (plaatsingstabel, editor-structuur.md §5b).
  const phone = useWeergave().soort === 'telefoon';
  const [expert, setExpertState] = useState<boolean>(() => {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
  });
  const setExpert = (open: boolean): void => {
    setExpertState(open);
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* privémodus */ }
    if (!open) setTab('front');
  };
  const [tab,         setTab]         = useState<Tab>(() => {
    try { return localStorage.getItem(OPEN_KEY) === '1' ? 'patcher' : 'front'; } catch { return 'front'; }
  });
  // Link van musicbrain.nl (patch-pool §5): `?patch=<slug>` opent die patch
  // meteen; `&mode=play` in de speelmodus, `&mode=edit` of geen mode in de
  // editor (Binnenkijken, Patcher). Zonder ?patch= doet `mode` hetzelfde met
  // de patch die er al is. De parameters gaan daarna uit de adresbalk, zodat
  // herladen niet opnieuw opent.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const slug = q.get('patch');
    const mode = q.get('mode');
    if (!slug && !mode) return;
    if (mode === 'play') setExpert(false);
    else if (mode === 'edit' || slug) { setExpert(true); setTab('patcher'); }
    if (slug) {
      void openFromPool(slug).catch((e) => {
        console.warn('patch-pool:', e instanceof Error ? e.message : e);
        window.alert(nlen(`De patch "${slug}" kon niet geopend worden: ${e instanceof Error ? e.message : String(e)}`,
          `Could not open the patch "${slug}": ${e instanceof Error ? e.message : String(e)}`));
      });
    }
    const u = new URL(window.location.href); u.searchParams.delete('patch'); u.searchParams.delete('mode');
    window.history.replaceState(null, '', u.toString());
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [editingName, setEditingName] = useState(false);
  const [editingVer,  setEditingVer]  = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showTeensy,  setShowTeensy]  = useState(false);
  const [showWave,    setShowWave]    = useState(false);
  const [showSample,  setShowSample]  = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [showLyric,   setShowLyric]   = useState(false);
  const [showDx7,     setShowDx7]     = useState(false);
  const [showCmd,     setShowCmd]     = useState(false);   // Ctrl+K commandoregel (ED-RC-2)
  const [showTour,    setShowTour]    = useState(false);   // rondleiding (ED-RC-4)
  const [showPlayTour, setShowPlayTour] = useState(false);  // rondleiding door de speelmodus
  const [demo,        setDemo]        = useState<DemoState | null>(null);
  const demoRef = useRef<DemoHandle | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const panelInRef = useRef<HTMLInputElement>(null);
  const [showPanels, setShowPanels] = useState(false);
  const sysex = usePatchSysex();
  // Fairlight: Page 4 ook vanuit Klank ▾ (zelfde venster als PAGE 4 op het front).
  const [showPage4, setShowPage4] = useState(false);

  // ─── Global undo/redo: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ───────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Ctrl+S = Bewaar de actieve patch (ED-RC-9), ook vanuit een tekstveld.
      if (e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        const id = getProject().activePatchId;
        if (id) updateProject((p) => savePatch(p, id), { forceCommit: true });
        return;
      }
      // Sla over als focus in een tekstveld zit — daar geldt native undo.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); setShowCmd(true); return; }
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Rondleiding: één keer automatisch bij een leeg project ───────────
  useEffect(() => {
    // De rondleiding gaat over rack en patcher; in de spelermodus (dicht) niet starten.
    if (expert && !tourSeen() && project.patches.length === 0) setShowTour(true);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // De speelmodus heeft een eigen rondleiding: de eerste keer dat je erin
  // komt, als het front en het toetsenbord er staan.
  useEffect(() => {
    if (expert || playTourSeen()) return;
    const t = setTimeout(() => setShowPlayTour(true), 900);
    return () => clearTimeout(t);
  }, [expert]);

  // "Ga naar rack" (rechtsklik in de patcher): het rack van de module actief
  // maken en naar het Rack-tabblad; RackPanel selecteert de module.
  useEffect(() => onRackFocus((moduleId) => {
    updateProject((p) => {
      const r = p.racks.find((x) => x.kind !== 'internal' && x.slots.some((sl) => sl.moduleId === moduleId))
             ?? p.racks.find((x) => x.slots.some((sl) => sl.moduleId === moduleId));
      return r ? { ...p, activeRackId: r.id } : p;
    });
    setTab('rack');
  }), []);

  // ─── Demonstratie: ops van een recept stap voor stap afspelen ─────────
  function runDemo(ops: PatchOp[]): void {
    demoRef.current?.stop();
    setTab('patcher');
    demoRef.current = startDemo(ops, setDemo);
  }

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

  // ─── Panel-I/O (ED-P-1): één paneel los exporteren/importeren ─────────
  function onExportPanel(typeId: string): void {
    const panel = exportPanel(project, typeId);
    if (!panel) { alert('Geen paneel voor dit type gevonden.'); return; }
    const blob = new Blob([JSON.stringify(panel, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${typeId}.panel.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowPanels(false);
  }
  function onImportPanelFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const panel = parsePanelFile(JSON.parse(reader.result as string));
        if (!panel) { alert('Geen geldig paneelbestand (mmb-panel.v1).'); return; }
        setProject(importPanel(getProject(), panel));
      } catch {
        alert('Kon het paneelbestand niet verwerken.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    // In de speelmodus mag niets de pagina breder maken dan het scherm: Chrome
    // op Android zoomt anders de hele pagina uit (en blijft dat tot je
    // herlaadt). `clip` maakt geen scrollgebied, dus het front houdt zijn
    // eigen horizontale scroll en volledig scherm werkt zoals het werkte.
    <section style={{ fontFamily: 'var(--mb-font-sans)', ...(expert ? {} : { overflowX: 'clip', maxWidth: '100%' }) }}>

      {/* ── Project header bar (alleen open; de speler ziet het front) ── */}
      {expert && (
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
          {/* Bovenbalk (editor-structuur.md stap 8): vaste knoppen, vaste menu's
              en het snelmenu dat je zelf vult met ☆ (ToolbarMenus.tsx). */}
          <ToolbarMenus
            defaultPins={['teensy', 'diagnose/internals', 'diagnose/test-patch']}
            before={(
              <>
                <button onClick={() => openPatchBrowser('voorbeelden')}
                  title="Patch kiezen: je eigen patches, de voorbeelden (standaardset, Poly, Solo), de pool van musicbrain.nl en diagnose (testpatches, Stress)"
                >📂 Patches…</button>
                <button
                  onClick={() => setShowCmd(true)}
                  title="Commandoregel (Ctrl+K): typ wat je wilt bouwen of veranderen — 'maak een 8x poly patch met een wavetable osc en een diode compressor op het eind', 'maak deze patch 4 stemmig', 'vervang de osc door een ladder'"
                  data-tour="command-button"
                  style={{ fontWeight: 600 }}
                >⌘ Recept</button>
              </>
            )}
            after={<button onClick={() => setShowTour(true)} title="Rondleiding door de editor, stap voor stap" data-tour="tour-button">?</button>}
            menus={[
              { id: 'project', label: 'Project', title: 'Bewaren, inlezen, SysEx, panelen, presets', items: [
                { id: 'export', label: '↓ Exporteer', title: 'Project downloaden als JSON', run: onExport },
                { id: 'import', label: '↑ Importeer', title: 'JSON-bestand laden', run: () => importRef.current?.click() },
                'sep',
                { id: 'syx-export', label: '⤓ Actieve patch als .syx', title: 'De actieve patch als .syx: voor de Teensy (firmwareconfig) en voor de editor (patch)', run: sysex.exportSyx },
                { id: 'syx-import', label: '⤒ .syx importeren als patch', title: 'Een MusicBrain-.syx inlezen als nieuwe patch', run: sysex.importSyx },
                { id: 'names-reaper', label: '⤓ Patchnamen voor Reaper', title: 'Reaper: MIDI-item → rechtsklik → Bank/program select → Load bank file', run: () => sysex.exportNames('reaper') },
                { id: 'names-cubase', label: '⤓ Patchnamen voor Cubase', title: 'Cubase: in de map Patchnames/inbox zetten, dan MIDI Device Manager → Install', run: () => sysex.exportNames('cubase') },
                'sep',
                { id: 'panels', label: 'Panels…', title: 'Eén paneel los exporteren of importeren (mmb-panel.v1)', run: () => setShowPanels(true) },
                { id: 'presets', label: 'Presets', title: 'Presets opslaan/laden (project of per module)', run: () => setShowPresets(true) },
                'sep',
                { id: 'new', label: 'Nieuw', title: 'Project wissen en opnieuw beginnen', danger: true,
                  run: () => { if (confirm('Project wissen en opnieuw beginnen?')) setProject(emptyModularProject()); } },
              ] },
              { id: 'klank', label: 'Klank', title: 'Editors voor golfvormen, samples, zang en de DX7', items: [
                { id: 'wave', label: '🖊 Wave', title: 'Teken een single-cycle golfvorm en push die live naar een Draw-VCO of Morph-WT (USER-bank)', run: () => setShowWave(true) },
                { id: 'sample', label: '🎧 Sample', title: 'Laad een audiobestand in een slot van de samplebank (SAMPLER-modules in de simulator én, indien verbonden, PSRAM + SD op de Teensy)', run: () => setShowSample(true) },
                { id: 'multisample', label: '🎹 Multisample', title: 'Eén lange opname (C1 zacht/midden/hard, C2 idem, …) ontleden tot een keymap: toonhoogte, velocity-lagen, uitsterving en loop-punten', run: () => setShowImport(true) },
                { id: 'zang', label: '🎤 Zang', title: 'Woorden om te zingen: spreek in of kies een wav, typ de lettergrepen, en de module ZANG zingt ze op de noten die je speelt', run: () => setShowLyric(true) },
                { id: 'dx7', label: '🎛 DX7', title: 'DX7-patch bewerken: algoritme, operators, envelopes — je hoort elke wijziging meteen in alle DX7-modules', run: () => setShowDx7(true) },
                { id: 'page4', label: '📟 Fairlight Page 4 / D',
                  title: playerPatch && cmiVoices(project, playerPatch).length > 0
                    ? 'De Fairlight CMI, groen op zwart. Page 4: kies een harmonische en teken hoe hard hij is over de noot. Page D: de golfvorm over de noot, en als bonus het profiel in 3D. Ook UIT SAMPLE en de CMI-bank zitten hier.'
                    : 'Alleen in een patch met een Fairlight (CMI-stem); kies er een in 📂 Patches…',
                  disabled: !playerPatch || cmiVoices(project, playerPatch).length === 0,
                  run: () => setShowPage4(true) },
              ] },
              { id: 'testen', label: 'Testen', title: 'De Teensy, en patches en modules om mee te testen', items: [
                { id: 'teensy', label: 'Teensy', title: 'Verbinden met Teensy via USB Serial en config pushen', run: () => setShowTeensy(true), tour: 'teensy-button' },
                'sep',
                // Uit de patchcatalogus (patchCatalog.ts); het id is dat van de catalogus.
                ...catalogMenu('diagnose').map((e) => ({ id: e.id, label: e.label, title: e.title, run: () => setProject(e.build(getProject())) })),
              ] },
            ]}
          />
          {sysex.ui}
          {showPage4 && playerPatch && cmiVoices(project, playerPatch).length > 0 && (() => {
            const cmi = cmiVoices(project, playerPatch);
            return <CmiPage4 patchId={playerPatch.id} owner={cmi[0]!.owner} voices={cmi.map((v) => v.id)} onClose={() => setShowPage4(false)} />;
          })()}
          <input ref={importRef} type="file" accept=".json,application/json"
            style={{ display: 'none' }} onChange={onImportFile} />
          {showPanels && (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{
                position: 'absolute', top: 14, right: 0, zIndex: 20,
                background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth: 220,
                maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column',
              }} onMouseLeave={() => setShowPanels(false)}>
                <button onClick={() => panelInRef.current?.click()}
                  style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid #e5e7eb',
                           background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13, height: 'auto' }}
                >↑ Paneel importeren…</button>
                {project.moduleTypes.filter((t) => t.id.startsWith('tp_mmb_')).map((t) => (
                  <button key={t.id} onClick={() => onExportPanel(t.id)}
                    style={{ textAlign: 'left', border: 'none', background: 'transparent',
                             padding: '6px 12px', cursor: 'pointer', fontSize: 12, height: 'auto' }}
                  >↓ {t.variant}</button>
                ))}
              </div>
            </span>
          )}
          <input ref={panelInRef} type="file" accept=".json,application/json"
            style={{ display: 'none' }} onChange={onImportPanelFile} />
        </div>
      </div>
      )}

      <CommandPalette open={showCmd} onClose={() => setShowCmd(false)} onBuilt={() => setTab('patcher')}
        onDemo={(ops) => { setShowCmd(false); runDemo(ops); }} />
      <Tour open={showTour} onClose={() => setShowTour(false)} onTab={(t) => setTab(t as Tab)} onOpenCommand={() => setShowCmd(true)} />
      <PlayTour open={showPlayTour && !expert} onClose={() => setShowPlayTour(false)} />
      <DemoCaption state={demo} onSkip={() => demoRef.current?.finish()} onClose={() => { demoRef.current?.stop(); setDemo(null); }} />

      <SecureContextNote />
      <IntakeNotice />
      <ZoomEscape />

      {/* ── Sub-tabs; dicht = alleen het front en "Binnenkijken" ── */}
      {/* De balk loopt op een smal scherm door op een tweede regel, zodat
          niets rechts buiten beeld valt en de tabs de pagina niet breder
          maken dan het scherm (Chrome op Android zoomt dan alles uit). */}
      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {!expert && (
          <>
            <span data-tour="play-patch" style={{ display: 'inline-flex', minWidth: 0, flex: phone ? '1 1 auto' : undefined }}><PatchSelect project={project} style={{ padding: '4px 8px', ...(phone ? { maxWidth: '100%' } : {}) }} /></span>
            {phone && (
              <PlayMenu project={project} patch={playerPatch}
                onInside={() => { setExpert(true); setTab('patcher'); }} onTour={() => setShowPlayTour(true)} />
            )}
            {!phone && <>
            {/* Spelen is ook tweaken: Bewaar zodra er iets gewijzigd is, en
                Bewaar als. Terug en A/B wonen in de editor (Binnenkijken). */}
            {playerPatch && <SaveButton patch={playerPatch} style={{ padding: '4px 12px' }} />}
            {playerPatch && <SaveAsButton project={project} patch={playerPatch} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd2d9', background: '#f5f7fa', cursor: 'pointer' }} />}
            <button onClick={() => { setExpert(true); setTab('patcher'); }}
              title={nlen('Open de hele editor: rack, kabels, modules', 'Open the whole editor: rack, cables, modules (in Dutch)')}
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd2d9', background: '#f5f7fa', cursor: 'pointer' }}>
              {nlen('Binnenkijken ▸', 'Look inside ▸')}
            </button>
            <button onClick={() => setShowPlayTour(true)} title={nlen('Rondleiding door de speelmodus, stap voor stap', 'A tour of play mode, step by step')}
              aria-label={nlen('Rondleiding', 'Tour')}
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd2d9', background: '#f5f7fa', cursor: 'pointer' }}>
              ?
            </button>
            </>}
          </>
        )}
        {expert && (
          <button onClick={() => setExpert(false)} title="Terug naar de speelmodus: alleen het front en het toetsenbord"
            style={{ padding: '4px 10px', marginRight: 6, fontSize: 12, borderRadius: 6, border: '1px solid #cbd2d9', background: '#fff7e6', cursor: 'pointer', fontWeight: 600 }}>
            ◂ Speelmodus
          </button>
        )}
        {expert && TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-tour={`tab-${t.id}`}
            aria-selected={tab === t.id}
            style={{
              padding: '6px 14px',
              borderRadius: '6px 6px 0 0',
              border: '1px solid #cbd2d9',
              borderBottom: 'none',
              background: tab === t.id ? '#ffffff' : '#f5f7fa',
              boxShadow: tab === t.id ? 'inset 0 3px 0 var(--mb-accent)' : undefined,
              fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer',
              fontSize: 13,
              position: 'relative',
              top: tab === t.id ? 1 : 0,
            }}
          >
            {t.label}
          </button>
        ))}
        {/* In de speelmodus niet: de eerste aanslag start de simulator, en de
            opnameknop staat in de werkbalk van het toetsenbord (FrontKeys). */}
        {expert && <SimQuickBar />}
      </nav>
      <MidiMonitorHost />
      <TakeEditorHost />
      <PatchInboxHost />
      <PoolWindowsHost />
      <PatchBrowserHost />

      {expert && tab === 'patches'    && <PatchesPanel />}
      {expert && tab === 'modules'    && <ModulesPanel />}
      {expert && tab === 'rack'       && <RackPanel />}
      {expert && tab === 'categories' && <CategoriesPanel />}
      {(tab === 'front' || !expert) && <FrontTab expert={expert} />}
      {expert && tab === 'patcher'    && <PatcherPanel />}
      {/* Surface-paneel is UI over de singleton surfaceBridge: de MIDI-
          koppeling zelf blijft actief als je naar een andere tab gaat. */}
      {expert && tab === 'surface'    && <ControlSurfacePanel />}
      {/* SimulationPanel blijft altijd gemount zodat de audio-engine en de
          gekozen MIDI-bron (bv. de auto-sequence) blijven draaien als je
          naar een andere tab gaat om aan knoppen te draaien of te patchen. */}
      <div style={{ display: expert && tab === 'simulation' ? 'block' : 'none' }}>
        <SimulationPanel />
      </div>

      {showPresets && <PresetsModal onClose={() => setShowPresets(false)} />}
      {showTeensy  && <TeensyLinkModal onClose={() => setShowTeensy(false)} />}
      <WaveDrawModal open={showWave} onClose={() => setShowWave(false)} />
      <SampleModal open={showSample} onClose={() => setShowSample(false)} />
      <SampleImportModal open={showImport} onClose={() => setShowImport(false)} />
      <LyricModal open={showLyric} onClose={() => setShowLyric(false)} defaultBank={zangBankInPatch(project)} />
      <Dx7EditorModal open={showDx7} onClose={() => setShowDx7(false)} />
    </section>
  );
}

/** Eén regel als de pagina geen secure context is (http op een
 *  netwerkadres, typisch de telefoon): dan doen de wasm-modules en Web MIDI
 *  het niet, en dat moet niet als losse foutjes per module binnenkomen. */
function SecureContextNote() {
  const hint = currentSecureContextHint();
  if (!hint) return null;
  return (
    <div role="alert" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 6, background: '#fff4e5', border: '1px solid #f0b060', fontSize: 13, lineHeight: 1.4 }}>
      <strong>Geen geluid en geen MIDI:</strong> {hint.text}{' '}
      {hint.httpsUrl && <>Start de dev-server met <code>npm run dev:https</code> en open <a href={hint.httpsUrl}>{hint.httpsUrl}</a> (certificaat eenmalig accepteren). </>}
      Of zet in Chrome <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> aan voor dit adres.
    </div>
  );
}

/** Uitweg uit de pinch-zoom op de telefoon. Het toetsenbord en de knoppen
 *  hebben `touch-action: none`, dus zodra het klavier het scherm vult is er
 *  geen plek meer om terug te knijpen. Zolang de pagina ingezoomd is staat
 *  er linksboven in het zichtbare deel één knopje: terug naar alles in beeld
 *  (de viewport-meta even op maximum-scale=1 zetten, wat Chrome en Safari
 *  als "terug naar 1" uitvoeren). */
function ZoomEscape(): JSX.Element | null {
  const [vv, setVv] = useState<{ scale: number; left: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return undefined;
    const sync = (): void => setVv(v.scale > 1.05 ? { scale: v.scale, left: v.offsetLeft, top: v.offsetTop } : null);
    v.addEventListener('resize', sync);
    v.addEventListener('scroll', sync);
    sync();
    return () => { v.removeEventListener('resize', sync); v.removeEventListener('scroll', sync); };
  }, []);
  if (!vv) return null;
  const reset = (): void => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const was = meta.content;
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';
    window.setTimeout(() => { meta.content = was; }, 150);
  };
  return (
    <button type="button" onClick={reset} title="Terug naar alles in beeld" aria-label="Terug naar alles in beeld"
      style={{
        position: 'fixed', left: vv.left + 6, top: vv.top + 6, zIndex: 1000,
        // Op het ingezoomde scherm even groot blijven: tegen de schaal in.
        transform: `scale(${1 / vv.scale})`, transformOrigin: 'top left',
        fontSize: 16, lineHeight: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd2d9', background: '#fff7e6', cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      }}>
      ⊡
    </button>
  );
}
