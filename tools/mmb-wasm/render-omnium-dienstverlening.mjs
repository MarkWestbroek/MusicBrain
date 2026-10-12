// "Dienstverlening" — achtergrondmuziek voor de animatie op
// omnium.imprint-engine.nl (97 s, loopt rond; 2026-10-13). Gespeeld door
// MusicBrain's eigen modules als wasm: Plaits (pad, bas), Rings (sequencer,
// bellen, plinks), Clouds (het ontsporen op 30–36 s) en de plaatreverb.
// De partituur volgt de momenten uit de animatie (zie de commentaren).
//   node tools/mmb-wasm/render-omnium-dienstverlening.mjs [map]
// Schrijft <map>/omnium-dienstverlening{-raw.wav,.wav,.mp3,.ogg}; de laatste
// drie op -18 LUFS (ffmpeg loudnorm, twee passes; ffmpeg moet op PATH staan).
// Default-map: <tmp>/mmb-omnium. De site-kopie staat bij Imprint in
// sites/omnium/public/werkelijkheid/.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, run, toSR, fromSR, env, wav16, SR } from './offline-host.mjs';

const DUR = 97;
const N = DUR * SR;
const dir = process.argv[2] ?? join(tmpdir(), 'mmb-omnium');
mkdirSync(dir, { recursive: true });
const raw = join(dir, 'omnium-dienstverlening-raw.wav');

// Deterministische ruis, zodat elke render hetzelfde klinkt.
let seed = 20261013;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const vo = (n) => (n - 60) / 12;

// ── Partituur ───────────────────────────────────────────────────────────────
// [start, eind, padnoten, bas, arpnoten]
const chords = [
  // A 0–17 werkelijkheid (0), informeer (6), beslis (12), "Ja, dat doe ik" (14)
  [0, 6, [50, 57, 64, 65], 38, []],
  [6, 12, [53, 57, 62, 64], 34, []],
  [12, 14, [53, 58, 62, 69], 43, []],
  [14, 17, [52, 57, 62, 64], 45, []],
  // B 17 vul in, 20 de stip ontstaat, 24 dien in
  [17, 20, [53, 57, 60, 64], 38, [62, 65, 69, 72, 76]],
  [20, 24, [53, 57, 60, 62], 34, [62, 65, 69, 70, 74]],
  [24, 27, [53, 57, 60, 65], 45, [60, 65, 69, 72, 77]],
  [27, 30, [55, 60, 62, 67], 36, [60, 62, 67, 72, 74]],
  // C 30–36 zo gaat het nu: rommelig
  [30, 33, [50, 56, 61, 63], null, []],
  [33, 35.6, [49, 55, 58, 64], null, []],
  // D 36 één canoniek model; 40 behandel, 48 beschik, 51 nieuwe zaak, 55 volg, 61 lever
  [36, 40, [54, 57, 62, 66], 38, [62, 66, 69, 74, 78]],
  [40, 44, [55, 59, 62, 69], 43, [62, 67, 69, 71, 74]],
  [44, 48, [54, 57, 62, 66], 42, [62, 66, 69, 74, 78]],
  [48, 51, [57, 62, 66, 69], 35, [62, 66, 69, 71, 74]],
  [51, 55, [55, 59, 62, 66], 43, [62, 66, 67, 71, 74]],
  [55, 58, [54, 57, 62, 66], 38, [62, 66, 69, 74, 78]],
  [58, 61, [52, 57, 61, 64], 37, [61, 64, 69, 73, 76]],
  [61, 64, [55, 59, 62, 64], 40, [64, 67, 71, 74, 76]],
  [64, 67, [57, 62, 64, 69], 45, [64, 69, 74, 76, 81]],
  // E 67–75 de traplift staat er: warm hoogtepunt
  [67, 69.75, [55, 59, 62, 66, 69], 43, [67, 71, 74, 78, 81]],
  [69.75, 72.5, [57, 61, 64, 71], 45, [69, 73, 76, 81, 83]],
  [72.5, 75, [54, 57, 62, 66, 69], 38, [66, 69, 74, 78, 81]],
  // F 75 deel, 82 archiveer, 88 slot
  [75, 82, [54, 57, 62, 64, 66], 38, [62, 64, 66, 69, 74]],
  [82, 88, [59, 62, 66, 67], 35, [62, 66, 67, 71, 74]],
  [88, 93, [50, 57, 62, 66, 69], 38, []],
];

// Losse "gedachten" in deel A (Rings, schaars); bellen en tikjes op de momenten uit de animatie.
const thoughts = [[1.8, 69], [4.4, 65], [6.0, 72], [8.6, 76], [10.4, 74], [12.0, 69], [13.2, 67],
  [17.2, 81], [17.8, 76], [18.4, 79], [19.0, 74]];               // chips verschijnen
const bells = [
  [14, [69, 74, 76]],                                             // "Ja, dat doe ik"
  [20, [74]],                                                     // de stip ontstaat
  [24, [72, 77]], [24.5, [84]], [25, [81]], [25.5, [84]], [26, [81]], // dien in, chips knipperen
  [36, [74, 78, 81, 86]],                                         // één canoniek model
  [40, [71, 74, 79]], [42, [86]], [43.6, [88]], [45.2, [86]],     // behandel + contactmomenten
  [48, [74, 78, 81]], [51, [78, 81]], [51.4, [86]],               // beschik; zaak gesloten / nieuwe zaak
  [55, [74, 78, 83]], [61, [73, 76, 81]],                         // volg, lever
  [67, [74, 78, 83]], [72.5, [74, 78, 81, 86]],                   // traplift
  [75, [74, 81]], [77, [86]], [78, [83]], [79, [81]],             // deel: drie chips naar het CAK
  [82, [78, 83]], [83.5, [79]], [85, [74]],                       // archiveer: de stip krimpt
  [88, [74, 78, 81, 86]],                                         // slot
];

// ── Arpeggio-gebeurtenissen ─────────────────────────────────────────────────
const PULSE = 0.25;
const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
const arpEvents = [];
for (const [t0, t1, , , tones] of chords) {
  if (!tones.length) continue;
  let k = 0;
  for (let t = t0; t < t1 - 1e-6; t += PULSE, k++) {
    let every = 1;
    if (t < 20) every = 4;
    else if (t >= 75 && t < 82) every = 2;
    else if (t >= 82) every = 4;
    if (t >= 87.9) break;
    if (k % every) continue;
    if (t >= 36 && t < 67 && k % 16 === 15) continue; // ademruimte
    // 67–70: de gegevens stijgen op naar het huis — stijgende lijn.
    const idx = t >= 67 && t < 70 ? k % tones.length : pattern[k % pattern.length] % tones.length;
    const tone = tones[idx] + (t >= 67 && t < 70 && k >= tones.length ? 12 : 0);
    arpEvents.push({ t, n: tone, b: (rnd() - 0.5) * 0.08 });
  }
}
for (const [t, n] of thoughts) arpEvents.push({ t, n, b: 0.02 });
// Deel C: rommelige pulsen — scheve timing, chromatische cluster, ontstemd, gaten.
const messyPool = [61, 62, 63, 66, 68, 69, 70, 73, 75, 77];
const messyEvents = [];
for (let t = 30; t < 35.5; t += PULSE) {
  if (rnd() < 0.62) arpEvents.push({ t: t + (rnd() - 0.5) * 0.12, n: messyPool[Math.floor(rnd() * messyPool.length)] + (rnd() - 0.5) * 0.7, b: (rnd() - 0.5) * 0.1 });
  if (rnd() < 0.3) messyEvents.push({ t: t + rnd() * PULSE, n: 70 + Math.floor(rnd() * 14) + (rnd() - 0.5) * 0.5 });
}
arpEvents.sort((a, b) => a.t - b.t);
const bellEvents = [];
for (const [t, notes] of bells) notes.forEach((n, i) => bellEvents.push({ t: t + i * 0.07, n }));
bellEvents.sort((a, b) => a.t - b.t);

// Speelt een rij {t, n, b?} als korte gates op een Rings-instantie.
function strikeScript(m, events, extra) {
  let i = 0;
  return (t) => {
    while (i + 1 < events.length && events[i + 1].t <= t + 0.002) i++;
    const e = events[i];
    if (e && e.t <= t + 0.002) {
      m.set('voct', vo(e.n));
      m.set('gate', t >= e.t && t < e.t + 0.005 ? 1 : 0);
      if (e.b !== undefined) m.set('brightness_cv', e.b);
    } else m.set('gate', 0);
    if (extra) extra(t);
  };
}

const mixL = new Float32Array(N), mixR = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);
const cloudL = new Float32Array(N), cloudR = new Float32Array(N);
const stemE = {};
function add(st, { name = '?', gain = 1, pan = 0, send = 0, cloud = 0, g = null }) {
  let e = 0;
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const [L, R] = st;
  for (let i = 0; i < Math.min(N, L.length); i++) {
    const a = gain * (g ? g(i / SR) : 1);
    const l = L[i] * a * gl, r = (R ?? L)[i] * a * gr;
    e += l * l + r * r;
    mixL[i] += l; mixR[i] += r; sendL[i] += l * send; sendR[i] += r * send;
    cloudL[i] += l * cloud; cloudR[i] += r * cloud;
  }
  stemE[name] = (stemE[name] ?? 0) + e;
}
const stats = (name, st) => { let pk = 0; for (const ch of st) for (const x of ch) pk = Math.max(pk, Math.abs(x)); console.log(name.padEnd(10), 'pk', pk.toFixed(2)); };

// ── Pad: twee banken van vijf Plaits-stemmen (VA+VCF), om en om per akkoord ─
const padBright = env([[0, 0.28], [17, 0.3], [30, 0.36], [36, 0.36], [36.1, 0.42], [67, 0.46], [75, 0.4], [94, 0.3]]);
const padGain = env([[0, 0.72], [14, 0.8], [17, 0.9], [30, 0.9], [32, 0.7], [35.6, 0.6], [36, 1], [66, 1], [68, 1.35], [74, 1.3], [76, 1.05], [94, 0.9]]);
for (let bank = 0; bank < 2; bank++) {
  for (let v = 0; v < 5; v++) {
    const mine = chords.filter((_, c) => c % 2 === bank).filter((c) => c[2][v] !== undefined);
    if (!mine.length) continue;
    const m = await load('tp_mmb_plaits', { engine: 0, harmonics: 0.12, timbre: 0.3, morph: 0.35, decay: 0.7, lpg: 0.6, level: 0.8, fine: (v - 2) * 3 + (bank ? 2 : -2) });
    const att = 1.4, rel = 2.2;
    const lvl = (t) => {
      let a = 0;
      for (const [t0, t1] of mine) {
        if (t < t0 || t > t1 + rel) continue;
        const up = Math.min(1, (t - t0) / att), down = t > t1 ? 1 - (t - t1) / rel : 1;
        a = Math.max(a, up * down);
      }
      return a;
    };
    const st = run(m, DUR, (t) => {
      const c = [...mine].reverse().find(([t0]) => t0 <= t + 0.01) ?? mine[0];
      m.set('voct', vo(c[2][v]));
      m.set('level_cv', 0.62 * Math.sin(lvl(t) * Math.PI / 2));
      m.ctl('timbre', padBright(t) + (v >= 3 ? 0.04 : 0));
      m.set('gate', 0);
    });
    add([st[0], st[0]], { name: 'pad', gain: 0.18, pan: [-0.6, 0.35, -0.2, 0.55, 0][v], send: 0.45, cloud: 0.35, g: padGain });
  }
}
console.log('pad klaar');

// ── Bas: Plaits FM bijna-sinus, twee stemmen om en om ──────────────────────
const bassNotes = [];
for (const [t0, t1, , b] of chords) {
  if (b === null) continue;
  const start = t0 === 0 ? 1.5 : t0;
  // Vanaf deel D zacht herhaald op de hele tel: gestaag voortgaand.
  if (t0 >= 36 && t0 < 75) for (let t = start; t < t1 - 0.01; t += 1) bassNotes.push([t, Math.min(t + 0.9, t1), b, t === start ? 1 : 0.8]);
  else bassNotes.push([start, t0 >= 87 ? 92 : t1, b, 1]);
}
for (let v = 0; v < 2; v++) {
  const mine = bassNotes.filter((_, i) => i % 2 === v);
  const m = await load('tp_mmb_plaits', { engine: 10, harmonics: 0.25, timbre: 0.12, morph: 0, decay: 0.7, lpg: 0.4, level: 0.8 });
  const st = run(m, DUR, (t) => {
    const nt = [...mine].reverse().find(([t0]) => t0 <= t + 0.01) ?? mine[0];
    let a = 0;
    for (const [t0, t1, , acc] of mine) {
      if (t < t0 || t > t1 + 0.35) continue;
      a = Math.max(a, acc * Math.min(1, (t - t0) / 0.06) * (t > t1 ? 1 - (t - t1) / 0.35 : 1));
    }
    m.set('voct', vo(nt[2]));
    m.set('level_cv', 0.6 * a);
    m.set('gate', 0);
  });
  add([st[0], st[0]], { name: 'bas', gain: 0.15, send: 0.1, g: env([[0, 0.8], [17, 0.9], [36, 1], [67, 1.1], [75, 1], [94, 0.8]]) });
}
console.log('bas klaar');

// ── Arpeggio: Rings modaal, vier stemmen ────────────────────────────────────
{
  const m = await load('tp_mmb_rings', { model: 0, polyphony: 2, structure: 0.24, brightness: 0.42, damping: 0.5, position: 0.3, level: 0.8 });
  const bright = env([[0, 0.38], [17, 0.38], [30, 0.42], [36, 0.46], [67, 0.52], [75, 0.44], [94, 0.36]]);
  const damp = env([[0, 0.6], [17, 0.5], [30, 0.4], [35.9, 0.4], [36, 0.52], [67, 0.56], [94, 0.6]]);
  const st = toSR(m, run(m, DUR, strikeScript(m, arpEvents, (t) => { m.ctl('brightness', bright(t)); m.ctl('damping', damp(t)); })));
  stats('arp', st);
  add(st, { name: 'arp', gain: 1.5, send: 0.5, cloud: 0.6, g: env([[0, 0.85], [17, 0.6], [20, 0.5], [22, 0.65], [29.9, 0.65], [30.2, 0.5], [35.5, 0.45], [36, 0.75], [66, 0.78], [68, 1.05], [74.5, 1.0], [76, 0.75], [87, 0.55], [94, 0.4]]) });
}
// Deel C: inharmonische plinks (Rings FM-voice).
{
  const m = await load('tp_mmb_rings', { model: 3, polyphony: 2, structure: 0.65, brightness: 0.5, damping: 0.4, position: 0.5, level: 0.8 });
  const st = toSR(m, run(m, DUR, strikeScript(m, messyEvents)));
  stats('messy', st);
  add(st, { name: 'messy', gain: 1.25, send: 0.6, cloud: 0.8, g: env([[29, 0], [30, 0.8], [35.5, 0.8], [35.8, 0]]) });
}
// Bellen bij de stations.
{
  const m = await load('tp_mmb_rings', { model: 0, polyphony: 2, structure: 0.68, brightness: 0.58, damping: 0.62, position: 0.18, level: 0.8 });
  const st = toSR(m, run(m, DUR, strikeScript(m, bellEvents)));
  stats('bells', st);
  add(st, { name: 'bells', gain: 1.3, send: 0.75, g: env([[0, 0.8], [36, 1], [42, 0.6], [46, 1], [67, 1.1], [75, 0.9], [77, 0.7], [94, 0.6]]) });
}
console.log('rings klaar');

// ── Clouds over deel C: gegevens raken kwijt ────────────────────────────────
{
  const t0 = 28, t1 = 37;
  const m = await load('tp_mmb_clouds', { position: 0.65, size: 0.32, pitch: 0, density: 0.72, texture: 0.45, mix: 1, spread: 0.8, feedback: 0.45, reverb: 0.25, mode: 0, level: 1 });
  const feed = fromSR(m, [cloudL.subarray(t0 * SR, t1 * SR), cloudR.subarray(t0 * SR, t1 * SR)]);
  let p = 0, next = 0;
  const st = toSR(m, run(m, t1 - t0, (t) => {
    if (t >= next) { p = [-7, -5, 0, 5, 7, 12, -12][Math.floor(rnd() * 7)] / 12; next = t + 0.3 + rnd() * 0.6; }
    m.set('pitch_cv', p);
  }, feed));
  stats('clouds', st);
  const g = env([[30, 0], [31.5, 0.55], [34.8, 0.8], [35.5, 0.3], [35.9, 0]]);
  for (let i = 0; i < st[0].length; i++) {
    const j = i + t0 * SR, a = 0.7 * g(j / SR);
    if (j >= N) break;
    mixL[j] += st[0][i] * a; mixR[j] += st[1][i] * a;
    sendL[j] += st[0][i] * a * 0.3; sendR[j] += st[1][i] * a * 0.3;
  }
}

// ── Reverb (MusicBrain-plaat), als send ────────────────────────────────────
{
  const m = await load('tp_mmb_reverb', { mode: 0, size: 0.78, damp: 0.5, predelay: 25, mod: 0.35, mix: 1 });
  const st = toSR(m, run(m, DUR, null, fromSR(m, [sendL, sendR])));
  stats('reverb', st);
  for (let i = 0; i < N; i++) { mixL[i] += st[0][i] * 0.55; mixR[i] += st[1][i] * 0.55; }
}

// ── Master: zachte in- en uitloop, piek-check ─────────────────────────────
const master = env([[0, 0], [0.05, 1], [90.5, 1], [96.6, 0], [97, 0]]);
let pk = 0;
for (let i = 0; i < N; i++) { const a = master(i / SR); mixL[i] *= a; mixR[i] *= a; pk = Math.max(pk, Math.abs(mixL[i]), Math.abs(mixR[i])); }
const norm = 0.7 / pk;
for (let i = 0; i < N; i++) { mixL[i] *= norm; mixR[i] *= norm; }
// RMS per deel, ter controle van de vorm.
const parts = [[0, 17, 'A werkelijkheid'], [17, 30, 'B vul in'], [30, 36, 'C rommelig'], [36, 67, 'D model'], [67, 75, 'E traplift'], [75, 94, 'F uitklinken'], [94, 97, 'G stilte']];
for (const [a, b, name] of parts) {
  let s = 0; for (let i = a * SR; i < b * SR; i++) s += mixL[i] * mixL[i] + mixR[i] * mixR[i];
  console.log(name.padEnd(16), (10 * Math.log10(s / ((b - a) * SR * 2) + 1e-12)).toFixed(1), 'dBFS rms');
}
for (const [k, e] of Object.entries(stemE)) console.log('stem', k.padEnd(6), (10 * Math.log10(e / N / 2)).toFixed(1), 'dB rms');
console.log('piek voor normalisatie', pk.toFixed(2));
wav16(raw, [mixL, mixR]);
console.log('geschreven', raw);

// ── Loudness: -18 LUFS, true peak -2 dBTP (achtergrond), dan mp3 + ogg ──────
const ff = (...args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.error?.message ?? r.stderr}`);
  return r.stderr;
};
const LN = 'loudnorm=I=-18:TP=-2:LRA=11';
const m = JSON.parse(ff('-i', raw, '-af', `${LN}:print_format=json`, '-f', 'null', '-').match(/\{[^{}]*\}/)[0]);
const wav = join(dir, 'omnium-dienstverlening.wav');
ff('-i', raw, '-af', `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, '-ar', String(SR), wav);
const tags = ['-metadata', 'title=Dienstverlening (Omnium)', '-metadata', 'artist=MusicBrain'];
ff('-i', wav, '-t', String(DUR), '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '160k', ...tags, join(dir, 'omnium-dienstverlening.mp3'));
ff('-i', wav, '-t', String(DUR), '-c:a', 'libvorbis', '-q:a', '5', ...tags, join(dir, 'omnium-dienstverlening.ogg'));
for (const ext of ['mp3', 'ogg']) {
  const r = ff('-i', join(dir, `omnium-dienstverlening.${ext}`), '-af', 'ebur128=peak=true', '-f', 'null', '-');
  const i = r.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop(), pk = r.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop();
  console.log(ext, i, pk);
}
console.log('klaar in', dir);
