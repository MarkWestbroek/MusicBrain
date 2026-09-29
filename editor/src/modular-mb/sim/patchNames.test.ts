import { describe, it, expect } from 'vitest';
import { buildReabank, buildCubaseScript } from './patchNames';
import { patchToSysex } from './PatchExportMenu';
import { decodePatchSysex, SYSEX_CMD } from './patchSysex';
import { addPatchSnapshot } from './takeLibrary';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedPolyVoicePatch } from '../seedModules';

const list = [
  { bank: 0, program: 1, name: 'Koper', bankName: 'Leads' },
  { bank: 0, program: 0, name: 'Bas]\n', bankName: 'Leads' },
  { bank: 1, program: 0, name: 'Pad', bankName: '(geen map)' },
];

describe('patchnamen', () => {
  it('reabank: per bank, gesorteerd op programma', () => {
    const r = buildReabank(list);
    expect(r).toContain('Bank 0 0 Leads\n0 Bas\n1 Koper');
    expect(r).toContain('Bank 1 0 (geen map)\n0 Pad');
  });
  it('Cubase-script: [p2, programma, MSB, LSB]', () => {
    const c = buildCubaseScript(list);
    expect(c).toContain('[define patchnames]');
    expect(c).toContain('[g1]\tLeads');
    expect(c).toContain('[p2, 1, 0, 0]\tKoper');
    expect(c).toContain('[p2, 0, 1, 0]\tPad');
    expect(c.trim().endsWith('[end]')).toBe(true);
  });
});

describe('patch als .syx', () => {
  it('heen en terug: firmwareconfig en editor-patch; importeren = nieuwe patch', async () => {
    const p = seedPolyVoicePatch(seedInternals(emptyModularProject()), 2);
    const got = await decodePatchSysex(await patchToSysex(p));
    const fw = JSON.parse(got.get(SYSEX_CMD.firmwareConfig)!);
    expect(fw).toBeTypeOf('object');
    const snap = JSON.parse(got.get(SYSEX_CMD.editorPatch)!) as ModularProject;
    expect(snap.patches).toHaveLength(1);
    let n = 0;
    expect(snap.moduleTypes).toHaveLength(0);                      // slank: types vult de ontvanger aan
    const fresh = seedInternals(emptyModularProject());
    const r0 = addPatchSnapshot(fresh, snap, 'Leeg project', (pre) => `${pre}_y${++n}`);
    const np = r0.patches.at(-1)!;
    const ids = new Set(r0.modules.map((m) => m.id));
    for (const c of np.connections) { expect(ids.has(c.from.moduleId)).toBe(true); expect(ids.has(c.to.moduleId)).toBe(true); }
    const r = addPatchSnapshot(p, snap, 'Uit .syx', (pre) => `${pre}_x${++n}`);
    expect(r.patches).toHaveLength(p.patches.length + 1);
    expect(r.patches.at(-1)!.name).toBe('Uit .syx');
  });
});
