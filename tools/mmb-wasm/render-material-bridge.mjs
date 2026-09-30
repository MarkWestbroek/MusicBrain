import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'editor/package.json'));
const { build } = require('esbuild');
const bundle = await build({
  stdin: {
    contents: "export {seedMaterialBridgeDemo} from './seedModules'; export {emptyModularProject} from './types';",
    resolveDir: resolve(root, 'editor/src/modular-mb'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { seedMaterialBridgeDemo, emptyModularProject } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const project = seedMaterialBridgeDemo(emptyModularProject());
const patches = project.patches.slice(-2);
const materialId = patches[0].connections.find(connection => connection.to.portId === 'gate').to.moduleId;
const rhythmIds = ['gate', 'gate_b'].map(port => patches[0].connections.find(connection => connection.to.portId === port).from.moduleId);
const rate = 44100;
const seconds = 20;
const activeSeconds = 12;
const frames = seconds * rate;
const destination = resolve(process.argv[2] ?? resolve(tmpdir(), 'mmb-material-bridge-ab'));

async function load(typeId, controls) {
  const code = await WebAssembly.compile(readFileSync(resolve(root, `editor/public/wasm/${typeId}.wasm`)));
  const imports = {};
  for (const entry of WebAssembly.Module.imports(code)) (imports[entry.module] ??= {})[entry.name] = () => 0;
  const { exports: api } = await WebAssembly.instantiate(code, imports);
  api.mmb_init();
  const text = pointer => {
    const bytes = new Uint8Array(api.memory.buffer);
    const end = bytes.indexOf(0, pointer);
    return new TextDecoder().decode(bytes.subarray(pointer, end));
  };
  const inputs = Object.fromEntries(Array.from({ length: api.mmb_num_inputs() }, (_, index) => [text(api.mmb_input_id(index)), index]));
  const outputs = Object.fromEntries(Array.from({ length: api.mmb_num_outputs() }, (_, index) => [text(api.mmb_output_id(index)), index]));
  for (let index = 0; index < api.mmb_num_controls(); index++) {
    const value = controls[text(api.mmb_control_id(index))];
    if (value !== undefined) api.mmb_set_control(index, value);
  }
  return {
    render: count => api.mmb_render(count),
    input(name, value, sample = 0) {
      assert(name in inputs, name);
      api.mmb_input_connected(inputs[name], 1);
      new Float32Array(api.memory.buffer, api.mmb_input_ptr(inputs[name]), 256)[sample] = value;
    },
    output(name) { return new Float32Array(api.memory.buffer, api.mmb_output_ptr(outputs[name]), 256); },
  };
}

async function stimulus() {
  const rhythms = await Promise.all(rhythmIds.map(id => load('tp_mmb_seq8', patches[0].controlState[id])));
  const gates = [new Float32Array(frames), new Float32Array(frames)];
  const velocity = new Float32Array(frames);
  const hits = [0, 0];
  const previous = [0, 0];
  let tick = -1;
  for (let sample = 0; sample < frames; sample++) {
    const nextTick = Math.floor(sample * 1000 / rate);
    if (nextTick !== tick) {
      tick = nextTick;
      for (const rhythm of rhythms) {
        rhythm.input('reset', tick === 0 ? 1 : 0);
        rhythm.render(1);
      }
    }
    velocity[sample] = rhythms[0].output('cv')[0];
    for (let index = 0; index < 2; index++) {
      const gate = sample < activeSeconds * rate || previous[index] ? rhythms[index].output('gate_out')[0] : 0;
      gates[index][sample] = gate;
      if (gate && !previous[index]) hits[index]++;
      previous[index] = gate;
    }
  }
  assert(hits[0] >= 24 && hits[1] >= 36, `Missing hits: ${hits}`);
  for (const gate of gates) {
    let start = -1;
    for (let sample = 0; sample < frames; sample++) {
      if (gate[sample] && start < 0) start = sample;
      if (!gate[sample] && start >= 0) {
        assert((sample - start) / rate >= 0.005, 'Gate shorter than Teensy block');
        start = -1;
      }
    }
  }
  return { gates, velocity, hits };
}

const drive = await stimulus();
async function render(patch) {
  const material = await load('tp_mmb_material_bridge', patch.controlState[materialId]);
  material.input('reset', 1);
  material.render(1);
  material.input('reset', 0);
  const audio = new Float32Array(frames * 2);
  let peak = 0, energy = 0, stressPeak = 0;
  for (let offset = 0; offset < frames; offset += 32) {
    const count = Math.min(32, frames - offset);
    for (let sample = 0; sample < count; sample++) {
      material.input('gate', drive.gates[0][offset + sample], sample);
      material.input('gate_b', drive.gates[1][offset + sample], sample);
      material.input('vel', drive.velocity[offset + sample], sample);
    }
    material.render(count);
    const left = material.output('out_l'), right = material.output('out_r'), stress = material.output('stress');
    for (let sample = 0; sample < count; sample++) {
      stressPeak = Math.max(stressPeak, stress[sample]);
      for (let channel = 0; channel < 2; channel++) {
        const value = (channel === 0 ? left : right)[sample];
        assert(Number.isFinite(value));
        audio[2 * (offset + sample) + channel] = value;
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
    }
  }
  assert(peak > 0.05 && peak <= 1);
  assert(stressPeak > 0.6, 'Demo never stresses the bridge');
  const stressEnd = material.output('stress')[(frames - 1) % 32];
  assert(stressEnd < 0.1, `No recovery: ${stressEnd}`);
  return { audio, peak, rms: Math.sqrt(energy / audio.length), stressPeak, stressEnd };
}

const takes = await Promise.all(patches.map(render));
assert.deepEqual((await render(patches[0])).audio, takes[0].audio, 'Non-reproducible render');
const targetRms = Math.min(0.1, ...takes.map(take => 0.9 * take.rms / take.peak));
function wav(audio, gain) {
  const bytes = Buffer.alloc(44 + audio.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28); bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(audio.length * 2, 40);
  let energy = 0;
  for (let index = 0; index < audio.length; index++) {
    const value = Math.round(audio[index] * gain * 32767);
    assert(Math.abs(value) <= 32767, 'Clipping after level match');
    bytes.writeInt16LE(value, 44 + index * 2);
    energy += (value / 32767) ** 2;
  }
  assert(Math.abs(20 * Math.log10(Math.sqrt(energy / audio.length) / targetRms)) < 0.01);
  return bytes;
}
mkdirSync(destination, { recursive: true });
const report = takes.map((take, index) => {
  const gain = targetRms / take.rms;
  const name = index === 0 ? 'memory-on.wav' : 'memory-off.wav';
  const bytes = wav(take.audio, gain);
  writeFileSync(resolve(destination, name), bytes);
  return { name, memory: patches[index].controlState[materialId].memory, gain,
    rawRms: take.rms, matchedRms: targetRms, matchedPeak: gain * take.peak,
    stressPeak: take.stressPeak, stressEnd: take.stressEnd,
    sha256: createHash('sha256').update(bytes).digest('hex') };
});
writeFileSync(resolve(destination, 'report.json'), JSON.stringify({
  rate, seconds, activeSeconds, hits: drive.hits,
  matching: 'Whole-take stereo RMS, one constant gain per take; not perceptual LUFS or a blind listening result.',
  timing: 'Actual Seq16 wasm at 1 kHz, sample-and-hold to 44.1 kHz, velocity written before gates in each DSP sample. Live wrapper scheduling may differ.',
  controls: patches.map(patch => patch.controlState), takes: report,
}, null, 2));
console.log(JSON.stringify({ destination, hits: drive.hits, reproducible: true, takes: report }, null, 2));