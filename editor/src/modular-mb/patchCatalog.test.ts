// De patchcatalogus: elk item bouwt, en de patch die het maakt doorstaat de
// patchcontrole. Zo kan een seed in een menu niet stil kapot gaan.

import { describe, expect, it } from 'vitest';

import { DEMO_SEEDS } from './demoSeeds';
import { checkPatch } from './patchCheck';
import { PATCH_CATALOG, catalogMenu } from './patchCatalog';
import { seedInternals } from './seedModules';
import { emptyModularProject } from './types';

describe('patchcatalogus', () => {
  it('heeft unieke id\'s', () => {
    const ids = PATCH_CATALOG.map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('bevat alle menu\'s zoals ze in de bovenbalk stonden', () => {
    expect(catalogMenu('diagnose').map((e) => e.label)).toEqual(['Voorbeelden', 'Internals', 'Test-patch', 'FM-test', 'CV-bridge']);
    expect(catalogMenu('poly').length).toBeGreaterThanOrEqual(26);
    expect(catalogMenu('solo').length).toBeGreaterThanOrEqual(58);
    expect(catalogMenu('stress').length).toBe(9);
    expect(catalogMenu('basisset').map((e) => e.label)).toEqual(DEMO_SEEDS.map((d) => d.label));
  });

  const base = seedInternals(emptyModularProject());
  for (const e of PATCH_CATALOG) {
    it(`${e.id} bouwt en doorstaat de patchcontrole`, () => {
      const p = e.build(base);
      if (p.patches.length === base.patches.length) return;   // Voorbeelden, Internals: alleen modules
      const patch = p.patches.find((x) => x.id === p.activePatchId)!;
      expect(patch).toBeDefined();
      const f = checkPatch(patch, p).filter((x) => x.kind !== 'signal-mismatch');
      expect(f.map((x) => `${x.kind}: ${x.message}`)).toEqual([]);
    });
  }
});
