import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedTestPatch } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { buildRecipe, validateOps } from './compile';
import {
  replaceModule, setVoices, addBusFx, addModulation, moveModule, removeModule, setControls, spreadVoices, findVoiceChain, findModuleByWord, findPortByWord,
  feedCvInput, disconnectPorts, addMidiModulation,
} from './edits';
import { runCommand } from './commands';
import { RecipeError } from './types';
import { parseCommand } from './parse';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject) => p.patches.find((x) => x.id === p.activePatchId)!;
const rackOf = (p: ModularProject) => p.racks.find((r) => r.id === p.activeRackId)!;
const typeOf = (p: ModularProject, id: string) => p.modules.find((m) => m.id === id)!.typeId;
const edges = (p: ModularProject) => active(p).connections
  .map((c) => `${typeOf(p, c.from.moduleId)}.${c.from.portId}>${typeOf(p, c.to.moduleId)}.${c.to.portId}`).sort();
const count = (p: ModularProject, typeId: string) =>
  rackOf(p).slots.filter((s) => typeOf(p, s.moduleId) === typeId).length;
/** Wat er vóór de bewerking op `moduleId`.cv zat, als "type.poort>type.poort". */
const oldFeed = (p: ModularProject, moduleId: string) => {
  const c = active(p).connections.find((x) => x.to.moduleId === moduleId && x.to.portId === 'cv')!;
  return `${typeOf(p, c.from.moduleId)}.${c.from.portId}>${typeOf(p, moduleId)}.cv`;
};
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

describe('moveModule en removeModule', () => {
  const rowOrder = (p: ModularProject) => rackOf(p).slots.filter((s) => s.row === 0).sort((a, b) => a.hpOffset - b.hpOffset).map((s) => typeOf(p, s.moduleId));
  it('vibe en out omwisselen; poly-kolom verhuist mee; kabels blijven gelijk', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco', bus: ['vibe'] });
    const pid = active(p0).id;
    const before = rowOrder(p0);
    expect(before.indexOf('tp_mmb_out')).toBeLessThan(before.indexOf('tp_mmb_vibe'));
    const r = moveModule(p0, pid, findModuleByWord(p0, pid, 'vibe')!.id, 'swap', findModuleByWord(p0, pid, 'out')!.id);
    const after = rowOrder(r.project);
    expect(after.indexOf('tp_mmb_vibe')).toBeLessThan(after.indexOf('tp_mmb_out'));
    expect(edges(r.project)).toEqual(edges(p0));
    // Geen overlap in rij 0.
    const s0 = rackOf(r.project).slots.filter((s) => s.row === 0).sort((a, b) => a.hpOffset - b.hpOffset);
    for (let i = 1; i < s0.length; i++) expect(s0[i]!.hpOffset).toBeGreaterThanOrEqual(s0[i - 1]!.hpOffset + r.project.modules.find((m) => m.id === s0[i - 1]!.moduleId)!.visual.hpWidth);
    // Filter vóór de osc zetten: de hele poly-kolom verhuist, followers recht onder hun master.
    const q = moveModule(p0, pid, findModuleByWord(p0, pid, 'filter')!.id, 'before', findModuleByWord(p0, pid, 'osc')!.id);
    const o = rowOrder(q.project);
    expect(o.indexOf('tp_mmb_vcf')).toBeLessThan(o.indexOf('tp_mmb_vco'));
    for (const g of rackOf(q.project).polyGroups!) {
      const offs = g.members.map((m) => rackOf(q.project).slots.find((s) => s.moduleId === m.moduleId)!.hpOffset);
      expect(new Set(offs).size).toBe(1);
    }
    sane(q.project);
  });

  it('VCA weghalen: audio doorverbonden, envelope en CvMath die hem stuurden gaan mee', () => {
    const p0 = buildRecipe(base(), { voices: 2, source: 'dx7', filter: null, filterEnv: false });
    const pid = active(p0).id;
    const r = removeModule(p0, pid, findModuleByWord(p0, pid, 'vca')!.id);
    const e = edges(r.project);
    expect(e).toContain('tp_mmb_dx7.out>tp_mmb_mixer.in1');
    expect(count(r.project, 'tp_mmb_vca')).toBe(0);
    expect(count(r.project, 'tp_mmb_ahdsr')).toBe(0);
    expect(count(r.project, 'tp_mmb_cvmath')).toBe(0);        // velocity-CvMath mee weg; DX7 heeft geen tune, dus geen vibrato-CvMath
    expect(r.summary).toMatch(/ook weg.*AHDSR/);
    expect(e.some((x) => x.includes('tp_mmb_midiin.gate'))).toBe(true);   // MIDI-in blijft (dx7.gate)
    sane(r.project);
  });

  it('parser: wissel, zet voor/na, haal weg', () => {
    const types = base().moduleTypes;
    expect(parseCommand('wissel de vibe en de out om', types).command).toEqual({ kind: 'move', module: 'vibe', relation: 'swap', target: 'out' });
    expect(parseCommand('zet de vibe voor de out', types).command).toEqual({ kind: 'move', module: 'vibe', relation: 'before', target: 'out' });
    expect(parseCommand('verplaats de out naar achter de vibe', types).command).toEqual({ kind: 'move', module: 'out', relation: 'after', target: 'vibe' });
    expect(parseCommand('haal de vca weg', types).command).toEqual({ kind: 'remove', module: 'vca' });
    expect(parseCommand('remove the envelope', types).command).toEqual({ kind: 'remove', module: 'envelope' });
  });
});

describe('knoppen: setControls en spreadVoices', () => {
  it('knop op naam, poly-groep krijgt overal dezelfde stand, bereik begrensd, schakelaar op naam', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco', bus: ['vibe'] });
    const pid = active(p0).id;
    const vcf = findModuleByWord(p0, pid, 'filter')!;
    const r = setControls(p0, pid, vcf.id, { Cutoff: 1200, q: 999 });
    const g = rackOf(r.project).polyGroups!.find((x) => x.members.some((m) => m.moduleId === vcf.id))!;
    for (const m of g.members) expect(active(r.project).controlState[m.moduleId]!.cutoff).toBe(1200);
    expect(Number(active(r.project).controlState[vcf.id]!.q)).toBeLessThan(999);
    expect(r.warnings.some((w) => /q/.test(w))).toBe(true);
    const vibe = findModuleByWord(p0, pid, 'vibe')!;
    const s = setControls(p0, pid, vibe.id, { mode: 'vibrato' });
    expect(active(s.project).controlState[vibe.id]!.mode).toBe(1);
    expect(() => setControls(p0, pid, vibe.id, { bestaatniet: 1 })).toThrowError(RecipeError);
  });

  it('8 stemmen van links naar rechts; smaller met width', () => {
    const p0 = buildRecipe(base(), { voices: 8, source: 'dx7', filter: null });
    const pid = active(p0).id;
    const r = spreadVoices(p0, pid);
    const mixer = r.project.modules.find((m) => m.typeId === 'tp_mmb_mixer8' && rackOf(r.project).slots.some((s) => s.moduleId === m.id))!;
    const cs = active(r.project).controlState[mixer.id]!;
    expect([cs.pan1, cs.pan2, cs.pan8]).toEqual([-1, -0.714, 1]);
    const half = spreadVoices(p0, pid, 0.5);
    expect(active(half.project).controlState[mixer.id]!.pan1).toBe(-0.5);
    const mono = buildRecipe(base(), { source: 'vco' });
    expect(() => spreadVoices(mono, active(mono).id)).toThrowError(/één/);
  });

  it('parser', () => {
    const types = base().moduleTypes;
    expect(parseCommand('zet de cutoff van het filter op 1200', types).command).toEqual({ kind: 'set', module: 'filter', values: { cutoff: 1200 } });
    expect(parseCommand('wil je 8 uitgangen van de mixer pannen van L naar R?', types).command.kind).not.toBe('spread');   // dat is voor de AI
    expect(parseCommand('pan de stemmen van links naar rechts', types).command).toEqual({ kind: 'spread', width: 1 });
    expect(parseCommand('spreid de stemmen over 50% van het stereobeeld', types).command).toEqual({ kind: 'spread', width: 0.5 });
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
  it('LFO op de filter-cutoff van een poly master: één globale LFO, opgeteld bij de filter-envelope', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const f = findModuleByWord(p0, active(p0).id, 'filter')!;
    const port = findPortByWord(p0, f, 'cutoff')!;
    expect(port).toBe('cv');
    const r = addModulation(p0, active(p0).id, 'lfo', { moduleId: f.id, portId: port });
    expect(count(r.project, 'tp_mmb_lfo')).toBe(2);   // vibrato-LFO + nieuwe
    expect(count(r.project, 'tp_mmb_cvmath') - count(p0, 'tp_mmb_cvmath')).toBe(4);   // envFlt zat er al op → optellen per stem
    expect(edges(r.project)).toContain('tp_mmb_lfo.out>tp_mmb_cvmath.b');
    expect(edges(r.project)).toContain(oldFeed(p0, f.id).replace(/>.*/, '>tp_mmb_cvmath.a'));
    expect(edges(r.project)).toContain('tp_mmb_cvmath.out>tp_mmb_vcf.cv');
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

describe('kabels: feedCvInput, disconnectPorts, MIDI-bronnen', () => {
  it('aftertouch op een vrije cutoff: gewone kabel', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'vcf', filterEnv: false });
    const f = findModuleByWord(p0, active(p0).id, 'vcf')!;
    const r = addMidiModulation(p0, active(p0).id, 'aftertouch', { moduleId: f.id, portId: 'cv' });
    expect(edges(r.project)).toContain('tp_mmb_midiin.press>tp_mmb_vcf.cv');
    expect(count(r.project, 'tp_mmb_cvmath')).toBe(count(p0, 'tp_mmb_cvmath'));
    sane(r.project);
  });

  it('aftertouch op een bezette cutoff: optel-CvMath per stem, envelope blijft', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const f = findModuleByWord(p0, active(p0).id, 'filter')!;
    const r = addMidiModulation(p0, active(p0).id, 'druk', { moduleId: f.id, portId: 'cv' }, 0.5);
    expect(count(r.project, 'tp_mmb_cvmath') - count(p0, 'tp_mmb_cvmath')).toBe(4);
    expect(rackOf(r.project).polyGroups!.some((g) => g.label === 'CvSum' && g.members.length === 4)).toBe(true);
    const e = edges(r.project);
    expect(e).toContain('tp_mmb_midiin.press>tp_mmb_cvmath.b');
    expect(e).toContain(oldFeed(p0, f.id).replace(/>.*/, '>tp_mmb_cvmath.a'));
    expect(e).toContain('tp_mmb_cvmath.out>tp_mmb_vcf.cv');
    expect(e).not.toContain(oldFeed(p0, f.id));
    const cm = { id: active(r.project).connections.find((c) => c.to.moduleId === f.id && c.to.portId === 'cv')!.from.moduleId };
    expect(active(r.project).controlState[cm.id]).toMatchObject({ mode: 0, gain_a: 1, gain_b: 0.5 });
    sane(r.project);

    // Derde bron: de bestaande CvMath krijgt ingang c, geen nieuwe modules.
    const r2 = addMidiModulation(r.project, active(r.project).id, 'modwheel', { moduleId: f.id, portId: 'cv' }, 0.3);
    expect(count(r2.project, 'tp_mmb_cvmath')).toBe(count(r.project, 'tp_mmb_cvmath'));
    expect(edges(r2.project)).toContain('tp_mmb_midiin.cv_mod>tp_mmb_cvmath.c');
    expect(active(r2.project).controlState[cm.id]!.gain_c).toBeCloseTo(0.3);
    sane(r2.project);
  });

  it('dubbele kabel en verkeerd signaaltype → RecipeError', () => {
    const p0 = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf', filterEnv: false });
    const f = findModuleByWord(p0, active(p0).id, 'vcf')!;
    const r = addMidiModulation(p0, active(p0).id, 'bend', { moduleId: f.id, portId: 'cv' });
    expect(() => addMidiModulation(r.project, active(r.project).id, 'bend', { moduleId: f.id, portId: 'cv' })).toThrowError(RecipeError);
    expect(() => addMidiModulation(p0, active(p0).id, 'bananen', { moduleId: f.id, portId: 'cv' })).toThrowError(RecipeError);
  });

  it('disconnectPorts haalt de kabel weg', () => {
    const p0 = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf', filterEnv: false });
    const f = findModuleByWord(p0, active(p0).id, 'vcf')!;
    const r = addMidiModulation(p0, active(p0).id, 'velocity', { moduleId: f.id, portId: 'cv' });
    const d = disconnectPorts(r.project, active(r.project).id, { moduleId: f.id, portId: 'cv' });
    expect(edges(d.project)).not.toContain('tp_mmb_midiin.vel>tp_mmb_vcf.cv');
    expect(() => disconnectPorts(d.project, active(d.project).id, { moduleId: f.id, portId: 'cv' })).toThrowError(RecipeError);
    void feedCvInput;
  });

  it('commando: "zet de aftertouch op de cutoff van het filter"', () => {
    const p0 = buildRecipe(base(), { voices: 4, source: 'vco' });
    const cmd = parseCommand('zet de aftertouch op de cutoff van het filter', p0.moduleTypes).command;
    expect(cmd).toMatchObject({ kind: 'addModulation', source: 'aftertouch' });
    const r = runCommand(p0, cmd);
    expect(edges(r.project)).toContain('tp_mmb_midiin.press>tp_mmb_cvmath.b');
    sane(r.project);
  });

  it('commando connect/disconnect met poortnamen', () => {
    const p0 = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf', filterEnv: false });
    const r = runCommand(p0, { kind: 'connect', from: { module: 'midi', port: 'aftertouch' }, to: { module: 'filter', port: 'cutoff' } });
    expect(edges(r.project)).toContain('tp_mmb_midiin.press>tp_mmb_vcf.cv');
    const d = runCommand(r.project, { kind: 'disconnect', to: { module: 'filter', port: 'cv' } });
    expect(edges(d.project)).not.toContain('tp_mmb_midiin.press>tp_mmb_vcf.cv');
    expect(() => runCommand(p0, { kind: 'connect', from: { module: 'filter', port: 'bestaatniet' }, to: { module: 'vca', port: 'cv' } })).toThrowError(RecipeError);
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
