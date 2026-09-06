// Test voor editor/src/modular-mb/sampleAnalysis.ts: bouwt een kunstmatige
// "vleugel-take" (C2/C3/C4, drie aanslagen elk, tweefasige uitsterving met
// stiltes ertussen) en controleert of de analyse er de noten, de lagen, de
// uitstervingstijd en een loop uit haalt.
//   node tools/mmb-wasm/test-analysis.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'mmb-analysis-'));
const bundle = join(tmp, 'analysis.mjs');
execFileSync(join(root, 'editor/node_modules/.bin/esbuild'), [
  join(root, 'editor/src/modular-mb/sampleAnalysis.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'inherit' });
const A = await import(bundle);

const SR = 44100;
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Pianoachtige noot: harmonischen, tweefasige uitsterving, lichte inharmoniciteit. */
function note(hz, seconds, amp) {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  const partials = 12;
  for (let p = 1; p <= partials; p++) {
    const f = hz * p * (1 + 0.0004 * p * p);         // inharmoniciteit
    if (f > SR / 2.2) break;
    const a = amp / Math.pow(p, 1.4);
    const fast = Math.exp(-3.5 * p * 0.25), slow = 1 - fast;
    const ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const envA = Math.exp(-t * (2.2 + 0.35 * p));   // snelle eerste fase
      const envB = Math.exp(-t * (0.55 + 0.06 * p));  // trage naklank
      x[i] += a * (fast * envA + slow * envB) * Math.sin(6.283185 * f * t + ph);
    }
  }
  // Aanslagruis (hamer)
  for (let i = 0; i < Math.round(0.006 * SR); i++) {
    x[i] += amp * 0.5 * (Math.random() * 2 - 1) * (1 - i / (0.006 * SR));
  }
  return x;
}

// ── take bouwen: C2, C3, C4 × zacht/midden/hard, 2 s stilte ertussen ──
const notes = [36, 48, 60];
const amps  = [0.10, 0.28, 0.75];
const parts = [];
let expected = [];
for (const m of notes) {
  for (const a of amps) {
    parts.push(note(midiToHz(m), 6.0, a));
    parts.push(new Float32Array(Math.round(2.0 * SR)));
    expected.push({ midi: m, amp: a });
  }
}
const total = parts.reduce((s, p) => s + p.length, 0);
const take = new Float32Array(total);
let off = 0;
for (const p of parts) { take.set(p, off); off += p.length; }
// Beetje ruisvloer, zoals een echte kamer.
for (let i = 0; i < take.length; i++) take[i] += (Math.random() * 2 - 1) * 0.0004;

console.log(`take: ${(take.length / SR).toFixed(1)} s, ${expected.length} aanslagen verwacht\n`);

// ── 1. segmenteren ──
const segs = A.segmentRecording(take, SR, { minGap: 0.35, minLength: 0.3 });
console.log(`segmenten gevonden: ${segs.length} (verwacht ${expected.length})`);

// ── 2. toonhoogte per segment ──
const items = segs.map((s) => ({ segment: s, pitch: A.detectPitch(take, SR, s.start, s.end) }));
let pitchOk = 0;
items.forEach((it, i) => {
  const want = expected[i];
  const ok = want && it.pitch.midi === want.midi;
  if (ok) pitchOk++;
  console.log(`  ${String(i).padStart(2)}  ${(it.segment.start / SR).toFixed(2).padStart(6)} s  ` +
    `${it.pitch.hz.toFixed(1).padStart(7)} Hz → MIDI ${String(it.pitch.midi).padStart(3)} ` +
    `${String(it.pitch.cents).padStart(4)} ct  conf ${it.pitch.confidence.toFixed(2)}  ` +
    `attack-rms ${it.segment.attackRms.toFixed(4)}  ${ok ? '✓' : `✗ (verwacht ${want?.midi})`}`);
});
console.log(`toonhoogte correct: ${pitchOk}/${items.length}\n`);

// ── 2b. octaaffouten repareren met de oplopende volgorde ──
const broken = items.map((it, i) => ({ ...it.pitch, midi: i === 4 ? it.pitch.midi - 12 : it.pitch.midi }));
const fixed = A.enforceAscending(broken, 3);
const fixOk = fixed.midi.every((m, i) => m === expected[i].midi);
console.log(`kunstmatige octaaffout op index 4 (${broken[4].midi} i.p.v. ${expected[4].midi}) → ` +
  `${fixed.changed} correcties, reeks nu ${fixOk ? 'correct ✓' : 'FOUT ✗ ' + fixed.midi.join(',')}\n`);

// ── 3. velocity-lagen ──
const layered = A.assignVelocityLayers(items, 3);
let layerOk = 0;
for (const l of layered) {
  const group = expected.filter((e) => e.midi === l.pitch.midi);
  const rank = group.findIndex((e) => Math.abs(e.amp - amps[l.layer]) < 1e-9);
  if (rank === l.layer) layerOk++;
}
console.log('velocity-lagen:');
for (const l of layered) {
  console.log(`  MIDI ${l.pitch.midi}  laag ${l.layer}  vel ${l.lowVel}–${l.highVel}  ` +
    `rms ${l.segment.attackRms.toFixed(4)}`);
}
console.log(`lagen in de juiste volgorde: ${layerOk}/${layered.length}\n`);

// ── 4. key-bereiken ──
const ranges = A.spreadKeyRanges(layered.map((l) => l.pitch.midi));
console.log('key-bereiken:', [...ranges.entries()].map(([n, r]) => `${n}: ${r.low}–${r.high}`).join('  '), '\n');

// ── 5. decay + loop op de hardste C3 ──
const c3 = layered.filter((l) => l.pitch.midi === 48).sort((a, b) => b.layer - a.layer)[0];
const dec = A.measureDecay(take, SR, c3.segment.start, c3.segment.end);
console.log(`C3 hard: snelle T60 ${dec.fastT60.toFixed(2)} s · trage T60 ${dec.slowT60.toFixed(2)} s · ` +
  `stabiel vanaf ${((dec.stableFrom - c3.segment.start) / SR).toFixed(2)} s`);
const loop = A.findLoop(take, SR, dec.stableFrom, c3.segment.end, c3.pitch.hz);
if (loop) {
  const lenMs = ((loop.end - loop.start) / SR) * 1000;
  const periods = (loop.end - loop.start) / (SR / c3.pitch.hz);
  console.log(`loop: ${loop.start}–${loop.end} (${lenMs.toFixed(0)} ms = ${periods.toFixed(2)} perioden) ` +
    `kwaliteit ${loop.quality.toFixed(3)}`);
} else {
  console.log('loop: geen gevonden');
}

// ── 6. crossfade bakken (mono en stereo) ──
if (loop) {
  const mono = take.slice(c3.segment.start, c3.segment.end);
  const ls = loop.start - c3.segment.start, le = loop.end - c3.segment.start;
  const before = mono[le - 1];
  A.bakeCrossfade(mono, 1, ls, le, Math.round(0.01 * SR));
  console.log(`crossfade gebakken: laatste loop-sample ${before.toFixed(4)} → ${mono[le - 1].toFixed(4)}`);
  const stereo = new Float32Array((c3.segment.end - c3.segment.start) * 2);
  for (let i = 0; i < mono.length; i++) { stereo[i * 2] = mono[i]; stereo[i * 2 + 1] = mono[i] * 0.8; }
  A.bakeCrossfade(stereo, 2, ls, le, Math.round(0.01 * SR));
  const ratio = stereo[(le - 1) * 2 + 1] / stereo[(le - 1) * 2];
  console.log(`stereo blijft in de pas: R/L = ${ratio.toFixed(3)} (verwacht 0.800)`);
}
