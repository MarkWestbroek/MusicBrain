// Luister- en meetmatrix voor tp_mmb_fof (FOF-VOICE), op de echte wasm-kern.
//
//   node tools/mmb-wasm/render-fof-matrix.mjs [doelmap]
//
// Rendert F0 × klinker × Voice × Pressure × Breath droog, met vibrato uit, en
// meet per take RMS, piek, spectraal zwaartepunt en — bij vaste druk zonder
// adem — het aliasingaandeel: energie tussen de harmonischen van F0 tegenover
// energie óp de harmonischen (Blackman-Harris-venster, 32768 punten). Alle
// partiëlen van een periodieke bron liggen op k·F0; wat daartussen ligt is
// gevouwen (k·F0 − m·fs) of ruis. Bij 44,1 kHz ligt 44100 mod F0 = 100 Hz voor
// 110/220/440/880 Hz, dus gevouwen partiëlen vallen ruim buiten de hoofdlob.
//
// Schrijft report.json (alle takes) en een handvol .wav's om te beluisteren
// (pressure-sweeps, laag/hoog, Voice 0 tegenover 1 op hoge noten, ook op
// gelijke RMS). Standaard in de tmp-map; niets hiervan hoort in de repo.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(process.argv[2] ?? resolve(tmpdir(), 'mmb-fof-matrix'));
const rate = 44100;
const block = 32;
const noteSeconds = 1.2;
const takeSeconds = 1.4;
const analysisStart = Math.round(0.25 * rate);
const fftSize = 32768;
const frames = Math.round(takeSeconds * rate);
assert(analysisStart + fftSize <= noteSeconds * rate, 'analysis window must sit inside the held note');

const matrix = {
  f0: [110, 220, 440, 880],
  vowel: { A: 0, I: 0.5, U: 1 },
  voice: [0, 0.35, 1],
  pressure: { laag: 0.2, midden: 0.6, hoog: 1, sweep: 'sweep' },
  breath: [0, 0.3],
};

async function load() {
  const code = await WebAssembly.compile(readFileSync(resolve(root, 'editor/public/wasm/tp_mmb_fof.wasm')));
  const imports = {};
  for (const entry of WebAssembly.Module.imports(code)) (imports[entry.module] ??= {})[entry.name] = () => 0;
  const { exports: api } = await WebAssembly.instantiate(code, imports);
  api.mmb_init();
  const text = pointer => {
    const bytes = new Uint8Array(api.memory.buffer);
    return new TextDecoder().decode(bytes.subarray(pointer, bytes.indexOf(0, pointer)));
  };
  const inputs = Object.fromEntries(Array.from({ length: api.mmb_num_inputs() }, (_, index) => [text(api.mmb_input_id(index)), index]));
  const controls = Object.fromEntries(Array.from({ length: api.mmb_num_controls() }, (_, index) => [text(api.mmb_control_id(index)), index]));
  assert('pressure' in inputs, 'tp_mmb_fof.wasm has no pressure input; rebuild with tools/mmb-wasm/build.sh fof');
  return {
    control(name, value) { assert(name in controls, name); api.mmb_set_control(controls[name], value); },
    input(name, value) {
      assert(name in inputs, name);
      api.mmb_input_connected(inputs[name], 1);
      new Float32Array(api.memory.buffer, api.mmb_input_ptr(inputs[name]), 256).fill(value);
    },
    render(count) { api.mmb_render(count); return new Float32Array(api.memory.buffer, api.mmb_output_ptr(0), count); },
  };
}

// Pressure-sweep: 0,1 s vol, dan in 0,5 s naar 0,15, in 0,5 s terug naar 1.
function sweepPressure(seconds) {
  if (seconds < 0.1) return 1;
  const phase = (seconds - 0.1) / 0.5;
  if (phase < 1) return 1 - 0.85 * phase;
  if (phase < 2) return 0.15 + 0.85 * (phase - 1);
  return 1;
}

async function renderTake(take) {
  const voice = await load();
  voice.control('vibrato', 0);
  voice.control('tone', 0.5);
  voice.control('level', 0.8);
  voice.control('vowel', take.vowel);
  voice.control('voice', take.voice);
  voice.control('breath', take.breath);
  voice.input('voct', Math.log2(take.f0 / 261.6256));
  const audio = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset += block) {
    const seconds = offset / rate;
    voice.input('gate', seconds < noteSeconds ? 1 : 0);
    voice.input('pressure', take.pressure === 'sweep' ? sweepPressure(seconds) : take.pressure);
    audio.set(voice.render(Math.min(block, frames - offset)), offset);
  }
  assert(audio.every(Number.isFinite), 'non-finite sample');
  return audio;
}

function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k, b = a + size / 2;
        const tr = real[b] * cr - imag[b] * ci, ti = real[b] * ci + imag[b] * cr;
        real[b] = real[a] - tr; imag[b] = imag[a] - ti;
        real[a] += tr; imag[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function spectrum(audio) {
  const real = new Float64Array(fftSize), imag = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const x = i / (fftSize - 1);
    const window = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * x) + 0.14128 * Math.cos(4 * Math.PI * x) - 0.01168 * Math.cos(6 * Math.PI * x);
    real[i] = audio[analysisStart + i] * window;
  }
  fft(real, imag);
  const power = new Float64Array(fftSize / 2);
  for (let i = 0; i < power.length; i++) power[i] = real[i] ** 2 + imag[i] ** 2;
  return power;
}

const db = ratio => 20 * Math.log10(Math.max(ratio, 1e-12));
const rms = audio => Math.sqrt(audio.reduce((sum, v) => sum + v * v, 0) / audio.length);

function measure(take, audio) {
  const held = audio.subarray(analysisStart, analysisStart + fftSize);
  const power = spectrum(audio);
  const binHz = rate / fftSize;
  let total = 0, weighted = 0, above4k = 0;
  for (let i = 1; i < power.length; i++) {
    total += power[i]; weighted += power[i] * i * binHz;
    if (i * binHz > 4000) above4k += power[i];
  }
  const result = {
    ...take,
    rmsDb: db(rms(held)), peak: Math.max(...audio.map(Math.abs)),
    centroidHz: weighted / total, above4kDb: 10 * Math.log10(above4k / total),
  };
  if (take.pressure !== 'sweep' && take.breath === 0) {
    // Harmonische bins: ±4 bins rond k·F0 (hoofdlob van Blackman-Harris).
    let harmonic = 0, between = 0;
    const halfWidth = 4;
    for (let i = 1; i < power.length; i++) {
      const k = Math.round(i * binHz / take.f0);
      const harmonicBin = k * take.f0 / binHz;
      if (k >= 1 && Math.abs(i - harmonicBin) <= halfWidth) harmonic += power[i]; else between += power[i];
    }
    result.aliasDb = 10 * Math.log10(between / harmonic);
  }
  return result;
}

function wav(audio, gain = 1) {
  const bytes = Buffer.alloc(44 + audio.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(audio.length * 2, 40);
  for (let i = 0; i < audio.length; i++) {
    const value = Math.round(audio[i] * gain * 32767);
    assert(Math.abs(value) <= 32767, 'clipping');
    bytes.writeInt16LE(value, 44 + i * 2);
  }
  return bytes;
}

mkdirSync(destination, { recursive: true });
const takes = [];
const written = [];
const listen = (name, audio, gain = 1) => { writeFileSync(resolve(destination, name), wav(audio, gain)); written.push(name); };
for (const f0 of matrix.f0) for (const [vowelName, vowel] of Object.entries(matrix.vowel)) for (const voice of matrix.voice)
  for (const [pressureName, pressure] of Object.entries(matrix.pressure)) for (const breath of matrix.breath) {
    const take = { f0, vowelName, vowel, voice, pressureName, pressure, breath };
    const audio = await renderTake(take);
    const result = measure(take, audio);
    takes.push(result);
    const tag = `${f0}hz-${vowelName}-voice${voice}-${pressureName}-breath${breath}`;
    if (pressure === 'sweep' && voice === 0.35 && breath === 0.3) listen(`sweep-${tag}.wav`, audio);
    if (f0 === 220 && vowelName === 'A' && voice === 0.35 && breath === 0.3 && pressure !== 'sweep') listen(`pressure-${tag}.wav`, audio);
    if (f0 >= 440 && vowelName === 'A' && pressure === 1 && breath === 0 && voice !== 0.35) {
      listen(`voice-${tag}.wav`, audio);
      listen(`voice-${tag}-rms-0.1.wav`, audio, 0.1 / rms(audio.subarray(analysisStart, analysisStart + fftSize)));
    }
  }

// Aliasing-reeks tot aan de bovengrens van de kern (2000 Hz): klinker A,
// volle druk, geen adem, alle drie de Voice-standen.
const aliasSweep = [];
for (const f0 of [110, 220, 440, 880, 1320, 1760]) for (const voice of matrix.voice) {
  const take = { f0, vowelName: 'A', vowel: 0, voice, pressureName: 'hoog', pressure: 1, breath: 0 };
  aliasSweep.push(measure(take, await renderTake(take)));
}

assert.deepEqual(await renderTake(takes[0]), await renderTake(takes[0]), 'non-reproducible render');

const steady = takes.filter(take => take.aliasDb !== undefined);
const worstAlias = [...steady].sort((a, b) => b.aliasDb - a.aliasDb).slice(0, 8);
const pressureRows = takes.filter(take => take.vowelName === 'A' && take.voice === 0.35 && take.pressure !== 'sweep');
const summary = {
  rate, takeSeconds, noteSeconds, analysisStart, fftSize, count: takes.length, destination, written,
  method: 'Droog, vibrato 0, tone 0,5, level 0,8, gate 1,2 s. RMS/centroid/above4k over 32768 samples vanaf 0,25 s. aliasDb = energie tussen harmonischen (buiten ±4 bins van k·F0) t.o.v. energie op de harmonischen; alleen bij vaste druk en Breath 0. Geen luisteroordeel.',
  worstAlias, pressureRows, aliasSweep, takes,
};
writeFileSync(resolve(destination, 'report.json'), JSON.stringify(summary, null, 2));

const row = take => `| ${take.f0} | ${take.vowelName} | ${take.voice} | ${take.pressureName} | ${take.breath} | ${take.rmsDb.toFixed(1)} | ${take.centroidHz.toFixed(0)} | ${take.above4kDb.toFixed(1)} | ${take.aliasDb === undefined ? '' : take.aliasDb.toFixed(1)} |`;
console.log('| F0 | Klinker | Voice | Pressure | Breath | RMS dBFS | Centroid Hz | >4 kHz dB | Alias dB |');
console.log('|---:|---|---:|---|---:|---:|---:|---:|---:|');
console.log('Aliasing, slechtste 8 (vaste druk, Breath 0):');
for (const take of worstAlias) console.log(row(take));
console.log('Pressure-respons, klinker A, Voice 0,35:');
for (const take of pressureRows) console.log(row(take));
console.log('Alias per F0 en Voice tot 1760 Hz (klinker A, Pressure hoog, Breath 0):');
for (const take of aliasSweep) console.log(row(take));
console.log(`${takes.length} takes, ${written.length} wav's in ${destination}`);
