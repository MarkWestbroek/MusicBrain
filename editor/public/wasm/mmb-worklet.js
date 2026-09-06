// MusicBrain — generieke AudioWorklet-host voor mmb-wasm modules
// (tools/mmb-wasm/mmb_abi.h). Eén processor-klasse voor elke Teensy-module
// die als .wasm gebouwd is: hij leest poorten en controls uit de wasm zelf.
//
// processorOptions: { wasm: Uint8Array, inputs: string[], outputs: string[] }
//   inputs/outputs = poort-ids in de volgorde van de worklet-kanalen (de
//   editor-moduledefinitie); ids die de wasm niet kent worden genegeerd.
// Berichten: {t:'ctl', id, v}  control op naam
//            {t:'in', id, v}   handmatige ingangswaarde (klavier: voct/gate),
//                              telt op bij het kabelsignaal, zet connected
//            {t:'cabled', id, on}  kabelstatus per ingang
//            {t:'dispose'}
// Resampling: ingangen contextrate → native (lineair), uitgangen native →
// context (audio lineair, cv/gate zero-order-hold zodat gates gates blijven).
/* global AudioWorkletProcessor, registerProcessor, sampleRate */

const RING = 16384, MASK = RING - 1;

class MmbProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { wasm, inputs, outputs } = options.processorOptions;
    const mod = new WebAssembly.Module(wasm);
    const imports = {};
    for (const imp of WebAssembly.Module.imports(mod)) {
      imports[imp.module] = imports[imp.module] || {};
      imports[imp.module][imp.name] = imp.name === 'proc_exit'
        ? (c) => { throw new Error('wasm proc_exit ' + c); }
        : () => 0;
    }
    const ex = this.ex = new WebAssembly.Instance(mod, imports).exports;
    ex.mmb_init();
    const cstr = (p) => { const m = new Uint8Array(ex.memory.buffer); let s = ''; for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]); return s; };

    this.typeId = cstr(ex.mmb_type_id());
    this.rate = ex.mmb_native_rate();
    this.block = ex.mmb_block();
    this.ratio = this.rate / sampleRate;          // native samples per context sample

    // Wasm-poorten op naam.
    const wIn = new Map(), wOut = new Map();
    for (let i = 0; i < ex.mmb_num_inputs(); i++) wIn.set(cstr(ex.mmb_input_id(i)), { idx: i, kind: ex.mmb_input_kind(i), ptr: ex.mmb_input_ptr(i) });
    for (let i = 0; i < ex.mmb_num_outputs(); i++) wOut.set(cstr(ex.mmb_output_id(i)), { idx: i, kind: ex.mmb_output_kind(i), ptr: ex.mmb_output_ptr(i) });
    this.ctlIdx = new Map();
    for (let i = 0; i < ex.mmb_num_controls(); i++) this.ctlIdx.set(cstr(ex.mmb_control_id(i)), i);

    // Editor-kanalen → wasm-poorten. Aliassen: 'in'/'in_l', 'out'/'out_l',
    // en parameter-CV's met of zonder '_cv'.
    const resolve = (map, id) => map.get(id) || map.get(id + '_cv') || map.get(id.replace(/_cv$/, ''))
      || (id === 'in_l' ? map.get('in') : id === 'in' ? map.get('in_l') : null)
      || (id === 'out_l' ? map.get('out') : id === 'out' ? map.get('out_l') : null)
      || (id === 'trig' ? map.get('gate') : id === 'gate' ? map.get('trig') : null) || null;

    this.ins = (inputs || []).map((id) => {
      const w = resolve(wIn, id);
      return { id, w, ring: new Float32Array(RING), written: 0, manual: 0, cabled: false, connected: false };
    });
    this.outs = (outputs || []).map((id) => {
      const w = resolve(wOut, id);
      return { id, w, ring: new Float32Array(RING), hold: !w || w.kind !== 0 };
    });
    this.byId = new Map(this.ins.map((p) => [p.id, p]));
    this.nativeWritten = 0;   // native uitgangssamples gerenderd
    this.outPos = 0;          // fractionele leespositie in native tijd
    this.alive = true;

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.t) {
        case 'ctl': { const i = this.ctlIdx.get(m.id); if (i !== undefined) ex.mmb_set_control(i, +m.v); break; }
        case 'in': { const p = this.byId.get(m.id); if (p) { p.manual = +m.v; p.connected = true; } break; }
        case 'cabled': { const p = this.byId.get(m.id); if (p) { p.cabled = !!m.on; p.connected = p.cabled || p.connected; } break; }
        case 'blob': {
          // Sample/blob naar een slot (sampler): {slot, rate, data: Int16Array}.
          if (!ex.mmb_blob_ptr || !m.data) break;
          const bytes = m.data.byteLength;
          const p = ex.mmb_blob_ptr(m.slot | 0, bytes);
          if (!p) break;
          // memory.buffer kan na groei een nieuw object zijn: altijd opnieuw pakken.
          new Uint8Array(ex.memory.buffer).set(new Uint8Array(m.data.buffer, m.data.byteOffset, bytes), p);
          ex.mmb_blob_commit(m.slot | 0, Math.floor(m.data.length / (m.channels || 1)), +m.rate || 44100, m.channels || 1);
          break;
        }
        case 'zones': {
          // Keymap: [{slot, lowKey, highKey, lowVel, highVel, root, tuneCents,
          //           gain, pan, loopMode, loopStart, loopEnd, decay, release,
          //           velTrack}]
          if (!ex.mmb_zone_set || !Array.isArray(m.zones)) break;
          m.zones.forEach((z, i) => ex.mmb_zone_set(
            i, z.slot | 0, z.lowKey | 0, z.highKey | 0, z.lowVel | 0, z.highVel | 0,
            +z.root, +z.tuneCents || 0, +z.gain, +z.pan || 0,
            z.loopMode | 0, z.loopStart | 0, z.loopEnd | 0, +z.decay || 0, +z.release || 0.08,
            z.velTrack | 0));
          ex.mmb_zone_count(m.zones.length);
          break;
        }
        case 'note': {
          // Polyfone modules (sampler) krijgen élke noot apart, zoals de DX7,
          // in plaats van één gate-flank met één V/Oct. Wie de exports niet
          // heeft negeert dit stilzwijgend.
          if (m.on) { if (ex.mmb_note_on) ex.mmb_note_on(m.n | 0, m.v | 0); }
          else if (m.n === null || m.n === undefined) { if (ex.mmb_all_notes_off) ex.mmb_all_notes_off(); }
          else if (ex.mmb_note_off) ex.mmb_note_off(m.n | 0);
          break;
        }
        case 'dispose': this.alive = false; break;
      }
    };
    this.port.postMessage({
      t: 'ready', typeId: this.typeId, rate: this.rate, block: this.block,
      unknownInputs: this.ins.filter((p) => !p.w).map((p) => p.id),
      unknownOutputs: this.outs.filter((p) => !p.w).map((p) => p.id),
    });
  }

  renderBlock() {
    const ex = this.ex, block = this.block, base = this.nativeWritten, inv = 1 / this.ratio;
    const mem = ex.memory.buffer;
    for (const p of this.ins) {
      if (!p.w) continue;
      const buf = new Float32Array(mem, p.w.ptr, block);
      const last = p.written - 1;
      for (let k = 0; k < block; k++) {
        // native sample (base+k) ↔ context tijd (base+k)/ratio
        let t = (base + k) * inv;
        if (t > last) t = last;
        let v = 0;
        if (last >= 0) {
          const i0 = Math.floor(t), f = t - i0;
          const a = p.ring[i0 & MASK], b = p.ring[(i0 + 1 <= last ? i0 + 1 : i0) & MASK];
          v = a + (b - a) * f;
        }
        buf[k] = v + p.manual;
      }
      ex.mmb_input_connected(p.w.idx, p.connected ? 1 : 0);
    }
    ex.mmb_render(block);
    for (const o of this.outs) {
      if (!o.w) continue;
      const buf = new Float32Array(mem, o.w.ptr, block);
      for (let k = 0; k < block; k++) o.ring[(base + k) & MASK] = buf[k];
    }
    this.nativeWritten += block;
  }

  process(inputs, outputs) {
    const n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;
    // 1. ingangen (contextrate) in de ringen.
    for (let i = 0; i < this.ins.length; i++) {
      const p = this.ins[i];
      const ch = inputs[i] && inputs[i][0];
      for (let k = 0; k < n; k++) p.ring[(p.written + k) & MASK] = ch ? ch[k] : 0;
      p.written += n;
    }
    // 2. genoeg native samples renderen voor dit blok.
    const need = Math.floor(this.outPos + n * this.ratio) + 2;
    while (this.nativeWritten < need) this.renderBlock();
    // 3. uitgangen terug naar contextrate.
    for (let o = 0; o < this.outs.length; o++) {
      const out = outputs[o];
      if (!out || !out[0]) continue;
      const ch = out[0], po = this.outs[o];
      let pos = this.outPos;
      if (po.hold) {
        for (let k = 0; k < n; k++) { ch[k] = po.ring[Math.floor(pos) & MASK]; pos += this.ratio; }
      } else {
        for (let k = 0; k < n; k++) {
          const i0 = Math.floor(pos), f = pos - i0;
          const a = po.ring[i0 & MASK], b = po.ring[(i0 + 1) & MASK];
          ch[k] = a + (b - a) * f;
          pos += this.ratio;
        }
      }
      for (let c = 1; c < out.length; c++) out[c].set(ch);
    }
    this.outPos += n * this.ratio;
    return this.alive;
  }
}

registerProcessor('mmb-wasm', MmbProcessor);
