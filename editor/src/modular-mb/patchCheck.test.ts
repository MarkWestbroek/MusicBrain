// Patchcontrole: een patch die niet meer past op de moduletypes van nu.

import { describe, expect, it } from 'vitest';

import { checkPatch, repairPatch, summarizeFindings } from './patchCheck';
import { seedEPianoPolyPatch } from './seedShowcase';
import { seedInternals } from './seedModules';
import { emptyModularProject, type ModularProject, type Patch } from './types';

function piano(): { p: ModularProject; patch: Patch; midi: string; ep: string; out: string } {
  const p = seedEPianoPolyPatch(seedInternals(emptyModularProject()));
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const of = (t: string) => p.modules.find((m) => m.typeId === t && patch.connections.some((c) => c.from.moduleId === m.id || c.to.moduleId === m.id))!.id;
  return { p, patch, midi: of('tp_mmb_midiin'), ep: of('tp_mmb_epiano'), out: of('tp_mmb_out') };
}

describe('checkPatch', () => {
  it('vindt niets in een verse seed', () => {
    const { p, patch } = piano();
    expect(checkPatch(patch, p)).toEqual([]);
  });

  it('vindt een kabel naar een verdwenen poort en een verdwenen module, en haalt ze weg', () => {
    const { p, patch, ep, out } = piano();
    const broken: Patch = { ...patch, connections: [
      ...patch.connections,
      { id: 'k1', from: { moduleId: ep, portId: 'bestaat_niet' }, to: { moduleId: out, portId: 'l' } },
      { id: 'k2', from: { moduleId: 'weg', portId: 'out' }, to: { moduleId: out, portId: 'r' } },
    ] };
    const f = checkPatch(broken, p);
    expect(f.map((x) => [x.kind, x.severity, x.connectionId])).toEqual([
      ['missing-port', 'fix', 'k1'],
      ['unknown-module', 'fix', 'k2'],
    ]);
    const fixed = repairPatch(broken, f);
    expect(fixed.connections).toEqual(patch.connections);
    expect(checkPatch(fixed, p)).toEqual([]);
  });

  it('meldt een uitgang die als ingang gebruikt wordt, zonder hem zelf te herstellen', () => {
    const { p, patch, ep, out } = piano();
    const wrong: Patch = { ...patch, connections: [...patch.connections,
      { id: 'k3', from: { moduleId: out, portId: 'l' }, to: { moduleId: ep, portId: 'out_l' } }] };
    const f = checkPatch(wrong, p);
    expect(f.some((x) => x.kind === 'port-direction' && x.severity === 'ask')).toBe(true);
    expect(repairPatch(wrong, f.filter((x) => x.severity !== 'fix'))).toBe(wrong);
  });

  it('klemt een knop op zijn bereik en zet een schakelaar op een bestaande stand', () => {
    const { p, patch, ep } = piano();
    const odd: Patch = { ...patch, controlState: { ...patch.controlState, [ep]: { ...patch.controlState[ep], timbre: 7, type: 9, decay: 'veel' as unknown as number } } };
    const f = checkPatch(odd, p);
    expect(f.map((x) => `${x.kind}:${x.controlId}`).sort()).toEqual(['bad-value:decay', 'out-of-range:timbre', 'out-of-range:type']);
    const fixed = repairPatch(odd, f);
    expect(fixed.controlState[ep]!.timbre).toBe(1);
    expect(fixed.controlState[ep]!.type).toBe(1);
    expect(typeof fixed.controlState[ep]!.decay).toBe('number');
    expect(checkPatch(fixed, p)).toEqual([]);
  });

  it('laat een onbekende knopstand staan (de firmware negeert hem) en meldt hem alleen', () => {
    const { p, patch, ep, midi } = piano();
    const extra: Patch = { ...patch, controlState: { ...patch.controlState, [ep]: { ...patch.controlState[ep], oudeknop: 0.5 } } };
    const f = checkPatch(extra, p);
    expect(f.map((x) => [x.kind, x.severity, x.controlId])).toEqual([['unknown-control', 'info', 'oudeknop']]);
    expect(repairPatch(extra, f)).toBe(extra);
    // MIDI-IN voiceCount is bewust synthetisch en geen bevinding.
    expect(patch.controlState[midi]!.voiceCount).toBeDefined();
  });

  it('haalt front-items weg die naar niets meer wijzen', () => {
    const { p, patch, ep } = piano();
    const withFront: Patch = { ...patch, fronts: [{ id: 'f', name: 'F', items: [
      { kind: 'control', moduleId: ep, controlId: 'timbre' },
      { kind: 'control', moduleId: ep, controlId: 'weg' },
      { kind: 'port', moduleId: 'nergens', portId: 'out' },
    ] }] };
    const f = checkPatch(withFront, p);
    expect(f.map((x) => [x.kind, x.itemIndex])).toEqual([['front-target', 1], ['front-target', 2]]);
    expect(repairPatch(withFront, f).fronts![0]!.items).toEqual([{ kind: 'control', moduleId: ep, controlId: 'timbre' }]);
  });

  it('meldt een module van een onbekend type als vraag', () => {
    const { p, patch, ep } = piano();
    const q: ModularProject = { ...p, modules: p.modules.map((m) => (m.id === ep ? { ...m, typeId: 'tp_mmb_bestaat_niet' } : m)) };
    const f = checkPatch(patch, q);
    expect(f.filter((x) => x.kind === 'unknown-type').map((x) => x.severity)).toEqual(['ask']);
    expect(summarizeFindings(f).ask).toBe(1);
  });
});
