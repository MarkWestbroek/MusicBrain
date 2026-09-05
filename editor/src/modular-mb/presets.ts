// Modular MB — preset library (iter-5.10 / C2-C3)
//
// Twee soorten presets:
//   1. Patch-preset       = complete ModularProject snapshot (modules+rack+patch+
//                           controlState).  Laden = volledige projectvervanging
//                           (met bevestiging).
//   2. Module-preset      = enkel controlState voor één module-type. Laden =
//                           kopieer waarden naar geselecteerde module van
//                           hetzelfde type in het actieve patch.
//
// Opslag:
//   • localStorage key `mmb.presets.v1` — user-bibliotheek (JSON).
//   • Export/Import als .json bestand voor delen.
//   • Factory-presets staan in code (factoryPatchPresets / factoryModulePresets)
//     en verschijnen altijd boven de user-presets.

import {
  type ModularProject,
  type ControlValue,
  type Patch,
  type Rack,
  type ModuleInstance,
  type PolyGroup,
  emptyModularProject,
} from './types';
import { seedInternals, seedTestPatch, seedFmTestPatch, seedPolyVoicePatch } from './seedModules';const STORAGE_KEY = 'mmb.presets.v1';

export interface PatchPresetData {
  id: string;
  name: string;
  description?: string;
  /** Volledige ModularProject snapshot. */
  project: ModularProject;
  createdAt: number;
}

export interface ModulePresetData {
  id: string;
  name: string;
  description?: string;
  /** ModuleType-id waar deze preset op past. */
  typeId: string;
  /** controlId → waarde. */
  controlValues: Record<string, ControlValue>;
  createdAt: number;
}

/** Een patch-set-preset bewaart alleen één of meer losse patches (kabels,
 *  knopstanden, envelopes, LFO's) — NIET de modules/racks. Laden vóégt de
 *  patches toe aan het huidige project; ze verwijzen naar bestaande modules
 *  via hun id, dus ze passen het best in hetzelfde (of een afgeleid) project. */
export interface PatchSetPresetData {
  id: string;
  name: string;
  description?: string;
  patches: Patch[];
  createdAt: number;
}

/** Een rack-preset bewaart één compleet rack (rijen, HP, slots, voice-groups)
 *  én de module-instances die in dat rack staan — maar GEEN patches/kabels.
 *  Laden voegt het rack + zijn modules toe aan het project met verse id's, zodat
 *  je een uitgewerkte rack-indeling kunt hergebruiken zonder een heel project te
 *  vervangen. */
export interface RackPresetData {
  id: string;
  name: string;
  description?: string;
  rack: Rack;
  modules: ModuleInstance[];
  createdAt: number;
}

export interface PresetLibrary {
  version: 1;
  patches: PatchPresetData[];
  modules: ModulePresetData[];
  /** Losse patch-sets (optioneel — oudere bibliotheken hebben dit niet). */
  patchSets: PatchSetPresetData[];
  /** Rack-presets (optioneel — oudere bibliotheken hebben dit niet). */
  racks: RackPresetData[];
}

function emptyLibrary(): PresetLibrary {
  return { version: 1, patches: [], modules: [], patchSets: [], racks: [] };
}

// ─── localStorage I/O ──────────────────────────────────────────────────

export function loadLibrary(): PresetLibrary {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw) as Partial<PresetLibrary>;
    if (!parsed || parsed.version !== 1) return emptyLibrary();
    return {
      version: 1,
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
      modules: Array.isArray(parsed.modules) ? parsed.modules : [],
      patchSets: Array.isArray(parsed.patchSets) ? parsed.patchSets : [],
      racks: Array.isArray(parsed.racks) ? parsed.racks : [],
    };
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(lib: PresetLibrary): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  } catch (err) {
    // Quota / private mode — niet fataal.
    console.warn('[presets] saveLibrary failed:', err);
  }
}

function uidPreset(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Patch-presets (full project snapshot) ─────────────────────────────

export function savePatchPreset(
  name: string,
  project: ModularProject,
  description?: string,
): PatchPresetData {
  const lib = loadLibrary();
  const data: PatchPresetData = {
    id: uidPreset('pp'),
    name: name.trim() || 'Naamloze preset',
    description,
    project: JSON.parse(JSON.stringify(project)) as ModularProject,
    createdAt: Date.now(),
  };
  lib.patches.push(data);
  saveLibrary(lib);
  return data;
}

export function deletePatchPreset(id: string): void {
  const lib = loadLibrary();
  lib.patches = lib.patches.filter((p) => p.id !== id);
  saveLibrary(lib);
}

export function renamePatchPreset(id: string, name: string): void {
  const lib = loadLibrary();
  const p = lib.patches.find((x) => x.id === id);
  if (!p) return;
  p.name = name.trim() || p.name;
  saveLibrary(lib);
}

// ─── Module-presets (controlValues only) ───────────────────────────────

export function saveModulePreset(
  name: string,
  typeId: string,
  controlValues: Record<string, ControlValue>,
  description?: string,
): ModulePresetData {
  const lib = loadLibrary();
  const data: ModulePresetData = {
    id: uidPreset('mp'),
    name: name.trim() || 'Naamloze preset',
    description,
    typeId,
    controlValues: JSON.parse(JSON.stringify(controlValues)) as Record<string, ControlValue>,
    createdAt: Date.now(),
  };
  lib.modules.push(data);
  saveLibrary(lib);
  return data;
}

export function deleteModulePreset(id: string): void {
  const lib = loadLibrary();
  lib.modules = lib.modules.filter((m) => m.id !== id);
  saveLibrary(lib);
}

export function renameModulePreset(id: string, name: string): void {
  const lib = loadLibrary();
  const m = lib.modules.find((x) => x.id === id);
  if (!m) return;
  m.name = name.trim() || m.name;
  saveLibrary(lib);
}

// ─── Patch-set-presets (losse patches, geen modules/racks) ─────────────

/** Bewaar één of meer patches als losse preset. */
export function savePatchSetPreset(
  name: string,
  patches: Patch[],
  description?: string,
): PatchSetPresetData {
  const lib = loadLibrary();
  const data: PatchSetPresetData = {
    id: uidPreset('ps'),
    name: name.trim() || 'Naamloze patches',
    description,
    patches: JSON.parse(JSON.stringify(patches)) as Patch[],
    createdAt: Date.now(),
  };
  lib.patchSets.push(data);
  saveLibrary(lib);
  return data;
}

export function deletePatchSetPreset(id: string): void {
  const lib = loadLibrary();
  lib.patchSets = lib.patchSets.filter((p) => p.id !== id);
  saveLibrary(lib);
}

export function renamePatchSetPreset(id: string, name: string): void {
  const lib = loadLibrary();
  const p = lib.patchSets.find((x) => x.id === id);
  if (!p) return;
  p.name = name.trim() || p.name;
  saveLibrary(lib);
}

/** Voeg de patches uit een patch-set-preset toe aan het project. Elke patch
 *  krijgt een vers id (en het programmanummer wordt gewist om botsingen te
 *  voorkomen). De eerste toegevoegde patch wordt de actieve patch. Patches
 *  verwijzen naar modules/racks via id; ontbrekende verwijzingen blijven
 *  staan maar hebben pas effect zodra de bijbehorende modules bestaan. */
export function addPatchSetToProject(
  project: ModularProject,
  preset: PatchSetPresetData,
): ModularProject {
  const existingRackIds = new Set(project.racks.map((r) => r.id));
  const clones: Patch[] = preset.patches.map((src) => {
    const copy = JSON.parse(JSON.stringify(src)) as Patch;
    copy.id = uidPreset('patch');
    copy.programNumber = undefined;
    // Filter rack-verwijzingen die niet (meer) bestaan.
    copy.rackIds = copy.rackIds.filter((id) => existingRackIds.has(id));
    return copy;
  });
  if (clones.length === 0) return project;
  const first = clones[0]!;
  return {
    ...project,
    patches: [...project.patches, ...clones],
    activePatchId: first.id,
  };
}

// ─── Rack-presets (één rack + zijn modules, geen patches) ──────────────

/** Bewaar een rack (met zijn voice-groups) plus de module-instances die erin
 *  staan als preset. */
export function saveRackPreset(
  name: string,
  rack: Rack,
  allModules: ModuleInstance[],
  description?: string,
): RackPresetData {
  const lib = loadLibrary();
  const usedIds = new Set(rack.slots.map((s) => s.moduleId));
  const modules = allModules.filter((m) => usedIds.has(m.id));
  const data: RackPresetData = {
    id: uidPreset('rp'),
    name: name.trim() || 'Naamloos rack',
    description,
    rack: JSON.parse(JSON.stringify(rack)) as Rack,
    modules: JSON.parse(JSON.stringify(modules)) as ModuleInstance[],
    createdAt: Date.now(),
  };
  lib.racks.push(data);
  saveLibrary(lib);
  return data;
}

export function deleteRackPreset(id: string): void {
  const lib = loadLibrary();
  lib.racks = lib.racks.filter((r) => r.id !== id);
  saveLibrary(lib);
}

export function renameRackPreset(id: string, name: string): void {
  const lib = loadLibrary();
  const r = lib.racks.find((x) => x.id === id);
  if (!r) return;
  r.name = name.trim() || r.name;
  saveLibrary(lib);
}

/** Voeg het rack uit een rack-preset toe aan het project. Alle module-id's en
 *  het rack-id krijgen verse waarden (zodat ze niet botsen met bestaande), en
 *  de slot- + voice-group-verwijzingen worden mee-geremapt. Het toegevoegde
 *  rack wordt het actieve rack. Patches blijven ongemoeid. */
export function addRackToProject(
  project: ModularProject,
  preset: RackPresetData,
): ModularProject {
  // 1. Verse id's voor elke module-instance.
  const idMap = new Map<string, string>();
  const newModules = preset.modules.map((src) => {
    const copy = JSON.parse(JSON.stringify(src)) as ModuleInstance;
    const fresh = uidPreset('mod');
    idMap.set(copy.id, fresh);
    copy.id = fresh;
    return copy;
  });
  const remap = (oldId: string): string => idMap.get(oldId) ?? oldId;
  // 2. Vers rack met geremapte slots + voice-group-leden.
  const rack = JSON.parse(JSON.stringify(preset.rack)) as Rack;
  rack.id = uidPreset('rack');
  rack.slots = rack.slots
    .filter((s) => idMap.has(s.moduleId))
    .map((s) => ({ ...s, id: uidPreset('slot'), moduleId: remap(s.moduleId) }));
  if (rack.polyGroups) {
    rack.polyGroups = rack.polyGroups.map((g: PolyGroup) => ({
      ...g,
      id: uidPreset('pg'),
      members: g.members.map((mem) => ({ ...mem, moduleId: remap(mem.moduleId) })),
    }));
  }
  return {
    ...project,
    modules: [...project.modules, ...newModules],
    racks: [...project.racks, rack],
    activeRackId: rack.id,
  };
}

/** Apply a module preset to a target module in the active patch. Returns
 *  a new ModularProject (immutable update). Returns null if there is no
 *  active patch or the target module is not found / wrong type. */
export function applyModulePreset(
  project: ModularProject,
  preset: ModulePresetData,
  targetModuleId: string,
): ModularProject | null {
  const target = project.modules.find((m) => m.id === targetModuleId);
  if (!target || target.typeId !== preset.typeId) return null;
  const activeId = project.activePatchId ?? project.patches[0]?.id;
  if (!activeId) return null;
  return {
    ...project,
    patches: project.patches.map((p) =>
      p.id !== activeId ? p : {
        ...p,
        controlState: {
          ...p.controlState,
          [targetModuleId]: { ...preset.controlValues },
        },
      },
    ),
  };
}

// ─── Export / Import (.json bestand) ───────────────────────────────────

export function exportLibraryJson(): string {
  return JSON.stringify(loadLibrary(), null, 2);
}

/** Mergt geïmporteerde presets in de huidige bibliotheek (dedupe op id).
 *  Returnt het aantal toegevoegde patch- en module-presets. */
export function importLibraryJson(json: string): { patches: number; modules: number } | null {
  try {
    const parsed = JSON.parse(json) as Partial<PresetLibrary>;
    if (!parsed || parsed.version !== 1) return null;
    const lib = loadLibrary();
    const existingPatchIds = new Set(lib.patches.map((p) => p.id));
    const existingModuleIds = new Set(lib.modules.map((m) => m.id));
    let addedPatches = 0;
    let addedModules = 0;
    for (const p of parsed.patches ?? []) {
      if (!p || existingPatchIds.has(p.id)) continue;
      lib.patches.push(p);
      addedPatches++;
    }
    for (const m of parsed.modules ?? []) {
      if (!m || existingModuleIds.has(m.id)) continue;
      lib.modules.push(m);
      addedModules++;
    }
    const existingSetIds = new Set(lib.patchSets.map((s) => s.id));
    for (const s of parsed.patchSets ?? []) {
      if (!s || existingSetIds.has(s.id)) continue;
      lib.patchSets.push(s);
    }
    const existingRackIds = new Set(lib.racks.map((r) => r.id));
    for (const r of parsed.racks ?? []) {
      if (!r || existingRackIds.has(r.id)) continue;
      lib.racks.push(r);
    }
    saveLibrary(lib);
    return { patches: addedPatches, modules: addedModules };
  } catch {
    return null;
  }
}

// ─── Factory presets ───────────────────────────────────────────────────
//
// Factory patch-presets zijn functies (niet data) — ze gebruiken bestaande
// seed-helpers + tweaken controlState. Zo blijven ze automatisch in sync
// met module-definities zonder aparte module-snapshots te onderhouden.

export interface FactoryPatchPreset {
  id: string;
  name: string;
  description: string;
  apply: () => ModularProject;
}

function tweakActivePatch(
  project: ModularProject,
  fn: (cs: Record<string, Record<string, ControlValue>>) => void,
): ModularProject {
  const activeId = project.activePatchId;
  if (!activeId) return project;
  return {
    ...project,
    patches: project.patches.map((p) => {
      if (p.id !== activeId) return p;
      const cs = JSON.parse(JSON.stringify(p.controlState)) as Record<string, Record<string, ControlValue>>;
      fn(cs);
      return { ...p, controlState: cs };
    }),
  };
}

/** Vind moduleId van een module met een bepaald typeId (eerste match). */
function findId(project: ModularProject, typeId: string): string | undefined {
  return project.modules.find((m) => m.typeId === typeId)?.id;
}

/** Tweak de controlState van álle modules van een type in de actieve patch —
 *  handig voor poly-seeds, waar elke stem zijn eigen instanties heeft. */
function tweakAllOfType(
  project: ModularProject,
  typeId: string,
  values: Record<string, ControlValue>,
): ModularProject {
  const ids = project.modules.filter((m) => m.typeId === typeId).map((m) => m.id);
  return tweakActivePatch(project, (cs) => {
    for (const id of ids) if (cs[id]) cs[id] = { ...cs[id], ...values };
  });
}

export const factoryPatchPresets: FactoryPatchPreset[] = [
  {
    id: 'fp_init',
    name: 'Init (leeg)',
    description: 'Compleet leeg project — alleen de defaultracks.',
    apply: () => emptyModularProject(),
  },
  {
    id: 'fp_internals',
    name: 'Internals only',
    description: 'Alle interne MMB-modules (AHDSR, LFO, S&H, VCO, VCF, VCA, OUT, SEQ-8) — geen patch.',
    apply: () => seedInternals(emptyModularProject()),
  },
  {
    id: 'fp_test',
    name: 'Test patch (klassiek)',
    description: 'Standaard testpatch: SEQ + MIDI-IN → VCO → VCF → VCA → OUT met ENV → VCA.',
    apply: () => seedTestPatch(emptyModularProject()),
  },
  {
    id: 'fp_fm',
    name: 'FM test (2-op)',
    description: 'MIDI-IN → VCO (sinus-modulator, +12 st) → FM-VCO → VCF → VCA → OUT met ENV → VCA. Klinkt in de simulator én op de Teensy.',
    apply: () => seedFmTestPatch(emptyModularProject()),
  },
  {
    id: 'fp_acid',
    name: 'Acid bass',
    description: 'Test-patch met saw + lage cutoff, hoge resonantie en snappy envelope.',
    apply: () => {
      const base = seedTestPatch(emptyModularProject());
      const vco = findId(base, 'tp_mmb_vco');
      const vcf = findId(base, 'tp_mmb_vcf');
      const env = findId(base, 'tp_mmb_ahdsr');
      const seq = findId(base, 'tp_mmb_seq8');
      return tweakActivePatch(base, (cs) => {
        if (vco && cs[vco]) cs[vco] = { ...cs[vco], wave: 2, coarse: -12, level: 0.9 };
        if (vcf && cs[vcf]) cs[vcf] = { ...cs[vcf], cutoff: 600, q: 5, cv_amt: 1 };
        if (env && cs[env]) cs[env] = { ...cs[env], attack: 1, decay: 120, sustain: 0.1, release: 80 };
        if (seq && cs[seq]) cs[seq] = { ...cs[seq], rate: 8, gate: 0.4 };
      });
    },
  },
  {
    id: 'fp_poly_clarinet',
    name: 'Poly STK — Clarinet ×4',
    description: '4-stemmige STK Clarinet met stem-LFO op de cutoff, filter-envelope en mod-wheel → adem-modulatie.',
    apply: () => {
      let prj = seedPolyVoicePatch(emptyModularProject(), 4, {
        voiceSource: 'stk', stkSound: 1, perVoiceLfo: true, label: 'STK Clarinet ×4',
      });
      // Riet is zelf al donker — filter verder open dan de poly-default.
      prj = tweakAllOfType(prj, 'tp_mmb_vcf', { cutoff: 2200, q: 0.8 });
      return prj;
    },
  },
  {
    id: 'fp_poly_mandolin',
    name: 'Poly STK — Mandolin ×8',
    description: '8-stemmige STK Mandolin (commuted synthesis) met snappy envelopes en korte bus-echo.',
    apply: () => {
      let prj = seedPolyVoicePatch(emptyModularProject(), 8, {
        voiceSource: 'stk', stkSound: 8, busEchoSeconds: 0.3, label: 'STK Mandolin ×8',
      });
      prj = tweakAllOfType(prj, 'tp_mmb_ahdsr',
        { attack: 1, hold: 0, decay: 220, sustain: 0.15, release: 260 });
      prj = tweakAllOfType(prj, 'tp_mmb_vcf', { cutoff: 3500, q: 0.7 });
      return prj;
    },
  },
  {
    id: 'fp_poly_bowed',
    name: 'Poly STK — Bowed pad ×4',
    description: '4-stemmige STK Bowed (gestreken snaar) als pad: trage envelopes, stem-LFO en ruime bus-echo.',
    apply: () => {
      let prj = seedPolyVoicePatch(emptyModularProject(), 4, {
        voiceSource: 'stk', stkSound: 2, perVoiceLfo: true, busEchoSeconds: 0.45,
        label: 'STK Bowed pad ×4',
      });
      prj = tweakAllOfType(prj, 'tp_mmb_ahdsr',
        { attack: 350, hold: 0, decay: 500, sustain: 0.8, release: 1400 });
      prj = tweakAllOfType(prj, 'tp_mmb_vcf', { cutoff: 1400, q: 1.2 });
      return prj;
    },
  },
  {
    id: 'fp_pad',
    name: 'Soft pad',
    description: 'Test-patch met zachte LP-filter, lange envelope en lage rate.',
    apply: () => {
      const base = seedTestPatch(emptyModularProject());
      const vco = findId(base, 'tp_mmb_vco');
      const vcf = findId(base, 'tp_mmb_vcf');
      const env = findId(base, 'tp_mmb_ahdsr');
      const seq = findId(base, 'tp_mmb_seq8');
      return tweakActivePatch(base, (cs) => {
        if (vco && cs[vco]) cs[vco] = { ...cs[vco], wave: 1, level: 0.7 };
        if (vcf && cs[vcf]) cs[vcf] = { ...cs[vcf], cutoff: 1800, q: 1.5, cv_amt: 0.5 };
        if (env && cs[env]) cs[env] = { ...cs[env], attack: 400, decay: 600, sustain: 0.7, release: 1200 };
        if (seq && cs[seq]) cs[seq] = { ...cs[seq], rate: 1.5, gate: 0.85 };
      });
    },
  },
];

// Factory module-presets — pure data, geen project nodig.
export const factoryModulePresets: ModulePresetData[] = [
  {
    id: 'fm_vcf_acid',
    name: 'Acid resonance',
    description: 'Lage cutoff, hoge Q, ruime CV-modulatie.',
    typeId: 'tp_mmb_vcf',
    controlValues: { cutoff: 600, q: 5, cv_amt: 1, type: 0 },
    createdAt: 0,
  },
  {
    id: 'fm_vcf_open',
    name: 'Open LP',
    description: 'Hoge cutoff, lage resonantie — vrijwel transparant.',
    typeId: 'tp_mmb_vcf',
    controlValues: { cutoff: 6000, q: 0.7, cv_amt: 1, type: 0 },
    createdAt: 0,
  },
  {
    id: 'fm_env_pluck',
    name: 'Snappy pluck',
    description: 'Korte attack/decay, geen sustain.',
    typeId: 'tp_mmb_ahdsr',
    controlValues: { attack: 1, hold: 0, decay: 100, sustain: 0, release: 60, loop: false, curve: 1 },
    createdAt: 0,
  },
  {
    id: 'fm_env_pad',
    name: 'Slow pad',
    description: 'Lange attack en release, hoge sustain.',
    typeId: 'tp_mmb_ahdsr',
    controlValues: { attack: 600, hold: 0, decay: 400, sustain: 0.8, release: 1500, loop: false, curve: 1 },
    createdAt: 0,
  },
  {
    id: 'fm_vco_detune',
    name: 'Detuned saw',
    description: 'Saw met lichte fine-detune voor extra body.',
    typeId: 'tp_mmb_vco',
    controlValues: { wave: 2, coarse: 0, fine: 7, level: 0.85 },
    createdAt: 0,
  },
];
