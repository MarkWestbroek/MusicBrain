// Vergelijkt de JS-port (editor/public/dx7/dx7-core.js) sample-voor-sample
// met het native msfa-referentie-harnas (ref-build.sh → dx7ref).
//
//   tools/dx7-wasm/ref-build.sh /tmp/dx7ref
//   /tmp/dx7ref editor/public/dx7/roms.bin /tmp/dx7ref-epiano.f32 0 10 60 100 44096 44096
//   node tools/dx7-wasm/test-core.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { Dx7Core } = await import(join(root, 'editor/public/dx7/dx7-core.js'));
const roms = readFileSync(join(root, 'editor/public/dx7/roms.bin'));

function makeCore() {
  const core = new Dx7Core();
  for (let b = 0; b < 8; b++) core.writeBank(b, roms.subarray(b * 4096, (b + 1) * 4096));
  return core;
}

// Zelfde lus als ref.cc: blokken van 512, note-off zodra >= onFrames.
function renderSeq(core, bank, prog, note, vel, onFrames, offFrames) {
  core.setBank(bank); core.setProgram(prog);
  const name = core.voiceName();
  const chunks = [];
  core.noteOn(note, vel);
  let done = 0;
  while (done < onFrames) { const n = core.render(512); chunks.push(core.out.slice(0, n)); done += n; }
  core.noteOff(note);
  done = 0;
  while (done < offFrames) { const n = core.render(512); chunks.push(core.out.slice(0, n)); done += n; }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return { name, out };
}

function compare(label, js, refPath) {
  let pk = 0;
  for (const x of js) { const a = Math.abs(x); if (a > pk) pk = a; }
  if (!existsSync(refPath)) { console.log(`${label}: peak ${pk.toFixed(3)} (geen referentie ${refPath})`); return; }
  const raw = readFileSync(refPath);
  const ref = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = Math.min(js.length, ref.length);
  let maxDiff = 0, nDiff = 0, sumSq = 0, sumRef = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(js[i] - ref[i]);
    if (d > 0) nDiff++;
    if (d > maxDiff) maxDiff = d;
    sumSq += d * d; sumRef += ref[i] * ref[i];
  }
  const lenNote = js.length === ref.length ? '' : ` LENGTE VERSCHILT js=${js.length} ref=${ref.length}`;
  const snr = sumSq > 0 ? 10 * Math.log10(sumRef / sumSq) : Infinity;
  console.log(`${label}: peak ${pk.toFixed(3)} | verschil met native: max ${maxDiff.toExponential(2)} (${(maxDiff * 32768).toFixed(2)} LSB16), ${nDiff}/${n} samples ≠, SNR ${snr === Infinity ? '∞' : snr.toFixed(1) + ' dB'}${lenNote}`);
}

const cases = [
  ['E.PIANO 1', 0, 10, 60, 100, '/tmp/dx7ref-epiano.f32'],
  ['BRASS 1',   0, 0,  48, 127, '/tmp/dx7ref-brass.f32'],
  ['STRINGS 1', 0, 3,  64, 90,  '/tmp/dx7ref-strings.f32'],
];
for (const [label, bank, prog, note, vel, ref] of cases) {
  const core = makeCore();
  const r = renderSeq(core, bank, prog, note, vel, 44096, 44096);
  compare(`${label} ("${r.name}")`, r.out, ref);
}

// Polyfonie + CPU.
{
  const core = makeCore();
  core.setBank(0); core.setProgram(10);
  for (const n of [60, 64, 67, 72, 76, 79, 84, 88]) core.noteOn(n, 100);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < Math.round(44100 / 512); i++) core.render(512);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`8 stemmen: ${ms.toFixed(1)} ms per 1 s audio = ${(ms / 10).toFixed(1)}% CPU, actief ${core.activeVoices()}`);
}
