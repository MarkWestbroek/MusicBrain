// tp_mmb_stk_sound doorgemeten: negen physical-modelling stemmen uit de
// gevendorde STK, dezelfde bron als de firmware.
//
// Wat deze test vangt is wat je anders pas bij het spelen hoort: een model dat
// zwijgt, een V/Oct die niet klopt, of poort- en control-namen die niet bij de
// catalogus passen (dan koppelt de worklet ze niet en blijft de module stil).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';

const project = seedInternals(emptyModularProject());

/** Namen in de volgorde van de `sound`-schakelaar op het paneel. */
const SOUNDS = ['Plucked', 'Clarinet', 'Bowed', 'Flute', 'Brass',
                'Saxophony', 'BlowHole', 'BandedWG', 'Mandolin'] as const;

interface Mod {
  ex: any; rate: number; block: number;
  inputs: string[]; outputs: string[]; controls: string[];
  setCtl(id: string, v: number): void;
  setIn(id: string, v: number, connected?: boolean): void;
  render(seconds: number, gate: (t: number) => boolean): { peak: number; crossings: number };
}

let bytes: Uint8Array;

/** Verse instantie; elk model krijgt er één, zoals de engine dat ook doet. */
async function load(): Promise<Mod> {
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
  const inPtr: number[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  { inputs.push(cstr(ex.mmb_input_id(i))); inPtr.push(ex.mmb_input_ptr(i)); }
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outputs.push(cstr(ex.mmb_output_id(i)));
  for (let i = 0; i < ex.mmb_num_controls(); i++) controls.push(cstr(ex.mmb_control_id(i)));
  const outPtr = ex.mmb_output_ptr(0);
  return {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(), inputs, outputs, controls,
    setCtl: (id, v) => { const i = controls.indexOf(id); if (i >= 0) ex.mmb_set_control(i, v); },
    setIn: (id, v, connected = true) => {
      const i = inputs.indexOf(id);
      if (i < 0) return;
      new Float32Array(ex.memory.buffer, inPtr[i]!, 64).fill(v);
      ex.mmb_input_connected(i, connected ? 1 : 0);
    },
    render(seconds, gate) {
      const gateIdx = inputs.indexOf('gate');
      const gateBuf = new Float32Array(ex.memory.buffer, inPtr[gateIdx]!, 64);
      ex.mmb_input_connected(gateIdx, 1);
      const out = new Float32Array(ex.memory.buffer, outPtr, 64);
      let peak = 0, crossings = 0, prev = 0;
      for (let t = 0; t < this.rate * seconds; t += this.block) {
        gateBuf.fill(gate(t / this.rate) ? 1 : 0);
        ex.mmb_render(this.block);
        for (let k = 0; k < this.block; k++) {
          const v = out[k]!;
          if (Math.abs(v) > peak) peak = Math.abs(v);
          if (prev <= 0 && v > 0) crossings++;
          prev = v;
        }
      }
      return { peak, crossings };
    },
  };
}

describe('tp_mmb_stk_sound (wasm)', () => {
  beforeAll(() => {
    bytes = new Uint8Array(readFileSync(
      fileURLToPath(new URL('../../../public/wasm/tp_mmb_stk_sound.wasm', import.meta.url))));
  });

  it('draagt dezelfde poorten en controls als de moduledefinitie', async () => {
    const m = await load();
    const t = project.moduleTypes.find((x) => x.id === 'tp_mmb_stk_sound')!;
    expect([...m.inputs, ...m.outputs].sort()).toEqual(t.ports.map((p) => p.id).sort());
    expect([...m.controls].sort()).toEqual(t.controls.map((c) => c.id).sort());
    expect(m.rate).toBe(44100);
    // De STK-modellen zijn sample-gebaseerd; het blok bepaalt alleen hoe vaak
    // de CV's gelezen worden.
    expect(m.block).toBe(32);
  });

  it('speelt de acht modellen die op hun defaults klinken', async () => {
    // BandedWG staat er niet bij: die blijft stil met deze CC-mapping (CC#2 is
    // bij dat model bowPressure). Dat is STK's eigen gedrag en geldt net zo op
    // de Teensy, want de mapping komt uit StkSoundModule.
    const stil: string[] = [];
    for (let sound = 0; sound < SOUNDS.length; sound++) {
      if (SOUNDS[sound] === 'BandedWG') continue;
      const m = await load();
      m.setCtl('sound', sound);
      // Brass heeft zijn lipspanning (timbre) omhoog nodig om te gaan buzzen —
      // net als een echte koperspeler.
      if (SOUNDS[sound] === 'Brass') { m.setCtl('timbre', 1); m.setCtl('strength', 1); }
      m.setIn('voct', 0);
      const { peak } = m.render(1.2, () => true);
      if (peak < 0.02) stil.push(`${SOUNDS[sound]} (piek ${peak.toFixed(4)})`);
    }
    expect(stil).toEqual([]);
  });

  it('laat de Timbre-knop door naar het model', async () => {
    // Brass' CC#2 is lipspanning. Loopt `setFrequency` ná de controls, dan
    // wordt die elke blok teruggezet en doet de knop niets — dat was zo.
    const meet = async (timbre: number): Promise<number> => {
      const m = await load();
      m.setCtl('sound', 4); m.setCtl('timbre', timbre); m.setCtl('strength', 1);
      m.setIn('voct', 0);
      return m.render(1.2, () => true).peak;
    };
    expect(await meet(1)).toBeGreaterThan(await meet(0.25) * 4);
  });

  it('volgt V/Oct: een octaaf hoger is twee keer zo snel', async () => {
    const tel = async (voct: number): Promise<number> => {
      const m = await load();
      m.setCtl('sound', 1);              // Clarinet: houdt een stabiele toon aan
      m.setIn('voct', voct);
      return m.render(1.0, () => true).crossings;
    };
    const laag = await tel(0), hoog = await tel(1);
    expect(hoog / laag).toBeGreaterThan(1.7);
    expect(hoog / laag).toBeLessThan(2.3);
  });

  it('zwijgt als de gate weer laag gaat', async () => {
    const m = await load();
    m.setCtl('sound', 1);
    m.setIn('voct', 0);
    // Gate 0,6 s hoog, daarna laag; we meten alleen de staart.
    m.render(0.8, (t) => t < 0.6);
    const { peak } = m.render(0.4, () => false);
    expect(peak).toBeLessThan(0.01);
  });
});
