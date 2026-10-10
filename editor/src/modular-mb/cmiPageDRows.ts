// PAGE D: het profiel van de CMI-stem als berglandschap in pseudo-3D
// (doc/plans/fairlight.md §7). Twee standen, één tekenaar:
//   • GOLF       — de echte Page D: per segment de golfvorm (128 samples),
//                  segment 1 vooraan, 32 achteraan;
//   • HARMONISCH — Page 4 uitgesmeerd (Marks schets): per harmonische het
//                  niveau over de tijd, harmonische 1 vooraan, 32 achteraan.
// Zuiver: rijen erin, polygonen in tekenvolgorde (van achter naar voor) eruit.

import { H, SAMPLES, SEG, computeTable, level, type CmiProfile } from './cmiProfile';

export type PageDMode = 'wave' | 'harm';
/** HARMONISCH: lineair (zoals Page 4) of in dB (48 dB bereik), waarin zwakke boventonen zichtbaar worden. */
export type PageDScale = 'lin' | 'db';
export const DB_RANGE = 48;

export interface PageDRows {
  /** Per rij de waarden, vooraan = rij 0. GOLF: −1..1, HARMONISCH: 0..1. */
  rows: number[][];
  /** x-posities 0..1 van de waarden (gedeeld door alle rijen). */
  xs: number[];
  /** Waar de nullijn ligt: 0 = onderaan (HARMONISCH), 0,5 = midden (GOLF). */
  baseline: number;
  /** Nummer om bij de rij te zetten (1-based). */
  labels: number[];
}

/** De rijen voor een stand. `step` = elke 1e, 2e of 4e rij (zoals op de CMI). */
export function pageDRows(p: CmiProfile, mode: PageDMode, step = 1, scale: PageDScale = 'lin'): PageDRows {
  const pick = (n: number): number[] => Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);
  if (mode === 'wave') {
    const t = computeTable(p);
    const idx = pick(SEG);
    return {
      rows: idx.map((s) => Array.from({ length: SAMPLES }, (_, i) => (t[s * SAMPLES + i]! / 32768) * p.energy[s]!)),
      xs: Array.from({ length: SAMPLES }, (_, i) => i / (SAMPLES - 1)),
      baseline: 0.5,
      labels: idx.map((s) => s + 1),
    };
  }
  // Tijd volgt DURATION: lange segmenten zijn ook breed.
  const ends: number[] = [];
  let acc = 0;
  for (let s = 0; s < SEG; s++) { acc += p.duration[s]!; ends.push(acc); }
  const xs = ends.map((e, s) => (e - p.duration[s]! / 2) / acc);
  const idx = pick(H);
  const top = Math.max(1e-9, ...Array.from(p.levels));
  const val = (v: number): number => (scale === 'db' ? Math.max(0, 1 + (20 * Math.log10(Math.max(1e-9, v / top))) / DB_RANGE) : v);
  return { rows: idx.map((h) => Array.from({ length: SEG }, (_, s) => val(level(p, h, s)))), xs, baseline: 0, labels: idx.map((h) => h + 1) };
}

export interface PageDGeom {
  /** Breedte en hoogte van het hele beeld. */
  width: number; height: number;
  /** Breedte van één rij en hoe hoog een volle uitslag is. */
  rowWidth: number; amp: number;
}

export interface PageDPoly {
  /** Rijnummer in `rows` (0 = vooraan). */
  row: number;
  label: number;
  /** Gesloten vlak: de lijn plus de nullijn terug, voor het afdekken. */
  fill: string;
  /** Alleen de lijn. */
  line: string;
  /** Waar het nummer komt (links van de rij). */
  labelAt: [number, number];
  /** 0 = vooraan, 1 = achteraan (voor de kleur). */
  depth: number;
}

/** Schuine projectie: elke rij verder naar achteren schuift naar rechtsboven.
 *  Teruggegeven van achter naar voor, zodat wie later tekent afdekt. */
export function projectPageD(d: PageDRows, g: PageDGeom): PageDPoly[] {
  const n = d.rows.length;
  const depthX = g.width - g.rowWidth, depthY = g.height - g.amp;
  const out: PageDPoly[] = [];
  for (let r = n - 1; r >= 0; r--) {
    const f = n > 1 ? r / (n - 1) : 0;
    const ox = f * depthX, oy = g.height - f * depthY - (d.baseline === 0 ? 0 : g.amp * 0.5);
    const yOf = (v: number): number => oy - (d.baseline === 0 ? v * g.amp : v * g.amp * 0.5);
    const pts = d.rows[r]!.map((v, i) => `${(ox + d.xs[i]! * g.rowWidth).toFixed(1)},${yOf(v).toFixed(1)}`);
    const x0 = ox.toFixed(1), x1 = (ox + g.rowWidth).toFixed(1), y0 = oy.toFixed(1);
    out.push({
      row: r,
      label: d.labels[r]!,
      line: pts.join(' '),
      fill: `${x0},${y0} ${pts.join(' ')} ${x1},${y0}`,
      labelAt: [ox - 3, oy],
      depth: f,
    });
  }
  return out;
}
