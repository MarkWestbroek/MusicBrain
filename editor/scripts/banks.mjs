#!/usr/bin/env node
// Grote bestanden onder public/ die niet in git kunnen of mogen (samplebanken,
// de DX7-ROM's, …): het manifest (editor/banks.json) staat in git, de
// bestanden hangen als bijlage aan de GitHub-release `banks`. Elk item heeft
// een pad onder public/ — het soort bestand maakt niet uit.
//
//   npm run banks                                  ontbrekende/gewijzigde bestanden
//                                                  ophalen (desktop, VPS-build)
//   npm run banks:publish -- <bestand>             uploaden + in het manifest;
//                                                  het bestand staat al onder public/
//   npm run banks:publish -- <bestand> --to dx7    idem, bestand staat ergens anders:
//                                                  komt in public/dx7/
//
// Een bank die er al staat met de juiste sha256 wordt niet opnieuw gehaald.
// Een download met een verkeerde sha256 breekt af: de build faalt dan, en de
// live editor blijft staan. Zie doc/editor-deploy.md.

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = "MarkWestbroek/MusicBrain";
const editorDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(editorDir, "banks.json");
const publicDir = join(editorDir, "public");

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

async function readManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

async function fetchBanks() {
  const manifest = await readManifest();
  if (manifest.files.length === 0) {
    console.log("banks: manifest is leeg — niets op te halen");
    return;
  }
  for (const item of manifest.files) {
    const target = join(publicDir, ...item.path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    if (existsSync(target) && (await sha256(target)) === item.sha256) {
      console.log(`banks: ✓ ${item.path} (al aanwezig)`);
      continue;
    }
    const url = `https://github.com/${REPO}/releases/download/${manifest.release}/${encodeURIComponent(item.asset)}`;
    console.log(`banks: ↓ ${item.path} (${mb(item.size)})`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${item.path}: download faalde (${res.status} ${res.statusText}) — ${url}`);
    const tmp = `${target}.download`;
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    const got = await sha256(tmp);
    if (got !== item.sha256) {
      await rm(tmp, { force: true });
      throw new Error(`${item.path}: sha256 klopt niet (verwacht ${item.sha256}, kreeg ${got})`);
    }
    await rename(tmp, target);
    console.log(`banks: ✓ ${item.path}`);
  }
}

async function publishBank(file, to) {
  if (!file || !existsSync(file)) {
    throw new Error("gebruik: npm run banks:publish -- <bestand> [--to <map onder public/>]");
  }
  const abs = resolve(file);
  const inPublic = relative(publicDir, abs);
  let path;
  if (to) path = `${to.replace(/^\/+|\/+$/g, "")}/${basename(abs)}`;
  else if (!inPublic.startsWith("..") && !inPublic.includes(":")) path = inPublic.split(sep).join("/");
  else throw new Error(`${file} staat niet onder editor/public/ — geef met --to aan waar hij hoort (bv. --to dx7)`);

  const manifest = await readManifest();
  // Eén platte release voor alle mappen: het pad zit in de bijlagenaam
  // ("dx7/roms.bin" → "dx7--roms.bin"). GitHub vervangt zelf rare tekens; wij eerst.
  const asset = path.replace(/\//g, "--").replace(/[^A-Za-z0-9._-]+/g, "-");
  const hash = await sha256(abs);
  const { size } = await stat(abs);

  const gh = (...args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
  try {
    gh("release", "view", manifest.release, "-R", REPO);
  } catch {
    console.log(`banks: release '${manifest.release}' bestaat nog niet — aanmaken`);
    gh("release", "create", manifest.release, "-R", REPO, "--title", "Grote bestanden voor de editor",
      "--notes", "Samplebanken, ROM's en andere grote bestanden voor editor/public/ die niet in git passen. Beheerd met `npm run banks:publish` (editor/scripts/banks.mjs); welke er gebruikt worden staat in editor/banks.json.");
  }
  const staged = join(tmpdir(), asset);
  await copyFile(abs, staged);
  console.log(`banks: ↑ ${path} als ${asset} (${mb(size)})`);
  execFileSync("gh", ["release", "upload", manifest.release, staged, "-R", REPO, "--clobber"], { stdio: "inherit" });
  await rm(staged, { force: true });

  const entry = { path, asset, sha256: hash, size };
  const i = manifest.files.findIndex((f) => f.path === path);
  if (i >= 0) manifest.files[i] = entry;
  else manifest.files.push(entry);
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // Ook lokaal op z'n plek, zodat `npm run dev` hem meteen heeft.
  const local = join(publicDir, ...path.split("/"));
  if (!existsSync(local)) {
    await mkdir(dirname(local), { recursive: true });
    await copyFile(abs, local);
  }
  console.log(`banks: ✓ ${path} gepubliceerd — commit en push editor/banks.json om hem live te zetten`);
}

const [cmd, ...rest] = process.argv.slice(2);
const toIdx = rest.indexOf("--to");
const to = toIdx >= 0 ? rest[toIdx + 1] : undefined;
const fileArg = rest.filter((_, i) => toIdx < 0 || (i !== toIdx && i !== toIdx + 1))[0];
const run = cmd === "publish" ? publishBank(fileArg, to) : fetchBanks();
run.catch((err) => {
  console.error(`banks: ${err.message}`);
  process.exit(1);
});
