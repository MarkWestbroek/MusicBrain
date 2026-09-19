#!/usr/bin/env node
// Samplebanken buiten git: het manifest (editor/banks.json) staat in git, de
// bestanden hangen als bijlage aan de GitHub-release `banks`.
//
//   npm run banks                        ontbrekende/gewijzigde banken ophalen
//                                        naar public/banks/ (desktop, VPS-build)
//   npm run banks:publish -- <bestand>   bank uploaden naar de release en in
//                                        het manifest zetten (vereist `gh`)
//
// Een bank die er al staat met de juiste sha256 wordt niet opnieuw gehaald.
// Een download met een verkeerde sha256 breekt af: de build faalt dan, en de
// live editor blijft staan. Zie doc/editor-deploy.md.

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = "MarkWestbroek/MusicBrain";
const editorDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(editorDir, "banks.json");
const banksDir = join(editorDir, "public", "banks");

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
  await mkdir(banksDir, { recursive: true });
  if (manifest.banks.length === 0) {
    console.log("banks: manifest is leeg — niets op te halen");
    return;
  }
  for (const bank of manifest.banks) {
    const target = join(banksDir, bank.file);
    if (existsSync(target) && (await sha256(target)) === bank.sha256) {
      console.log(`banks: ✓ ${bank.file} (al aanwezig)`);
      continue;
    }
    const url = `https://github.com/${REPO}/releases/download/${manifest.release}/${encodeURIComponent(bank.asset)}`;
    console.log(`banks: ↓ ${bank.file} (${mb(bank.size)})`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${bank.file}: download faalde (${res.status} ${res.statusText}) — ${url}`);
    const tmp = `${target}.download`;
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    const got = await sha256(tmp);
    if (got !== bank.sha256) {
      await rm(tmp, { force: true });
      throw new Error(`${bank.file}: sha256 klopt niet (verwacht ${bank.sha256}, kreeg ${got})`);
    }
    await rename(tmp, target);
    console.log(`banks: ✓ ${bank.file}`);
  }
}

async function publishBank(file) {
  if (!file || !existsSync(file)) throw new Error("gebruik: npm run banks:publish -- <pad/naar/bank.mmbs>");
  const manifest = await readManifest();
  const name = basename(file);
  // GitHub vervangt spaties in bijlagenamen; kies zelf een veilige naam.
  const asset = name.replace(/[^A-Za-z0-9._-]+/g, "-");
  const hash = await sha256(file);
  const { size } = await stat(file);

  const gh = (...args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
  try {
    gh("release", "view", manifest.release, "-R", REPO);
  } catch {
    console.log(`banks: release '${manifest.release}' bestaat nog niet — aanmaken`);
    gh("release", "create", manifest.release, "-R", REPO, "--title", "Samplebanken",
      "--notes", "Samplebanken voor de editor die niet in git passen. Beheerd met `npm run banks:publish` (editor/scripts/banks.mjs); welke er gebruikt worden staat in editor/banks.json.");
  }
  const staged = join(tmpdir(), asset);
  await copyFile(file, staged);
  console.log(`banks: ↑ ${asset} (${mb(size)})`);
  execFileSync("gh", ["release", "upload", manifest.release, staged, "-R", REPO, "--clobber"], { stdio: "inherit" });
  await rm(staged, { force: true });

  const entry = { file: name, asset, sha256: hash, size };
  const i = manifest.banks.findIndex((b) => b.file === name);
  if (i >= 0) manifest.banks[i] = entry;
  else manifest.banks.push(entry);
  manifest.banks.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // Ook lokaal op z'n plek, zodat `npm run dev` hem meteen heeft.
  const local = join(banksDir, name);
  if (!existsSync(local)) {
    await mkdir(banksDir, { recursive: true });
    await copyFile(file, local);
  }

  console.log(`banks: ✓ ${name} gepubliceerd — commit en push editor/banks.json om hem live te zetten`);
}

const [cmd, arg] = process.argv.slice(2);
const run = cmd === "publish" ? publishBank(arg) : fetchBanks();
run.catch((err) => {
  console.error(`banks: ${err.message}`);
  process.exit(1);
});
