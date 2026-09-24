// Racks en patches optimaliseren (ED-RC-7) — programmatisch, geen AI.
//
// Elk recept maakt een nieuw rack; na een middag testen staan er tien racks
// die op elkaar lijken of identiek zijn. Dit bestand rekent een plan uit
// (analyzeProject) en voert het uit (applyActions):
//   1. opruimen  — racks zonder patch, modules zonder slot, patches zonder kabel
//   2. samenvoegen — twee racks die (bijna) hetzelfde zijn worden één rack;
//                    de patches van het opgeslokte rack verhuizen mee.
//
// Samenvoegen = per rij de module-reeksen uitlijnen (LCS op type-id). Gelijke
// modules worden op elkaar afgebeeld (patch B krijgt de id's van rack A);
// afwijkende modules van B verhuizen naar rack A (achteraan in hun rij).
// Zo laat patch A module y onaangeroerd en patch B module x. Welke van twee
// gelijke types op welke afgebeeld wordt maakt functioneel niet uit: de
// kabels én knopstanden van patch B verhuizen samen, en poly-groepen worden
// op consistentie gecontroleerd.
//
// Drempel `maxDiff` (default 2): het grootste aantal afwijkende modules aan
// één kant. Daarboven blijven racks apart — anders wordt alles één dik rack.
// Verschillend stemmental (poly-groepen) = nooit samenvoegen.

import type { ModularProject, ModuleInstance, PolyGroup, Rack, RackSlot } from '../types';
import { uid } from '../store';
import { shortName } from './catalog';
import { RecipeError } from './types';

export interface OptimizeOptions {
  /** Max. afwijkende modules aan één kant om nog samen te voegen. */
  maxDiff?: number;
}

export type OptimizeAction =
  | { kind: 'removeRack';    rackId: string;    label: string; detail: string }
  | { kind: 'removeModules'; moduleIds: string[]; label: string; detail: string }
  | { kind: 'removePatch';   patchId: string;   label: string; detail: string }
  | { kind: 'mergeRacks';    into: string; from: string; diff: number; label: string; detail: string };

export interface OptimizePlan {
  actions: OptimizeAction[];
  summary: string;
  /** Racks die op elkaar lijken maar boven de drempel of incompatibel zijn. */
  skipped: { a: string; b: string; reason: string }[];
}

export interface ApplyResult { project: ModularProject; summary: string; warnings: string[] }

// ── helpers ─────────────────────────────────────────────────────────────

const rackById = (p: ModularProject, id: string): Rack => {
  const r = p.racks.find((x) => x.id === id);
  if (!r) throw new RecipeError(`Rack ${id} bestaat niet.`);
  return r;
};
const modById = (p: ModularProject) => new Map(p.modules.map((m) => [m.id, m]));
const patchesOf = (p: ModularProject, rackId: string) => p.patches.filter((x) => x.rackIds.includes(rackId));
const rackVoices = (r: Rack): number => Math.max(1, ...(r.polyGroups ?? []).map((g) => g.voiceCount));

/** Slots per rij, op hpOffset gesorteerd. */
function rowsOf(r: Rack): Map<number, RackSlot[]> {
  const rows = new Map<number, RackSlot[]>();
  for (const s of r.slots) { if (!rows.has(s.row)) rows.set(s.row, []); rows.get(s.row)!.push(s); }
  for (const list of rows.values()) list.sort((a, b) => a.hpOffset - b.hpOffset);
  return rows;
}

/** LCS-uitlijning van twee type-id-reeksen → paren (i, j) van gelijke types. */
function align(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; --i) for (let j = m - 1; j >= 0; --j) {
    L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  }
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); ++i; ++j; }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) ++i;
    else ++j;
  }
  return pairs;
}

export interface RackDiff {
  /** Aantal afwijkende modules aan de grootste kant. */
  diff: number;
  /** module-id in `from` → module-id in `into`. */
  mapping: Map<string, string>;
  /** Modules van `from` zonder tegenhanger: verhuizen naar `into`. */
  moved: string[];
  /** Modules van `into` zonder tegenhanger (blijven staan). */
  unmatchedInto: string[];
  /** poly-groep-id in `from` → id in `into` (bestaand of nieuw). */
  groupMap: Map<string, string | null>;
}

/** Vergelijk twee racks. null = incompatibel (ander stemmental, poly-conflict, cellen). */
export function rackDiff(p: ModularProject, intoId: string, fromId: string): RackDiff | { incompatible: string } {
  const A = rackById(p, intoId), B = rackById(p, fromId);
  if (A.kind === 'internal' || B.kind === 'internal') return { incompatible: 'intern rack' };
  if (rackVoices(A) !== rackVoices(B)) return { incompatible: `stemmental ${rackVoices(A)} ≠ ${rackVoices(B)}` };
  const mods = modById(p);
  const typeOf = (id: string) => mods.get(id)?.typeId ?? '?';
  const rowsA = rowsOf(A), rowsB = rowsOf(B);
  const mapping = new Map<string, string>();
  const matchedInto = new Set<string>();
  for (const [row, slotsB] of rowsB) {
    const slotsA = rowsA.get(row) ?? [];
    const pairs = align(slotsA.map((s) => typeOf(s.moduleId)), slotsB.map((s) => typeOf(s.moduleId)));
    for (const [i, j] of pairs) { mapping.set(slotsB[j]!.moduleId, slotsA[i]!.moduleId); matchedInto.add(slotsA[i]!.moduleId); }
  }
  const moved = B.slots.map((s) => s.moduleId).filter((id) => !mapping.has(id));
  const unmatchedInto = A.slots.map((s) => s.moduleId).filter((id) => !matchedInto.has(id));
  const diff = Math.max(moved.length, unmatchedInto.length);

  // Poly-groepen: elke B-groep moet óf precies op een A-groep vallen, óf
  // volledig uit verhuizende modules bestaan (wordt een nieuwe A-groep).
  // Leden zijn hele modules óf cellen van een multi-module (sampler: cel
  // 'voice' 0..7). Een cel-lid volgt de module-mapping; celgroep en -index
  // blijven gelijk.
  const groupMap = new Map<string, string | null>();
  const memberKey = (m: PolyGroup['members'][number], id = m.moduleId) =>
    m.kind === 'module' ? id : `${id}:${m.cellGroupId}:${m.cellIndex}`;
  const aGroups = new Map((A.polyGroups ?? []).map((g) => [g.members.map((m) => memberKey(m)).join('|'), g]));
  for (const g of B.polyGroups ?? []) {
    if (g.members.every((m) => moved.includes(m.moduleId))) { groupMap.set(g.id, null); continue; }
    const mapped = g.members.map((m) => memberKey(m, mapping.get(m.moduleId) ?? ''));
    const hit = aGroups.get(mapped.join('|'));
    if (!hit || hit.voiceCount !== g.voiceCount) return { incompatible: `poly-groep ${g.label} valt niet op een groep van het andere rack` };
    groupMap.set(g.id, hit.id);
  }
  return { diff, mapping, moved, unmatchedInto, groupMap };
}

// ── samenvoegen ─────────────────────────────────────────────────────────

export function mergeRacks(p: ModularProject, intoId: string, fromId: string): ApplyResult & { diff: number } {
  const d = rackDiff(p, intoId, fromId);
  if ('incompatible' in d) throw new RecipeError(`Racks niet samen te voegen: ${d.incompatible}.`);
  const A = rackById(p, intoId), B = rackById(p, fromId);
  const mods = modById(p);
  const warnings: string[] = [];
  const map = (id: string) => d.mapping.get(id) ?? id;

  // 1. Verhuizende modules: naast hun buurman. Een afwijkende module van B
  //    (Ladder waar A een VCF heeft) komt direct rechts van de A-tegenhanger
  //    van zijn linkerbuur in B, zodat soortgenoten bij elkaar staan; alles
  //    rechts ervan in die rij van A schuift op (gaten blijven bestaan).
  //    Geen gemapte buur links? Dan links van de tegenhanger van de rechter-
  //    buur; anders achteraan in de rij.
  const width = (id: string) => mods.get(id)?.visual.hpWidth ?? 0;
  const aRows = new Map<number, RackSlot[]>();
  for (const s of A.slots) { if (!aRows.has(s.row)) aRows.set(s.row, []); aRows.get(s.row)!.push({ ...s }); }
  for (const list of aRows.values()) list.sort((x, y) => x.hpOffset - y.hpOffset);
  const newSlots: RackSlot[] = [];
  for (const [row, slotsB] of rowsOf(B)) {
    if (!aRows.has(row)) aRows.set(row, []);
    const rowA = aRows.get(row)!;
    slotsB.forEach((s, j) => {
      if (!d.moved.includes(s.moduleId)) return;
      const w = width(s.moduleId);
      let anchor: { id: string; side: 'after' | 'before' } | null = null;
      for (let k = j - 1; k >= 0 && !anchor; --k) { const a = d.mapping.get(slotsB[k]!.moduleId); if (a) anchor = { id: a, side: 'after' }; }
      for (let k = j + 1; k < slotsB.length && !anchor; ++k) { const a = d.mapping.get(slotsB[k]!.moduleId); if (a) anchor = { id: a, side: 'before' }; }
      let at: number, idx: number;
      const ai = anchor ? rowA.findIndex((x) => x.moduleId === anchor!.id) : -1;
      if (anchor && ai >= 0) {
        at = anchor.side === 'after' ? rowA[ai]!.hpOffset + width(rowA[ai]!.moduleId) : rowA[ai]!.hpOffset;
        idx = anchor.side === 'after' ? ai + 1 : ai;
      } else {
        const last = rowA[rowA.length - 1];
        at = last ? last.hpOffset + width(last.moduleId) : 0;
        idx = rowA.length;
      }
      for (const x of rowA) if (x.hpOffset >= at) x.hpOffset += w;
      const slot: RackSlot = { id: uid('slot'), moduleId: s.moduleId, row, hpOffset: at };
      rowA.splice(idx, 0, slot);
      newSlots.push(slot);
    });
  }
  const shiftedA: RackSlot[] = [...aRows.values()].flat().filter((s) => !newSlots.includes(s));
  const rowEnd = new Map<number, number>();
  for (const [row, list] of aRows) rowEnd.set(row, Math.max(0, ...list.map((s) => s.hpOffset + width(s.moduleId))));
  // 2. Nieuwe poly-groepen (die volledig uit verhuizende modules bestaan).
  const newGroups: PolyGroup[] = [];
  const groupIdMap = new Map<string, string>();
  for (const g of B.polyGroups ?? []) {
    const target = d.groupMap.get(g.id);
    if (target) { groupIdMap.set(g.id, target); continue; }
    const ng: PolyGroup = { ...g, id: uid('poly') };
    newGroups.push(ng); groupIdMap.set(g.id, ng.id);
  }
  const rows = Math.max(A.rows, ...newSlots.map((s) => s.row + 1));
  const hpPerRow = Math.max(A.hpPerRow, ...[...rowEnd.values()].map((e) => e + 2));
  const mergedA: Rack = { ...A, rows, hpPerRow, slots: [...shiftedA, ...newSlots], polyGroups: [...(A.polyGroups ?? []), ...newGroups] };

  // 3. Patches van B: rack-verwijzing, kabels, knopstanden, overrides.
  const patches = p.patches.map((x) => {
    if (!x.rackIds.includes(fromId)) return x;
    const rackIds = [...new Set(x.rackIds.map((r) => (r === fromId ? intoId : r)))];
    const controlState: typeof x.controlState = {};
    for (const [id, v] of Object.entries(x.controlState)) controlState[map(id)] = { ...(controlState[map(id)] ?? {}), ...v };
    return {
      ...x, rackIds, controlState,
      connections: x.connections.map((c) => ({ ...c, from: { ...c.from, moduleId: map(c.from.moduleId) }, to: { ...c.to, moduleId: map(c.to.moduleId) } })),
      polyOverrides: x.polyOverrides?.map((o) => ({ ...o, rackPolyGroupId: groupIdMap.get(o.rackPolyGroupId) ?? o.rackPolyGroupId })),
    };
  });
  const midiMap = p.midiMap ? { ...p.midiMap, bindings: p.midiMap.bindings.map((b) => ({ ...b, mod: map(b.mod) })) } : p.midiMap;

  // 4. Opgeslokte (afgebeelde) modules van B verdwijnen; verhuisde blijven.
  const gone = new Set([...d.mapping.keys()]);
  const next: ModularProject = {
    ...p,
    racks: p.racks.filter((r) => r.id !== fromId).map((r) => (r.id === intoId ? mergedA : r)),
    modules: p.modules.filter((m) => !gone.has(m.id)),
    patches, midiMap,
    activeRackId: p.activeRackId === fromId ? intoId : p.activeRackId,
  };
  const names = (ids: string[]) => ids.map((id) => shortName(mods.get(id)?.typeId ?? '?', p.moduleTypes)).join(', ');
  return {
    project: next, diff: d.diff, warnings,
    summary: `${B.name} → ${A.name}: ${d.mapping.size} modules gedeeld` +
      (d.moved.length ? `, verhuisd: ${names(d.moved)}` : '') +
      (d.unmatchedInto.length ? `, alleen in ${A.name}: ${names(d.unmatchedInto)}` : '') + '.',
  };
}

// ── analyse ─────────────────────────────────────────────────────────────

export function analyzeProject(project: ModularProject, opts: OptimizeOptions = {}): OptimizePlan {
  const maxDiff = opts.maxDiff ?? 2;
  const actions: OptimizeAction[] = [];
  const skipped: OptimizePlan['skipped'] = [];
  let p = project;

  // 1. Opruimen.
  for (const r of p.racks) {
    if (r.kind === 'internal' || r.id === 'rack_internal') continue;
    // Een leeg rack (bijv. het standaard "Mijn rack") is geen rommel: laten staan.
    if (r.slots.length > 0 && patchesOf(p, r.id).length === 0) {
      actions.push({ kind: 'removeRack', rackId: r.id, label: `Rack "${r.name}" verwijderen`,
        detail: `Geen enkele patch gebruikt dit rack (${r.slots.length} modules gaan mee).` });
    }
  }
  const removedRacks = new Set(actions.flatMap((a) => (a.kind === 'removeRack' ? [a.rackId] : [])));
  const slotted = new Set(p.racks.filter((r) => !removedRacks.has(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)));
  const inRemoved = new Set(p.racks.filter((r) => removedRacks.has(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)));
  const orphanMods = p.modules.filter((m) => !m.internal && !slotted.has(m.id) && !inRemoved.has(m.id)).map((m) => m.id);
  if (orphanMods.length) {
    actions.push({ kind: 'removeModules', moduleIds: orphanMods, label: `${orphanMods.length} losse modules verwijderen`,
      detail: 'Modules die in geen enkel rack meer staan.' });
  }
  for (const x of p.patches) {
    if (x.connections.length === 0) {
      actions.push({ kind: 'removePatch', patchId: x.id, label: `Lege patch "${x.name}" verwijderen`, detail: 'Geen kabels.' });
    }
  }
  p = applyActions(p, actions).project;

  // 2. Samenvoegen (gesimuleerd op de opgeruimde kopie, zodat volgende
  //    vergelijkingen het samengevoegde rack zien).
  const physical = () => p.racks.filter((r) => r.kind !== 'internal' && r.id !== 'rack_internal' && r.slots.length > 0);
  const alive = new Set(physical().map((r) => r.id));
  const order = physical().sort((a, b) => patchesOf(p, b.id).length - patchesOf(p, a.id).length || b.slots.length - a.slots.length).map((r) => r.id);
  for (let i = 0; i < order.length; ++i) {
    const into = order[i]!;
    if (!alive.has(into)) continue;
    for (let j = i + 1; j < order.length; ++j) {
      const from = order[j]!;
      if (!alive.has(from)) continue;
      const d = rackDiff(p, into, from);
      const A = rackById(p, into), B = rackById(p, from);
      if ('incompatible' in d) { skipped.push({ a: A.name, b: B.name, reason: d.incompatible }); continue; }
      if (d.diff > maxDiff) { skipped.push({ a: A.name, b: B.name, reason: `${d.diff} afwijkende modules (drempel ${maxDiff})` }); continue; }
      const r = mergeRacks(p, into, from);
      p = r.project; alive.delete(from);
      actions.push({ kind: 'mergeRacks', into, from, diff: d.diff,
        label: d.diff === 0 ? `"${B.name}" is identiek aan "${A.name}": samenvoegen` : `"${B.name}" lijkt op "${A.name}" (${d.diff} afwijkend): samenvoegen`,
        detail: r.summary + ` Patches: ${patchesOf(project, from).map((x) => x.name).join(', ') || '–'}.` });
    }
  }

  const n = (k: OptimizeAction['kind']) => actions.filter((a) => a.kind === k).length;
  const parts = [
    n('mergeRacks') ? `${n('mergeRacks')} racks samenvoegen` : null,
    n('removeRack') ? `${n('removeRack')} racks zonder patch` : null,
    n('removeModules') ? 'losse modules' : null,
    n('removePatch') ? `${n('removePatch')} lege patches` : null,
  ].filter(Boolean);
  return { actions, skipped, summary: parts.length ? parts.join(' · ') : 'Niets te optimaliseren.' };
}

// ── uitvoeren ───────────────────────────────────────────────────────────

export function applyActions(project: ModularProject, actions: OptimizeAction[]): ApplyResult {
  let p = project;
  const warnings: string[] = [];
  const done: string[] = [];
  for (const a of actions) {
    switch (a.kind) {
      case 'removeRack': {
        const r = p.racks.find((x) => x.id === a.rackId);
        if (!r) { warnings.push(`Rack ${a.rackId} bestond niet meer.`); break; }
        const ids = new Set(r.slots.map((s) => s.moduleId));
        p = { ...p, racks: p.racks.filter((x) => x.id !== a.rackId), modules: p.modules.filter((m) => !ids.has(m.id)),
              activeRackId: p.activeRackId === a.rackId ? undefined : p.activeRackId };
        done.push(`rack "${r.name}" weg`);
        break;
      }
      case 'removeModules': {
        const ids = new Set(a.moduleIds);
        p = { ...p, modules: p.modules.filter((m) => !ids.has(m.id)),
              patches: p.patches.map((x) => ({ ...x,
                connections: x.connections.filter((c) => !ids.has(c.from.moduleId) && !ids.has(c.to.moduleId)),
                controlState: Object.fromEntries(Object.entries(x.controlState).filter(([id]) => !ids.has(id))) })) };
        done.push(`${a.moduleIds.length} losse modules weg`);
        break;
      }
      case 'removePatch':
        p = { ...p, patches: p.patches.filter((x) => x.id !== a.patchId),
              activePatchId: p.activePatchId === a.patchId ? undefined : p.activePatchId };
        done.push('lege patch weg');
        break;
      case 'mergeRacks': {
        const r = mergeRacks(p, a.into, a.from);
        p = r.project; warnings.push(...r.warnings); done.push(r.summary);
        break;
      }
    }
  }
  if (!p.activePatchId || !p.patches.some((x) => x.id === p.activePatchId)) p = { ...p, activePatchId: p.patches[0]?.id };
  if (!p.activeRackId || !p.racks.some((r) => r.id === p.activeRackId)) {
    const ap = p.patches.find((x) => x.id === p.activePatchId);
    p = { ...p, activeRackId: ap?.rackIds[0] ?? p.racks.find((r) => r.kind !== 'internal')?.id };
  }
  return { project: p, warnings, summary: done.length ? done.join(' · ') : 'Niets gedaan.' };
}

/** Analyse + uitvoeren in één keer (voor tools en scripts). */
export function optimizeProject(project: ModularProject, opts: OptimizeOptions = {}): ApplyResult & { plan: OptimizePlan } {
  const plan = analyzeProject(project, opts);
  const r = applyActions(project, plan.actions);
  return { ...r, plan };
}
