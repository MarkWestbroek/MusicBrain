// Zet Dynacord Percuter-cartridges (EPROM-dumps) om naar een samplebank
// (.mmbs) voor de PERCUTER-module, en tegelijk speelbaar in de SAMPLER.
//
// Een cartridge is een EPROM (2764 = 8 KB, 27128 of twee 2764's = 16 KB) met
// kale 8-bit unsigned PCM, mono, zonder kop. Het apparaat speelt hem op
// 12,5 of 25 kHz (een soldeerbrug op de cartridge). Hier wordt elk bestand
// een slot, in de volgorde van de opdrachtregel: bestand 1 = kanaal 1 van de
// PERCUTER, enzovoort (maximaal 8 per bank). De waarden gaan als 16-bit naar
// de bank (byte × 256); de module zet ze bij het afspelen weer op 8 bit.
//
// Keymap voor de SAMPLER: slot k op MIDI-noot 36 + k (C2, C#2, ...), one-shot.
// Een nul-byte-staart (lege EPROM is 0xFF of 0x00) wordt weggeknipt.
//
//   node tools/mmb-wasm/percuter-to-mmbs.mjs --name "Percuter rock" \
//        --rate 25000 kick.bin snare.bin hat.bin -o editor/public/banks/percuter-rock.mmbs
//   (--rate per bestand: kick.bin@12500)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
let name = 'Percuter', rate = 25000, output = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name') name = args[++i];
  else if (args[i] === '--rate') rate = Number(args[++i]);
  else if (args[i] === '-o') output = args[++i];
  else files.push(args[i]);
}
if (!files.length || !output) {
  console.error('gebruik: percuter-to-mmbs.mjs [--name N] [--rate 25000] cart1.bin[@12500] ... -o bank.mmbs');
  process.exit(1);
}
if (files.length > 8) console.warn(`let op: ${files.length} bestanden; de PERCUTER speelt alleen de eerste 8 (de SAMPLER alle)`);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'mmb-perc-'));
execFileSync(process.execPath, [join(root, 'editor/node_modules/esbuild/bin/esbuild'),
  join(root, 'editor/src/modular-mb/sampleBank.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outdir=${tmp}`], { stdio: 'pipe' });
const { buildBank } = await import('file://' + join(tmp, 'sampleBank.js').replace(/\\/g, '/'));

/** Dump → int16 (ongetekende byte, midden 128), lege staart eraf. */
export function cartridgeToPcm(bytes) {
  let end = bytes.length;
  while (end > 1 && (bytes[end - 1] === 0xff || bytes[end - 1] === 0x00 || bytes[end - 1] === 0x80)) end--;
  const pcm = new Int16Array(end);
  for (let i = 0; i < end; i++) pcm[i] = (bytes[i] - 128) * 256;
  return pcm;
}

const slots = [], zones = [];
files.forEach((spec, k) => {
  const [path, own] = spec.split('@');
  const pcm = cartridgeToPcm(new Uint8Array(readFileSync(path)));
  const r = own ? Number(own) : rate;
  slots.push({ data: pcm, channels: 1, rate: r, name: basename(path).replace(/\.[^.]+$/, '') });
  zones.push({ slot: k, lowKey: 36 + k, highKey: 36 + k, lowVel: 0, highVel: 127, root: 36 + k, tuneCents: 0,
    gain: 1, pan: 0, loopMode: 1, loopStart: 0, loopEnd: 0, decay: 0, release: 0.05, velTrack: 18 });
  console.log(`slot ${k + 1}: ${basename(path)} — ${pcm.length} bytes, ${(pcm.length / r).toFixed(3)} s op ${r} Hz`);
});
writeFileSync(output, Buffer.from(buildBank(name, slots, zones)));
console.log(`geschreven: ${output}`);
