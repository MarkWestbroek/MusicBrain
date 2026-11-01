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
import { DX7_BANK_SHORT } from '../src/modular-mb/dx7BankNames';
import { patchName, unpackPatch } from '../src/modular-mb/dx7Patch';
import { DX7_PLUGIN_PARAMS } from '../src/modular-mb/dx7PluginParams';
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
      // Een knop (PADS) is een aan/uit-parameter, zoals een toggle.
      const asSpec = c.kind === 'button' ? ({ ...c, kind: 'toggle', defaultValue: Boolean(c.defaultValue) } as unknown as typeof c) : c;
      const row = spec((asSpec.kind === 'switch'
        ? { ...c, defaultIndex: typeof state === 'number' ? state : c.defaultIndex }
        : { ...asSpec, defaultValue: state ?? (asSpec as { defaultValue?: unknown }).defaultValue }) as typeof c);
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
  cmake.push(writeDx7Plugin());
  fs.writeFileSync(path.join(outDir, 'patches.cmake'), cmake.join('\n') + '\n');
  writeDx7Roms();
  writeGeneric();
}

/** De 8 DX7-fabrieksbanken als C-tabel: de patchmotor geeft ze aan elke DX7 (PatchEngine.h). */
function writeDx7Roms(): void {
  const rom = fs.readFileSync(path.join(repo, 'editor', 'public', 'dx7', 'roms.bin'));
  if (rom.length !== 8 * 4096) throw new Error(`dx7/roms.bin: ${rom.length} bytes, verwacht 32768`);
  const rows: string[] = [];
  for (let b = 0; b < 8; ++b) {
    rows.push('    {');
    for (let i = 0; i < 4096; i += 32) rows.push('        ' + [...rom.subarray(b * 4096 + i, b * 4096 + i + 32)].join(',') + ',');
    rows.push('    },');
  }
  fs.writeFileSync(path.join(outDir, 'dx7_roms.h'), [
    '// Gegenereerd door editor/scripts/pluginPatches.ts uit editor/public/dx7/roms.bin; niet met de hand wijzigen.',
    '#pragma once',
    '#include <cstdint>',
    'constexpr int kDx7RomBanks = 8;',
    'inline const uint8_t kDx7Roms[8][4096] = {',
    ...rows,
    '};',
    '',
  ].join('\n'));
}

/**
 * MMB DX7 (tools/plugin/src/Dx7Plugin.h): de patch "DX7 poly ×8" met elke
 * stemparameter als DAW-parameter (dx7PluginParams.ts) en de 256
 * fabrieksklanken als programma's. Geeft de regel voor patches.cmake.
 */
function writeDx7Plugin(): string {
  const label = '🎹 DX7 poly ×8';
  const entry = PATCH_CATALOG.find((e) => e.label === label);
  if (!entry) throw new Error(`geen seed "${label}" in patchCatalog.ts`);
  const project = entry.build(seedInternals(emptyModularProject()));
  const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
  const json = patchPluginConfig(project, patch).json;
  const config = JSON.parse(json) as { project: { modules: { typeId: string }[] } };
  const mods = [...new Set(config.project.modules.map((m) => m.typeId))].filter((t) => !NATIVE.has(t)).sort();

  const rom = fs.readFileSync(path.join(repo, 'editor', 'public', 'dx7', 'roms.bin'));
  const voices: Uint8Array[] = [];
  const names: string[] = [];
  for (let b = 0; b < 8; ++b)
    for (let v = 0; v < 32; ++v) {
      const un = unpackPatch(new Uint8Array(rom.buffer, rom.byteOffset + b * 4096 + v * 128, 128), 0);
      voices.push(un);
      names.push(`${DX7_BANK_SHORT[b]} ${String(v + 1).padStart(2, '0')} ${patchName(un).trim()}`);
    }
  const v0 = voices[0]!;
  const rows = DX7_PLUGIN_PARAMS.map((x) => {
    const def = Math.min(x.max, v0[x.offset]!);
    return x.steps
      ? `    { ${cstr(x.id)}, ${cstr(x.name)}, ParamKind::Choice, 0.0f, ${x.max}.0f, ${def}.0f, 1.0f, 0.0f, ${cstr(x.steps.join('|'))}, "" },`
      : `    { ${cstr(x.id)}, ${cstr(x.name)}, ParamKind::Float, ${x.bias}.0f, ${x.max + x.bias}.0f, ${def + x.bias}.0f, 1.0f, 0.0f, "", "" },`;
  });
  const bytes = [...Buffer.from(json, 'utf8')];
  const jsonLines: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) jsonLines.push('    ' + bytes.slice(i, i + 32).join(',') + ',');
  fs.writeFileSync(path.join(outDir, 'dx7_plugin.cpp'), [
    `// Gegenereerd door editor/scripts/pluginPatches.ts (MMB DX7, seed "${label}"); niet met de hand wijzigen.`,
    '#include "Dx7Plugin.h"',
    ...mods.map((t) => `#include "${w2cName(t)}_vt.h"`),
    '',
    'namespace mmb_plugin {',
    'static const unsigned char kJson[] = {',
    ...jsonLines,
    '    0 };',
    'const char* patchJson() { return reinterpret_cast<const char*>(kJson); }',
    'const W2cVtable* patchModule(const std::string& t) {',
    ...mods.map((t) => `    if (t == ${cstr(t)}) return &kW2c_${w2cName(t)};`),
    '    return nullptr;',
    '}',
    'static const char* const kIds[] = {',
    ...DX7_PLUGIN_PARAMS.map((x) => `    ${cstr(x.id)},`),
    '};',
    'int patchParamIndex(const char* id) {',
    '    for (int i = 0; i < static_cast<int>(sizeof(kIds) / sizeof(kIds[0])); ++i) if (std::strcmp(kIds[i], id) == 0) return i;',
    '    return -1;',
    '}',
    'const std::vector<std::vector<std::pair<std::string, std::string>>>& patchParamTargets() {',
    '    static const std::vector<std::vector<std::pair<std::string, std::string>>> t;',
    '    return t;',
    '}',
    'static const Dx7ParamInfo kInfo[] = {',
    ...DX7_PLUGIN_PARAMS.map((x) => `    { ${x.offset}, ${x.max}, ${x.bias} },`),
    '};',
    'const Dx7ParamInfo* dx7ParamInfo() { return kInfo; }',
    `int dx7ParamCount() { return ${DX7_PLUGIN_PARAMS.length}; }`,
    `static const uint8_t kVoices[${voices.length}][${v0.length}] = {`,
    ...voices.map((v) => `    { ${[...v].join(',')} },`),
    '};',
    'const uint8_t* dx7FactoryVoice(int i) { return kVoices[i < 0 ? 0 : i > 255 ? 255 : i]; }',
    'static const char* const kNames[] = {',
    ...names.map((n) => `    ${cstr(n)},`),
    '};',
    'const char* dx7FactoryName(int i) { return kNames[i < 0 ? 0 : i > 255 ? 255 : i]; }',
    'inline constexpr ParamSpec kParams[] = {',
    ...rows,
    '};',
    `inline constexpr ModuleSpec kModule { "dx7_plugin", "DX7", 50, kParams, ${rows.length}, nullptr, 0, 250.0f, 150.0f };`,
    '}  // namespace mmb_plugin',
    '',
    'juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::Dx7Processor(mmb_plugin::kModule, true); }',
    '',
  ].join('\n'));
  const w2c = mods.map((t) => `${w2cName(t)} ${cstr(path.join(wasmPublic, `${t}.wasm`).split(path.sep).join('/'))}`).join(' ');
  console.log(`MMB DX7: ${DX7_PLUGIN_PARAMS.length} parameters, ${voices.length} programma's, ${mods.length} soorten wasm`);
  return `mmb_add_module(MmbDx7 Dx7p "MMB DX7" TRUE \${MMB_GENERATED_DIR}/dx7_plugin.cpp CATEGORIES Instrument Synth W2CMODS ${w2c})`;
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
  // De catalogus als programma's (presetmenu van de DAW): per patch de configuratie;
  // de bediening maakt de weergave zelf uit de catalogus (catalogId).
  const presets: { id: string; label: string; menu: string; config: string }[] = [];
  for (const e of PATCH_CATALOG) {
    if (!['basisset', 'poly', 'solo'].includes(e.menu)) continue;
    try {
      const project = e.build(seedInternals(emptyModularProject()));
      const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
      const cfg = patchPluginConfig(project, patch);
      presets.push({ id: e.id, label: e.label, menu: e.menu,
        config: JSON.stringify({ json: cfg.json, slots: cfg.slots.slice(0, PATCH_SLOTS).map((x) => ({ label: x.label, targets: x.targets, spec: x.spec })) }) });
    } catch (err) { console.warn(`MMB Patch: ${e.label} overgeslagen (${String(err)})`); }
  }
  const presetBytes = [...Buffer.from(JSON.stringify(presets), 'utf8')];
  const presetLines: string[] = [];
  for (let i = 0; i < presetBytes.length; i += 48) presetLines.push('    ' + presetBytes.slice(i, i + 48).join(',') + ',');
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
    `static const unsigned char kPresets[] = {`,
    ...presetLines,
    '    0 };',
    '/** De catalogus: [{ id, label, menu, config }] (programma\'s van de DAW). */',
    'const char* genericPresetsJson() { return reinterpret_cast<const char*>(kPresets); }',
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
  console.log(`MMB Patch: ${mods.length} soorten wasm, ${PATCH_SLOTS} slots, ${presets.length} programma's (${(presetBytes.length / 1e6).toFixed(1)} MB)`);
}

main();
