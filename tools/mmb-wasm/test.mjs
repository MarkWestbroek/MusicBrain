// Rooktest voor de mmb-wasm modules onder node: laadt elke .wasm, leest de
// poorten/controls uit, stuurt een noot of klok en meet de uitgangen.
//   node tools/mmb-wasm/test.mjs [typeId]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
    m.ex.mmb_zone_set(0, 0, 0, 127, 1, 127, 60, 0, 1, 0, 2, 0, n - 1, 0, 0.1);
    m.ex.mmb_zone_count(1);
    m.setIn('voct', 1); m.setIn('vel', 0.9);
    script = (s) => m.setIn('gate', s < 1.5 ? 1 : 0);
  }
  else if (id === 'tp_mmb_peaks') { script = (s) => m.setIn('gate', (s % 0.5) < 0.01 ? 1 : 0); }
  else { m.setIn('voct', 0); script = (s) => m.setIn('gate', s < 0.6 ? 1 : 0); }
  const t0 = process.hrtime.bigint();
  const stats = run(m, 2.0, script);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 2;
  report(m, stats, ms);
}
