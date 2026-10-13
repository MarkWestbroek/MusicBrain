// Metingen aan een galmstaart (HALL-tests): RT60 via Schroeder-integratie,
// L/R-correlatie, en de vlakheid van het spectrum van de staart.

/** RT60 (s) uit een impulsrespons: Schroeder-curve, helling tussen −5 en −25 dB (T20 × 3). */
export function rt60(ir: Float32Array, rate: number): number {
  const e = new Float64Array(ir.length);
  let acc = 0;
  for (let i = ir.length - 1; i >= 0; i--) { acc += ir[i]! * ir[i]!; e[i] = acc; }
  const db = (i: number) => 10 * Math.log10(e[i]! / e[0]! + 1e-30);
  let i5 = -1, i25 = -1;
  for (let i = 0; i < ir.length; i++) { if (i5 < 0 && db(i) <= -5) i5 = i; if (db(i) <= -25) { i25 = i; break; } }
  if (i5 < 0 || i25 < 0) return Infinity;
  return ((i25 - i5) / rate) * 3;
}

/** Eenvoudige eerste-orde laag- of hoogdoorlaat (voor RT60 per band). */
export function onePole(x: Float32Array, rate: number, hz: number, mode: 'lp' | 'hp'): Float32Array {
  const a = 1 - Math.exp(-2 * Math.PI * hz / rate);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += (x[i]! - s) * a; y[i] = mode === 'lp' ? s : x[i]! - s; }
  return y;
}

export function correlation(a: Float32Array, b: Float32Array, from = 0, to = a.length): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = from; i < to; i++) { ab += a[i]! * b[i]!; aa += a[i]! * a[i]!; bb += b[i]! * b[i]!; }
  return ab / Math.sqrt(aa * bb + 1e-30);
}

/** Grootste piek van het (in 1/3-octaafbanden gemiddelde) spectrum boven de mediaan, in dB,
 *  tussen `lo` en `hi` Hz. Klein = vlak, groot = metalige resonanties. */
export function spectralPeakDb(x: Float32Array, rate: number, lo = 200, hi = 8000): number {
  const n = 1 << Math.floor(Math.log2(Math.min(x.length, 65536)));
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i]! * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const ur = re[i + k]!, ui = im[i + k]!;
      const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi, vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
    }
  }
  const mag = (k: number) => re[k]! * re[k]! + im[k]! * im[k]!;
  // Fijn spectrum in banden van 1/12 octaaf, ten opzichte van een glad gemiddelde over 1/1 octaaf.
  const bands: number[] = [];
  for (let f = lo; f < hi; f *= 2 ** (1 / 12)) {
    const k0 = Math.round(f / rate * n), k1 = Math.max(k0 + 1, Math.round(f * 2 ** (1 / 12) / rate * n));
    let s = 0; for (let k = k0; k < k1; k++) s += mag(k);
    bands.push(10 * Math.log10(s / (k1 - k0) + 1e-30));
  }
  let worst = 0;
  for (let i = 6; i < bands.length - 6; i++) {
    let avg = 0; for (let j = i - 6; j <= i + 6; j++) avg += bands[j]!; avg /= 13;
    worst = Math.max(worst, bands[i]! - avg);
  }
  return worst;
}
