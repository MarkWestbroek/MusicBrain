// Tempo: één baas per patch (doc/plans/tempo.md).

import { describe, expect, it } from 'vitest';

import { DEMO_SEEDS } from './demoSeeds';
import { seedInternals } from './seedModules';
import { ClockTempo, TapTempo, patchTempoOf, reconcileTempo, tempoModules } from './tempo';
import { emptyModularProject, type ModularProject, type Patch } from './types';

/** De ritmebox-seed met een tweede tempomodule (TURING) in hetzelfde rack. */
function boxAndTuring(): { project: ModularProject; patch: Patch; box: string; turing: string } {
  let p = seedInternals(emptyModularProject());
  p = DEMO_SEEDS.find((d) => d.label.includes('CR-78'))!.run(p);
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const box = p.modules.find((m) => m.typeId === 'tp_mmb_rhythm' && !m.internal && p.racks.some((r) => patch.rackIds.includes(r.id) && r.slots.some((s) => s.moduleId === m.id)))!;
  const proto = p.modules.find((m) => m.typeId === 'tp_mmb_turing')!;
  const turing = { ...proto, id: 'mod_turing_t', internal: false };
  const rack = p.racks.find((r) => patch.rackIds.includes(r.id))!;
  p = {
    ...p,
    modules: [...p.modules, turing],
    racks: p.racks.map((r) => (r.id === rack.id ? { ...r, slots: [...r.slots, { id: 'slot_t', moduleId: turing.id, row: 0, hpOffset: 200 }] } : r)),
  };
  const withTuring = { ...patch, controlState: { ...patch.controlState, [turing.id]: { tempo: 100 } } };
  p = { ...p, patches: p.patches.map((x) => (x.id === patch.id ? withTuring : x)) };
  return { project: p, patch: withTuring, box: box.id, turing: turing.id };
}
const set = (patch: Patch, id: string, ctl: Record<string, unknown>): Patch =>
  ({ ...patch, controlState: { ...patch.controlState, [id]: { ...(patch.controlState[id] ?? {}), ...ctl } } }) as Patch;

describe('tempo per patch', () => {
  it('vindt de tempomodules; ExtClk en eigen tempo volgen niet', () => {
    const { project, patch, box, turing } = boxAndTuring();
    expect(tempoModules(project, patch).map((m) => [m.id, m.follows])).toEqual([[box, true], [turing, true]]);
    const ext = set(patch, turing, { extclock: true });
    expect(tempoModules(project, ext).find((m) => m.id === turing)).toMatchObject({ follows: false, why: 'extclock' });
    const own = { ...patch, tempoOwn: [box] };
    expect(tempoModules(project, own).find((m) => m.id === box)).toMatchObject({ follows: false, why: 'own' });
  });

  it('zonder veld: het tempo van de eerste volgende knop; alle volgenden gaan mee', () => {
    const { project, patch, turing } = boxAndTuring();
    const first = patchTempoOf(project, patch);
    const plan = reconcileTempo(project, patch, null, null);
    expect(plan).toMatchObject({ bpm: first, source: 'patch', patchTempo: first });
    expect(plan.writes).toEqual([{ moduleId: turing, bpm: first }]);   // de box staat er al op
  });

  it('een verdraaide knop wordt het nieuwe patchtempo', () => {
    const { project, patch, box, turing } = boxAndTuring();
    const synced = set(set({ ...patch, tempo: 110 }, box, { tempo: 110 }), turing, { tempo: 110 });
    const turned = set(synced, turing, { tempo: 92 });
    const plan = reconcileTempo(project, turned, synced, null);
    expect(plan.bpm).toBe(92);
    expect(plan.writes).toEqual([{ moduleId: box, bpm: 92 }]);
  });

  it('de song of de MIDI-clock is de baas: knoppen veren terug', () => {
    const { project, patch, box, turing } = boxAndTuring();
    const synced = set(set({ ...patch, tempo: 110 }, box, { tempo: 110 }), turing, { tempo: 110 });
    const turned = set(synced, turing, { tempo: 92 });
    expect(reconcileTempo(project, turned, synced, { source: 'song', bpm: 110 })).toMatchObject({ bpm: 110, source: 'song', writes: [{ moduleId: turing, bpm: 110 }] });
    expect(reconcileTempo(project, synced, null, { source: 'midi', bpm: 128 }).writes.length).toBe(2);
  });

  it('het patchtempo zelf veranderen (TAP) neemt alle knoppen mee', () => {
    const { project, patch, box, turing } = boxAndTuring();
    const synced = set(set({ ...patch, tempo: 110 }, box, { tempo: 110 }), turing, { tempo: 110 });
    const tapped = { ...synced, tempo: 84.6 };
    const plan = reconcileTempo(project, tapped, synced, null);
    expect(plan.bpm).toBe(84.6);
    expect(plan.writes.map((w) => w.moduleId).sort()).toEqual([box, turing].sort());
  });
});

describe('tap tempo', () => {
  it('twee tikken geven een tempo, het gemiddelde van de laatste vier intervallen', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBe(120);
    t.tap(1000); t.tap(1500);
    expect(t.tap(2100)).toBeCloseTo(60_000 / 525, 1);   // (2100 − 0) / 4
  });
  it('na twee seconden stilte begint hij opnieuw', () => {
    const t = new TapTempo();
    t.tap(0); t.tap(500);
    expect(t.tap(5000)).toBeNull();
    expect(t.tap(5750)).toBe(80);
  });
});

describe('MIDI-clock', () => {
  it('24 tikken per tel geven het tempo; stilte = geen tempo', () => {
    const c = new ClockTempo();
    const step = 60_000 / 128 / 24;
    let t = 0;
    for (let i = 0; i < 60; i++) { c.tick(t); t += step; }
    expect(c.bpm(t)).toBeCloseTo(128, 0);
    expect(c.bpm(t + 600)).toBeNull();
  });
});
