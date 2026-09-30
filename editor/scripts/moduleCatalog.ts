// Genereert doc/module-catalogus.md uit de editor-moduledefinities
// (seedModules.ts), de simulatorselectie (simSupport.ts) en het
// firmware-contract (firmware/app-modular-brain/contract/module-types.json).
//
// Draaien: `npm run catalog` in editor/. Het resultaat is een doorzoekbare
// publieke catalogus per familie: poorten, controls, sim-status, firmware-
// status en de voorbeeldpatches (seeds) waarin een module voorkomt. De
// handmatige uitleg per familie staat in FAMILIE_UITLEG hieronder; de
// notities per module komen uit `ModuleType.notes`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emptyModularProject } from '../src/modular-mb/types';
import type { ModularProject, ModuleType, Control } from '../src/modular-mb/types';
import {
  seedInternals, seedTestPatch, seedFmTestPatch, seedCvBridgePatch,
  seedTwoVoicePatch, seedKrellPatch, seedMaterialBridgeDemo, seed808JamPatch,
  seedWarpsVocoderPatch, seedZangPatch, seedDx7PolyPatch, seedSamplerPolyPatch,
  seedGenerativeJamPatch, seedCloudsAmbientPatch,
} from '../src/modular-mb/seedModules';
import { simSupportOf, SIM_LABEL } from '../src/modular-mb/sim/simSupport';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const contractPath = path.join(repo, 'firmware', 'app-modular-brain', 'contract', 'module-types.json');
const outPath = path.join(repo, 'doc', 'module-catalogus.md');

interface Contract {
  firmwareVersion: string;
  modules: Record<string, { typeId: string; source: string; ports: string[]; controls: string[] }>;
}

/** Korte, handmatige uitleg per categorie-id (zie `categories` in seedInternals). */
const FAMILIE_UITLEG: Record<string, string> = {
  vco: 'Toongeneratoren: van klassieke analoge golfvormen tot wavetables, FM, fysische modellen, DX7, SID en de Mutable-kernen. Krijgen V/Oct op `voct`, vaak ook gate voor interne envelopes.',
  vcf: 'Filters. `cutoff` en `res` als knop en als CV-ingang; de meeste hebben audio in/out mono of stereo.',
  vca: 'Versterkers en niveau-sturing. Een VCA hoort achter een filter, met een envelope op de CV-ingang.',
  envelope: 'Envelopes: gate/trigger in, CV uit. AHDSR is de standaardenvelope voor stemmen.',
  lfo: 'Langzame modulatoren en generatieve CV-bronnen (LFO, Marbles, Stages, Tides).',
  mixer: 'Mengpanelen en de OUT-module; in de simulator gebouwd uit Web Audio, op de Teensy in de firmware.',
  utility: 'Hulpmodules: sample & hold, CV-rekenwerk, quantizer, akkoorden, envelope-followers, noise, audio-in.',
  sequencer: 'Stappen- en patroongeneratoren (seq8, Grids).',
  midiRouter: 'MIDI-In: zet noten, velocity, aftertouch en CC om in V/Oct, gate en CV, met stemtoewijzing voor PolyGroups.',
  effect: 'Effecten: echo, chorus/vibe/phaser, galm, compressors en EQ, pitch-effecten en de vocoder (Warps).',
  drum: 'Drummodules (CR-78).',
  noise: 'Ruisbronnen.',
  custom: 'Overige/experimentele modules.',
};

function esc(s: string | undefined): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function controlLabel(c: Control): string {
  const anyC = c as { id: string; label?: string; kind: string; unit?: string };
  const base = anyC.label && anyC.label.trim() ? anyC.label : anyC.id;
  return anyC.unit ? `${base} (${anyC.unit})` : base;
}

function localDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, '-').replace(/^-|-$/g, '');
}

function main(): void {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8')) as Contract;
  const base = seedInternals(emptyModularProject());
  const types = base.moduleTypes.filter((t) => t.internal);
  const cats = base.categories;
  const catLabel = (id: string) => cats.find((c) => c.id === id)?.label ?? id;

  // Voorbeeldpatches: welke seeds gebruiken welk type.
  const seeds: Array<[string, (p: ModularProject) => ModularProject]> = [
    ['Test-patch', seedTestPatch], ['FM-test', seedFmTestPatch], ['CV-bridge', seedCvBridgePatch],
    ['Twee stemmen', seedTwoVoicePatch], ['Krell', seedKrellPatch],
    ['Material Bridge', seedMaterialBridgeDemo], ['808-jam', seed808JamPatch],
    ['Warps-vocoder', seedWarpsVocoderPatch], ['Zang', (p) => seedZangPatch(p)],
    ['DX7 poly', (p) => seedDx7PolyPatch(p)], ['Sampler poly', (p) => seedSamplerPolyPatch(p)],
    ['Generative jam', seedGenerativeJamPatch], ['Clouds ambient', seedCloudsAmbientPatch],
  ];
  const usedBy = new Map<string, Set<string>>();
  for (const [name, fn] of seeds) {
    try {
      const p = fn(structuredClone(base));
      const patchName = p.patches[p.patches.length - 1]?.name ?? name;
      for (const m of p.modules) {
        if (m.internal) continue;
        if (!usedBy.has(m.typeId)) usedBy.set(m.typeId, new Set());
        usedBy.get(m.typeId)!.add(patchName);
      }
    } catch (e) {
      console.warn(`seed ${name} overgeslagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const byCat = new Map<string, ModuleType[]>();
  for (const t of types) {
    if (!byCat.has(t.categoryId)) byCat.set(t.categoryId, []);
    byCat.get(t.categoryId)!.push(t);
  }
  const catOrder = [...byCat.keys()].sort((a, b) => catLabel(a).localeCompare(catLabel(b), 'nl'));

  const simOf = (t: ModuleType) => simSupportOf(t, base.moduleTypes, cats);
  const fwOf = (t: ModuleType) => contract.modules[t.id];

  const L: string[] = [];
  L.push('# Modulecatalogus (Modular MB / Cortex)');
  L.push('');
  L.push(`> GEGENEREERD door \`editor/scripts/moduleCatalog.ts\` (\`npm run catalog\` in \`editor/\`), niet met de hand bewerken. Bron: de moduledefinities in de editor, de simulatorselectie en het firmware-contract ${contract.firmwareVersion}. Gegenereerd op ${localDate()}.`);
  L.push('');
  L.push('Wat de kolommen betekenen:');
  L.push('');
  L.push('- **Sim**: `wasm` = draait in de browser met dezelfde C++-kern als de Teensy; `web-audio` = nagebouwd uit Web Audio-nodes (alleen OUT, mixers, audio-in); `—` = nog niet gesimuleerd.');
  L.push('- **Firmware**: ✅ = het type staat in het firmware-contract (de Teensy kent poorten en controls), met het bronbestand; ⚠ = niet in het contract, alleen in de editor.');
  L.push('- **Ingangen/Uitgangen**: poortnaam met signaaltype (audio, cv, gate, trigger, midi). Per-cel-poorten van multi-modules staan een keer.');
  L.push('- **Voorbeeld**: seed-patches (Solo/Poly-menu in de editor) waarin de module voorkomt. Geen vermelding betekent alleen dat geen seed hem gebruikt.');
  L.push('- Contract-details (letterlijke poort-id\'s en aliassen): `firmware/app-modular-brain/contract/module-types.json`. Gedeelde kern is geen garantie voor identiek gedrag van elke patch: I/O, CPU en geheugen verschillen per doel.');
  L.push('');
  L.push('## Overzicht');
  L.push('');
  L.push('| Familie | Modules | wasm | web-audio | niet gesimuleerd | in firmware-contract |');
  L.push('|---|---|---|---|---|---|');
  let tot = { n: 0, wasm: 0, tone: 0, none: 0, fw: 0 };
  for (const c of catOrder) {
    const ts = byCat.get(c)!;
    const n = { n: ts.length, wasm: 0, tone: 0, none: 0, fw: 0 };
    for (const t of ts) { n[simOf(t)]++; if (fwOf(t)) n.fw++; }
    L.push(`| [${esc(catLabel(c))}](#${slug(catLabel(c))}) | ${n.n} | ${n.wasm} | ${n.tone} | ${n.none} | ${n.fw} |`);
    tot = { n: tot.n + n.n, wasm: tot.wasm + n.wasm, tone: tot.tone + n.tone, none: tot.none + n.none, fw: tot.fw + n.fw };
  }
  L.push(`| **Totaal** | **${tot.n}** | **${tot.wasm}** | **${tot.tone}** | **${tot.none}** | **${tot.fw}** |`);
  L.push('');
  const inContractOnly = Object.keys(contract.modules).filter((id) => !types.some((t) => t.id === id));
  if (inContractOnly.length) {
    L.push(`Firmware-types zonder editorpaneel: ${inContractOnly.map((s) => `\`${s}\``).join(', ')}.`);
    L.push('');
  }

  for (const c of catOrder) {
    L.push(`## ${catLabel(c)}`);
    L.push('');
    if (FAMILIE_UITLEG[c]) { L.push(FAMILIE_UITLEG[c]); L.push(''); }
    L.push('| Module | Type-id | Sim | Firmware | Ingangen | Uitgangen | Controls | Voorbeeld | Notities |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    const ts = byCat.get(c)!.sort((a, b) => a.variant.localeCompare(b.variant, 'nl'));
    for (const t of ts) {
      const ins = t.ports.filter((p) => p.direction === 'in').map((p) => `${p.name} (${p.signalType})`);
      const outs = t.ports.filter((p) => p.direction === 'out').map((p) => `${p.name} (${p.signalType})`);
      const ctrls = t.controls.filter((k) => k.kind !== 'display' && k.kind !== 'led').map(controlLabel);
      const fw = fwOf(t);
      const fwCell = fw ? `✅ \`${path.basename(fw.source)}\`` : '⚠ niet in contract';
      const ex = [...(usedBy.get(t.id) ?? [])].sort().join(', ');
      L.push(`| **${esc(t.variant)}** | \`${t.id}\` | ${SIM_LABEL[simOf(t)]} | ${fwCell} | ${esc(ins.join(', '))} | ${esc(outs.join(', '))} | ${esc(ctrls.join(', '))} | ${esc(ex)} | ${esc(t.notes)} |`);
    }
    L.push('');
  }
  fs.writeFileSync(outPath, L.join('\n') + '\n', 'utf-8');
  console.log(`geschreven: ${path.relative(repo, outPath)} — ${tot.n} modules, ${tot.wasm} wasm, ${tot.fw} in contract ${contract.firmwareVersion}`);
}

main();
