import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedTestPatch } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { buildRecipe, validateOps } from './compile';
import {
  replaceModule, setVoices, addBusFx, addModulation, findVoiceChain, findModuleByWord, findPortByWord,
} from './edits';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject) => p.patches.find((x) => x.id === p.activePatchId)!;
const rackOf = (p: ModularProject) => p.racks.find((r) => r.id === p.activeRackId)!;
const typeOf = (p: ModularProject, id: string) => p.modules.find((m) => m.id === id)!.typeId;
const edges = (p: ModularProject) => active(p).connections
  .map((c) => `${typeOf(p, c.from.moduleId)}.${c.from.portId}>${typeOf(p, c.to.moduleId)}.${c.to.portId}`).sort();
const count = (p: ModularProject, typeId: string) =>
  rackOf(p).slots.filter((s) => typeOf(p, s.moduleId) === typeId).length;
/** Alle kabels moeten op bestaande poorten liggen en de flatten moet slagen. */
const sane = (p: ModularProject) => {
  const patch = active(p);
  for (const c of patch.connections) {
    for (const end of [c.from, c.to]) expect(p.modules.some((m) => m.id === end.moduleId)).toBe(true);
  }
  validateOps(p, [], patch.id);
  expandPatchConnections(patch, p);
};

describe('replaceModule', () => {
  it('vervangt een hele poly-groep, behoudt id\'s en kabels', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const vco = findModuleByWord(p0, active(p0).id, 'osc')!;
    const before = edges(p0);
    const r = replaceModule(p0, active(p0).id, vco.id, 'wavetable');
    expect(r.warnings).toEqual([]);
    expect(count(r.project, 'tp_mmb_wt_vco')).toBe(4);
    expect(count(r.project, 'tp_mmb_vco')).toBe(0);
    expect(r.project.modules.some((m) => m.id === vco.id && m.typeId === 'tp_mmb_wt_vco')).toBe(true);
    expect(edges(r.project)).toEqual(before.map((e) => e.replace(/tp_mmb_vco\./g, 'tp_mmb_wt_vco.')));
    expect(rackOf(r.project).polyGroups!.some((g) => g.label === 'WT-VCO')).toBe(true);
    sane(r.project);
  });

  it('laat niet-mapbare kabels vallen met een waarschuwing', () => {
    const p0 = buildRecipe(base(), { voices: 2, source: 'vco' });
    const vco = findModuleByWord(p0, active(p0).id, 'vco')!;
    const r = replaceModule(p0, active(p0).id, vco.id, 'string');   // String heeft geen tune
    expect(r.warnings.some((w) => w.includes('tune'))).toBe(true);
    expect(edges(r.project)).not.toContain('tp_mmb_cvmath.out>tp_mmb_string.tune');
    expect(edges(r.project)).toContain('tp_mmb_midiin.pitch>tp_mmb_string.voct');
    sane(r.project);
  });

  it('filter-wissel: zelfde poorten, nieuwe knopstanden, breedte schuift op', () => {
    const p0 = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const f = findModuleByWord(p0, active(p0).id, 'filter')!;
    const r = replaceModule(p0, active(p0).id, f.id, 'ladder');
    expect(r.summary).toBe('VCF → Ladder');
    expect(active(r.project).controlState[f.id]).toMatchObject({ drive: 1.0 });
    const slotsBefore = rackOf(p0).slots, slotsAfter = rackOf(r.project).slots;
    const fs = slotsBefore.find((s) => s.moduleId === f.id)!;
    for (const s of slotsBefore) {
      const a = slotsAfter.find((x) => x.id === s.id)!;
      expect(a.hpOffset - s.hpOffset).toBe(s.row === fs.row && s.hpOffset > fs.hpOffset ? 2 : 0);   // ladder 8 HP vs vcf 6
    }
    sane(r.project);
  });

  it('mono L/R-paar → één stereomodule, en terug', () => {
    const p0 = buildRecipe(base(), { source: 'vco', bus: ['tape'] });   // tape als L/R-paar
    const pid = active(p0).id;
    const tapeL = p0.modules.find((m) => m.typeId === 'tp_mmb_tape_echo' && active(p0).connections.some((c) => c.from.moduleId === m.id && c.to.portId === 'l'))!;
    const r = replaceModule(p0, pid, tapeL.id, 'stereo tape');
    expect(r.summary).toMatch(/L\/R-paar → één/);
    expect(count(r.project, 'tp_mmb_tape_echo')).toBe(0);
    const newType = typeOf(r.project, tapeL.id);
    expect(count(r.project, newType)).toBe(1);
    const e = edges(r.project);
    expect(e).toContain(`tp_mmb_mixer.out_l>${newType}.in_l`);
    expect(e).toContain(`tp_mmb_mixer.out_r>${newType}.in_r`);
    expect(e).toContain(`${newType}.out_l>tp_mmb_out.l`);
    expect(e).toContain(`${newType}.out_r>tp_mmb_out.r`);
    sane(r.project);
    // En terug naar mono: weer een paar.
    const back = replaceModule(r.project, pid, tapeL.id, 'tape');
    expect(count(back.project, 'tp_mmb_tape_echo')).toBe(2);
    expect(edges(back.project)).toEqual(edges(p0));
    sane(back.project);
  });

  it('mono zonder paar → stereo: de bron voedt L en R', () => {
    const p0 = seedTestPatch(base());   // VCA → OUT l én r, geen bus-effect
    const pid = active(p0).id;
    const withEcho = addBusFx(p0, pid, 'echo').project;          // mono echo-paar op de bus
    void withEcho;
    const vcf = findModuleByWord(p0, pid, 'vcf')!;
    // VCF is mono in/uit maar geen stereo-tegenhanger → gewone vervanging (geen stereo-type als filter)
    expect(() => replaceModule(p0, pid, vcf.id, 'dattorro')).not.toThrow();
    const r = replaceModule(p0, pid, vcf.id, 'dattorro');
    expect(edges(r.project)).toContain('tp_mmb_vco.out>tp_mmb_elements_reverb.in_l');
    expect(edges(r.project)).toContain('tp_mmb_vco.out>tp_mmb_elements_reverb.in_r');
    expect(edges(r.project)).toContain('tp_mmb_elements_reverb.out_l>tp_mmb_vca.in');
    sane(r.project);
  });

  it('multi-module geeft een duidelijke melding', () => {
    const p0 = buildRecipe(base(), { source: 'vco' });
    const vco = findModuleByWord(p0, active(p0).id, 'vco')!;
    expect(() => replaceModule(p0, active(p0).id, vco.id, 'sampler')).toThrowError(/multi-module/);
  });

  it('zelfde type of onbekend type geeft RecipeError', () => {
    const p0 = buildRecipe(base(), { source: 'vco' });
    const vco = findModuleByWord(p0, active(p0).id, 'vco')!;
    expect(() => replaceModule(p0, active(p0).id, vco.id, 'vco')).toThrowError(RecipeError);
    expect(() => replaceModule(p0, active(p0).id, vco.id, 'theremin')).toThrowError(/Onbekende module/);
  });
});

describe('setVoices', () => {
  it('mono seedTestPatch → 4 stemmen: keten gevonden, groepen aangemaakt', () => {
    const p0 = seedTestPatch(base());
    const chain = findVoiceChain(p0, active(p0)).map((id) => typeOf(p0, id)).sort();
    expect(chain).toEqual(['tp_mmb_ahdsr', 'tp_mmb_vca', 'tp_mmb_vcf', 'tp_mmb_vco']);
    const r = setVoices(p0, active(p0).id, 4);
    expect(active(r.project).voiceCount).toBe(4);
    expect(rackOf(r.project).polyGroups!.length).toBe(4);
    expect(rackOf(r.project).polyGroups!.every((g) => g.voiceCount === 4 && g.members.length === 4)).toBe(true);
    expect(count(r.project, 'tp_mmb_vco')).toBe(4);
    expect(rackOf(r.project).rows).toBe(4);
    // Master-kabels ongewijzigd; de flatten maakt er per stem één van.
    expect(active(r.project).connections.length).toBe(active(p0).connections.length);
    expect(expandPatchConnections(active(r.project), r.project).length).toBeGreaterThan(active(p0).connections.length);
    // MIDI-in weet van 4 stemmen; de sequencer (geen event-source-rol) blijft globaal.
    const mi = r.project.modules.find((m) => m.typeId === 'tp_mmb_midiin' && rackOf(r.project).slots.some((s) => s.moduleId === m.id))!;
    expect(active(r.project).controlState[mi.id]).toMatchObject({ voiceCount: 4 });
    sane(r.project);
  });

  it('4 → 8: followers bijmaken en mixer vergroten', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const r = setVoices(p0, active(p0).id, 8);
    expect(count(r.project, 'tp_mmb_vco')).toBe(8);
    expect(count(r.project, 'tp_mmb_mixer')).toBe(0);
    expect(count(r.project, 'tp_mmb_mixer8')).toBe(1);
    expect(r.warnings.some((w) => w.includes('Mixer-8'))).toBe(true);
    const mixer = r.project.modules.find((m) => m.typeId === 'tp_mmb_mixer8'
      && rackOf(r.project).slots.some((s) => s.moduleId === m.id))!;
    expect(active(r.project).controlState[mixer.id]).toMatchObject({ vol8: 0.8 });
    expect(edges(r.project)).toContain('tp_mmb_vca.out>tp_mmb_mixer8.in1');
    sane(r.project);
  });

  it('8 → 2 → mono: followers weg, groepen weg', () => {
    const p0 = buildRecipe(base(), { voices: 8, source: 'vco', filter: 'ladder' });
    const r2 = setVoices(p0, active(p0).id, 2);
    expect(count(r2.project, 'tp_mmb_ladder')).toBe(2);
    expect(rackOf(r2.project).polyGroups!.every((g) => g.voiceCount === 2 && g.members.length === 2)).toBe(true);
    const r1 = setVoices(r2.project, active(r2.project).id, 1);
    expect(count(r1.project, 'tp_mmb_ladder')).toBe(1);
    expect(rackOf(r1.project).polyGroups).toEqual([]);
    expect(active(r1.project).voiceCount).toBe(1);
    // Geen wees-modules of -kabels.
    const ids = new Set(r1.project.modules.map((m) => m.id));
    for (const s of rackOf(r1.project).slots) expect(ids.has(s.moduleId)).toBe(true);
    sane(r1.project);
    expect(edges(r1.project)).toEqual(edges(p0));
  });

  it('zelfde aantal is een no-op', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const r = setVoices(p0, active(p0).id, 4);
    expect(r.project).toBe(p0);
  });
});

describe('addBusFx', () => {
  it('stereo effect tussen mixer en OUT', () => {
    const p0 = buildRecipe(base(), { voices: 2, source: 'vco' });
    const r = addBusFx(p0, active(p0).id, 'diode compressor');
    expect(edges(r.project)).toContain('tp_mmb_mixer.out_l>tp_mmb_diode_comp.in_l');
    expect(edges(r.project)).toContain('tp_mmb_diode_comp.out_r>tp_mmb_out.r');
    expect(edges(r.project)).not.toContain('tp_mmb_mixer.out_l>tp_mmb_out.l');
    sane(r.project);
  });

  it('mono effect als L/R-paar, achter een bestaand bus-effect', () => {
    const p0 = buildRecipe(base(), { source: 'vco', bus: ['diode'] });
    const r = addBusFx(p0, active(p0).id, 'tape');
    expect(count(r.project, 'tp_mmb_tape_echo')).toBe(2);
    expect(edges(r.project)).toContain('tp_mmb_diode_comp.out_l>tp_mmb_tape_echo.in');
    expect(edges(r.project)).toContain('tp_mmb_tape_echo.out>tp_mmb_out.l');
    sane(r.project);
  });

  it('seedTestPatch (VCA → OUT zonder mixer) werkt ook', () => {
    const p0 = seedTestPatch(base());
    const r = addBusFx(p0, active(p0).id, 'dattorro');
    expect(edges(r.project)).toContain('tp_mmb_vca.out>tp_mmb_elements_reverb.in_l');
    expect(edges(r.project)).toContain('tp_mmb_vca.out>tp_mmb_elements_reverb.in_r');
    sane(r.project);
  });
});

describe('addModulation', () => {
  it('LFO op de filter-cutoff van een poly master: één globale LFO', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const f = findModuleByWord(p0, active(p0).id, 'filter')!;
    const port = findPortByWord(p0, f, 'cutoff')!;
    expect(port).toBe('cv');
    const r = addModulation(p0, active(p0).id, 'lfo', { moduleId: f.id, portId: port });
    expect(r.warnings.some((w) => w.includes('al een kabel'))).toBe(true);   // envFlt zat er al op
    expect(count(r.project, 'tp_mmb_lfo')).toBe(2);   // vibrato-LFO + nieuwe
    expect(edges(r.project)).toContain('tp_mmb_lfo.out>tp_mmb_vcf.cv');
    sane(r.project);
  });

  it('envelope op een poly master wordt per stem, met MIDI-gate', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'vcf', filterEnv: false });
    const f = findModuleByWord(p0, active(p0).id, 'vcf')!;
    const r = addModulation(p0, active(p0).id, 'envelope', { moduleId: f.id, portId: 'cv' });
    expect(r.warnings).toEqual([]);
    expect(count(r.project, 'tp_mmb_ahdsr')).toBe(8);   // 4 amp + 4 nieuwe
    expect(rackOf(r.project).polyGroups!.some((g) => g.label === 'AHDSR' && g.members.length === 4)).toBe(true);
    expect(edges(r.project)).toContain('tp_mmb_midiin.gate>tp_mmb_ahdsr.gate');
    sane(r.project);
  });

  it('geen cv-ingang → RecipeError', () => {
    const p0 = buildRecipe(base(), { source: 'vco' });
    const f = findModuleByWord(p0, active(p0).id, 'filter')!;
    expect(() => addModulation(p0, active(p0).id, 'lfo', { moduleId: f.id, portId: 'in' })).toThrowError(RecipeError);
  });
});

describe('woorden → modules', () => {
  it('rolwoorden, aliassen, master vóór follower', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'wavetable', filter: 'ms20' });
    const pid = active(p0).id;
    const g = rackOf(p0).polyGroups!.find((x) => x.label === 'WT-VCO')!;
    expect(findModuleByWord(p0, pid, 'osc')!.id).toBe((g.members[0] as { moduleId: string }).moduleId);
    expect(findModuleByWord(p0, pid, 'wavetable')!.typeId).toBe('tp_mmb_wt_vco');
    expect(findModuleByWord(p0, pid, 'filter')!.typeId).toBe('tp_mmb_ms20');
    expect(findModuleByWord(p0, pid, 'korg')!.typeId).toBe('tp_mmb_ms20');
    expect(findModuleByWord(p0, pid, 'out')!.typeId).toBe('tp_mmb_out');
    expect(findModuleByWord(p0, pid, 'theremin')).toBeNull();
    const vco = findModuleByWord(p0, pid, 'osc')!;
    expect(findPortByWord(p0, vco, 'pitch')).toBe('tune');
    expect(findPortByWord(p0, vco, 'cutoff')).toBeNull();
  });
});
