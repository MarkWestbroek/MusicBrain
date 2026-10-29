// Patch-plugins: een hele patch uit de catalogus als één AU/VST3
// (tools/plugin/src/PatchPlugin.h, doc/plans/plugin-patches.md §5).
//
//   npx tsx scripts/pluginPatches.ts      # → tools/plugin/generated/*_patch_plugin.cpp + patches.cmake
//
// Per patch:
//  - de JSON die de Teensy krijgt (buildConfigPayload: poly-groepen
//    uitgevouwen, alle knoppen erbij), ingebakken in de plugin;
//  - de wasm2c-modules die erin voorkomen (W2CMODS), met een fabriek
//    typeId → functietabel;
//  - parameters = de knoppen van het eerste front van de patch; een knop op
//    een stem gaat naar alle stemmen van zijn poly-groep (polyControlTargets,
//    zoals setPatchControl).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATCH_CATALOG } from '../src/modular-mb/patchCatalog';
import { polyControlTargets } from '../src/modular-mb/polyExpand';
import { seedInternals } from '../src/modular-mb/seedModules';
import { buildConfigPayload } from '../src/modular-mb/teensyLink';
import { emptyModularProject } from '../src/modular-mb/types';
import { spec } from './pluginParams';

/** Welke patches een plugin worden. Code: vier tekens, uniek onder de MMB-plugins (P = patch). */
const PATCHES: { label: string; target: string; code: string; product: string }[] = [
  { label: '8-stemmig', target: 'MmbPatchPoly8', code: 'Pp8v', product: 'MMB Poly 8' },
  { label: '🎺 CS-80 koper (aftertouch)', target: 'MmbPatchCs80', code: 'Pcs8', product: 'MMB CS-80 Brass' },
];

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'tools', 'plugin', 'generated');
const wasmPublic = path.join(repo, 'editor', 'public', 'wasm');
const NATIVE = new Set(['tp_mmb_mixer8', 'tp_mmb_out']);   // PatchEngine.h doet die zelf

const cstr = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
/** Modulenaam voor wasm2c: letters en cijfers (wasm2c verdubbelt een underscore). */
const w2cName = (typeId: string) => typeId.replace(/^tp_mmb_/, '').replace(/[^a-z0-9]/g, '');

function main(): void {
  fs.mkdirSync(outDir, { recursive: true });
  const cmake = ['# Gegenereerd door editor/scripts/pluginPatches.ts; niet met de hand wijzigen.'];
  for (const p of PATCHES) {
    const entry = PATCH_CATALOG.find((e) => e.label === p.label);
    if (!entry) throw new Error(`geen seed "${p.label}" in patchCatalog.ts`);
    const project = entry.build(seedInternals(emptyModularProject()));
    const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
    const { json } = buildConfigPayload(project, { activeOnly: true });
    const config = JSON.parse(json) as { project: { modules: { id: string; typeId: string }[] } };

    const types = [...new Set(config.project.modules.map((m) => m.typeId))].filter((t) => !NATIVE.has(t)).sort();
    const missing = types.filter((t) => !fs.existsSync(path.join(wasmPublic, `${t}.wasm`)));
    if (missing.length) console.warn(`${p.label}: geen wasm voor ${missing.join(', ')} (die modules vallen weg)`);
    const mods = types.filter((t) => !missing.includes(t));

    // Parameters uit het eerste front.
    const rows: string[] = [];
    const targets: string[] = [];
    for (const it of patch.fronts?.[0]?.items ?? []) {
      if (it.kind !== 'control') continue;
      const mod = project.modules.find((m) => m.id === it.moduleId);
      const type = project.moduleTypes.find((t) => t.id === mod?.typeId);
      const c = type?.controls.find((x) => x.id === it.controlId);
      if (!c) continue;
      const row = spec({ ...c, defaultValue: (patch.controlState[it.moduleId]?.[it.controlId] ?? (c as { defaultValue?: unknown }).defaultValue) } as typeof c);
      if (!row) continue;
      const id = `p${rows.length}`;
      const label = it.label ?? ('label' in c && c.label ? c.label : c.id);
      // spec() begint met { "<control-id>", "<naam>", …: id en naam vervangen.
      rows.push(row.replace(/^\{ "(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*"/, `{ ${cstr(id)}, ${cstr(label)}`));
      const to = polyControlTargets(patch, project, it.moduleId).map((m) => `{ ${cstr(m)}, ${cstr(it.controlId)} }`);
      targets.push(`        { ${to.join(', ')} },`);
    }

    const slug = p.target.replace(/^Mmb/, '').toLowerCase();
    const sym = slug.replace(/[^a-z0-9]/g, '_');
    const bytes = [...Buffer.from(json, 'utf8')];
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 32) lines.push('    ' + bytes.slice(i, i + 32).join(',') + ',');
    fs.writeFileSync(path.join(outDir, `${slug}_patch_plugin.cpp`), [
      `// Gegenereerd door editor/scripts/pluginPatches.ts uit de seed "${p.label}"; niet met de hand wijzigen.`,
      '#include "PatchPlugin.h"',
      ...mods.map((t) => `#include "${w2cName(t)}_vt.h"`),
      '',
      'namespace mmb_plugin {',
      `static const char kJson_${sym}[] = {`,
      ...lines,
      '    0 };',
      'const char* patchJson() { return kJson_' + sym + '; }',
      'const W2cVtable* patchModule(const std::string& t) {',
      ...mods.map((t) => `    if (t == ${cstr(t)}) return &kW2c_${w2cName(t)};`),
      '    return nullptr;',
      '}',
      'const std::vector<std::vector<std::pair<std::string, std::string>>>& patchParamTargets() {',
      '    static const std::vector<std::vector<std::pair<std::string, std::string>>> t = {',
      ...targets,
      '    };',
      '    return t;',
      '}',
      ...(rows.length
        ? [`inline constexpr ParamSpec kParams_${sym}[] = {`, ...rows.map((r) => `    ${r},`), '};']
        : []),
      `inline constexpr ModuleSpec kModule_${sym} { ${cstr('patch_' + sym)}, ${cstr(p.product.replace(/^MMB /, ''))}, 40, ${rows.length ? `kParams_${sym}` : 'nullptr'}, ${rows.length} };`,
      '}  // namespace mmb_plugin',
      '',
      `juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::PatchProcessor(mmb_plugin::kModule_${sym}, true); }`,
      '',
    ].join('\n'));
    const w2c = mods.map((t) => `${w2cName(t)} ${cstr(path.join(wasmPublic, `${t}.wasm`).split(path.sep).join('/'))}`).join(' ');
    cmake.push(`mmb_add_module(${p.target} ${p.code} "${p.product}" TRUE \${MMB_GENERATED_DIR}/${slug}_patch_plugin.cpp CATEGORIES Instrument Synth W2CMODS ${w2c})`);
    console.log(`${p.label} → ${p.target}: ${config.project.modules.length} modules (${mods.length} soorten wasm), ${rows.length} parameters, JSON ${(json.length / 1024).toFixed(1)} KB`);
  }
  fs.writeFileSync(path.join(outDir, 'patches.cmake'), cmake.join('\n') + '\n');
}

main();
