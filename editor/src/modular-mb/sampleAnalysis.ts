// sampleAnalysis — één lange opname ontleden tot een keymap.
//
// Alles hier is puur reken-werk op Float32Array's (geen DOM, geen Web Audio),
// zodat het ook onder node te testen is: tools/mmb-wasm/test-analysis.mjs.
//
// Pijplijn:
//   segmentRecording()  stilte-/onset-detectie → losse aanslagen
//   detectPitch()       YIN op het stabiele deel → grondtoon in Hz
//   measureDecay()      dB-helling na de piek → T60 (twee fasen)
//   findLoop()          periode-gesynchroniseerde correlatie → loop-punten
//   bakeCrossfade()     naad wegvloeien in de sampledata zelf
//   assignVelocityLayers()  per noot op luidheid sorteren → lagen
//
// Analyse draait op de kanaalsom (mono); weergave op alle kanalen. Loop-
// punten zijn frame-indices en gelden dus voor elk kanaal tegelijk.

export interface Segment {
  /** Frame-index in de originele opname. */
  start: number;
  end: number;
  /** Piekamplitude (0..1) en RMS over de eerste 200 ms. */
  peak: number;
  attackRms: number;
}

export interface PitchResult {
  hz: number;
  /** Dichtstbijzijnde MIDI-noot en de afwijking in centen, t.o.v. de gekozen
   *  stemreferentie (A = `tuningHz`; 440 standaard, 432 voor klankschalen). */
  midi: number;
  cents: number;
  /** 0..1; onder ~0.5 is de meting onbetrouwbaar (inharmonisch materiaal). */
  confidence: number;
}

export interface DecayResult {
  /** Tijd tot −60 dB van de snelle eerste fase, en van de trage naklank. */
  fastT60: number;
  slowT60: number;
  /** Frame waar de trage fase begint — het meest stationaire gebied. */
  stableFrom: number;
}

export interface LoopResult {
  start: number;
  end: number;
  /** Genormaliseerde correlatie 0..1; boven ~0.9 klinkt de naad schoon. */
  quality: number;
}

// ── hulpjes ───────────────────────────────────────────────────────────

/** Meng N kanalen (interleaved) naar mono voor de analyse. */
export function toMono(data: Float32Array, channels: number): Float32Array {
  if (channels === 1) return data;
  const frames = Math.floor(data.length / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data[i * channels + c] ?? 0;
    out[i] = s / channels;
  }
  return out;
}

/** RMS-envelope in vensters van `win`, om de `hop` frames. */
export function rmsEnvelope(x: Float32Array, win = 1024, hop = 256): Float32Array {
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * hop;
    for (let j = 0; j < win; j++) { const v = x[base + j] ?? 0; s += v * v; }
    out[i] = Math.sqrt(s / win);
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))]!;
}

// ── 1. segmenteren ────────────────────────────────────────────────────

export interface SegmentOptions {
  /** Minimale lengte van een aanslag (s). */
  minLength?: number;
  /** Minimale stilte tussen twee aanslagen (s). */
  minGap?: number;
  /** Aanzet-drempel t.o.v. de piek van de hele opname (dB). */
  onDb?: number;
  /** Uitzet-drempel (dB), lager dan onDb → hysterese. */
  offDb?: number;
  /** Voorloop vóór de aanzet (s), zodat de attack niet afgekapt wordt. */
  preRoll?: number;
}

/**
 * Splits één lange opname in losse aanslagen. Werkt op stilte tussen de noten
 * (het "speel, laat uitklinken, wacht"-patroon) en detecteert daarnaast een
 * scherpe energiestijging binnen een lopend segment, voor het geval er te
 * kort gewacht is.
 */
export function segmentRecording(
  mono: Float32Array, sr: number, opts: SegmentOptions = {},
): Segment[] {
  const hop = 256, win = 1024;
  const env = rmsEnvelope(mono, win, hop);
  if (!env.length) return [];

  const minLength = (opts.minLength ?? 0.15) * sr;
  const minGap    = (opts.minGap ?? 0.25) * sr;
  const preRoll   = Math.round((opts.preRoll ?? 0.02) * sr);
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  if (peak <= 0) return [];

  const noise = Math.max(percentile(env, 0.1), peak * 1e-5);
  const onThr  = Math.max(peak * Math.pow(10, (opts.onDb ?? -42) / 20), noise * 6);
  const offThr = Math.max(peak * Math.pow(10, (opts.offDb ?? -58) / 20), noise * 2.5);

  const segs: Segment[] = [];
  let active = false, startFrame = 0, quietFrames = 0;
  const gapHops = Math.max(1, Math.round(minGap / hop));

  for (let i = 0; i < env.length; i++) {
    const level = env[i]!;
    const frame = i * hop;
    if (!active) {
      if (level > onThr) { active = true; startFrame = Math.max(0, frame - preRoll); quietFrames = 0; }
      continue;
    }
    // Nieuwe aanslag terwijl de vorige nog naklinkt: scherpe stijging.
    const prev = env[i - 1] ?? 0;
    if (i > 2 && level > onThr && prev > 0 && level > prev * 3.5 && frame - startFrame > minLength) {
      segs.push(makeSegment(mono, sr, startFrame, frame));
      startFrame = Math.max(0, frame - preRoll);
      quietFrames = 0;
      continue;
    }
    if (level < offThr) {
      quietFrames++;
      if (quietFrames >= gapHops) {
        const end = frame - (quietFrames - 1) * hop;
        if (end - startFrame >= minLength) segs.push(makeSegment(mono, sr, startFrame, end));
        active = false; quietFrames = 0;
      }
    } else {
      quietFrames = 0;
    }
  }
  if (active) {
    const end = mono.length;
    if (end - startFrame >= minLength) segs.push(makeSegment(mono, sr, startFrame, end));
  }
  return segs;
}

function makeSegment(mono: Float32Array, sr: number, start: number, end: number): Segment {
  let peak = 0, sum = 0;
  const attackEnd = Math.min(end, start + Math.round(0.2 * sr));
  for (let i = start; i < end; i++) { const a = Math.abs(mono[i] ?? 0); if (a > peak) peak = a; }
  for (let i = start; i < attackEnd; i++) { const v = mono[i] ?? 0; sum += v * v; }
  const n = Math.max(1, attackEnd - start);
  return { start, end, peak, attackRms: Math.sqrt(sum / n) };
}

// ── 2. toonhoogte (YIN) ───────────────────────────────────────────────

/**
 * YIN op een venster in het *stabiele* deel van de klank (niet de attack —
 * die is te ruisig). `minHz`/`maxHz` begrenzen de zoekruimte.
 */
export function detectPitch(
  mono: Float32Array, sr: number, from: number, to: number,
  minHz = 25, maxHz = 2200, tuningHz = 440,
): PitchResult {
  // Venster net na de aanslag, waar de klank het stabielst is.
  const len = to - from;
  const winStart = from + Math.min(Math.round(0.08 * sr), Math.round(len * 0.15));
  const W = Math.min(4096, Math.max(1024, to - winStart - 8));
  const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(W / 2));
  const tauMin = Math.max(2, Math.floor(sr / maxHz));
  if (winStart + W + tauMax >= mono.length || tauMax <= tauMin) {
    return { hz: 0, midi: -1, cents: 0, confidence: 0 };
  }

  // Verschilfunctie + cumulatieve gemiddelde normalisatie (YIN stap 1–3).
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const a = mono[winStart + j] ?? 0;
      const b = mono[winStart + j + tau] ?? 0;
      const diff = a - b;
      s += diff * diff;
    }
    d[tau] = s;
  }
  const dn = new Float32Array(tauMax + 1);
  dn[0] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += d[tau]!;
    dn[tau] = running > 0 ? (d[tau]! * (tau - tauMin + 1)) / running : 1;
  }

  // Eerste dal onder de drempel (YIN stap 4); anders het globale minimum.
  const threshold = 0.15;
  let best = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (dn[tau]! < threshold && dn[tau]! <= dn[tau + 1]!) { best = tau; break; }
  }
  if (best < 0) {
    let mv = Infinity;
    for (let tau = tauMin + 1; tau < tauMax; tau++) if (dn[tau]! < mv) { mv = dn[tau]!; best = tau; }
  }
  if (best <= 0) return { hz: 0, midi: -1, cents: 0, confidence: 0 };

  // Parabolische verfijning rond het dal (YIN stap 5).
  const y0 = dn[best - 1] ?? dn[best]!, y1 = dn[best]!, y2 = dn[best + 1] ?? dn[best]!;
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom !== 0 ? (y2 - y0) / denom : 0;
  const period = best + Math.max(-1, Math.min(1, shift));
  const hz = sr / period;
  const midiF = hzToMidi(hz, tuningHz);
  const midi = Math.round(midiF);
  return {
    hz,
    midi,
    cents: Math.round((midiF - midi) * 100),
    confidence: Math.max(0, Math.min(1, 1 - y1)),
  };
}

/**
 * Octaaffouten repareren met de volgorde van de opname. Speel je oplopend
 * (C1 … C5, drie aanslagen per noot), dan is een uitschieter van precies een
 * octaaf tussen kloppende buren bijna zeker een detectiefout — vooral bij
 * inharmonisch materiaal (klokken, klankschalen), waar de gehoorde grondtoon
 * fysiek niet in het spectrum hoeft te zitten.
 *
 * @param layersPerNote  aantal aanslagen per noot (3 = zacht/midden/hard)
 * @returns gecorrigeerde MIDI-noten; `changed` telt de reparaties.
 */
export function enforceAscending(
  pitches: PitchResult[], layersPerNote: number,
): { midi: number[]; changed: number } {
  const midi = pitches.map((p) => p.midi);
  if (layersPerNote < 1 || midi.length < 3) return { midi, changed: 0 };
  let changed = 0;

  // 1. Binnen één groep aanslagen hoort dezelfde noot: neem de mediaan.
  for (let g = 0; g + layersPerNote <= midi.length; g += layersPerNote) {
    const group = midi.slice(g, g + layersPerNote).filter((m) => m >= 0);
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    for (let i = g; i < g + layersPerNote; i++) {
      if (midi[i] !== median) { midi[i] = median; changed++; }
    }
  }

  // 2. Groepen moeten oplopen; een octaafsprong die daarna weer terugspringt
  //    is een fout. Corrigeer naar het octaaf dat in de reeks past.
  const groups: number[] = [];
  for (let g = 0; g < midi.length; g += layersPerNote) groups.push(midi[g] ?? -1);
  for (let i = 1; i < groups.length - 1; i++) {
    const prev = groups[i - 1]!, cur = groups[i]!, next = groups[i + 1]!;
    if (prev < 0 || cur < 0 || next < 0) continue;
    if (cur > prev && cur < next) continue;                 // loopt netjes op
    const target = Math.round((prev + next) / 2);
    const diff = cur - target;
    if (diff !== 0 && Math.abs(diff) % 12 === 0) {          // hele octaven
      groups[i] = cur - diff;
      for (let k = 0; k < layersPerNote; k++) {
        const idx = i * layersPerNote + k;
        if (idx < midi.length) { midi[idx] = groups[i]!; changed++; }
      }
    }
  }
  return { midi, changed };
}

/** Frequentie → (fractionele) MIDI-noot bij stemreferentie `tuningHz`. */
export function hzToMidi(hz: number, tuningHz = 440): number {
  return 69 + 12 * Math.log2(hz / tuningHz);
}
export interface SpectralPeak { hz: number; db: number }

/**
 * Sterkste spectrale pieken vlak na de aanslag (FFT van 32k punten,
 * parabolisch verfijnd), gesorteerd van luid naar zacht; `db` is relatief
 * aan de luidste. Pieken binnen ±3 % van elkaar tellen als één.
 */
export function spectralPeaks(
  mono: Float32Array, sr: number, from: number, to: number,
  minHz = 60, maxHz = 8000, top = 6,
): SpectralPeak[] {
  const n = 32768;
  const start = from + Math.min(Math.round(0.08 * sr), Math.round((to - from) * 0.15));
  if (start + 1024 > mono.length) return [];
  const re = new Float64Array(n), im = new Float64Array(n);
  const avail = Math.min(n, mono.length - start);
  for (let i = 0; i < avail; i++) re[i] = mono[start + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / avail));
  fftInPlace(re, im);
  const mag = new Float64Array(n >> 1);
  for (let k = 0; k < (n >> 1); k++) mag[k] = Math.hypot(re[k]!, im[k]!);
  const kMin = Math.max(2, Math.floor((minHz * n) / sr)), kMax = Math.min((n >> 1) - 2, Math.ceil((maxHz * n) / sr));
  const cands: { k: number; m: number }[] = [];
  for (let k = kMin; k <= kMax; k++) if (mag[k]! > mag[k - 1]! && mag[k]! >= mag[k + 1]!) cands.push({ k, m: mag[k]! });
  cands.sort((a, b) => b.m - a.m);
  const sel: { k: number; m: number }[] = [];
  for (const c of cands) {
    if (sel.every((s) => Math.abs(c.k - s.k) > s.k * 0.03)) sel.push(c);
    if (sel.length >= top) break;
  }
  if (!sel.length) return [];
  const mx = sel[0]!.m;
  return sel.map(({ k, m }) => {
    // Parabolische interpolatie rond de piek — anders zit je aan de bin-resolutie vast (1,3 Hz bij 44,1 kHz).
    const a = mag[k - 1]!, c = mag[k + 1]!;
    const delta = (a - c) / (2 * (a - 2 * m + c) || 1);
    return { hz: ((k + (Number.isFinite(delta) ? delta : 0)) * sr) / n, db: 20 * Math.log10(m / mx) };
  });
}

function peakToPitch(p: SpectralPeak | undefined, confidence: number, tuningHz: number): PitchResult {
  if (!p) return { hz: 0, midi: -1, cents: 0, confidence: 0 };
  const m = hzToMidi(p.hz, tuningHz);
  const midi = Math.round(m);
  return { hz: p.hz, midi, cents: (m - midi) * 100, confidence: Math.max(0, Math.min(1, confidence)) };
}

/**
 * Toonhoogte als de **sterkste partiaal** — voor klokken, bellen en
 * klankschalen. YIN zoekt een periode, en bij inharmonisch materiaal is dat
 * vaak een gemeenschappelijke subharmonische van een paar partialen: een
 * octaaf of meer onder wat je hoort. Bij een kleine bel of een klankschaal
 * is de toon die je hoort domweg de luidste piek in het spectrum.
 * `confidence` is de voorsprong van die piek op de op-één-na sterkste
 * (1,0 bij ≥ 20 dB).
 */
export function detectPeakPitch(
  mono: Float32Array, sr: number, from: number, to: number,
  minHz = 60, maxHz = 8000, tuningHz = 440,
): PitchResult {
  const pk = spectralPeaks(mono, sr, from, to, minHz, maxHz, 2);
  return peakToPitch(pk[0], pk.length > 1 ? -pk[1]!.db / 20 : 1, tuningHz);
}

/**
 * Toonhoogtes voor een hele reeks aanslagen van een **gestemd slaginstrument**
 * — handpan, tongue drum, tabla. Twee dingen die daar anders zijn dan bij een
 * bel:
 *
 * 1. **Eén lichaamsresonantie klinkt onder élke slag** (bij een handpan de
 *    ding/luchtresonantie, hier 143 Hz). Bij een zachte slag is die zelfs de
 *    luidste piek, en dan "hoort" een detector overal dezelfde noot. Een piek
 *    die in het merendeel van de aanslagen voorkomt is het instrument, niet de
 *    noot — die sluiten we uit, tenzij er niets anders van betekenis is (de
 *    ding zélf).
 * 2. **Elk klankveld is gestemd met grondtoon, octaaf en kwint.** De luidste
 *    piek is vaak het octaaf, niet de grondtoon. De noot is daarom de laagste
 *    sterke piek die een partner op 2× heeft.
 *
 * Een zachte slag waar de grondtoon onder de resonantie wegvalt neemt de noot
 * van zijn buur (dezelfde slag, zacht en hard na elkaar) als die grondtoon of
 * zijn octaaf in het eigen spectrum terug te vinden is.
 */
export function pitchesRejectingDrone(
  peakLists: SpectralPeak[][], tuningHz = 440, minDb = -24,
): PitchResult[] {
  const segs = peakLists.length;
  const near = (a: number, b: number, tol = 0.045): boolean => Math.abs(Math.log2(a / b)) < tol;
  // Resonanties: pieken (≥ minDb) die in ≥ 60 % van de aanslagen terugkomen.
  const clusters: { hz: number; count: number }[] = [];
  for (const list of peakLists) {
    const seen = new Set<number>();
    for (const p of list) {
      if (p.db < minDb) continue;
      let c = clusters.findIndex((x) => near(p.hz, x.hz));
      if (c < 0) { clusters.push({ hz: p.hz, count: 0 }); c = clusters.length - 1; }
      if (!seen.has(c)) { clusters[c]!.count++; seen.add(c); }
    }
  }
  const drones = segs >= 4 ? clusters.filter((c) => c.count >= Math.max(3, Math.ceil(segs * 0.6))) : [];
  const isDrone = (hz: number): boolean => drones.some((d) => near(hz, d.hz));

  const picks: { peak: SpectralPeak | undefined; conf: number }[] = peakLists.map((list) => {
    const strong = list.filter((p) => p.db >= minDb);
    const hasOctave = (p: SpectralPeak): boolean => strong.some((q) => near(q.hz, 2 * p.hz, 0.06));
    const cands = strong.filter((p) => !isDrone(p.hz) && hasOctave(p));
    if (cands.length) {
      // Laagste kandidaat binnen 12 dB van de sterkste: de grondtoon, niet het
      // octaaf. Niet ruimer: dan winnen de buurvelden die sympathisch
      // meetrillen (op de handpan stond A3 15 dB onder een Bb3-slag).
      const top = Math.max(...cands.map((c) => c.db));
      const pick = cands.filter((c) => c.db >= top - 12).sort((a, b) => a.hz - b.hz)[0]!;
      return { peak: pick, conf: Math.max(0, Math.min(1, 1 + pick.db / 20)) };
    }
    // Niets buiten de resonantie: dan is de resonantie de noot (de ding).
    const withOct = strong.find(hasOctave);
    return { peak: withOct ?? list[0], conf: withOct ? 0.5 : 0.2 };
  });

  // Zwakke keuzes: kijk bij de buren (zachte en harde slag van hetzelfde veld).
  for (let i = 0; i < segs; i++) {
    const me = picks[i]!;
    if (me.conf >= 0.5 || !me.peak) continue;
    for (const j of [i + 1, i - 1]) {
      const nb = picks[j];
      if (!nb?.peak || nb.conf < 0.5 || isDrone(nb.peak.hz)) continue;
      const f = nb.peak.hz;
      const echo = peakLists[i]!.find((p) => near(p.hz, f, 0.06) || near(p.hz, 2 * f, 0.06));
      if (echo) { picks[i] = { peak: { hz: near(echo.hz, f, 0.06) ? echo.hz : echo.hz / 2, db: echo.db }, conf: 0.5 }; break; }
    }
  }
  return picks.map((p) => peakToPitch(p.peak, p.conf, tuningHz));
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j]!, ui = im[i + j]!;
        const xr = re[i + j + len / 2]!, xi = im[i + j + len / 2]!;
        const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** MIDI-noot → frequentie bij stemreferentie `tuningHz`. */
export function midiToHz(midi: number, tuningHz = 440): number {
  return tuningHz * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parseer een lijst verwachte noten: "C1 C2 C3 C4 C5", "36,48,60" of een
 * bereik met stap ("C1..C5/12" = elke octaaf). Namen volgen de conventie
 * C4 = 60. Onbekende tekens worden overgeslagen.
 */
export function parseNoteList(text: string): number[] {
  const out: number[] = [];
  const one = (tok: string): number | null => {
    const t = tok.trim();
    if (!t) return null;
    if (/^-?\d+$/.test(t)) return Number(t);
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(t);
    if (!m) return null;
    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]!.toLowerCase()]!;
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + base + acc;
  };
  for (const part of text.split(/[\s,;]+/)) {
    const range = /^(.+?)\.\.(.+?)(?:\/(\d+))?$/.exec(part);
    if (range) {
      const a = one(range[1]!), b = one(range[2]!);
      const step = range[3] ? Number(range[3]) : 1;
      if (a !== null && b !== null && step > 0) {
        for (let n = a; a <= b ? n <= b : n >= b; n += a <= b ? step : -step) out.push(n);
      }
      continue;
    }
    const v = one(part);
    if (v !== null) out.push(v);
  }
  return out;
}

/**
 * Hermeet de toonhoogte met de zoekruimte beperkt tot ±`semitones` rond een
 * *bekende* noot. Nodig zodra je de noten van tevoren opgeeft: vrije YIN
 * grijpt bij inharmonisch materiaal (klokken, klankschalen, modale
 * resonatoren) makkelijk een octaaf mis, en dan is de gemeten afwijking geen
 * stemming maar een verkeerde noot. Met de zoekruimte dichtgeknepen levert
 * dit wél een bruikbare afwijking in centen.
 */
export function refinePitchNear(
  mono: Float32Array, sr: number, from: number, to: number,
  midi: number, tuningHz = 440, semitones = 6,
): PitchResult {
  const centre = midiToHz(midi, tuningHz);
  const lo = centre * Math.pow(2, -semitones / 12);
  const hi = centre * Math.pow(2, semitones / 12);
  const p = detectPitch(mono, sr, from, to, lo, hi, tuningHz);
  if (p.hz <= 0) return { hz: 0, midi, cents: 0, confidence: 0 };
  return { ...p, midi, cents: Math.round(1200 * Math.log2(p.hz / centre)) };
}

/**
 * Stemcorrectie voor één zone, in centen. Een afwijking van meer dan een
 * halve toon betekent dat de *detectie* een andere noot zag — niet dat het
 * instrument zo ver ontstemd is. Zulke waarden negeren we, anders verschuift
 * het sample octaven (de klassieke valkuil bij inharmonisch materiaal).
 */
export function safeTuneCents(cents: number, confidence = 1): number {
  if (!Number.isFinite(cents) || Math.abs(cents) > 50 || confidence < 0.35) return 0;
  return -cents;
}

/**
 * Leg de noten van tevoren vast in plaats van ze te detecteren: handig bij
 * inharmonisch materiaal (klokken, klankschalen) waar de gehoorde grondtoon
 * fysiek niet in het spectrum hoeft te zitten. `expected` is één noot per
 * *groep* aanslagen; met `layersPerNote` = 3 hoort C1 C2 C3 bij negen
 * segmenten. Ontbreken er noten, dan blijft de detectie voor de rest staan.
 */
export function applyExpectedNotes(
  pitches: PitchResult[], expected: number[], layersPerNote: number,
): number[] {
  return pitches.map((p, i) => {
    const group = Math.floor(i / Math.max(1, layersPerNote));
    const want = expected[group];
    return want === undefined ? p.midi : want;
  });
}

// ── 3. uitstervingskromme ─────────────────────────────────────────────

/**
 * Meet het verval in dB/s. Een piano dooft in twee fasen: een snelle val en
 * daarna een veel tragere naklank. We passen beide apart en geven het frame
 * waar de trage fase begint — dat is het meest stationaire gebied en dus de
 * plek voor een eventueel loop-punt.
 */
export function measureDecay(mono: Float32Array, sr: number, from: number, to: number): DecayResult {
  const hop = 256;
  const seg = mono.subarray(from, to);
  const env = rmsEnvelope(seg, 1024, hop);
  if (env.length < 8) return { fastT60: 0, slowT60: 0, stableFrom: from };
  let peak = 0, peakIdx = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > peak) { peak = env[i]!; peakIdx = i; }
  if (peak <= 0) return { fastT60: 0, slowT60: 0, stableFrom: from };

  // Bovenomhullende: lopend maximum over ~150 ms. Bellen en klankschalen
  // zwevingen — twee partialen vlak bij elkaar — en dan golft de RMS met
  // tientallen dB op en neer. Een rechte-lijn-fit door zo'n golf geeft
  // willekeur (0,2 s of 180 s, allebei gezien). De bovenomhullende zakt
  // monotoon en volgt de échte uitsterving.
  const span = Math.max(1, Math.round((0.15 * sr) / hop));
  const top = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let m = 0;
    for (let k = Math.max(0, i - span); k <= Math.min(env.length - 1, i + span); k++) if (env[k]! > m) m = env[k]!;
    top[i] = m;
  }
  const db = (v: number): number => 20 * Math.log10(Math.max(v, peak * 1e-6) / peak);
  // Ruisvloer: het niveau aan het eind van het segment. Daaronder meten heeft geen zin.
  const floorDb = db(top[env.length - 1]!);

  /** Tijd (s) na de piek waarop de bovenomhullende voor het eerst onder `level` dB komt; −1 = nooit. */
  const crossing = (level: number): number => {
    for (let i = peakIdx; i < env.length; i++) if (db(top[i]!) < level) return ((i - peakIdx) * hop) / sr;
    return -1;
  };
  /**
   * T60 uit twee drempels: helling tussen hun kruisingen, doorgetrokken naar
   * −60 dB. De onderste drempel wordt boven de ruisvloer gehouden — een
   * opname die is afgekapt terwijl de bel nog op −20 dB stond (komt voor:
   * "trimmed") levert dan de helling over het stuk dat er wél is, in plaats
   * van niets of onzin.
   */
  const t60From = (hi: number, wantLo: number): number => {
    const lo = Math.max(wantLo, floorDb + 3);
    if (hi - lo < 4) return 0;                     // te weinig bereik om een helling te zien
    const tHi = crossing(hi), tLo = crossing(lo);
    if (tHi < 0 || tLo <= tHi) return 0;
    return ((tLo - tHi) * 60) / (hi - lo);
  };

  // Snelle fase: −3 → −14 dB. Trage fase: −16 → −40 dB, of zo diep als de opname reikt.
  const fastT60 = t60From(-3, -14);
  let slowT60 = t60From(-16, -40);
  if (!slowT60) slowT60 = t60From(-8, -40);
  if (!slowT60) slowT60 = t60From(-3, -40);
  if (!slowT60) slowT60 = t60From(-1, -40);
  // Laatste redmiddel: de hele beschikbare val, van de piek tot het eind.
  // Een bel die in 4,4 s maar 11 dB zakt, is geen bel zonder uitsterving —
  // het is een bel van ~24 s waarvan we 4,4 s hebben.
  if (!slowT60 && floorDb < -3 && env.length - 1 > peakIdx) {
    slowT60 = (((env.length - 1 - peakIdx) * hop) / sr) * (60 / -floorDb);
  }
  let stable = peakIdx;
  for (let i = peakIdx; i < env.length; i++) { if (db(top[i]!) < -14) { stable = i; break; } }
  return { fastT60, slowT60: slowT60 || fastT60, stableFrom: from + stable * hop };
}

// ── 4. loop zoeken ────────────────────────────────────────────────────

/**
 * Zoek een loop van een geheel aantal perioden in het stabiele deel. Dat de
 * looplengte een veelvoud van de periode is, is de truc die dit probleem
 * klein maakt: alleen dan sluit de golfvorm op zichzelf aan.
 *
 * @param hz  grondtoon (uit detectPitch); 0 → periode-vrij zoeken (klokken,
 *            klankschalen), met een lange loop en veel crossfade.
 */
export function findLoop(
  mono: Float32Array, sr: number, from: number, to: number, hz: number,
): LoopResult | null {
  const region = to - from;
  if (region < sr * 0.2) return null;
  const W = Math.min(Math.round(sr * 0.05), Math.floor(region / 6));   // vergelijkvenster
  if (W < 64) return null;

  // Loop-eind achterin het stabiele deel, met wat marge.
  const loopEnd = to - Math.round(sr * 0.02);
  const period = hz > 0 ? sr / hz : 0;

  const corr = (aEnd: number, bEnd: number): number => {
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < W; i++) {
      const a = mono[aEnd - W + i] ?? 0;
      const b = mono[bEnd - W + i] ?? 0;
      sab += a * b; saa += a * a; sbb += b * b;
    }
    const d = Math.sqrt(saa * sbb);
    return d > 0 ? sab / d : 0;
  };

  let bestStart = -1, bestQ = -1;
  if (period >= 2) {
    // Kandidaat-looplengtes: N perioden. De loop moet minstens zo lang zijn
    // als het vergelijkvenster (anders overlappen de twee vensters elkaar en
    // is de score betekenisloos) én minstens ~80 ms, want korte loops gaan
    // hoorbaar "toeteren".
    const minLen = Math.max(W, Math.round(sr * 0.08));
    const nMin = Math.max(1, Math.ceil(minLen / period));
    const nMax = Math.floor(Math.min(region * 0.6, sr * 0.8) / period);
    for (let n = nMin; n <= nMax; n++) {
      const start = loopEnd - Math.round(n * period);
      if (start - W < from) break;
      const q = corr(start, loopEnd);
      if (q > bestQ) { bestQ = q; bestStart = start; }
    }
    // Fijnafstemming ±½ periode rond de winnaar.
    if (bestStart > 0) {
      const span = Math.max(2, Math.round(period / 2));
      for (let o = -span; o <= span; o++) {
        const s = bestStart + o;
        if (s - W < from || s >= loopEnd) continue;
        const q = corr(s, loopEnd);
        if (q > bestQ) { bestQ = q; bestStart = s; }
      }
    }
  } else {
    // Inharmonisch (klok, klankschaal): grof rasteren over lange loops.
    const step = Math.max(1, Math.round(sr * 0.005));
    for (let s = from + W; s < loopEnd - Math.max(W, sr * 0.2); s += step) {
      const q = corr(s, loopEnd);
      if (q > bestQ) { bestQ = q; bestStart = s; }
    }
  }
  if (bestStart < 0) return null;

  // Naar een opgaande nuldoorgang schuiven (beide punten dezelfde richting).
  const snap = (idx: number): number => {
    for (let o = 0; o < 64; o++) {
      for (const s of [idx - o, idx + o]) {
        if (s <= from || s >= to - 1) continue;
        if ((mono[s - 1] ?? 0) <= 0 && (mono[s] ?? 0) > 0) return s;
      }
    }
    return idx;
  };
  const start = snap(bestStart);
  const end = snap(loopEnd);
  if (end - start < W) return null;
  return { start, end, quality: Math.max(0, Math.min(1, bestQ)) };
}

/**
 * Vloei de loop-naad weg in de sampledata zelf: de laatste `fade` frames vóór
 * `loopEnd` worden overgevloeid met het materiaal vóór `loopStart`. Daardoor
 * hoeft de speler (en dus de firmware) niets extra's te doen. Werkt in-place
 * op interleaved data en houdt alle kanalen synchroon.
 */
export function bakeCrossfade(
  data: Float32Array, channels: number, loopStart: number, loopEnd: number, fade: number,
): void {
  const f = Math.min(fade, loopStart, Math.floor((loopEnd - loopStart) / 2));
  if (f <= 1) return;
  for (let i = 0; i < f; i++) {
    const t = i / f;                       // 0 → 1 over de fade
    const g = Math.cos((1 - t) * Math.PI * 0.5);   // gelijk-vermogen
    const h = Math.cos(t * Math.PI * 0.5);
    const dst = (loopEnd - f + i) * channels;
    const src = (loopStart - f + i) * channels;
    for (let c = 0; c < channels; c++) {
      const a = data[dst + c] ?? 0;
      const b = data[src + c] ?? 0;
      data[dst + c] = a * h + b * g;
    }
  }
}

// ── 5. velocity-lagen ─────────────────────────────────────────────────

export interface LayeredSample {
  segment: Segment;
  pitch: PitchResult;
  /** 0 = zachtst. */
  layer: number;
  lowVel: number;
  highVel: number;
}

/**
 * Groepeer segmenten per noot en verdeel ze binnen elke groep op luidheid
 * over `layers` velocity-banden. Luidheid = RMS over de attack (perceptueel
 * dichter bij "hoe hard sloeg je aan" dan de piek).
 *
 * De niveaus zelf blijven ongemoeid: één opname, één gain, dus de onderlinge
 * dynamiek klopt al. Normaliseer je per sample, dan is die weg.
 */
export function assignVelocityLayers(
  items: { segment: Segment; pitch: PitchResult }[], layers: number,
): LayeredSample[] {
  const byNote = new Map<number, { segment: Segment; pitch: PitchResult }[]>();
  for (const it of items) {
    const key = it.pitch.midi;
    const arr = byNote.get(key);
    if (arr) arr.push(it); else byNote.set(key, [it]);
  }
  const out: LayeredSample[] = [];
  for (const group of byNote.values()) {
    const sorted = [...group].sort((a, b) => a.segment.attackRms - b.segment.attackRms);
    const n = Math.max(1, Math.min(layers, sorted.length));
    sorted.forEach((it, i) => {
      const layer = Math.min(n - 1, Math.floor((i * n) / sorted.length));
      const lowVel = layer === 0 ? 1 : Math.round((layer * 127) / n) + 1;
      const highVel = layer === n - 1 ? 127 : Math.round(((layer + 1) * 127) / n);
      out.push({ ...it, layer, lowVel, highVel });
    });
  }
  return out.sort((a, b) => a.pitch.midi - b.pitch.midi || a.layer - b.layer);
}

/**
 * Verdeel de key-bereiken: elke noot krijgt het gebied tot halverwege de
 * buurnoot, zodat er geen gaten of overlap zijn.
 */
export function spreadKeyRanges(notes: number[]): Map<number, { low: number; high: number }> {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const out = new Map<number, { low: number; high: number }>();
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    out.set(n, {
      low:  prev === undefined ? 0   : Math.floor((prev + n) / 2) + 1,
      high: next === undefined ? 127 : Math.floor((n + next) / 2),
    });
  });
  return out;
}
