import { describe, expect, it } from 'vitest';

import { frontForPool, frontSvg } from './frontSvg';
import { buildRecipe } from './recipe/compile';
import { seedInternals } from './seedModules';
import { emptyModularProject, type ModularProject, type Patch } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject): Patch => p.patches.find((x) => x.id === p.activePatchId)!;

describe('frontSvg', () => {
  it('is een zelfstandig SVG-document met de naam en de knoppen van het front', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const patch = active(p);
    const f = frontForPool(patch, p);
    expect(f.name).toBe('Auto');
    const svg = frontSvg(f, patch, p);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true);
    expect(svg).toContain('Cutoff');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('neemt het eerste bewaarde front als dat er is', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const patch: Patch = { ...active(p), fronts: [{ id: 'f', name: 'Spelen', items: [] }] };
    expect(frontForPool(patch, p).name).toBe('Spelen');
  });
});
