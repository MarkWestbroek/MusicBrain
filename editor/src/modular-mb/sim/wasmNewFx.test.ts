// De effectenbatch van 2026-09-25 rechtstreeks in de wasm: stereo bandecho
// met cross-feedback, vintage digitale echo, BBD-chorus, ringmodulator en
// octaver. Geen worklet-host: instantiëren, knoppen zetten, samples erin,
// samples eruit — en dan meten wat het effect hoort te doen.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface Mod {
  ex: any; rate: number; block: number;
  inputs: string[]; outputs: string[]; controls: string[];
  setCtl(id: string, v: number): void;
  connect(id: string, on: boolean): void;
  /** Rendert `seconds`; `feed(id, t)` levert per sample de ingangswaarde. */
  render(seconds: number, feed: (id: string, t: number) => number): Record<string, Float32Array>;
}

async function load(typeId: string): Promise<Mod> {
  const bytes = new Uint8Array(readFileSync(fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url))));
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as any;
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  ex.mmb_init();
  const inputs: string[] = [], outputs: string[] = [], controls: string[] = [];
  const inPtr: number[] = [], outPtr: number[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  { inputs.push(cstr(ex.mmb_input_id(i))); inPtr.push(ex.mmb_input_ptr(i)); }
  for (let i = 0; i < ex.mmb_num_outputs(); i++) { outputs.push(cstr(ex.mmb_output_id(i))); outPtr.push(ex.mmb_output_ptr(i)); }
  for (let i = 0; i < ex.mmb_num_controls(); i++) controls.push(cstr(ex.mmb_control_id(i)));
  const rate = ex.mmb_native_rate(), block = ex.mmb_block();
  return {
    ex, rate, block, inputs, outputs, controls,
    setCtl: (id, v) => { const i = controls.indexOf(id); if (i < 0) throw new Error(`geen control ${id}`); ex.mmb_set_control(i, v); },
    connect: (id, on) => { const i = inputs.indexOf(id); if (i < 0) throw new Error(`geen input ${id}`); ex.mmb_input_connected(i, on ? 1 : 0); },
    render(seconds, feed) {
      const n = Math.round(seconds * rate / block) * block;
      const out: Record<string, Float32Array> = {};
      for (const id of outputs) out[id] = new Float32Array(n);
      for (let t0 = 0; t0 < n; t0 += block) {
        // Views per blok: het geheugen kan groeien (detached ArrayBuffer).
        for (let i = 0; i < inputs.length; i++) {
          const buf = new Float32Array(ex.memory.buffer, inPtr[i]!, block);
          for (let k = 0; k < block; k++) buf[k] = feed(inputs[i]!, (t0 + k) / rate);
        }
        ex.mmb_render(block);
        for (let o = 0; o < outputs.length; o++)
          out[outputs[o]!]!.set(new Float32Array(ex.memory.buffer, outPtr[o]!, block), t0);
      }
      return out;
    },
  };
}

/** Amplitude van één frequentie (Goertzel-achtig, over het hele segment). */
function tone(x: Float32Array, hz: number, rate: number): number {
  let re = 0, im = 0;
  for (let i = 0; i < x.length; i++) { const w = 2 * Math.PI * hz * i / rate; re += x[i]! * Math.cos(w); im += x[i]! * Math.sin(w); }
  return 2 * Math.hypot(re, im) / x.length;
}
const rms = (x: Float32Array): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
const sine = (hz: number, t: number, a = 0.5): number => a * Math.sin(2 * Math.PI * hz * t);

describe('ringmod (wasm)', () => {
  it('clean: som- en verschiltoon, de grondtonen weg', async () => {
    const m = await load('tp_mmb_ringmod');
    m.setCtl('freq', 100); m.setCtl('mode', 0); m.setCtl('mix', 1);
    m.connect('in', true);
    const o = m.render(0.5, (id, t) => (id === 'in' ? sine(440, t) : 0));
    const y = o.out!.subarray(4410);
    const sum = tone(y, 540, m.rate), diff = tone(y, 340, m.rate), fund = tone(y, 440, m.rate), car = tone(y, 100, m.rate);
    expect(sum).toBeGreaterThan(0.15);
    expect(diff).toBeGreaterThan(0.15);
    expect(fund).toBeLessThan(sum * 0.05);
    expect(car).toBeLessThan(sum * 0.05);
  });

  it('diode: de draaggolf lekt door en er komen harmonischen bij', async () => {
    const m = await load('tp_mmb_ringmod');
    m.setCtl('freq', 100); m.setCtl('mode', 1); m.setCtl('bias', 0.6); m.setCtl('mix', 1);
    m.connect('in', true);
    const o = m.render(0.5, (id, t) => (id === 'in' ? sine(440, t) : 0));
    const y = o.out!.subarray(4410);
    expect(tone(y, 100, m.rate)).toBeGreaterThan(0.02);          // doorlek van de draaggolf
    expect(tone(y, 540, m.rate)).toBeGreaterThan(0.05);          // de somtoon is er nog
  });

  it('een externe draaggolf vervangt de oscillator', async () => {
    const m = await load('tp_mmb_ringmod');
    m.setCtl('freq', 100); m.setCtl('mode', 0); m.setCtl('mix', 1);
    m.connect('in', true); m.connect('carrier', true);
    const o = m.render(0.5, (id, t) => (id === 'in' ? sine(440, t) : id === 'carrier' ? sine(50, t, 1) : 0));
    const y = o.out!.subarray(4410);
    expect(tone(y, 490, m.rate)).toBeGreaterThan(0.15);
    expect(tone(y, 540, m.rate)).toBeLessThan(0.02);              // niet de interne 100 Hz
  });
});

describe('octaver (wasm)', () => {
  it('−1 oct geeft de halve frequentie, −2 oct een kwart', async () => {
    const m = await load('tp_mmb_octaver');
    m.setCtl('dry', 0); m.setCtl('oct1', 1); m.setCtl('oct2', 0); m.setCtl('up', 0); m.setCtl('tone', 0.3);
    m.connect('in', true);
    let o = m.render(1.0, (id, t) => (id === 'in' ? sine(220, t, 0.6) : 0));
    let y = o.out!.subarray(8820);
    expect(tone(y, 110, m.rate)).toBeGreaterThan(0.1);
    expect(tone(y, 110, m.rate)).toBeGreaterThan(3 * tone(y, 220, m.rate));
    m.setCtl('oct1', 0); m.setCtl('oct2', 1);
    o = m.render(1.0, (id, t) => (id === 'in' ? sine(220, t, 0.6) : 0));
    y = o.out!.subarray(8820);
    expect(tone(y, 55, m.rate)).toBeGreaterThan(3 * tone(y, 110, m.rate));
  });

  it('up geeft het dubbele, en de sub ademt mee met de ingang (stil = stil)', async () => {
    const m = await load('tp_mmb_octaver');
    m.setCtl('dry', 0); m.setCtl('oct1', 0); m.setCtl('up', 1);
    m.connect('in', true);
    const o = m.render(1.0, (id, t) => (id === 'in' && t < 0.5 ? sine(220, t, 0.6) : 0));
    const y = o.out!;
    expect(tone(y.subarray(4410, 22050), 440, m.rate)).toBeGreaterThan(0.05);
    expect(rms(y.subarray(30000))).toBeLessThan(0.005);
  });
});

describe('stereo tape echo (wasm)', () => {
  it('cross-feedback: een tik op L komt als echo op R terug', async () => {
    const m = await load('tp_mmb_stereo_tape_echo');
    for (const [id, v] of Object.entries({ time: 0.1, ratio: 1, feedback: 0, cross: 1, mix: 1, tone: 1, wow: 0, flutter: 0, drive: 0 }))
      m.setCtl(id, v);
    m.connect('in_l', true); m.connect('in_r', true);
    // Tijdconstante van de bandsnelheid is 120 ms: eerst laten settelen.
    m.render(1.0, () => 0);
    const o = m.render(0.6, (id, t) => (id === 'in_l' && t < 0.02 ? sine(1000, t, 0.5) : 0));
    const r = o.out_r!, l = o.out_l!;
    const seg = (x: Float32Array, a: number, b: number): Float32Array => x.subarray(Math.round(a * m.rate), Math.round(b * m.rate));
    expect(rms(seg(l, 0.1, 0.13))).toBeGreaterThan(0.05);       // eerste echo links op 0,1 s
    expect(rms(seg(r, 0.05, 0.09))).toBeLessThan(0.003);         // rechts nog niets
    expect(rms(seg(r, 0.2, 0.23))).toBeGreaterThan(0.03);        // via cross: rechts op 0,2 s
  });

  it('ratio 1,5 zet het rechterspoor op anderhalf keer de tijd', async () => {
    const m = await load('tp_mmb_stereo_tape_echo');
    for (const [id, v] of Object.entries({ time: 0.1, ratio: 1.5, feedback: 0, cross: 0, mix: 1, tone: 1, wow: 0, flutter: 0, drive: 0 }))
      m.setCtl(id, v);
    m.connect('in_l', true); m.connect('in_r', true);
    m.render(1.0, () => 0);
    const o = m.render(0.5, (id, t) => (t < 0.02 ? sine(1000, t, 0.5) : 0));
    const seg = (x: Float32Array, a: number, b: number): Float32Array => x.subarray(Math.round(a * m.rate), Math.round(b * m.rate));
    expect(rms(seg(o.out_r!, 0.15, 0.18))).toBeGreaterThan(0.05);
    expect(rms(seg(o.out_r!, 0.1, 0.13))).toBeLessThan(0.003);
  });
});

describe('digitale echo (wasm)', () => {
  it('echo op de ingestelde tijd; 8 bit is viezer dan 16', async () => {
    const run = async (bits: number): Promise<{ echo: number; snr: number; m: Mod }> => {
      const m = await load('tp_mmb_digital_echo');
      for (const [id, v] of Object.entries({ time: 0.1, ratio: 1, feedback: 0, cross: 0, mix: 1, mod_rate: 0.5, mod_depth: 0, bits, band: 16000 }))
        m.setCtl(id, v);
      m.connect('in_l', true);
      m.render(0.5, () => 0);
      const o = m.render(0.5, (id, t) => (id === 'in_l' && t < 0.05 ? sine(1000, t, 0.3) : 0));
      const y = o.out_l!.subarray(Math.round(0.11 * m.rate), Math.round(0.14 * m.rate));
      const t = tone(y, 1000, m.rate);
      const resid = Math.max(1e-9, rms(y) ** 2 - (t * t) / 2);
      return { echo: t, snr: 10 * Math.log10((t * t / 2) / resid), m };
    };
    const a = await run(16), b = await run(8);
    expect(a.echo).toBeGreaterThan(0.15);
    expect(b.echo).toBeGreaterThan(0.1);
    expect(a.snr).toBeGreaterThan(b.snr + 10);
    // Mono in: R is L.
    const m = a.m;
    const o = m.render(0.3, (id, t) => (id === 'in_l' && t < 0.05 ? sine(1000, t, 0.3) : 0));
    expect(rms(o.out_r!)).toBeCloseTo(rms(o.out_l!), 3);
  });
});

describe('BBD-chorus (wasm)', () => {
  it('mono in, stereo uit: L en R verschillen (spread) en beide klinken', async () => {
    const m = await load('tp_mmb_bbd_chorus');
    for (const [id, v] of Object.entries({ rate: 1, depth: 0.8, delay: 8, feedback: 0, mix: 1, spread: 1, age: 0, tone: 1 }))
      m.setCtl(id, v);
    m.connect('in_l', true);
    const o = m.render(1.0, (id, t) => (id === 'in_l' ? sine(440, t) : 0));
    const l = o.out_l!.subarray(8820), r = o.out_r!.subarray(8820);
    expect(rms(l)).toBeGreaterThan(0.2);
    expect(rms(r)).toBeGreaterThan(0.2);
    let d = 0; for (let i = 0; i < l.length; i++) d += (l[i]! - r[i]!) ** 2;
    expect(Math.sqrt(d / l.length)).toBeGreaterThan(0.05);      // niet hetzelfde spoor
  });

  it('spread 0 en depth 0: beide sporen gelijk, een zuivere vertraagde toon', async () => {
    const m = await load('tp_mmb_bbd_chorus');
    for (const [id, v] of Object.entries({ rate: 1, depth: 0, delay: 8, feedback: 0, mix: 1, spread: 0, age: 0, tone: 1 }))
      m.setCtl(id, v);
    m.connect('in_l', true);
    const o = m.render(0.5, (id, t) => (id === 'in_l' ? sine(440, t) : 0));
    const l = o.out_l!.subarray(4410), r = o.out_r!.subarray(4410);
    let d = 0; for (let i = 0; i < l.length; i++) d += (l[i]! - r[i]!) ** 2;
    expect(Math.sqrt(d / l.length)).toBeLessThan(1e-4);
    // 8 ms op 440 Hz = 3,5 periodes: de natte toon staat bijna in tegenfase
    // met het droge kwart, dus de som is kleiner dan de delen.
    expect(tone(l, 440, m.rate)).toBeGreaterThan(0.15);
  });
});
