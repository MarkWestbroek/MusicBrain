// MMB Patch zonder venster testen: schrijft voor een patch uit de catalogus
// wat de bediening naar de plugin stuurt (GenericPatch.h), als JSON
// { config, ui, name }. MmbPluginCheck zet het met patchstate=<bestand> in de
// toestand van de plugin, zoals een project dat doet.
//
//   npx tsx scripts/patchConfigDump.ts "<label uit patchCatalog.ts>" <uit.json>
import fs from 'node:fs';

import { PATCH_CATALOG } from '../src/modular-mb/patchCatalog';
import { PATCH_SLOTS, patchPluginConfig, slimProject } from '../src/modular-mb/patchPluginConfig';
import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject } from '../src/modular-mb/types';

const [label, out] = process.argv.slice(2);
const entry = PATCH_CATALOG.find((e) => e.label === label);
if (!entry || !out) {
  console.error(`gebruik: patchConfigDump.ts "<label>" <uit.json>\nlabels: ${PATCH_CATALOG.map((e) => e.label).join(' | ')}`);
  process.exit(2);
}
const project = entry.build(seedInternals(emptyModularProject()));
const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
const cfg = patchPluginConfig(project, patch);
const config = JSON.stringify({ json: cfg.json, slots: cfg.slots.slice(0, PATCH_SLOTS).map((x) => ({ label: x.label, targets: x.targets, spec: x.spec })) });
fs.writeFileSync(out, JSON.stringify({ config, ui: JSON.stringify(slimProject(project, patch)), name: entry.label }));
console.log(`${entry.label}: ${cfg.modules} modules, ${cfg.slots.length} knoppen → ${out}`);
