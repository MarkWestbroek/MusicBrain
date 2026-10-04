// AI-frontrecept (doc/plans/patch-front.md stap 3b): van voorstel naar front.

import { describe, expect, it } from 'vitest';

import { applyFrontSpec, frontCandidates } from './frontRecipe';
import { frontIssues } from './fronts';
import { runCommand } from './recipe/commands';
import { buildRecipe } from './recipe/compile';
import { commandForTool, runTool } from './recipe/tools';
import { seedInternals } from './seedModules';
import { emptyModularProject, type ModularProject, type Patch } from './types';

const base = () => seedInternals(emptyModularProject());
const active = (p: ModularProject): Patch => p.patches.find((x) => x.id === p.activePatchId)!;

describe('frontCandidates', () => {
  it('geeft per module de controls met rang, en het automatische front als vertrekpunt', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const c = frontCandidates(p) as { modules: { type: string; controls: { id: string; rank: number }[] }[]; autoFront: unknown[] };
    const vcf = c.modules.find((m) => m.type === 'tp_mmb_vcf')!;
    expect(vcf.controls[0]).toMatchObject({ id: 'cutoff', rank: 1 });
    expect(c.autoFront.length).toBeGreaterThan(0);
  });
});

describe('applyFrontSpec', () => {
  it('lost woorden op, slaat onbekende items over met een waarschuwing, en het front klopt', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const r = applyFrontSpec(p, active(p).id, {
      name: 'Spelen', description: 'Draai aan Helderheid.', columns: 2,
      items: [
        { kind: 'group', text: 'Klank' },
        { kind: 'control', module: 'filter', control: 'cutoff', label: 'Helderheid', size: 'large' },
        { kind: 'control', module: 'filter', control: 'bestaat_niet' },
        { kind: 'control', module: 'theremin', control: 'x' },
        { kind: 'port', module: 'filter', port: 'cv', label: 'Expressie' },
      ],
    }, 'front_x');
    const f = active(r.project).fronts![0]!;
    expect(f).toMatchObject({ id: 'front_x', name: 'Spelen', columns: 2, description: 'Draai aan Helderheid.' });
    expect(f.items.map((it) => it.kind)).toEqual(['group', 'control', 'port']);
    expect(f.items[1]).toMatchObject({ controlId: 'cutoff', label: 'Helderheid', size: 'large' });
    expect(r.warnings).toHaveLength(2);
    expect(frontIssues(active(r.project), r.project)).toEqual([]);
    expect(r.summary).toContain('Nieuw front');
  });

  it('vervangt een front met dezelfde naam en weigert een leeg front', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    const id = active(p).id;
    const r1 = applyFrontSpec(p, id, { name: 'Spelen', items: [{ kind: 'control', module: 'filter', control: 'cutoff' }] }, 'front_a');
    const r2 = applyFrontSpec(r1.project, id, { name: 'Spelen', items: [{ kind: 'control', module: 'filter', control: 'q' }] }, 'front_b');
    expect(active(r2.project).fronts).toHaveLength(1);
    expect(active(r2.project).fronts![0]).toMatchObject({ id: 'front_a' });
    expect(r2.summary).toContain('vervangen');
    expect(() => applyFrontSpec(p, id, { name: 'Leeg', items: [{ kind: 'control', module: 'theremin', control: 'x' }] }, 'f')).toThrow(/geen enkele/);
  });
});

describe('tools: get_front_candidates en propose_front', () => {
  it('lopen via commandForTool en runCommand', () => {
    const p = buildRecipe(base(), { voices: 1, source: 'vco', filter: 'vcf' });
    expect(runTool(p, 'get_front_candidates').content).toHaveProperty('modules');
    const cmd = commandForTool('propose_front', { name: 'AI', columns: 3, items: [{ kind: 'control', module: 'filter', control: 'cutoff' }] })!;
    expect(cmd).toMatchObject({ kind: 'front', spec: { name: 'AI', columns: 3 } });
    const r = runCommand(p, cmd);
    expect(active(r.project).fronts![0]).toMatchObject({ name: 'AI', columns: 3 });
    const viaTool = runTool(p, 'propose_front', { name: 'AI2', items: [{ kind: 'control', module: 'filter', control: 'cutoff' }] });
    expect(viaTool.project && active(viaTool.project).fronts![0]!.name).toBe('AI2');
  });
});
