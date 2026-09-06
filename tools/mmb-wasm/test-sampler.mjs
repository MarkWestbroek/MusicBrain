// End-to-end: kunstmatige take → sampleAnalysis → slots + zones → de
// sampler-wasm via de generieke worklet-host. Controleert dat de keymap de
// juiste zone kiest (toonhoogte volgt de noot, luidheid volgt de velocity)
// en dat stereo door de keten heen blijft kloppen.
//   node tools/mmb-wasm/test-sampler.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'mmb-sampler-'));
const bundle = join(tmp, 'analysis.mjs');
execFileSync(join(root, 'editor/node_modules/.bin/esbuild'), [
  join(root, 'editor/src/modular-mb/sampleAnalysis.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' });
const A = await import(bundle);

const SR = 44100, CH = 2;
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ── kunstmatige stereo-take: C2/C3/C4 × zacht/midden/hard ──
function note(hz, secs, amp) {
  const n = Math.round(secs * SR), x = new Float32Array(n);
  for (let p = 1; p <= 10; p++) {
    const f = hz * p;
    if (f > SR / 2.2) break;
    const a = amp / Math.pow(p, 1.3), ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] += a * Math.exp(-t * (0.7 + 0.1 * p)) * Math.sin(6.283185 * f * t + ph);
    }
  }
  return x;
}
const notes = [36, 48, 60], amps = [0.10, 0.28, 0.75];
const chunks = [];
for (const m of notes) for (const a of amps) {
  chunks.push(note(midiToHz(m), 4.0, a));
  chunks.push(new Float32Array(Math.round(1.5 * SR)));
}
const monoLen = chunks.reduce((s, c) => s + c.length, 0);
const take = new Float32Array(monoLen * CH);
let off = 0;
for (const c of chunks) {
  for (let i = 0; i < c.length; i++) {
    take[(off + i) * CH] = c[i] + (Math.random() * 2 - 1) * 0.0003;
    take[(off + i) * CH + 1] = c[i] * 0.7 + (Math.random() * 2 - 1) * 0.0003;   // R = 0,7 × L
  }
  off += c.length;
}
// Eén globale gain zodat de take niet klipt (piek ≈ −1 dBFS) — precies de
// opnamepraktijk: één gain-instelling, onderlinge dynamiek blijft intact.
let takePeak = 0;
for (const v of take) { const a = Math.abs(v); if (a > takePeak) takePeak = a; }
if (takePeak > 0) { const g = 0.89 / takePeak; for (let i = 0; i < take.length; i++) take[i] *= g; }

const mono = A.toMono(take, CH);

// ── analyse → keymap ──
const segs = A.segmentRecording(mono, SR, { minGap: 0.35, minLength: 0.3 });
const items = segs.map((s) => ({ segment: s, pitch: A.detectPitch(mono, SR, s.start, s.end) }));
const fix = A.enforceAscending(items.map((i) => i.pitch), 3);
const withMidi = items.map((it, i) => ({ segment: it.segment, pitch: { ...it.pitch, midi: fix.midi[i] } }));
const layered = A.assignVelocityLayers(withMidi, 3);
const ranges = A.spreadKeyRanges(layered.map((l) => l.pitch.midi));
console.log(`analyse: ${segs.length} segmenten, ${new Set(layered.map((l) => l.pitch.midi)).size} noten, ${fix.changed} correcties`);

const slots = [], zones = [];
layered.forEach((l, i) => {
  const cut = take.slice(l.segment.start * CH, l.segment.end * CH);
  const pcm = new Int16Array(cut.length);
  for (let k = 0; k < cut.length; k++) pcm[k] = Math.max(-32768, Math.min(32767, Math.round(cut[k] * 32767)));
  slots.push({ data: pcm, channels: CH, rate: SR });
  const r = ranges.get(l.pitch.midi);
  zones.push({
    slot: i, lowKey: r.low, highKey: r.high, lowVel: l.lowVel, highVel: l.highVel,
    root: l.pitch.midi, tuneCents: -l.pitch.cents, gain: 1, pan: 0,
    loopMode: 0, loopStart: 0, loopEnd: 0, decay: 0, release: 0.12,
  });
});
console.log(`keymap: ${slots.length} slots, ${zones.length} zones\n`);

// ── door de worklet-host ──
const src = readFileSync(join(root, 'editor/public/wasm/mmb-worklet.js'), 'utf8');
const reg = {};
const AWP = class { constructor() { this.port = { onmessage: null, postMessage: (m) => { this.last = m; } }; } };
new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(AWP, (n, c) => { reg[n] = c; }, 48000);
const wasm = new Uint8Array(readFileSync(join(root, 'editor/public/wasm/tp_mmb_sampler.wasm')));
const P = new reg['mmb-wasm']({ processorOptions: { wasm, inputs: ['voct', 'gate', 'vel'], outputs: ['out_l', 'out_r', 'out_3', 'out_4'] } });
slots.forEach((s, i) => P.port.onmessage({ data: { t: 'blob', slot: i, rate: s.rate, channels: CH, data: s.data } }));
P.port.onmessage({ data: { t: 'zones', zones } });

const ins = [0, 1, 2].map(() => [new Float32Array(128)]);
const outs = [0, 1, 2, 3].map(() => [new Float32Array(128)]);

/** Speel `midi` met `vel`; meet piek, R/L en de grondtoon met YIN (niet met
 *  nuldoorgangen — die tellen bij boventoonrijk materiaal de hoogste partiaal). */
function play(midi, vel, seconds = 1.0) {
  P.port.onmessage({ data: { t: 'in', id: 'voct', v: (midi - 60) / 12 } });
  P.port.onmessage({ data: { t: 'in', id: 'vel', v: vel / 127 } });
  P.port.onmessage({ data: { t: 'in', id: 'gate', v: 0 } });
  for (let b = 0; b < 4; b++) P.process(ins, outs);
  P.port.onmessage({ data: { t: 'in', id: 'gate', v: 1 } });
  const nBlocks = Math.round((seconds * 48000) / 128);
  const capL = new Float32Array(nBlocks * 128);
  let pkL = 0, pkR = 0;
  for (let b = 0; b < nBlocks; b++) {
    P.process(ins, outs);
    for (let i = 0; i < 128; i++) {
      const l = outs[0][0][i], r = outs[1][0][i];
      capL[b * 128 + i] = l;
      if (Math.abs(l) > pkL) pkL = Math.abs(l);
      if (Math.abs(r) > pkR) pkR = Math.abs(r);
    }
  }
  P.port.onmessage({ data: { t: 'in', id: 'gate', v: 0 } });
  for (let b = 0; b < 20; b++) P.process(ins, outs);
  const p = A.detectPitch(capL, 48000, 0, capL.length);
  return { pkL, pkR, hz: p.hz, conf: p.confidence };
}

console.log('noot  vel   piek-L   R/L      Hz   verwacht   conf  zone');
let ok = 0, total = 0;
for (const midi of [36, 48, 60]) {
  for (const vel of [20, 64, 110]) {
    const res = play(midi, vel);
    const want = midiToHz(midi);
    const pitchOk = Math.abs(res.hz - want) / want < 0.03;
    const stereoOk = res.pkL > 0 && Math.abs(res.pkR / res.pkL - 0.7) < 0.08;
    const zi = zones.findIndex((z) => midi >= z.lowKey && midi <= z.highKey && vel >= z.lowVel && vel <= z.highVel);
    total++; if (pitchOk && stereoOk) ok++;
    console.log(`${String(midi).padStart(4)} ${String(vel).padStart(4)}  ${res.pkL.toFixed(4)}  ` +
      `${(res.pkR / (res.pkL || 1)).toFixed(3)}  ${res.hz.toFixed(1).padStart(6)}  ${want.toFixed(1).padStart(8)}  ` +
      `${res.conf.toFixed(2)}   ${String(zi).padStart(2)}  ${pitchOk ? '✓' : '✗ toon'}${stereoOk ? '' : ' ✗ stereo'}`);
  }
}
console.log(`\ncorrect: ${ok}/${total}`);

// Velocity moet de luidheid ordenen binnen één noot.
const soft = play(48, 20).pkL, mid = play(48, 64).pkL, hard = play(48, 110).pkL;
console.log(`C3 dynamiek: zacht ${soft.toFixed(4)} < midden ${mid.toFixed(4)} < hard ${hard.toFixed(4)}  ` +
  `${soft < mid && mid < hard ? '✓' : '✗'}`);

// Transponeren: C#3 (49) valt in de C3-zone en moet een halve toon hoger klinken.
const c3 = play(48, 110), cs3 = play(49, 110);
const ratio = cs3.hz / (c3.hz || 1);
console.log(`transponeren C3→C#3: ${c3.hz.toFixed(1)} → ${cs3.hz.toFixed(1)} Hz, factor ${ratio.toFixed(4)} ` +
  `(verwacht 1.0595) ${Math.abs(ratio - 1.0595) < 0.02 ? '✓' : '✗'}`);
