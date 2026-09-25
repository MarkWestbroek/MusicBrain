#!/usr/bin/env node
// Schrijft editor/public/banks/index.json: welke samplebanken de server heeft
// (bestand, naam uit de kop, grootte) en welk bestand de simulator standaard
// laadt voor bank-knop NN (0–15). De simulator gebruikt dit om de bank van
// een sampler zelf op te halen (sim/bankAutoLoad.ts); met een Teensy aan de
// kabel wint de bank met dezelfde naam als op de SD-kaart.
//
//   node scripts/bank-index.mjs          index verversen; bestaande
//                                         "defaults" blijven staan
//
// Draai hem na het toevoegen of hernoemen van een bank en commit index.json.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "banks");
const out = join(dir, "index.json");

async function headerName(file) {
  const buf = await readFile(file);
  if (buf.subarray(0, 4).toString("latin1") !== "MMBS") return null;
  const raw = buf.subarray(16, 44);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? 28 : end).toString("utf8");
}

const old = existsSync(out) ? JSON.parse(await readFile(out, "utf8")) : { defaults: {} };
// Grote banken uit de GitHub-release staan niet altijd lokaal; houd die uit
// de oude index vast, zodat een index-run op een machine zonder ze ze niet wist.
const files = new Map((old.files ?? []).map((f) => [f.file, f]));
for (const f of (await readdir(dir)).filter((x) => x.endsWith(".mmbs")).sort()) {
  const name = await headerName(join(dir, f));
  if (name === null) continue;
  files.set(f, { file: f, name, size: (await stat(join(dir, f))).size });
}
const list = [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
const defaults = { ...(old.defaults ?? {}) };
if (Object.keys(defaults).length === 0) {
  // Eerste keer: kleine banken eerst op de nummers 0–15.
  [...list].sort((a, b) => a.size - b.size).slice(0, 16).forEach((f, i) => { defaults[String(i)] = f.file; });
}
await writeFile(out, JSON.stringify({ note: "gegenereerd door scripts/bank-index.mjs; defaults = bank-knop NN → bestand", files: list, defaults }, null, 2) + "\n");
console.log(`bank-index: ${list.length} banken, ${Object.keys(defaults).length} standaardnummers → ${out}`);
