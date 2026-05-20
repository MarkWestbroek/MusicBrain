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
import { emptyModularProject, } from './types';
import { seedInternals, seedTestPatch } from './seedModules';
const STORAGE_KEY = 'mmb.presets.v1';
function emptyLibrary() {
    return { version: 1, patches: [], modules: [] };
}
// ─── localStorage I/O ──────────────────────────────────────────────────
export function loadLibrary() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return emptyLibrary();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1)
            return emptyLibrary();
        return {
            version: 1,
            patches: Array.isArray(parsed.patches) ? parsed.patches : [],
            modules: Array.isArray(parsed.modules) ? parsed.modules : [],
        };
    }
    catch {
        return emptyLibrary();
    }
}
export function saveLibrary(lib) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
    }
    catch (err) {
        // Quota / private mode — niet fataal.
        console.warn('[presets] saveLibrary failed:', err);
    }
}
function uidPreset(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
// ─── Patch-presets (full project snapshot) ─────────────────────────────
export function savePatchPreset(name, project, description) {
    const lib = loadLibrary();
    const data = {
        id: uidPreset('pp'),
        name: name.trim() || 'Naamloze preset',
        description,
        project: JSON.parse(JSON.stringify(project)),
        createdAt: Date.now(),
    };
    lib.patches.push(data);
    saveLibrary(lib);
    return data;
}
export function deletePatchPreset(id) {
    const lib = loadLibrary();
    lib.patches = lib.patches.filter((p) => p.id !== id);
    saveLibrary(lib);
}
export function renamePatchPreset(id, name) {
    const lib = loadLibrary();
    const p = lib.patches.find((x) => x.id === id);
    if (!p)
        return;
    p.name = name.trim() || p.name;
    saveLibrary(lib);
}
// ─── Module-presets (controlValues only) ───────────────────────────────
export function saveModulePreset(name, typeId, controlValues, description) {
    const lib = loadLibrary();
    const data = {
        id: uidPreset('mp'),
        name: name.trim() || 'Naamloze preset',
        description,
        typeId,
        controlValues: JSON.parse(JSON.stringify(controlValues)),
        createdAt: Date.now(),
    };
    lib.modules.push(data);
    saveLibrary(lib);
    return data;
}
export function deleteModulePreset(id) {
    const lib = loadLibrary();
    lib.modules = lib.modules.filter((m) => m.id !== id);
    saveLibrary(lib);
}
export function renameModulePreset(id, name) {
    const lib = loadLibrary();
    const m = lib.modules.find((x) => x.id === id);
    if (!m)
        return;
    m.name = name.trim() || m.name;
    saveLibrary(lib);
}
/** Apply a module preset to a target module in the active patch. Returns
 *  a new ModularProject (immutable update). Returns null if there is no
 *  active patch or the target module is not found / wrong type. */
export function applyModulePreset(project, preset, targetModuleId) {
    const target = project.modules.find((m) => m.id === targetModuleId);
    if (!target || target.typeId !== preset.typeId)
        return null;
    const activeId = project.activePatchId ?? project.patches[0]?.id;
    if (!activeId)
        return null;
    return {
        ...project,
        patches: project.patches.map((p) => p.id !== activeId ? p : {
            ...p,
            controlState: {
                ...p.controlState,
                [targetModuleId]: { ...preset.controlValues },
            },
        }),
    };
}
// ─── Export / Import (.json bestand) ───────────────────────────────────
export function exportLibraryJson() {
    return JSON.stringify(loadLibrary(), null, 2);
}
/** Mergt geïmporteerde presets in de huidige bibliotheek (dedupe op id).
 *  Returnt het aantal toegevoegde patch- en module-presets. */
export function importLibraryJson(json) {
    try {
        const parsed = JSON.parse(json);
        if (!parsed || parsed.version !== 1)
            return null;
        const lib = loadLibrary();
        const existingPatchIds = new Set(lib.patches.map((p) => p.id));
        const existingModuleIds = new Set(lib.modules.map((m) => m.id));
        let addedPatches = 0;
        let addedModules = 0;
        for (const p of parsed.patches ?? []) {
            if (!p || existingPatchIds.has(p.id))
                continue;
            lib.patches.push(p);
            addedPatches++;
        }
        for (const m of parsed.modules ?? []) {
            if (!m || existingModuleIds.has(m.id))
                continue;
            lib.modules.push(m);
            addedModules++;
        }
        saveLibrary(lib);
        return { patches: addedPatches, modules: addedModules };
    }
    catch {
        return null;
    }
}
function tweakActivePatch(project, fn) {
    const activeId = project.activePatchId;
    if (!activeId)
        return project;
    return {
        ...project,
        patches: project.patches.map((p) => {
            if (p.id !== activeId)
                return p;
            const cs = JSON.parse(JSON.stringify(p.controlState));
            fn(cs);
            return { ...p, controlState: cs };
        }),
    };
}
/** Vind moduleId van een module met een bepaald typeId (eerste match). */
function findId(project, typeId) {
    return project.modules.find((m) => m.typeId === typeId)?.id;
}
export const factoryPatchPresets = [
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
                if (vco && cs[vco])
                    cs[vco] = { ...cs[vco], wave: 2, coarse: -12, level: 0.9 };
                if (vcf && cs[vcf])
                    cs[vcf] = { ...cs[vcf], cutoff: 600, q: 8, cv_amt: 2 };
                if (env && cs[env])
                    cs[env] = { ...cs[env], attack: 1, decay: 120, sustain: 0.1, release: 80 };
                if (seq && cs[seq])
                    cs[seq] = { ...cs[seq], rate: 8, gate: 0.4 };
            });
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
                if (vco && cs[vco])
                    cs[vco] = { ...cs[vco], wave: 1, level: 0.7 };
                if (vcf && cs[vcf])
                    cs[vcf] = { ...cs[vcf], cutoff: 1800, q: 1.5, cv_amt: 0.5 };
                if (env && cs[env])
                    cs[env] = { ...cs[env], attack: 400, decay: 600, sustain: 0.7, release: 1200 };
                if (seq && cs[seq])
                    cs[seq] = { ...cs[seq], rate: 1.5, gate: 0.85 };
            });
        },
    },
];
// Factory module-presets — pure data, geen project nodig.
export const factoryModulePresets = [
    {
        id: 'fm_vcf_acid',
        name: 'Acid resonance',
        description: 'Lage cutoff, hoge Q, ruime CV-modulatie.',
        typeId: 'tp_mmb_vcf',
        controlValues: { cutoff: 600, q: 8, cv_amt: 2, type: 0 },
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
