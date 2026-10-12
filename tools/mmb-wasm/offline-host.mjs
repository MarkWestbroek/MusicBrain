// Offline host voor MusicBrain-wasm-modules (Node): speelt modules op hun eigen
// rate, resamplet (cubic) naar de uitvoerrate en schrijft wav. Voor muziek en
// metingen buiten de browser; zelfde wasm als de editor (editor/public/wasm).
// Gebruikt door render-omnium-dienstverlening.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SR = 48000;
const wasmDir = join(ROOT, 'editor/public/wasm');
const compiled = new Map();

export async function load(typeId, controls = {}) {
  if (!compiled.has(typeId)) compiled.set(typeId, await WebAssembly.compile(readFileSync(join(wasmDir, typeId + '.wasm'))));
  const mod = compiled.get(typeId);
  const imports = {};
  for (const imp of WebAssembly.Module.imports(mod)) { imports[imp.module] ??= {}; imports[imp.module][imp.name] = () => 0; }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports;
  const cstr = (p) => { const m = new Uint8Array(ex.memory.buffer); let s = ''; for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]); return s; };
  ex.mmb_init();
  const ins = new Map(), outs = new Map(), ctls = new Map();
  for (let i = 0; i < ex.mmb_num_inputs(); i++) ins.set(cstr(ex.mmb_input_id(i)), i);
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outs.set(cstr(ex.mmb_output_id(i)), i);
  for (let i = 0; i < ex.mmb_num_controls(); i++) ctls.set(cstr(ex.mmb_control_id(i)), i);
  const m = {
    typeId, ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(),
    ctl(id, v) { const i = ctls.get(id); if (i === undefined) throw new Error(`${typeId}: control ${id}`); ex.mmb_set_control(i, v); },
    set(id, v) { const i = ins.get(id); if (i === undefined) throw new Error(`${typeId}: input ${id}`); new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256).fill(v); ex.mmb_input_connected(i, 1); },
    buf(id) { const i = ins.get(id); ex.mmb_input_connected(i, 1); return new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256); },
    out(id) { return new Float32Array(ex.memory.buffer, ex.mmb_output_ptr(outs.get(id)), 256); },
  };
  for (const [k, v] of Object.entries(controls)) m.ctl(k, v);
  return m;
}

/** Rendert `seconds` op de native rate; `script(t)` per blok; `feed` = [L,R] invoer op native rate. */
export function run(m, seconds, script, feed) {
  const n = Math.round(m.rate * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  const hasR = m.out('out_r') && true;
  for (let t = 0; t < n; t += m.block) {
    const k = Math.min(m.block, n - t);
    if (script) script(t / m.rate);
    if (feed) {
      const bl = m.buf('in_l'), br = m.buf('in_r');
      for (let i = 0; i < k; i++) { bl[i] = feed[0][t + i] ?? 0; br[i] = feed[1][t + i] ?? 0; }
    }
    m.ex.mmb_render(m.block);
    const ol = m.out('out_l'), or = m.out('out_r');
    for (let i = 0; i < k; i++) { L[t + i] = ol[i]; R[t + i] = or[i]; }
  }
  return [L, R];
}

/** Cubic (Catmull-Rom) resampling. */
export function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to;
  const at = (i) => x[Math.min(x.length - 1, Math.max(0, i))];
  for (let j = 0; j < n; j++) {
    const p = j * r, i = Math.floor(p), f = p - i;
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    y[j] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  return y;
}

export const toSR = (m, st) => st.map((ch) => resample(ch, m.rate, SR));
export const fromSR = (m, st) => st.map((ch) => resample(ch, SR, m.rate));

/** Stuksgewijs-lineaire envelope uit [[t, v], ...]. */
export function env(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) { const [t0, v0] = points[i - 1]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0 || 1); }
    }
    return points[points.length - 1][1];
  };
}

export function wav16(path, ch, rate = SR) {
  const n = ch[0].length, c = ch.length, pcm = new Int16Array(n * c);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) pcm[i * c + k] = Math.max(-32768, Math.min(32767, Math.round(ch[k][i] * 32767)));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.byteLength, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(c, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2 * c, 28); h.writeUInt16LE(2 * c, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(path, Buffer.concat([h, Buffer.from(pcm.buffer)]));
}

/** Harmonische inhoud van een stationair stuk: energie in h1..h8 relatief (dB). */
export function harmonics(x, rate, f0, from = 0.3, len = 0.5) {
  const s = Math.round(from * rate), n = Math.round(len * rate), out = [];
  for (let h = 1; h <= 8; h++) {
    let re = 0, im = 0; const w = 2 * Math.PI * f0 * h / rate;
    for (let i = 0; i < n; i++) { const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); re += x[s + i] * win * Math.cos(w * i); im += x[s + i] * win * Math.sin(w * i); }
    out.push(Math.hypot(re, im));
  }
  const ref = out[0] || 1e-9;
  return out.map((v) => (20 * Math.log10(v / ref + 1e-9)).toFixed(0));
}
