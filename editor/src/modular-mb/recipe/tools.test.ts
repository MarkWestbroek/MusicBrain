import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { buildRecipe } from './compile';
import { TOOLS, openAiTools, runTool, commandForTool, patchSummary, summarizePatch } from './tools';
import { runCommands } from './commands';
import { RecipeError } from './types';

const base = () => seedInternals(emptyModularProject());

describe('tooldefinities', () => {
  it('elke tool heeft een JSON-schema van type object en een OpenAI-vorm', () => {
    for (const t of TOOLS) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(20);
    }
    const oa = openAiTools() as { type: string; function: { name: string; parameters: unknown } }[];
    expect(oa.map((x) => x.function.name)).toEqual(TOOLS.map((t) => t.name));
    expect(oa[0]!.type).toBe('function');
  });
});

describe('leestools', () => {
  it('list_module_types en get_module_type', () => {
    const p = base();
    const list = runTool(p, 'list_module_types').content as { typeId: string; kind: string }[];
    expect(list.some((x) => x.typeId === 'tp_mmb_wt_vco' && x.kind === 'source')).toBe(true);
    const t = runTool(p, 'get_module_type', { typeId: 'moog' }).content as { typeId: string; ports: { id: string }[]; controls: { id: string; min?: number }[] };
    expect(t.typeId).toBe('tp_mmb_ladder');
    expect(t.ports.map((q) => q.id)).toContain('cv');
    expect(t.controls.find((c) => c.id === 'cutoff')?.min).toBeDefined();
    expect(() => runTool(p, 'get_module_type', { typeId: 'flanger' })).toThrowError(RecipeError);
  });

  it('list_patches en get_patch_summary', () => {
    const p = buildRecipe(base(), { voices: 4, source: 'vco', filter: 'ladder' });
    const patches = runTool(p, 'list_patches').content as { active: boolean }[];
    expect(patches.filter((x) => x.active).length).toBe(1);
    const s = runTool(p, 'get_patch_summary').content as ReturnType<typeof patchSummary> & { text: string };
    expect(s!.voices).toBe(4);
    expect(s!.modules.filter((m) => m.typeId === 'tp_mmb_ladder').length).toBe(1);   // geen followers
    expect(s!.modules.find((m) => m.typeId === 'tp_mmb_ladder')!.poly).toBe(4);
    expect(s!.connections.some((c) => c.from.startsWith('MIDI-In#') && c.to.endsWith('.voct'))).toBe(true);
    expect(s!.text).toBe(summarizePatch(p));
    expect(() => runTool(base(), 'get_patch_summary')).toThrowError(/Geen/);
  });

  it('compile_recipe: droogloop bouwt niets', () => {
    const p = base();
    const ok = runTool(p, 'compile_recipe', { recipe: { voices: 8, source: 'wavetable', bus: ['diode'] } });
    expect(ok.content).toMatchObject({ ok: true, summary: expect.stringContaining('8× poly') });
    expect(ok.project).toBeUndefined();
    const bad = runTool(p, 'compile_recipe', { recipe: { source: 'lfo' } });
    expect(bad.content).toMatchObject({ ok: false, error: expect.stringContaining('audio-uitgang') });
  });
});

describe('wijzigende tools', () => {
  it('build_patch → set_voices → add_bus_fx → replace_module → add_modulation', () => {
    let p = base();
    const b = runTool(p, 'build_patch', { recipe: { voices: 2, source: 'vco' } });
    expect(b.command?.kind).toBe('build');
    p = b.project!;
    expect(p.patches.length).toBe(1);
    p = runTool(p, 'set_voices', { voices: 4 }).project!;
    expect(p.patches[0]!.voiceCount).toBe(4);
    p = runTool(p, 'add_bus_fx', { module: 'diode compressor' }).project!;
    expect(p.modules.some((m) => m.typeId === 'tp_mmb_diode_comp' && !m.internal)).toBe(true);
    const r = runTool(p, 'replace_module', { from: 'osc', to: 'wavetable' });
    expect(r.content).toMatchObject({ ok: true, summary: expect.stringContaining('WT-VCO') });
    p = r.project!;
    const m = runTool(p, 'add_modulation', { source: 'tp_mmb_lfo', target: 'filter', port: 'cutoff' });
    expect(m.content).toMatchObject({ ok: true });
    p = m.project!;
    expect(p.patches[0]!.connections.some((c) => c.to.portId === 'cv')).toBe(true);
  });

  it('set_active_patch en fouten', () => {
    let p = buildRecipe(base(), { source: 'vco' });
    p = buildRecipe(p, { source: 'string' });
    const first = p.patches[0]!.id;
    const r = runTool(p, 'set_active_patch', { patchId: first });
    expect(r.project!.activePatchId).toBe(first);
    expect(() => runTool(p, 'set_active_patch', { patchId: 'nope' })).toThrowError(RecipeError);
    expect(() => runTool(p, 'nonexistent_tool')).toThrowError(/Onbekende tool/);
    expect(() => runTool(base(), 'set_voices', { voices: 4 })).toThrowError(/Geen actieve patch/);
  });

  it('commandForTool: leestools geven null, wijzigende een Command', () => {
    expect(commandForTool('list_patches', {})).toBeNull();
    expect(commandForTool('set_voices', { voices: '8' })).toEqual({ kind: 'voices', voices: 8 });
    expect(commandForTool('add_modulation', { source: 'tp_mmb_lfo', target: 'filter' })).toEqual({ kind: 'addModulation', source: 'tp_mmb_lfo', target: 'filter', port: null });
    expect(() => commandForTool('replace_module', { from: 'osc' })).toThrowError(/"to" ontbreekt/);
  });

  it('runCommands voert een reeks uit als één geheel', () => {
    const r = runCommands(base(), [
      { kind: 'build', recipe: { voices: 2, source: 'vco' }, mentioned: [], explicitNew: true },
      { kind: 'addBus', module: 'galm' },
      { kind: 'voices', voices: 4 },
    ]);
    expect(r.project.patches[0]!.voiceCount).toBe(4);
    expect(r.summary).toMatch(/Gebouwd.*Reverb.*4-stemmig/);
  });
});
