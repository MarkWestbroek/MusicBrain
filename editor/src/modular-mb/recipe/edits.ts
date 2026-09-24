// Bewerkingen op een bestaande patch (ED-RC-2) — de "werkwoorden":
//   replaceModule   vervang een module (of zijn hele poly-groep) door een ander type
//   setVoices       maak een patch ×N poly of terug naar mono
//   addBusFx        zet een effect tussen de laatste modules en OUT
//   addModulation   hang een LFO of envelope aan een cv-ingang
//
// Elke functie is puur: (project, …) → { project, summary, warnings } en
// gooit RecipeError bij een onmogelijke vraag. Module-id's blijven bij
// vervangen behouden, zodat kabels, slots, groepen en surface-bindings
// niet hoeven te verhuizen.

import {
  type ModularProject, type ModuleInstance, type ModuleType, type Patch,
  type PatchConnection, type PolyGroup, type Rack, type RackSlot, type ControlValue,
  resolvePorts,
} from '../types';
import { uid } from '../store';
import { seedInternals } from '../seedModules';
import {
  CATALOG, resolveTypeId, suggestTypeIds, shortName, playableControls, portRoles,
  type PortRoles,
} from './catalog';
import { RecipeError } from './types';

export interface EditResult {
  project: ModularProject;
  summary: string;
  warnings: string[];
}

// ── helpers ─────────────────────────────────────────────────────────────

function typeOf(p: ModularProject, typeId: string): ModuleType {
  const t = p.moduleTypes.find((x) => x.id === typeId);
  if (!t) throw new RecipeError(`Moduletype ${typeId} ontbreekt in het project.`);
  return t;
}

function moduleOf(p: ModularProject, moduleId: string): ModuleInstance {
  const m = p.modules.find((x) => x.id === moduleId);
  if (!m) throw new RecipeError(`Module ${moduleId} bestaat niet.`);
  return m;
}

function patchOf(p: ModularProject, patchId: string): Patch {
  const x = p.patches.find((q) => q.id === patchId);
  if (!x) throw new RecipeError('Geen actieve patch.');
  return x;
}

/** Zorg dat het type in het project zit (anders internals seeden). */
function ensureType(p: ModularProject, typeId: string): ModularProject {
  return p.moduleTypes.some((t) => t.id === typeId) ? p : seedInternals(p);
}

function resolveOrThrow(ref: string, types: ModuleType[]): string {
  const id = resolveTypeId(ref, types);
  if (id) return id;
  const sug = suggestTypeIds(ref).map((t) => shortName(t, types));
  throw new RecipeError(`Onbekende module "${ref}".` + (sug.length ? ` Bedoelde je: ${sug.join(', ')}?` : ''), sug);
}

function freshInstance(p: ModularProject, typeId: string, id = uid('mod')): ModuleInstance {
  const proto = p.modules.find((m) => m.typeId === typeId);
  if (!proto) throw new RecipeError(`Geen prototype-module voor ${typeId}.`);
  return { ...proto, id, internal: false, visual: proto.visual };
}

function slotOf(p: ModularProject, moduleId: string): { rack: Rack; slot: RackSlot } | null {
  for (const rack of p.racks) {
    const slot = rack.slots.find((s) => s.moduleId === moduleId);
    if (slot) return { rack, slot };
  }
  return null;
}

function groupOf(p: ModularProject, moduleId: string): { rack: Rack; group: PolyGroup; index: number } | null {
  for (const rack of p.racks) {
    for (const group of rack.polyGroups ?? []) {
      const index = group.members.findIndex((m) => m.kind === 'module' && m.moduleId === moduleId);
      if (index >= 0) return { rack, group, index };
    }
  }
  return null;
}

/** Racks waar deze patch over patcht. */
function patchRacks(p: ModularProject, patch: Patch): Rack[] {
  return p.racks.filter((r) => patch.rackIds.includes(r.id));
}

/** Modules met een slot in een van de patch-racks. */
function patchModuleIds(p: ModularProject, patch: Patch): Set<string> {
  const ids = new Set<string>();
  for (const r of patchRacks(p, patch)) for (const s of r.slots) ids.add(s.moduleId);
  return ids;
}

/** Einde (HP) van een rij in een rack. */
function rowEnd(p: ModularProject, rack: Rack, row: number): number {
  let end = 0;
  for (const s of rack.slots) {
    if (s.row !== row) continue;
    const m = p.modules.find((x) => x.id === s.moduleId);
    end = Math.max(end, s.hpOffset + (m?.visual.hpWidth ?? 0));
  }
  return end;
}

function withRack(p: ModularProject, rackId: string, fn: (r: Rack) => Rack): ModularProject {
  return { ...p, racks: p.racks.map((r) => (r.id === rackId ? fn(r) : r)) };
}

function withPatch(p: ModularProject, patchId: string, fn: (x: Patch) => Patch): ModularProject {
  return { ...p, patches: p.patches.map((x) => (x.id === patchId ? fn(x) : x)) };
}

/** Plaats een module aan het einde van een rij; groeit het rack mee. */
function placeAtRowEnd(p: ModularProject, rackId: string, row: number, mod: ModuleInstance): ModularProject {
  const rack = p.racks.find((r) => r.id === rackId)!;
  const hpOffset = rowEnd(p, rack, row);
  const slot: RackSlot = { id: uid('slot'), moduleId: mod.id, row, hpOffset };
  return withRack({ ...p, modules: [...p.modules, mod] }, rackId, (r) => ({
    ...r,
    rows: Math.max(r.rows, row + 1),
    hpPerRow: Math.max(r.hpPerRow, hpOffset + mod.visual.hpWidth + 2),
    slots: [...r.slots, slot],
  }));
}

/** Schuif alles rechts van `slot` in dezelfde rij `delta` HP op. */
function shiftRow(p: ModularProject, rackId: string, slot: RackSlot, delta: number): ModularProject {
  if (delta === 0) return p;
  return withRack(p, rackId, (r) => ({
    ...r,
    hpPerRow: Math.max(r.hpPerRow, rowEnd(p, r, slot.row) + Math.max(0, delta) + 2),
    slots: r.slots.map((s) => (s.row === slot.row && s.hpOffset > slot.hpOffset
      ? { ...s, hpOffset: s.hpOffset + delta } : s)),
  }));
}

const ROLE_KEYS: (keyof Omit<PortRoles, 'audioIn' | 'audioOut'>)[] =
  ['pitch', 'gate', 'vel', 'tune', 'modulation', 'strength', 'cv'];

/** Poort-mapping oud → nieuw op rol, daarna op gelijke id. */
function mapPorts(oldT: ModuleType, newT: ModuleType): Map<string, string> {
  const a = portRoles(oldT), b = portRoles(newT);
  const m = new Map<string, string>();
  const set = (from?: string, to?: string) => { if (from && to && !m.has(from)) m.set(from, to); };
  set(a.audioIn.mono,   b.audioIn.mono ?? b.audioIn.left);
  set(a.audioIn.left,   b.audioIn.left ?? b.audioIn.mono);
  set(a.audioIn.right,  b.audioIn.right ?? b.audioIn.mono);
  set(a.audioOut.mono,  b.audioOut.mono ?? b.audioOut.left);
  set(a.audioOut.left,  b.audioOut.left ?? b.audioOut.mono);
  set(a.audioOut.right, b.audioOut.right ?? b.audioOut.mono);
  for (const k of ROLE_KEYS) set(a[k], b[k]);
  for (const port of oldT.ports) {
    if (m.has(port.id)) continue;
    const same = newT.ports.find((q) => q.id === port.id && q.direction === port.direction && q.signalType === port.signalType);
    if (same) m.set(port.id, same.id);
  }
  return m;
}

// ── replaceModule ───────────────────────────────────────────────────────

export function replaceModule(project: ModularProject, patchId: string, moduleId: string, newTypeRef: string): EditResult {
  const warnings: string[] = [];
  let p = ensureType(project, resolveOrThrow(newTypeRef, seedInternals(project).moduleTypes));
  const newTypeId = resolveOrThrow(newTypeRef, p.moduleTypes);
  const newT = typeOf(p, newTypeId);
  const old = moduleOf(p, moduleId);
  if (old.typeId === newTypeId) throw new RecipeError(`${old.name} is al een ${shortName(newTypeId, p.moduleTypes)}.`);
  const oldT = typeOf(p, old.typeId);
  if (newT.role === 'multi' || oldT.role === 'multi') {
    throw new RecipeError('Multi-modules (met cellen) kunnen nog niet vervangen worden.');
  }
  const portMap = mapPorts(oldT, newT);

  // Doelwit: de hele poly-groep, of alleen deze module.
  const grp = groupOf(p, moduleId);
  const targets = grp
    ? grp.group.members.flatMap((m) => (m.kind === 'module' ? [m.moduleId] : []))
    : [moduleId];

  const proto = freshInstance(p, newTypeId);
  const dropped = new Set<string>();
  // 1. Instanties omzetten (zelfde id).
  p = {
    ...p,
    modules: p.modules.map((m) => (targets.includes(m.id)
      ? { ...proto, id: m.id, notes: m.notes } : m)),
  };
  // 2. Kabels in álle patches herbedraden; niet-mapbare poorten vervallen.
  p = {
    ...p,
    patches: p.patches.map((x) => ({
      ...x,
      connections: x.connections.flatMap((c): PatchConnection[] => {
        let from = c.from, to = c.to;
        if (targets.includes(c.from.moduleId)) {
          const np = portMap.get(c.from.portId);
          if (!np) { dropped.add(`${oldT.variant}.${c.from.portId} (uit)`); return []; }
          from = { ...from, portId: np };
        }
        if (targets.includes(c.to.moduleId)) {
          const np = portMap.get(c.to.portId);
          if (!np) { dropped.add(`${oldT.variant}.${c.to.portId} (in)`); return []; }
          to = { ...to, portId: np };
        }
        return [{ ...c, from, to }];
      }),
      controlState: Object.fromEntries(Object.entries(x.controlState).map(([id, v]) =>
        [id, targets.includes(id) ? playableControls(newT) : v])),
    })),
  };
  // 3. Knopstanden voor doelen die nog geen state hadden (in deze patch).
  p = withPatch(p, patchId, (x) => ({
    ...x,
    controlState: { ...x.controlState,
      ...Object.fromEntries(targets.filter((id) => !x.controlState[id]).map((id) => [id, playableControls(newT)])) },
  }));
  // 4. Groepslabel + breedte in het rack.
  if (grp) {
    p = withRack(p, grp.rack.id, (r) => ({
      ...r,
      polyGroups: (r.polyGroups ?? []).map((g) => (g.id === grp.group.id
        ? { ...g, label: shortName(newTypeId, p.moduleTypes) } : g)),
    }));
  }
  const delta = proto.visual.hpWidth - old.visual.hpWidth;
  for (const id of targets) {
    const loc = slotOf(p, id);
    if (loc) p = shiftRow(p, loc.rack.id, loc.slot, delta);
  }
  for (const d of dropped) warnings.push(`Kabel op ${d} had geen tegenhanger op ${shortName(newTypeId, p.moduleTypes)} en is verwijderd.`);

  const n = targets.length;
  return {
    project: p,
    summary: `${shortName(oldT.id, p.moduleTypes)} → ${shortName(newTypeId, p.moduleTypes)}${n > 1 ? ` (×${n}, hele poly-groep)` : ''}`,
    warnings,
  };
}

// ── setVoices ───────────────────────────────────────────────────────────

/** Is dit een module die stemmen samenvoegt (mixer / poly-to-mono)? */
function isSummingSink(t: ModuleType): boolean {
  if (t.role === 'poly-to-mono') return true;
  if (/^tp_mmb_mixer/.test(t.id)) return true;
  const ins = t.ports.filter((q) => q.direction === 'in' && q.signalType === 'audio');
  return ins.length >= 2 && ins.every((q) => /^in\d+$/.test(q.id));
}

function isEventSource(t: ModuleType): boolean {
  return t.role === 'event-source' || t.ports.some((q) => q.direction === 'out' && q.eventKind === 'voice');
}

/**
 * De stemketen van een mono patch: alles wat vooruit bereikbaar is vanaf de
 * voice-poorten van een event-source, tot aan een sommerende sink (mixer)
 * of OUT. Event-sources, sinks en multi-modules doen niet mee.
 */
export function findVoiceChain(p: ModularProject, patch: Patch): string[] {
  const ids = patchModuleIds(p, patch);
  const byId = new Map(p.modules.map((m) => [m.id, m]));
  const start: string[] = [];
  const seeds: { moduleId: string; portId: string }[] = [];
  for (const id of ids) {
    const m = byId.get(id); if (!m) continue;
    const t = p.moduleTypes.find((x) => x.id === m.typeId); if (!t) continue;
    if (!isEventSource(t)) continue;
    start.push(id);
    for (const q of resolvePorts(m, p.moduleTypes)) {
      if (q.direction === 'out' && q.eventKind === 'voice') seeds.push({ moduleId: id, portId: q.id });
    }
  }
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const c of patch.connections) {
    if (seeds.some((s) => s.moduleId === c.from.moduleId && s.portId === c.from.portId)) queue.push(c.to.moduleId);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id) || start.includes(id) || !ids.has(id)) continue;
    const m = byId.get(id); if (!m) continue;
    const t = p.moduleTypes.find((x) => x.id === m.typeId); if (!t) continue;
    if (isSummingSink(t) || t.role === 'multi' || t.id === 'tp_mmb_out') continue;
    visited.add(id);
    for (const c of patch.connections) if (c.from.moduleId === id) queue.push(c.to.moduleId);
  }
  return [...visited];
}

export function setVoices(project: ModularProject, patchId: string, voices: number): EditResult {
  const N = Math.max(1, Math.min(16, Math.round(voices)));
  const warnings: string[] = [];
  let p = project;
  const patch = patchOf(p, patchId);
  const racks = patchRacks(p, patch);
  const ids = patchModuleIds(p, patch);

  // Bestaande groepen van deze patch: master = members[0].
  const groups = racks.flatMap((r) => (r.polyGroups ?? [])
    .filter((g) => g.members.every((m) => m.kind === 'module' && ids.has(m.moduleId)))
    .map((g) => ({ rackId: r.id, group: g })));
  if (racks.some((r) => (r.polyGroups ?? []).some((g) => g.members.some((m) => m.kind === 'cell')))) {
    throw new RecipeError('Poly-groepen op cellen (multi-modules) kunnen nog niet van stemmental wisselen.');
  }
  const current = groups.length ? groups[0]!.group.voiceCount : 1;
  if (current === N) {
    return { project: p, summary: `De patch is al ${N === 1 ? 'mono' : `${N}-stemmig`}.`, warnings };
  }

  // Stemketen: masters van de groepen, of (mono) de bereikbare keten.
  interface Chain { master: string; followers: string[]; groupId?: string; rackId: string; label: string }
  let chains: Chain[];
  if (groups.length) {
    chains = groups.map(({ rackId, group }) => ({
      master: (group.members[0] as { moduleId: string }).moduleId,
      followers: group.members.slice(1).map((m) => (m as { moduleId: string }).moduleId),
      groupId: group.id, rackId, label: group.label,
    }));
  } else {
    const chain = findVoiceChain(p, patch);
    if (!chain.length) {
      throw new RecipeError('Geen stemketen gevonden: er moet een MIDI-in (of andere event-source) met kabels naar de stem zijn.');
    }
    chains = chain.map((id) => {
      const loc = slotOf(p, id);
      if (!loc) throw new RecipeError(`Module ${id} staat niet in een rack.`);
      return { master: id, followers: [], rackId: loc.rack.id, label: shortName(moduleOf(p, id).typeId, p.moduleTypes) };
    });
  }

  // 1. Followers bijmaken of weghalen.
  const removed = new Set<string>();
  for (const ch of chains) {
    const master = moduleOf(p, ch.master);
    const mloc = slotOf(p, ch.master)!;
    const keep = ch.followers.slice(0, Math.max(0, N - 1));
    for (const id of ch.followers.slice(Math.max(0, N - 1))) removed.add(id);
    const add: string[] = [];
    for (let v = keep.length + 1; v < N; ++v) {
      const clone: ModuleInstance = { ...master, id: uid('mod') };
      const slot: RackSlot = { id: uid('slot'), moduleId: clone.id, row: mloc.slot.row + v, hpOffset: mloc.slot.hpOffset };
      p = withRack({ ...p, modules: [...p.modules, clone] }, ch.rackId, (r) => ({
        ...r, rows: Math.max(r.rows, slot.row + 1), slots: [...r.slots, slot],
      }));
      p = withPatch(p, patchId, (x) => ({
        ...x,
        controlState: { ...x.controlState, [clone.id]: { ...(x.controlState[ch.master] ?? {}) } },
      }));
      add.push(clone.id);
    }
    ch.followers = [...keep, ...add];
  }
  if (removed.size) {
    p = {
      ...p,
      modules: p.modules.filter((m) => !removed.has(m.id)),
      racks: p.racks.map((r) => ({ ...r, slots: r.slots.filter((s) => !removed.has(s.moduleId)) })),
      patches: p.patches.map((x) => ({
        ...x,
        connections: x.connections.filter((c) => !removed.has(c.from.moduleId) && !removed.has(c.to.moduleId)),
        controlState: Object.fromEntries(Object.entries(x.controlState).filter(([id]) => !removed.has(id))),
      })),
    };
  }

  // 2. Groepen herschrijven.
  for (const rack of racks) {
    p = withRack(p, rack.id, (r) => {
      const others = (r.polyGroups ?? []).filter((g) => !chains.some((c) => c.groupId === g.id));
      const mine = N >= 2
        ? chains.filter((c) => c.rackId === r.id).map((c): PolyGroup => ({
            id: c.groupId ?? uid('poly'), label: c.label, voiceCount: N,
            members: [c.master, ...c.followers].map((id) => ({ kind: 'module' as const, moduleId: id })),
          }))
        : [];
      return { ...r, polyGroups: [...others, ...mine] };
    });
  }

  // 3. Mixer groot genoeg? (kanaal-genummerde sink achter een ketenmodule)
  const chainIds = new Set(chains.map((c) => c.master));
  for (const c of patch.connections) {
    if (!chainIds.has(c.from.moduleId)) continue;
    const sink = p.modules.find((m) => m.id === c.to.moduleId); if (!sink) continue;
    const st = p.moduleTypes.find((t) => t.id === sink.typeId); if (!st || !/^tp_mmb_mixer/.test(st.id)) continue;
    const channels = st.ports.filter((q) => q.direction === 'in' && q.signalType === 'audio').length;
    if (channels >= N) {
      p = withPatch(p, patchId, (x) => ({ ...x, controlState: { ...x.controlState,
        [sink.id]: { ...(x.controlState[sink.id] ?? {}), ...volumes(N, channels) } } }));
      continue;
    }
    const bigId = N > 8 ? 'tp_mmb_mixer16' : 'tp_mmb_mixer8';
    p = ensureType(p, bigId);
    const big = freshInstance(p, bigId, sink.id);
    const bigChannels = N > 8 ? 16 : 8;
    const loc = slotOf(p, sink.id);
    p = { ...p, modules: p.modules.map((m) => (m.id === sink.id ? { ...big, name: big.name } : m)) };
    if (loc) p = shiftRow(p, loc.rack.id, loc.slot, big.visual.hpWidth - sink.visual.hpWidth);
    p = withPatch(p, patchId, (x) => ({ ...x, controlState: { ...x.controlState,
      [sink.id]: { ...(x.controlState[sink.id] ?? {}), ...volumes(N, bigChannels) } } }));
    warnings.push(`Mixer vervangen door ${shortName(bigId, p.moduleTypes)} (${bigChannels} kanalen).`);
  }

  // 4. Patch + MIDI-in.
  p = withPatch(p, patchId, (x) => {
    const cs = { ...x.controlState };
    for (const id of ids) {
      const m = p.modules.find((q) => q.id === id);
      const t = m && p.moduleTypes.find((q) => q.id === m.typeId);
      // voiceCount is geen paneelknop maar een firmware-instelling in de
      // controlState (zie seedPolyVoicePatch): altijd meeschrijven.
      if (t && isEventSource(t)) cs[id] = { ...(cs[id] ?? {}), voiceCount: N };
    }
    return { ...x, voiceCount: N, controlState: cs };
  });

  return {
    project: p,
    summary: N === 1
      ? `Terug naar mono: ${chains.length} groepen opgeheven, followers verwijderd.`
      : `${current === 1 ? 'Mono' : `${current}-stemmig`} → ${N}-stemmig: ${chains.length} poly-groepen (${chains.map((c) => c.label).join(', ')}).`,
    warnings,
  };
}

function volumes(n: number, channels: number): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (let ch = 1; ch <= channels; ++ch) { out[`vol${ch}`] = ch <= n ? 0.8 : 0; out[`pan${ch}`] = 0; }
  return out;
}

// ── addBusFx ────────────────────────────────────────────────────────────

export function addBusFx(project: ModularProject, patchId: string, ref: string): EditResult {
  const warnings: string[] = [];
  let p = ensureType(project, resolveOrThrow(ref, seedInternals(project).moduleTypes));
  const typeId = resolveOrThrow(ref, p.moduleTypes);
  const t = typeOf(p, typeId);
  const r = portRoles(t);
  const stereo = !!(r.audioIn.left && r.audioIn.right && r.audioOut.left && r.audioOut.right);
  const mono = !!(r.audioIn.mono && r.audioOut.mono);
  if (!stereo && !mono) throw new RecipeError(`${shortName(typeId, p.moduleTypes)} heeft geen audio in/uit en past niet op de bus.`);

  const patch = patchOf(p, patchId);
  const ids = patchModuleIds(p, patch);
  const out = p.modules.find((m) => ids.has(m.id) && m.typeId === 'tp_mmb_out');
  if (!out) throw new RecipeError('Geen OUT-module in deze patch.');
  const intoL = patch.connections.filter((c) => c.to.moduleId === out.id && c.to.portId === 'l');
  const intoR = patch.connections.filter((c) => c.to.moduleId === out.id && c.to.portId === 'r');
  if (!intoL.length && !intoR.length) throw new RecipeError('Er loopt nog geen kabel naar OUT; eerst iets naar de uitgang patchen.');
  if (intoL.length > 1 || intoR.length > 1) warnings.push('Meerdere kabels naar OUT; ze gaan nu allemaal door het effect.');

  const loc = slotOf(p, out.id)!;
  const left = freshInstance(p, typeId);
  const right = stereo ? null : freshInstance(p, typeId);
  p = placeAtRowEnd(p, loc.rack.id, loc.slot.row, left);
  if (right) p = placeAtRowEnd(p, loc.rack.id, loc.slot.row, right);

  const conn = (from: { moduleId: string; portId: string }, to: { moduleId: string; portId: string }): PatchConnection =>
    ({ id: uid('conn'), from, to });
  const inL  = stereo ? { moduleId: left.id, portId: r.audioIn.left! }  : { moduleId: left.id,   portId: r.audioIn.mono! };
  const inR  = stereo ? { moduleId: left.id, portId: r.audioIn.right! } : { moduleId: right!.id, portId: r.audioIn.mono! };
  const outL = stereo ? { moduleId: left.id, portId: r.audioOut.left! }  : { moduleId: left.id,   portId: r.audioOut.mono! };
  const outR = stereo ? { moduleId: left.id, portId: r.audioOut.right! } : { moduleId: right!.id, portId: r.audioOut.mono! };
  const ctlL = playableControls(t);
  const ctlR = CATALOG[typeId]?.widen ? CATALOG[typeId]!.widen!(ctlL) : { ...ctlL };
  p = withPatch(p, patchId, (x) => ({
    ...x,
    connections: [
      ...x.connections.filter((c) => !(c.to.moduleId === out.id && (c.to.portId === 'l' || c.to.portId === 'r'))),
      ...intoL.map((c) => conn(c.from, inL)),
      ...intoR.map((c) => conn(c.from, inR)),
      conn(outL, { moduleId: out.id, portId: 'l' }),
      conn(outR, { moduleId: out.id, portId: 'r' }),
    ],
    controlState: { ...x.controlState, [left.id]: ctlL, ...(right ? { [right.id]: ctlR } : {}) },
  }));
  return {
    project: p,
    summary: `${shortName(typeId, p.moduleTypes)} op de bus vóór OUT${stereo ? '' : ' (L/R-paar)'}.`,
    warnings,
  };
}

// ── addModulation ───────────────────────────────────────────────────────

export interface ModTarget { moduleId: string; portId: string }

export function addModulation(project: ModularProject, patchId: string, sourceRef: string, target: ModTarget): EditResult {
  const warnings: string[] = [];
  let p = ensureType(project, resolveOrThrow(sourceRef, seedInternals(project).moduleTypes));
  const srcTypeId = resolveOrThrow(sourceRef, p.moduleTypes);
  const srcT = typeOf(p, srcTypeId);
  const srcOut = srcT.ports.find((q) => q.direction === 'out' && q.signalType === 'cv');
  if (!srcOut) throw new RecipeError(`${shortName(srcTypeId, p.moduleTypes)} heeft geen cv-uitgang.`);
  const patch = patchOf(p, patchId);
  const tgt = moduleOf(p, target.moduleId);
  const tport = resolvePorts(tgt, p.moduleTypes).find((q) => q.id === target.portId && q.direction === 'in');
  if (!tport || tport.signalType !== 'cv') throw new RecipeError(`${tgt.name} heeft geen cv-ingang "${target.portId}".`);
  if (patch.connections.some((c) => c.to.moduleId === tgt.id && c.to.portId === target.portId)) {
    warnings.push(`${target.portId} van ${tgt.name} had al een kabel; beide bronnen tellen nu op.`);
  }
  const loc = slotOf(p, tgt.id);
  if (!loc) throw new RecipeError(`${tgt.name} staat niet in een rack.`);

  const gateIn = srcT.ports.find((q) => q.direction === 'in' && q.signalType === 'gate');
  const grp = groupOf(p, tgt.id);
  const perVoice = !!(gateIn && grp && grp.index === 0);
  const conn = (from: { moduleId: string; portId: string }, to: { moduleId: string; portId: string }): PatchConnection =>
    ({ id: uid('conn'), from, to });

  // Bron plaatsen: één globale (LFO) of één per stem (envelope op een master).
  const master = freshInstance(p, srcTypeId);
  const followers: ModuleInstance[] = [];
  p = placeAtRowEnd(p, loc.rack.id, loc.slot.row, master);
  if (perVoice) {
    const mslot = slotOf(p, master.id)!.slot;
    for (let v = 1; v < grp!.group.voiceCount; ++v) {
      const f = freshInstance(p, srcTypeId);
      const slot: RackSlot = { id: uid('slot'), moduleId: f.id, row: mslot.row + v, hpOffset: mslot.hpOffset };
      p = withRack({ ...p, modules: [...p.modules, f] }, loc.rack.id, (r) => ({
        ...r, rows: Math.max(r.rows, slot.row + 1), slots: [...r.slots, slot],
      }));
      followers.push(f);
    }
    p = withRack(p, loc.rack.id, (r) => ({
      ...r,
      polyGroups: [...(r.polyGroups ?? []), {
        id: uid('poly'), label: shortName(srcTypeId, p.moduleTypes), voiceCount: grp!.group.voiceCount,
        members: [master, ...followers].map((m) => ({ kind: 'module' as const, moduleId: m.id })),
      }],
    }));
  }

  // Kabels: bron → doel; bij een gate-bron ook MIDI-gate → bron.
  const extra: PatchConnection[] = [conn({ moduleId: master.id, portId: srcOut.id }, { moduleId: tgt.id, portId: target.portId })];
  if (gateIn) {
    const ids = patchModuleIds(p, patch);
    const mi = p.modules.find((m) => ids.has(m.id) && isEventSource(typeOf(p, m.typeId))
      && resolvePorts(m, p.moduleTypes).some((q) => q.id === 'gate' && q.direction === 'out'));
    if (mi) extra.push(conn({ moduleId: mi.id, portId: 'gate' }, { moduleId: master.id, portId: gateIn.id }));
    else warnings.push('Geen MIDI-in met gate gevonden; de envelope heeft nog geen trigger.');
  }
  const ctl = playableControls(srcT);
  if (srcTypeId === 'tp_mmb_lfo') Object.assign(ctl, { rate: 0.5, wave: 0, depth: 0.5, bipolar: true, run: 0 });
  p = withPatch(p, patchId, (x) => ({
    ...x,
    connections: [...x.connections, ...extra],
    controlState: { ...x.controlState,
      ...Object.fromEntries([master, ...followers].map((m) => [m.id, { ...ctl }])) },
  }));
  return {
    project: p,
    summary: `${shortName(srcTypeId, p.moduleTypes)} → ${tgt.name}.${target.portId}${perVoice ? ` (×${grp!.group.voiceCount}, per stem)` : ''}.`,
    warnings,
  };
}

// ── woorden → modules/poorten (voor commandoregel en LLM) ────────────────

const ROLE_WORDS: Record<string, string[]> = {
  source: ['bron', 'osc', 'oscillator', 'oscillator', 'vco', 'source', 'stemkern', 'de osc'],
  filter: ['filter', 'vcf', 'het filter'],
  vca:    ['vca', 'amp'],
  env:    ['envelope', 'env', 'adsr', 'ahdsr'],
  lfo:    ['lfo'],
  fx:     ['effect', 'fx'],
  mixer:  ['mixer', 'mix'],
  out:    ['out', 'output', 'uitgang'],
};

/**
 * Zoek de module in de patch die bij een woord hoort: een rolwoord
 * ("filter", "osc"), een alias van een type ("ladder", "wavetable") of een
 * modulenaam. Masters van poly-groepen gaan voor followers.
 */
export function findModuleByWord(p: ModularProject, patchId: string, word: string): ModuleInstance | null {
  const patch = patchOf(p, patchId);
  const ids = patchModuleIds(p, patch);
  const candidates = p.modules.filter((m) => ids.has(m.id));
  const isMaster = (m: ModuleInstance) => { const g = groupOf(p, m.id); return !g || g.index === 0; };
  const norm = word.trim().toLowerCase();
  const typeId = resolveTypeId(word, p.moduleTypes);
  if (typeId) {
    const hit = candidates.filter((m) => m.typeId === typeId).sort((a, b) => Number(isMaster(b)) - Number(isMaster(a)))[0];
    if (hit) return hit;
  }
  for (const [kind, words] of Object.entries(ROLE_WORDS)) {
    if (!words.includes(norm)) continue;
    const hit = candidates
      .filter((m) => (CATALOG[m.typeId]?.kind ?? '') === kind)
      .sort((a, b) => Number(isMaster(b)) - Number(isMaster(a)))[0];
    if (hit) return hit;
  }
  return candidates.find((m) => m.name.toLowerCase() === norm) ?? null;
}

const PORT_WORDS: Record<string, string[]> = {
  cv:     ['cutoff', 'cv', 'frequentie', 'frequency', 'freq'],
  tune:   ['tune', 'pitch', 'toonhoogte', 'vibrato', 'stemming'],
  fm:     ['fm'],
  q_cv:   ['q', 'resonance', 'resonantie'],
  rate_cv:['rate', 'snelheid'],
  drive_cv: ['drive'],
  voct:   ['voct', 'v/oct'],
};

/** Zoek een cv-ingang op een module bij een woord ("cutoff" → cv). */
export function findPortByWord(p: ModularProject, m: ModuleInstance, word: string): string | null {
  const ports = resolvePorts(m, p.moduleTypes).filter((q) => q.direction === 'in' && q.signalType === 'cv');
  const norm = word.trim().toLowerCase();
  const direct = ports.find((q) => q.id.toLowerCase() === norm || q.name.toLowerCase() === norm);
  if (direct) return direct.id;
  for (const [id, words] of Object.entries(PORT_WORDS)) {
    if (words.includes(norm) && ports.some((q) => q.id === id)) return id;
  }
  return null;
}
