// Een seed uit de patchcatalogus als de JSON die de Teensy krijgt
// (buildConfigPayload in teensyLink.ts: poly-groepen uitgevouwen, alle
// knoppen erbij). De patch-plugin (tools/plugin, doc/plans/plugin-patches.md
// §5) draait precies dit formaat.
//
//   npx tsx scripts/exportPatch.ts "<label uit patchCatalog.ts>" <uit.json>
//   npx tsx scripts/exportPatch.ts --list
import fs from 'node:fs';

import { PATCH_CATALOG } from '../src/modular-mb/patchCatalog';
import { seedInternals } from '../src/modular-mb/seedModules';
import { buildConfigPayload } from '../src/modular-mb/teensyLink';
import { emptyModularProject } from '../src/modular-mb/types';

const [label, out] = process.argv.slice(2);
if (label === '--list' || !label || !out) {
  for (const e of PATCH_CATALOG) console.log(`${e.menu.padEnd(9)} ${e.label}`);
  if (label !== '--list') process.exitCode = 1;
} else {
  const entry = PATCH_CATALOG.find((e) => e.label === label);
  if (!entry) throw new Error(`geen seed "${label}" (--list toont ze)`);
  const project = entry.build(seedInternals(emptyModularProject()));
  const { json, modules } = buildConfigPayload(project, { activeOnly: true });
  fs.writeFileSync(out, json);
  console.log(`${label}: ${modules} modules, ${(json.length / 1024).toFixed(1)} KB → ${out}`);
}
