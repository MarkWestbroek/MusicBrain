import { describe, it, expect } from 'vitest';
import { patchRequires, missingTypes, buildInfo, splitDescribe } from './patchRequires';
import { patchSnapshot } from './midiRecorder';
import { emptyModularProject } from '../types';
import { seedInternals, seedPolyVoicePatch } from '../seedModules';

describe('patchRequires', () => {
  it('moduletypes van de patch, gesorteerd en uniek; versies uit de build', () => {
    const p = seedPolyVoicePatch(seedInternals(emptyModularProject()), 2, { filterType: 'ladder' });
    const snap = patchSnapshot(p, p.patches.find((x) => x.id === p.activePatchId)!);
    const r = patchRequires(snap, { editorVersion: '0.5.48', editorBuild: '1-gabc', firmwareContract: '0.5.94' });
    expect(r.editorVersion).toBe('0.5.48');
    expect(splitDescribe('v0.5.48-355-g62e7389')).toEqual({ editorVersion: '0.5.48', editorBuild: '355-g62e7389' });
    expect(splitDescribe('v0.6.0')).toEqual({ editorVersion: '0.6.0', editorBuild: '' });
    expect(splitDescribe('62e7389')).toEqual({ editorVersion: '', editorBuild: '62e7389' });
    expect(r.firmwareContract).toBe('0.5.94');
    expect(r.moduleTypes).toContain('tp_mmb_ladder');
    expect(r.moduleTypes).toContain('tp_mmb_midiin');
    expect(r.moduleTypes).not.toContain('tp_mmb_sid');            // niet in deze patch
    expect([...r.moduleTypes].sort()).toEqual(r.moduleTypes);
    expect(new Set(r.moduleTypes).size).toBe(r.moduleTypes.length);
    const b = buildInfo();                                             // vitest deelt vite.config: echte waarden, of leeg buiten git
    expect(b.editorVersion).toMatch(/^(\d+\.\d+\.\d+)?$/);
    expect(b.firmwareContract).toMatch(/^(\d+\.\d+\.\d+)?$/);
  });
  it('missingTypes meldt wat deze editor niet kent', () => {
    const p = seedInternals(emptyModularProject());
    expect(missingTypes({ editorVersion: '', editorBuild: '', firmwareContract: '', moduleTypes: ['tp_mmb_vco', 'tp_mmb_toekomst'] }, p)).toEqual(['tp_mmb_toekomst']);
  });
});
