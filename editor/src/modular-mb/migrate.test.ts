// Wat er met `Patch.rackIds` gebeurt bij het laden van een project.
//
// Het interne rack is de modulecatalogus: één prototype per type. Werd het bij
// elke patch gezet — en dat deed `normaliseV2` vroeger onvoorwaardelijk — dan
// tekende de patcher na elke herstart de hele voorraad, terwijl de patch maar
// vier kabels had.

import { describe, expect, it } from 'vitest';

import { emptyModularProject, migrateProject, type ModularProject, type Patch } from './types';

function project(patches: Partial<Patch>[]): ModularProject {
  const base = emptyModularProject();
  return {
    ...base,
    racks: [
      { id: 'rack_fysiek', name: 'Test rack', rows: 1, hpPerRow: 84, slots: [], kind: 'physical' },
      {
        id: 'rack_internal', name: 'MMB Brain (intern)', rows: 1, hpPerRow: 64, kind: 'internal',
        slots: [{ id: 'slot_proto', moduleId: 'mod_proto_vco', row: 0, hpOffset: 0 }],
      },
    ],
    patches: patches.map((p, i) => ({
      id: `patch_${i}`, name: `Patch ${i}`, voiceCount: 1,
      rackIds: [], connections: [], controlState: {}, envelopes: [], lfos: [],
      ...p,
    })),
  };
}
const load = (p: ModularProject): Patch[] => migrateProject(JSON.parse(JSON.stringify(p)))!.patches;

const kabel = (from: string, to: string): Patch['connections'][number] => ({
  id: `c_${from}_${to}`,
  from: { moduleId: from, portId: 'out' },
  to:   { moduleId: to,   portId: 'in' },
});

describe('normaliseV2 — rackIds', () => {
  it('haalt het prototype-rack weg bij een patch die zijn eigen rack heeft', () => {
    const [patch] = load(project([{ rackIds: ['rack_fysiek', 'rack_internal'] }]));
    expect(patch!.rackIds).toEqual(['rack_fysiek']);
  });

  it('laat het staan als er wél een kabel op een prototype-module zit', () => {
    const [patch] = load(project([{
      rackIds: ['rack_fysiek', 'rack_internal'],
      connections: [kabel('mod_proto_vco', 'mod_iets')],
    }]));
    expect(patch!.rackIds).toEqual(['rack_fysiek', 'rack_internal']);
  });

  it('laat een patch die alléén het interne rack heeft met rust', () => {
    const [patch] = load(project([{ rackIds: ['rack_internal'] }]));
    expect(patch!.rackIds).toEqual(['rack_internal']);
  });

  it('zet het er niet meer bij — ook niet na herhaald laden', () => {
    let p = project([{ rackIds: ['rack_fysiek'] }]);
    for (let i = 0; i < 3; i++) p = { ...p, patches: load(p) };
    expect(p.patches[0]!.rackIds).toEqual(['rack_fysiek']);
  });

  it('geeft een patch zonder rack een fysiek rack', () => {
    const [patch] = load(project([{ rackIds: [] }]));
    expect(patch!.rackIds).toEqual(['rack_fysiek']);
  });

  it('vertaalt het oude losse rackId', () => {
    const p = project([{}]);
    (p.patches[0] as unknown as { rackId: string }).rackId = 'rack_fysiek';
    expect(load(p)[0]!.rackIds).toEqual(['rack_fysiek']);
  });

  it('gooit verwijzingen naar verdwenen racks weg', () => {
    const [patch] = load(project([{ rackIds: ['rack_weg', 'rack_fysiek'] }]));
    expect(patch!.rackIds).toEqual(['rack_fysiek']);
  });
});
