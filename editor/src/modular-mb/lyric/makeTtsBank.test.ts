// Geen echte test: maakt een lyricbank van getypte tekst via de Piper-dienst
// (tools/piper-tts), zonder de editor. Draait alleen met MMB_TTS_TEXT:
//
//   MMB_TTS_TEXT="zon-ne-tje | slaap kind-je slaap" MMB_TTS_OUT=00.mmbl \
//     npx vitest run src/modular-mb/lyric/makeTtsBank.test.ts --silent=false
//
// Regels scheid je met |. Verder: MMB_TTS_ENDPOINT (standaard de dienst op je
// eigen computer), MMB_TTS_VOICE, MMB_TTS_SCALE (tempo), MMB_TTS_CODE,
// MMB_TTS_NAME.

import { writeFileSync } from 'node:fs';
import { it } from 'vitest';

import { analyzeRecording, type SyllableAnalysis } from './analyze';
import { buildLyricBank, fromAnalysis, lyricSummary } from './lyricBank';
import { TTS_LOCAL_ENDPOINT, spansFromPhonemes, speak } from './tts';

const splitText = (t: string): string[] => t.split(/[\s\-·]+/).filter((s) => s.length > 0);
const spoken = (t: string): string => t.replace(/[-·]+/g, '').replace(/\s+/g, ' ').trim();

it.skipIf(!process.env.MMB_TTS_TEXT)('lyricbank uit tekst', async () => {
  const settings = {
    endpoint: process.env.MMB_TTS_ENDPOINT ?? TTS_LOCAL_ENDPOINT,
    code: process.env.MMB_TTS_CODE ?? '',
    voice: process.env.MMB_TTS_VOICE ?? 'nl_NL-pim-medium',
    lengthScale: Number(process.env.MMB_TTS_SCALE ?? 1.3),
    speaker: Number(process.env.MMB_TTS_SPEAKER ?? 0),
  };
  const all: SyllableAnalysis[] = [];
  for (const line of process.env.MMB_TTS_TEXT!.split('|').map((l) => l.trim()).filter(Boolean)) {
    const r = await speak(settings, spoken(line));
    const mono = new Float32Array(r.pcm.length);
    for (let i = 0; i < mono.length; i++) mono[i] = r.pcm[i]! / 32768;
    const syl = splitText(line);
    const spans = spansFromPhonemes(syl, r.phonemes, r.rate);
    console.log(`"${spoken(line)}": ${(mono.length / r.rate).toFixed(2)} s, ${r.phonemes.map((p) => p.p).join('')} → `
      + (spans ? 'grenzen uit de tekst' : 'aantal kernen past niet, grenzen geschat'));
    all.push(...analyzeRecording(mono, r.rate, spans ? { syllables: syl, spans } : { syllables: syl }));
  }
  const bank = fromAnalysis(process.env.MMB_TTS_NAME ?? `Piper ${settings.voice.split('-')[1] ?? ''}`.trim(), all);
  console.log(lyricSummary(bank));
  if (process.env.MMB_TTS_OUT) {
    writeFileSync(process.env.MMB_TTS_OUT, new Uint8Array(buildLyricBank(bank)));
    console.log(`→ ${process.env.MMB_TTS_OUT}`);
  }
}, 120_000);
