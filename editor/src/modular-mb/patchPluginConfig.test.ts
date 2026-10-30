// MMB Patch: slots en motor-JSON (patchPluginConfig.ts, GenericPatch.h).
import { describe, expect, it } from 'vitest';

import { PATCH_CATALOG } from './patchCatalog';
import { pluginParams } from './patchPlugins';
import { PATCH_SLOTS, fromSlot, patchPluginConfig, slimProject, toSlot, type SlotSpec } from './patchPluginConfig';
import { seedInternals } from './seedModules';
import { emptyModularProject, type ModularProject } from './types';

const build = (label: string): ModularProject => PATCH_CATALOG.find((e) => e.label === label)!.build(seedInternals(emptyModularProject()));
const active = (p: ModularProject) => p.patches.find((x) => x.id === p.activePatchId)!;

describe('slot ↔ knopwaarde', () => {
  it('lineair, log (skewMid), stap, keuze en aan/uit gaan heen en terug', () => {
    const lin: SlotSpec = { kind: 'float', min: -12, max: 12, def: 0, interval: 0, skewMid: 0 };
    const log: SlotSpec = { kind: 'float', min: 20, max: 20000, def: 1000, interval: 0, skewMid: Math.sqrt(20 * 20000) };
    const step: SlotSpec = { kind: 'float', min: 0, max: 63, def: 0, interval: 1, skewMid: 0 };
    const sw: SlotSpec = { kind: 'choice', min: 0, max: 3, def: 1, interval: 1, skewMid: 0, choices: ['a', 'b', 'c', 'd'] };
    const tg: SlotSpec = { kind: 'bool', min: 0, max: 1, def: 0, interval: 1, skewMid: 0 };
    expect(toSlot(lin, 0)).toBeCloseTo(0.5);
    expect(Number(fromSlot(lin, 0.25))).toBeCloseTo(-6);
    // Log: het midden van de slot is het meetkundig midden (zoals setSkewForCentre).
    expect(toSlot(log, Math.sqrt(20 * 20000))).toBeCloseTo(0.5);
    for (const v of [20, 100, 1000, 8000, 20000]) expect(Number(fromSlot(log, toSlot(log, v)))).toBeCloseTo(v, 3);
    expect(fromSlot(step, toSlot(step, 21))).toBe(21);
    expect(fromSlot(sw, toSlot(sw, 2))).toBe(2);
    expect(fromSlot(tg, toSlot(tg, true))).toBe(true);
  });
});

describe('configuratie van een patch', () => {
  it('CS-80: een slot per parameter, in dezelfde volgorde, met een doel per stem', () => {
    const project = build('🎺 CS-80 koper (aftertouch)');
    const patch = active(project);
    const cfg = patchPluginConfig(project, patch);
    const params = pluginParams(project, patch);
    expect(cfg.slots.map((s) => s.id)).toEqual(params.map((p) => p.id));
    expect(cfg.slots.length).toBeLessThanOrEqual(PATCH_SLOTS);
    // De filterknop staat op elke stem (poly-groep).
    const cutoff = cfg.slots.find((s) => s.label === 'Helderheid')!;
    expect(cutoff.targets.length).toBeGreaterThan(1);
    const json = JSON.parse(cfg.json) as { project: { modules: unknown[] }; bypass: Record<string, unknown> };
    expect(json.project.modules.length).toBe(cfg.modules);
    expect(Object.keys(json.bypass).length).toBeGreaterThan(0);
  });
  it('slimProject houdt alleen deze patch en zijn modules, en de bediening blijft gelijk', () => {
    const project = build('8-stemmig');
    const patch = active(project);
    const slim = slimProject(project, patch);
    expect(slim.patches).toHaveLength(1);
    expect(slim.modules.length).toBeLessThan(project.modules.length);
    expect(pluginParams(slim, slim.patches[0]!).map((p) => p.id)).toEqual(pluginParams(project, patch).map((p) => p.id));
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(project).length / 2);
  });
});
