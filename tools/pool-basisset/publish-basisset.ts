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
// De API kan niets in `centraal` zetten (besluit Imprint 2026-10-11): een
// token stuurt voorstellen in, en Mark zet ze in de admin op `centraal`.
//
// Per patch kiest het script:
//   nieuw        geen patch met label `mmb-<id>` in de pool → POST (voorstel)
//   ongewijzigd  wel, met dezelfde vingerafdruk `mmb-v-<hash>` → overslaan
//   afgewezen    in pool `afgewezen` (Mark wees hem af, met reden) → overslaan,
//                ook als hij in de code veranderd is: alleen de redactie zet
//                hem terug ("Terug naar voorstel" in /admin/patches)
//   gewijzigd    wel, met een andere vingerafdruk → nieuwe bestanden en
//                PATCH /api/patches/<slug> op dezelfde slug. Imprint zet hem
//                dan terug op `voorstel`, ook vanuit `centraal`: Marks
//                oordeel geldt per inhoud. Bedoeld gedrag.
// De vingerafdruk is over de patch zelf (slimSnapshot, zonder moduletypes),
// met de id's die de bouw willekeurig maakt vervangen door volgnummers.
// Zonder dat zou elke run alles bijwerken en de hele basisset terug in de
// wachtrij zetten; een wijziging aan een moduletype telt niet mee.
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
import { contentHash } from './contentHash';
import { frontForPool, frontSvg } from '../../editor/src/modular-mb/frontSvg';
import { catalogMenu, type CatalogEntry } from '../../editor/src/modular-mb/patchCatalog';
import { checkPatch } from '../../editor/src/modular-mb/patchCheck';
import { seedInternals } from '../../editor/src/modular-mb/seedModules';
import { emptyModularProject, type ModularProject } from '../../editor/src/modular-mb/types';
import { DEFAULT_LIBRARY, uploadTake, type LibrarySettings, type UploadedAsset } from '../../editor/src/modular-mb/sim/mediaLibrary';
import { patchSnapshot, slimSnapshot } from '../../editor/src/modular-mb/sim/midiRecorder';
import { assetRef, listPool, patchesUrl, proposePatch, type PoolItem } from '../../editor/src/modular-mb/sim/patchPool';
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

/** Een bestand naar de library (één group per patch), zoals proposePatch doet. */
async function upload(group: string, name: string, blob: Blob): Promise<UploadedAsset> {
  const [a] = await uploadTake({ group, files: [{ name, blob }] }, lib);
  if (!a) throw new Error(`De library gaf geen asset terug voor ${name}.`);
  return a;
}

async function main(): Promise<void> {
  // Wat staat er al? De openbare pools zonder token, de voorstellen met.
  const present = new Map<string, PoolItem>();   // label mmb-<id> → item
  const counts: string[] = [];
  for (const pool of ['centraal', 'experimenteel', ...(token ? ['voorstel', 'afgewezen'] : [])] as const) {
    try {
      const items: PoolItem[] = await listPool({ pool }, lib);
      let n = 0;
      for (const it of items) for (const t of it.tags ?? []) if (/^mmb-(?!v-)/.test(t)) { present.set(t, it); n++; }
      counts.push(`${pool} ${n}`);
    } catch (err) {
      console.error(`Pool ${pool} niet te lezen: ${err instanceof Error ? err.message : String(err)}`);
      if (send) process.exit(1);
    }
  }

  // Zonder token ziet het script de voorstellen niet (die zijn niet
  // openbaar): wat al is ingestuurd maar nog niet op centraal staat, lijkt
  // dan nieuw. Zeg dat duidelijk; --send vraagt sowieso een token.
  console.log(`Token: ${token ? 'ja' : 'NEE'}. Basisset-patches gevonden: ${counts.join(', ')}.`);
  if (!token) console.log('Let op: zonder token zie ik de voorstellen niet; wat al is ingestuurd maar nog niet op centraal staat, telt hieronder als nieuw.\n');

  const base = seedInternals(emptyModularProject());
  const entries = catalogMenu('basisset');
  console.log(`${send ? 'INSTUREN' : 'Proefstand'}: ${entries.length} patches, editor ${info.editorVersion}${info.editorBuild ? ` (${info.editorBuild})` : ''}, contract ${info.firmwareContract}, pool ${endpoint.replace(/\/api\/media$/, '')}\n`);
  let created = 0, updated = 0, same = 0, failed = 0;
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
    const vtag = `mmb-v-${contentHash(snap)}`;
    const tags = ['basisset', tag, vtag];
    const json = JSON.stringify(snap, null, 1);
    const syx = joinSysex([
      ...await encodePatchSysex(SYSEX_CMD.firmwareConfig, buildConfigPayload(snap).json),
      ...await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify(slimSnapshot(snap))),
    ]);
    const front = frontSvg(frontForPool(patch, p), patch, p);
    const sizes = `${Math.round(json.length / 1024)} KB json, ${Math.round(syx.length / 1024)} KB syx, ${requires.moduleTypes.length} moduletypes`;
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${tag}.patch.json`), json);
      fs.writeFileSync(path.join(outDir, `${tag}.syx`), syx);
      fs.writeFileSync(path.join(outDir, `${tag}.front.svg`), front);
    }
    const old = present.get(tag);
    if (old?.pool === 'afgewezen') {
      const why = (old as PoolItem & { rejection?: { reason?: string; at?: string } }).rejection;
      console.log(`- ${title} [${tag}]: afgewezen${why?.at ? ` op ${why.at}` : ''}${why?.reason ? `: ${why.reason}` : ''}; niet opnieuw insturen`);
      same++; continue;
    }
    if (old && (old.tags ?? []).includes(vtag)) { console.log(`= ${title} [${tag}]: ongewijzigd (${old.pool})`); same++; continue; }
    if (!send) {
      console.log(old
        ? `~ ${title} [${tag}]: zou bijgewerkt worden op ${old.slug}; gaat daarna terug naar voorstel (nu ${old.pool})`
        : `+ ${title} [${tag}]: zou ingestuurd worden (${sizes})`);
      continue;
    }
    try {
      if (!old) {
        const item = await proposePatch(
          { kind: 'proposal', title, description: e.title ?? '', tags, license: 'CC0', requires },
          { group: `${tag}-basisset`, patchJson: new Blob([json], { type: 'application/json' }), syx: new Blob([syx], { type: 'application/octet-stream' }),
            front: new Blob([front], { type: 'image/svg+xml' }) },
          [], lib,
        );
        console.log(`✓ ${title} [${tag}]: voorgesteld als ${item.slug}`);
        created++;
        continue;
      }
      const group = `${tag}-basisset-${vtag.slice(6)}`;
      const file = await upload(group, `${group}.patch.json`, new Blob([json], { type: 'application/json' }));
      const syxA = await upload(group, `${group}.syx`, new Blob([syx], { type: 'application/octet-stream' }));
      const frontA = await upload(group, `${group}.front.svg`, new Blob([front], { type: 'image/svg+xml' }));
      const res = await fetch(`${patchesUrl(lib)}/${encodeURIComponent(old.slug)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: e.title ?? '', tags, requires, file: assetRef(file), syx: assetRef(syxA), front: assetRef(frontA) }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; changed?: string[]; requeued?: boolean; pool?: string };
      if (!res.ok) throw new Error(`HTTP ${res.status}${body.error ? `: ${body.error}` : ''}`);
      console.log(`↻ ${title} [${tag}]: bijgewerkt op ${old.slug} (${(body.changed ?? []).join(', ') || 'niets'})${body.requeued ? ', terug naar voorstel' : ''}`);
      updated++;
    } catch (err) {
      console.log(`✕ ${title} [${tag}]: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  console.log(`\n${send ? `${created} ingestuurd, ${updated} bijgewerkt` : 'niets verstuurd (proefstand)'}, ${same} ongewijzigd, ${failed} mislukt.`);
  if (send && (created || updated)) console.log('Zet de nieuwe en bijgewerkte voorstellen in de admin op pool "centraal" (licentie staat al op CC0).');
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
