import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { parseCommand } from './parse';
import { compileRecipe } from './compile';

const types = seedInternals(emptyModularProject()).moduleTypes;
const build = (s: string, active = true) => {
  const r = parseCommand(s, types, active);
  if (r.command.kind !== 'build') throw new Error(`geen build maar ${r.command.kind}: ${s}`);
  return { ...r, recipe: r.command.recipe };
};

describe('parser: nieuwe patch', () => {
  it('de voorbeeldvraag', () => {
    const r = build('maak een 8 x poly patch met een wavetable osc, een simpele VCF en een diode compressor op het eind');
    expect(r.recipe).toMatchObject({ voices: 8, source: 'tp_mmb_wt_vco', filter: 'tp_mmb_vcf', bus: ['tp_mmb_diode_comp'] });
    expect(r.unknown).toEqual([]);
    expect(r.summary).toBe('Nieuwe patch: 8× poly · WT-VCO → VCF → VCA · bus: Diode');
    expect(() => compileRecipe(seedInternals(emptyModularProject()), r.recipe)).not.toThrow();
  });

  it('stemmen in alle vormen', () => {
    expect(build('4 stemmige vco').recipe.voices).toBe(4);
    expect(build('4-stemmig vco').recipe.voices).toBe(4);
    expect(build('16x vco').recipe.voices).toBe(16);
    expect(build('poly 8 vco').recipe.voices).toBe(8);
    expect(build('mono string').recipe.voices).toBe(1);
    expect(build('een poly plaits').recipe.voices).toBe(4);
    expect(build('gewoon een vco').recipe.voices).toBeUndefined();
  });

  it('positiewoorden: per stem vs bus, en defaults', () => {
    const a = build('vco met een phaser per stem en een galm achteraan');
    expect(a.recipe.voiceFx).toEqual(['tp_mmb_phaser']);
    expect(a.recipe.bus).toEqual(['tp_mmb_elements_reverb']);
    const b = build('vco met comb en tape echo');
    expect(b.recipe.voiceFx).toEqual(['tp_mmb_comb']);      // mono fx: per stem
    expect(b.recipe.bus).toEqual(['tp_mmb_tape_echo']);      // echo: bus
    const c = build('vco, op de bus een fet compressor en een para eq');
    expect(c.recipe.bus).toEqual(['tp_mmb_fet_comp', 'tp_mmb_para_eq']);
    const d = build('vco met een vari-mu per stem');        // stereo-only kan niet per stem
    expect(d.recipe.bus).toEqual(['tp_mmb_varimu_comp']);
    expect(d.recipe.voiceFx).toBeUndefined();
  });

  it('ontkenningen en vlaggen', () => {
    expect(build('string zonder filter').recipe.filter).toBeNull();
    expect(build('vco zonder envelope').recipe.ampEnv).toBe(false);
    expect(build('vco zonder vibrato').recipe.vibrato).toBe(false);
    expect(build('vco met vibrato').recipe.vibrato).toBe(true);
    expect(build('vco met een lfo per stem').recipe.voiceLfo).toBe(true);
    expect(build('ladder filter met lfo op het filter').recipe.voiceLfo).toBe(true);
  });

  it('onbekende woorden blijven over', () => {
    const r = build('een 4 stemmige wavetable met een theremin');
    expect(r.recipe.source).toBe('tp_mmb_wt_vco');
    expect(r.unknown).toEqual(['theremin']);
  });

  it('tweede bron wordt gemeld', () => {
    const r = build('vco en string');
    expect(r.recipe.source).toBe('tp_mmb_vco');
    expect(r.unknown[0]).toMatch(/tweede bron/);
  });

  it('engels', () => {
    const r = build('make a new 8 voice patch with a moog filter and a diode compressor at the end');
    expect(r.recipe).toMatchObject({ voices: 8, source: 'vco', filter: 'tp_mmb_ladder', bus: ['tp_mmb_diode_comp'] });
    expect(r.unknown).toEqual([]);
  });
});

describe('parser: bewerkingen', () => {
  it('vervang', () => {
    expect(parseCommand('vervang de osc door een wavetable', types).command).toEqual({ kind: 'replace', from: 'osc', to: 'wavetable' });
    expect(parseCommand('replace the filter with a ladder', types).command).toEqual({ kind: 'replace', from: 'filter', to: 'ladder' });
    expect(parseCommand('vervang vcf door ms-20', types).command).toEqual({ kind: 'replace', from: 'vcf', to: 'ms-20' });
  });

  it('stemmen', () => {
    expect(parseCommand('maak deze patch 4 stemmig', types).command).toEqual({ kind: 'voices', voices: 4 });
    expect(parseCommand('naar mono', types).command).toEqual({ kind: 'voices', voices: 1 });
    expect(parseCommand('maak er 8 stemmen van', types).command).toEqual({ kind: 'voices', voices: 8 });
    expect(parseCommand('van mono naar 4x poly', types).command).toEqual({ kind: 'voices', voices: 4 });
    expect(parseCommand('8 stemmig', types).command).toEqual({ kind: 'voices', voices: 8 });
    // Zonder actieve patch is een kaal stemmental een nieuwe patch.
    expect(parseCommand('8 stemmig', types, false).command.kind).toBe('build');
    // Met 'nieuw' altijd een nieuwe patch.
    expect(parseCommand('nieuwe 8 stemmige patch', types).command.kind).toBe('build');
  });

  it('bus-effect', () => {
    expect(parseCommand('voeg een tape echo toe op de bus', types).command).toEqual({ kind: 'addBus', module: 'tape echo' });
    expect(parseCommand('zet een diode compressor op het eind', types).command).toEqual({ kind: 'addBus', module: 'diode compressor' });
    expect(parseCommand('add a reverb at the end', types).command).toEqual({ kind: 'addBus', module: 'reverb' });
  });

  it('modulatie', () => {
    expect(parseCommand('zet een lfo op de cutoff van het filter', types).command)
      .toEqual({ kind: 'addModulation', source: 'lfo', target: 'filter', port: 'cutoff' });
    expect(parseCommand('voeg een envelope toe op de vco tune', types).command)
      .toEqual({ kind: 'addModulation', source: 'envelope', target: 'vco', port: 'tune' });
    expect(parseCommand('add an lfo to the filter', types).command)
      .toEqual({ kind: 'addModulation', source: 'lfo', target: 'filter', port: null });
  });
});
