// Geen echte test: maakt een lyricbank (.mmbl) van wav-bestanden, zolang de
// editor er nog geen venster voor heeft. Draait alleen met MMB_LYRIC_MANIFEST:
//
//   MMB_LYRIC_MANIFEST=liedje.json MMB_LYRIC_OUT=00.mmbl \
//     npx vitest run src/modular-mb/lyric/makeLyricBank.test.ts
//
// Het manifest (paden relatief aan het manifest zelf):
//
//   { "name": "Zonnetje",
//     "items": [ { "wav": "zonnetje.wav", "syllables": ["zon", "ne", "tje"] },
//                { "wav": "hallo.wav",    "syllables": ["hal", "lo"] } ] }
//
// Zonder "syllables" zoekt de analyse zelf de lettergrepen. De samenvatting
// (duur, toonhoogte, marks, klinkerkern per lettergreep) komt op de console.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';

import { parseWav } from '../sim/takeEdit';
import { analyzeRecording, type SyllableAnalysis } from './analyze';
import { buildLyricBank, fromAnalysis, lyricSummary } from './lyricBank';

interface Manifest { name: string; items: { wav: string; syllables?: string[] }[] }

it.skipIf(!process.env.MMB_LYRIC_MANIFEST)('lyricbank uit een manifest', () => {
  const file = process.env.MMB_LYRIC_MANIFEST!;
  const manifest = JSON.parse(readFileSync(file, 'utf-8')) as Manifest;
  const dir = path.dirname(file);
  const all: SyllableAnalysis[] = [];
  for (const item of manifest.items) {
    const wav = parseWav(new Uint8Array(readFileSync(path.resolve(dir, item.wav))));
    const n = wav.channels[0]!.length;
    const mono = new Float32Array(n);
    for (const ch of wav.channels) for (let i = 0; i < n; i++) mono[i] = mono[i]! + ch[i]! / wav.channels.length;
    const syl = analyzeRecording(mono, wav.sampleRate, { syllables: item.syllables });
    if (item.syllables && syl.length !== item.syllables.length) {
      console.warn(`${item.wav}: ${item.syllables.length} lettergrepen gevraagd, ${syl.length} gevonden`);
    }
    all.push(...syl);
  }
  const bank = fromAnalysis(manifest.name, all);
  console.log(lyricSummary(bank));
  const out = process.env.MMB_LYRIC_OUT ?? file.replace(/\.json$/i, '.mmbl');
  writeFileSync(out, new Uint8Array(buildLyricBank(bank)));
  console.log(`→ ${out}`);
});
