// MusicBrain — generieke AudioWorklet-host voor mmb-wasm modules
// (tools/mmb-wasm/mmb_abi.h). Eén processor-klasse voor elke Teensy-module
// die als .wasm gebouwd is: hij leest poorten en controls uit de wasm zelf.
//
// processorOptions: { wasm: Uint8Array, inputs: string[], outputs: string[] }
//   inputs/outputs = poort-ids in de volgorde van de worklet-kanalen (de
//   editor-moduledefinitie); ids die de wasm niet kent worden genegeerd.
// Berichten: {t:'ctl', id, v}  control op naam
//            {t:'in', id, v, slew?}  handmatige ingangswaarde (klavier:
//                              voct/gate), telt op bij het kabelsignaal, zet
//                              connected. `slew` (eenheden per seconde) laat
//                              de waarde er met vaste snelheid naartoe lopen
//                              in plaats van te springen: de glide van
//                              MIDI-In, zoals MidiInModule::tick() hem doet.
//            {t:'cabled', id, on}  kabelstatus per ingang
//            {t:'dispose'}
// Resampling: ingangen contextrate → native (lineair), uitgangen native →
// context (audio lineair, cv/gate zero-order-hold zodat gates gates blijven).
/* global AudioWorkletProcessor, registerProcessor, sampleRate */

const RING = 16384, MASK = RING - 1;

/**
 * Catmull-Rom tussen vier punten. Lineair interpoleren is goedkoop maar het is
 * ook een lowpass én een aliasbron: gemeten op 44,1 → 48 kHz kost het 1 dB op
 * 8 kHz en 3,4 dB op 15 kHz, en het vuil zit op ~−50 dB in de band waar het
 * oor het scherpst is. Vier taps halen daar 6 tot 11 dB af en maken de demping
 * bijna vlak, voor een handvol extra vermenigvuldigingen. Een echte polyfase
 * FIR wint nog eens 60 dB, maar dat zit grotendeels boven de gehoorgrens.
 * Alleen voor audio: cv en gate houden hun zero-order-hold, want een
 * geïnterpoleerde gateflank is geen gateflank meer.
 */
function cubic(ring, i0, f) {
  const a = ring[(i0 - 1) & MASK], b = ring[i0 & MASK];
  const c = ring[(i0 + 1) & MASK], d = ring[(i0 + 2) & MASK];
  return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
}

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
      return { id, w, ring: new Float32Array(RING), written: 0, manual: 0, target: 0, slew: 0, cabled: false, connected: false };
    });
    this.outs = (outputs || []).map((id) => {
      const w = resolve(wOut, id);
      return { id, w, ring: new Float32Array(RING), hold: !w || w.kind !== 0 };
    });
    this.byId = new Map(this.ins.map((p) => [p.id, p]));
    this.nativeWritten = 0;   // native uitgangssamples gerenderd
    this.outPos = 0;          // fractionele leespositie in native tijd
    // Eén (of twee) render-quanta voorsprong op de invoer. Zonder die buffer
    // rendert `renderBlock` native samples waarvan de contextrate-invoer nog
    // niet binnen is: `t > last` klemt dan op de laatste sample en de staart
    // van elk blok bevriest. Dat klinkt als korrel en overstuur — gemeten op
    // een 220 Hz-sinus tilde dit de SNR van 16 naar 84 dB. De prijs is een
    // paar ms latency.
    const slack = (this.block + 2) / this.ratio;   // benodigde invoer in contextsamples
    this.primeLeft = Math.max(1, Math.ceil(slack / 128));
    this.alive = true;

    this.port.onmessage = (e) => {
      const m = e.data;
      switch (m.t) {
        case 'ctl': { const i = this.ctlIdx.get(m.id); if (i !== undefined) ex.mmb_set_control(i, +m.v); break; }
        case 'in': {
          const p = this.byId.get(m.id);
          if (!p) break;
          p.target = +m.v;
          // Per native sample; zonder slew (of 0) springt de waarde meteen.
          p.slew = m.slew > 0 ? +m.slew / this.rate : 0;
          if (!(p.slew > 0)) p.manual = p.target;
          p.connected = true;
          break;
        }
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
          //           velTrack, attack}]
          if (!ex.mmb_zone_set || !Array.isArray(m.zones)) break;
          m.zones.forEach((z, i) => ex.mmb_zone_set(
            i, z.slot | 0, z.lowKey | 0, z.highKey | 0, z.lowVel | 0, z.highVel | 0,
            +z.root, +z.tuneCents || 0, +z.gain, +z.pan || 0,
            z.loopMode | 0, z.loopStart | 0, z.loopEnd | 0, +z.decay || 0, +z.release || 0.08,
            z.velTrack | 0, +z.attack || 0));
          ex.mmb_zone_count(m.zones.length);
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
          if (p.w.kind === 0 && i0 >= 1 && i0 + 2 <= last) {
            v = cubic(p.ring, i0, f);
          } else {
            const a = p.ring[i0 & MASK], b = p.ring[(i0 + 1 <= last ? i0 + 1 : i0) & MASK];
            v = a + (b - a) * f;
          }
        }
        if (p.manual !== p.target) {                 // glide: vaste snelheid
          const d = p.target - p.manual;
          p.manual = (d > p.slew || d < -p.slew) ? p.manual + (d > 0 ? p.slew : -p.slew) : p.target;
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
    // 2. eerst een voorsprong opbouwen; de uitgang blijft die quanta stil.
    if (this.primeLeft > 0) { this.primeLeft--; return this.alive; }
    // 3. genoeg native samples renderen voor dit blok.
    const need = Math.floor(this.outPos + n * this.ratio) + 2;
    while (this.nativeWritten < need) this.renderBlock();
    // 4. uitgangen terug naar contextrate.
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
          ch[k] = cubic(po.ring, i0, f);
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
