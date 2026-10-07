// Elke tekst die de standaardset in een project zet heeft een Engelse
// versie (of is al Engels): anders ziet een Engelse speler na een
// seedwijziging stilletjes weer Nederlands.

import { describe, expect, it } from 'vitest';

import { SAME, contentEn } from './contentEn';
import { DEMO_SEEDS } from './demoSeeds';
import { emptyModularProject } from './types';

function textsOf(i: number): string[] {
  const d = DEMO_SEEDS[i]!;
  const p = d.run(emptyModularProject());
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const out = [d.label, d.title, patch.name, patch.description ?? ''];
  for (const f of patch.fronts ?? []) {
    out.push(f.name, f.description ?? '');
    for (const it of f.items) out.push(it.kind === 'group' ? it.text : (it.label ?? ''));
  }
  return out.filter(Boolean);
}

describe('Engelse teksten van de standaardset', () => {
  it.each(DEMO_SEEDS.map((d, i) => [d.label, i] as const))('%s', (_label, i) => {
    const missing = textsOf(i).filter((t) => contentEn(t) === undefined && !SAME.has(t) && /[a-z]/.test(t) && !isName(t));
    expect(missing).toEqual([]);
  });
});

/** Namen die in beide talen hetzelfde zijn (merk, model, emoji + model). */
function isName(t: string): boolean {
  return /^(🎹 E-piano|🎐 Ondes Martenot|🔁 Arp|🎼 DX7|💡 DX7|🎛 Synthex|🎸 Axel F|👾 SID|🔥 String|✨ Rings|🌀 Plaits|🎚 Mixtur|🧬 Acid|🌊 West|🌌 Krell|🎲 Generative)/.test(t)
    || /^(E-piano|MARTENOT|Organ|DX7|Synthex|Axel F|SID|String|Rings|Plaits|MIXTUR|Acid jam|West Coast|Krell|Generative jam)\b/.test(t);
}
