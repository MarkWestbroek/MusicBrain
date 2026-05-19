// ─────────────────────────────────────────────────────────────────────────
// Modular Music Brain (MMB) — data model v2 (2026-05-19)
//
// v2 introduces the three-layer module model:
//   Category  → ModuleType (template) → Module (concrete realisation)
//                                          ↑
//                                  placed in Rack(s)
//                                          ↑
//                                referenced by Patch (connections + controlState)
//
// The v1 model (single `ModuleDef`) is migrated on import — see
// `migrateProject()` in this file.
// ─────────────────────────────────────────────────────────────────────────
export const SIGNAL_COLOUR = {
    cv: '#2563eb',
    gate: '#16a34a',
    trigger: '#eab308',
    audio: '#ea580c',
    midi: '#9333ea',
};
export const SIGNAL_LABEL = {
    cv: 'CV', gate: 'Gate', trigger: 'Trig', audio: 'Audio', midi: 'MIDI',
};
export const SIGNAL_COMPATIBILITY = {
    cv: ['cv'],
    gate: ['gate', 'cv'],
    trigger: ['trigger', 'gate'],
    audio: ['audio'],
    midi: ['midi'],
};
export function canConnect(src, dst) {
    return SIGNAL_COMPATIBILITY[src].includes(dst);
}
export function defaultValueOf(c) {
    switch (c.kind) {
        case 'knob':
        case 'slider':
        case 'exotic': return c.defaultValue;
        case 'toggle': return c.defaultValue;
        case 'switch': return c.defaultIndex;
        case 'button': return c.defaultValue ?? false;
        case 'joystick': return c.defaultValue;
    }
}
// ═══════════════════════════════════════════════════════════════════════
//  Visual / panel layout — millimetres, top-left origin.
//  1 HP = 5.08 mm; 3U Eurorack = 128.5 mm tall.
// ═══════════════════════════════════════════════════════════════════════
export const MM_PER_HP = 5.08;
export const PANEL_HEIGHT_MM = 128.5;
export function resolvePorts(mod, types) {
    if (mod.portsOverride)
        return mod.portsOverride;
    const t = types.find((x) => x.id === mod.typeId);
    return t ? t.ports : [];
}
export function resolveControls(mod, types) {
    if (mod.controlsOverride)
        return mod.controlsOverride;
    const t = types.find((x) => x.id === mod.typeId);
    return t ? t.controls : [];
}
// ═══════════════════════════════════════════════════════════════════════
//  Seed
// ═══════════════════════════════════════════════════════════════════════
export function defaultCategories() {
    const cv = { min: -5, max: 5, bipolar: true };
    const uni = { min: 0, max: 10, bipolar: false };
    return [
        { id: 'vco', label: 'VCO', kind: 'vco', defaultCvRange: cv },
        { id: 'vcf', label: 'VCF', kind: 'vcf', defaultCvRange: cv },
        { id: 'vca', label: 'VCA', kind: 'vca', defaultCvRange: uni },
        { id: 'mixer', label: 'Mixer', kind: 'mixer' },
        { id: 'breakout', label: 'Breakout', kind: 'breakout' },
        { id: 'envelope', label: 'Envelope', kind: 'envelope', defaultCvRange: uni },
        { id: 'lfo', label: 'LFO', kind: 'lfo', defaultCvRange: cv },
        { id: 'sequencer', label: 'Sequencer', kind: 'sequencer' },
        { id: 'drum', label: 'Drum', kind: 'drum' },
        { id: 'effect', label: 'Effect', kind: 'effect' },
        { id: 'noise', label: 'Noise/Rand', kind: 'noise' },
        { id: 'utility', label: 'Utility', kind: 'utility' },
    ];
}
export function emptyModularProject() {
    return {
        version: 2,
        name: 'ModularMB',
        categories: defaultCategories(),
        moduleTypes: [],
        modules: [],
        racks: [
            {
                id: 'rack_default',
                name: 'Mijn rack',
                rows: 3,
                hpPerRow: 84,
                slots: [],
                kind: 'physical',
            },
            {
                id: 'rack_internal',
                name: 'MMB Brain (intern)',
                description: 'Virtueel rack voor brain-modules (AHDSR, LFO, Sequencer, …). Groeit automatisch mee.',
                rows: 1,
                hpPerRow: 64,
                slots: [],
                kind: 'internal',
            },
        ],
        patches: [],
        activeRackId: 'rack_default',
    };
}
function paramToControl(p) {
    const view = p.preferredView ?? 'knob';
    if (view === 'toggle') {
        return { kind: 'toggle', id: p.id, label: p.name, defaultValue: p.defaultValue > 0 };
    }
    if (view === 'slider') {
        return {
            kind: 'slider', id: p.id, label: p.name,
            min: p.min, max: p.max, defaultValue: p.defaultValue,
            unit: p.unit, orientation: 'v',
        };
    }
    // 'knob' and 'numeric' both render as knob in v2 (numeric is still a view option in widgets).
    return {
        kind: 'knob', id: p.id, label: p.name,
        min: p.min, max: p.max, defaultValue: p.defaultValue,
        unit: p.unit, style: 'generic', size: 'medium',
    };
}
function isV1(p) {
    return !!p && typeof p === 'object' && p.version === 1;
}
function isV2(p) {
    return !!p && typeof p === 'object' && p.version === 2;
}
/** Convert a v1 project to v2. Each v1 module becomes one type + one module. */
export function migrateV1toV2(v1) {
    const moduleTypes = [];
    const modules = [];
    const rackSlots = [];
    // patch settings: oldModuleId → newModuleId (kept identical for traceability)
    for (let i = 0; i < v1.modules.length; i++) {
        const m = v1.modules[i];
        const ports = [
            ...m.inputs.map((p) => ({ ...p, direction: 'in' })),
            ...m.outputs.map((p) => ({ ...p, direction: 'out' })),
        ];
        const controls = m.params.map(paramToControl);
        const typeId = `type_${m.id}`;
        moduleTypes.push({
            id: typeId,
            categoryId: m.kind,
            variant: `${m.kind} (uit v1)`,
            ports,
            controls,
        });
        // Best-effort visual: empty placement maps; renderer falls back to auto-layout.
        const visual = {
            hpWidth: Math.max(4, Math.min(20, controls.length + 4)),
            texture: 'aluminum',
            controlPlacements: {},
            portPlacements: {},
        };
        modules.push({
            id: m.id,
            typeId,
            internal: m.kind === 'envelope' || m.kind === 'lfo'
                || m.kind === 'midiRouter' || m.kind === 'sequencer',
            name: m.label,
            brand: m.brand,
            modelNumber: m.model,
            notes: m.notes,
            visual,
        });
        // Lay out left-to-right, wrap every 84 HP across 3 rows.
        rackSlots.push({
            id: `slot_${m.id}`,
            moduleId: m.id,
            row: Math.floor((i * 6) / 84),
            hpOffset: (i * 6) % 84,
        });
    }
    const rack = {
        id: 'rack_default',
        name: 'Mijn rack',
        rows: 3, hpPerRow: 84,
        slots: rackSlots,
        kind: 'physical',
    };
    const internalRack = {
        id: 'rack_internal',
        name: 'MMB Brain (intern)',
        description: 'Virtueel rack voor brain-modules (groeit automatisch mee).',
        rows: 1, hpPerRow: 64, slots: [], kind: 'internal',
    };
    const patches = v1.patches.map((px) => ({
        id: px.id,
        name: px.name,
        description: px.description,
        voiceCount: px.voiceCount,
        rackId: rack.id,
        connections: px.connections,
        controlState: px.moduleSettings, // numbers are valid ControlValue
        envelopes: px.envelopes,
        lfos: px.lfos,
    }));
    return {
        version: 2,
        name: v1.name,
        description: v1.description,
        configVersion: v1.configVersion,
        categories: v1.categories.length ? v1.categories : defaultCategories(),
        moduleTypes,
        modules,
        racks: [rack, internalRack],
        patches,
        activeRackId: rack.id,
        activePatchId: v1.activePatchId,
    };
}
/** Accept v1 or v2 JSON and always return a v2 project. */
export function migrateProject(input) {
    if (isV2(input))
        return input;
    if (isV1(input))
        return migrateV1toV2(input);
    return null;
}
