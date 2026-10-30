#!/usr/bin/env node
// Schrijft editor/public/banks/index.json: welke samplebanken de server heeft
// (bestand, naam uit de kop, grootte) en welk bestand de simulator standaard
// laadt voor bank-knop NN (0–63). De simulator gebruikt dit om de bank van
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

// Nette titels voor de weergave (Bank-knop, display, plugin), waar de naam
// in de kop een afgekapte bestandsnaam is. `name` blijft de kop: daarop
// koppelt de simulator aan de banken op de SD-kaart (sim/bankAutoLoad.ts).
const TITLES = {
  'elements.mmbs': 'Elements (test)',
  'handdrum 2 velocities normalised v2.mmbs': 'Hand Drum (2 lagen)',
  'small bells trimmed normalised v3 looped.mmbs': 'Small Bells (lus)',
  'small bells trimmed normalised v3.mmbs': 'Small Bells',
};

const old = existsSync(out) ? JSON.parse(await readFile(out, "utf8")) : { defaults: {} };
// Grote banken uit de GitHub-release staan niet altijd lokaal; houd die uit
// de oude index vast, zodat een index-run op een machine zonder ze ze niet wist.
const files = new Map((old.files ?? []).map((f) => [f.file, f]));
for (const f of (await readdir(dir)).filter((x) => x.endsWith(".mmbs")).sort()) {
  const name = await headerName(join(dir, f));
  if (name === null) continue;
  files.set(f, { file: f, name, ...(TITLES[f] ? { title: TITLES[f] } : {}), size: (await stat(join(dir, f))).size });
}
const list = [...files.values()].map((f) => (TITLES[f.file] ? { ...f, title: TITLES[f.file] } : f)).sort((a, b) => a.file.localeCompare(b.file));
// Vaste nummering = die op de SD-kaart van de Teensy (/mmb/banks/NN.mmbs),
// uitgelezen 25-09-2026 met tools/teensy-live/bank_put.py --list. Zo tonen sim
// en Teensy bij hetzelfde nummer dezelfde bank. Andere bestanden blijven in
// `files` staan zonder nummer. Pas deze tabel aan als de kaart verandert.
const SD_BANKS = {
  0: 'gu-rhodes.mmbs',                                   // Tine Electric Piano
  1: 'ydp-grand-2laags.mmbs',                            // Grand Piano (2 lagen), 61 MB
  2: 'gu-kalimba.mmbs',
  3: 'gu-warmpad.mmbs',
  4: 'church-organ.mmbs',
  5: 'gu-choir.mmbs',
  6: 'gu-marimba.mmbs',
  7: 'gu-flute.mmbs',                                     // was shakuhachi; 2026-10-30 omgedraaid met 20 (Mark: fluit belangrijker)
  8: 'gu-sitar.mmbs',
  9: 'gu-tonewheel-organ.mmbs',
  10: 'gu-tubular-bells.mmbs',
  11: 'gu-vibraphone.mmbs',
  12: 'small bells trimmed normalised v3 looped.mmbs',
  13: 'gu-koto.mmbs',
  14: 'elements.mmbs',
  15: 'ydp-grand.mmbs',                                  // Grand Piano, 115 MB
  // 16–30 (fw 0.5.119, 64 banken): de rest van public/banks. Nog niet op de
  // kaart van de Teensy; zet ze erop met bank_put.py als hij terug is.
  16: 'gu-atmosphere.mmbs',
  17: 'gu-bowed-glass.mmbs',
  18: 'gu-church-bells.mmbs',
  19: 'gu-fantasia.mmbs',
  20: 'gu-shakuhachi.mmbs',
  21: 'gu-harp.mmbs',
  22: 'gu-ice-rain.mmbs',
  23: 'gu-nylon-guitar.mmbs',
  24: 'gu-pizzicato.mmbs',
  25: 'gu-recorder.mmbs',
  26: 'gu-steeldrums.mmbs',
  27: 'gu-strings.mmbs',
  28: 'gu-taiko.mmbs',
  29: 'handdrum 2 velocities normalised v2.mmbs',
  30: 'small bells trimmed normalised v3.mmbs',
};
const defaults = {};
for (const [nn, file] of Object.entries(SD_BANKS)) {
  if (!files.has(file)) { console.error(`bank-index: ${file} (bank ${nn}) staat niet in public/banks`); process.exit(1); }
  defaults[nn] = file;
}
await writeFile(out, JSON.stringify({ note: "gegenereerd door scripts/bank-index.mjs; defaults = bank-knop NN → bestand", files: list, defaults }, null, 2) + "\n");
console.log(`bank-index: ${list.length} banken, ${Object.keys(defaults).length} standaardnummers → ${out}`);
