// Plugins uit de editor genereren (tools/plugin): per moduletype de
// parameterlijst uit het paneel, en voor modules op de uniforme kern-
// interface (MMB_KERNEL_HOST in tools/mmb-wasm/<naam>_wasm.cc) ook de
// kernbeschrijving, het plugin-bronbestand en de CMake-regel. Eén bron
// (seedModules.ts + de wasm-gastheer) voor editor, simulator én plugin.
//
//   npx tsx scripts/pluginParams.ts tp_mmb_hall tp_mmb_ladder …
//   → tools/plugin/generated/<typeId>_params.h     (altijd)
//   → tools/plugin/generated/<typeId>_kernel.h     (uniforme kern, niet handgeschreven)
//   → tools/plugin/generated/<typeId>_plugin.cpp
//   → tools/plugin/generated/modules.cmake         (één mmb_add_module-regel per module)
//
// Draait in `npm run build:plugin-ui`, vóór de bundel van de bediening.
// Handgeschreven plugins (tools/plugin/src/*Plugin.cpp) staan in MANUAL en
// krijgen alleen de parameterlijst.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject, type Control } from '../src/modular-mb/types';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'tools', 'plugin', 'generated');
const wasmDir = path.join(repo, 'tools', 'mmb-wasm');
const MANUAL = new Set(['tp_mmb_hall', 'tp_mmb_sid']);

const cstr = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const num = (v: number) => (Number.isInteger(v) ? `${v}.0f` : `${v}f`);

function spec(c: Control): string | undefined {
  switch (c.kind) {
    case 'knob': {
      const skewMid = c.taper === 'log' && c.min > 0 ? Math.sqrt(c.min * c.max) : 0;
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Float, ${num(c.min)}, ${num(c.max)}, ${num(c.defaultValue)}, ${num(c.step ?? 0)}, ${num(skewMid)}, "", ${cstr(c.unit ?? '')} }`;
    }
    case 'switch':
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Choice, 0.0f, ${num(c.positions.length - 1)}, ${num(c.defaultIndex)}, 1.0f, 0.0f, ${cstr(c.positions.join('|'))}, "" }`;
    case 'toggle':
      return `{ ${cstr(c.id)}, ${cstr(c.label)}, ParamKind::Bool, 0.0f, 1.0f, ${c.defaultValue ? '1.0f' : '0.0f'}, 1.0f, 0.0f, "", "" }`;
    default:
      return undefined;   // displays, joysticks, knoppen op het front: geen parameter
  }
}

/** De wasm-gastheer van een type, als die op MMB_KERNEL_HOST zit. */
interface KernelInfo { include: string; cls: string; audioIn: number; audioOut: number; cvIn: number; controls: string[]; cvNames: string[] }
function kernelInfo(typeId: string): KernelInfo | undefined {
  for (const f of fs.readdirSync(wasmDir)) {
    if (!f.endsWith('_wasm.cc')) continue;
    const src = fs.readFileSync(path.join(wasmDir, f), 'utf-8');
    if (!new RegExp(`MMB_TYPE_ID\\s*=\\s*"${typeId}"`).test(src)) continue;
    const host = /MMB_KERNEL_HOST\(\s*([\w:]+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*,\s*\w+\s*,\s*(\d+)\s*\)/.exec(src);
    if (!host) return undefined;
    const include = /#include\s+"(mmb_dsp\/[^"]+)"/.exec(src)?.[1];
    const ctlBlock = /MMB_CONTROLS\[\]\s*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? '';
    const controls = [...ctlBlock.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,/g)].map((m) => m[1]!);
    const inBlock = /MMB_INPUTS\[\]\s*=\s*\{([\s\S]*?)\};/.exec(src)?.[1] ?? '';
    const inputs = [...inBlock.matchAll(/\{\s*"([A-Za-z0-9_]+)"\s*,\s*(MMB_\w+)/g)].map((m) => ({ name: m[1]!, kind: m[2]! }));
    const cvIdx = /kCvIn\[\]\s*=\s*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    const cvNames = cvIdx.split(',').map((s) => s.trim()).filter(Boolean).map((s) => inputs[Number(s)]?.name ?? '');
    if (!include) throw new Error(`${typeId}: geen mmb_dsp-include in ${f}`);
    return { include, cls: host[1]!, audioIn: Number(host[2]), audioOut: Number(host[4]), cvIn: Number(host[3]), controls, cvNames };
  }
  return undefined;
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
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('gebruik: tsx scripts/pluginParams.ts tp_mmb_hall …');
  const base = seedInternals(emptyModularProject());
  fs.mkdirSync(outDir, { recursive: true });
  const cmake: string[] = [
    '# Gegenereerd door editor/scripts/pluginParams.ts; niet met de hand wijzigen.',
    '# Eén plugin per module op de uniforme kern-interface (KernelPlugin.h).',
  ];
  for (const id of ids) {
    const type = base.moduleTypes.find((t) => t.id === id);
    const mod = base.modules.find((m) => m.typeId === id);
    if (!type || !mod) throw new Error(`${id}: geen moduletype in de standaardset`);
    const rows = type.controls.map(spec).filter((r): r is string => r !== undefined);
    const sym = id.replace(/[^A-Za-z0-9]/g, '_');
    const name = (type as { modelNumber?: string }).modelNumber ?? id.replace(/^tp_mmb_/, '').toUpperCase();
    const paramsH = [
      '#pragma once',
      `// Gegenereerd door editor/scripts/pluginParams.ts uit het paneel ${id} (seedModules.ts); niet met de hand wijzigen.`,
      '#include "MmbParamSpec.h"',
      '',
      'namespace mmb_plugin {',
      `inline constexpr ParamSpec kParams_${sym}[] = {`,
      ...rows.map((r) => `    ${r},`),
      '};',
      `inline constexpr ModuleSpec kModule_${sym} { ${cstr(id)}, ${cstr(name)}, ${mod.visual.hpWidth}, kParams_${sym}, ${rows.length} };`,
      '}  // namespace mmb_plugin',
      '',
    ];
    fs.writeFileSync(path.join(outDir, `${id}_params.h`), paramsH.join('\n'));
    let note = `${rows.length} parameters`;

    const k = MANUAL.has(id) ? undefined : kernelInfo(id);
    if (k) {
      // Welke paneelknoppen de kern niet kent (front-knoppen e.d.) is geen fout:
      // applyControl slaat ze over. Andersom wel: een kernknop zonder paneelknop.
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
      const cpp = [
        `// Gegenereerd door editor/scripts/pluginParams.ts: ${id} als plugin op de uniforme kern-interface.`,
        '#include "KernelPlugin.h"',
        `#include "${id}_params.h"`,
        `#include "${id}_kernel.h"`,
        '',
        `juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::KernelProcessor<mmb_plugin::Kernel_${sym}>(mmb_plugin::kModule_${sym}); }`,
        '',
      ];
      fs.writeFileSync(path.join(outDir, `${id}_plugin.cpp`), cpp.join('\n'));
      const slug = id.replace(/^tp_mmb_/, '');
      const target = 'Mmb' + slug.split('_').map((s) => s[0]!.toUpperCase() + s.slice(1)).join('');
      const synth = k.audioIn === 0;
      cmake.push(`mmb_add_module(${target} ${pluginCode(slug)} "MMB ${name}" ${synth ? 'TRUE' : 'FALSE'} \${MMB_GENERATED_DIR}/${id}_plugin.cpp ${synth ? 'Instrument Synth' : 'Fx'})`);
      note += `, kern ${k.cls} (${k.audioIn} in / ${k.audioOut} uit, ${k.controls.length} knoppen) → ${target}`;
    } else if (!MANUAL.has(id)) {
      note += ', geen uniforme kern: handgeschreven plugin nodig';
    }
    console.log(`${id}: ${note}`);
  }
  fs.writeFileSync(path.join(outDir, 'modules.cmake'), cmake.join('\n') + '\n');
}

main();
