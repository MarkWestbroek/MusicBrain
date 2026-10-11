// Genereert per software-module de inhoud voor zijn pagina op de site
// (doc/plans/software-modules-op-de-site.md): editor/site/modules/<slug>/
// met module.md (## secties, Engels), beschrijving.txt en panel.svg.
// Publiceren gaat daarna met hardware/kicad-generators/publish_software.py.
//
//   npx tsx scripts/moduleSite.ts tp_mmb_ladder [tp_mmb_… …]
//
// Wat uit de code komt: knoppen en poorten (moduledefinitie + firmware-
// contract), de korte uitleg en de knopregels (moduleHelp.ts), de
// voorbeeldpatches waarin de module zit (patchCatalog.ts), het paneel, en
// de openbare patches uit de pool op musicbrain.nl die hem gebruiken (uit
// `requires.moduleTypes`; die krijgen een link naar hun patchpagina, waar je
// ze in de editor opent of speelt).
// Wat niet uit de code komt staat in editor/site/modules/: de Engelse
// lange uitleg, "how it works", bronnen en versies (text/<slug>.en.md), en
// per module de gemeten rekentijd, de gekozen take en ontbrekende
// knop-/poortuitleg (site-modules.json).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ModulePanel } from '../src/modular-mb/ModulePanel';
import { contentEn } from '../src/modular-mb/contentEn';
import { MODULE_HELP } from '../src/modular-mb/moduleHelp';
import { PATCH_CATALOG } from '../src/modular-mb/patchCatalog';
import { seedInternals } from '../src/modular-mb/seedModules';
import { emptyModularProject, resolveControls, resolvePorts, type Control } from '../src/modular-mb/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, '..', 'site', 'modules');
const repo = path.resolve(here, '..', '..');

interface SiteModule {
  slug: string; name: string;
  cpu?: { percent: number; fw: string; how?: string };
  take?: string | null;
  takeUrl?: string | null;
  try?: string;
  controlHelp?: Record<string, string>;
  portHelp?: Record<string, string>;
}

const esc = (s: string | undefined): string => (s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const num = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : '');

function range(c: Control): string {
  const a = c as { kind: string; min?: number; max?: number; unit?: string; positions?: string[] };
  if (a.kind === 'switch' && a.positions) return a.positions.join(' / ');
  if (a.kind === 'toggle') return 'off / on';
  if (a.min === undefined || a.max === undefined) return '';
  return `${num(a.min)} … ${num(a.max)}${a.unit ? ` ${a.unit}` : ''}`;
}
function defaultOf(c: Control): string {
  const a = c as { kind: string; defaultValue?: unknown; defaultIndex?: number; positions?: string[] };
  if (a.kind === 'switch') return a.positions?.[a.defaultIndex ?? 0] ?? '';
  return typeof a.defaultValue === 'boolean' ? (a.defaultValue ? 'on' : 'off') : num(a.defaultValue);
}

/** Het handgeschreven Engels, opgeknipt per ## kop. */
function sections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of md.split(/^## +/m).slice(1)) {
    const nl = part.indexOf('\n');
    out.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return out;
}

interface PoolPatch { slug: string; title: string; pool: string; url?: string; takes?: string[]; requires?: { moduleTypes?: string[] } }
const SITE = process.env.MMB_SITE ?? 'https://musicbrain.nl';

/** De openbare patches (centraal, experimenteel); leeg als de site niet bereikbaar is. */
async function poolPatches(): Promise<PoolPatch[]> {
  const out: PoolPatch[] = [];
  for (const pool of ['centraal', 'experimenteel']) {
    try {
      const res = await fetch(`${SITE}/api/patches?pool=${pool}`);
      const body = await res.json() as { patches?: PoolPatch[]; items?: PoolPatch[] } | PoolPatch[];
      out.push(...(Array.isArray(body) ? body : body.patches ?? body.items ?? []));
    } catch (e) { console.warn(`pool ${pool} niet te lezen: ${e instanceof Error ? e.message : e}`); }
  }
  return out;
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('gebruik: tsx scripts/moduleSite.ts tp_mmb_ladder …');
  const site = JSON.parse(fs.readFileSync(path.join(siteDir, 'site-modules.json'), 'utf-8')) as { modules: Record<string, SiteModule>; exampleNames?: Record<string, string> };
  const contract = JSON.parse(fs.readFileSync(path.join(repo, 'firmware', 'app-modular-brain', 'contract', 'module-types.json'), 'utf-8')) as { firmwareVersion: string; modules: Record<string, unknown> };
  const base = seedInternals(emptyModularProject());
  const pool = await poolPatches();

  // Voorbeeldpatches waarin een type zit (geen diagnose- of stresspatches).
  const usedBy = new Map<string, string[]>();
  for (const e of PATCH_CATALOG) {
    if (e.menu === 'diagnose' || e.menu === 'stress') continue;
    try {
      const p = e.build(structuredClone(base));
      const patch = p.patches.find((x) => x.id === p.activePatchId) ?? p.patches.at(-1);
      const inPatch = new Set(p.racks.filter((r) => patch?.rackIds.includes(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)));
      for (const m of p.modules) {
        if (!inPatch.has(m.id)) continue;
        const list = usedBy.get(m.typeId) ?? [];
        const label = contentEn(e.label) ?? site.exampleNames?.[e.label] ?? e.label;   // de site is Engels
        if (!list.includes(label)) list.push(label);
        usedBy.set(m.typeId, list);
      }
    } catch { /* een seed die niet bouwt slaan we over */ }
  }

  for (const id of ids) {
    const meta = site.modules[id];
    if (!meta) throw new Error(`${id} staat niet in site-modules.json`);
    // Afspraak met Imprint (2026-10-12): /modules toont componenten met slug
    // sw-*, en een patchpagina linkt moduleType tp_mmb_x_y naar sw-x-y.
    const want = `sw-${id.replace(/^tp_mmb_/, '').replace(/_/g, '-')}`;
    if (meta.slug !== want) throw new Error(`${id}: slug moet ${want} zijn (staat ${meta.slug})`);
    const mod = base.modules.find((m) => m.typeId === id);
    const type = base.moduleTypes.find((t) => t.id === id);
    if (!mod || !type) throw new Error(`${id}: geen module of type`);
    const help = MODULE_HELP[id];
    const textPath = path.join(siteDir, 'text', `${meta.slug}.en.md`);
    const text = sections(fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf-8') : '');
    const out = path.join(siteDir, meta.slug);
    fs.mkdirSync(out, { recursive: true });

    // Paneel
    const svg = renderToStaticMarkup(createElement(ModulePanel, { module: mod, types: base.moduleTypes, pxPerMm: 4 }));
    fs.writeFileSync(path.join(out, 'panel.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${svg.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')}`);

    const L: string[] = [`# ${meta.name}`, ''];
    const overview = text.get('Overview');
    L.push('## Overview', '', ...(help ? [help.about[1], ''] : []), ...(overview ? [overview, ''] : []));

    L.push('## Controls', '', '| Control | Range | Default | What it does |', '|---|---|---|---|');
    for (const c of resolveControls(mod, base.moduleTypes)) {
      if (c.kind === 'display' || c.kind === 'led') continue;
      // site-modules.json gaat voor: daar staat een correctie als de korte
      // uitleg in moduleHelp niet klopt met wat de firmware doet.
      const line = meta.controlHelp?.[c.id] ?? help?.controls[c.id]?.[1] ?? '';
      L.push(`| ${esc(c.label || c.id)} | ${esc(range(c))} | ${esc(defaultOf(c))} | ${esc(line)} |`);
    }
    L.push('');

    L.push('## Ports', '', '| Port | Direction | Signal | What it carries |', '|---|---|---|---|');
    for (const p of resolvePorts(mod, base.moduleTypes)) {
      L.push(`| ${esc(p.name || p.id)} | ${p.direction} | ${p.signalType} | ${esc(meta.portHelp?.[p.id] ?? '')} |`);
    }
    L.push('');

    // Openbare patches met deze module; die met Marks gekozen take eerst.
    const inPool = pool.filter((x) => x.requires?.moduleTypes?.includes(id))
      .map((x) => ({ ...x, url: x.url ?? `${SITE}/patches/${x.slug}` }))
      .sort((a, b) => Number(b.takes?.includes(meta.take ?? '') ?? false) - Number(a.takes?.includes(meta.take ?? '') ?? false)
        || Number(b.pool === 'centraal') - Number(a.pool === 'centraal'));

    // Luisteren: alleen met een openbare link naar Marks take (of de
    // openbare patch waar die take bij hoort).
    const takeUrl = meta.takeUrl ?? inPool.find((x) => meta.take && x.takes?.includes(meta.take))?.url;
    if (takeUrl) L.push('## Listen', '', `A recording on the MusicBrain Brain, with the patch it was played on: <${takeUrl}>`, '');

    const how = text.get('How it works');
    if (how) L.push('## How it works', '', how, '');

    L.push('## Runs on', '');
    L.push(`- **Teensy 4.1** (the MusicBrain Brain)${meta.cpu ? `: about **${meta.cpu.percent} % CPU per instance**, measured on firmware ${meta.cpu.fw}.` : '.'}`);
    L.push('- **The browser**: the editor\'s simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.');
    if (!contract.modules[id]) L.push('- *Not yet in the firmware contract: editor only.*');
    L.push('');

    const examples = usedBy.get(id) ?? [];
    L.push('## Try it', '');
    if (inPool.length) L.push(`Patches to play (open them in the editor from their page): ${inPool.map((x) => `[${x.title}](${x.url})`).join(', ')}.`, '');
    if (meta.try) L.push(meta.try, '');
    if (examples.length) L.push(`In the editor's example set: ${examples.map((x) => `*${x}*`).join(', ')}.`, '');
    L.push('Editor: <https://editor.musicbrain.nl>', '');

    for (const h of ['Sources & licences', 'Versions']) {
      const body = text.get(h);
      if (body) L.push(`## ${h}`, '', body, '');
    }

    fs.writeFileSync(path.join(out, 'module.md'), L.join('\n'));
    fs.writeFileSync(path.join(out, 'beschrijving.txt'), (help?.about[1] ?? meta.name) + '\n');
    console.log(`${meta.slug}: ${path.relative(repo, out)} (panel.svg, module.md, beschrijving.txt)`);
  }
}

void main();
