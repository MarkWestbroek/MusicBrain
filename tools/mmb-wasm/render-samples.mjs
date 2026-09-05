// Rendert voorbeeldsamples met MusicBrain's eigen wasm-modules (Peaks, Rings,
// Plaits, Elements) naar editor/public/samples/*.wav + index.json, zodat de
// 🎧 Sample-modal ze als voorbeelden kan aanbieden. Mono 16-bit op de native
// rate van de module; de editor resamplet naar 44,1 kHz bij het laden.
//   node tools/mmb-wasm/render-samples.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wasmDir = join(root, 'editor/public/wasm');
const outDir = join(root, 'editor/public/samples');
mkdirSync(outDir, { recursive: true });

async function load(typeId) {
  const mod = await WebAssembly.compile(readFileSync(join(wasmDir, typeId + '.wasm')));
  const imports = {};
  for (const imp of WebAssembly.Module.imports(mod)) { imports[imp.module] ??= {}; imports[imp.module][imp.name] = () => 0; }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports;
  const cstr = (p) => { const m = new Uint8Array(ex.memory.buffer); let s = ''; for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]); return s; };
  ex.mmb_init();
  const ins = new Map(), ctls = new Map();
  for (let i = 0; i < ex.mmb_num_inputs(); i++) ins.set(cstr(ex.mmb_input_id(i)), i);
  for (let i = 0; i < ex.mmb_num_controls(); i++) ctls.set(cstr(ex.mmb_control_id(i)), i);
  return {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(),
    setIn: (id, v) => { const i = ins.get(id); if (i === undefined) return; new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256).fill(v); ex.mmb_input_connected(i, 1); },
    ctl: (id, v) => { const i = ctls.get(id); if (i !== undefined) ex.mmb_set_control(i, v); },
    out: () => new Float32Array(ex.memory.buffer, ex.mmb_output_ptr(0), ex.mmb_block()),
  };
}

/** Render `seconds`; `script(t)` zet ingangen per blok. Trimt stilte aan het eind. */
function render(m, seconds, script) {
  const total = Math.round(m.rate * seconds);
  const buf = new Float32Array(total);
  for (let t = 0; t < total; t += m.block) {
    script(t / m.rate);
    m.ex.mmb_render(m.block);
    buf.set(m.out().subarray(0, Math.min(m.block, total - t)), t);
  }
  let end = total;
  while (end > m.rate * 0.05 && Math.abs(buf[end - 1]) < 0.002) end--;
  const out = buf.subarray(0, Math.min(total, end + Math.round(m.rate * 0.02)));
  // Normaliseren op −1 dBFS.
  let pk = 0; for (const x of out) pk = Math.max(pk, Math.abs(x));
  const g = pk > 0 ? 0.89 / pk : 1;
  return Float32Array.from(out, (x) => x * g);
}

function wav(samples, rate) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer)]);
}

const gateFor = (m, secs) => (t) => m.setIn('gate', t < secs ? 1 : 0);
const index = [];
async function make(file, name, typeId, root, seconds, setup, script) {
  const m = await load(typeId);
  setup(m);
  const s = render(m, seconds, script(m));
  writeFileSync(join(outDir, file), wav(s, m.rate));
  index.push({ file, name, root, seconds: +(s.length / m.rate).toFixed(2), source: typeId });
  console.log(`${file.padEnd(22)} ${name.padEnd(28)} ${(s.length / m.rate).toFixed(2)} s @ ${m.rate} Hz`);
}

// Peaks — de 808-familie.
await make('peaks-kick.wav',  'Peaks kick (808)',   'tp_mmb_peaks', 60, 1.2, (m) => { m.ctl('drum', 0); m.ctl('tone', 0.4); m.ctl('decay', 0.6); m.ctl('snap', 0.6); }, (m) => gateFor(m, 0.01));
await make('peaks-snare.wav', 'Peaks snare (808)',  'tp_mmb_peaks', 60, 0.8, (m) => { m.ctl('drum', 1); m.ctl('tone', 0.6); m.ctl('decay', 0.45); m.ctl('snap', 0.5); }, (m) => gateFor(m, 0.01));
await make('peaks-hat.wav',   'Peaks hi-hat (808)', 'tp_mmb_peaks', 60, 0.4, (m) => { m.ctl('drum', 2); }, (m) => gateFor(m, 0.01));
await make('peaks-fmdrum.wav','Peaks FM-drum',      'tp_mmb_peaks', 60, 0.8, (m) => { m.ctl('drum', 3); m.ctl('tone', 0.5); m.ctl('decay', 0.5); m.ctl('snap', 0.7); }, (m) => gateFor(m, 0.01));
// Rings — modale pluk en sympathetic strings, op C3 (root 48).
await make('rings-modal-c3.wav',  'Rings modal pluk (C3)',       'tp_mmb_rings', 48, 2.5, (m) => { m.ctl('model', 0); m.ctl('structure', 0.45); m.ctl('brightness', 0.6); m.ctl('damping', 0.55); m.ctl('position', 0.3); m.setIn('voct', -1); }, (m) => gateFor(m, 0.02));
await make('rings-string-c3.wav', 'Rings sympathetic string (C3)','tp_mmb_rings', 48, 3.0, (m) => { m.ctl('model', 1); m.ctl('structure', 0.6); m.ctl('brightness', 0.5); m.ctl('damping', 0.7); m.ctl('position', 0.25); m.setIn('voct', -1); }, (m) => gateFor(m, 0.02));
// Plaits — snaar en modaal, op C4 (root 60).
await make('plaits-string-c4.wav', 'Plaits string (C4)', 'tp_mmb_plaits', 60, 2.0, (m) => { m.ctl('engine', 11); m.ctl('harmonics', 0.5); m.ctl('timbre', 0.55); m.ctl('morph', 0.4); m.ctl('decay', 0.6); m.setIn('voct', 0); }, (m) => gateFor(m, 0.02));
await make('plaits-modal-c4.wav',  'Plaits modal (C4)',  'tp_mmb_plaits', 60, 2.0, (m) => { m.ctl('engine', 12); m.ctl('harmonics', 0.4); m.ctl('timbre', 0.5); m.ctl('morph', 0.5); m.ctl('decay', 0.6); m.setIn('voct', 0); }, (m) => gateFor(m, 0.02));
// Elements — slag op een marimba-achtige resonator, C4.
await make('elements-strike-c4.wav', 'Elements strike (C4)', 'tp_mmb_elements', 60, 2.5, (m) => { m.ctl('strike', 0.8); m.ctl('bow', 0); m.ctl('blow', 0); m.ctl('geometry', 0.35); m.ctl('brightness', 0.55); m.ctl('damping', 0.6); m.ctl('position', 0.3); m.ctl('strike_meta', 0.5); m.setIn('voct', 0); m.setIn('strength', 0.8); }, (m) => gateFor(m, 0.05));

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`index.json: ${index.length} samples`);
