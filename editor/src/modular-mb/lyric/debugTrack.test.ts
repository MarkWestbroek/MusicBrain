// Geen echte test: toont het toonhoogtespoor van een wav, per 10 ms, om de
// analyse bij te stellen. Draait alleen met MMB_LYRIC_DEBUG=<wav>.
import { readFileSync } from 'node:fs';
import { it } from 'vitest';

import { parseWav } from '../sim/takeEdit';
import { LYRIC_RATE, placeMarks, resample, splitSyllables, trackPitch } from './analyze';

it.skipIf(!process.env.MMB_LYRIC_DEBUG)('toonhoogtespoor', () => {
  const wav = parseWav(new Uint8Array(readFileSync(process.env.MMB_LYRIC_DEBUG!)));
  const y = resample(wav.channels[0]!, wav.sampleRate, LYRIC_RATE);
  const t = trackPitch(y, LYRIC_RATE);
  const marks = placeMarks(y, LYRIC_RATE, t);
  const count = Number(process.env.MMB_LYRIC_COUNT ?? 0);
  const spans = splitSyllables(y, LYRIC_RATE, t, { count });
  let max = 0;
  for (const v of t.rms) if (v > max) max = v;
  const lines: string[] = [];
  for (let f = 0; f < t.f0.length; f++) {
    const bar = '#'.repeat(Math.round((t.rms[f]! / max) * 30));
    const at = f * t.hop;
    const edge = spans.some((s) => Math.abs(s.start - at) < t.hop / 2) ? ' <-- start' : spans.some((s) => Math.abs(s.end - at) < t.hop / 2) ? ' <-- eind' : '';
    lines.push(`${String(f * 10).padStart(5)} ms ${t.f0[f]! > 0 ? t.f0[f]!.toFixed(0).padStart(4) : '   -'} ${bar}${edge}`);
  }
  console.log(`${y.length} samples, ${t.f0.length} frames, ${marks.filter((m) => !m.unvoiced).length}/${marks.length} marks stemhebbend, ${spans.length} lettergrepen\n` + lines.join('\n'));
});
