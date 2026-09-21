// DX7 met glide: de klinkende noot moet de V/Oct volgen.
//
// msfa kent de toonhoogte alleen bij de aanslag. De wrapper zette daarom de
// hele noot vast en droeg alleen de fractie (0…1 halve toon) via de
// pitch-bend. Met glide staat V/Oct bij de aanslag nog op de vórige noot:
// in de sim bleef de noot daar gewoon hangen, op de Teensy zaagde hij er
// bovendien een halve toon omheen. Nu draagt de bend het hele verschil.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface Dx7 {
  rate: number;
  /** Speel `secs` seconden; `voct(t)` met t in seconden vanaf nu. */
  play(secs: number, voct: (t: number) => number, gate: boolean): void;
  rec: number[];
}

async function dx7(): Promise<Dx7> {
  const bytes = new Uint8Array(readFileSync(
    fileURLToPath(new URL('../../../public/wasm/tp_mmb_dx7.wasm', import.meta.url))));
  const mod = await WebAssembly.compile(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) {
    imports[imp.module] ??= {};
    imports[imp.module]![imp.name] = () => 0;
  }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports as unknown as
    Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory };
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  ex.mmb_init!();
  const rate = ex.mmb_native_rate!(), block = ex.mmb_block!();
  const ins = new Map<string, { i: number; ptr: number }>();
  for (let i = 0; i < ex.mmb_num_inputs!(); i++) ins.set(cstr(ex.mmb_input_id!(i)), { i, ptr: ex.mmb_input_ptr!(i) });
  const outPtr = ex.mmb_output_ptr!(0);
  const set = (id: string, v: number): void => {
    const p = ins.get(id)!;
    new Float32Array(ex.memory.buffer, p.ptr, block).fill(v);
    ex.mmb_input_connected!(p.i, 1);
  };
  const rec: number[] = [];
  return {
    rate, rec,
    play(secs, voct, gate) {
      for (let b = 0; b < Math.round(secs * rate / block); b++) {
        set('voct', voct(b * block / rate)); set('gate', gate ? 1 : 0); set('vel', 0.8);
        ex.mmb_render!(block);
        rec.push(...new Float32Array(ex.memory.buffer, outPtr, block));
      }
    },
  };
}

/**
 * Toonhoogte via autocorrelatie. Grof: bij (bijna) gelijkspel wint de kortste
 * periode, anders pakt hij bij een bel-achtige E.PIANO soms drie perioden
 * tegelijk. Fijn: naar de top klimmen en parabolisch interpoleren, want op
 * hele samples is C5 (84,3 samples) alleen 525 of 531 Hz — ±20 cent.
 */
function pitchAt(x: number[], start: number, rate: number): number {
  const W = Math.round(0.045 * rate);
  const corr = (lag: number): number => {
    let c = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < W; i++) {
      const a = x[start + i]!, b = x[start + i + lag]!;
      c += a * b; e1 += a * a; e2 += b * b;
    }
    return c / Math.sqrt(e1 * e2 + 1e-12);
  };
  let best = 0, lag = 0;
  for (let l = Math.round(rate / 1200); l < Math.round(rate / 150); l++) {
    const r = corr(l);
    if (r > best + 0.02) { best = r; lag = l; }
  }
  while (corr(lag + 1) > corr(lag)) lag++;
  while (corr(lag - 1) > corr(lag)) lag--;
  const a = corr(lag - 1), b = corr(lag), c = corr(lag + 1);
  const off = (a - c) / (2 * (a - 2 * b + c));
  return rate / (lag + (Number.isFinite(off) ? off : 0));
}

const halveTonen = (f: number, ref: number): number => 12 * Math.log2(f / ref);
const C4 = 261.63, C5 = 523.25;

describe('DX7 volgt een glijdende V/Oct', () => {
  it('glijdt van de vorige noot naar de nieuwe, en komt daar aan', async () => {
    const d = await dx7();
    d.play(0.3, () => 0, true);                          // noot 1 op C4
    d.play(0.05, () => 0, false);
    const start = d.rec.length;
    // Noot 2 zoals MIDI-In hem met glide aanlevert: gate hoog terwijl V/Oct
    // nog op C4 staat, dan in 400 ms naar C5.
    d.play(0.8, (t) => Math.min(1, t / 0.4), true);
    const at = (ms: number): number => pitchAt(d.rec, start + Math.round(ms / 1000 * d.rate), d.rate);

    // Halverwege de glide halverwege in toonhoogte (±1 halve toon) —
    // vroeger stond hij hier nog gewoon op C4.
    expect(Math.abs(halveTonen(at(200), C4) - 6)).toBeLessThan(1);
    // En daarna op C5, niet een halve toon ernaast of een octaaf lager.
    expect(Math.abs(halveTonen(at(600), C5))).toBeLessThan(0.2);
  });

  it('stijgt tijdens de glide overal, zonder terug te zagen', async () => {
    const d = await dx7();
    d.play(0.3, () => 0, true);
    d.play(0.05, () => 0, false);
    const start = d.rec.length;
    d.play(0.5, (t) => Math.min(1, t / 0.4), true);
    const f = [50, 100, 150, 200, 250, 300, 350].map(
      (ms) => pitchAt(d.rec, start + Math.round(ms / 1000 * d.rate), d.rate));
    // Met alleen de fractie viel hij elke halve toon terug naar de beginnoot.
    for (let i = 1; i < f.length; i++) expect(f[i]!).toBeGreaterThan(f[i - 1]!);
  });

  it('speelt zonder glide precies waar hij aangeslagen wordt', async () => {
    const d = await dx7();
    const start = d.rec.length;
    d.play(0.3, () => 7 / 12, true);                     // G4, meteen goed
    expect(Math.abs(halveTonen(pitchAt(d.rec, start + Math.round(0.1 * d.rate), d.rate), C4) - 7))
      .toBeLessThan(0.2);
  });
});
