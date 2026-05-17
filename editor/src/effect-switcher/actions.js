// Domain operations on the SwitcherProject state.
// All functions go through projectStore.set() so subscribers re-render.
import { projectStore } from './store';
import { newId, } from './types';
// ─── Categories ────────────────────────────────────────────────────────────
/** Add a new effect category. The id is derived from the label (lowercased,
 *  non-alphanumerics → '-'). No-op if a category with that id already exists. */
export function addCategory(label) {
    const trimmed = label.trim();
    if (!trimmed)
        return;
    const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    projectStore.set((p) => {
        if (p.categories.some((c) => c.id === id))
            return p;
        return { ...p, categories: [...p.categories, { id, label: trimmed }] };
    });
}
/** Change the display label of a category. The id stays the same so existing
 *  devices keep pointing at it. */
export function renameCategory(id, label) {
    projectStore.set((p) => ({
        ...p,
        categories: p.categories.map((c) => (c.id === id ? { ...c, label } : c)),
    }));
}
/** Delete a category. Silently keeps the category if any device still uses it
 *  (to avoid orphan devices with a dangling categoryId). */
export function removeCategory(id) {
    projectStore.set((p) => {
        const inUse = p.devices.some((d) => d.categoryId === id);
        if (inUse)
            return p; // keep, would orphan devices
        return { ...p, categories: p.categories.filter((c) => c.id !== id) };
    });
}
// ─── Devices ───────────────────────────────────────────────────────────────
/** Create a new effect device and append it to the chain.
 *  Picks the first free relay index automatically and marks the new device as
 *  BYPASSED in every existing patch, so live patches don't suddenly change
 *  sound when the engineer adds something new on the chain canvas. */
export function addDevice(partial) {
    let created;
    projectStore.set((p) => {
        const defaultCat = p.categories[0];
        const usedRelays = new Set(p.devices.map((d) => d.relayIndex));
        let nextRelay = -1;
        for (let i = 0; i < p.relayCount; i += 1) {
            if (!usedRelays.has(i)) {
                nextRelay = i;
                break;
            }
        }
        created = {
            id: newId('d'),
            brand: partial.brand ?? 'Brand',
            model: partial.model ?? 'Model',
            categoryId: partial.categoryId ?? defaultCat?.id ?? 'utility',
            imageDataUrl: partial.imageDataUrl,
            relayIndex: partial.relayIndex ?? nextRelay,
            x: partial.x ?? 80 + p.devices.length * 220,
            y: partial.y ?? 160,
        };
        return {
            ...p,
            devices: [...p.devices, created],
            // Bypass the new device in ALL existing patches so pre-existing patches
            // are not silently altered. The user must explicitly enable it per patch.
            patches: p.patches.map((pa) => ({
                ...pa,
                bypassed: [...pa.bypassed, created.id],
            })),
        };
    });
    return created;
}
/** Patch fields on an existing device (brand, model, relay, image, …). */
export function updateDevice(id, patch) {
    projectStore.set((p) => ({
        ...p,
        devices: p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
}
/** Set the canvas position of a device (x/y in React-Flow coordinates).
 *  Used by drag, align and distribute. */
export function moveDevice(id, x, y) {
    projectStore.set((p) => ({
        ...p,
        devices: p.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
    }));
}
/** Remove a device along with any edges that touch it and any bypass
 *  references in every patch. */
export function removeDevice(id) {
    projectStore.set((p) => ({
        ...p,
        devices: p.devices.filter((d) => d.id !== id),
        edges: p.edges.filter((e) => e.source !== id && e.target !== id),
        patches: p.patches.map((pa) => ({
            ...pa,
            bypassed: pa.bypassed.filter((b) => b !== id),
        })),
    }));
}
// ─── Edges (signal flow) ───────────────────────────────────────────────────
/** Connect `source → target` in the signal graph. Self-loops are rejected and
 *  duplicate edges are deduplicated by id. */
export function addEdge(source, target) {
    if (source === target)
        return;
    projectStore.set((p) => {
        const id = `e_${source}_${target}`;
        if (p.edges.some((e) => e.id === id))
            return p;
        const next = { id, source, target };
        return { ...p, edges: [...p.edges, next] };
    });
}
/** Remove a signal-flow edge by id. */
export function removeEdge(id) {
    projectStore.set((p) => ({ ...p, edges: p.edges.filter((e) => e.id !== id) }));
}
// ─── Relay count ───────────────────────────────────────────────────────────
/** Change the number of relays (1..32). Devices whose relayIndex no longer
 *  fits get their relayIndex reset to -1 (= unassigned). */
export function setRelayCount(n) {
    const clamped = Math.max(1, Math.min(32, Math.floor(n)));
    projectStore.set((p) => ({
        ...p,
        relayCount: clamped,
        // Drop relayIndex for devices that fall outside new range
        devices: p.devices.map((d) => d.relayIndex >= clamped ? { ...d, relayIndex: -1 } : d),
    }));
}
// ─── Auto-assign relays in signal-flow order ───────────────────────────────
/**
 * Topological sort starting from 'input' (or any source with no incoming edges)
 * and assigns relayIndex 0..n-1 to devices in that order. Devices not reachable
 * from input are appended at the end.
 */
export function autoAssignRelays() {
    projectStore.set((p) => {
        const order = topoSort(p);
        const devOrder = order.filter((id) => id !== 'input' && id !== 'output');
        // Append unreachable devices at the end
        for (const d of p.devices) {
            if (!devOrder.includes(d.id))
                devOrder.push(d.id);
        }
        const nextDevices = p.devices.map((d) => {
            const idx = devOrder.indexOf(d.id);
            const relay = idx >= 0 && idx < p.relayCount ? idx : -1;
            return { ...d, relayIndex: relay };
        });
        return { ...p, devices: nextDevices };
    });
}
function topoSort(p) {
    const nodes = ['input', 'output', ...p.devices.map((d) => d.id)];
    const incoming = new Map();
    for (const n of nodes)
        incoming.set(n, new Set());
    for (const e of p.edges) {
        if (incoming.has(e.target))
            incoming.get(e.target).add(e.source);
    }
    const result = [];
    const queue = nodes.filter((n) => incoming.get(n).size === 0);
    // Stable: prefer 'input' first
    queue.sort((a, b) => (a === 'input' ? -1 : b === 'input' ? 1 : 0));
    while (queue.length > 0) {
        const cur = queue.shift();
        result.push(cur);
        for (const e of p.edges) {
            if (e.source !== cur)
                continue;
            const inc = incoming.get(e.target);
            if (!inc)
                continue;
            inc.delete(cur);
            if (inc.size === 0)
                queue.push(e.target);
        }
    }
    return result;
}
/**
 * Returns devices in signal-flow order (input -> output), including unreachable
 * devices appended at the end. Useful for the simulation + patches panels.
 */
export function devicesInFlowOrder(p) {
    const ids = topoSort(p).filter((n) => n !== 'input' && n !== 'output');
    const byId = new Map(p.devices.map((d) => [d.id, d]));
    const ordered = [];
    for (const id of ids) {
        const d = byId.get(id);
        if (d)
            ordered.push(d);
    }
    for (const d of p.devices)
        if (!ordered.includes(d))
            ordered.push(d);
    return ordered;
}
// ─── Patches ───────────────────────────────────────────────────────────────
// ─── Project-level ────────────────────────────────────────────────────────
/** Replace the whole project (used by JSON import). */
export function loadProject(p) {
    projectStore.set(() => p);
}
/** Set the project label shown in the header. Empty string clears it. */
export function setProjectName(name) {
    projectStore.set((p) => ({ ...p, name: name.trim() || undefined }));
}
/** Set the one-line description (memory aid for the musician). */
export function setProjectDescription(description) {
    projectStore.set((p) => ({ ...p, description: description.trim() || undefined }));
}
/** Set the user-managed config version (free-form semver-ish, e.g. '1.2.3').
 *  Distinct from `version: 1` which identifies the schema. */
export function setProjectConfigVersion(version) {
    projectStore.set((p) => ({ ...p, configVersion: version.trim() || undefined }));
}
// ─── Patches ───────────────────────────────────────────────────────────────
/** Append a new (empty / nothing-bypassed) patch and make it active. The id
 *  is the lowest unused MIDI Program Change number (0..127). */
export function addPatch(name) {
    let created;
    projectStore.set((p) => {
        const usedIds = new Set(p.patches.map((x) => x.id));
        let nextId = 0;
        while (usedIds.has(nextId) && nextId < 128)
            nextId += 1;
        created = { id: nextId, name: name.trim() || `Patch ${nextId}`, bypassed: [] };
        return { ...p, patches: [...p.patches, created], activePatchId: created.id };
    });
    return created;
}
/** Duplicate an existing patch (same bypass list) and select the copy. */
export function duplicatePatch(id, newName) {
    projectStore.set((p) => {
        const src = p.patches.find((x) => x.id === id);
        if (!src)
            return p;
        const usedIds = new Set(p.patches.map((x) => x.id));
        let nextId = 0;
        while (usedIds.has(nextId) && nextId < 128)
            nextId += 1;
        const copy = {
            id: nextId,
            name: newName.trim() || `${src.name} copy`,
            bypassed: [...src.bypassed],
        };
        return { ...p, patches: [...p.patches, copy], activePatchId: copy.id };
    });
}
/** Delete a patch. Refuses to delete the last patch so the active patch is
 *  always valid. */
export function removePatch(id) {
    projectStore.set((p) => {
        if (p.patches.length <= 1)
            return p; // always keep at least one
        const next = p.patches.filter((x) => x.id !== id);
        const activeId = p.activePatchId === id ? (next[0]?.id ?? 0) : p.activePatchId;
        return { ...p, patches: next, activePatchId: activeId };
    });
}
/** Rename a patch. */
export function renamePatch(id, name) {
    projectStore.set((p) => ({
        ...p,
        patches: p.patches.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
}
/** Select a patch by id. Drives the simulation + Patches panel highlight. */
export function setActivePatch(id) {
    projectStore.set((p) => ({ ...p, activePatchId: id }));
}
/** Advance to the next patch (sorted by id), wrapping at the end.
 *  Used by the footswitch ▲ in the simulation and by `POST /api/patch/next`. */
export function nextPatch() {
    projectStore.set((p) => {
        if (p.patches.length === 0)
            return p;
        const sorted = [...p.patches].sort((a, b) => a.id - b.id);
        const idx = sorted.findIndex((x) => x.id === p.activePatchId);
        const next = sorted[(idx + 1) % sorted.length];
        return next ? { ...p, activePatchId: next.id } : p;
    });
}
/** Go back to the previous patch, wrapping at the start. */
export function prevPatch() {
    projectStore.set((p) => {
        if (p.patches.length === 0)
            return p;
        const sorted = [...p.patches].sort((a, b) => a.id - b.id);
        const idx = sorted.findIndex((x) => x.id === p.activePatchId);
        const prev = sorted[(idx - 1 + sorted.length) % sorted.length];
        return prev ? { ...p, activePatchId: prev.id } : p;
    });
}
/** Toggle whether a device is bypassed in the given patch.
 *  In bypassed = relay off; not in bypassed = relay on. */
export function toggleBypass(patchId, deviceId) {
    projectStore.set((p) => ({
        ...p,
        patches: p.patches.map((pa) => {
            if (pa.id !== patchId)
                return pa;
            const has = pa.bypassed.includes(deviceId);
            return {
                ...pa,
                bypassed: has
                    ? pa.bypassed.filter((x) => x !== deviceId)
                    : [...pa.bypassed, deviceId],
            };
        }),
    }));
}
// ─── Bulk import / reset ───────────────────────────────────────────────────
/** Wipe everything and restore the empty default project. */
export function resetProject() {
    projectStore.reset();
}
/** Replace the project with a 5-pedal / 5-patch demo. Useful for first-run
 *  exploration and for screenshots in the docs. */
export function seedDemo() {
    projectStore.set(() => {
        const demo = {
            version: 1,
            relayCount: 16,
            categories: [
                { id: 'overdrive', label: 'Overdrive' },
                { id: 'distortion', label: 'Distortion' },
                { id: 'phaser', label: 'Phaser' },
                { id: 'delay', label: 'Delay' },
                { id: 'reverb', label: 'Reverb' },
            ],
            devices: [
                { id: 'demo_od', brand: 'Ibanez', model: 'TS9', categoryId: 'overdrive', relayIndex: 0, x: 80, y: 160 },
                { id: 'demo_dist', brand: 'Boss', model: 'DS-1', categoryId: 'distortion', relayIndex: 1, x: 320, y: 160 },
                { id: 'demo_ph', brand: 'MXR', model: 'Phase 90', categoryId: 'phaser', relayIndex: 2, x: 560, y: 160 },
                { id: 'demo_dl', brand: 'Boss', model: 'DD-7', categoryId: 'delay', relayIndex: 3, x: 800, y: 160 },
                { id: 'demo_rv', brand: 'Strymon', model: 'BigSky', categoryId: 'reverb', relayIndex: 4, x: 1040, y: 160 },
            ],
            edges: [
                { id: 'e_input_demo_od', source: 'input', target: 'demo_od' },
                { id: 'e_demo_od_demo_dist', source: 'demo_od', target: 'demo_dist' },
                { id: 'e_demo_dist_demo_ph', source: 'demo_dist', target: 'demo_ph' },
                { id: 'e_demo_ph_demo_dl', source: 'demo_ph', target: 'demo_dl' },
                { id: 'e_demo_dl_demo_rv', source: 'demo_dl', target: 'demo_rv' },
                { id: 'e_demo_rv_output', source: 'demo_rv', target: 'output' },
            ],
            patches: [
                { id: 0, name: 'Clean', bypassed: ['demo_od', 'demo_dist', 'demo_ph', 'demo_dl', 'demo_rv'] },
                { id: 1, name: 'Crunch', bypassed: ['demo_dist', 'demo_ph', 'demo_dl', 'demo_rv'] },
                { id: 2, name: 'Lead', bypassed: ['demo_ph', 'demo_dl', 'demo_rv'] },
                { id: 3, name: 'Solo + Delay', bypassed: ['demo_dist', 'demo_rv'] },
                { id: 4, name: 'Ambient', bypassed: ['demo_dist'] },
            ],
            activePatchId: 1,
        };
        return demo;
    });
}
