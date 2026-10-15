// Parameterlijst voor de plugins (tools/plugin), uit het paneel van een
// moduletype: elke knop, schakelaar en toggle wordt een plugin-parameter met
// hetzelfde id, bereik en standaard. Eén bron (seedModules.ts) voor de
// editor, de simulator én de plugin.
//
//   npx tsx scripts/pluginParams.ts tp_mmb_hall tp_mmb_sid
//   → tools/plugin/generated/<typeId>_params.h   (niet in git)
//
// Draait in `npm run build:plugin-ui`, vóór de bundel van de bediening.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject, type Control } from '../src/modular-mb/types';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'tools', 'plugin', 'generated');

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

function main(): void {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('gebruik: tsx scripts/pluginParams.ts tp_mmb_hall …');
  const base = seedInternals(emptyModularProject());
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    const type = base.moduleTypes.find((t) => t.id === id);
    const mod = base.modules.find((m) => m.typeId === id);
    if (!type || !mod) throw new Error(`${id}: geen moduletype in de standaardset`);
    const rows = type.controls.map(spec).filter((r): r is string => r !== undefined);
    const sym = id.replace(/[^A-Za-z0-9]/g, '_');
    const name = (type as { model?: string }).model ?? id;
    const L = [
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
    const file = path.join(outDir, `${id}_params.h`);
    fs.writeFileSync(file, L.join('\n'));
    console.log(`${id}: ${rows.length} parameters → ${path.relative(repo, file)}`);
  }
}

main();
