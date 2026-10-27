// Plugins uit de editor genereren (tools/plugin). Per moduletype:
//  - de parameterlijst uit het paneel (seedModules.ts) → <typeId>_params.h;
//  - op de uniforme kern-interface (MMB_KERNEL_HOST in de wasm-gastheer):
//    kernbeschrijving + plugin-bron voor KernelPlugin.h (eigen kern per
//    exemplaar, echte stereo, noten via NoteMap.h);
//  - anders: plugin-bron voor AbiPlugin.h, die de wasm-gastheer zelf native
//    draait (tools/mmb-wasm/<naam>_wasm.cc), met de bronnen en include-
//    mappen uit tools/mmb-wasm/build.sh;
//  - één regel per module in generated/modules.cmake.
//
//   npx tsx scripts/pluginParams.ts --all            # alles behalve EXCLUDE en de CV-modules
//   npx tsx scripts/pluginParams.ts tp_mmb_reverb …  # een keuze
//
// Draait in `npm run build:plugin-ui`, vóór de bundel van de bediening.
// Handgeschreven plugins (tools/plugin/src/*Plugin.cpp) staan in MANUAL en
// krijgen alleen de parameterlijst. Uitvoer staat niet in git.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODULE_PRESETS, PLUGIN_DEFAULTS } from '../src/modular-mb/modulePresets';
import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject, type Control } from '../src/modular-mb/types';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'tools', 'plugin', 'generated');
const wasmDir = path.join(repo, 'tools', 'mmb-wasm');
const MANUAL = new Set(['tp_mmb_hall', 'tp_mmb_sid']);
// Geen plugin: de bus zelf, stemverdelers, mixers/VCA-banken, banken in een
// ander formaat dan .mmbs (ZANG, DX7-fabrieksbanken: licentie open), en wat
// alleen met triggers speelt (nog geen vertaling). Sampler en TAPE STRIP
// laden een .mmbs zelf (MMB_PLUGIN_BANK in AbiPlugin.h).
const EXCLUDE = new Set(['tp_mmb_midiin', 'tp_mmb_octa_vca', 'tp_mmb_octa_vcf', 'tp_mmb_octa_vco', 'tp_mmb_stereo_vca', 'tp_mmb_vca',
  'tp_mmb_env_follower', 'tp_mmb_env_follower_mono', 'tp_mmb_zang', 'tp_mmb_dx7',
  'tp_mmb_pads', 'tp_mmb_percuter', 'tp_mmb_rhythm']);
// Klankbronnen zonder gate: noten zetten alleen de toonhoogte.
const SYNTH_OVERRIDE = new Set(['tp_mmb_vco', 'tp_mmb_fm_vco', 'tp_mmb_wt_vco', 'tp_mmb_draw_vco', 'tp_mmb_morph_wt', 'tp_mmb_complex', 'tp_mmb_rungler', 'tp_mmb_noise']);

const cstr = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const num = (v: number) => (Number.isInteger(v) ? `${v}.0f` : `${v}f`);
const posix = (p: string) => p.replace(/\\/g, '/');

function spec(c: Control): string | undefined {
  switch (c.kind) {
    case 'knob': {
      const skewMid = c.taper === 'log' && c.min > 0 ? Math.sqrt(c.min * c.max) : 0;
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Float, ${num(c.min)}, ${num(c.max)}, ${num(c.defaultValue)}, ${num(c.step ?? 0)}, ${num(skewMid)}, "", ${cstr(c.unit ?? '')} }`;
    }
    case 'slider':   // drawbars (ORGAN): een continue parameter zoals een knop
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Float, ${num(c.min)}, ${num(c.max)}, ${num(c.defaultValue)}, 0.0f, 0.0f, "", ${cstr(c.unit ?? '')} }`;
    case 'switch':
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Choice, 0.0f, ${num(c.positions.length - 1)}, ${num(c.defaultIndex)}, 1.0f, 0.0f, ${cstr(c.positions.join('|'))}, "" }`;
    case 'toggle':
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Bool, 0.0f, 1.0f, ${c.defaultValue ? '1.0f' : '0.0f'}, 1.0f, 0.0f, "", "" }`;
    default:
      return undefined;   // displays, joysticks, knoppen op het front: geen parameter
  }
}

/** De beginstand van de plugin: het paneel, met PLUGIN_DEFAULTS erover. */
function withPluginDefault(id: string, c: Control): Control {
  const v = PLUGIN_DEFAULTS[id]?.[c.id];
  if (v === undefined) return c;
  if (c.kind === 'switch') return { ...c, defaultIndex: Number(v) };
  if (c.kind === 'knob' || c.kind === 'slider') return { ...c, defaultValue: Number(v) };
  if (c.kind === 'toggle') return { ...c, defaultValue: Boolean(v) };
  return c;
}

/** Fabriekspresets (modulePresets.ts) als C++-tabellen; de plugin maakt er programma's van. */
function presetRows(id: string, sym: string): string[] {
  const presets = MODULE_PRESETS[id];
  if (!presets?.length) return [];
  const out: string[] = [];
  presets.forEach((p, i) => {
    const vals = Object.entries(p.values).map(([k, v]) => `{ ${cstr(k)}, ${num(typeof v === 'boolean' ? (v ? 1 : 0) : Number(v))} }`);
    out.push(`inline constexpr PresetValue kPreset_${sym}_${i}[] = { ${vals.join(', ')} };`);
  });
  out.push(`inline constexpr PresetSpec kPresets_${sym}[] = {`);
  presets.forEach((p, i) => out.push(`    { ${cstr(p.name)}, kPreset_${sym}_${i}, ${Object.keys(p.values).length} },`));
  out.push('};');
  return out;
}

// ── De wasm-gastheer van een type ────────────────────────────────────────
interface HostInfo {
  file: string; rate: number; audioIn: number; audioOut: number; inputs: { name: string; kind: string }[];
  kernel?: { include: string; cls: string; audioIn: number; audioOut: number; cvIn: number; controls: string[]; cvNames: string[] };
}
const hostCache = new Map<string, HostInfo | undefined>();
function hostInfo(typeId: string): HostInfo | undefined {
  if (hostCache.has(typeId)) return hostCache.get(typeId);
  let found: HostInfo | undefined;
  for (const f of fs.readdirSync(wasmDir)) {
    if (!f.endsWith('_wasm.cc')) continue;
    const src = fs.readFileSync(path.join(wasmDir, f), 'utf-8');
    if (!new RegExp(`MMB_TYPE_ID\\s*=\\s*"${typeId}"`).test(src)) continue;
    const rate = Number(/MMB_NATIVE_RATE\s*=\s*([\d.]+)/.exec(src)?.[1] ?? 44100);
    const inBlock = /MMB_INPUTS\[\]\s*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? '';
    const inputs = [...inBlock.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,\s*(MMB_\w+)/g)].map((m) => ({ name: m[1]!, kind: m[2]! }));
    const outBlock = /MMB_OUTPUTS\[\]\s*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? '';
    const outputs = [...outBlock.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,\s*(MMB_\w+)/g)].map((m) => m[2]!);
    found = { file: f, rate, audioIn: inputs.filter((i) => i.kind === 'MMB_AUDIO').length, audioOut: outputs.filter((k) => k === 'MMB_AUDIO').length, inputs };
    const host = /MMB_KERNEL_HOST\(\s*([\w:]+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*\)/.exec(src);
    if (host) {
      const include = /#include\s+"(mmb_dsp\/[^"]+)"/.exec(src)?.[1];
      const ctlBlock = /MMB_CONTROLS\[\]\s*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? '';
      const controls = [...ctlBlock.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,/g)].map((m) => m[1]!);
      const cvIdx = /kCvIn\[\]\s*=\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
      const cvNames = cvIdx.split(',').map((s) => s.trim()).filter(Boolean).map((s) => inputs[Number(s)]?.name ?? '');
      if (!include) throw new Error(`${typeId}: geen mmb_dsp-include in ${f}`);
      found.kernel = { include, cls: host[1]!, audioIn: Number(host[2]), audioOut: Number(host[4]), cvIn: Number(host[3]), controls, cvNames };
    }
    break;
  }
  hostCache.set(typeId, found);
  return found;
}

// ── Bronnen en include-mappen uit tools/mmb-wasm/build.sh ───────────────
interface BuildEntry { incs: string[]; sources: string[]; globs: string[]; defines: string[] }
function parseBuildSh(): Map<string, BuildEntry> {
  const text = fs.readFileSync(path.join(wasmDir, 'build.sh'), 'utf-8').replace(/\\\r?\n/g, ' ');
  const vars: Record<string, string> = { ROOT: posix(repo), HERE: posix(wasmDir) };
  const arrays: Record<string, string[]> = {};
  const expand = (s: string): string => s
    .replace(/\$\((cd[^)]*)\)/g, '')
    .replace(/\$\{(\w+)\}/g, (_, v: string) => vars[v] ?? '')
    .replace(/\$(\w+)/g, (_, v: string) => vars[v] ?? '');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = /^(\w+)=\((.*)\)$/.exec(line);
    if (m) { arrays[m[1]!] = m[2]!.split(/\s+/).filter(Boolean).map((t) => expand(t.replace(/^"|"$/g, ''))); continue; }
    m = /^(\w+)="?([^"]*)"?$/.exec(line);
    if (m && !line.startsWith('sel ') && !line.includes('(') && !/^(set|want|FAILED)/.test(m[1]!)) vars[m[1]!] = expand(m[2]!);
  }
  const out = new Map<string, BuildEntry>();
  for (const raw of text.split('\n')) {
    const m = /^sel\s+\w+\s+&&\s+(?:(?:(\w+)=(\S+)\s+)*)build\s+\w+\s+(tp_\w+)\s+(.*?)\s*--\s*(.*)$/.exec(raw.trim());
    if (!m) continue;
    const typeId = m[3]!;
    const defines = [...raw.matchAll(/EXTRA="([^"]*)"/g)].flatMap((d) => d[1]!.split(/\s+/)).filter((d) => d.startsWith('-D')).map((d) => d.slice(2));
    const tokenise = (s: string): string[] => {
      const toks: string[] = [];
      const re = /"\$\{(\w+)\[@\]\}"|\$\((find\s+"([^"]+)"\s+-name\s+"([^"]+)")[^)]*\)|"([^"]*)"([^\s"]*)|(\S+)/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(s))) {
        if (t[1]) toks.push(...(arrays[t[1]] ?? []));
        else if (t[2]) toks.push(`GLOB_RECURSE:${expand(t[3]!)}/${t[4]!}`);
        else toks.push(expand((t[5] ?? '') + (t[6] ?? '') + (t[7] ?? '')));
      }
      return toks;
    };
    const incs = tokenise(m[4]!).filter(Boolean);
    const sources: string[] = [], globs: string[] = [];
    for (const tok of tokenise(m[5]!).flatMap((t) => t.split(/\s+/)).filter(Boolean)) {
      if (tok.startsWith('GLOB_RECURSE:')) globs.push(tok.slice('GLOB_RECURSE:'.length));
      else if (tok.includes('*')) globs.push(tok);
      else sources.push(tok);
    }
    out.set(typeId, { incs, sources, globs, defines });
  }
  // Wat build() zelf toevoegt: de shim en de MI-fallbacks.
  const fallback = (vars.FALLBACK_INC ?? '').split(/\s+/).filter((t) => t.startsWith('-I')).map((t) => t.slice(2));
  for (const e of out.values()) e.incs.push(posix(wasmDir), posix(path.join(wasmDir, 'shim')), ...fallback);
  return out;
}

const usedCodes = new Set<string>(['Hall', 'Sid1']);
function pluginCode(slug: string): string {
  const letters = slug.replace(/[^a-z]/g, '');
  let code = (letters[0] ?? 'x').toUpperCase() + (letters.slice(1, 4) + 'xxx').slice(0, 3);
  for (let n = 2; usedCodes.has(code); ++n) code = code.slice(0, 3) + String(n);
  usedCodes.add(code);
  return code;
}

function main(): void {
  let ids = process.argv.slice(2);
  const base = seedInternals(emptyModularProject());
  const build = parseBuildSh();
  if (ids.includes('--all')) {
    ids = base.moduleTypes.map((t) => t.id).filter((id) => {
      if (EXCLUDE.has(id)) return false;
      const h = hostInfo(id);
      return !!h && h.rate >= 8000 && (MANUAL.has(id) || build.has(id));
    });
  }
  if (ids.length === 0) throw new Error('gebruik: tsx scripts/pluginParams.ts --all | tp_mmb_hall …');
  fs.mkdirSync(outDir, { recursive: true });
  const cmake: string[] = [
    '# Gegenereerd door editor/scripts/pluginParams.ts; niet met de hand wijzigen.',
    '# Eén plugin per module: KernelPlugin.h (uniforme kern) of AbiPlugin.h (wasm-gastheer).',
  ];
  let nKernel = 0, nAbi = 0;
  for (const id of ids) {
    const type = base.moduleTypes.find((t) => t.id === id);
    const mod = base.modules.find((m) => m.typeId === id);
    if (!type || !mod) throw new Error(`${id}: geen moduletype in de standaardset`);
    const rows = type.controls.map((c) => spec(withPluginDefault(id, c))).filter((r): r is string => r !== undefined);
    const sym = id.replace(/[^A-Za-z0-9]/g, '_');
    const name = (type as { modelNumber?: string }).modelNumber ?? id.replace(/^tp_mmb_/, '').replace(/_/g, ' ').toUpperCase();
    const paramsH = [
      '#pragma once',
      `// Gegenereerd door editor/scripts/pluginParams.ts uit het paneel ${id} (seedModules.ts); niet met de hand wijzigen.`,
      '#include "MmbParamSpec.h"',
      '',
      'namespace mmb_plugin {',
      `inline constexpr ParamSpec kParams_${sym}[] = {`,
      ...rows.map((r) => `    ${r},`),
      '};',
      ...presetRows(id, sym),
      `inline constexpr ModuleSpec kModule_${sym} { ${cstr(id)}, ${cstr(name)}, ${mod.visual.hpWidth}, kParams_${sym}, ${rows.length}${MODULE_PRESETS[id]?.length ? `, kPresets_${sym}, ${MODULE_PRESETS[id]!.length}` : ''} };`,
      '}  // namespace mmb_plugin',
      '',
    ];
    fs.writeFileSync(path.join(outDir, `${id}_params.h`), paramsH.join('\n'));
    let note = `${rows.length} parameters`;
    if (MANUAL.has(id)) { console.log(`${id}: ${note} (handgeschreven)`); continue; }

    const h = hostInfo(id);
    const entry = build.get(id);
    if (!h || !entry) { console.log(`${id}: ${note}, geen wasm-gastheer of bouwregel: overgeslagen`); continue; }
    const slug = id.replace(/^tp_mmb_/, '');
    const target = 'Mmb' + slug.split('_').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
    const hasGate = h.inputs.some((i) => i.name === 'gate' || i.name === 'gate_1');
    const synth = h.audioIn === 0 || hasGate || SYNTH_OVERRIDE.has(id);
    const common = `INCLUDES ${entry.incs.map(cstr).join(' ')}${entry.sources.length ? ` SOURCES ${entry.sources.map(cstr).join(' ')}` : ''}${entry.globs.length ? ` GLOBS ${entry.globs.map(cstr).join(' ')}` : ''}${entry.defines.length ? ` DEFINES ${entry.defines.map(cstr).join(' ')}` : ''}`;
    const k = h.kernel;
    if (k) {
      const panelIds = new Set(type.controls.map((c) => c.id));
      const missing = k.controls.filter((c) => !panelIds.has(c));
      if (missing.length) console.warn(`${id}: kernknoppen zonder paneelknop: ${missing.join(', ')}`);
      const kernelH = [
        '#pragma once',
        `// Gegenereerd door editor/scripts/pluginParams.ts uit tools/mmb-wasm (${k.cls}); niet met de hand wijzigen.`,
        `#include "${k.include}"`,
        '',
        'namespace mmb_plugin {',
        `struct Kernel_${sym} {`,
        `    using Type = ${k.cls};`,
        `    static constexpr int kAudioIn = ${k.audioIn}, kAudioOut = ${k.audioOut}, kCvIn = ${k.cvIn};`,
        `    static constexpr int kNumControls = ${k.controls.length};`,
        `    static constexpr const char* kControls[${Math.max(1, k.controls.length)}] = { ${k.controls.map(cstr).join(', ') || '""'} };`,
        `    static constexpr const char* kCvNames[${Math.max(1, k.cvNames.length)}] = { ${k.cvNames.map(cstr).join(', ') || '""'} };`,
        '};',
        '}  // namespace mmb_plugin',
        '',
      ];
      fs.writeFileSync(path.join(outDir, `${id}_kernel.h`), kernelH.join('\n'));
      fs.writeFileSync(path.join(outDir, `${id}_plugin.cpp`), [
        `// Gegenereerd door editor/scripts/pluginParams.ts: ${id} als plugin op de uniforme kern-interface.`,
        '#include "KernelPlugin.h"',
        `#include "${id}_params.h"`,
        `#include "${id}_kernel.h"`,
        '',
        `juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::KernelProcessor<mmb_plugin::Kernel_${sym}>(mmb_plugin::kModule_${sym}); }`,
        '',
      ].join('\n'));
      cmake.push(`mmb_add_module(${target} ${pluginCode(slug)} "MMB ${name}" ${k.audioIn === 0 ? 'TRUE' : 'FALSE'} \${MMB_GENERATED_DIR}/${id}_plugin.cpp CATEGORIES ${k.audioIn === 0 ? 'Instrument Synth' : 'Fx'} ${common})`);
      note += `, kern ${k.cls} (${k.audioIn} in / ${k.audioOut} uit) → ${target}`;
      ++nKernel;
    } else {
      fs.writeFileSync(path.join(outDir, `${id}_plugin.cpp`), [
        `// Gegenereerd door editor/scripts/pluginParams.ts: ${id} als plugin via de wasm-gastheer ${h.file}.`,
        ...(fs.readFileSync(path.join(wasmDir, h.file), 'utf8').includes('mmb_zone_set') ? ['#define MMB_PLUGIN_BANK 1   // .mmbs via de blob-/zone-exports'] : []),
        '#include "AbiPlugin.h"',
        `#include "${h.file}"`,
        `#include "${id}_params.h"`,
        '',
        `juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::AbiProcessor(mmb_plugin::kModule_${sym}, ${synth ? 'true' : 'false'}); }`,
        '',
      ].join('\n'));
      cmake.push(`mmb_add_module(${target} ${pluginCode(slug)} "MMB ${name}" ${synth ? 'TRUE' : 'FALSE'} \${MMB_GENERATED_DIR}/${id}_plugin.cpp CATEGORIES ${synth ? 'Instrument Synth' : 'Fx'} ${common})`);
      note += `, gastheer ${h.file} (${h.rate} Hz, ${h.audioIn} in / ${h.audioOut} uit${synth ? ', instrument' : ''}) → ${target}`;
      ++nAbi;
    }
    console.log(`${id}: ${note}`);
  }
  fs.writeFileSync(path.join(outDir, 'modules.cmake'), cmake.join('\n') + '\n');
  console.log(`modules.cmake: ${nKernel} op de kern-interface, ${nAbi} via de gastheer`);
}

main();
