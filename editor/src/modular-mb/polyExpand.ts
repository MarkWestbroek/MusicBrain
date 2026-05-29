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

/** Split a port id into a `{ base, num }` pair when it ends in digits
 *  (e.g. `"in1"` → `{ base: "in", num: 1 }`). Returns null otherwise. */
function splitNumberedPort(portId: string): { base: string; num: number } | null {
  const m = /^(.*?)(\d+)$/.exec(portId);
  if (!m) return null;
  return { base: m[1]!, num: Number(m[2]) };
}

/** Is `portId` an output port flagged `eventKind: 'voice'` on `mod`'s type?
 *  These (MIDI-In pitch/gate/vel) expand to per-voice indexed ports. */
function isVoiceEventPort(
  mod: ModuleInstance, portId: string, types: ModuleType[],
): boolean {
  const port = resolvePorts(mod, types).find((p) => p.id === portId);
  return !!port && port.direction === 'out' && port.eventKind === 'voice';
}

/** Build a moduleId → VoiceRef map for the rack-level PolyGroups visible to
 *  a patch (the patch's `rackIds`). Patch-local poly overrides are not yet
 *  applied (ADR 0011 open question). */
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
  const voiceMap = buildVoiceMap(patch, project);
  if (voiceMap.size === 0) return patch.connections;  // mono patch — nothing to do.

  const types = project.moduleTypes;
  const modById = new Map(project.modules.map((m) => [m.id, m]));
  const out: PatchConnection[] = [];

  for (const c of patch.connections) {
    const srcMod = modById.get(c.from.moduleId);
    const dstMod = modById.get(c.to.moduleId);
    if (!srcMod || !dstMod) { out.push(c); continue; }   // dangling — keep as-is.

    const sv = voiceMap.get(c.from.moduleId);
    const dv = voiceMap.get(c.to.moduleId);

    // Pass through cables that touch a follower directly: in the editing model
    // followers have no cables, so such a cable is already voice-specific.
    if ((sv && sv.voiceIndex > 0) || (dv && dv.voiceIndex > 0)) { out.push(c); continue; }

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
    if (!sv && dv) {
      const N = dv.group.voiceCount;
      const voiceEvent = isVoiceEventPort(srcMod, c.from.portId, types);
      for (let v = 0; v < N; ++v) {
        const member = dv.group.members[v];
        if (!member || member.kind !== 'module') continue;
        const fromPort = voiceEvent ? `${c.from.portId}${v + 1}` : c.from.portId;
        emit(v, c.from.moduleId, fromPort, member.moduleId, c.to.portId);
      }
      continue;
    }

    // ── group → global : voice-indexed sink, or sum ──────────────────
    if (sv && !dv) {
      const N = sv.group.voiceCount;
      const numbered = splitNumberedPort(c.to.portId);
      for (let v = 0; v < N; ++v) {
        const member = sv.group.members[v];
        if (!member || member.kind !== 'module') continue;
        const toPort = numbered ? `${numbered.base}${numbered.num + v}` : c.to.portId;
        emit(v, member.moduleId, c.from.portId, c.to.moduleId, toPort);
      }
      continue;
    }

    // ── group → group : voice v → voice v ─────────────────────────────
    if (sv && dv) {
      const N = sv.group.voiceCount;
      if (dv.group.voiceCount !== N) {
        // Voice-count mismatch between linked groups — not expandable safely.
        // Keep the master cable so at least voice 1 is wired, and warn.
        console.warn(
          `[polyExpand] voiceCount mismatch ${sv.group.label}(${N}) → ` +
          `${dv.group.label}(${dv.group.voiceCount}); cable ${c.id} not expanded.`,
        );
        out.push(c);
        continue;
      }
      for (let v = 0; v < N; ++v) {
        const sm = sv.group.members[v];
        const dm = dv.group.members[v];
        if (!sm || sm.kind !== 'module' || !dm || dm.kind !== 'module') continue;
        emit(v, sm.moduleId, c.from.portId, dm.moduleId, c.to.portId);
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
