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
//  - parameters = alle knoppen van de patch (per poly-groep één keer; de
//    fronts eerst), met een vast id (patchPlugins.ts); een knop op een stem
//    gaat naar alle stemmen van zijn poly-groep (polyControlTargets, zoals
//    setPatchControl);
//  - per effecttype de bypass-route uit bypassRoute.ts ("bypass" naast
//    "project" in de JSON, PatchEngine.h); elk effect dat op een front staat, krijgt er een
//    parameter "<label> bypass" bij (de pseudo-knop `__bypass`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATCH_CATALOG } from '../src/modular-mb/patchCatalog';
import { PATCH_PLUGINS, patchPluginTypeId, pluginPanelSize, pluginParams } from '../src/modular-mb/patchPlugins';
import { PATCH_SLOTS, patchPluginConfig } from '../src/modular-mb/patchPluginConfig';
import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject } from '../src/modular-mb/types';
import { spec } from './pluginParams';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'tools', 'plugin', 'generated');
const wasmPublic = path.join(repo, 'editor', 'public', 'wasm');
const NATIVE = new Set(['tp_mmb_mixer', 'tp_mmb_mixer8', 'tp_mmb_mixer16', 'tp_mmb_out']);   // PatchEngine.h doet die zelf

const cstr = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
/** Modulenaam voor wasm2c: letters en cijfers (wasm2c verdubbelt een underscore). */
const w2cName = (typeId: string) => typeId.replace(/^tp_mmb_/, '').replace(/[^a-z0-9]/g, '');

function main(): void {
  fs.mkdirSync(outDir, { recursive: true });
  const cmake = ['# Gegenereerd door editor/scripts/pluginPatches.ts; niet met de hand wijzigen.'];
  for (const p of PATCH_PLUGINS) {
    const entry = PATCH_CATALOG.find((e) => e.label === p.label);
    if (!entry) throw new Error(`geen seed "${p.label}" in patchCatalog.ts`);
    const project = entry.build(seedInternals(emptyModularProject()));
    const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
    const cfg = patchPluginConfig(project, patch);   // dezelfde motor-JSON als MMB Patch maakt
    const json = cfg.json;
    const config = JSON.parse(json) as { project: { modules: { id: string; typeId: string }[] } };

    const types = [...new Set(config.project.modules.map((m) => m.typeId))].filter((t) => !NATIVE.has(t)).sort();
    const missing = types.filter((t) => !fs.existsSync(path.join(wasmPublic, `${t}.wasm`)));
    if (missing.length) console.warn(`${p.label}: geen wasm voor ${missing.join(', ')} (die modules vallen weg)`);
    const mods = types.filter((t) => !missing.includes(t));

    // Parameters: de knoppen van de fronts, met een bypass per effect (patchPlugins.ts).
    const rows: string[] = [];
    const targets: string[] = [];
    const params = pluginParams(project, patch);
    for (const it of params) {
      const c = it.control;
      // De beginstand is die van de patch; een keuzeknop draagt hem in defaultIndex.
      const state = patch.controlState[it.moduleId]?.[it.controlId];
      const row = spec((c.kind === 'switch'
        ? { ...c, defaultIndex: typeof state === 'number' ? state : c.defaultIndex }
        : { ...c, defaultValue: state ?? (c as { defaultValue?: unknown }).defaultValue }) as typeof c);
      if (!row) throw new Error(`${p.label}: ${it.controlId} kan geen parameter zijn`);
      // spec() begint met { "<control-id>", "<naam>", …: id en naam vervangen.
      rows.push(row.replace(/^\{ "(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*"/, `{ ${cstr(it.id)}, ${cstr(it.label)}`));
      const slot = cfg.slots.find((x) => x.id === it.id)!;
      const to = slot.targets.map(([m, c2]) => `{ ${cstr(m)}, ${cstr(c2)} }`);
      targets.push(`        { ${to.join(', ')} },`);
    }
    // Het venster: het grootste front plus de tabbalk (MmbWebEditor rekent in mm).
    const size = pluginPanelSize(project, patch);

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
      'int patchParamIndex(const char* id) {',
      '    static const char* const ids[] = {',
      ...params.map((x) => `        ${cstr(x.id)},`),
      '    };',
      '    for (int i = 0; i < static_cast<int>(sizeof(ids) / sizeof(ids[0])); ++i) if (std::strcmp(ids[i], id) == 0) return i;',
      '    return -1;',
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
      `inline constexpr ModuleSpec kModule_${sym} { ${cstr(patchPluginTypeId(p.target))}, ${cstr(p.product.replace(/^MMB /, ''))}, ${Math.ceil(size.widthMm / 5.08)}, ${rows.length ? `kParams_${sym}` : 'nullptr'}, ${rows.length}, nullptr, 0, ${size.widthMm.toFixed(1)}f, ${size.heightMm.toFixed(1)}f };`,
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
  writeGeneric();
}

/**
 * MMB Patch: één plugin voor elke patch (plugin-patches.md §5, stap 4). Alle
 * wasm-modules zitten erin; de patch kiest de bediening (plugin-ui) en komt
 * als motor-JSON binnen (GenericPatch.h). Parameters: PATCH_SLOTS slots.
 */
function writeGeneric(): void {
  const mods = fs.readdirSync(wasmPublic).filter((f) => f.endsWith('.wasm')).map((f) => f.replace(/\.wasm$/, ''))
    .filter((t) => t.startsWith('tp_mmb_') && !NATIVE.has(t)).sort();
  // Met voorvoegsel: een module "string" gaf string.h in de include-map, en die
  // overschaduwde de systeemheader.
  const gname = (t: string) => `m${w2cName(t)}`;
  const names = new Set<string>();
  for (const t of mods) {
    if (names.has(gname(t))) throw new Error(`wasm2c-naam ${gname(t)} dubbel`);
    names.add(gname(t));
  }
  const slotRows = Array.from({ length: PATCH_SLOTS }, (_, i) => {
    const id = `s${String(i + 1).padStart(3, '0')}`;
    return `    { ${cstr(id)}, ${cstr(`Knop ${i + 1}`)}, ParamKind::Float, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, "", "slot" },`;
  });
  fs.writeFileSync(path.join(outDir, 'patchgeneric_plugin.cpp'), [
    '// Gegenereerd door editor/scripts/pluginPatches.ts (MMB Patch); niet met de hand wijzigen.',
    '#include "GenericPatch.h"',
    ...mods.map((t) => `#include "${gname(t)}_vt.h"`),
    '',
    'namespace mmb_plugin {',
    'const W2cVtable* genericModule(const std::string& t) {',
    ...mods.map((t) => `    if (t == ${cstr(t)}) return &kW2c_${gname(t)};`),
    '    return nullptr;',
    '}',
    'inline constexpr ParamSpec kParams_generic[] = {',
    ...slotRows,
    '};',
    // Venster: zoals het grootste front van Poly 8; de bediening past het aan per patch.
    `inline constexpr ModuleSpec kModule_generic { "patch_generic", "Patch", 30, kParams_generic, ${PATCH_SLOTS}, nullptr, 0, 160.0f, 128.0f };`,
    '}  // namespace mmb_plugin',
    '',
    'juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::GenericPatchProcessor(mmb_plugin::kModule_generic); }',
    '',
  ].join('\n'));
  const w2c = mods.map((t) => `${gname(t)} ${cstr(path.join(wasmPublic, `${t}.wasm`).split(path.sep).join('/'))}`).join(' ');
  fs.writeFileSync(path.join(outDir, 'patch_generic.cmake'), [
    '# Gegenereerd door editor/scripts/pluginPatches.ts; niet met de hand wijzigen.',
    `mmb_add_module(MmbPatch Ppch "MMB Patch" TRUE \${MMB_GENERATED_DIR}/patchgeneric_plugin.cpp CATEGORIES Instrument Synth NOLTO W2CMODS ${w2c})`,
    '',
  ].join('\n'));
  console.log(`MMB Patch: ${mods.length} soorten wasm, ${PATCH_SLOTS} slots`);
}

main();
