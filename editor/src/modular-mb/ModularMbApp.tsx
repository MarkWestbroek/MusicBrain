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
import { startDemo, DemoCaption, type DemoState, type DemoHandle } from './recipe/demo';
import type { PatchOp } from './recipe/types';
import { emptyModularProject, type ModularProject } from './types';
import { exportPanel, importPanel, parsePanelFile } from './panelIO';
import { BUS_SOLO_FX, CONSOLE_EQ_SOLO_FX, PARA_EQ_SOLO_FX, DIODE_SOLO_FX, EQ_SOLO_FX, FET_SOLO_FX, OPTO_SOLO_FX, SAMPLER_MASTER_FX, VARIMU_SOLO_FX, STEREO_TAPE_SOLO_FX, DIGITAL_ECHO_SOLO_FX, BBD_SOLO_FX, RINGMOD_SOLO_FX, OCTAVER_SOLO_FX, HARMONIZER_SOLO_FX, REVERB_SOLO_FX, SPRING_SOLO_FX, TREMOLO_SOLO_FX, STEREO_PHASER_SOLO_FX, VIBE_SOLO_FX, ROTARY_SOLO_FX, SHIMMER_SOLO_FX, seedExampleModules, seedInternals, seedTestPatch, seedFmTestPatch, seedCvBridgePatch, seedPolyVoicePatch, seedSoloVoicePatch, seedCloudsAmbientPatch, seedGenerativeJamPatch, seedDx7PolyPatch, seedSamplerPolyPatch, seedWarpsVocoderPatch, seedVocoderChoirPatch, seedZangPatch, seed808JamPatch, seedKrellPatch, type PolySeedOptions } from './seedModules';
import { seedCs80BrassPatch } from './seedBrass';
import { seedAxelFLeadPatch } from './seedAxelF';
import { seedSid3Patch, seedSidPolyPatch } from './seedSid';
import { seedMaterialBridgeDemo, seedReservoirDemo, seedTapeStripPolyPatch } from './seedModules';
import { DRIVE_SOLO_FX, ENSEMBLE_SOLO_FX, TUBE_SOLO_FX, FOLDER_SOLO_FX, FREQSHIFT_SOLO_FX, WAH_SOLO_FX, seedAcidJamPatch, seedComplexVoicePatch, seedEPianoPolyPatch, seedOrganPolyPatch, seedRunglerPatch, seedRhythmBoxPatch, seedSemSweepPatch, seedSynthexPolyPatch, seedWestCoastPatch } from './seedShowcase';

/** Effecten achter de solo-seeds (Solo ▾): de stand en de tooltip. */
const SOLO_FX = {
  fet:    { fx: FET_SOLO_FX,    title: 'Monofoon met FET COMP (1176-stijl) tussen instrument en OUT: Input +14, Output −6, Ratio 4:1. Probeer Ratio All.' },
  opto:   { fx: OPTO_SOLO_FX,   title: 'Monofoon met OPTO COMP (LA-2A-stijl): Peak Reduction 55, Gain +4. Traag en vloeiend; hoor hoe de gain reduction na een noot in twee fasen wegloopt.' },
  bus:    { fx: BUS_SOLO_FX,    title: 'Monofoon met VCA-BUS (SSL-stijl): attack 30 ms, release Auto, 4:1 — de aanslag komt erdoor en het pompt mee.' },
  varimu: { fx: VARIMU_SOLO_FX, title: 'Monofoon met VARI-MU (Fairchild-stijl): Input +10, tijdstand 2, Color 1,3 — dik en warm, de ratio loopt op met het ingrijpen.' },
  diode:  { fx: DIODE_SOLO_FX,  title: 'Monofoon met DIODE COMP (Neve-33609-stijl): drempel −28, 4:1, release A1, Color 1,2 — flink ingrijpen, dan hoor je de oneven harmonischen van de diodes.' },
  console: { fx: CONSOLE_EQ_SOLO_FX, title: 'Monofoon met CONSOLE EQ (1073-stijl): HPF 80 Hz, Low +4 op 60 Hz, Mid +3 op 3,2 kHz, High +2. Hoor de bult van de inductor in het laag.' },
  para:   { fx: PARA_EQ_SOLO_FX, title: 'Monofoon met PARA EQ (SSL/API-stijl): HPF 40, smile-curve (LF +3, LMF −2, HMF +3, HF +2) met Prop.Q aan.' },
  eq:     { fx: EQ_SOLO_FX,     title: 'Monofoon met PROGRAM EQ (Pultec-stijl): de Pultec-truc op 60 Hz (boost 8, atten 6) en wat glans op 8 kHz.' },
  tape:   { fx: STEREO_TAPE_SOLO_FX, title: 'Monofoon met STEREO TAPE: 320 ms links, ratio 1,5 rechts (gepunteerd), Cross 0,6 — de echo\'s kruipen van links naar rechts; wow/flutter zweven per spoor.' },
  ddl:    { fx: DIGITAL_ECHO_SOLO_FX, title: 'Monofoon met DIGITAL ECHO (12-bit, band 7 kHz, modulatie 0,7 Hz): de rack-delay van begin jaren tachtig, gruis en chorus op de herhalingen.' },
  bbd:    { fx: BBD_SOLO_FX,    title: 'Monofoon met BBD CHORUS (9 ms, 0,5 Hz, Spread 1): mono in, breed stereo uit — het Dimension-beeld.' },
  ring:   { fx: RINGMOD_SOLO_FX, title: 'Monofoon met RING MOD (diode, 330 Hz, mix 0,7): klokken en metaal; stem Freq op de toonsoort voor harmonische boventonen.' },
  oct:    { fx: OCTAVER_SOLO_FX, title: 'Monofoon met OCTAVER (−1 oct 0,8, −2 oct 0,3): de analoge sub onder de noot; speel één noot tegelijk.' },
  harm:   { fx: HARMONIZER_SOLO_FX, title: 'Monofoon met HARMONIZER: stem A +7 (kwint, links), stem B +12 +5 ct (octaaf, rechts), wat feedback — koor van kwinten en octaven.' },
  plate:  { fx: REVERB_SOLO_FX, title: 'Monofoon met REVERB in Plate-stand (Dattorro-tank, size 0,7, predelay 15 ms): de gladde studioplaat.' },
  spring: { fx: SPRING_SOLO_FX, title: 'Monofoon met REVERB in Spring-stand: twee veren met dispersie — de boing van een gitaarversterker.' },
  trem:   { fx: TREMOLO_SOLO_FX, title: 'Monofoon met TREMOLO in Harm-stand (brownface): laag en hoog in tegenfase op 5,2 Hz — half tremolo, half phaser.' },
  vibe:   { fx: VIBE_SOLO_FX, title: 'Monofoon met VIBE (univibe-stijl): Chorus-stand, 1,6 Hz, lampkarakter 0,75 — het ademende, scheve kloppen tussen chorus en phaser in.' },
  rotary: { fx: ROTARY_SOLO_FX, title: 'Monofoon met ROTARY (Leslie-stijl): begint op Slow; zet Speed op Fast en hoor hoorn en trommel elk in hun eigen tempo opwinden. Hang de Fast-gate aan het mod-wiel voor de klassieke schakelaar.' },
  shimmer: { fx: SHIMMER_SOLO_FX, title: 'Monofoon met SHIMMER: plaatgalm met een octaaf omhoog in de lus (shimmer 0,55) — een glinsterende wolk boven wat je speelt.' },
  sphase: { fx: STEREO_PHASER_SOLO_FX, title: 'Monofoon met STEREO PHASER: 2 × 6 stages, rechts een kwartslag verschoven, feedback 0,45.' },
  drive:  { fx: DRIVE_SOLO_FX, title: 'Monofoon met DRIVE in de overdrive-stand: het midden komt naar voren, het laag blijft strak. Probeer Mode Dist en Fuzz.' },
  folder: { fx: FOLDER_SOLO_FX, title: 'Fluit (bijna een sinus) door de FOLDER (stand 259): draai Fold open en hoor de boventonen erbij vouwen; Sym voegt even boventonen toe.' },
  fshift: { fx: FREQSHIFT_SOLO_FX, title: 'Monofoon met FREQ SHIFT (+35 Hz, wat feedback): de boventonen schuiven uit hun verhouding, klokachtig. Range 5 Hz geeft een trage zweving.' },
  wah:    { fx: WAH_SOLO_FX, title: 'Monofoon met WAH in de stand Auto↑ (touch-wah): harder spelen opent het filter. Probeer Type Vowel voor het sprekende filter en Mode LFO.' },
  tube:   { fx: TUBE_SOLO_FX, title: 'Getokkelde snaar door TUBE in de Amp-stand (Marshall-stack, flink opengedraaid): twee triodes, toonstack, eindtrap met sag en een kast. Probeer Stack Fender of Vox, en Mode Studio voor alleen buiswarmte.' },
  ensemble: { fx: ENSEMBLE_SOLO_FX, title: 'Gestreken snaar door de ENSEMBLE: drie vertragingslijnen in drie fasen maken van één stem een strijkersgroep, breed en zonder hoorbaar golven.' },
} as const;
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
import { PatchExportMenu } from './sim/PatchExportMenu';
import { PatchInboxHost } from './sim/PatchInbox';
import { PoolWindowsHost, offerFromPool } from './sim/PoolWindows';
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
  // ?patch=<slug>: een patch van musicbrain.nl aanbieden via de inbox (patch-pool §5).
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('patch');
    if (!slug) return;
    void offerFromPool(slug).catch((e) => console.warn('patch-pool:', e instanceof Error ? e.message : e));
    const u = new URL(window.location.href); u.searchParams.delete('patch');
    window.history.replaceState(null, '', u.toString());
  }, []);
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
  const [showPoly,    setShowPoly]    = useState(false);
  const [showStress,  setShowStress]  = useState(false);
  const [showSolo,    setShowSolo]    = useState(false);
  const [showCmd,     setShowCmd]     = useState(false);   // Ctrl+K commandoregel (ED-RC-2)
  const [showTour,    setShowTour]    = useState(false);   // rondleiding (ED-RC-4)
  const [demo,        setDemo]        = useState<DemoState | null>(null);
  const demoRef = useRef<DemoHandle | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const panelInRef = useRef<HTMLInputElement>(null);
  const [showPanels, setShowPanels] = useState(false);

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
    <section style={{ fontFamily: 'var(--mb-font-sans)' }}>

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
          <button onClick={onExport} title="Project downloaden als JSON">↓ Exporteer</button>
          <button onClick={() => importRef.current?.click()} title="JSON-bestand laden">↑ Importeer</button>
          <PatchExportMenu />
          <input ref={importRef} type="file" accept=".json,application/json"
            style={{ display: 'none' }} onChange={onImportFile} />
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button onClick={() => setShowPanels((v) => !v)}
              title="Eén paneel los exporteren of importeren (mmb-panel.v1)"
            >Panels ▾</button>
            {showPanels && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 20,
                background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth: 220,
                maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column',
              }} onMouseLeave={() => setShowPanels(false)}>
                <button onClick={() => panelInRef.current?.click()}
                  style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid #e5e7eb',
                           background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >↑ Paneel importeren…</button>
                {project.moduleTypes.filter((t) => t.id.startsWith('tp_mmb_')).map((t) => (
                  <button key={t.id} onClick={() => onExportPanel(t.id)}
                    style={{ textAlign: 'left', border: 'none', background: 'transparent',
                             padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
                  >↓ {t.variant}</button>
                ))}
              </div>
            )}
          </span>
          <input ref={panelInRef} type="file" accept=".json,application/json"
            style={{ display: 'none' }} onChange={onImportPanelFile} />
          <button
            onClick={() => setShowCmd(true)}
            title="Commandoregel (Ctrl+K): typ wat je wilt bouwen of veranderen — 'maak een 8x poly patch met een wavetable osc en een diode compressor op het eind', 'maak deze patch 4 stemmig', 'vervang de osc door een ladder'"
            data-tour="command-button"
            style={{ fontWeight: 600 }}
          >⌘ Recept</button>
          <button onClick={() => setShowTour(true)} title="Rondleiding door de editor, stap voor stap" data-tour="tour-button">?</button>
          <button
            onClick={() => setShowPresets(true)}
            title="Presets opslaan/laden (project of per module)"
          >Presets</button>
          <button
            onClick={() => setShowTeensy(true)}
            title="Verbinden met Teensy via USB Serial en config pushen"
            data-tour="teensy-button"
          >Teensy</button>
          <button
            onClick={() => setShowWave(true)}
            title="Teken een single-cycle golfvorm en push die live naar een Draw-VCO of Morph-WT (USER-bank)"
          >🖊 Wave</button>
          <button
            onClick={() => setShowSample(true)}
            title="Laad een audiobestand in een slot van de samplebank (SAMPLER-modules in de simulator én, indien verbonden, PSRAM + SD op de Teensy)"
          >🎧 Sample</button>
          <button
            onClick={() => setShowImport(true)}
            title="Eén lange opname (C1 zacht/midden/hard, C2 idem, …) ontleden tot een keymap: toonhoogte, velocity-lagen, uitsterving en loop-punten"
          >🎹 Multisample</button>
          <button
            onClick={() => setShowLyric(true)}
            title="Woorden om te zingen: spreek in of kies een wav, typ de lettergrepen, en de module ZANG zingt ze op de noten die je speelt"
          >🎤 Zang</button>
          <button
            onClick={() => setShowDx7(true)}
            title="DX7-patch bewerken: algoritme, operators, envelopes — je hoort elke wijziging meteen in alle DX7-modules"
          >🎛 DX7</button>
          <button
            onClick={() => setProject(seedExampleModules(getProject()))}
            title="Voeg 6 voorbeeld-modules toe aan dit project en plaats ze in het actieve rack"
          >Voorbeelden</button>
          <button
            onClick={() => setProject(seedInternals(getProject()))}
            title="Voeg MMB-modules (AHDSR, LFO, S&H, VCO, VCF, VCA, OUT, SEQ-8) toe aan het virtuele rack"
          >Internals</button>
          <button
            onClick={() => setProject(seedTestPatch(getProject()))}
            title="Maak een nieuw Test rack + Test patch: VCO → VCF → VCA → OUT met ENV → VCA. Klaar om in de Simulatie-tab af te spelen."
          >Test-patch</button>
          <button
            onClick={() => setProject(seedFmTestPatch(getProject()))}
            title="FM-testpatch (2-op): MIDI-IN → VCO (sinus-modulator, +12 st) → FM-VCO → VCF → VCA → OUT met ENV → VCA. Speelbaar in de Simulatie-tab."
          >FM-test</button>
          <button
            onClick={() => setProject(seedCvBridgePatch(getProject()))}
            title="CV-bridge patch: MidiIn → VCO → VCF → VCA, 2×AHDSR (filter+amp), velocity via CvMath."
          >CV-bridge</button>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowPoly((v) => !v)}
              title="Seed een N-stemmige polyfonie-testpatch (ADR 0011): MidiIn (N stemmen) → N× voice-keten → MIXER → OUT. N≤4=4-in mixer, N≤8=8-in, N≤16=16-in."
            >Poly ▾</button>
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
                <button
                  onClick={() => { setProject(seedPolyVoicePatch(getProject(), 4, { aftertouch: true })); setShowPoly(false); }}
                  title="4-stemmig met aftertouch → filter: MidiIn.press (per stem) op de c-ingang van de sum-CvMath vóór het filter; druk na de aanslag opent de cutoff tot anderhalf octaaf. Channel-aftertouch (Keystep) opent alle stemmen, poly-aftertouch alleen die toets."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >4-stemmig + aftertouch → filter</button>
                <button
                  onClick={() => { setProject(seedCs80BrassPatch(getProject(), 6)); setShowPoly(false); }}
                  title="CS-80-koper à la Vangelis, 6 stemmen: zaagtand → ladder met trage filter-attack. Aftertouch opent het filter (tot vier octaven) en voegt vibrato toe (opgeteld bij het modwheel). BBD-chorus en plaatgalm op de bus. Speel langzaam en druk ná de aanslag door."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎺 CS-80 koper (aftertouch)</button>
                <button
                  onClick={() => { setProject(seedAxelFLeadPatch(getProject())); setShowPoly(false); }}
                  title="Axel F-lead (Faltermeyer), recept van Doctor Mix: twee saws in unison (±6 ct) → ladder die ver openstaat → Para EQ (low-cut, dip bij 450 Hz) → Digital Echo op een punt-achtste bij 117 BPM. Monofoon; speel staccato."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎹 Axel F-lead (2 saws)</button>
                <button
                  onClick={() => { setProject(seedSidPolyPatch(getProject())); setShowPoly(false); }}
                  title="SID ×3 (C64): één SID-emulatie met drie stem-cellen als PolyGroup, MIDI-in verdeelt de noten. Pulse met een langzame PWM (LFO op PW+), pitch-wheel op Bend. Nog zonder filter."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID ×3 (C64)</button>
                <button
                  onClick={() => { setProject(seedSidPolyPatch(getProject(), 2)); setShowPoly(false); }}
                  title="SID ×6: 2 SID's in één module (knop SIDs = 2), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID ×6 (2 chips, stereo)</button>
                <button
                  onClick={() => { setProject(seedSidPolyPatch(getProject(), 3)); setShowPoly(false); }}
                  title="SID ×9: 3 SID's in één module (knop SIDs = 3), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID ×9 (3 chips, stereo)</button>
                <button
                  onClick={() => { setProject(seedSidPolyPatch(getProject(), 4)); setShowPoly(false); }}
                  title="SID ×12: 4 SID's in één module (knop SIDs = 4), elke chip drie stemmen en een eigen filter; MIDI-in verdeelt de noten, Spread verdeelt de chips over L/R."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID ×12 (4 chips, stereo)</button>
                <button
                  onClick={() => { setProject(seedSid3Patch(getProject(), 1)); setShowPoly(false); }}
                  title="SID 3-osc lead: één SID met instellingen per stem, Stack — drie oscillatoren op één noot (pulse, saw 8 ct hoger, driehoek een octaaf lager) door een 6581-lowpass."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID 3-osc lead (mono)</button>
                <button
                  onClick={() => { setProject(seedSid3Patch(getProject(), 4)); setShowPoly(false); }}
                  title="SID 3-osc ×4: vier SID 3-osc's in een PolyGroup — elke noot een eigen chip met eigen filter, via een mixer."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🕹️ SID 3-osc ×4 (poly)</button>
                <button
                  onClick={() => { setProject(seedDx7PolyPatch(getProject(), 8)); setShowPoly(false); }}
                  title="8-stemmige DX7 (msfa/Dexed-kern): MidiIn -> 8x DX7 -> Mixer8 -> OUT, stereo uitgewaaierd. Bank-knop kiest een factory-ROM (1A..4B); USER = .syx via de Teensy-modal."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >🎹 DX7 poly ×8</button>
                <button
                  onClick={() => { setProject(seedSamplerPolyPatch(getProject(), 8)); setShowPoly(false); }}
                  title="Multisampler als multi-module: één SAMPLER met acht stem-cellen als PolyGroup. MidiIn verdeelt de noten; de bank zit één keer in het geheugen. Laad een bank via 🎹 Multisample."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎧 Sampler ×8 (cellen)</button>
                <button
                  onClick={() => { setProject(seedTapeStripPolyPatch(getProject(), 8)); setShowPoly(false); }}
                  title="Mellotron-mechanica om de samplerbank: per toets een bandje van 8 s dat na loslaten terugspoelt, kopcontact, motorbelasting, wow/flutter en slijtage. Gebruikt de bank van de sampler (bankbalk in Simulatie)."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >📼 Tape strip ×8 (Mellotron)</button>
                <button
                  onClick={() => { setProject(seedOrganPolyPatch(getProject())); setShowPoly(false); }}
                  title="MidiIn → ORGAN (tonewheel-orgel, twaalf toetsen) → ROTARY → OUT. 888000000 met percussie en chorus; het mod-wiel schakelt de luidspreker."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎹 Organ ×12 (tonewheel + Rotary)</button>
                <button
                  onClick={() => { setProject(seedEPianoPolyPatch(getProject())); setShowPoly(false); }}
                  title="MidiIn → E-PIANO (twaalf toetsen, velocity bekabeld) → OUT. Een model van tine en pickup; de klank verandert met de aanslag."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎹 E-piano ×12 (tine / reed)</button>
                <button
                  onClick={() => { setProject(seedSynthexPolyPatch(getProject())); setShowPoly(false); }}
                  title="MidiIn → SYNTHEX (acht stemmen naar de Elka Synthex) → OUT. Pitch-wheel = joystick X, mod-wiel = joystick Y (filter)."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎛️ Synthex ×8 (Elka)</button>
                <button
                  onClick={() => { setProject(seedZangPatch(getProject(), 8)); setShowPoly(false); }}
                  title="Zingende stem: ZANG met acht stem-cellen als PolyGroup, met galm. Elke aanslag zingt de volgende lettergreep. Maak een lyricbank via 🎤 Zang."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎤 Zingende stem ×8</button>
                <button
                  onClick={() => { setProject(seedSoloVoicePatch(getProject(), 'tp_mmb_fof', 'FOF Stem', 'out', 'out', { vowel: 0, tone: 0.5, breath: 0.08, vibrato: 0.12, level: 0.8, voice: 0.35 })); setShowPoly(false); }}
                  title="FOF/CHANT-geinspireerde monofone zangoscillator. Speel noten en morf met Vowel door A-E-I-O-U; geen opname of lyricbank nodig."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >FOF Stem (mono)</button>
                <button
                  onClick={() => { setProject(seedSamplerPolyPatch(getProject(), 8, true)); setShowPoly(false); }}
                  title="Sampler ×8 met per stem een MS-20 in de cel, gestuurd door de envelope-follower van diezelfde stem: env_k → cutoff_k. Eén kabel in de patcher, uitgevouwen over alle stemmen."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎧 Sampler ×8 auto-wah</button>
                <button
                  onClick={() => { setProject(seedSamplerPolyPatch(getProject(), 8, true, true)); setShowPoly(false); }}
                  title="Sampler ×8 auto-wah, en daarachter FET COMP (1176-stijl, stereo): Input +12 drukt hem stevig samen, Output −4 haalt het niveau terug. Probeer Ratio All."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎧 Sampler ×8 auto-wah + FET</button>
                <button
                  onClick={() => { setProject(seedSamplerPolyPatch(getProject(), 8, false, SAMPLER_MASTER_FX)); setShowPoly(false); }}
                  title="Sampler ×8 met een mastering-keten: PROGRAM EQ (Pultec-stijl, de Pultec-truc op 60 Hz en wat lucht op 10 kHz) en daarna VARI-MU (Fairchild-stijl) als lijm."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎧 Sampler ×8 + EQ + Vari-mu</button>
              </div>
            )}
          </span>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowSolo((v) => !v)}
              title="Solo-seeds: de kortst mogelijke speelbare patch rond één instrument (MidiIn → module → OUT) — om Rings/Plaits/Elements/STK te leren kennen."
            >Solo ▾</button>
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
                  { label: '🧪 Acid (303-stijl bas)', t: 'tp_mmb_acid', n: 'ACID', l: 'out', r: 'out',
                    c: { wave: 0, tune: -12, cutoff: 0.3, res: 0.8, envmod: 0.65, decay: 0.35, accent: 0.7, level: 0.8 } },
                  { label: '〽️ Fluit + FOLDER (West Coast)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 3, level: 0.9 }, fx: 'folder' },
                  { label: '🎻 Strijker + ENSEMBLE (string machine)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 2, level: 0.9 }, fx: 'ensemble' },
                  { label: '🦆 String + WAH (touch-wah)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
                    c: { pluck: 0.8, level: 0.9 }, fx: 'wah' },
                  { label: '🎸 String + DRIVE (overdrive/fuzz)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
                    c: { pluck: 0.6, level: 0.8 }, fx: 'drive' },
                  { label: '🔥 String + TUBE (buizenversterker)', t: 'tp_mmb_string', n: 'String', l: 'out', r: 'out',
                    c: { pluck: 0.6, level: 0.8 }, fx: 'tube' },
                  { label: '🔔 Rings + FREQ SHIFT', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'fshift' },
                  { label: '〰️ Scanned (levende golftabel)', t: 'tp_mmb_scanned', n: 'Scanned', l: 'out', r: 'out',
                    c: { tension: 0.6, damping: 0.3, restore: 0.3, speed: 0.15, position: 0.5, width: 0.3, level: 0.8 } },
                  { label: '🎲 GENDYN (stochastisch)', t: 'tp_mmb_gendyn', n: 'GENDYN', l: 'out', r: 'out',
                    c: { points: 12, amp_step: 0.3, dur_step: 0.3, dist: 0.3, smooth: 0.5, settle: 0.1, seed: 1, level: 0.8 } },
                  { label: '🫧 Excitable (prikkelbaar medium)', t: 'tp_mmb_excitable', n: 'Excitable', l: 'out_l', r: 'out_r',
                    c: { detune: 7, excite: 3, refract: 12, thresh: 1, speed: 2, pickup: 0.4, level: 0.8 } },
                  { label: 'Material Bridge (materiaalgeheugen)', t: 'tp_mmb_material_bridge', n: 'Material Bridge', l: 'out_l', r: 'out_r',
                    c: { spread: 0.12, coupling: 0.65, decay: 4, memory: 0.85, recovery: 2, pickup: 0.25, level: 0.8 } },
                  { label: '💍 Rings (resonator)', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 } },
                  { label: '🎛️ Plaits (24 engines)', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 } },
                  { label: '💎 Elements (modaal)', t: 'tp_mmb_elements', n: 'Elements', l: 'out_l', r: 'out_r',
                    c: { strike: 0.8, space: 0.5, level: 0.8 } },
                  { label: '🎻 STK (9 instrumenten)', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 0, level: 0.8 } },
                  { label: '🎹 DX7 (6-op FM)', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 } },
                  { label: '🎚️ DX7 + FET comp', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'fet' },
                  { label: '🎚️ Rings + Opto comp', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 },
                    fx: 'opto' },
                  { label: '🎚️ Plaits + VCA-bus', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'bus' },
                  { label: '🎚️ Elements + Vari-mu', t: 'tp_mmb_elements', n: 'Elements', l: 'out_l', r: 'out_r',
                    c: { strike: 0.8, space: 0.5, level: 0.8 }, fx: 'varimu' },
                  { label: '🎚️ STK + Program EQ', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 0, level: 0.8 }, fx: 'eq' },
                  { label: '🎚️ DX7 + Diode comp', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'diode' },
                  { label: '🎚️ Rings + Console EQ', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 },
                    fx: 'console' },
                  { label: '🎚️ Plaits + Para EQ', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'para' },
                  { label: '🔁 Plaits + Stereo tape', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'tape' },
                  { label: '🔁 DX7 + Digital echo', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'ddl' },
                  { label: '🌊 DX7 + BBD chorus', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'bbd' },
                  { label: '💍 Rings + Ring mod', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'ring' },
                  { label: '🎸 STK + Octaver', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 0, level: 0.8 }, fx: 'oct' },
                  { label: '🎶 Plaits + Harmonizer', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'harm' },
                  { label: '🏛️ Rings + Plate reverb', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'plate' },
                  { label: '🪃 STK + Spring reverb', t: 'tp_mmb_stk_sound', n: 'STK', l: 'out', r: 'out',
                    c: { sound: 0, level: 0.8 }, fx: 'spring' },
                  { label: '〰️ DX7 + Tremolo', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'trem' },
                  { label: '💡 DX7 + Vibe', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'vibe' },
                  { label: '🌪️ DX7 + Rotary', t: 'tp_mmb_dx7', n: 'DX7', l: 'out', r: 'out',
                    c: { program: 0, level: 0.8 }, fx: 'rotary' },
                  { label: '✨ Rings + Shimmer', t: 'tp_mmb_rings', n: 'Rings', l: 'out_l', r: 'out_r',
                    c: { structure: 0.4, brightness: 0.6, damping: 0.6, position: 0.3, model: 0, polyphony: 1, level: 0.8 }, fx: 'shimmer' },
                  { label: '🌀 Plaits + Stereo phaser', t: 'tp_mmb_plaits', n: 'Plaits', l: 'out', r: 'aux',
                    c: { engine: 0, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.5, level: 0.8 }, fx: 'sphase' },
                ] as { label: string; t: string; n: string; l: string; r: string;
                       c: Record<string, number>; fx?: keyof typeof SOLO_FX }[]).map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setProject(seedSoloVoicePatch(getProject(), s.t, s.n, s.l, s.r, s.c,
                        s.fx ? SOLO_FX[s.fx].fx : undefined));
                      setShowSolo(false);
                    }}
                    title={s.fx ? SOLO_FX[s.fx].title : undefined}
                    style={{
                      textAlign: 'left', border: 'none', background: 'transparent',
                      padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    }}
                  >{s.label}</button>
                ))}
                <button
                  onClick={() => { setProject(seedCloudsAmbientPatch(getProject())); setShowSolo(false); }}
                  title="Plaits → Clouds (granular) → OUT, met Tides als quadratuur-LFO op position/texture. Speel één noot en laat de wolk drijven."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >☁️ Clouds ambient (+Tides)</button>
                <button
                  onClick={() => { setProject(seedGenerativeJamPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelend: Marbles kiest noten en klokt Plaits (grain-engine), Clouds + Tides maken er een drijvende wolk van. Geen MIDI nodig."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎲 Generative jam (Marbles)</button>
                <button
                  onClick={() => { setProject(seedMaterialBridgeDemo(getProject())); setShowSolo(false); }}
                  title="Zacht-hard-zacht-frase op Hit A plus een trage Hit B; drie varianten: Memory uit, alleen brug, brug + vermoeiing."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >Material Bridge demo (frase)</button>
                <button
                  onClick={() => { setProject(seedReservoirDemo(getProject())); setShowSolo(false); }}
                  title="Twee zelfspelende stemmen delen een eindige, herstellende bron; A/B: Drain 0,7 tegenover 0."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >Reservoir demo (gedeelde bron)</button>
                <button
                  onClick={() => { setProject(seedAcidJamPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelend: Clock → Seq → ACID, Euclid op Accent en Slide, Chaos op de cutoff, kick op de tel. Draai aan Cutoff, Reso en Env mod."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🧪 Acid jam (Clock + Euclid + Chaos)</button>
                <button
                  onClick={() => { setProject(seedWestCoastPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelend: Turing → Quantizer → sinus → FOLDER → LPG → galm; LFO-8 en Chaos bewegen de folder, de pulsen van Turing pingen de gate."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🌊 West Coast (Turing + Folder + LPG)</button>
                <button
                  onClick={() => { setProject(seedRunglerPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelende chaos naar de Benjolin van Rob Hordijk: twee oscillatoren en een schuifregister die elkaar sturen. Het klavier stemt oscillator A."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🌀 Rungler (Benjolin-stijl chaos)</button>
                <button
                  onClick={() => { setProject(seedComplexVoicePatch(getProject())); setShowSolo(false); }}
                  title="West Coast-stem onder het klavier: COMPLEX (259-stijl) door de LPG; SLOPE opent de gate en beweegt het timbre."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🎛️ Buchla-stem (Complex + LPG)</button>
                <button
                  onClick={() => { setProject(seedSemSweepPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelend: zaag op een sequencerlijn door het SEM-filter; Mode schuift traag van laagdoorlaat via notch naar hoogdoorlaat."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🎚️ SEM sweep (LP → notch → HP)</button>
                <button
                  onClick={() => { setProject(seedRhythmBoxPatch(getProject())); setShowSolo(false); }}
                  title="Ritmebox met de presets van de CR-78 (overgenomen uit de Service Notes). Draai aan Rhythm; pad 1 start/stopt."
                  style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                >🥁 Ritmebox (CR-78-presets)</button>
                <button
                  onClick={() => { setProject(seedWarpsVocoderPatch(getProject())); setShowSolo(false); }}
                  title="Vocoder: jouw keyboard bespeelt Warps' interne zaag-carrier; Marbles klokt Plaits als ritmische modulator. Houd een noot aan en draai Timbre."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🗣️ Warps vocoder</button>
                <button
                  onClick={() => { setProject(seedVocoderChoirPatch(getProject(), 'plaits')); setShowSolo(false); }}
                  title="Het koor zingt woorden: de sampler (koor) is de drager van Warps' vocoder, Plaits' spraak-engine spreekt bij elke aanslag een woord. Speel akkoorden; Morph kiest het woord."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎶 Koor zingt woorden (vocoder)</button>
                <button
                  onClick={() => { setProject(seedVocoderChoirPatch(getProject(), 'mic')); setShowSolo(false); }}
                  title="Het koor zingt jouw stem: praat of zing in de microfoon (AUDIO IN) en speel akkoorden. Gebruik een koptelefoon."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎤 Koor zingt jouw stem (vocoder + mic)</button>
                <button
                  onClick={() => { setProject(seedVocoderChoirPatch(getProject(), 'zang')); setShowSolo(false); }}
                  title="Het koor zingt jouw woorden: de module ZANG levert bij elke aanslag de volgende lettergreep uit je lyricbank, het koor zingt hem via de vocoder. Maak de bank met 🎤 Zang."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🎶 Koor zingt jouw woorden (vocoder + ZANG)</button>
                <button
                  onClick={() => { setProject(seed808JamPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelend 808-ritme: Marbles klokt kick/snare/hat (Peaks-drums) door een mixer. Draai aan Marbles Deja vu voor een vaste groove."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🥁 808 jam (Peaks)</button>
                <button
                  onClick={() => { setProject(seedKrellPatch(getProject())); setShowSolo(false); }}
                  title="Zelfspelende Krell-patch: Stages triggert zichzelf + Marbles, envelope stuurt Morph-WT door Clouds. Oneindige melodie zonder MIDI."
                  style={{
                    textAlign: 'left', border: 'none', background: 'transparent',
                    padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  }}
                >🌌 Krell (zelfspelend)</button>
              </div>
            )}
          </span>
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowStress((v) => !v)}
              title="Stress-seeds: energievretende varianten van de poly-patch om de Teensy te pushen. Kijk in de status-strip (CPU / blocks / loop) hoe ver hij gaat."
            >Stress ▾</button>
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
      )}

      <CommandPalette open={showCmd} onClose={() => setShowCmd(false)} onBuilt={() => setTab('patcher')}
        onDemo={(ops) => { setShowCmd(false); runDemo(ops); }} />
      <Tour open={showTour} onClose={() => setShowTour(false)} onTab={(t) => setTab(t as Tab)} onOpenCommand={() => setShowCmd(true)} />
      <DemoCaption state={demo} onSkip={() => demoRef.current?.finish()} onClose={() => { demoRef.current?.stop(); setDemo(null); }} />

      <SecureContextNote />
      <ZoomEscape />

      {/* ── Sub-tabs; dicht = alleen het front en "Binnenkijken" ── */}
      {/* In de speelmodus loopt de balk op een smal scherm door op een tweede
          regel: anders staan ▶ Sim en de opnameknop rechts buiten beeld. */}
      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12, alignItems: 'center', flexWrap: expert ? undefined : 'wrap' }}>
        {!expert && (
          <>
            <PatchSelect project={project} style={{ padding: '4px 8px' }} />
            {/* Spelen is ook tweaken: Bewaar zodra er iets gewijzigd is, en
                Bewaar als. Terug en A/B wonen in de editor (Binnenkijken). */}
            {playerPatch && <SaveButton patch={playerPatch} style={{ padding: '4px 12px' }} />}
            {playerPatch && <SaveAsButton project={project} patch={playerPatch} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd2d9', background: '#f5f7fa', cursor: 'pointer' }} />}
            <button onClick={() => { setExpert(true); setTab('patcher'); }} title="Open de hele editor: rack, kabels, modules"
              style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #cbd2d9', background: '#f5f7fa', cursor: 'pointer' }}>
              Binnenkijken ▸
            </button>
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
        <SimQuickBar />
      </nav>
      <MidiMonitorHost />
      <TakeEditorHost />
      <PatchInboxHost />
      <PoolWindowsHost />

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
