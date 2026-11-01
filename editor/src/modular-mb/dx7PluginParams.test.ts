// MMB DX7: elke byte van de stem is één keer een parameter (dx7PluginParams.ts).
import { describe, expect, it } from 'vitest';

import { DX7 } from './dx7Patch';
import { DX7_PLUGIN_PARAMS } from './dx7PluginParams';

describe('MMB DX7-parameters', () => {
  it('dekken elke byte behalve naam en operator-aan/uit, elk één keer, met unieke id', () => {
    const offsets = DX7_PLUGIN_PARAMS.map((p) => p.offset).sort((a, b) => a - b);
    expect(offsets).toEqual(Array.from({ length: DX7.name }, (_, i) => i));
    expect(new Set(DX7_PLUGIN_PARAMS.map((p) => p.id)).size).toBe(DX7_PLUGIN_PARAMS.length);
  });
  it('een keuze heeft een naam per stand', () => {
    for (const p of DX7_PLUGIN_PARAMS) if (p.steps) expect(p.steps.length).toBe(p.max + 1);
  });
});
