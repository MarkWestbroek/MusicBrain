// Test voor de WAV-encoder. De opname zelf hangt aan een AudioWorklet en is
// hier niet te draaien, maar het bestandsformaat is puur rekenwerk — en juist
// daar zitten de fouten die je pas maanden later hoort (kanalen omgewisseld,
// 24-bits negatieve waarden die omklappen, een RIFF-lengte die er acht naast
// zit).
//
// Draaien: `npm test` in editor/.

import { describe, expect, it } from 'vitest';
import { encodeWav, peakOf, dbfs, wavFileName } from './wavRecorder';

/** Minimale WAV-lezer: genoeg om terug te lezen wat we schreven. */
function parseWav(buf: ArrayBuffer): {
  format: number; channels: number; rate: number; bits: number;
  frames: number; sample(frame: number, ch: number): number;
} {
  const dv = new DataView(buf);
  const tag = (o: number): string => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  expect(tag(0)).toBe('RIFF');
  expect(tag(8)).toBe('WAVE');
  expect(dv.getUint32(4, true)).toBe(buf.byteLength - 8);

  let p = 12;
  let fmt = { format: 1, channels: 0, rate: 0, bits: 0 };
  let dataAt = -1, dataLen = 0;
  while (p + 8 <= buf.byteLength) {
    const id = tag(p), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(p + 8, true), channels: dv.getUint16(p + 10, true),
        rate: dv.getUint32(p + 12, true), bits: dv.getUint16(p + 22, true),
      };
      // byte rate en block align moeten bij de rest passen
      expect(dv.getUint32(p + 16, true)).toBe(fmt.rate * fmt.channels * (fmt.bits / 8));
      expect(dv.getUint16(p + 20, true)).toBe(fmt.channels * (fmt.bits / 8));
    }
    if (id === 'data') { dataAt = p + 8; dataLen = size; }
    p += 8 + size + (size % 2);
  }
  expect(dataAt).toBeGreaterThan(0);

  const bytes = fmt.bits / 8;
  const frames = dataLen / (bytes * fmt.channels);
  const sample = (frame: number, ch: number): number => {
    const o = dataAt + (frame * fmt.channels + ch) * bytes;
    if (fmt.format === 3) return dv.getFloat32(o, true);
    if (bytes === 2) return dv.getInt16(o, true) / 32767;
    const raw = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16);
    return (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388607;
  };
  return { ...fmt, frames, sample };
}

const L = new Float32Array([0, 0.5, -0.5, 1, -1]);
const R = new Float32Array([1, -1, 0.25, -0.25, 0]);

describe('encodeWav', () => {
  it.each(['i16', 'i24', 'f32'] as const)('%s: kop klopt en kanalen blijven gescheiden', (format) => {
    const w = parseWav(encodeWav([L, R], 48000, format));
    expect(w.channels).toBe(2);
    expect(w.rate).toBe(48000);
    expect(w.frames).toBe(5);
    expect(w.format).toBe(format === 'f32' ? 3 : 1);
    expect(w.bits).toBe({ i16: 16, i24: 24, f32: 32 }[format]);
    // Het onderscheid dat er echt toe doet: links is niet rechts.
    const tol = format === 'i16' ? 1 / 32767 : 1 / 8388607;
    for (let i = 0; i < 5; i++) {
      expect(w.sample(i, 0)).toBeCloseTo(L[i]!, 4);
      expect(w.sample(i, 1)).toBeCloseTo(R[i]!, 4);
      expect(Math.abs(w.sample(i, 0) - L[i]!)).toBeLessThanOrEqual(tol);
    }
  });

  it('f32 geeft de monsters bit-exact terug', () => {
    const odd = new Float32Array([0.1234567, -0.7654321, 1e-7]);
    const w = parseWav(encodeWav([odd, odd], 44100, 'f32'));
    for (let i = 0; i < odd.length; i++) expect(w.sample(i, 0)).toBe(Math.fround(odd[i]!));
  });

  it('klemt buiten bereik in plaats van om te klappen', () => {
    // Zonder klem wordt +1,5 in int24 een grote negatieve waarde: een tik in
    // plaats van een luide piek.
    const hot = new Float32Array([1.5, -1.5]);
    const w = parseWav(encodeWav([hot, hot], 48000, 'i24'));
    expect(w.sample(0, 0)).toBeCloseTo(1, 5);
    expect(w.sample(1, 0)).toBeCloseTo(-1, 5);
  });

  it('mono mag ook', () => {
    const w = parseWav(encodeWav([L], 22050, 'i24'));
    expect(w.channels).toBe(1);
    expect(w.frames).toBe(5);
  });

  it('weigert kanalen van ongelijke lengte', () => {
    expect(() => encodeWav([L, new Float32Array(3)], 48000)).toThrow(/ongelijk/);
    expect(() => encodeWav([], 48000)).toThrow(/geen kanalen/);
  });
});

describe('piekmeting', () => {
  it('leest de grootste uitslag over alle kanalen', () => {
    expect(peakOf([new Float32Array([0.2, -0.9]), new Float32Array([0.4, 0.1])])).toBeCloseTo(0.9, 6);
  });
  it('rekent dBFS, en stilte heeft geen dB', () => {
    expect(dbfs(1)).toBeCloseTo(0, 6);
    expect(dbfs(0.5)).toBeCloseTo(-6.0206, 3);
    expect(dbfs(0)).toBeNull();
  });
});

describe('wavFileName', () => {
  it('maakt een sorteerbare naam zonder spaties', () => {
    const name = wavFileName('Krell Ambient!', new Date(2026, 8, 6, 21, 5, 3));
    expect(name).toBe('mmb-krell-ambient-20260906-210503.wav');
  });
  it('valt terug op "patch" als er geen bruikbare naam is', () => {
    expect(wavFileName('«»', new Date(2026, 0, 1, 0, 0, 0))).toBe('mmb-patch-20260101-000000.wav');
  });
});

// ── de worklet zelf ────────────────────────────────────────────────────
//
// `public/rec/tap-worklet.js` draait normaal op de audiothread en is daar niet
// te inspecteren. De boekhouding erin — bufferen tot 4096, halfvolle staart
// meesturen, stilte doorschrijven als er even niets aan de bus hangt — is
// gewone JS, en juist daar kost een fout van één monster je later de
// synchronisatie. Dus laden we het bestand met een schil eromheen.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { fileURLToPath } from 'node:url';

interface FakePort {
  postMessage(msg: unknown, transfer?: unknown[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}
interface Tap {
  process(inputs: Float32Array[][]): boolean;
  port: FakePort;
}

function loadTap(channels: number): { tap: Tap; sent: Float32Array[][]; done: () => boolean } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.resolve(here, '../../../public/rec/tap-worklet.js'), 'utf8');

  const sent: Float32Array[][] = [];
  let finished = false;
  const port: FakePort = {
    onmessage: null,
    postMessage(msg: unknown) {
      const d = msg as { chunks?: Float32Array[]; done?: boolean };
      // De echte poort verplaatst de buffers; wij kopiëren zodat een latere
      // hergebruikte buffer de test niet stiekem aanpast.
      if (d.chunks) sent.push(d.chunks.map((a) => Float32Array.from(a)));
      if (d.done) finished = true;
    },
  };

  let ctor: (new (o: unknown) => Tap) | null = null;
  const sandbox = {
    AudioWorkletProcessor: class { port = port; },
    registerProcessor: (_name: string, c: new (o: unknown) => Tap) => { ctor = c; },
  };
  vm.runInNewContext(src, sandbox, { filename: 'tap-worklet.js' });
  if (!ctor) throw new Error('registerProcessor is niet aangeroepen');
  const tap = new (ctor as new (o: unknown) => Tap)({ processorOptions: { channels } });
  return { tap, sent, done: () => finished };
}

/** Alle verstuurde blokken achter elkaar plakken, per kanaal. */
function joined(sent: Float32Array[][], ch: number): number[] {
  const out: number[] = [];
  for (const part of sent) for (const v of part[ch]!) out.push(v);
  return out;
}

describe('tap-worklet', () => {
  it('registreert zich als mmb-tap', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../../../public/rec/tap-worklet.js'), 'utf8');
    expect(src).toContain("registerProcessor('mmb-tap'");
  });

  it('levert elk monster precies één keer af, ook over de blokgrens', () => {
    const { tap, sent, done } = loadTap(2);
    // 40 kwanta van 128 = 5120 frames, dus één vol blok van 4096 plus staart.
    const total = 40 * 128;
    let n = 0;
    for (let q = 0; q < 40; q++) {
      const l = new Float32Array(128), r = new Float32Array(128);
      for (let i = 0; i < 128; i++) { l[i] = n; r[i] = -n; n++; }
      expect(tap.process([[l, r]])).toBe(true);
    }
    expect(sent.length).toBe(1);          // pas bij 4096 gaat er iets uit
    tap.port.onmessage!({ data: 'stop' });
    expect(done()).toBe(true);

    const left = joined(sent, 0), right = joined(sent, 1);
    expect(left.length).toBe(total);
    expect(right.length).toBe(total);
    // Oplopende reeks = elk monster één keer, in volgorde, niets dubbel.
    for (let i = 0; i < total; i++) {
      expect(left[i]).toBe(i);
      expect(right[i]).toBe(-i);
    }
    expect(tap.process([[new Float32Array(128), new Float32Array(128)]])).toBe(false);
  });

  it('schrijft stilte door als er niets aan de bus hangt', () => {
    // Dit gebeurt echt: tijdens een patch-herbouw wordt de master vervangen.
    // Zou de tap dan niets schrijven, dan wordt de opname korter dan wat je
    // speelde en loopt alles erna uit de pas.
    const { tap, sent } = loadTap(2);
    for (let q = 0; q < 8; q++) tap.process([[]]);
    tap.port.onmessage!({ data: 'stop' });
    expect(joined(sent, 0).length).toBe(8 * 128);
    expect(joined(sent, 0).every((v) => v === 0)).toBe(true);
  });

  it('waaiert een mono bron uit over beide kanalen', () => {
    const { tap, sent } = loadTap(2);
    const mono = new Float32Array(128).fill(0.5);
    tap.process([[mono]]);
    tap.port.onmessage!({ data: 'stop' });
    expect(joined(sent, 1).every((v) => v === 0.5)).toBe(true);
  });
});
