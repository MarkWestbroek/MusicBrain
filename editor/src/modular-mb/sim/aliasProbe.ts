// Aliasmeting op wasm-kernen (doc/dsp-check-2026-10.md). Een sinus van f0
// erin; de teruggevouwen boventonen van k·f0 (k·f0 > Nyquist) landen op
// voorspelbare plekken. Daar meten we, zodat zelf-oscillatie of ruis de
// uitkomst niet vertroebelt. Zuiver; gebruikt door wasmAlias.test.ts.

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]!, ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci;
        const vi = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export interface AliasResult { aliasDb: number; worstAliasDb: number; worstAliasHz: number; harmonicsDb: number; rms: number; thdDb: number; levelAt: (hz: number) => number }

/** Spectrum van `x` (stuk vanaf `from`, 2^15 samples), Blackman-Harris. */
export function aliasOf(x: Float32Array, f0: number, rate: number, from = Math.round(0.3 * rate)): AliasResult {
  const N = 1 << 15;
  const re = new Float64Array(N), im = new Float64Array(N);
  let s2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const w = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * t) + 0.14128 * Math.cos(4 * Math.PI * t) - 0.01168 * Math.cos(6 * Math.PI * t);
    const v = x[from + i] ?? 0;
    re[i] = v * w; s2 += v * v;
  }
  fft(re, im);
  const P = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) P[k] = re[k]! * re[k]! + im[k]! * im[k]!;
  const binOf = (hz: number): number => Math.round((hz / rate) * N);
  const band = (hz: number, w = 4): number => { const c = binOf(hz); let e = 0; for (let k = Math.max(1, c - w); k <= Math.min(N / 2 - 1, c + w); k++) e += P[k]!; return e; };
  const nyq = rate / 2;
  const harmBins = new Set<number>();
  let H = 0, f1 = band(f0);
  for (let k = 1; k * f0 < nyq - 50; k++) { H += band(k * f0); harmBins.add(binOf(k * f0)); }
  const thd = H - f1;
  let A = 0, worst = 0, worstHz = 0;
  for (let k = 1; k * f0 < 16 * rate; k++) {
    const f = k * f0;
    if (f < nyq) continue;
    let g = f % rate; if (g > nyq) g = rate - g;           // terugvouwen
    if (g < 30) continue;
    const b = binOf(g);
    let nearHarm = false;
    for (const h of harmBins) if (Math.abs(h - b) <= 8) { nearHarm = true; break; }
    if (nearHarm) continue;
    const e = band(g, 2);
    A += e;
    if (g < 10000 && e > worst) { worst = e; worstHz = g; }
  }
  const db = (v: number): number => 10 * Math.log10(v + 1e-30);
  return { aliasDb: db(A / (H || 1e-30)), worstAliasDb: db(worst / (f1 || 1e-30)), worstAliasHz: Math.round(worstHz), harmonicsDb: db(H), rms: Math.sqrt(s2 / N), thdDb: db(thd / (f1 || 1e-30)), levelAt: (hz: number) => db(band(hz, 2) / (f1 || 1e-30)) };
}
