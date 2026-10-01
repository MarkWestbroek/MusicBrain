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
  const makeVoice = async (frequency, vowel, phonation, tone = 0.5, velocity, pressure) => {
    const module = await load(file);
    assert(module.controls.some(control => control.id === 'voice'), 'FOF: Voice control missing');
    assert(module.inputs.some(input => input.id === 'vel'), 'FOF: velocity input missing');
    assert(module.inputs.some(input => input.id === 'pressure'), 'FOF: pressure input missing');
    if (velocity !== undefined) module.setIn('vel', velocity);
    if (pressure !== undefined) module.setIn('pressure', pressure);
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
        // Periodiciteit: zoek de beste lag binnen 3 % van de nominale periode;
        // open klinkers zingen bewust een paar cent lager (intrinsieke toonhoogte).
        const nominal = module.rate / frequency;
        let bestLag = 0, bestRatio = Infinity;
        for (let lag = Math.floor(nominal * 0.97); lag <= Math.ceil(nominal * 1.03); lag++) {
          let error = 0, energy = 0;
          for (let index = lag; index < samples.length; index++) {
            error += (samples[index] - samples[index - lag]) ** 2;
            energy += samples[index] ** 2;
          }
          if (error / energy < bestRatio) { bestRatio = error / energy; bestLag = lag; }
        }
        assert(bestRatio < 0.12, `FOF: pitch drift at ${frequency} Hz (${bestRatio})`);
        if (frequency === 110 && phonation === 0.35) {
          const cents = 1200 * Math.log2(bestLag / nominal);
          if (vowel === 0) assert(cents > 6 && cents < 18, `FOF: /a/ must sit ~12 cent low (${cents})`);
          if (vowel === 0.5) assert(Math.abs(cents) < 4, `FOF: /i/ must sit on pitch (${cents})`);
        }
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
  const unpatched = captureFof(await makeVoice(220, 0, 0.35), 0.2);
  const loud = captureFof(await makeVoice(220, 0, 0.35, 0.5, 1), 0.2);
  const soft = captureFof(await makeVoice(220, 0, 0.35, 0.5, 0.25), 0.2);
  assert.deepEqual(unpatched, loud, 'FOF: unconnected velocity must preserve the old sound');
  assert(rms(loud) > rms(soft) * 1.5, 'FOF: soft playing must reduce volume');
  const softRms = rms(soft), loudRms = rms(loud);
  const shapeDifference = soft.reduce((sum, sample, index) => sum + (sample / softRms - loud[index] / loudRms) ** 2, 0) / soft.length;
  assert(shapeDifference > 0.01, 'FOF: velocity must change timbre, not just volume');
  assert.equal(rms(captureFof(await makeVoice(220, 0, 0.35, 0.5, -10), 0.1)), 0, 'FOF: negative velocity must clamp to silence');
  assert.deepEqual(captureFof(await makeVoice(220, 0, 0.35, 0.5, 10), 0.2), loud, 'FOF: velocity above one must clamp');
  const releasedZero = await makeVoice(220, 0, 0.35, 0.5, 0.4);
  const releasedHeld = await makeVoice(220, 0, 0.35, 0.5, 0.4);
  releasedZero.setIn('gate', 0);
  releasedHeld.setIn('gate', 0);
  releasedZero.setIn('vel', 0);
  const tail = captureFof(releasedZero, 0.1);
  assert(rms(tail) > 0.0001, 'FOF: note-off must not cut the tail');
  assert.deepEqual(tail, captureFof(releasedHeld, 0.1), 'FOF: note-off velocity must not change the release');
  // Pressure: doorlopende expressie tijdens de noot. Ongepatcht == 1 en moet
  // sample-exact de oude stem geven; lager = zachter (met vloer), ademiger en
  // een zachtere sluiting; sprongen worden in ~20 ms gladgestreken.
  const fullPressure = captureFof(await makeVoice(220, 0, 0.35, 0.5, undefined, 1), 0.2);
  assert.deepEqual(unpatched, fullPressure, 'FOF: unconnected pressure must equal pressure 1');
  assert.deepEqual(captureFof(await makeVoice(220, 0, 0.35, 0.5, undefined, 10), 0.2), unpatched, 'FOF: pressure above one must clamp');
  const pressureLevels = [];
  for (const pressure of [0, 0.25, 0.5, 0.75, 1]) {
    const samples = captureFof(await makeVoice(220, 0, 0.35, 0.5, undefined, pressure), 0.2);
    pressureLevels.push(rms(samples));
    if (pressure === 0) {
      assert(brightness(samples) < brightness(fullPressure) * 0.9, 'FOF: low pressure must soften the closure');
    }
  }
  for (let index = 1; index < pressureLevels.length; index++) {
    assert(pressureLevels[index] > pressureLevels[index - 1] * 1.05, `FOF: pressure response must rise monotonically (${pressureLevels})`);
  }
  assert(pressureLevels[0] > pressureLevels[4] * 0.2 && pressureLevels[0] < pressureLevels[4] * 0.6,
    `FOF: pressure floor out of range (${pressureLevels[0] / pressureLevels[4]})`);
  const breathyFull = await makeVoice(220, 0, 0.35, 0.5, undefined, 1);
  const breathyLow = await makeVoice(220, 0, 0.35, 0.5, undefined, 0.2);
  breathyFull.setCtl('breath', 0.5);
  breathyLow.setCtl('breath', 0.5);
  const breathRatio = samples => {
    let hf = 0;
    for (let index = 2; index < samples.length; index++) hf += (samples[index] - 2 * samples[index - 1] + samples[index - 2]) ** 2;
    return hf / samples.length / rms(samples) ** 2;
  };
  assert(breathRatio(captureFof(breathyLow, 0.2)) > breathRatio(captureFof(breathyFull, 0.2)) * 1.2, 'FOF: low pressure must be breathier');
  const stepped = await makeVoice(220, 0, 0.35, 0.5, undefined, 0);
  captureFof(stepped, 0.2);
  const before = captureFof(stepped, 0.02);
  stepped.setIn('pressure', 1);
  const after = captureFof(stepped, 0.02);
  const maxStep = samples => { let step = 0; for (let index = 1; index < samples.length; index++) step = Math.max(step, Math.abs(samples[index] - samples[index - 1])); return step; };
  assert(maxStep(after) < maxStep(fullPressure) * 1.5 && rms(after) < rms(fullPressure) * 0.9 && rms(after) > rms(before) * 1.2,
    'FOF: a pressure jump must be smoothed, not stepped');
  captureFof(stepped, 0.1);
  const settled = captureFof(stepped, 0.2);
  assert(Math.abs(rms(settled) / rms(fullPressure) - 1) < 0.02, `FOF: pressure must settle within ~120 ms (${rms(settled) / rms(fullPressure)})`);
  // Attenuators en de vibrato/voice-CV-ingangen (wrapper-niveau). Elke
  // vergelijking zet knop en kabel op hetzelfde moment, na dezelfde attack.
  const attenuated = await makeVoice(220, 0, 0.35);
  attenuated.setCtl('vel_amt', 0);
  attenuated.setCtl('press_amt', 0);
  attenuated.setIn('vel', 0.25);
  attenuated.setIn('pressure', 0);
  assert.deepEqual(captureFof(attenuated, 0.2), unpatched, 'FOF: vel_amt/press_amt 0 must ignore the cables');
  const quarterVel = await makeVoice(220, 0, 0.35);
  const scaledVel = await makeVoice(220, 0, 0.35);
  quarterVel.setIn('vel', 0.25);
  scaledVel.setCtl('vel_amt', 0.75);
  scaledVel.setIn('vel', 0);
  const quarter = captureFof(quarterVel, 0.2);
  assert(rms(quarter) < rms(unpatched) * 0.5, 'FOF: vel 0.25 after the attack must get quieter');
  assert.deepEqual(captureFof(scaledVel, 0.2), quarter, 'FOF: vel_amt 0.75 with vel 0 must equal vel 0.25');
  const voiceCv = await makeVoice(220, 0, 0);
  const voiceKnob = await makeVoice(220, 0, 0);
  voiceCv.setIn('voice', 1);
  voiceKnob.setCtl('voice', 1);
  assert.deepEqual(captureFof(voiceCv, 0.2), captureFof(voiceKnob, 0.2), 'FOF: voice CV must add to the Voice knob');
  voiceCv.setCtl('voice_amt', 0);
  voiceKnob.setCtl('voice', 0);
  assert.deepEqual(captureFof(voiceCv, 0.2), captureFof(voiceKnob, 0.2), 'FOF: voice_amt 0 must ignore the cable');
  const vibratoCv = await makeVoice(220, 0, 0.35);
  const vibratoKnob = await makeVoice(220, 0, 0.35);
  vibratoCv.setIn('vibrato', 0.6);
  vibratoKnob.setCtl('vibrato', 0.6);
  assert.deepEqual(captureFof(vibratoCv, 0.3), captureFof(vibratoKnob, 0.3), 'FOF: vibrato CV must add to the knob');
  vibratoCv.setCtl('vibrato_amt', 0.5);
  vibratoKnob.setCtl('vibrato', 0.3);
  assert.deepEqual(captureFof(vibratoCv, 0.3), captureFof(vibratoKnob, 0.3), 'FOF: vibrato_amt must scale the CV');
  // Lettergrepen: Syl 0 = Vowel-knop (de oude stem), 1 = doo, 2 = da. De
  // d-aanzet is 20 ms sluiting (murmur, lage F1), 6 ms burst rond 3,8 kHz en
  // 60 ms formantglijbaan; daarna staan de formanten exact op de klinker.
  const startVoice = async (controls, inputs = {}) => {
    const module = await load(file);
    module.setCtl('breath', 0);
    module.setCtl('vibrato', 0);
    for (const [id, value] of Object.entries(controls)) module.setCtl(id, value);
    for (const [id, value] of Object.entries(inputs)) module.setIn(id, value);
    module.setIn('voct', Math.log2(220 / 261.6256));
    module.setIn('gate', 1);
    return module;
  };
  const windows = async (module) => ({
    closure: captureFof(module, 0.019), burst: captureFof(module, 0.009),
    glide: captureFof(module, 0.06), steady: captureFof(module, 0.2),
  });
  const plainOe = await windows(await startVoice({ vowel: 1 }));
  const doo = await windows(await startVoice({ syl: 1 }));
  const plainA = await windows(await startVoice({ vowel: 0 }));
  const da = await windows(await startVoice({ syl: 2 }));
  assert(rms(doo.closure) < rms(plainOe.closure) * 0.75, 'FOF: /d/ closure must dip below the plain vowel onset');
  assert(rms(plainA.steady) > rms(plainOe.steady) * 0.6, 'FOF: open /a/ must not be much quieter than /oe/ (intrinsic level)');
  assert(brightness(doo.burst) > brightness(plainOe.burst) * 3, 'FOF: /d/ burst must add high-frequency energy');
  assert(Math.abs(rms(doo.steady) / rms(plainOe.steady) - 1) < 0.01, 'FOF: doo must settle on the oe vowel');
  assert(Math.abs(rms(da.steady) / rms(plainA.steady) - 1) < 0.01, 'FOF: da must settle on the a vowel');
  assert(Math.abs(rms(da.steady) / rms(doo.steady) - 1) > 0.2, 'FOF: doo and da must differ in vowel');
  // syl_cv loopt 0..1 over de tabel van 23: index = round(cv * 22).
  assert.deepEqual(await windows(await startVoice({}, { syl_cv: 1 / 22 })), doo, 'FOF: syl_cv 1/22 must select doo');
  assert.deepEqual(await windows(await startVoice({}, { syl_cv: 2 / 22 })), da, 'FOF: syl_cv 2/22 must select da');
  // Next/Reset: een flank op next stapt door (knop 0 + 1 stap = doo), reset gaat terug.
  const steppedSyl = await load(file);
  steppedSyl.setCtl('breath', 0); steppedSyl.setCtl('vibrato', 0);
  steppedSyl.setIn('voct', Math.log2(220 / 261.6256));
  steppedSyl.setIn('next', 1); captureFof(steppedSyl, 0.01); steppedSyl.setIn('next', 0); captureFof(steppedSyl, 0.01);
  steppedSyl.setIn('gate', 1);
  const steppedWindows = await windows(steppedSyl);
  assert(Math.abs(rms(steppedWindows.steady) / rms(doo.steady) - 1) < 0.01, 'FOF: next must step from Vowel to doo');
  assert(rms(steppedWindows.closure) < rms(steppedWindows.steady) * 0.2, 'FOF: stepped doo must play its onset');
  steppedSyl.setIn('gate', 0); captureFof(steppedSyl, 0.3);
  steppedSyl.setIn('reset', 1); captureFof(steppedSyl, 0.01); steppedSyl.setIn('reset', 0);
  steppedSyl.setIn('gate', 1);
  const resetWindows = await windows(steppedSyl);
  assert(Math.abs(rms(resetWindows.steady) / rms(plainA.steady) - 1) < 0.02, 'FOF: reset must return to the knob (Vowel = a)');
  assert.deepEqual(await windows(await startVoice({ syl_amt: 0 }, { syl_cv: 1 })), plainA, 'FOF: syl_amt 0 must ignore the cable');
  const heldDoo = await startVoice({ syl: 1 });
  await windows(heldDoo);
  heldDoo.setCtl('syl', 2);
  assert(Math.abs(rms(captureFof(heldDoo, 0.2)) / rms(doo.steady) - 1) < 0.01, 'FOF: a syllable change must wait for the next gate');
  heldDoo.setIn('gate', 0);
  captureFof(heldDoo, 0.3);
  heldDoo.setIn('gate', 1);
  const retrigger = await windows(heldDoo);
  // De sluiting is een zachte voice bar met een beetje lucht: veel stiller
  // dan de klinker zelf; een gewone klinkeraanzet zit na 19 ms al rond 45 %.
  assert(rms(plainA.closure) > rms(plainA.steady) * 0.35, 'FOF: plain vowel onset is just the attack');
  assert(rms(da.closure) < rms(da.steady) * 0.2, 'FOF: /d/ closure must be quiet');
  assert(rms(retrigger.closure) < rms(retrigger.steady) * 0.2, 'FOF: retrigger must play the onset again');
  assert(Math.abs(rms(retrigger.steady) / rms(plainA.steady) - 1) < 0.02, 'FOF: retrigger must use the newly chosen syllable');
  const extremeDa = await startVoice({ syl: 2, breath: 1, voice: 0, tone: 1 }, { voct: Math.log2(880 / 261.6256), pressure: 0 });
  await windows(extremeDa);
  // Alle twintig lettergrepen: eindig, niet geclipt, de klinker klinkt, de
  // coda speelt na de gate en sterft uit; na een stemloze slotmedeklinker
  // (cob = kop, slaapt, nog) komt de stem in de release niet terug.
  for (let syl = 1; syl < 23; syl++) {
    const module = await startVoice({ syl });
    captureFof(module, 0.15);
    const held = captureFof(module, 0.15);
    assert(rms(held) > 0.01, `FOF: syllable ${syl} must sing its vowel`);
    module.setIn('gate', 0);
    const coda = captureFof(module, 0.25);
    const tail = captureFof(module, 0.4);
    const silence = captureFof(module, 0.2);
    assert(rms(silence) < rms(held) * 0.02, `FOF: syllable ${syl} must decay after the coda (${rms(silence) / rms(held)})`);
    if ([6, 7, 9].includes(syl)) {
      assert(rms(tail) < rms(coda) * 0.35, `FOF: syllable ${syl} must not voice again after a voiceless coda (${rms(tail) / rms(coda)})`);
    }
    module.setIn('gate', 1);
    captureFof(module, 0.3);
    assert(rms(captureFof(module, 0.1)) > 0.01, `FOF: syllable ${syl} must retrigger`);
  }
  for (const frequency of [110, 880]) {
    for (const syl of [6, 7, 8, 14, 17, 22]) {
      const module = await startVoice({ syl, breath: 0.5 }, { voct: Math.log2(frequency / 261.6256) });
      captureFof(module, 0.3);
      module.setIn('gate', 0);
      captureFof(module, 0.4);
    }
  }
  const jumpy = await makeVoice(880, 0.5, 0, 0.5, undefined, 0);
  for (let toggle = 0; toggle < 40; toggle++) { jumpy.setIn('pressure', toggle % 2 ? 0 : 1); captureFof(jumpy, 0.005); }
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
  console.log('FOF regression: 45 pitch/vowel/Voice cases, spectral tilt, velocity volume/timbre/default/clamps/note-off, pressure default/clamp/monotone/floor/timbre/breath/smoothing/jumps, attenuators + vibrato/voice CV, syllables doo/da (closure, burst, settle, CV, hold, retrigger) + 22 table syllables (coda, decay, voiceless tail, retrigger, extremes) + next/reset, intrinsic vowel pitch/level, release/retrigger/mute and 8 extreme cases passed.');
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
