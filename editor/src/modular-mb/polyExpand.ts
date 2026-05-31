// Poly-group expansion (ADR 0010 §3 / ADR 0011) — compile-time "flatten".
//
// The editor lets the user patch ONE voice and mark a set of rack modules as
// the voices of a PolyGroup (×N). Cables are drawn only between *masters*
// (members[0]) and *global* modules; followers (members[1..]) are hidden in
// the patcher. This module expands those master-only cables into the real
// per-voice connection list the firmware runs — the brain stays "dumb" and
// only ever sees a flat module + connection graph (ADR 0009/0010).
//
// Expansion rules (ADR 0010 §3 "Connection expansion"), where N = voiceCount:
//   global → group   : fan-out. For a *voice-event* source port (eventKind
//                      'voice', e.g. MIDI-In pitch/gate/vel) the per-voice
//                      output port `pitchK` (1-based) drives voice K; for a
//                      plain global signal (e.g. a shared LFO) the same source
//                      port fans out to every voice.
//   group  → group   : voice v of source → voice v of sink (same N).
//   group  → global  : voice-indexed when the sink port ends in a number
//                      (e.g. mixer `in1` → `in1`,`in2`,…); otherwise summed
//                      onto the same port.
//   global → global  : unchanged.
//
// Followers carry no cables of their own, so connections touching a follower
// directly are passed through unchanged (already voice-specific).

import {
  type ModularProject, type Patch, type PatchConnection,
  type PolyGroup, type ModuleInstance, type ModuleType,
  resolvePorts,
} from './types';

/** A module's poly membership: which group it belongs to + its voice index. */
interface VoiceRef { group: PolyGroup; voiceIndex: number; }

/** A cell-group on a multi-module that is the target of a PolyGroup whose
 *  members are cells. Keyed by `${moduleId}:${cellGroupId}`. */
interface CellGroupRef {
  group: PolyGroup;
  /** 0-based index (into `group.members`) that is the master cell. Always 0
   *  by construction, but kept explicit for clarity. */
  masterMemberIdx: number;
}

/** Resolved view of one cable endpoint for poly-expansion. */
type Endpoint =
  | { kind: 'global' }
  | { kind: 'module'; group: PolyGroup }            // whole-module poly master
  | { kind: 'cell';   group: PolyGroup; basePort: string }  // master cell port
  | { kind: 'follower' };                           // already voice-specific

/** Split a port id into a `{ base, num }` pair when it ends in digits
 *  (e.g. `"in1"` → `{ base: "in", num: 1 }`). Returns null otherwise. */
function splitNumberedPort(portId: string): { base: string; num: number } | null {
  const m = /^(.*?)(\d+)$/.exec(portId);
  if (!m) return null;
  return { base: m[1]!, num: Number(m[2]) };
}

/** Given a port id on a multi-module, find the cell-group it belongs to and
 *  its 0-based cell index. Cell ports follow the `<basePort>_<index>` (1-based)
 *  convention; `basePort` must be listed in a `cellGroup.portIds`. */
function cellPortInfo(
  mod: ModuleInstance, portId: string, types: ModuleType[],
): { cellGroupId: string; basePort: string; cellIndex0: number } | null {
  const type = types.find((t) => t.id === mod.typeId);
  if (!type?.cellGroups?.length) return null;
  const us = portId.lastIndexOf('_');
  if (us < 0) return null;
  const basePort = portId.slice(0, us);
  const idxStr = portId.slice(us + 1);
  if (!/^\d+$/.test(idxStr)) return null;
  const oneBased = Number(idxStr);
  for (const cg of type.cellGroups) {
    if (cg.portIds.includes(basePort)) {
      return { cellGroupId: cg.id, basePort, cellIndex0: oneBased - 1 };
    }
  }
  return null;
}

/** Is `portId` an output port flagged `eventKind: 'voice'` on `mod`'s type?
 *  These (MIDI-In pitch/gate/vel) expand to per-voice indexed ports. */
function isVoiceEventPort(
  mod: ModuleInstance, portId: string, types: ModuleType[],
): boolean {
  const port = resolvePorts(mod, types).find((p) => p.id === portId);
  return !!port && port.direction === 'out' && port.eventKind === 'voice';
}

/** Build a moduleId → VoiceRef map for the whole-module PolyGroup members
 *  visible to a patch (the patch's `rackIds`). */
function buildVoiceMap(patch: Patch, project: ModularProject): Map<string, VoiceRef> {
  const map = new Map<string, VoiceRef>();
  const rackIds = new Set(patch.rackIds);
  for (const r of project.racks) {
    if (!rackIds.has(r.id)) continue;
    for (const g of r.polyGroups ?? []) {
      g.members.forEach((mem, idx) => {
        if (mem.kind === 'module') map.set(mem.moduleId, { group: g, voiceIndex: idx });
      });
    }
  }
  return map;
}

/** Build a `${moduleId}:${cellGroupId}` → CellGroupRef map for the cell-based
 *  PolyGroups visible to a patch. A group counts as cell-based when its
 *  members are `kind:'cell'`. All cell members of one group share the same
 *  `(moduleId, cellGroupId)`; their `cellIndex` picks the per-voice cell. */
function buildCellGroupMap(patch: Patch, project: ModularProject): Map<string, CellGroupRef> {
  const map = new Map<string, CellGroupRef>();
  const rackIds = new Set(patch.rackIds);
  for (const r of project.racks) {
    if (!rackIds.has(r.id)) continue;
    for (const g of r.polyGroups ?? []) {
      const master = g.members[0];
      if (!master || master.kind !== 'cell') continue;
      map.set(`${master.moduleId}:${master.cellGroupId}`, { group: g, masterMemberIdx: 0 });
    }
  }
  return map;
}


/**
 * Expand a single patch's master-only connection list into the flat,
 * per-voice connection list the firmware runs.
 *
 * @returns a new connection array (the input is not mutated). Connection ids
 *          are suffixed `#vK` (K = 0-based voice) for traceability.
 */
export function expandPatchConnections(
  patch: Patch, project: ModularProject,
): PatchConnection[] {
  const voiceMap     = buildVoiceMap(patch, project);
  const cellGroupMap = buildCellGroupMap(patch, project);
  if (voiceMap.size === 0 && cellGroupMap.size === 0) {
    return patch.connections;                     // mono patch — nothing to do.
  }

  const types = project.moduleTypes;
  const modById = new Map(project.modules.map((m) => [m.id, m]));
  const out: PatchConnection[] = [];

  // Resolve a cable endpoint into one of: global / whole-module poly master /
  // master-cell port / follower (already voice-specific → pass through).
  const resolve = (mod: ModuleInstance, portId: string): Endpoint => {
    const vr = voiceMap.get(mod.id);
    if (vr) return vr.voiceIndex === 0 ? { kind: 'module', group: vr.group } : { kind: 'follower' };

    const ci = cellPortInfo(mod, portId, types);
    if (ci) {
      const ref = cellGroupMap.get(`${mod.id}:${ci.cellGroupId}`);
      if (ref) {
        const master = ref.group.members[ref.masterMemberIdx];
        const masterIdx0 = master && master.kind === 'cell' ? master.cellIndex : 0;
        return ci.cellIndex0 === masterIdx0
          ? { kind: 'cell', group: ref.group, basePort: ci.basePort }
          : { kind: 'follower' };                 // a non-master cell port.
      }
    }
    return { kind: 'global' };
  };

  // Per-voice (moduleId, portId) for a resolved poly endpoint. `original`
  // is the master cable's endpoint (used for whole-module members, which keep
  // the port id unchanged). Returns null when the member slot is empty.
  const portAt = (
    ep: Endpoint, original: { moduleId: string; portId: string }, v: number,
  ): { moduleId: string; portId: string } | null => {
    if (ep.kind === 'module') {
      const mem = ep.group.members[v];
      if (!mem || mem.kind !== 'module') return null;
      return { moduleId: mem.moduleId, portId: original.portId };
    }
    if (ep.kind === 'cell') {
      const mem = ep.group.members[v];
      if (!mem || mem.kind !== 'cell') return null;
      return { moduleId: mem.moduleId, portId: `${ep.basePort}_${mem.cellIndex + 1}` };
    }
    return null;
  };

  const groupOf = (ep: Endpoint): PolyGroup | null =>
    (ep.kind === 'module' || ep.kind === 'cell') ? ep.group : null;

  for (const c of patch.connections) {
    const srcMod = modById.get(c.from.moduleId);
    const dstMod = modById.get(c.to.moduleId);
    if (!srcMod || !dstMod) { out.push(c); continue; }   // dangling — keep as-is.

    const se = resolve(srcMod, c.from.portId);
    const de = resolve(dstMod, c.to.portId);

    // Cables that touch a follower directly are already voice-specific.
    if (se.kind === 'follower' || de.kind === 'follower') { out.push(c); continue; }

    const srcGroup = groupOf(se);
    const dstGroup = groupOf(de);

    const emit = (
      v: number, fromId: string, fromPort: string, toId: string, toPort: string,
    ): void => {
      out.push({
        ...c,
        id: `${c.id}#v${v}`,
        from: { moduleId: fromId, portId: fromPort },
        to:   { moduleId: toId,   portId: toPort },
      });
    };

    // ── global → group : fan-out ──────────────────────────────────────
    if (!srcGroup && dstGroup) {
      const N = dstGroup.voiceCount;
      const voiceEvent = isVoiceEventPort(srcMod, c.from.portId, types);
      for (let v = 0; v < N; ++v) {
        const dst = portAt(de, c.to, v);
        if (!dst) continue;
        const fromPort = voiceEvent ? `${c.from.portId}${v + 1}` : c.from.portId;
        emit(v, c.from.moduleId, fromPort, dst.moduleId, dst.portId);
      }
      continue;
    }

    // ── group → global : voice-indexed sink, or sum ──────────────────
    if (srcGroup && !dstGroup) {
      const N = srcGroup.voiceCount;
      const numbered = splitNumberedPort(c.to.portId);
      for (let v = 0; v < N; ++v) {
        const src = portAt(se, c.from, v);
        if (!src) continue;
        const toPort = numbered ? `${numbered.base}${numbered.num + v}` : c.to.portId;
        emit(v, src.moduleId, src.portId, c.to.moduleId, toPort);
      }
      continue;
    }

    // ── group → group : voice v → voice v ─────────────────────────────
    if (srcGroup && dstGroup) {
      const N = srcGroup.voiceCount;
      if (dstGroup.voiceCount !== N) {
        // Voice-count mismatch between linked groups — not expandable safely.
        // Keep the master cable so at least voice 1 is wired, and warn.
        console.warn(
          `[polyExpand] voiceCount mismatch ${srcGroup.label}(${N}) → ` +
          `${dstGroup.label}(${dstGroup.voiceCount}); cable ${c.id} not expanded.`,
        );
        out.push(c);
        continue;
      }
      for (let v = 0; v < N; ++v) {
        const src = portAt(se, c.from, v);
        const dst = portAt(de, c.to, v);
        if (!src || !dst) continue;
        emit(v, src.moduleId, src.portId, dst.moduleId, dst.portId);
      }
      continue;
    }

    // ── global → global : unchanged ───────────────────────────────────
    out.push(c);
  }

  return out;
}


/**
 * Return a shallow project clone whose every patch carries the *expanded*
 * (per-voice) connection list. Used by the Teensy link just before pushing
 * config so the firmware receives the already-flattened graph.
 */
export function flattenProjectForFirmware(project: ModularProject): ModularProject {
  return {
    ...project,
    patches: project.patches.map((p) => ({
      ...p,
      connections: expandPatchConnections(p, project),
    })),
  };
}
