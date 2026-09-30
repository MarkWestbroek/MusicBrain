// Rooktest voor de mmb-wasm modules onder node: laadt elke .wasm, leest de
// poorten/controls uit, stuurt een noot of klok en meet de uitgangen.
//   node tools/mmb-wasm/test.mjs [typeId]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'editor/public/wasm');

async function load(file) {
  const bytes = readFileSync(join(dir, file));
  const mod = await WebAssembly.compile(bytes);
  const imports = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module][imp.name] = imp.name === 'proc_exit' ? (c) => { throw new Error('proc_exit ' + c); } : () => 0;
  }
  const inst = await WebAssembly.instantiate(mod, imports);
  const ex = inst.exports;
  const cstr = (p) => { const m = new Uint8Array(ex.memory.buffer); let s = ''; for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]); return s; };
  ex.mmb_init();
  const m = {
    ex, typeId: cstr(ex.mmb_type_id()), rate: ex.mmb_native_rate(), block: ex.mmb_block(),
    inputs: [], outputs: [], controls: [],
  };
  for (let i = 0; i < ex.mmb_num_inputs(); i++) m.inputs.push({ id: cstr(ex.mmb_input_id(i)), kind: ex.mmb_input_kind(i), ptr: ex.mmb_input_ptr(i) });
  for (let i = 0; i < ex.mmb_num_outputs(); i++) m.outputs.push({ id: cstr(ex.mmb_output_id(i)), kind: ex.mmb_output_kind(i), ptr: ex.mmb_output_ptr(i) });
  for (let i = 0; i < ex.mmb_num_controls(); i++) m.controls.push({ id: cstr(ex.mmb_control_id(i)), value: ex.mmb_control_value(i) });
  m.inBuf = (i) => new Float32Array(ex.memory.buffer, m.inputs[i].ptr, 256);
  m.outBuf = (i) => new Float32Array(ex.memory.buffer, m.outputs[i].ptr, 256);
  m.setIn = (id, v, connected = true) => { const i = m.inputs.findIndex((p) => p.id === id); if (i < 0) return; m.inBuf(i).fill(v); ex.mmb_input_connected(i, connected ? 1 : 0); };
  m.setCtl = (id, v) => { const i = m.controls.findIndex((c) => c.id === id); if (i >= 0) ex.mmb_set_control(i, v); };
  return m;
}

function run(m, seconds, script) {
  const stats = m.outputs.map(() => ({ peak: 0, min: Infinity, max: -Infinity, edges: 0, last: 0 }));
  const total = Math.round(m.rate * seconds);
  let t = 0;
  while (t < total) {
    script(t / m.rate);
    m.ex.mmb_render(m.block);
    for (let o = 0; o < m.outputs.length; o++) {
      const b = m.outBuf(o), s = stats[o];
      for (let k = 0; k < m.block; k++) {
        const v = b[k], a = Math.abs(v);
        if (a > s.peak) s.peak = a;
        if (v < s.min) s.min = v;
        if (v > s.max) s.max = v;
        if (s.last < 0.5 && v >= 0.5) s.edges++;
        s.last = v;
      }
    }
    t += m.block;
  }
  return stats;
}

function report(m, stats, ms) {
  const parts = m.outputs.map((o, i) => {
    const s = stats[i];
    return o.kind === 0 ? `${o.id} peak ${s.peak.toFixed(3)}` : `${o.id} [${s.min.toFixed(2)}..${s.max.toFixed(2)}]${o.kind === 2 ? ` ${s.edges} flanken` : ''}`;
  });
  console.log(`${m.typeId.padEnd(18)} ${String(m.rate).padStart(5)} Hz/${String(m.block).padStart(2)}  ${parts.join(' · ')}  (${ms.toFixed(0)} ms/s = ${(ms / 10).toFixed(1)}% CPU)`);
}

function captureFof(module, seconds) {
  const samples = new Float32Array(Math.ceil(module.rate * seconds / module.block) * module.block);
  for (let offset = 0; offset < samples.length; offset += module.block) {
    module.ex.mmb_render(module.block);
    samples.set(module.outBuf(0).subarray(0, module.block), offset);
  }
  assert(samples.every(Number.isFinite), 'FOF: non-finite sample');
  assert(samples.every(sample => Math.abs(sample) < 0.999), 'FOF: clipping');
  return samples;
}

function rms(samples) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
}

async function checkFof(file) {
  const makeVoice = async (frequency, vowel, phonation, tone = 0.5) => {
    const module = await load(file);
    assert(module.controls.some(control => control.id === 'voice'), 'FOF: Voice control missing');
    module.setCtl('breath', 0);
    module.setCtl('vibrato', 0);
    module.setCtl('voice', phonation);
    module.setCtl('vowel', vowel);
    module.setCtl('tone', tone);
    module.setIn('voct', Math.log2(frequency / 261.6256));
    module.setIn('gate', 1);
    captureFof(module, 0.15);
    return module;
  };
  for (const frequency of [110, 220, 440]) {
    for (const vowel of [0, 0.25, 0.5, 0.75, 1]) {
      for (const phonation of [0, 0.35, 1]) {
        const module = await makeVoice(frequency, vowel, phonation);
        const samples = captureFof(module, 0.12);
        assert(rms(samples) > 0.0001, `FOF: silent vowel ${vowel} at ${frequency} Hz`);
        const lag = Math.round(module.rate / frequency);
        let error = 0, energy = 0;
        for (let index = lag; index < samples.length; index++) {
          error += (samples[index] - samples[index - lag]) ** 2;
          energy += samples[index] ** 2;
        }
        assert(error / energy < 0.12, `FOF: pitch drift at ${frequency} Hz (${error / energy})`);
      }
    }
  }
  const closed = captureFof(await makeVoice(220, 0, 0), 0.2);
  const open = captureFof(await makeVoice(220, 0, 1), 0.2);
  const brightness = samples => {
    let difference = 0;
    for (let index = 1; index < samples.length; index++) difference += (samples[index] - samples[index - 1]) ** 2;
    return difference / samples.length / rms(samples) ** 2;
  };
  assert(brightness(closed) > brightness(open) * 1.1, 'FOF: Voice must change spectral tilt, not just level');
  const release = await makeVoice(220, 0.25, 0.35);
  const held = rms(captureFof(release, 0.1));
  release.setIn('gate', 0);
  captureFof(release, 1.2);
  assert(rms(captureFof(release, 0.1)) < held * 0.001, 'FOF: release does not decay');
  release.setIn('gate', 1);
  assert(rms(captureFof(release, 0.2)) > held * 0.5, 'FOF: retrigger stays silent');
  release.setCtl('level', 0);
  assert(rms(captureFof(release, 0.1)) === 0, 'FOF: level zero must mute');
  for (const frequency of [40, 2000]) {
    for (const phonation of [0, 1]) {
      for (const tone of [0, 1]) {
        const module = await makeVoice(frequency, 0.5, phonation, tone);
        module.setCtl('breath', 1);
        module.setCtl('vibrato', 1);
        module.setIn('vowel', -10);
        captureFof(module, 0.15);
        module.setIn('vowel', 10);
        module.setIn('breath', 10);
        module.setCtl('voice', 1 - phonation);
        captureFof(module, 0.15);
      }
    }
  }
  console.log('FOF regression: 45 pitch/vowel/Voice cases, spectral tilt, release/retrigger/mute and 8 extreme cases passed.');
}

const only = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.wasm') && (!only || f.includes(only))).sort();
for (const f of files) {
  const m = await load(f);
  const id = m.typeId;
  let script;
  if (id === 'tp_mmb_marbles') { script = () => {}; }
  else if (id === 'tp_mmb_stages') { m.setCtl('loop', 1); m.setCtl('segments', 2); m.setCtl('t1', 0.3); m.setCtl('t2', 0.3); script = (s) => m.setIn('gate', s < 0.01 ? 1 : 0); }
  else if (id === 'tp_mmb_clouds') { m.setCtl('mix', 1.0); let ph = 0; script = () => { const b = m.inBuf(0); for (let k = 0; k < m.block; k++) { b[k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * 220 / m.rate; } m.ex.mmb_input_connected(0, 1); }; }
  else if (id === 'tp_mmb_tides') { script = (s) => m.setIn('gate', s < 0.01 ? 1 : 0); }
  else if (id === 'tp_mmb_warps') { m.setCtl('shape', 1); m.setCtl('algo', 2); let ph = 0; script = () => { const b = m.inBuf(1); for (let k = 0; k < m.block; k++) { b[k] = 0.5 * Math.sin(ph); ph += 2 * Math.PI * 330 / m.rate; } m.ex.mmb_input_connected(1, 1); m.setIn('voct', 0); }; }
  else if (id === 'tp_mmb_tape_echo') { m.setCtl('feedback', 0.6); m.setCtl('mix', 1); let ph = 0; script = (s) => { const b = m.inBuf(0); for (let k = 0; k < m.block; k++) { b[k] = s < 0.05 ? 0.5 * Math.sin(ph) : 0; ph += 2 * Math.PI * 440 / m.rate; } m.ex.mmb_input_connected(0, 1); }; }
  else if (id === 'tp_mmb_sampler') {
    // 0,5 s stereo-sinus van 220 Hz in slot 0, één zone over het hele klavier;
    // voct +1 octaaf → 440 Hz, gate hoog.
    const n = 22050, i16 = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      const v = Math.round(12000 * Math.sin(2 * Math.PI * 220 * i / 44100));
      i16[i * 2] = v; i16[i * 2 + 1] = Math.round(v * 0.7);
    }
    const p = m.ex.mmb_blob_ptr(0, i16.byteLength);
    new Uint8Array(m.ex.memory.buffer).set(new Uint8Array(i16.buffer), p);
    m.ex.mmb_blob_commit(0, n, 44100, 2);
    //   idx slot low/highKey low/highVel root tune gain pan loop start/end decay release velTrack attack
    m.ex.mmb_zone_set(0, 0, 0, 127, 1, 127, 60, 0, 1, 0, 2, 0, n - 1, 0, 0.1, 0, 0);
    m.ex.mmb_zone_count(1);
    m.setIn('voct_1', 1); m.setIn('vel_1', 0.9);
    script = (s) => m.setIn('gate_1', s < 1.5 ? 1 : 0);
  }
  else if (id === 'tp_mmb_env_follower' || id === 'tp_mmb_env_follower_mono') {
    // Burst van 440 Hz op in_1 gedurende de eerste seconde; env_1 moet
    // meestijgen en daarna terugvallen, gate_1 geeft twee flanken (aan/uit).
    m.setCtl('attack', 5); m.setCtl('release', 150); m.setCtl('thresh', 0.1);
    let ph = 0;
    script = (s) => {
      const b = m.inBuf(0);
      for (let k = 0; k < m.block; k++) { b[k] = s < 1.0 ? 0.5 * Math.sin(ph) : 0; ph += 2 * Math.PI * 440 / m.rate; }
      m.ex.mmb_input_connected(0, 1);
    };
  }
  else if (id === 'tp_mmb_vcf' || id === 'tp_mmb_ms20') {
    // Zaagtand van 220 Hz door een lowpass op 400 Hz, met een trage
    // cutoff-sweep op de CV: de piek moet meebewegen en netjes ≤ 1 blijven.
    m.setCtl('cutoff', 400); m.setCtl('cv_amt', 2);
    m.setCtl('q', id === 'tp_mmb_vcf' ? 2.5 : 0.6);
    let ph = 0;
    script = (s) => {
      const b = m.inBuf(0);
      for (let k = 0; k < m.block; k++) { b[k] = 0.3 * (2 * (ph % 1) - 1); ph += 220 / m.rate; }
      m.ex.mmb_input_connected(0, 1);
      m.setIn('cv', 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * s));
    };
  }
  else if (id === 'tp_mmb_peaks') { script = (s) => m.setIn('gate', (s % 0.5) < 0.01 ? 1 : 0); }
  else { m.setIn('voct', 0); script = (s) => m.setIn('gate', s < 0.6 ? 1 : 0); }
  const t0 = process.hrtime.bigint();
  const stats = run(m, 2.0, script);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 2;
  report(m, stats, ms);
  if (id === 'tp_mmb_fof') {
    const peak = stats[0].peak;
    if (!Number.isFinite(peak) || peak < 0.02 || peak > 1.001) {
      throw new Error(`FOF-rooktest: ongeldige audiopiek ${peak}`);
    }
    await checkFof(f);
  }
}
