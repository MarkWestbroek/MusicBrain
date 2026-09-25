// Morph tussen patch A en B (ED-MORPH-1) — zie doc/plans/morph-a-b.md.
//
// Puur: `morphDescriptor(p, a, b)` rekent één keer uit wát er morpht
// (gewogen ingangen volgens de divergentieregel, gemorphte controls met
// hun regel), `morphPatch(p, desc, t)` maakt daar de gefuseerde patch
// M(A, B, t) van. Dezelfde descriptor gaat later naar de firmware
// (MorphModule op cv-rate); de editor en de sim gebruiken hem nu al.
//
// Regels in het kort:
//   • A en B op hetzelfde rack, zelfde stemmental.
//   • Kabels: vereniging. Vanaf OUT terug: de eerste ingang waar de voeders
//     van A en B verschillen krijgt gewichten (A-voeders 1−t, B-voeders t,
//     gemeenschappelijke 1); via gemeenschappelijke voeders loop je door
//     naar boven, via afwijkende niet (daar draait alles vol).
//   • Gate/trigger-ingangen snappen bij 0,5; audio en cv crossfaden.
//   • Knoppen: interpoleren in het taperdomein. Geordende schakelaars:
//     index interpoleren en afronden. Ongeordende schakelaars, toggles:
//     snappen bij 0,5. Knoppen met `step`: afronden.

import type { ModularProject, Patch, PatchConnection, ControlValue, Control } from '../types';
import { resolvePorts, resolveControls } from '../types';
import { fromTaper, toTaper } from '../taper';
import { RecipeError } from './types';

export type ControlRule = 'taper' | 'ordinal' | 'snap' | 'step';

export interface MorphControl {
  moduleId: string;
  controlId: string;
  a: ControlValue;
  b: ControlValue;
  rule: ControlRule;
}

export interface MorphCable {
  /** De kabel zoals hij in de fusie komt (id uit A of B). */
  connection: PatchConnection;
  /** Alleen in A ('a') of alleen in B ('b'). */
  side: 'a' | 'b';
  /** Gate/trigger: snappen in plaats van crossfaden. */
  snap: boolean;
}

export interface MorphDescriptor {
  a: string;
  b: string;
  rackIds: string[];
  voiceCount: number;
  /** Kabels die in beide patches liggen (gewicht 1). */
  common: PatchConnection[];
  /** Kabels op een divergerende ingang: krijgen een gewicht. */
  weighted: MorphCable[];
  /** Kabels die maar in één patch liggen maar stroomopwaarts van een
   *  divergentiepunt: draaien vol mee (onhoorbaar in de andere stand). */
  full: PatchConnection[];
  controls: MorphControl[];
  warnings: string[];
}

const keyOf = (c: PatchConnection) => `${c.from.moduleId}.${c.from.portId}>${c.to.moduleId}.${c.to.portId}`;
const sinkOf = (c: PatchConnection) => `${c.to.moduleId}.${c.to.portId}`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// ── controls ────────────────────────────────────────────────────────────

/** Heuristiek: standen die als getal of verhouding te lezen zijn, zijn geordend. */
export function isOrdinalSwitch(c: Extract<Control, { kind: 'switch' }>): boolean {
  if (c.ordinal !== undefined) return c.ordinal;
  const numeric = c.positions.filter((p) => /^\s*[\d.,]+\s*(:\s*1)?\s*[a-zA-Z%]*\s*$/.test(p)).length;
  return c.positions.length >= 2 && numeric >= c.positions.length - 1;   // "All"/"Auto" als uiterste mag
}

export function ruleFor(c: Control): ControlRule | null {
  switch (c.kind) {
    case 'knob': case 'slider': return 'step' in c && c.step ? 'step' : 'taper';
    case 'exotic': return 'taper';
    case 'switch': return isOrdinalSwitch(c) ? 'ordinal' : 'snap';
    case 'toggle': case 'button': return 'snap';
    default: return null;   // display, led, joystick
  }
}

/** Waarde van één gemorpht control op stand t. */
export function morphControlValue(c: Control, entry: MorphControl, t: number): ControlValue {
  const u = Math.max(0, Math.min(1, t));
  const a = entry.a, b = entry.b;
  switch (entry.rule) {
    case 'snap': return u < 0.5 ? a : b;
    case 'ordinal': case 'step': {
      const na = Number(a), nb = Number(b);
      return Math.round(na + (nb - na) * u);
    }
    case 'taper': {
      const na = Number(a), nb = Number(b);
      if (c.kind !== 'knob' && c.kind !== 'slider') return na + (nb - na) * u;
      const r = { id: c.id, unit: 'unit' in c ? c.unit : undefined, min: c.min, max: c.max, taper: 'taper' in c ? c.taper : undefined };
      const pa = toTaper(na, r), pb = toTaper(nb, r);
      return fromTaper(pa + (pb - pa) * u, r);
    }
  }
}

// ── descriptor ──────────────────────────────────────────────────────────

export function morphDescriptor(p: ModularProject, aId: string, bId: string): MorphDescriptor {
  const A = p.patches.find((x) => x.id === aId), B = p.patches.find((x) => x.id === bId);
  if (!A || !B) throw new RecipeError('Patch A of B bestaat niet.');
  if (A.id === B.id) throw new RecipeError('A en B zijn dezelfde patch.');
  if (!sameSet(A.rackIds, B.rackIds)) throw new RecipeError('A en B moeten op hetzelfde rack liggen (eerst racks samenvoegen via Optimaliseer).');
  if (A.voiceCount !== B.voiceCount) throw new RecipeError(`A en B hebben een ander stemmental (${A.voiceCount} ↔ ${B.voiceCount}).`);
  const warnings: string[] = [];
  const mods = new Map(p.modules.map((m) => [m.id, m]));
  const types = p.moduleTypes;

  // 1. Kabels: vereniging, per sink-ingang de voeders van A en B.
  const byKey = new Map<string, { conn: PatchConnection; inA: boolean; inB: boolean }>();
  for (const c of A.connections) byKey.set(keyOf(c), { conn: c, inA: true, inB: false });
  for (const c of B.connections) {
    const e = byKey.get(keyOf(c));
    if (e) e.inB = true; else byKey.set(keyOf(c), { conn: c, inA: false, inB: true });
  }
  const feeders = new Map<string, { a: string[]; b: string[]; all: PatchConnection[] }>();   // sink → voeders (from-keys)
  for (const { conn, inA, inB } of byKey.values()) {
    const s = sinkOf(conn);
    if (!feeders.has(s)) feeders.set(s, { a: [], b: [], all: [] });
    const f = feeders.get(s)!;
    const from = `${conn.from.moduleId}.${conn.from.portId}`;
    if (inA) f.a.push(from);
    if (inB) f.b.push(from);
    f.all.push(conn);
  }
  const inputsOf = (moduleId: string) => [...feeders.keys()].filter((s) => s.startsWith(moduleId + '.'));

  // 2. Vanaf de sinks terug. Start: OUT-modules; zonder OUT elke module
  //    zonder uitgaande kabel.
  const outgoing = new Set([...byKey.values()].map((e) => e.conn.from.moduleId));
  const rackModuleIds = new Set(p.racks.filter((r) => A.rackIds.includes(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)));
  let starts = [...rackModuleIds].filter((id) => mods.get(id)?.typeId === 'tp_mmb_out');
  if (!starts.length) starts = [...rackModuleIds].filter((id) => !outgoing.has(id) && inputsOf(id).length > 0);
  const visited = new Set<string>();
  const queue = [...starts];
  const weightedSinks = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const sink of inputsOf(id)) {
      const f = feeders.get(sink)!;
      const diverges = !sameSet(f.a, f.b);
      if (diverges) weightedSinks.add(sink);
      for (const c of f.all) {
        const inA = f.a.includes(`${c.from.moduleId}.${c.from.portId}`);
        const inB = f.b.includes(`${c.from.moduleId}.${c.from.portId}`);
        // Door gemeenschappelijke voeders naar boven; door afwijkende niet.
        if (inA && inB) queue.push(c.from.moduleId);
      }
    }
  }

  const common: PatchConnection[] = [], weighted: MorphCable[] = [], full: PatchConnection[] = [];
  for (const { conn, inA, inB } of byKey.values()) {
    if (inA && inB) { common.push(conn); continue; }
    const sink = sinkOf(conn);
    if (weightedSinks.has(sink)) {
      const port = resolvePorts(mods.get(conn.to.moduleId)!, types).find((q) => q.id === conn.to.portId);
      const snap = port?.signalType === 'gate' || port?.signalType === 'trigger';
      weighted.push({ connection: conn, side: inA ? 'a' : 'b', snap });
    } else {
      full.push(conn);
    }
  }
  // Lussen die maar in één patch bestaan: vol laten meelopen, wel melden.
  for (const c of full) {
    if (visited.has(c.to.moduleId) && !weightedSinks.has(sinkOf(c))) continue;
  }
  if (!weighted.length && !full.length) warnings.push('A en B hebben dezelfde kabels; alleen knopstanden morphen.');

  // 3. Controls die verschillen.
  const controls: MorphControl[] = [];
  for (const id of rackModuleIds) {
    const m = mods.get(id); if (!m) continue;
    const ca = A.controlState[id] ?? {}, cb = B.controlState[id] ?? {};
    for (const c of resolveControls(m, types)) {
      const va = ca[c.id], vb = cb[c.id];
      if (va === undefined || vb === undefined || JSON.stringify(va) === JSON.stringify(vb)) continue;
      const rule = ruleFor(c);
      if (!rule) continue;
      controls.push({ moduleId: id, controlId: c.id, a: va, b: vb, rule });
    }
  }
  return { a: A.id, b: B.id, rackIds: A.rackIds, voiceCount: A.voiceCount, common, weighted, full, controls, warnings };
}

// ── fusie op stand t ────────────────────────────────────────────────────

/** Gewicht van een gewogen kabel op stand t. */
export function cableWeight(c: MorphCable, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  if (c.snap) return (u < 0.5) === (c.side === 'a') ? 1 : 0;
  return c.side === 'a' ? 1 - u : u;
}

/**
 * M(A, B, t): kabels = gemeenschappelijk + vol + gewogen (met `attenuation`),
 * controls = A met de gemorphte waarden erover. `base` levert id, naam, map
 * en morph-veld; standaard een nieuwe morph-patch.
 */
export function morphPatch(p: ModularProject, desc: MorphDescriptor, t: number, base?: Partial<Patch>): Patch {
  const A = p.patches.find((x) => x.id === desc.a)!;
  const B = p.patches.find((x) => x.id === desc.b)!;
  const mods = new Map(p.modules.map((m) => [m.id, m]));
  const u = Math.max(0, Math.min(1, t));
  const connections: PatchConnection[] = [
    ...desc.common.map((c) => ({ ...c, attenuation: undefined })),
    ...desc.full.map((c) => ({ ...c, attenuation: undefined })),
    ...desc.weighted.map((w) => ({ ...w.connection, attenuation: cableWeight(w, u) })),
  ].map((c) => { if (c.attenuation === undefined) { const { attenuation: _a, ...rest } = c; void _a; return rest as PatchConnection; } return c; });
  const controlState: Patch['controlState'] = {};
  for (const [id, v] of Object.entries(A.controlState)) controlState[id] = { ...v };
  for (const [id, v] of Object.entries(B.controlState)) if (!controlState[id]) controlState[id] = { ...v };
  for (const e of desc.controls) {
    const m = mods.get(e.moduleId); if (!m) continue;
    const c = resolveControls(m, p.moduleTypes).find((x) => x.id === e.controlId); if (!c) continue;
    controlState[e.moduleId] = { ...(controlState[e.moduleId] ?? {}), [e.controlId]: morphControlValue(c, e, u) };
  }
  return {
    id: base?.id ?? `morph_${desc.a}_${desc.b}`,
    name: base?.name ?? `${A.name} ⇄ ${B.name}`,
    folder: base?.folder ?? A.folder,
    voiceCount: desc.voiceCount,
    rackIds: [...desc.rackIds],
    connections, controlState,
    envelopes: [], lfos: [],
    morph: { a: desc.a, b: desc.b, t: u },
    ...(base?.programNumber !== undefined ? { programNumber: base.programNumber } : {}),
  };
}

/** Maak of ververs de morph-patch in het project op stand t. */
export function upsertMorph(p: ModularProject, aId: string, bId: string, t: number, patchId?: string): ModularProject {
  const desc = morphDescriptor(p, aId, bId);
  const existing = patchId ? p.patches.find((x) => x.id === patchId) : p.patches.find((x) => x.morph?.a === aId && x.morph?.b === bId);
  const next = morphPatch(p, desc, t, existing);
  return {
    ...p,
    patches: existing ? p.patches.map((x) => (x.id === existing.id ? next : x)) : [...p.patches, next],
  };
}

/** Korte samenvatting voor de UI. */
export function describeMorph(p: ModularProject, desc: MorphDescriptor): string {
  const n = (id: string) => p.patches.find((x) => x.id === id)?.name ?? id;
  return `${n(desc.a)} ⇄ ${n(desc.b)}: ${desc.weighted.length} gewogen kabel${desc.weighted.length === 1 ? '' : 's'}, ` +
    `${desc.full.length} vol, ${desc.controls.length} knop${desc.controls.length === 1 ? '' : 'pen'}`;
}
