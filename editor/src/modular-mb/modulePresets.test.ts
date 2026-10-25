// De fabriekspresets (modulePresets.ts) tegen de echte panelen: elke waarde
// hoort bij een bestaande knop en ligt binnen zijn bereik.

import { describe, expect, it } from 'vitest';

import { MODULE_PRESETS } from './modulePresets';
import { seedInternals } from './seedModules';
import { emptyModularProject } from './types';

const types = seedInternals(emptyModularProject()).moduleTypes;

describe('MODULE_PRESETS', () => {
  for (const [typeId, presets] of Object.entries(MODULE_PRESETS)) {
    it(`${typeId}: bestaande knoppen, binnen bereik, unieke namen`, () => {
      const type = types.find((t) => t.id === typeId);
      expect(type, typeId).toBeDefined();
      expect(new Set(presets.map((p) => p.name)).size).toBe(presets.length);
      for (const p of presets) {
        for (const [id, v] of Object.entries(p.values)) {
          const c = type!.controls.find((x) => x.id === id);
          expect(c, `${p.name}: ${id}`).toBeDefined();
          if (c!.kind === 'knob' || c!.kind === 'slider') {
            expect(typeof v, `${p.name}: ${id}`).toBe('number');
            expect(v as number).toBeGreaterThanOrEqual(c!.min);
            expect(v as number).toBeLessThanOrEqual(c!.max);
          } else if (c!.kind === 'switch') {
            expect(Number.isInteger(v) && (v as number) >= 0 && (v as number) < c!.positions.length, `${p.name}: ${id}`).toBe(true);
          } else if (c!.kind === 'toggle') {
            expect(typeof v, `${p.name}: ${id}`).toBe('boolean');
          } else {
            throw new Error(`${p.name}: ${id} is geen instelbare knop (${c!.kind})`);
          }
        }
      }
    });
  }
});
