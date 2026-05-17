// Domain operations on the SwitcherProject state.
// All functions go through projectStore.set() so subscribers re-render.

import { projectStore } from './store';
import {
  newId,
  type ChainEdge,
  type EffectCategory,
  type EffectDevice,
  type SwitcherPatch,
  type SwitcherProject,
} from './types';

// ─── Categories ────────────────────────────────────────────────────────────

export function addCategory(label: string): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  projectStore.set((p) => {
    if (p.categories.some((c) => c.id === id)) return p;
    return { ...p, categories: [...p.categories, { id, label: trimmed }] };
  });
}

export function renameCategory(id: string, label: string): void {
  projectStore.set((p) => ({
    ...p,
    categories: p.categories.map((c) => (c.id === id ? { ...c, label } : c)),
  }));
}

export function removeCategory(id: string): void {
  projectStore.set((p) => {
    const inUse = p.devices.some((d) => d.categoryId === id);
    if (inUse) return p; // keep, would orphan devices
    return { ...p, categories: p.categories.filter((c) => c.id !== id) };
  });
}

// ─── Devices ───────────────────────────────────────────────────────────────

export function addDevice(partial: Partial<EffectDevice>): EffectDevice {
  let created!: EffectDevice;
  projectStore.set((p) => {
    const defaultCat: EffectCategory | undefined = p.categories[0];
    const usedRelays = new Set(p.devices.map((d) => d.relayIndex));
    let nextRelay = -1;
    for (let i = 0; i < p.relayCount; i += 1) {
      if (!usedRelays.has(i)) { nextRelay = i; break; }
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
    return { ...p, devices: [...p.devices, created] };
  });
  return created;
}

export function updateDevice(id: string, patch: Partial<EffectDevice>): void {
  projectStore.set((p) => ({
    ...p,
    devices: p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  }));
}

export function moveDevice(id: string, x: number, y: number): void {
  projectStore.set((p) => ({
    ...p,
    devices: p.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
  }));
}

export function removeDevice(id: string): void {
  projectStore.set((p) => ({
    ...p,
    devices: p.devices.filter((d) => d.id !== id),
    edges:   p.edges.filter((e) => e.source !== id && e.target !== id),
    patches: p.patches.map((pa) => ({
      ...pa,
      bypassed: pa.bypassed.filter((b) => b !== id),
    })),
  }));
}

// ─── Edges (signal flow) ───────────────────────────────────────────────────

export function addEdge(source: string, target: string): void {
  if (source === target) return;
  projectStore.set((p) => {
    const id = `e_${source}_${target}`;
    if (p.edges.some((e) => e.id === id)) return p;
    const next: ChainEdge = { id, source, target };
    return { ...p, edges: [...p.edges, next] };
  });
}

export function removeEdge(id: string): void {
  projectStore.set((p) => ({ ...p, edges: p.edges.filter((e) => e.id !== id) }));
}

// ─── Relay count ───────────────────────────────────────────────────────────

export function setRelayCount(n: number): void {
  const clamped = Math.max(1, Math.min(32, Math.floor(n)));
  projectStore.set((p) => ({
    ...p,
    relayCount: clamped,
    // Drop relayIndex for devices that fall outside new range
    devices: p.devices.map((d) =>
      d.relayIndex >= clamped ? { ...d, relayIndex: -1 } : d,
    ),
  }));
}

// ─── Auto-assign relays in signal-flow order ───────────────────────────────

/**
 * Topological sort starting from 'input' (or any source with no incoming edges)
 * and assigns relayIndex 0..n-1 to devices in that order. Devices not reachable
 * from input are appended at the end.
 */
export function autoAssignRelays(): void {
  projectStore.set((p) => {
    const order = topoSort(p);
    const devOrder = order.filter((id) => id !== 'input' && id !== 'output');
    // Append unreachable devices at the end
    for (const d of p.devices) {
      if (!devOrder.includes(d.id)) devOrder.push(d.id);
    }
    const nextDevices = p.devices.map((d) => {
      const idx = devOrder.indexOf(d.id);
      const relay = idx >= 0 && idx < p.relayCount ? idx : -1;
      return { ...d, relayIndex: relay };
    });
    return { ...p, devices: nextDevices };
  });
}

function topoSort(p: SwitcherProject): string[] {
  const nodes = ['input', 'output', ...p.devices.map((d) => d.id)];
  const incoming = new Map<string, Set<string>>();
  for (const n of nodes) incoming.set(n, new Set());
  for (const e of p.edges) {
    if (incoming.has(e.target)) incoming.get(e.target)!.add(e.source);
  }
  const result: string[] = [];
  const queue: string[] = nodes.filter((n) => incoming.get(n)!.size === 0);
  // Stable: prefer 'input' first
  queue.sort((a, b) => (a === 'input' ? -1 : b === 'input' ? 1 : 0));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    result.push(cur);
    for (const e of p.edges) {
      if (e.source !== cur) continue;
      const inc = incoming.get(e.target);
      if (!inc) continue;
      inc.delete(cur);
      if (inc.size === 0) queue.push(e.target);
    }
  }
  return result;
}

/**
 * Returns devices in signal-flow order (input -> output), including unreachable
 * devices appended at the end. Useful for the simulation + patches panels.
 */
export function devicesInFlowOrder(p: SwitcherProject): EffectDevice[] {
  const ids = topoSort(p).filter((n) => n !== 'input' && n !== 'output');
  const byId = new Map(p.devices.map((d) => [d.id, d] as const));
  const ordered: EffectDevice[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (d) ordered.push(d);
  }
  for (const d of p.devices) if (!ordered.includes(d)) ordered.push(d);
  return ordered;
}

// ─── Patches ───────────────────────────────────────────────────────────────

export function addPatch(name: string): SwitcherPatch {
  let created!: SwitcherPatch;
  projectStore.set((p) => {
    const usedIds = new Set(p.patches.map((x) => x.id));
    let nextId = 0;
    while (usedIds.has(nextId) && nextId < 128) nextId += 1;
    created = { id: nextId, name: name.trim() || `Patch ${nextId}`, bypassed: [] };
    return { ...p, patches: [...p.patches, created], activePatchId: created.id };
  });
  return created;
}

export function duplicatePatch(id: number, newName: string): void {
  projectStore.set((p) => {
    const src = p.patches.find((x) => x.id === id);
    if (!src) return p;
    const usedIds = new Set(p.patches.map((x) => x.id));
    let nextId = 0;
    while (usedIds.has(nextId) && nextId < 128) nextId += 1;
    const copy: SwitcherPatch = {
      id: nextId,
      name: newName.trim() || `${src.name} copy`,
      bypassed: [...src.bypassed],
    };
    return { ...p, patches: [...p.patches, copy], activePatchId: copy.id };
  });
}

export function removePatch(id: number): void {
  projectStore.set((p) => {
    if (p.patches.length <= 1) return p; // always keep at least one
    const next = p.patches.filter((x) => x.id !== id);
    const activeId = p.activePatchId === id ? (next[0]?.id ?? 0) : p.activePatchId;
    return { ...p, patches: next, activePatchId: activeId };
  });
}

export function renamePatch(id: number, name: string): void {
  projectStore.set((p) => ({
    ...p,
    patches: p.patches.map((x) => (x.id === id ? { ...x, name } : x)),
  }));
}

export function setActivePatch(id: number): void {
  projectStore.set((p) => ({ ...p, activePatchId: id }));
}

export function nextPatch(): void {
  projectStore.set((p) => {
    if (p.patches.length === 0) return p;
    const sorted = [...p.patches].sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((x) => x.id === p.activePatchId);
    const next = sorted[(idx + 1) % sorted.length];
    return next ? { ...p, activePatchId: next.id } : p;
  });
}

export function prevPatch(): void {
  projectStore.set((p) => {
    if (p.patches.length === 0) return p;
    const sorted = [...p.patches].sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((x) => x.id === p.activePatchId);
    const prev = sorted[(idx - 1 + sorted.length) % sorted.length];
    return prev ? { ...p, activePatchId: prev.id } : p;
  });
}

export function toggleBypass(patchId: number, deviceId: string): void {
  projectStore.set((p) => ({
    ...p,
    patches: p.patches.map((pa) => {
      if (pa.id !== patchId) return pa;
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

export function resetProject(): void {
  projectStore.reset();
}

export function seedDemo(): void {
  projectStore.set(() => {
    const demo: SwitcherProject = {
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
        { id: 'demo_od',   brand: 'Ibanez', model: 'TS9',    categoryId: 'overdrive',  relayIndex: 0, x:  80, y: 160 },
        { id: 'demo_dist', brand: 'Boss',   model: 'DS-1',   categoryId: 'distortion', relayIndex: 1, x: 320, y: 160 },
        { id: 'demo_ph',   brand: 'MXR',    model: 'Phase 90', categoryId: 'phaser',   relayIndex: 2, x: 560, y: 160 },
        { id: 'demo_dl',   brand: 'Boss',   model: 'DD-7',   categoryId: 'delay',      relayIndex: 3, x: 800, y: 160 },
        { id: 'demo_rv',   brand: 'Strymon', model: 'BigSky', categoryId: 'reverb',    relayIndex: 4, x:1040, y: 160 },
      ],
      edges: [
        { id: 'e_input_demo_od',     source: 'input',    target: 'demo_od' },
        { id: 'e_demo_od_demo_dist', source: 'demo_od',  target: 'demo_dist' },
        { id: 'e_demo_dist_demo_ph', source: 'demo_dist', target: 'demo_ph' },
        { id: 'e_demo_ph_demo_dl',   source: 'demo_ph',  target: 'demo_dl' },
        { id: 'e_demo_dl_demo_rv',   source: 'demo_dl',  target: 'demo_rv' },
        { id: 'e_demo_rv_output',    source: 'demo_rv',  target: 'output' },
      ],
      patches: [
        { id: 0, name: 'Clean',       bypassed: ['demo_od','demo_dist','demo_ph','demo_dl','demo_rv'] },
        { id: 1, name: 'Crunch',      bypassed: ['demo_dist','demo_ph','demo_dl','demo_rv'] },
        { id: 2, name: 'Lead',        bypassed: ['demo_ph','demo_dl','demo_rv'] },
        { id: 3, name: 'Solo + Delay', bypassed: ['demo_dist','demo_rv'] },
        { id: 4, name: 'Ambient',     bypassed: ['demo_dist'] },
      ],
      activePatchId: 1,
    };
    return demo;
  });
}
