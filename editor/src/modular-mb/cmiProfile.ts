// CMI-profiel (Page 4 van de Fairlight CMI, doc/plans/fairlight.md): tot 32
// harmonischen × 32 segmenten, plus een DURATION- en een ENERGY-curve over
// de segmenten. Zuiver: geen React, geen engine.
//
//   • Opslag in de patch (`patch.moduleData[moduleId].cmi`) als base64 van
//     1 + 1024 + 32 + 32 bytes: versie, de niveaus (0..255) per harmonische
//     per segment, de duur (128 = 1×, ±32 per octaaf) en de energie (0..255).
//   • `computeTable` doet wat COMPUTE op de CMI deed: per segment een
//     golfvorm van 128 samples als som van sinussen; daarna de 32 duur-
//     factoren (×1000) en energieniveaus (0..32767). Samen 4160 waarden, het
//     formaat van de stem tp_mmb_cmi (mmb_dsp/cmi.h).
//   • `harmonicsOf` analyseert één periode (een getekende golf, Page 6) naar
//     32 harmonischen: de brug naar Page 4.

export const H = 32, SEG = 32, SAMPLES = 128;
export const TABLE_LENGTH = SEG * SAMPLES + 2 * SEG;
export const CMI_TYPE = 'tp_mmb_cmi';

export interface CmiProfile {
  /** Niveau 0..1 van harmonische h (0-based) in segment s: `levels[h * SEG + s]`. */
  levels: Float32Array;
  /** Duurfactor per segment (1 = de Seg-knop), 1/16..16. */
  duration: Float32Array;
  /** Volume per segment, 0..1. */
  energy: Float32Array;
}

export function emptyProfile(): CmiProfile {
  return { levels: new Float32Array(H * SEG), duration: new Float32Array(SEG).fill(1), energy: new Float32Array(SEG).fill(1) };
}
export const level = (p: CmiProfile, h: number, s: number): number => p.levels[h * SEG + s]!;

// ── opslag ────────────────────────────────────────────────────────────────
const VERSION = 1;
const durByte = (f: number): number => Math.max(0, Math.min(255, Math.round(128 + 32 * Math.log2(Math.max(1 / 16, Math.min(16, f))))));
const durOf = (b: number): number => 2 ** ((b - 128) / 32);

export function encodeProfile(p: CmiProfile): string {
  const b = new Uint8Array(1 + H * SEG + 2 * SEG);
  b[0] = VERSION;
  for (let i = 0; i < H * SEG; i++) b[1 + i] = Math.round(255 * Math.max(0, Math.min(1, p.levels[i]!)));
  for (let s = 0; s < SEG; s++) {
    b[1 + H * SEG + s] = durByte(p.duration[s]!);
    b[1 + H * SEG + SEG + s] = Math.round(255 * Math.max(0, Math.min(1, p.energy[s]!)));
  }
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin);
}

export function decodeProfile(text: string | undefined | null): CmiProfile | null {
  if (!text) return null;
  let bin: string;
  try { bin = atob(text); } catch { return null; }
  if (bin.length < 1 + H * SEG + 2 * SEG || bin.charCodeAt(0) !== VERSION) return null;
  const p = emptyProfile();
  for (let i = 0; i < H * SEG; i++) p.levels[i] = bin.charCodeAt(1 + i) / 255;
  for (let s = 0; s < SEG; s++) {
    p.duration[s] = durOf(bin.charCodeAt(1 + H * SEG + s));
    p.energy[s] = bin.charCodeAt(1 + H * SEG + SEG + s) / 255;
  }
  return p;
}

// ── COMPUTE: profiel → golfvormen ─────────────────────────────────────────
const SIN = (() => {
  const t = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) t[i] = Math.sin((2 * Math.PI * i) / SAMPLES);
  return t;
})();

/** 32 golfvormen (int16) + 32 duurfactoren (×1000) + 32 energieniveaus.
 *  Alle segmenten op één gezamenlijke schaal, zodat een segment met minder
 *  harmonischen ook zachter klinkt, zoals op de CMI. */
export function computeTable(p: CmiProfile): Int16Array {
  const waves = new Float32Array(SEG * SAMPLES);
  for (let s = 0; s < SEG; s++) {
    for (let h = 0; h < H; h++) {
      const a = level(p, h, s);
      if (a <= 0) continue;
      const k = h + 1;
      for (let i = 0; i < SAMPLES; i++) waves[s * SAMPLES + i] = waves[s * SAMPLES + i]! + a * SIN[(i * k) % SAMPLES]!;
    }
  }
  let peak = 0;
  for (const v of waves) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? 32000 / peak : 0;
  const out = new Int16Array(TABLE_LENGTH);
  for (let i = 0; i < SEG * SAMPLES; i++) out[i] = Math.round(waves[i]! * scale);
  for (let s = 0; s < SEG; s++) {
    out[SEG * SAMPLES + s] = Math.round(1000 * Math.max(1 / 16, Math.min(16, p.duration[s]!)));
    out[SEG * SAMPLES + SEG + s] = Math.round(32767 * Math.max(0, Math.min(1, p.energy[s]!)));
  }
  return out;
}

// ── morph: twee profielen mengen ──────────────────────────────────────────
/** Profiel op stand t tussen A (0) en B (1): niveaus en energie lineair,
 *  de duur logaritmisch (halverwege 1× en 4× is 2×). Een harmonische
 *  crossfade, zoals je van een morph verwacht. */
export function mixProfiles(a: CmiProfile, b: CmiProfile, t: number): CmiProfile {
  const u = Math.max(0, Math.min(1, t));
  const p = emptyProfile();
  for (let i = 0; i < H * SEG; i++) p.levels[i] = a.levels[i]! + (b.levels[i]! - a.levels[i]!) * u;
  for (let s = 0; s < SEG; s++) {
    p.energy[s] = a.energy[s]! + (b.energy[s]! - a.energy[s]!) * u;
    p.duration[s] = 2 ** (Math.log2(a.duration[s]!) + (Math.log2(b.duration[s]!) - Math.log2(a.duration[s]!)) * u);
  }
  return p;
}

// ── Page 6 → Page 4: een periode analyseren ───────────────────────────────
/** Amplitudes van harmonische 1..32 in één periode (DFT), genormaliseerd op
 *  de sterkste. */
export function harmonicsOf(cycle: ArrayLike<number>): Float32Array {
  const n = cycle.length;
  const out = new Float32Array(H);
  if (n < 2) return out;
  for (let k = 1; k <= H && k < n / 2; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const w = (2 * Math.PI * k * i) / n;
      re += cycle[i]! * Math.cos(w);
      im -= cycle[i]! * Math.sin(w);
    }
    out[k - 1] = Math.hypot(re, im) * 2 / n;
  }
  const max = Math.max(...out);
  if (max > 0) for (let k = 0; k < H; k++) out[k] = out[k]! / max;
  return out;
}

/** Een vlak profiel (elk segment gelijk) uit een rij harmonischen. */
export function profileFromHarmonics(harm: ArrayLike<number>): CmiProfile {
  const p = emptyProfile();
  for (let h = 0; h < H; h++) for (let s = 0; s < SEG; s++) p.levels[h * SEG + s] = harm[h] ?? 0;
  return p;
}

// ── startpunten ────────────────────────────────────────────────────────────
export type PresetId = 'brass' | 'saw' | 'square' | 'organ' | 'strings' | 'choir' | 'bell';
export const PRESETS: readonly { id: PresetId; nl: string; en: string }[] = [
  { id: 'brass', nl: 'koper', en: 'brass' },
  { id: 'saw', nl: 'zaag', en: 'saw' },
  { id: 'square', nl: 'vierkant', en: 'square' },
  { id: 'organ', nl: 'orgel', en: 'organ' },
  { id: 'strings', nl: 'strijkers', en: 'strings' },
  { id: 'choir', nl: 'koor', en: 'choir' },
  { id: 'bell', nl: 'klok', en: 'bell' },
];

/** Een startprofiel. `brass` is ook wat de stem zonder profiel speelt. */
export function preset(id: PresetId): CmiProfile {
  const p = emptyProfile();
  const set = (f: (k: number, t: number) => number): void => {
    for (let h = 0; h < H; h++) for (let s = 0; s < SEG; s++) p.levels[h * SEG + s] = Math.max(0, Math.min(1, f(h + 1, s / (SEG - 1))));
  };
  switch (id) {
    case 'brass':
      // Zoals de ingebouwde klank van de stem: heldere aanzet, de hogere zakken weg.
      set((k, t) => (1 / k) * Math.exp(-t * 0.35 * (k - 1)));
      break;
    case 'saw': set((k) => 1 / k); break;
    case 'square': set((k) => (k % 2 ? 1 / k : 0)); break;
    case 'organ': {
      const bars: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.6, 4: 0.7, 6: 0.4, 8: 0.5, 10: 0.2, 12: 0.25, 16: 0.2 };
      set((k) => bars[k] ?? 0);
      break;
    }
    case 'strings':
      // Zaag die langzaam opengaat; energie zwelt aan.
      set((k, t) => (1 / k) * Math.min(1, 0.3 + t * 1.4) * Math.exp(-(k - 1) * (0.25 - 0.18 * t)));
      for (let s = 0; s < SEG; s++) p.energy[s] = Math.min(1, 0.25 + (s / 8));
      break;
    case 'choir':
      // Twee formantgebieden (rond harmonische 3–5 en 8–11) op een zachte basis.
      set((k, t) => 0.15 / k + 0.9 * Math.exp(-(((k - 4) / 1.5) ** 2)) + 0.5 * Math.exp(-(((k - 9.5) / 1.8) ** 2)) * (0.7 + 0.3 * Math.sin(t * 6)));
      for (let s = 0; s < SEG; s++) p.energy[s] = Math.min(1, 0.2 + s / 10);
      break;
    case 'bell':
      // Hoge harmonischen sterven snel, de grondtoon en de 2e/3e/5e/7e lang.
      set((k, t) => ([1, 2, 3, 5, 7].includes(k) ? 1 / Math.sqrt(k) : 0.5 / k) * Math.exp(-t * (k * 0.35)));
      for (let s = 0; s < SEG; s++) { p.energy[s] = Math.exp(-s / 9); p.duration[s] = 1 + s / 8; }
      break;
  }
  if (id === 'brass') {
    // Snelle aanzet: de eerste segmenten korter, daarna gewoon.
    for (let s = 0; s < 6; s++) p.duration[s] = 0.5;
  }
  return p;
}
