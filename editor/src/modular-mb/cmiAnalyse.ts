// Een sample analyseren naar een Page 4-profiel (doc/plans/fairlight.md §6):
// grondtoon zoeken, het gebied in 32 segmenten snijden, per segment de
// sterkte van harmonische 1..32 meten. Het resultaat is een gewoon
// CmiProfile (cmiProfile.ts) dat je daarna tekent, bewaart en morpht.
// Zuiver: geen React, geen engine.

import { H, SEG, emptyProfile, type CmiProfile } from './cmiProfile';

export interface AnalyseOptions {
  /** Begin en eind van het gebied in samples (standaard het hele stuk). */
  start?: number;
  end?: number;
  /** Grondtoon als hint (bv. de root van een bankzone), in Hz. */
  hintHz?: number;
  /** Vaste grondtoon (de gebruiker koos ½× of 2×); slaat de zoektocht over. */
  f0Hz?: number;
  /** Aanzet fijner: segmenten meetkundig oplopend (standaard aan). */
  fineAttack?: boolean;
  /** De Seg-knop van de stem in ms; DURATION = segmentduur / seg. */
  segMs?: number;
}

export interface Analysis {
  profile: CmiProfile;
  /** Gevonden (of opgegeven) grondtoon in Hz; 0 = geen toon gevonden. */
  f0: number;
  /** Deel van de energie dat op de harmonischen valt, 0..1. */
  harmonicity: number;
  /** Grenzen van de segmenten in samples (33 getallen). */
  bounds: number[];
}

const MIN_HZ = 40, MAX_HZ = 2000;
/** Laatste segment ~11× zo lang als het eerste met "aanzet fijner". */
const ATTACK_RATIO = 11;

// ── grondtoon (YIN) ───────────────────────────────────────────────────────

/** Genormaliseerd verschil (YIN, stap 2–3) voor τ in 1..tMax, over `w`
 *  samples vanaf `at`; index = τ. */
function cmnd(x: Float32Array, at: number, w: number, tMax: number): Float32Array {
  const d = new Float32Array(tMax + 1);
  for (let tau = 1; tau <= tMax; tau++) {
    let s = 0;
    for (let j = 0; j < w; j++) {
      const a = x[at + j] ?? 0, b = x[at + j + tau] ?? 0;
      s += (a - b) * (a - b);
    }
    d[tau] = s;
  }
  // cumulatief genormaliseerd
  const out = new Float32Array(tMax + 1);
  out[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tMax; tau++) {
    run += d[tau]!;
    out[tau] = run > 0 ? (d[tau]! * tau) / run : 1;
  }
  return out;
}

/** Parabolische verfijning rond index i. */
function refine(f: Float32Array, i: number): number {
  if (i <= 0 || i >= f.length - 1) return i;
  const a = f[i - 1]!, b = f[i]!, c = f[i + 1]!;
  const den = a - 2 * b + c;
  return den > 0 ? i + (0.5 * (a - c)) / den : i;
}

/** Periode in samples bij `center`, of 0. Met `around` zoekt hij alleen
 *  binnen ±`spread` van die periode (verfijnen per segment). */
export function findPeriod(x: Float32Array, rate: number, center: number, opts: { hintHz?: number; around?: number; spread?: number } = {}): number {
  let tMin = Math.floor(rate / MAX_HZ), tMax = Math.ceil(rate / MIN_HZ);
  if (opts.around) {
    const sp = opts.spread ?? 0.06;
    tMin = Math.max(2, Math.floor(opts.around * (1 - sp)));
    tMax = Math.ceil(opts.around * (1 + sp)) + 1;
  } else if (opts.hintHz) {
    tMin = Math.max(2, Math.floor(rate / (opts.hintHz * 1.45)));
    tMax = Math.ceil(rate / (opts.hintHz / 1.45));
  }
  const w = Math.max(256, Math.min(4096, 2 * tMax));
  const at = Math.max(0, Math.min(x.length - w - tMax - 1, Math.round(center - (w + tMax) / 2)));
  if (at < 0 || x.length < w + tMax) return 0;
  const f = cmnd(x, at, w, tMax);
  // eerste dal onder de drempel (YIN stap 4), anders het laagste
  let best = -1;
  for (let t = tMin; t <= tMax; t++) {
    if (f[t]! < 0.15) {
      while (t + 1 <= tMax && f[t + 1]! < f[t]!) t++;
      best = t;
      break;
    }
  }
  if (best < 0) {
    let m = Infinity;
    for (let t = tMin; t <= tMax; t++) if (f[t]! < m) { m = f[t]!; best = t; }
    if (!opts.around && m > 0.5) return 0;     // geen toon
  }
  return refine(f, best);
}

// ── harmonischen van één venster ─────────────────────────────────────────

/** Sterkte (amplitude) van harmonische 1..H van grondtoon `f0` in een
 *  Hann-venster van vier perioden rond `center`; plus het deel van de
 *  vensterenergie dat daarop valt. */
export function harmonicsAt(x: Float32Array, rate: number, center: number, f0: number): { amps: Float32Array; harmonic: number; energy: number } {
  const amps = new Float32Array(H);
  const n = Math.max(32, Math.round((4 * rate) / f0));
  const at = Math.round(center - n / 2);
  const w = new Float32Array(n);
  let sw = 0, sw2 = 0, e = 0;
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n);
    sw += w[i]!; sw2 += w[i]! * w[i]!;
    const v = (x[at + i] ?? 0) * w[i]!;
    e += v * v;
  }
  let onH = 0;
  for (let k = 1; k <= H; k++) {
    if (k * f0 >= rate / 2) break;
    const om = (2 * Math.PI * k * f0) / rate;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const v = (x[at + i] ?? 0) * w[i]!;
      re += v * Math.cos(om * i);
      im -= v * Math.sin(om * i);
    }
    const a = (2 * Math.hypot(re, im)) / sw;
    amps[k - 1] = a;
    onH += ((a * a) / 2) * sw2;
  }
  return { amps, harmonic: e > 0 ? Math.min(1, onH / e) : 0, energy: e / sw2 };
}

// ── indeling ──────────────────────────────────────────────────────────────

/** 33 grenzen van `start` tot `end`; gelijk, of meetkundig oplopend. */
export function segmentBounds(start: number, end: number, fineAttack: boolean): number[] {
  const len = Math.max(SEG, end - start);
  const g = fineAttack ? Math.exp(Math.log(ATTACK_RATIO) / (SEG - 1)) : 1;
  const total = g === 1 ? SEG : (g ** SEG - 1) / (g - 1);
  const out = [start];
  let acc = 0;
  for (let s = 0; s < SEG; s++) {
    acc += g ** s;
    out.push(start + (len * acc) / total);
  }
  out[SEG] = start + len;
  return out;
}

/** Waar het geluid begint: de eerste sample boven 3 % van de piek. */
export function soundStart(x: Float32Array): number {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const thr = peak * 0.03;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > thr) return i;
  return 0;
}

// ── alles samen ───────────────────────────────────────────────────────────

export function analyseSample(x: Float32Array, rate: number, opts: AnalyseOptions = {}): Analysis {
  const start = Math.max(0, Math.floor(opts.start ?? 0));
  const end = Math.min(x.length, Math.floor(opts.end ?? x.length));
  const bounds = segmentBounds(start, end, opts.fineAttack ?? true);
  const profile = emptyProfile();
  // Grondtoon op het stabiele midden (na de aanzet).
  const mid = start + (end - start) * 0.4;
  const T = opts.f0Hz ? rate / opts.f0Hz : findPeriod(x, rate, mid, { hintHz: opts.hintHz });
  if (!(T > 0)) return { profile, f0: 0, harmonicity: 0, bounds };
  const f0 = rate / T;
  const segMs = opts.segMs ?? 30;

  const rms = new Float32Array(SEG);
  let hSum = 0, eSum = 0;
  for (let s = 0; s < SEG; s++) {
    const a = bounds[s]!, b = bounds[s + 1]!;
    const c = (a + b) / 2;
    // Per segment opnieuw (vibrato), binnen ±6 % van de grondtoon.
    const Ts = opts.f0Hz ? T : (findPeriod(x, rate, c, { around: T }) || T);
    const { amps, harmonic, energy } = harmonicsAt(x, rate, c, rate / Ts);
    let max = 0;
    for (const v of amps) max = Math.max(max, v);
    for (let h = 0; h < H; h++) profile.levels[h * SEG + s] = max > 0 ? amps[h]! / max : 0;
    rms[s] = Math.sqrt(energy);
    hSum += harmonic * energy; eSum += energy;
    profile.duration[s] = Math.max(1 / 16, Math.min(16, ((b - a) / rate) * 1000 / segMs));
  }
  let top = 0;
  for (const v of rms) top = Math.max(top, v);
  for (let s = 0; s < SEG; s++) profile.energy[s] = top > 0 ? rms[s]! / top : 0;
  return { profile, f0, harmonicity: eSum > 0 ? hSum / eSum : 0, bounds };
}

/** MIDI-noot en centafwijking bij een frequentie (voor de weergave). */
export function noteOf(hz: number): { midi: number; cents: number; name: string } {
  const m = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(m);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return { midi, cents: Math.round((m - midi) * 100), name: `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}` };
}
