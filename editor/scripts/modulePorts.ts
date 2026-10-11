// Poorten (richting, soort) en standaard-knopstanden per moduletype, als JSON
// op stdout. Voor scripts buiten de editor die een config moeten bouwen,
// zoals tools/teensy-live/module_cpu.py (rekentijd per module op de Teensy).
//
//   npx tsx scripts/modulePorts.ts [tp_mmb_… …]    # zonder argumenten: alle typen

import { seedInternals } from '../src/modular-mb/seedModules';
import { defaultValueOf, emptyModularProject, resolveControls, resolvePorts } from '../src/modular-mb/types';

const base = seedInternals(emptyModularProject());
const want = process.argv.slice(2);
const out: Record<string, { ports: [string, string, string][]; defaults: Record<string, number | boolean> }> = {};
for (const m of base.modules) {
  if (want.length && !want.includes(m.typeId)) continue;
  if (out[m.typeId]) continue;
  const defaults: Record<string, number | boolean> = {};
  for (const c of resolveControls(m, base.moduleTypes)) {
    if (c.kind === 'display' || c.kind === 'led' || c.kind === 'joystick' || c.id === 'voiceCount') continue;
    const v = defaultValueOf(c);
    if (typeof v === 'number' || typeof v === 'boolean') defaults[c.id] = v;
  }
  out[m.typeId] = { ports: resolvePorts(m, base.moduleTypes).map((p) => [p.id, p.direction, p.signalType]), defaults };
}
process.stdout.write(JSON.stringify(out));
