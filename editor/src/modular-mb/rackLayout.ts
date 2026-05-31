// Rack layout helpers — pure functions that reflow a rack's slots.
//
// `compactRack` removes horizontal gaps left behind when poly voice-groups
// are collapsed: masters (voice 1) + non-grouped modules go to row 0, and
// each follower voice `k` is parked in row `k`, aligned under its master.
// For racks without poly groups it falls back to a simple per-row left-pack.

import type { Rack, RackSlot, ModuleInstance } from './types';

/** Width (in HP) of the module behind a slot, or 0 when unknown. */
function hpWidthOf(moduleId: string, modules: ModuleInstance[]): number {
  return modules.find((m) => m.id === moduleId)?.visual.hpWidth ?? 0;
}

/**
 * Reflow @p rack so there are no horizontal gaps.
 *
 * - **No poly groups:** every row is independently left-packed in
 *   ascending `hpOffset` order.
 * - **With poly groups:** a grid is produced — row 0 holds the masters
 *   (member index 0) plus all non-grouped modules, packed left; every
 *   follower (member index `k ≥ 1`) is placed in row `k` at the same
 *   column (`hpOffset`) as its group's master. This collapses the long
 *   single-row strip into a compact N-row block so the patcher's
 *   collapsed view no longer shows a giant gap before the mixer/out.
 *
 * Returns a new `Rack`; the input is not mutated.
 */
export function compactRack(rack: Rack, modules: ModuleInstance[]): Rack {
  const groups = rack.polyGroups ?? [];
  const hasGroups = groups.some((g) => g.members.length > 1);

  if (!hasGroups) {
    const slots = rack.slots.slice();
    for (let row = 0; row < Math.max(1, rack.rows); ++row) {
      const entries = slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.row === row)
        .sort((a, b) => a.s.hpOffset - b.s.hpOffset);
      let off = 0;
      for (const { i, s } of entries) {
        slots[i] = { ...s, hpOffset: off };
        off += hpWidthOf(s.moduleId, modules);
      }
    }
    return { ...rack, slots };
  }

  // voiceIndex per module (0 = master); module → its group id; group → master.
  const voiceIdx = new Map<string, number>();
  const groupOfModule = new Map<string, string>();
  const masterOfGroup = new Map<string, string>();
  for (const g of groups) {
    g.members.forEach((mem, i) => {
      if (mem.kind !== 'module') return;
      voiceIdx.set(mem.moduleId, i);
      groupOfModule.set(mem.moduleId, g.id);
      if (i === 0) masterOfGroup.set(g.id, mem.moduleId);
    });
  }

  // Column order = row-0 representatives (masters + non-grouped) by hpOffset.
  const reps = rack.slots
    .filter((s) => (voiceIdx.get(s.moduleId) ?? 0) === 0)
    .sort((a, b) => a.hpOffset - b.hpOffset);

  const colOffset = new Map<string, number>();
  let off = 0;
  for (const s of reps) {
    colOffset.set(s.moduleId, off);
    off += hpWidthOf(s.moduleId, modules);
  }
  const rowWidth = off;

  const newSlots: RackSlot[] = rack.slots.map((s) => {
    const vi = voiceIdx.get(s.moduleId) ?? 0;
    if (vi === 0) {
      return { ...s, row: 0, hpOffset: colOffset.get(s.moduleId) ?? 0 };
    }
    const gid = groupOfModule.get(s.moduleId);
    const masterId = gid ? masterOfGroup.get(gid) : undefined;
    const col = masterId ? (colOffset.get(masterId) ?? 0) : 0;
    return { ...s, row: vi, hpOffset: col };
  });

  const maxVoice = Math.max(0, ...groups.map((g) => g.members.length - 1));
  return {
    ...rack,
    rows: Math.max(rack.rows, maxVoice + 1),
    hpPerRow: Math.max(rack.hpPerRow, rowWidth + 4),
    slots: newSlots,
  };
}
