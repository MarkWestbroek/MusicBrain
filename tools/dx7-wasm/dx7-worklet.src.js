// MusicBrain — DX7 AudioWorkletProcessor (msfa-kern).
//
// Twee backends met dezelfde API:
//   • dx7-core.js  — JS-port van msfa (default; getest sample-exact tegen
//                    de native kern, zie tools/dx7-wasm/test-core.mjs)
//   • dx7.wasm     — de C++-kern zelf via wasi-sdk (tools/dx7-wasm/build.sh),
//                    gebruikt als processorOptions.wasm meegegeven is.
// Krijgt de 8 factory-ROM-banken (roms.bin) mee, rendert op 44,1 kHz zoals
// de firmware en resamplet lineair naar de contextfrequentie.
/* global AudioWorkletProcessor, registerProcessor, sampleRate */
import { Dx7Core } from './dx7-core.js';

// Adapter rond de wasm-exports zodat process() één interface ziet.
class WasmBackend {
  constructor(wasmBytes) {
    const mod = new WebAssembly.Module(wasmBytes);
    const imports = {};
    for (const imp of WebAssembly.Module.imports(mod)) {
      imports[imp.module] = imports[imp.module] || {};
      imports[imp.module][imp.name] = imp.name === 'proc_exit'
        ? () => { throw new Error('dx7.wasm: proc_exit'); }
        : () => 0;
    }
    this.ex = new WebAssembly.Instance(mod, imports).exports;
    this.ex.dx7_init();
  }
  writeBank(b, bytes) {
    const p = this.ex.dx7_bank_ptr(b);
    new Uint8Array(this.ex.memory.buffer).set(bytes, p);
    this.ex.dx7_bank_loaded(b, 1);
  }
  setBank(v) { this.ex.dx7_set_bank(v | 0); }
  setProgram(v) { this.ex.dx7_set_program(v | 0); }
  setCoarse(v) { this.ex.dx7_set_coarse(Math.round(v)); }
  setFine(v) { this.ex.dx7_set_fine(+v); }
  setLevel(v) { this.ex.dx7_set_level(+v); }
  noteOn(n, v) { this.ex.dx7_note_on(n | 0, v | 0); }
  noteOff(n) { this.ex.dx7_note_off(n | 0); }
  allOff() { this.ex.dx7_all_off(); }
  activeVoices() { return this.ex.dx7_active_voices(); }
  voiceName() {
    const q = this.ex.dx7_out_ptr();          // scratch; render wist hem toch
    this.ex.dx7_voice_name(q);
    const b = new Uint8Array(this.ex.memory.buffer, q, 10);
    let s = ''; for (let i = 0; i < 10; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  render(frames) {
    const n = this.ex.dx7_render(frames);
    return new Float32Array(this.ex.memory.buffer, this.ex.dx7_out_ptr(), n);
  }
}

class JsBackend {
  constructor() { this.core = new Dx7Core(); }
  writeBank(b, bytes) { this.core.writeBank(b, bytes); }
  setBank(v) { this.core.setBank(v); }
  setProgram(v) { this.core.setProgram(v); }
  setCoarse(v) { this.core.setCoarse(v); }
  setFine(v) { this.core.setFine(v); }
  setLevel(v) { this.core.setLevel(v); }
  noteOn(n, v) { this.core.noteOn(n, v); }
  noteOff(n) { this.core.noteOff(n); }
  allOff() { this.core.allOff(); }
  activeVoices() { return this.core.activeVoices(); }
  voiceName() { return this.core.voiceName(); }
  render(frames) { const n = this.core.render(frames); return this.core.out.subarray(0, n); }
}

class Dx7Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { wasm, roms, userBank } = options.processorOptions || {};
    let backend = null;
    if (wasm) {
      try { backend = new WasmBackend(wasm); this.backendName = 'wasm'; } catch (e) { backend = null; }
    }
    if (!backend) { backend = new JsBackend(); this.backendName = 'js'; }
    this.be = backend;

    if (roms) for (let b = 0; b < 8; b++) this.be.writeBank(b, roms.subarray(b * 4096, (b + 1) * 4096));
    if (userBank && userBank.length === 4096) this.be.writeBank(8, userBank);

    // Resampler 44,1 kHz → sampleRate: ring van gerenderde bronsamples.
    this.ratio = 44100 / sampleRate;
    this.ring = new Float32Array(8192);
    this.MASK = 8191;
    this.written = 0;     // absoluut aantal bronsamples in de ring
    this.pos = 0;         // fractionele absolute leespositie
    this.alive = true;

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.t) {
        case 'on':       this.be.noteOn(m.n, m.v); break;
        case 'off':      this.be.noteOff(m.n); break;
        case 'all':      this.be.allOff(); break;
        case 'bank':     this.be.setBank(m.v); this.postName(); break;
        case 'prog':     this.be.setProgram(m.v); this.postName(); break;
        case 'coarse':   this.be.setCoarse(m.v); break;
        case 'fine':     this.be.setFine(m.v); break;
        case 'level':    this.be.setLevel(m.v); break;
        case 'userbank': if (m.data && m.data.length === 4096) { this.be.writeBank(8, m.data); this.postName(); } break;
        case 'dispose':  this.alive = false; break;
      }
    };
    this.postName();
  }

  postName() {
    this.port.postMessage({ t: 'name', name: this.be.voiceName(), voices: this.be.activeVoices(), backend: this.backendName });
  }

  renderMore(frames) {
    const src = this.be.render(frames);
    const n = src.length;
    for (let i = 0; i < n; i++) this.ring[(this.written + i) & this.MASK] = src[i];
    this.written += n;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return this.alive;
    const ch = out[0];
    const n = ch.length;
    const need = Math.floor(this.pos + n * this.ratio) + 2;
    while (this.written < need) this.renderMore(128);

    let pos = this.pos;
    const ring = this.ring, MASK = this.MASK;
    for (let i = 0; i < n; i++) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = ring[i0 & MASK];
      const b = ring[(i0 + 1) & MASK];
      ch[i] = a + (b - a) * f;
      pos += this.ratio;
    }
    this.pos = pos;
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return this.alive;
  }
}

registerProcessor('mmb-dx7', Dx7Processor);
