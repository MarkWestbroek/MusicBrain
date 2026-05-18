// Data model for the Effect Switcher editor (project 1).
//
// Persisted to localStorage under key 'mb.effect-switcher.v1'.
// All IDs are stable strings so React keys + React-Flow edges remain valid
// across reorderings.
export const DEFAULT_CATEGORIES = [
    { id: 'overdrive', label: 'Overdrive' },
    { id: 'distortion', label: 'Distortion' },
    { id: 'fuzz', label: 'Fuzz' },
    { id: 'compressor', label: 'Compressor' },
    { id: 'eq', label: 'EQ / Filter' },
    { id: 'phaser', label: 'Phaser' },
    { id: 'flanger', label: 'Flanger' },
    { id: 'chorus', label: 'Chorus' },
    { id: 'tremolo', label: 'Tremolo' },
    { id: 'delay', label: 'Delay' },
    { id: 'reverb', label: 'Reverb' },
    { id: 'looper', label: 'Looper' },
    { id: 'utility', label: 'Utility' },
];
/** Return a minimal valid project with one empty patch and the default
 *  category set. Used for Reset and first-run. */
export function emptyProject() {
    return {
        version: 1,
        relayCount: 16,
        categories: DEFAULT_CATEGORIES,
        devices: [],
        edges: [],
        patches: [{ id: 0, name: 'Init', bypassed: [] }],
        activePatchId: 0,
    };
}
/** Stable ID generator. Combines a prefix, a base-36 timestamp, and a
 *  per-session counter so IDs are unique even within the same millisecond. */
let _idCounter = 0;
export function newId(prefix) {
    _idCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}
