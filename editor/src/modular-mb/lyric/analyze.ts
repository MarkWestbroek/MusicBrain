// lyric/analyze — een ingesproken opname klaarmaken om te zingen (PSOLA).
//
// Zuiver rekenwerk, zonder browser of audio-API, dus los te testen:
//
//   resample        — naar de bankrate (22 050 Hz), windowed-sinc
//   trackPitch      — toonhoogte en stemhebbend/stemloos per 10 ms
//   placeMarks      — pitch marks: één per stemperiode, op de sterkste piek;
//                     in stemloze stukken op een raster van 5 ms
//   splitSyllables  — lettergreepgrenzen uit de energie-omhullende
//   analyzeRecording — alles achter elkaar: een lijst lettergrepen met hun
//                     eigen samples, marks en klinkerkern
//
// De firmware en de wasm doen hier niets van; zij krijgen het resultaat als
// `.mmbl` (lyricBank.ts, mmb_dsp/lyric_bank.h). Achtergrond:
// doc/plans/zingende-stemmen.md.

export const LYRIC_RATE = 22050;
export const MARK_UNVOICED = 0x80000000;

/** Eén pitch mark: frame binnen het signaal, en of het stuk stemloos is. */
export interface Mark { frame: number; unvoiced: boolean }

export interface PitchTrack {
  /** Hop in samples tussen twee frames. */
  hop: number;
  /** Hz per frame; 0 = stemloos of stil. */
  f0: Float32Array;
  /** RMS per frame. */
  rms: Float32Array;
}

export interface SyllableAnalysis {
  /** Eigen samples (mono, `rate` Hz), −1..1. */
  data: Float32Array;
  rate: number;
  /** Marks met frames relatief aan `data`, strikt oplopend. */
  marks: Mark[];
  /** Klinkerkern als mark-indexen; end <= start = niet aan te houden. */
  sustainStart: number;
  sustainEnd: number;
  /** Hoe goed de kern als lus klinkt, 0..1 (zie findSustain). */
  sustainQuality: number;
  /** Mediaan van de gesproken toonhoogte; 0 = geen stemhebbend deel. */
  pitchHz: number;
  /** Laatste lettergreep van een woord. */
  wordEnd: boolean;
  text: string;
  /** Waar hij in de opname zat (frames op `rate`), voor de editor. */
  sourceStart: number;
  sourceEnd: number;
}

// ── resample ───────────────────────────────────────────────────────────────

/** Windowed-sinc (Hann, 16 nuldoorgangen per kant), met anti-aliasing bij omlaag. */
export function resample(x: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return x.slice();
  const ratio = toRate / fromRate;
  const n = Math.max(1, Math.floor(x.length * ratio));
  const out = new Float32Array(n);
  const cutoff = Math.min(1, ratio);            // relatief aan de bron-Nyquist
  const half = Math.ceil(16 / cutoff);
  for (let i = 0; i < n; i++) {
    const t = i / ratio;
    const c = Math.floor(t);
    let acc = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k;
      const a = Math.PI * d * cutoff;
      const s = Math.abs(a) < 1e-9 ? 1 : Math.sin(a) / a;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / half));
      acc += x[k]! * s * w;
      wsum += s * w;
    }
    out[i] = wsum > 1e-9 ? acc / wsum : 0;
  }
  return out;
}

// ── toonhoogte ─────────────────────────────────────────────────────────────

export interface PitchOptions {
  minHz?: number;          // 55 (een lage mannenstem zakt aan het eind van een woord tot 60 Hz)
  maxHz?: number;          // 500
  hopMs?: number;          // 10
  windowMs?: number;       // 40
  /** Ondergrens van de genormaliseerde autocorrelatie voor "stemhebbend". */
  voicedThreshold?: number; // 0.38
  /** RMS onder dit deel van de luidste frame telt als stil. */
  silenceRatio?: number;   // 0.04
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : 0.5 * (s[m - 1]! + s[m]!);
}

/**
 * Toonhoogte per frame, naar het recept van Praat (Boersma 1993), vereenvoudigd.
 *
 * Vooraf een laagdoorlaat op 900 Hz: de formanten verdwijnen grotendeels en
 * de grondtoon blijft. Per frame levert de genormaliseerde autocorrelatie een
 * handvol **kandidaten** (de pieken) plus de kandidaat "stemloos". Daarna
 * kiest dynamisch programmeren het pad met de hoogste som: sterke pieken
 * winnen, maar een sprong in toonhoogte en een wissel tussen stemhebbend en
 * stemloos kosten iets. Zo volgt het spoor de zinsmelodie over meer dan een
 * octaaf zonder op de helft of het dubbele te springen.
 */
export function trackPitch(x: Float32Array, rate: number, opt: PitchOptions = {}): PitchTrack {
  const minHz = opt.minHz ?? 55, maxHz = opt.maxHz ?? 500;
  const hop = Math.max(1, Math.round(((opt.hopMs ?? 10) / 1000) * rate));
  const win = Math.max(hop, Math.round(((opt.windowMs ?? 40) / 1000) * rate));
  const voicing = opt.voicedThreshold ?? 0.38;
  const lagMin = Math.max(2, Math.floor(rate / maxHz));
  const lagMax = Math.min(win - 2, Math.ceil(rate / minHz));
  const frames = Math.max(0, Math.floor((x.length - win - lagMax - 1) / hop) + 1);
  const rms = new Float32Array(frames);
  const lp = lowpassPitch(x, rate);

  let rmsMax = 0;
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < win; i++) e += x[o + i]! * x[o + i]!;
    rms[f] = Math.sqrt(e / win);
    if (rms[f]! > rmsMax) rmsMax = rms[f]!;
  }
  const silence = Math.max(1e-5, rmsMax * (opt.silenceRatio ?? 0.04));

  const OCTAVE_COST = 0.02;        // lichte voorkeur voor de hogere kandidaat
  const JUMP_COST = 0.5;           // per octaaf sprong tussen twee frames
  const VU_COST = 0.2;             // wissel stemhebbend ↔ stemloos
  const MAX_CAND = 6;

  // Kandidaten per frame: hz = 0 is "stemloos".
  const cand: { hz: number; score: number }[][] = [];
  const r = new Float32Array(lagMax + 3);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    const list: { hz: number; score: number }[] = [];
    // Stemloos: aantrekkelijker naarmate het frame stiller is.
    const loud = rms[f]! / silence;
    list.push({ hz: 0, score: voicing + Math.max(0, 2 - loud / (1 + voicing)) });
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += lp[o + i]! * lp[o + i]!;
    if (e0 > 0 && rms[f]! >= silence * 0.5) {
      for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
        let num = 0, e1 = 0;
        for (let i = 0; i < win; i++) {
          const b = lp[o + i + lag]!;
          num += lp[o + i]! * b;
          e1 += b * b;
        }
        r[lag] = e1 > 0 ? num / Math.sqrt(e0 * e1) : 0;
      }
      const peaks: { hz: number; score: number }[] = [];
      for (let lag = lagMin; lag <= lagMax; lag++) {
        const v = r[lag]!;
        if (v < 0.2 || v < r[lag - 1]! || v <= r[lag + 1]!) continue;
        const a = r[lag - 1]!, c = r[lag + 1]!;
        const d = a - 2 * v + c;
        const frac = Math.abs(d) > 1e-9 ? (0.5 * (a - c)) / d : 0;
        const hz = rate / (lag + frac);
        peaks.push({ hz, score: v - OCTAVE_COST * Math.log2(maxHz / hz) });
      }
      peaks.sort((p, q) => q.score - p.score);
      for (const pk of peaks.slice(0, MAX_CAND)) list.push(pk);
    }
    cand.push(list);
  }

  // Beste pad (Viterbi).
  const f0 = new Float32Array(frames);
  if (frames > 0) {
    const total: number[][] = [], back: number[][] = [];
    total.push(cand[0]!.map((c) => c.score)); back.push(cand[0]!.map(() => -1));
    for (let f = 1; f < frames; f++) {
      const prev = cand[f - 1]!, cur = cand[f]!;
      const t: number[] = [], bk: number[] = [];
      for (const c of cur) {
        let best = -Infinity, arg = 0;
        for (let j = 0; j < prev.length; j++) {
          const p = prev[j]!;
          let cost = 0;
          if (p.hz > 0 && c.hz > 0) cost = JUMP_COST * Math.abs(Math.log2(c.hz / p.hz));
          else if ((p.hz > 0) !== (c.hz > 0)) cost = VU_COST;
          const v = total[f - 1]![j]! - cost;
          if (v > best) { best = v; arg = j; }
        }
        t.push(best + c.score); bk.push(arg);
      }
      total.push(t); back.push(bk);
    }
    let k = 0;
    const lastT = total[frames - 1]!;
    for (let j = 1; j < lastT.length; j++) if (lastT[j]! > lastT[k]!) k = j;
    for (let f = frames - 1; f >= 0; f--) {
      f0[f] = cand[f]![k]!.hz;
      k = back[f]![k]!;
    }
  }

  // Een los stemhebbend frame tussen stemloze valt weg.
  for (let f = 0; f < frames; f++) {
    if (f0[f]! > 0 && !(f0[f - 1]! > 0) && !(f0[f + 1]! > 0)) f0[f] = 0;
  }
  return { hop, f0, rms };
}

/** Laagdoorlaat voor de toonhoogteschatting: 900 Hz, heen en terug, twee keer. */
function lowpassPitch(x: Float32Array, rate: number): Float32Array {
  return lowpass(lowpass(x, rate, 900), rate, 900);
}

// ── pitch marks ────────────────────────────────────────────────────────────

/** Twee keer een eenpolig laagdoorlaat (heen en terug: geen faseverschuiving). */
function lowpass(x: Float32Array, rate: number, hz: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / rate);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += a * (x[i]! - s); y[i] = s; }
  s = 0;
  for (let i = x.length - 1; i >= 0; i--) { s += a * (y[i]! - s); y[i] = s; }
  return y;
}

function periodAt(track: PitchTrack, rate: number, frame: number): number {
  const center = Math.round(frame / track.hop);
  for (let d = 0; d < 8; d++) {
    for (const f of [center - d, center + d]) {
      const v = track.f0[f];
      if (v !== undefined && v > 0) return rate / v;
    }
  }
  return 0;
}

/**
 * Marks onderling uitlijnen op golfvorm. Pieken kiezen zet elke mark ongeveer
 * goed, maar "ongeveer" is hoorbaar: staat de ene mark iets vóór zijn puls en
 * de volgende iets erna, dan wiebelt de toonhoogte zodra PSOLA dezelfde marks
 * heen en weer afloopt. Daarom schuiven we elke mark (hooguit 12 % van de
 * periode) naar de plek waar de golf eromheen het best lijkt op de golf rond
 * zijn voorganger. De marks hoeven niet precies op de puls te staan, als ze
 * er maar allemaal even ver vandaan staan.
 */
function alignMarks(x: Float32Array, marks: number[], lo: number, hi: number): number[] {
  if (marks.length < 3) return marks;
  const out = marks.slice();
  // Vanuit het midden naar buiten: daar is de klinker het stabielst.
  const mid = marks.length >> 1;
  const fit = (k: number, ref: number): void => {
    const period = Math.abs(out[k]! - out[ref]!);
    const half = Math.max(8, Math.round(period * 0.5));
    const reach = Math.max(1, Math.round(period * 0.12));
    const r0 = out[ref]!;
    if (r0 - half < 0 || r0 + half >= x.length) return;
    let e0 = 0;
    for (let i = -half; i <= half; i++) e0 += x[r0 + i]! * x[r0 + i]!;
    if (e0 <= 0) return;
    let best = -Infinity, at = out[k]!;
    for (let d = -reach; d <= reach; d++) {
      const c = out[k]! + d;
      if (c - half < lo || c + half >= hi || c - half < 0 || c + half >= x.length) continue;
      let num = 0, e1 = 0;
      for (let i = -half; i <= half; i++) { const v = x[c + i]!; num += x[r0 + i]! * v; e1 += v * v; }
      // Lichte voorkeur voor blijven staan.
      const v = (e1 > 0 ? num / Math.sqrt(e0 * e1) : 0) - 0.02 * (Math.abs(d) / reach);
      if (v > best) { best = v; at = c; }
    }
    out[k] = at;
  };
  for (let k = mid + 1; k < out.length; k++) fit(k, k - 1);
  for (let k = mid - 1; k >= 0; k--) fit(k, k + 1);
  // Strikt oplopend houden.
  for (let k = 1; k < out.length; k++) if (out[k]! <= out[k - 1]!) out[k] = out[k - 1]! + 1;
  return out;
}

/**
 * Pitch marks over het hele signaal. Stemhebbend: vanaf de sterkste piek
 * beide kanten op in stappen van de lokale periode, telkens naar de sterkste
 * piek binnen ±25 % van de verwachte plek. Stemloos of stil: elke 5 ms.
 */
export function placeMarks(x: Float32Array, rate: number, track: PitchTrack): Mark[] {
  const n = x.length;
  const lp = lowpass(x, rate, 900);
  const grid = Math.max(8, Math.round(rate * 0.005));
  const marks: Mark[] = [];

  // Stemhebbende stukken als [start, eind) in samples.
  const runs: { a: number; b: number }[] = [];
  let open = -1;
  for (let f = 0; f <= track.f0.length; f++) {
    const v = f < track.f0.length && track.f0[f]! > 0;
    if (v && open < 0) open = f;
    if (!v && open >= 0) {
      const a = open * track.hop;
      const b = Math.min(n, (f - 1) * track.hop + Math.round(rate * 0.04));
      if (runs.length && a <= runs[runs.length - 1]!.b) runs[runs.length - 1]!.b = b;
      else runs.push({ a, b });
      open = -1;
    }
  }

  const voiced: number[] = [];
  for (const run of runs) {
    if (run.b - run.a < rate * 0.02) continue;
    // Polariteit met de grootste pieken.
    let pos = 0, neg = 0, iPos = run.a, iNeg = run.a;
    for (let i = run.a; i < run.b; i++) {
      const v = lp[i]!;
      if (v > pos) { pos = v; iPos = i; }
      if (-v > neg) { neg = -v; iNeg = i; }
    }
    const sign = pos >= neg ? 1 : -1;
    const start = sign > 0 ? iPos : iNeg;
    const peakNear = (expected: number, period: number): number => {
      const w = Math.max(2, Math.round(period * 0.25));
      let best = -Infinity, at = expected;
      for (let i = Math.max(run.a, expected - w); i <= Math.min(run.b - 1, expected + w); i++) {
        // Lichte voorkeur voor de verwachte plek: bij een vlakke top niet gaan zwerven.
        const v = sign * lp[i]! * (1 - 0.15 * Math.abs(i - expected) / w);
        if (v > best) { best = v; at = i; }
      }
      return at;
    };
    const local: number[] = [start];
    for (let cur = start; ;) {
      const p = periodAt(track, rate, cur);
      if (p <= 0) break;
      const e = Math.round(cur + p);
      if (e >= run.b) break;
      const at = peakNear(e, p);
      if (at <= cur) break;
      local.push(at); cur = at;
    }
    for (let cur = start; ;) {
      const p = periodAt(track, rate, cur);
      if (p <= 0) break;
      const e = Math.round(cur - p);
      if (e < run.a) break;
      const at = peakNear(e, p);
      if (at >= cur) break;
      local.unshift(at); cur = at;
    }
    if (local.length >= 3) for (const m of alignMarks(x, local, run.a, run.b)) voiced.push(m);
  }
  voiced.sort((a, b) => a - b);

  // Raster in de gaten tussen de stemhebbende marks.
  const fill = (from: number, to: number): void => {
    for (let i = from; i < to; i += grid) marks.push({ frame: i, unvoiced: true });
  };
  let cursor = 0;
  let i = 0;
  while (i < voiced.length) {
    // één aaneengesloten stemhebbende reeks: buren dichter dan 25 ms
    let j = i;
    while (j + 1 < voiced.length && voiced[j + 1]! - voiced[j]! < rate * 0.025) j++;
    const first = voiced[i]!, last = voiced[j]!;
    if (first - cursor >= grid) fill(cursor, first - Math.floor(grid / 2));
    for (let k = i; k <= j; k++) marks.push({ frame: voiced[k]!, unvoiced: false });
    const period = j > i ? (last - first) / (j - i) : grid;
    cursor = Math.round(last + period);
    i = j + 1;
  }
  if (n - cursor >= grid) fill(cursor, n);

  // Strikt oplopend, binnen het signaal.
  marks.sort((a, b) => a.frame - b.frame);
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.frame < 0 || m.frame >= n) continue;
    const prev = out[out.length - 1];
    if (prev && m.frame - prev.frame < 4) { if (!m.unvoiced && prev.unvoiced) out[out.length - 1] = m; continue; }
    out.push(m);
  }
  return out;
}

// ── lettergrepen ───────────────────────────────────────────────────────────

export interface SplitOptions {
  /** Verwacht aantal lettergrepen; 0 = zelf bepalen. */
  count?: number;
  /** Stilte (ms) die twee woorden scheidt. */
  wordGapMs?: number;        // 120
  /** Kortste lettergreep (ms). */
  minSyllableMs?: number;    // 90
}

export interface Span { start: number; end: number; wordEnd: boolean }

/**
 * Lettergreepgrenzen uit de "klinkendheid": de energie van het signaal
 * tussen 500 en 2000 Hz, gewogen met stemhebbendheid. Pieken zijn kernen,
 * het diepste dal tussen twee kernen is de grens. Met `count` kiezen we de
 * `count` duidelijkste kernen.
 */
export function splitSyllables(x: Float32Array, rate: number, track: PitchTrack, opt: SplitOptions = {}): Span[] {
  const hop = track.hop;
  const frames = track.f0.length;
  if (frames < 3) return x.length ? [{ start: 0, end: x.length, wordEnd: true }] : [];
  const band = lowpass(x, rate, 2000);
  // De band 500–2000 Hz: daar zitten de eerste twee klinkerformanten. Onder
  // 500 Hz zit het gebrom van nasalen (n, m, ng), boven 2000 Hz de ruis van
  // fricatieven (s, z, f). Een "n" tussen twee klinkers is in deze band een
  // duidelijk dal, en een "z" aan het begin geen eigen piek.
  const low = lowpass(x, rate, 500);
  const win = Math.round(rate * 0.03);
  const son = new Float32Array(frames), ene = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0, all = 0;
    for (let i = 0; i < win && o + i < x.length; i++) {
      const v = band[o + i]! - low[o + i]!;
      e += v * v;
      all += x[o + i]! * x[o + i]!;
    }
    ene[f] = Math.sqrt(all / win);
    son[f] = Math.sqrt(e / win) * (track.f0[f]! > 0 ? 1 : 0.25);
  }
  // Gladstrijken (±30 ms).
  const sm = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0, c = 0;
    for (let k = -3; k <= 3; k++) { const v = son[f + k]; if (v !== undefined) { s += v; c++; } }
    sm[f] = s / c;
  }
  let eMax = 0, sMax = 0;
  for (let f = 0; f < frames; f++) { if (ene[f]! > eMax) eMax = ene[f]!; if (sm[f]! > sMax) sMax = sm[f]!; }
  if (eMax <= 0 || sMax <= 0) return [];
  const quiet = eMax * 0.05;

  // Woorden: stukken tussen stiltes.
  const gapFrames = Math.max(1, Math.round(((opt.wordGapMs ?? 120) / 1000) * rate / hop));
  const words: { a: number; b: number }[] = [];
  let a = -1, silentRun = 0;
  for (let f = 0; f < frames; f++) {
    const loud = ene[f]! > quiet;
    if (loud) { if (a < 0) a = f; silentRun = 0; }
    else if (a >= 0) {
      silentRun++;
      if (silentRun >= gapFrames) { words.push({ a, b: f - silentRun + 1 }); a = -1; silentRun = 0; }
    }
  }
  if (a >= 0) words.push({ a, b: frames - silentRun });

  // Kernen: lokale pieken in de klinkendheid, met hun "prominentie".
  interface Peak { f: number; prom: number; word: number }
  const peaks: Peak[] = [];
  const minDist = Math.max(2, Math.round(((opt.minSyllableMs ?? 90) / 1000) * rate / hop));
  words.forEach((w, wi) => {
    const local: Peak[] = [];
    for (let f = w.a; f < w.b; f++) {
      const v = sm[f]!;
      if (v < sMax * 0.08) continue;
      if ((f > w.a && sm[f - 1]! > v) || (f + 1 < w.b && sm[f + 1]! >= v)) continue;
      // prominentie: hoogte boven het hoogste van de twee dalen naar een hogere buur
      let l = v, r = v;
      for (let k = f - 1; k >= w.a && sm[k]! <= v; k--) l = Math.min(l, sm[k]!);
      for (let k = f + 1; k < w.b && sm[k]! <= v; k++) r = Math.min(r, sm[k]!);
      local.push({ f, prom: v - Math.max(l, r) + 0.001 * v, word: wi });
    }
    if (local.length === 0 && w.b > w.a) {
      let best = w.a;
      for (let f = w.a; f < w.b; f++) if (sm[f]! > sm[best]!) best = f;
      local.push({ f: best, prom: sm[best]!, word: wi });
    }
    // te dicht op elkaar: de zwakste valt af
    local.sort((p, q) => q.prom - p.prom);
    const kept: Peak[] = [];
    for (const p of local) if (kept.every((k) => Math.abs(k.f - p.f) >= minDist)) kept.push(p);
    for (const p of kept) peaks.push(p);
  });

  let chosen = peaks.slice();
  const want = opt.count ?? 0;
  if (want > 0 && chosen.length > want) {
    // Elk woord houdt minstens zijn sterkste kern.
    const strongest = new Map<number, Peak>();
    for (const p of chosen) { const s = strongest.get(p.word); if (!s || p.prom > s.prom) strongest.set(p.word, p); }
    const must = new Set(strongest.values());
    const rest = chosen.filter((p) => !must.has(p)).sort((p, q) => q.prom - p.prom);
    chosen = [...must, ...rest.slice(0, Math.max(0, want - must.size))];
  } else if (want === 0) {
    const floor = Math.max(...chosen.map((p) => p.prom)) * 0.12;
    chosen = chosen.filter((p) => p.prom >= floor || peaks.filter((q) => q.word === p.word).every((q) => q.prom <= p.prom));
  }
  chosen.sort((p, q) => p.f - q.f);

  const spans: Span[] = [];
  const pad = Math.round(rate * 0.01);
  words.forEach((w, wi) => {
    const mine = chosen.filter((p) => p.word === wi);
    if (mine.length === 0) return;
    let start = w.a;
    mine.forEach((p, k) => {
      let end = w.b;
      const nextPeak = mine[k + 1];
      if (nextPeak) {
        let dip = p.f + 1;
        for (let f = p.f + 1; f < nextPeak.f; f++) if (sm[f]! < sm[dip]!) dip = f;
        end = dip;
      }
      const s = Math.max(0, start * hop - (k === 0 ? pad : 0));
      const e = Math.min(x.length, end * hop + (nextPeak ? 0 : win + pad));
      if (e - s > 16) spans.push({ start: s, end: e, wordEnd: !nextPeak });
      start = end;
    });
  });
  // Een lettergreep korter dan het minimum is geen lettergreep maar een
  // aanloop (de "z" van "zon" is een eigen piekje): bij de buur in hetzelfde
  // woord voegen.
  const minLen = minDist * hop;
  for (let i = 0; i < spans.length;) {
    const sp = spans[i]!;
    if (sp.end - sp.start >= minLen || spans.length === 1) { i++; continue; }
    const prev = spans[i - 1], next = spans[i + 1];
    if (!sp.wordEnd && next) { next.start = sp.start; spans.splice(i, 1); }
    else if (prev && !prev.wordEnd) { prev.end = sp.end; prev.wordEnd = sp.wordEnd; spans.splice(i, 1); }
    else i++;
  }

  // Minder gevonden dan gevraagd (twee klinkers zonder dal ertussen, zoals
  // "zon-ne"): de langste lettergreep splitsen op het zwakste punt van zijn
  // middenstuk. Grof, maar het aantal klopt en de editor laat de grens
  // verschuiven. Een echte oplossing is uitlijnen op de tekst (forced
  // alignment); zie doc/plans/zingende-stemmen.md §9.
  while (want > 0 && spans.length > 0 && spans.length < want) {
    let k = 0;
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]!.end - spans[i]!.start > spans[k]!.end - spans[k]!.start) k = i;
    }
    const sp = spans[k]!;
    const len = sp.end - sp.start;
    if (len < 2 * minDist * hop) break;
    // Tussen 40 en 75 %: de beklemtoonde lettergreep met zijn beginmedeklinker
    // is langer dan de onbeklemtoonde die erachteraan komt.
    const fa = Math.ceil((sp.start + 0.4 * len) / hop), fb = Math.floor((sp.start + 0.75 * len) / hop);
    let dip = fa;
    for (let f = fa; f <= fb && f < frames; f++) if (sm[f]! < sm[dip]!) dip = f;
    const cut = dip * hop;
    if (cut <= sp.start + 16 || cut >= sp.end - 16) break;
    spans.splice(k, 1,
      { start: sp.start, end: cut, wordEnd: false },
      { start: cut, end: sp.end, wordEnd: sp.wordEnd });
  }
  return spans;
}

// ── alles samen ────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Tekst per lettergreep, in volgorde; bepaalt ook het verwachte aantal. */
  syllables?: string[];
  /** Vaste grenzen (frames op de bronrate van de opname) in plaats van zelf zoeken. */
  spans?: Span[];
  /** Per lettergreep een met de hand gekozen lus, in frames op de bronrate
   *  relatief aan het begin van de lettergreep; null = zelf zoeken. */
  sustains?: ({ start: number; end: number } | null)[];
  pitch?: PitchOptions;
  split?: SplitOptions;
}

export interface SustainRegion {
  /** Mark-indexen; end <= start = geen kern. */
  start: number;
  end: number;
  /** Hoe goed de lus klinkt, 0..1: gelijkenis van de perioden in de lus. Onder
   *  ~0,8 hoor je de lus (krakende stem, losse pulsen). */
  quality: number;
}

/**
 * Klinkerkern: het stukje waar de stem heen en weer loopt zolang de toets
 * ingedrukt is. Net als de loop-zoeker van de sampler zoeken we een stuk
 * waarin de golfvorm gelijk blijft van vorm: elke periode lijkt op zijn
 * opvolger én de eerste op de laatste (een klank die langzaam verkleurt,
 * zoals de j die in de a van "ja" overgaat, lijkt van periode tot periode wél
 * op zichzelf maar van begin tot eind niet). Volume mag binnen de lus best
 * wat zakken: heen en weer lopen maakt daar een tremolo van, en dat hoort
 * bij zingen. Wat niet mag is de aanzet meenemen (dan wordt aanhouden
 * "jajaja", of een "ie" als de lus in de j blijft hangen), dus de lus begint
 * pas een paar perioden ná het begin van het stemhebbende stuk en ligt
 * liefst rond het midden van de klinker. Lang is goed: hoe langer de lus, hoe
 * minder je het keren hoort.
 */
export function findSustain(data: Float32Array, rate: number, marks: Mark[]): SustainRegion {
  const none = { start: 0, end: 0, quality: 0 };
  if (marks.length < 4) return none;
  const win = Math.round(rate * 0.012);
  const level = marks.map((m) => {
    let e = 0, c = 0;
    for (let i = Math.max(0, m.frame - win); i < Math.min(data.length, m.frame + win); i++) { e += data[i]! * data[i]!; c++; }
    return m.unvoiced || c === 0 ? 0 : Math.sqrt(e / c);
  });
  const peak = Math.max(...level);
  if (peak <= 0) return none;

  /** Gelijkenis van de golf rond mark i met die rond mark j, over één periode van i. */
  const sim = (i: number, j: number): number => {
    const mi = marks[i]!, mj = marks[j]!;
    if (mi.unvoiced || mj.unvoiced) return 0;
    const next = marks[i + 1] ?? marks[i - 1];
    const half = Math.max(4, Math.round(Math.abs((next?.frame ?? mi.frame + 8) - mi.frame) / 2));
    let num = 0, e0 = 0, e1 = 0;
    for (let k = -half; k <= half; k++) {
      const p = mi.frame + k, q = mj.frame + k;
      if (p < 0 || q < 0 || p >= data.length || q >= data.length) continue;
      num += data[p]! * data[q]!; e0 += data[p]! * data[p]!; e1 += data[q]! * data[q]!;
    }
    return e0 > 0 && e1 > 0 ? num / Math.sqrt(e0 * e1) : 0;
  };
  const adjacent = new Float32Array(Math.max(0, marks.length - 1));
  for (let k = 0; k + 1 < marks.length; k++) adjacent[k] = sim(k, k + 1);

  // Het stemhebbende, luide stuk waar de lus in mag: de langste reeks marks
  // die stemhebbend zijn en boven 35 % van de piek blijven.
  const usable = marks.map((m, k) => !m.unvoiced && level[k]! >= 0.35 * peak);
  let runA = -1, runB = -1, cur = -1;
  for (let k = 0; k <= marks.length; k++) {
    const ok = k < marks.length && usable[k];
    if (ok && cur < 0) cur = k;
    if (!ok && cur >= 0) { if (k - cur > runB - runA) { runA = cur; runB = k; } cur = -1; }
  }
  if (runA < 0 || runB - runA < 4) return none;
  const runLen = runB - runA;
  // De aanzet blijft erbuiten: de eerste 3 perioden (of 15 % bij een lange klinker).
  const onset = runA + Math.min(Math.max(3, Math.round(runLen * 0.15)), Math.max(0, runLen - 4));
  const runMid = runA + runLen / 2;

  const MIN = 4, MAX = 40, GOOD = 0.8;
  let best = -Infinity, bestA = 0, bestB = 0, bestQ = 0;
  for (let a = onset; a + MIN - 1 < runB; a++) {
    let adjSum = 0, levelSum = level[a]!;
    for (let b = a + 1; b < runB && b - a + 1 <= MAX; b++) {
      adjSum += adjacent[b - 1]!;
      levelSum += level[b]!;
      const len = b - a + 1;
      if (len < MIN) continue;
      const quality = Math.min(adjSum / (len - 1), sim(a, b));
      const center = 1 - Math.min(1, Math.abs((a + b) / 2 - runMid) / (runLen / 2));
      // Vorm gaat voor; daarna lang, luid en in het midden.
      const score = (quality >= GOOD ? quality : quality - 0.5)
        + 0.006 * Math.min(len, 24) + 0.15 * (levelSum / len / peak) + 0.1 * center;
      if (score > best) { best = score; bestA = a; bestB = b; bestQ = quality; }
    }
  }
  if (best === -Infinity) return none;
  return { start: bestA, end: bestB, quality: Math.max(0, bestQ) };
}

/** Zet een met de hand gekozen lus (frames op `rate`) om naar mark-indexen. */
export function sustainFromFrames(marks: Mark[], start: number, end: number): { start: number; end: number } {
  const nearest = (f: number): number => {
    let best = 0, dist = Infinity;
    marks.forEach((m, k) => { const d = Math.abs(m.frame - f); if (d < dist) { dist = d; best = k; } });
    return best;
  };
  let a = nearest(start), b = nearest(end);
  if (b < a) [a, b] = [b, a];
  // minstens twee perioden, en alleen stemhebbende marks
  while (a < b && marks[a]!.unvoiced) a++;
  while (b > a && marks[b]!.unvoiced) b--;
  return b - a >= 1 ? { start: a, end: b } : { start: 0, end: 0 };
}

/**
 * Van opname naar lettergrepen. `x` is mono op `rate` Hz; het resultaat staat
 * op `LYRIC_RATE`.
 */
export function analyzeRecording(x: Float32Array, rate: number, opt: AnalyzeOptions = {}): SyllableAnalysis[] {
  const y = resample(x, rate, LYRIC_RATE);
  // Normaliseren op de piek: de bank is int16 en een zachte opname verliest anders bits.
  let peak = 0;
  for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]!); if (a > peak) peak = a; }
  if (peak > 1e-6) { const g = 0.9 / peak; for (let i = 0; i < y.length; i++) y[i] = y[i]! * g; }

  const track = trackPitch(y, LYRIC_RATE, opt.pitch);
  const marks = placeMarks(y, LYRIC_RATE, track);
  const count = opt.syllables?.length ?? opt.split?.count ?? 0;
  const spans = opt.spans
    ? opt.spans.map((s) => ({
      start: Math.round((s.start * LYRIC_RATE) / rate), end: Math.round((s.end * LYRIC_RATE) / rate), wordEnd: s.wordEnd,
    }))
    : splitSyllables(y, LYRIC_RATE, track, { ...opt.split, count });

  const fade = Math.round(LYRIC_RATE * 0.004);
  return spans.map((sp, idx) => {
    const data = y.slice(sp.start, sp.end);
    // Niveau per lettergreep gelijktrekken: in gesproken taal zakt het
    // volume naar het eind van een woord, bij zingen wil je elke noot even
    // luid. Op de piek, hooguit 12 dB erbij (anders komt de ruis mee omhoog).
    let top = 0;
    for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]!); if (v > top) top = v; }
    if (top > 1e-4) {
      const g = Math.min(4, 0.8 / top);
      for (let i = 0; i < data.length; i++) data[i] = data[i]! * g;
    }
    // Korte fades op de knip, tegen klikken.
    for (let i = 0; i < fade && i < data.length; i++) {
      const g = i / fade;
      data[i] = data[i]! * g;
      data[data.length - 1 - i] = data[data.length - 1 - i]! * g;
    }
    const own = marks
      .filter((m) => m.frame >= sp.start && m.frame < sp.end)
      .map((m) => ({ frame: m.frame - sp.start, unvoiced: m.unvoiced }));
    if (own.length < 2) {
      // Te kort voor eigen marks: een raster, stemloos.
      own.length = 0;
      const grid = Math.round(LYRIC_RATE * 0.005);
      for (let i = 0; i < data.length; i += grid) own.push({ frame: i, unvoiced: true });
    }
    const f0: number[] = [];
    for (let f = Math.floor(sp.start / track.hop); f < Math.ceil(sp.end / track.hop); f++) {
      const v = track.f0[f];
      if (v !== undefined && v > 0) f0.push(v);
    }
    const wanted = opt.sustains?.[idx];
    const k = LYRIC_RATE / rate;
    const sus = wanted
      ? { ...sustainFromFrames(own, wanted.start * k, wanted.end * k), quality: 1 }
      : findSustain(data, LYRIC_RATE, own);
    return {
      data, rate: LYRIC_RATE, marks: own,
      sustainStart: sus.start, sustainEnd: sus.end, sustainQuality: sus.quality,
      pitchHz: median(f0),
      wordEnd: sp.wordEnd,
      text: opt.syllables?.[idx] ?? '',
      sourceStart: sp.start, sourceEnd: sp.end,
    };
  });
}
