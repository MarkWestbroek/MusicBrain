// Gedeelde testgastheer voor wasm-modules in node: instantiëren, knoppen
// zetten, ingangen vullen, uitgangen op naam teruglezen. Dezelfde werkwijze
// als de loader in wasmPorts.test.ts, hier als module zodat nieuwe
// testbestanden hem kunnen delen (wasmModulators.test.ts, wasmClassics.test.ts).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';

const project = seedInternals(emptyModularProject());

export interface Mod {
  ex: any; rate: number; block: number;
  inputs: string[]; outputs: string[]; controls: string[];
  setCtl(id: string, v: number): void;
  /** Vaste waarde op een ingang (cv/gate), of los (`connected` false). */
  setIn(id: string, v: number, connected?: boolean): void;
  /** De blokbuffer van een ingang (markeert hem als verbonden). */
  inBuf(id: string): Float32Array;
  /** Rendert `seconds`; `feed(t, m)` vult per blok de ingangen. Geeft de
   *  uitgangen op naam terug. */
  render(seconds: number, feed?: (t: number, m: Mod) => void): Record<string, Float32Array>;
}

export async function load(typeId: string): Promise<Mod> {
  const bytes = readFileSync(fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url)));
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as any;
  // Het geheugen kan groeien; dus views elke keer opnieuw pakken.
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  ex.mmb_init();
  const inputs: string[] = [], outputs: string[] = [], controls: string[] = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++)  inputs.push(cstr(ex.mmb_input_id(i)));
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outputs.push(cstr(ex.mmb_output_id(i)));
  for (let i = 0; i < ex.mmb_num_controls(); i++) controls.push(cstr(ex.mmb_control_id(i)));
  const inView = (i: number): Float32Array => new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256);
  const m: Mod = {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(), inputs, outputs, controls,
    setCtl: (id, v) => { const i = controls.indexOf(id); if (i < 0) throw new Error(`geen control ${id}`); ex.mmb_set_control(i, v); },
    setIn: (id, v, connected = true) => {
      const i = inputs.indexOf(id);
      if (i < 0) throw new Error(`geen ingang ${id}`);
      inView(i).fill(v);
      ex.mmb_input_connected(i, connected ? 1 : 0);
    },
    inBuf: (id) => {
      const i = inputs.indexOf(id);
      if (i < 0) throw new Error(`geen ingang ${id}`);
      ex.mmb_input_connected(i, 1);
      return inView(i);
    },
    render(seconds, feed) {
      const n = Math.round(this.rate * seconds);
      const out = outputs.map(() => new Float32Array(n));
      for (let t = 0; t < n; t += this.block) {
        feed?.(t / this.rate, this);
        ex.mmb_render(this.block);
        for (let o = 0; o < outputs.length; o++) {
          const b = new Float32Array(ex.memory.buffer, ex.mmb_output_ptr(o), 256);
          for (let k = 0; k < this.block && t + k < n; k++) out[o]![t + k] = b[k]!;
        }
      }
      return Object.fromEntries(outputs.map((name, i) => [name, out[i]!]));
    },
  };
  return m;
}

export const peak = (a: Float32Array, from = 0, to = a.length): number => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(a[i]!));
  return p;
};
export const rms = (a: Float32Array, from = 0, to = a.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};
export const minOf = (a: Float32Array): number => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
export const maxOf = (a: Float32Array): number => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };

/** Indexen van de stijgende flanken in een gate-uitgang. */
export const risingEdges = (a: Float32Array): number[] => {
  const edges: number[] = [];
  if (a[0]! >= 0.5) edges.push(0);
  for (let i = 1; i < a.length; i++) if (a[i - 1]! < 0.5 && a[i]! >= 0.5) edges.push(i);
  return edges;
};

/** Sterkte van één frequentie in een signaal (Goertzel-achtig, amplitude). */
export const toneLevel = (a: Float32Array, hz: number, rate: number, from = 0, to = a.length): number => {
  let re = 0, im = 0;
  for (let i = from; i < to; i++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i - from) / (to - from));   // Hann
    re += a[i]! * w * Math.cos(2 * Math.PI * hz * i / rate);
    im += a[i]! * w * Math.sin(2 * Math.PI * hz * i / rate);
  }
  return 4 * Math.hypot(re, im) / (to - from);
};

/** Poort- en control-namen moeten exact die van de catalogus zijn. */
export async function expectMatchesCatalog(typeId: string): Promise<Mod> {
  const m = await load(typeId);
  const t = project.moduleTypes.find((x) => x.id === typeId);
  expect(t, `${typeId} staat niet in de catalogus`).toBeTruthy();
  expect([...m.inputs, ...m.outputs].sort()).toEqual(t!.ports.map((p) => p.id).sort());
  // LED's en displays zijn uitlezingen op het paneel, geen controls voor de firmware.
  const real = t!.controls.filter((c) => !['led', 'display'].includes(String((c as { kind?: string }).kind)));
  expect([...m.controls].sort()).toEqual(real.map((c) => c.id).sort());
  return m;
}
