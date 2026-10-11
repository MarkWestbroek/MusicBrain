// Vingerafdruk van een basisset-patch (publish-basisset.ts): gelijk zolang de
// patch inhoudelijk gelijk is, ook al maakt elke bouw nieuwe willekeurige
// id's. Zonder dat zou elke run alle patches bijwerken, en zet Imprint een
// bijgewerkte patch terug op `voorstel`.

import { createHash } from 'node:crypto';

import type { ModularProject } from '../../editor/src/modular-mb/types';
import { slimSnapshot } from '../../editor/src/modular-mb/sim/midiRecorder';

/** Vingerafdruk van de inhoud: de patch met zijn eigen modules, de door de
 *  bouw gemaakte id's vervangen door volgnummers (eerste voorkomen). */
export function contentHash(snap: ModularProject): string {
  const slim = slimSnapshot(snap);
  const patch = slim.patches[0]!;
  const ids = new Set<string>([patch.id]);
  for (const r of slim.racks) { ids.add(r.id); for (const sl of r.slots) ids.add(sl.id); for (const g of r.polyGroups ?? []) ids.add(g.id); }
  for (const m of slim.modules) ids.add(m.id);
  for (const c of patch.connections) ids.add(c.id);
  for (const f of patch.fronts ?? []) ids.add(f.id);
  const order = new Map<string, string>();
  const text = JSON.stringify({ ...slim, activePatchId: undefined, activeRackId: undefined, name: undefined })
    .replace(/"([^"\\]+)"/g, (all, v: string) => {
      if (!ids.has(v)) return all;
      if (!order.has(v)) order.set(v, `#${order.size + 1}`);
      return `"${order.get(v)}"`;
    });
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

