// Rendert alle lettergrepen van tp_mmb_fof (FOF-VOICE) als wav, en haalt
// dezelfde woorden op bij de Piper-dienst (tools/piper-tts) als referentie,
// met de foneemtijden erbij. Daarna vergelijkt tools/mmb-wasm/formant-compare.py
// de twee sets (formantsporen, F0, bursts).
//
//   node tools/mmb-wasm/render-fof-syllables.mjs [doelmap] [--f0 165] [--no-piper]
//
// Standaard doelmap: %TEMP%/mmb-fof-syllables. Piper: http://127.0.0.1:8788
// (MMB_TTS_ENDPOINT om een andere te kiezen, MMB_TTS_VOICE voor de stem).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const destination = resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--f0') ?? resolve(tmpdir(), 'mmb-fof-syllables'));
const f0 = Number(flag('--f0') ?? 165);   // Piper's pim/alex speak around 165 Hz
const usePiper = !args.includes('--no-piper');
const endpoint = process.env.MMB_TTS_ENDPOINT ?? 'http://127.0.0.1:8788/tts';
const voice = process.env.MMB_TTS_VOICE ?? 'nl_NL-alex-medium';
const rate = 44100;

// Index in de firmwaretabel → naam en het woord dat Piper moet zeggen.
export const SYLLABLES = [
  { name: 'Vowel', text: 'aa' }, { name: 'doo', text: 'doe' }, { name: 'da', text: 'da' }, { name: 'va', text: 'va' },
  { name: 'der', text: 'der' }, { name: 'ja', text: 'ja' }, { name: 'cob', text: 'cob' }, { name: 'slaapt', text: 'slaapt' },
  { name: 'gij', text: 'gij' }, { name: 'nog', text: 'nog' }, { name: 'al', text: 'al' }, { name: 'le', text: 'le' },
  { name: 'klo', text: 'klo' }, { name: 'ken', text: 'ken' }, { name: 'lui', text: 'lui' }, { name: 'den', text: 'den' },
  { name: 'bim', text: 'bim' }, { name: 'bam', text: 'bam' }, { name: 'bom', text: 'bom' }, { name: 'de', text: 'de' },
  { name: 'na', text: 'na' }, { name: 'hee', text: 'hee' }, { name: 'djoed', text: 'djoed' },
  // Olifantje in het bos
  { name: 'o', text: 'oo' }, { name: 'li', text: 'li' }, { name: 'fant', text: 'fant' }, { name: 'je', text: 'je' }, { name: 'in', text: 'in' }, { name: 'het', text: 'het' }, { name: 'bos', text: 'bos' }, { name: 'laat', text: 'laat' }, { name: 'ma', text: 'ma' }, { name: 'toch', text: 'toch' }, { name: 'niet', text: 'niet' }, { name: 'los', text: 'los' }, { name: 'an', text: 'an' }, { name: 'ders', text: 'ders' }, { name: 'raak', text: 'raak' }, { name: 'weg', text: 'weg' }, { name: 'kwijt', text: 'kwijt' }, { name: 'en', text: 'en' }, { name: 'dan', text: 'dan' }, { name: 'heb', text: 'heb' }, { name: 'la', text: 'la' }, { name: 'ter', text: 'ter' }, { name: 'spijt', text: 'spijt' },
];

async function load() {
  const code = await WebAssembly.compile(readFileSync(resolve(root, 'editor/public/wasm/tp_mmb_fof.wasm')));
  const imports = {};
  for (const entry of WebAssembly.Module.imports(code)) (imports[entry.module] ??= {})[entry.name] = () => 0;
  const { exports: api } = await WebAssembly.instantiate(code, imports);
  api.mmb_init();
  const text = (pointer) => { const bytes = new Uint8Array(api.memory.buffer); return new TextDecoder().decode(bytes.subarray(pointer, bytes.indexOf(0, pointer))); };
  const inputs = Object.fromEntries(Array.from({ length: api.mmb_num_inputs() }, (_, i) => [text(api.mmb_input_id(i)), i]));
  const controls = Object.fromEntries(Array.from({ length: api.mmb_num_controls() }, (_, i) => [text(api.mmb_control_id(i)), i]));
  return {
    control(name, value) { api.mmb_set_control(controls[name], value); },
    input(name, value) { api.mmb_input_connected(inputs[name], 1); new Float32Array(api.memory.buffer, api.mmb_input_ptr(inputs[name]), 256).fill(value); },
    render(count) { api.mmb_render(count); return new Float32Array(api.memory.buffer, api.mmb_output_ptr(0), count); },
  };
}

function wav(samples, sampleRate, gain = 1) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) bytes.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * gain * 32767))), 44 + i * 2);
  return bytes;
}

async function renderFof(index) {
  const fof = await load();
  fof.control('breath', 0.08); fof.control('vibrato', 0); fof.control('syl', index);
  fof.input('voct', Math.log2(f0 / 261.6256));
  const on = Math.round(0.35 * rate / 32) * 32, off = Math.round(0.35 * rate / 32) * 32;
  const out = new Float32Array(on + off);
  fof.input('gate', 1);
  for (let o = 0; o < on; o += 32) out.set(fof.render(32), o);
  fof.input('gate', 0);
  for (let o = on; o < on + off; o += 32) out.set(fof.render(32), o);
  return { samples: out, gateOff: on / rate };
}

async function piper(text) {
  const r = await fetch(`${endpoint}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, lengthScale: 1.0 }) });
  if (!r.ok) throw new Error(`piper ${r.status}`);
  const j = await r.json();
  const bin = Buffer.from(j.pcm, 'base64');
  const pcm = new Int16Array(bin.buffer, bin.byteOffset, bin.length >> 1);
  const samples = Float32Array.from(pcm, (v) => v / 32768);
  return { rate: j.rate, samples, phonemes: j.phonemes, voice: j.voice };
}

mkdirSync(destination, { recursive: true });
const manifest = { rate, f0, voice: usePiper ? voice : null, syllables: [] };
for (let index = 0; index < SYLLABLES.length; index++) {
  const { name, text } = SYLLABLES[index];
  const entry = { index, name, text, fof: `fof-${String(index).padStart(2, '0')}-${name}.wav` };
  const render = await renderFof(index);
  writeFileSync(resolve(destination, entry.fof), wav(render.samples, rate));
  entry.fofGateOff = render.gateOff;
  if (usePiper) {
    try {
      const p = await piper(text);
      entry.piper = `piper-${String(index).padStart(2, '0')}-${name}.wav`;
      entry.piperRate = p.rate;
      entry.phonemes = p.phonemes.map((ph) => ({ p: ph.p, start: ph.start / p.rate, seconds: ph.samples / p.rate }));
      writeFileSync(resolve(destination, entry.piper), wav(p.samples, p.rate));
    } catch (error) {
      entry.piperError = String(error.message ?? error);
    }
  }
  manifest.syllables.push(entry);
  console.log(`${String(index).padStart(2)} ${name.padEnd(7)} fof ok${entry.piper ? `  piper ${entry.phonemes.map((ph) => ph.p).join('')}` : entry.piperError ? `  piper: ${entry.piperError}` : ''}`);
}
writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`→ ${destination}`);
