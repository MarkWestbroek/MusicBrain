// De frontlijst per moduletype (frontControls.ts) tegen de echte modules.

import { describe, expect, it } from 'vitest';

import { FRONT_CONTROLS } from './frontControls';
import { kindOf } from './recipe/catalog';
import { seedInternals } from './seedModules';
import { emptyModularProject } from './types';

const types = seedInternals(emptyModularProject()).moduleTypes;

describe('FRONT_CONTROLS', () => {
  it('noemt alleen bestaande moduletypes en bestaande, bedienbare controls', () => {
    const wrong: string[] = [];
    for (const [typeId, ids] of Object.entries(FRONT_CONTROLS)) {
      const t = types.find((x) => x.id === typeId);
      if (!t) { wrong.push(`${typeId}: type bestaat niet`); continue; }
      for (const id of ids) {
        const c = t.controls.find((x) => x.id === id);
        if (!c) wrong.push(`${typeId}: geen control ${id}`);
        else if (c.kind === 'display' || c.kind === 'led') wrong.push(`${typeId}: ${id} is een ${c.kind}, geen knop`);
      }
      if (new Set(ids).size !== ids.length) wrong.push(`${typeId}: dubbel id`);
    }
    expect(wrong).toEqual([]);
  });

  it('heeft een lijst voor elke klankbron, elk filter, elk effect en elke drum', () => {
    // Nieuwe module? Zet in frontControls.ts welke knoppen een speler wil
    // (een lege lijst mag: dan komt er niets vanzelf op het front).
    const missing = types
      .filter((t) => t.internal && ['source', 'filter', 'fx', 'drum'].includes(kindOf(t)) && !(t.id in FRONT_CONTROLS))
      .map((t) => t.id);
    expect(missing).toEqual([]);
  });
});
