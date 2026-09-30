// lyric/preview — de lus van een lettergreep laten horen zoals ZANG hem
// speelt: grains van twee perioden rond de marks, heen en weer door de
// klinkerkern, op de gesproken toonhoogte. Dezelfde rekenregel als
// PsolaVoice in mmb_dsp/psola.h, maar in TypeScript en zonder toonhoogte-
// verandering, zodat het venster het kan afspelen zonder de wasm.

import type { SyllableAnalysis } from './analyze';

/**
 * Render de lettergreep: aanloop tot de kern, dan `holdSeconds` heen en weer
 * door de kern, dan de rest. Mono op `syl.rate`.
 */
export function renderSustainLoop(syl: SyllableAnalysis, holdSeconds = 1.5): Float32Array {
  const { data, marks, rate } = syl;
  if (marks.length < 2 || syl.sustainEnd <= syl.sustainStart) return data.slice();
  const frameOf = (k: number): number => marks[Math.max(0, Math.min(marks.length - 1, k))]!.frame;
  const period = (k: number): number => {
    const prev = k > 0 ? frameOf(k) - frameOf(k - 1) : frameOf(k + 1) - frameOf(k);
    const next = k + 1 < marks.length ? frameOf(k + 1) - frameOf(k) : prev;
    return Math.max(8, Math.round(0.5 * (prev + next)));
  };
  // De volgorde van de marks: aanloop, dan heen en weer, dan uitloop.
  const order: number[] = [];
  for (let k = 0; k < syl.sustainStart; k++) order.push(k);
  let k = syl.sustainStart, dir = 1, held = 0;
  const want = Math.round(holdSeconds * rate);
  while (held < want) {
    order.push(k);
    held += period(k);
    if (dir > 0 && k >= syl.sustainEnd) dir = -1;
    else if (dir < 0 && k <= syl.sustainStart) dir = 1;
    k += dir;
  }
  for (let j = syl.sustainEnd + 1; j < marks.length; j++) order.push(j);

  // Overlap-add: elke grain twee perioden breed (Hann), op afstand van één
  // periode; de som van de vensters is dan 1.
  let total = 0;
  for (const m of order) total += period(m);
  const out = new Float32Array(total + 2 * period(order[order.length - 1]!));
  let pos = 0;
  for (const m of order) {
    const half = period(m);
    const c = frameOf(m);
    for (let i = -half; i <= half; i++) {
      const src = c + i, dst = pos + i;
      if (src < 0 || src >= data.length || dst < 0 || dst >= out.length) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * i) / half));
      out[dst] = out[dst]! + w * data[src]!;
    }
    pos += half;
  }
  return out.subarray(0, pos + period(order[order.length - 1]!)).slice();
}
