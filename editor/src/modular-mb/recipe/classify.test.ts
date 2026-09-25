import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals, seedTestPatch, seedSamplerPolyPatch } from '../seedModules';
import { buildRecipe } from './compile';
import { autoFolders, bankPrograms, classifyPatch, comparePatches, familyOf, findPatchByBankProgram, groupKey, stepPatch } from './classify';

describe('bank / program', () => {
  it('map = bank (alfabetisch, geen map achteraan), program = expliciet of volgorde op naam', () => {
    let p = buildRecipe(base(), { source: 'vco', name: 'B vco' });          // map VCO
    p = buildRecipe(p, { source: 'vco', name: 'A vco' });                    // map VCO
    p = buildRecipe(p, { source: 'string', name: 'snaar' });                 // map Physical modelling
    p = buildRecipe(p, { source: 'dx7', name: 'los' });
    p = { ...p, patches: p.patches.map((x, i) => (i === 3 ? { ...x, folder: undefined } : i === 0 ? { ...x, programNumber: 5 } : x)) };
    const bp = bankPrograms(p);
    const [bVco, aVco, snaar, los] = p.patches;
    expect(bp.get(snaar!.id)).toEqual({ bank: 0, program: 0, bankName: 'Physical modelling' });
    expect(bp.get(aVco!.id)).toEqual({ bank: 1, program: 0, bankName: 'VCO' });
    expect(bp.get(bVco!.id)).toEqual({ bank: 1, program: 5, bankName: 'VCO' });   // expliciet
    expect(bp.get(los!.id)).toEqual({ bank: 2, program: 0, bankName: '(geen map)' });
    expect(findPatchByBankProgram(p, 1, 5)!.id).toBe(bVco!.id);
    expect(findPatchByBankProgram(p, null, 5)!.id).toBe(bVco!.id);            // zonder bank: eerste treffer
    expect(findPatchByBankProgram(p, 1, 9)).toBeNull();
    // Stappers: binnen de bank met omslag, en per bank naar het eerste programma.
    expect(stepPatch(p, aVco!.id, 1, 'patch')).toBe(bVco!.id);
    expect(stepPatch(p, bVco!.id, 1, 'patch')).toBe(aVco!.id);      // omslag
    expect(stepPatch(p, aVco!.id, -1, 'patch')).toBe(bVco!.id);
    expect(stepPatch(p, aVco!.id, 1, 'bank')).toBe(los!.id);        // bank 2
    expect(stepPatch(p, aVco!.id, -1, 'bank')).toBe(snaar!.id);     // bank 0
    expect(stepPatch(p, los!.id, 1, 'bank')).toBe(snaar!.id);       // omslag naar bank 0
    expect(stepPatch(base(), undefined, 1, 'patch')).toBeNull();
  });
});

const base = () => seedInternals(emptyModularProject());
const active = (p: ReturnType<typeof base>) => p.patches.find((x) => x.id === p.activePatchId)!;

describe('classifyPatch', () => {
  it('familie uit de bron, stemmen, rack, kabels, fx', () => {
    let p = buildRecipe(base(), { voices: 4, source: 'wavetable', bus: ['diode'] });
    const c = classifyPatch(p, active(p));
    expect(c).toMatchObject({ family: 'Wavetable', voices: 'poly 4', voiceCount: 4, fx: ['Diode'] });
    expect(c.cables).toBeGreaterThan(5);
    expect(c.rackName).toMatch(/rack/);
    p = buildRecipe(p, { source: 'string' });
    expect(classifyPatch(p, active(p)).family).toBe('Physical modelling');
    p = buildRecipe(p, { voices: 2, source: 'dx7' });
    expect(classifyPatch(p, active(p))).toMatchObject({ family: 'FM', voices: 'duo' });
    const s = seedSamplerPolyPatch(base(), 8, true);
    expect(classifyPatch(s, active(s))).toMatchObject({ family: 'Sampling', voices: 'poly 8' });
    const t = seedTestPatch(base());
    expect(classifyPatch(t, active(t)).family).toBe('VCO');   // sequencer + VCO: de bron wint
  });

  it('lege patch en familyOf', () => {
    const p = base();
    const empty = { id: 'x', name: 'leeg', voiceCount: 1, rackIds: [], connections: [], controlState: {}, envelopes: [], lfos: [] };
    expect(classifyPatch(p, empty).family).toBe('Leeg');
    expect(familyOf('tp_mmb_rings')).toBe('Physical modelling');
    expect(familyOf('tp_mmb_bus_comp')).toBe('Effect');
    expect(familyOf('tp_mmb_octa_vco')).toBe('VCO');
  });
});

describe('mappen, groeperen, sorteren', () => {
  it('recept zet de map op de familie; autoFolders vult alleen lege mappen', () => {
    let p = buildRecipe(base(), { source: 'plaits' });
    expect(active(p).folder).toBe('Physical modelling');
    p = { ...p, patches: p.patches.map((x) => ({ ...x, folder: 'Mijn favorieten' })) };
    p = buildRecipe(p, { source: 'vco' });
    p = { ...p, patches: p.patches.map((x, i) => (i === 1 ? { ...x, folder: undefined } : x)) };
    const q = autoFolders(p);
    expect(q.patches[0]!.folder).toBe('Mijn favorieten');
    expect(q.patches[1]!.folder).toBe('VCO');
    expect(autoFolders(p, true).patches[0]!.folder).toBe('Physical modelling');
  });

  it('groupKey en comparePatches', () => {
    let p = buildRecipe(base(), { voices: 8, source: 'vco' });
    p = buildRecipe(p, { voices: 1, source: 'string' });
    p = buildRecipe(p, { voices: 4, source: 'sampler', filter: null, ampEnv: false, velocity: false });
    const [a, b, c] = p.patches;
    expect(groupKey(p, a!, 'voices')).toBe('poly 8');
    expect(groupKey(p, b!, 'family')).toBe('Physical modelling');
    expect(groupKey(p, { ...c!, folder: undefined }, 'folder')).toBe('(geen map)');
    const byVoices = [...p.patches].sort(comparePatches(p, 'voices')).map((x) => x.voiceCount);
    expect(byVoices).toEqual([1, 4, 8]);
    const byVoicesDesc = [...p.patches].sort(comparePatches(p, 'voices', -1)).map((x) => x.voiceCount);
    expect(byVoicesDesc).toEqual([8, 4, 1]);
    const byCables = [...p.patches].sort(comparePatches(p, 'cables')).map((x) => x.connections.length);
    expect(byCables).toEqual([...byCables].sort((x, y) => x - y));
    const byFamily = [...p.patches].sort(comparePatches(p, 'family')).map((x) => classifyPatch(p, x).family);
    expect(byFamily).toEqual(['Physical modelling', 'Sampling', 'VCO']);
  });
});
