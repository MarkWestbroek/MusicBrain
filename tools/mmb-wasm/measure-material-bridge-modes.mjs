// Moduskaart van Material Bridge: slaat het model één keer zacht-hard aan
// (Memory en Fatigue uit) en meet de dominante spectrale pieken van L+R.
// Gebruik vanuit de repositoryroot, na `bash tools/mmb-wasm/build.sh materialbridge`:
//
//   node tools/mmb-wasm/measure-material-bridge-modes.mjs
//   node tools/mmb-wasm/measure-material-bridge-modes.mjs "0,0.65,0.12" "-12,0.65,0.12"
//
// Ieder argument is "pitch,couple,spread". Zonder argumenten draait een vast
// raster. De uitvoer geeft per piek de frequentie, het niveau ten opzichte van
// de sterkste piek en de afwijking in cents ten opzichte van de grondtoon van
// de Pitch-knop. Dit is een deterministische meting via de echte wasm, geen
// perceptuele toonhoogtebepaling.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rate = 44100;

async function load(controls) {
  const code = await WebAssembly.compile(readFileSync(resolve(root, 'editor/public/wasm/tp_mmb_material_bridge.wasm')));
  const imports = {};
  for (const entry of WebAssembly.Module.imports(code)) (imports[entry.module] ??= {})[entry.name] = () => 0;
  const { exports: api } = await WebAssembly.instantiate(code, imports);
  api.mmb_init();
  const text = pointer => { const bytes = new Uint8Array(api.memory.buffer); return new TextDecoder().decode(bytes.subarray(pointer, bytes.indexOf(0, pointer))); };
  const inputs = {}, outputs = {};
  for (let index = 0; index < api.mmb_num_inputs(); index++) inputs[text(api.mmb_input_id(index))] = index;
  for (let index = 0; index < api.mmb_num_outputs(); index++) outputs[text(api.mmb_output_id(index))] = index;
  for (let index = 0; index < api.mmb_num_controls(); index++) {
    const value = controls[text(api.mmb_control_id(index))];
    if (value !== undefined) api.mmb_set_control(index, value);
  }
  return {
    render: count => api.mmb_render(count),
    input(name, value, sample = 0) {
      api.mmb_input_connected(inputs[name], 1);
      new Float32Array(api.memory.buffer, api.mmb_input_ptr(inputs[name]), 256)[sample] = value;
    },
    output(name) { return new Float32Array(api.memory.buffer, api.mmb_output_ptr(outputs[name]), 256); },
  };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
      }
    }
  }
}

export async function modes(pitch, coupling, spread) {
  const module = await load({ pitch, coupling, spread, memory: 0, fatigue: 0, decay: 8, pickup: 0.25, level: 1 });
  const size = 1 << 17;
  const signal = new Float64Array(size);
  for (let offset = 0; offset < size; offset += 32) {
    for (let sample = 0; sample < 32; sample++) module.input('gate', offset === 0 && sample === 0 ? 1 : 0, sample);
    module.render(32);
    const left = module.output('out_l'), right = module.output('out_r');
    for (let sample = 0; sample < 32; sample++) signal[offset + sample] = left[sample] + right[sample];
  }
  const re = signal.map((value, index) => value * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / size)));
  const im = new Float64Array(size);
  fft(re, im);
  const magnitude = [];
  for (let bin = 1; bin < size / 2; bin++) magnitude.push(Math.hypot(re[bin], im[bin]));
  const strongest = Math.max(...magnitude);
  const rootHz = 261.6256 * 2 ** (pitch / 12);
  const peaks = [];
  for (let bin = 2; bin < magnitude.length - 2; bin++) {
    if (magnitude[bin] > magnitude[bin - 1] && magnitude[bin] > magnitude[bin + 1] && magnitude[bin] > strongest * 0.05) {
      const hz = (bin + 1) * rate / size;
      peaks.push({ hz, db: 20 * Math.log10(magnitude[bin] / strongest), cents: 1200 * Math.log2(hz / rootHz) });
    }
  }
  return { pitch, coupling, spread, rootHz, peaks };
}

const grid = process.argv.length > 2
  ? process.argv.slice(2).map(argument => argument.split(',').map(Number))
  : [[0, 0, 0.12], [0, 0.25, 0.12], [0, 0.5, 0.12], [0, 0.65, 0.12], [0, 1, 0.12], [-12, 0.65, 0.12], [12, 0.65, 0.12], [-24, 0.65, 0.12], [0, 0.65, 0.35], [0, 0.65, 1]];
for (const [pitch, coupling, spread] of grid) {
  const result = await modes(pitch, coupling, spread);
  const list = result.peaks.map(peak => `${peak.hz.toFixed(1)} Hz (${peak.db.toFixed(0)} dB, ${peak.cents >= 0 ? '+' : ''}${peak.cents.toFixed(0)} c)`).join('  ');
  console.log(`pitch ${String(pitch).padStart(3)}  couple ${coupling}  spread ${spread}  root ${result.rootHz.toFixed(1)} Hz  ->  ${list}`);
}
