// Tests voor de lyric-keten: analyse (toonhoogte, pitch marks, lettergrepen),
// het .mmbl-formaat, en de wasm-module ZANG die het resultaat zingt.
//
// De "stem" is synthetisch: een pulstrein door twee formantresonatoren, met
// ruis als medeklinker. Zo draaien de tests zonder opnames en weten we
// precies wat erin zit.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  LYRIC_RATE, analyzeRecording, findSustain, placeMarks, resample, splitSyllables, trackPitch,
} from './analyze';
import { buildLyricBank, fromAnalysis, parseLyricBank } from './lyricBank';

// ── synthetische stem ─────────────────────────────────────────────────────

/** Tweepolige resonator (formant) op `hz` met bandbreedte `bw`. */
function resonator(x: Float32Array, rate: number, hz: number, bw: number): Float32Array {
  const r = Math.exp((-Math.PI * bw) / rate);
  const a1 = 2 * r * Math.cos((2 * Math.PI * hz) / rate), a2 = -r * r;
  const y = new Float32Array(x.length);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]! + a1 * y1 + a2 * y2;
    y[i] = v; y2 = y1; y1 = v;
  }
  return y;
}

function normalize(x: Float32Array, peak = 0.8): Float32Array {
  let m = 0;
  for (const v of x) if (Math.abs(v) > m) m = Math.abs(v);
  return m > 0 ? x.map((v) => (v / m) * peak) : x;
}

/** Klinker: pulstrein van `f0a` naar `f0b` Hz door formanten `f1`/`f2`, met in- en uitzwellen. */
function vowel(rate: number, secs: number, f0a: number, f0b: number, f1: number, f2: number): Float32Array {
  const n = Math.round(secs * rate);
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f0 = f0a + ((f0b - f0a) * i) / n;
    phase += f0 / rate;
    if (phase >= 1) { phase -= 1; src[i] = 1; }
  }
  const y = normalize(resonator(resonator(src, rate, f1, 90), rate, f2, 120));
  const edge = Math.round(0.03 * rate);
  for (let i = 0; i < edge; i++) {
    const g = i / edge;
    y[i] = y[i]! * g; y[n - 1 - i] = y[n - 1 - i]! * g;
  }
  return y;
}

/** Medeklinker: ruis (deterministisch) met een hoog accent. */
function consonant(rate: number, secs: number, seed = 1): Float32Array {
  const n = Math.round(secs * rate);
  const y = new Float32Array(n);
  let s = seed * 2654435761 >>> 0, prev = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = (s / 0xFFFFFFFF) * 2 - 1;
    y[i] = (v - prev) * 0.25 * Math.sin((Math.PI * i) / n);
    prev = v;
  }
  return y;
}

function silence(rate: number, secs: number): Float32Array { return new Float32Array(Math.round(secs * rate)); }

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** "sa-ti": twee lettergrepen (s+a, t+i) in één woord, dan stilte. */
function twoSyllables(rate: number): Float32Array {
  return concat(
    silence(rate, 0.1),
    consonant(rate, 0.08, 1), vowel(rate, 0.3, 130, 120, 750, 1200),
    consonant(rate, 0.06, 2), vowel(rate, 0.3, 125, 105, 300, 2200),
    silence(rate, 0.2),
  );
}

// ── analyse ───────────────────────────────────────────────────────────────

describe('lyric/analyze', () => {
  it('resample houdt de toonhoogte en de duur', () => {
    const rate = 44100;
    const x = new Float32Array(rate / 2);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 200 * i) / rate);
    const y = resample(x, rate, LYRIC_RATE);
    expect(y.length).toBe(Math.floor(x.length / 2));
    // nuldoorgangen tellen: 200 Hz over een halve seconde = 100 perioden
    let up = 0;
    for (let i = 1; i < y.length; i++) if (y[i - 1]! < 0 && y[i]! >= 0) up++;
    expect(up).toBeGreaterThanOrEqual(99);
    expect(up).toBeLessThanOrEqual(101);
  });

  it('volgt een dalende toonhoogte en noemt ruis stemloos', () => {
    const x = concat(consonant(LYRIC_RATE, 0.15), vowel(LYRIC_RATE, 0.5, 180, 90, 700, 1100), silence(LYRIC_RATE, 0.1));
    const t = trackPitch(x, LYRIC_RATE);
    const at = (ms: number): number => t.f0[Math.round(ms / 10)]!;
    expect(at(50)).toBe(0);                                 // in de ruis
    // De klinker begint op 150 ms; het venster kijkt 40 ms vooruit.
    expect(at(250)).toBeGreaterThan(145);
    expect(at(250)).toBeLessThan(175);
    expect(at(500)).toBeGreaterThan(100);
    expect(at(500)).toBeLessThan(125);
    // geen octaafsprongen: elk stemhebbend frame ligt tussen de uitersten
    for (const v of t.f0) if (v > 0) { expect(v).toBeGreaterThan(80); expect(v).toBeLessThan(200); }
  });

  it('zet één mark per stemperiode, op de puls', () => {
    const x = vowel(LYRIC_RATE, 0.4, 110, 110, 700, 1100);
    const marks = placeMarks(x, LYRIC_RATE, trackPitch(x, LYRIC_RATE)).filter((m) => !m.unvoiced);
    expect(marks.length).toBeGreaterThan(30);               // 0,4 s op 110 Hz = 44 perioden
    const period = LYRIC_RATE / 110;
    const gaps = marks.slice(1).map((m, i) => m.frame - marks[i]!.frame);
    const off = gaps.filter((g) => Math.abs(g - period) > 0.06 * period).length;
    expect(off / gaps.length).toBeLessThan(0.05);
  });

  it('vindt twee lettergrepen in één woord, elk met een klinkerkern', () => {
    const x = twoSyllables(LYRIC_RATE);
    const spans = splitSyllables(x, LYRIC_RATE, trackPitch(x, LYRIC_RATE), { count: 2 });
    expect(spans.length).toBe(2);
    expect(spans[0]!.wordEnd).toBe(false);
    expect(spans[1]!.wordEnd).toBe(true);
    // de grens ligt tussen de twee klinkers (0,48 s en 0,54 s), ruim genomen
    expect(spans[0]!.end / LYRIC_RATE).toBeGreaterThan(0.40);
    expect(spans[0]!.end / LYRIC_RATE).toBeLessThan(0.62);

    const syl = analyzeRecording(twoSyllables(44100), 44100, { syllables: ['sa', 'ti'] });
    expect(syl.map((s) => s.text)).toEqual(['sa', 'ti']);
    for (const s of syl) {
      expect(s.rate).toBe(LYRIC_RATE);
      expect(s.sustainEnd).toBeGreaterThan(s.sustainStart);
      expect(s.marks[s.sustainStart]!.unvoiced).toBe(false);
      expect(s.marks[s.sustainEnd]!.unvoiced).toBe(false);
      for (let i = 1; i < s.marks.length; i++) expect(s.marks[i]!.frame).toBeGreaterThan(s.marks[i - 1]!.frame);
      expect(s.marks[s.marks.length - 1]!.frame).toBeLessThan(s.data.length);
    }
    expect(syl[0]!.pitchHz).toBeGreaterThan(115);
    expect(syl[0]!.pitchHz).toBeLessThan(135);
    expect(syl[1]!.pitchHz).toBeGreaterThan(100);
    expect(syl[1]!.pitchHz).toBeLessThan(130);
  });

  it('zonder tekst telt de analyse zelf, en stilte scheidt woorden', () => {
    const one = concat(consonant(LYRIC_RATE, 0.06), vowel(LYRIC_RATE, 0.3, 140, 120, 700, 1100));
    const x = concat(silence(LYRIC_RATE, 0.1), one, silence(LYRIC_RATE, 0.4), one, silence(LYRIC_RATE, 0.2));
    const syl = analyzeRecording(x, LYRIC_RATE);
    expect(syl.length).toBe(2);
    expect(syl.every((s) => s.wordEnd)).toBe(true);
  });

  it('een ruisje alleen heeft geen klinkerkern', () => {
    const x = consonant(LYRIC_RATE, 0.2);
    const marks = placeMarks(x, LYRIC_RATE, trackPitch(x, LYRIC_RATE));
    expect(marks.every((m) => m.unvoiced)).toBe(true);
    expect(findSustain(x, LYRIC_RATE, marks)).toEqual({ start: 0, end: 0 });
  });
});

// ── formaat ───────────────────────────────────────────────────────────────

describe('lyric/lyricBank', () => {
  it('schrijft en leest dezelfde bank, met een even lengte', () => {
    const syl = analyzeRecording(twoSyllables(LYRIC_RATE), LYRIC_RATE, { syllables: ['sa', 'ti'] });
    const bank = fromAnalysis('Test ✓ bank met een veel te lange naam', syl);
    const buf = buildLyricBank(bank);
    expect(buf.byteLength % 2).toBe(0);
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('MMBL');
    const back = parseLyricBank(buf);
    expect(back.rate).toBe(LYRIC_RATE);
    expect(new TextEncoder().encode(back.name).length).toBeLessThanOrEqual(27);
    expect(back.syllables.length).toBe(2);
    back.syllables.forEach((s, i) => {
      const o = bank.syllables[i]!;
      expect(s.text).toBe(o.text);
      expect(s.marks).toEqual(o.marks);
      expect(s.sustainStart).toBe(o.sustainStart);
      expect(s.sustainEnd).toBe(o.sustainEnd);
      expect(s.wordEnd).toBe(o.wordEnd);
      expect(Array.from(s.data)).toEqual(Array.from(o.data));
      expect(s.pitchHz).toBeCloseTo(o.pitchHz, 3);
    });
  });

  it('weigert rommel en een afgekapte bank', () => {
    expect(() => parseLyricBank(new ArrayBuffer(100))).toThrow();
    const syl = analyzeRecording(twoSyllables(LYRIC_RATE), LYRIC_RATE, { syllables: ['sa', 'ti'] });
    const buf = buildLyricBank(fromAnalysis('x', syl));
    expect(() => parseLyricBank(buf.slice(0, 200))).toThrow();
  });
});

// ── de wasm-module zingt ──────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.resolve(here, '../../../public/wasm/tp_mmb_zang.wasm');

interface Zang {
  rate: number;
  block: number;
  set(id: string, v: number): void;
  input(id: string, v: number): void;
  loadBank(buf: ArrayBuffer): number;
  render(secs: number): Float32Array;
  current(): number;
  voices(): number;
}

async function loadZang(): Promise<Zang> {
  const mod = await WebAssembly.compile(readFileSync(wasmPath));
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) (imports[imp.module] ??= {})[imp.name] = () => 0;
  const inst = await WebAssembly.instantiate(mod, imports);
  const ex = inst.exports as unknown as Record<string, (...a: number[]) => number> & { memory: WebAssembly.Memory };
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer);
    let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  ex.mmb_init!();
  const ins: string[] = [], ctl: string[] = [];
  for (let i = 0; i < ex.mmb_num_inputs!(); i++) ins.push(cstr(ex.mmb_input_id!(i)));
  for (let i = 0; i < ex.mmb_num_controls!(); i++) ctl.push(cstr(ex.mmb_control_id!(i)));
  const rate = ex.mmb_native_rate!(), block = ex.mmb_block!();
  return {
    rate, block,
    set: (id, v) => { const i = ctl.indexOf(id); if (i < 0) throw new Error(`control ${id}`); ex.mmb_set_control!(i, v); },
    input: (id, v) => {
      const i = ins.indexOf(id);
      if (i < 0) throw new Error(`poort ${id}`);
      ex.mmb_input_connected!(i, 1);
      new Float32Array(ex.memory.buffer, ex.mmb_input_ptr!(i), 256).fill(v);
    },
    loadBank: (buf) => {
      const bytes = new Uint8Array(buf);
      const p = ex.mmb_blob_ptr!(0, bytes.length);          // kan het geheugen laten groeien: eerst dit
      new Uint8Array(ex.memory.buffer, p, bytes.length).set(bytes);
      ex.mmb_blob_commit!(0, bytes.length / 2, LYRIC_RATE, 1);
      return ex.mmb_zang_syllables!();
    },
    render: (secs) => {
      const n = Math.ceil((secs * rate) / block) * block;
      const out = new Float32Array(n);
      for (let t = 0; t < n; t += block) {
        ex.mmb_render!(block);
        out.set(new Float32Array(ex.memory.buffer, ex.mmb_output_ptr!(0), block), t);
      }
      return out;
    },
    current: () => ex.mmb_zang_current!(),
    voices: () => ex.mmb_active_voices!(),
  };
}

/** Periode uit de autocorrelatie rond de verwachte toonhoogte, in Hz. */
function measureHz(x: Float32Array, rate: number, want: number): number {
  let best = -1, lag = 0;
  const n = x.length;
  for (let l = Math.floor(rate / (want * 1.4)); l <= Math.ceil(rate / (want / 1.4)); l++) {
    let num = 0, e0 = 0, e1 = 0;
    for (let i = 0; i + l < n; i++) { num += x[i]! * x[i + l]!; e0 += x[i]! * x[i]!; e1 += x[i + l]! * x[i + l]!; }
    const r = num / (Math.sqrt(e0 * e1) + 1e-12);
    if (r > best) { best = r; lag = l; }
  }
  return rate / lag;
}

function rms(x: Float32Array): number {
  let e = 0;
  for (const v of x) e += v * v;
  return Math.sqrt(e / Math.max(1, x.length));
}

/** Zwaartepunt van het spectrum tussen 300 en 4000 Hz: een maat voor de klinkerkleur. */
function centroid(x: Float32Array, rate: number): number {
  let num = 0, den = 0;
  for (let hz = 300; hz <= 4000; hz += 50) {
    let re = 0, im = 0;
    const w = (2 * Math.PI * hz) / rate;
    for (let i = 0; i < x.length; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1));
      re += x[i]! * win * Math.cos(w * i); im += x[i]! * win * Math.sin(w * i);
    }
    const p = re * re + im * im;
    num += hz * p; den += p;
  }
  return num / den;
}

describe.skipIf(!existsSync(wasmPath))('ZANG (wasm) zingt een lyricbank', () => {
  const bank = (): ArrayBuffer => buildLyricBank(fromAnalysis('test',
    analyzeRecording(twoSyllables(LYRIC_RATE), LYRIC_RATE, { syllables: ['sa', 'ti'] })));

  it('laadt de bank en weigert rommel', async () => {
    const z = await loadZang();
    expect(z.loadBank(new ArrayBuffer(64))).toBe(0);
    expect(z.loadBank(bank())).toBe(2);
  });

  it('zingt op de gevraagde toonhoogte, ook ver van de gesproken', async () => {
    const z = await loadZang();
    z.loadBank(bank());
    z.set('mode', 0); z.set('syl', 0);
    for (const midi of [48, 55, 60, 67, 72]) {               // gesproken: ~125 Hz ≈ B2
      const want = 440 * 2 ** ((midi - 69) / 12);
      z.input('voct_1', (midi - 60) / 12);
      z.input('gate_1', 1);
      const out = z.render(1.0);
      z.input('gate_1', 0);
      z.render(0.6);
      const seg = out.subarray(Math.round(0.6 * z.rate), Math.round(0.8 * z.rate));
      expect(rms(seg)).toBeGreaterThan(0.02);
      const cents = 1200 * Math.log2(measureHz(seg, z.rate, want) / want);
      expect(Math.abs(cents)).toBeLessThan(20);
    }
  });

  it('houdt de klinker aan zolang de gate open is, en zwijgt daarna', async () => {
    const z = await loadZang();
    z.loadBank(bank());
    z.set('mode', 0); z.set('syl', 0); z.set('release', 100);
    z.input('voct_1', 0); z.input('gate_1', 1);
    const held = z.render(3.0);                              // de lettergreep zelf duurt 0,4 s
    expect(rms(held.subarray(Math.round(2.5 * z.rate)))).toBeGreaterThan(0.03);
    expect(z.voices()).toBe(1);
    z.input('gate_1', 0);
    const tail = z.render(1.5);
    expect(rms(tail.subarray(Math.round(1.0 * z.rate)))).toBeLessThan(1e-4);
    expect(z.voices()).toBe(0);
  });

  it('formant schuift de klinkerkleur, niet de toonhoogte', async () => {
    const z = await loadZang();
    z.loadBank(bank());
    z.set('mode', 0); z.set('syl', 0);
    // Laag zingen (E2, 82 Hz): de harmonischen liggen dan dicht genoeg op
    // elkaar om de klinkerkleur af te tasten. Op C4 staan ze 262 Hz uit
    // elkaar en blijft het zwaartepunt aan één harmonische hangen.
    const midi = 40, want = 440 * 2 ** ((midi - 69) / 12);
    const sing = (formant: number): Float32Array => {
      z.set('formant', formant);
      z.input('voct_1', (midi - 60) / 12); z.input('gate_1', 1);
      const out = z.render(1.0);
      z.input('gate_1', 0);
      z.render(0.6);
      return out.slice(Math.round(0.6 * z.rate), Math.round(0.8 * z.rate));
    };
    const low = sing(-7), mid = sing(0), high = sing(7);
    for (const seg of [low, mid, high]) {
      expect(Math.abs(1200 * Math.log2(measureHz(seg, z.rate, want) / want))).toBeLessThan(20);
    }
    expect(centroid(low, z.rate)).toBeLessThan(centroid(mid, z.rate) * 0.9);
    expect(centroid(high, z.rate)).toBeGreaterThan(centroid(mid, z.rate) * 1.1);
  });

  it('kiest de lettergreep: vast, volgende per aanslag, en één per akkoord', async () => {
    const z = await loadZang();
    z.loadBank(bank());
    const tap = (k: number): void => {
      z.input(`gate_${k}`, 1); z.render(0.1);
      z.input(`gate_${k}`, 0); z.render(0.1);
    };
    z.set('mode', 0); z.set('syl', 1);
    tap(1); tap(1);
    expect(z.current()).toBe(1);

    z.set('mode', 1); z.set('syl', 0);
    z.input('reset', 1); z.render(0.01); z.input('reset', 0); z.render(0.01);
    tap(1); expect(z.current()).toBe(0);
    tap(1); expect(z.current()).toBe(1);
    tap(1); expect(z.current()).toBe(0);                     // rond: de bank heeft er twee

    // akkoord: drie gates in hetzelfde blok delen de lettergreep
    z.input('gate_1', 1); z.input('gate_2', 1); z.input('gate_3', 1);
    z.render(0.2);
    expect(z.current()).toBe(1);
    expect(z.voices()).toBe(3);
    for (const k of [1, 2, 3]) z.input(`gate_${k}`, 0);
    z.render(0.2);

    // next-ingang schuift zonder aanslag
    z.input('next', 1); z.render(0.01); z.input('next', 0); z.render(0.01);
    expect(z.current()).toBe(0);
  });
});
