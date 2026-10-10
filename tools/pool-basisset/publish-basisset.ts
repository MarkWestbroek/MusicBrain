// De basisset uit de code naar de pool op musicbrain.nl
// (doc/plans/editor-structuur.md stap 9, besluit 1: de code is de bron).
//
//   node tools/mmb-mcp/node_modules/tsx/dist/cli.mjs tools/pool-basisset/publish-basisset.ts            # proefstand
//   node tools/mmb-mcp/node_modules/tsx/dist/cli.mjs tools/pool-basisset/publish-basisset.ts --out dir  # en de bestanden bekijken
//   MMB_POOL_TOKEN=… node … publish-basisset.ts --send                                                # echt insturen
//
// Voor elke patch van de standaardset (patchCatalog, menu `basisset`):
// bouwen, langs de patchcontrole, en dezelfde bestanden maken als de knop
// ⤴ Voorstellen in de editor: de momentopname (.patch.json), de SysEx en de
// front-hoes (SVG), met de versie-eisen (`requires`). Licentie CC0, labels
// `basisset` en `mmb-<id>`.
//
// De API kan niets rechtstreeks in `centraal` zetten: een token stuurt
// voorstellen in, en Mark zet ze in de admin op `centraal` (één veld). Het
// script stuurt niets dubbel: een patch waarvan het label `mmb-<id>` al in
// `centraal` of (met token) bij de voorstellen staat, slaat het over.
//
// Zonder --send stuurt het niets: het toont per patch wat het zou doen. Het
// token komt uit MMB_POOL_TOKEN en wordt nooit getoond; het heeft de scopes
// "propose patches" en "upload media" nodig.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// De front-hoes wordt met React gerenderd; buiten de Vite-bouw verwacht de
// JSX `React` als globale naam. Dezelfde React als de editor gebruikt.
import React from '../../editor/node_modules/react/index.js';
(globalThis as { React?: unknown }).React = React;

import { resolveBuildInfo } from '../../editor/build-info';
import { frontForPool, frontSvg } from '../../editor/src/modular-mb/frontSvg';
import { catalogMenu, type CatalogEntry } from '../../editor/src/modular-mb/patchCatalog';
import { checkPatch } from '../../editor/src/modular-mb/patchCheck';
import { seedInternals } from '../../editor/src/modular-mb/seedModules';
import { emptyModularProject, type ModularProject } from '../../editor/src/modular-mb/types';
import { DEFAULT_LIBRARY, type LibrarySettings } from '../../editor/src/modular-mb/sim/mediaLibrary';
import { patchSnapshot, slimSnapshot } from '../../editor/src/modular-mb/sim/midiRecorder';
import { listPool, proposePatch, type PoolItem } from '../../editor/src/modular-mb/sim/patchPool';
import { patchRequires, splitDescribe } from '../../editor/src/modular-mb/sim/patchRequires';
import { encodePatchSysex, joinSysex, SYSEX_CMD } from '../../editor/src/modular-mb/sim/patchSysex';
import { buildConfigPayload } from '../../editor/src/modular-mb/teensyLink';

const args = process.argv.slice(2);
const send = args.includes('--send');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;
const token = (process.env.MMB_POOL_TOKEN ?? '').trim();
const endpoint = (process.env.MMB_LIBRARY_ENDPOINT ?? '').trim() || DEFAULT_LIBRARY.endpoint;
const lib: LibrarySettings = { ...DEFAULT_LIBRARY, endpoint, token, folder: 'patches/basisset', tags: [] };

if (send && !token) {
  console.error('--send vraagt een token in MMB_POOL_TOKEN (scopes: propose patches, upload media).');
  process.exit(1);
}

/** Label zonder emoji vooraan: de titel in de pool. */
const titleOf = (e: CatalogEntry): string => e.label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
/** Het vaste label waaraan het script een patch in de pool herkent. */
const tagOf = (e: CatalogEntry): string => `mmb-${e.id.replace(/^basisset\//, '')}`;

const editorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../editor');
// Zoals de live editor (Docker-bouw zonder git): de contractversie is de
// editorversie. Een git-tag hier zou een oude editor/cortex-tag kunnen zijn.
const built = resolveBuildInfo({ editorDir, describe: () => '' });
const info = { ...splitDescribe(built.editorVersion), firmwareContract: built.firmwareContract };
if (!info.editorVersion || !info.firmwareContract) {
  console.error(`Versie onbekend (editor "${info.editorVersion}", contract "${info.firmwareContract}"); de pool zou weigeren.`);
  process.exit(1);
}

async function main(): Promise<void> {
  // Wat staat er al? Centraal is openbaar; voorstellen alleen met token.
  const present = new Map<string, string>();   // label → pool
  for (const pool of ['centraal', ...(token ? ['voorstel'] : [])] as const) {
    try {
      const items: PoolItem[] = await listPool({ pool }, lib);
      for (const it of items) for (const t of it.tags ?? []) if (t.startsWith('mmb-')) present.set(t, it.pool);
    } catch (err) {
      console.error(`Pool ${pool} niet te lezen: ${err instanceof Error ? err.message : String(err)}`);
      if (send) process.exit(1);
    }
  }

  const base = seedInternals(emptyModularProject());
  const entries = catalogMenu('basisset');
  console.log(`${send ? 'INSTUREN' : 'Proefstand'}: ${entries.length} patches, editor ${info.editorVersion}${info.editorBuild ? ` (${info.editorBuild})` : ''}, contract ${info.firmwareContract}, pool ${endpoint.replace(/\/api\/media$/, '')}\n`);
  let sent = 0, skipped = 0, failed = 0;
  for (const e of entries) {
    const tag = tagOf(e);
    const title = titleOf(e);
    const p: ModularProject = e.build(base);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const findings = checkPatch(patch, p).filter((f) => f.kind !== 'signal-mismatch');
    if (findings.length) {
      console.log(`✕ ${title}: patchcontrole: ${findings.map((f) => f.message).join('; ')}`);
      failed++; continue;
    }
    const snap = patchSnapshot(p, patch);
    const requires = patchRequires(snap, info);
    const json = JSON.stringify(snap, null, 1);
    const syx = joinSysex([
      ...await encodePatchSysex(SYSEX_CMD.firmwareConfig, buildConfigPayload(snap).json),
      ...await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify(slimSnapshot(snap))),
    ]);
    const front = frontSvg(frontForPool(patch, p), patch, p);
    const where = present.get(tag);
    const sizes = `${Math.round(json.length / 1024)} KB json, ${Math.round(syx.length / 1024)} KB syx, ${requires.moduleTypes.length} moduletypes`;
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${tag}.patch.json`), json);
      fs.writeFileSync(path.join(outDir, `${tag}.syx`), syx);
      fs.writeFileSync(path.join(outDir, `${tag}.front.svg`), front);
    }
    if (where) { console.log(`= ${title} [${tag}]: staat al in ${where}`); skipped++; continue; }
    if (!send) { console.log(`+ ${title} [${tag}]: zou ingestuurd worden (${sizes})`); continue; }
    try {
      const item = await proposePatch(
        { kind: 'proposal', title, description: e.title ?? '', tags: ['basisset', tag], license: 'CC0', requires },
        { group: `${tag}-basisset`, patchJson: new Blob([json], { type: 'application/json' }), syx: new Blob([syx], { type: 'application/octet-stream' }),
          front: new Blob([front], { type: 'image/svg+xml' }) },
        [], lib,
      );
      console.log(`✓ ${title} [${tag}]: voorgesteld als ${item.slug}`);
      sent++;
    } catch (err) {
      console.log(`✕ ${title} [${tag}]: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  console.log(`\n${send ? `${sent} ingestuurd` : 'niets ingestuurd (proefstand)'}, ${skipped} stonden er al, ${failed} mislukt.`);
  if (send && sent) console.log('Zet de voorstellen in de admin op pool "centraal" (licentie staat al op CC0).');
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
