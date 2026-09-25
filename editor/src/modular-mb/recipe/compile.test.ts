// Recept-compiler (ED-RC-1): pariteit met seedPolyVoicePatch, geldigheid en
// alias-resolutie. Zie doc/plans/patch-recept.md.

import { describe, it, expect } from 'vitest';
import { emptyModularProject, type ModularProject } from '../types';
import { seedInternals, seedPolyVoicePatch, type PolySeedOptions } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import { compileRecipe, applyOps, buildRecipe } from './compile';
import { resolveTypeId, normalizeAlias, portRoles } from './catalog';
import { RecipeError, type PatchRecipe } from './types';

/**
 * Topologie-vingerafdruk van het actieve rack + patch, onafhankelijk van id's
 * en layout: multiset van moduletypes, kabels op type+poort-niveau, poly-
 * groepen (label, N, ledenaantal, type) en knopstanden per type.
 */
function signature(p: ModularProject) {
  const rack = p.racks.find((r) => r.id === p.activeRackId)!;
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const inRack = new Set(rack.slots.map((s) => s.moduleId));
  const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
  const canon = (o: Record<string, unknown>) =>
    JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
  return {
    voiceCount: patch.voiceCount,
    rows: rack.rows,
    types: [...inRack].map(typeOf).sort(),
    edges: patch.connections
      .map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`)
      .sort(),
    groups: (rack.polyGroups ?? [])
      .map((g) => `${g.label}:${g.voiceCount}:${g.members.length}:${typeOf((g.members[0] as { moduleId: string }).moduleId)}`)
      .sort(),
    controls: Object.entries(patch.controlState)
      .filter(([id]) => inRack.has(id))
      .map(([id, v]) => `${typeOf(id)}:${canon(v)}`)
      .sort(),
    expanded: expandPatchConnections(patch, p).length,
  };
}

const base = () => seedInternals(emptyModularProject());

describe('pariteit met seedPolyVoicePatch', () => {
  const cases: { name: string; n: number; opts: PolySeedOptions; recipe: PatchRecipe }[] = [
    { name: 'mono standaard', n: 1, opts: {}, recipe: { voices: 1, source: 'vco' } },
    { name: '4 stemmen standaard', n: 4, opts: {}, recipe: { voices: 4, source: 'vco' } },
    { name: '8 stemmen standaard', n: 8, opts: {}, recipe: { voices: 8, source: 'vco' } },
    { name: '16 stemmen standaard', n: 16, opts: {}, recipe: { voices: 16, source: 'vco' } },
    { name: 'ladder + comb', n: 4, opts: { filterType: 'ladder', perVoiceFx: 'comb' },
      recipe: { voices: 4, source: 'vco', filter: 'ladder', voiceFx: ['comb'] } },
    { name: 'ms20 + phaser + LFO per stem', n: 4, opts: { filterType: 'ms20', perVoiceFx: 'phaser', perVoiceLfo: true },
      recipe: { voices: 4, source: 'vco', filter: 'ms20', voiceFx: ['phaser'], voiceLfo: true } },
    { name: 'bus-echo', n: 2, opts: { busEchoSeconds: 0.5 },
      recipe: { voices: 2, source: 'vco', bus: [{ type: 'echo', controls: { time: 0.5 } }] } },
    { name: 'string-bron', n: 4, opts: { voiceSource: 'string' },
      // De seed plaatst óók bij String de (ongebruikte) vibrato-modules; het
      // recept niet. Vergelijk daarom zonder die drie modules.
      recipe: { voices: 4, source: 'string' } },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const want = signature(seedPolyVoicePatch(base(), tc.n, tc.opts));
      const got  = signature(buildRecipe(base(), tc.recipe));
      if (tc.opts.voiceSource === 'string') {
        // Ongebruikte vibrato-modules (LFO + 2× CvMath) uit de seed-verwachting halen.
        const drop = ['tp_mmb_lfo', 'tp_mmb_cvmath', 'tp_mmb_cvmath'];
        for (const d of drop) want.types.splice(want.types.indexOf(d), 1);
        want.controls = want.controls.filter((c) =>
          !c.startsWith('tp_mmb_lfo:') && !c.startsWith('tp_mmb_cvmath:{"gain_a":0.04')
          && !(c.startsWith('tp_mmb_cvmath:') && c.includes('"mode":1') && want.controls.filter((x) => x === c).length === 1));
        // CvMath vel×env per stem blijft (4×); de vibDepth-CvMath (mode 1, 1×) is weg.
        expect(got.controls.filter((c) => c.startsWith('tp_mmb_cvmath:')).length).toBe(tc.n);
        want.controls = want.controls.filter((c) => !c.startsWith('tp_mmb_cvmath:'));
        got.controls  = got.controls.filter((c) => !c.startsWith('tp_mmb_cvmath:'));
      }
      expect(got).toEqual(want);
    });
  }
});

describe('nieuwe recepten', () => {
  it('8× poly wavetable → vcf, diode-compressor op de bus', () => {
    const r = compileRecipe(base(), { voices: 8, source: 'wavetable', filter: 'simpele vcf', bus: ['diode compressor'] });
    expect(r.warnings).toEqual([]);
    expect(r.summary).toBe('8× poly · WT-VCO → envFlt → VCF → envAmp → CvMath → VCA · bus: Diode');
    const p = applyOps(base(), r.ops);
    const sig = signature(p);
    expect(sig.types.filter((t) => t === 'tp_mmb_wt_vco').length).toBe(8);
    expect(sig.types.filter((t) => t === 'tp_mmb_diode_comp').length).toBe(1);   // stereo: één instantie
    expect(sig.types).toContain('tp_mmb_mixer8');
    expect(sig.edges).toContain('tp_mmb_mixer8.out_l>tp_mmb_diode_comp.in_l');
    expect(sig.edges).toContain('tp_mmb_diode_comp.out_r>tp_mmb_out.r');
    expect(sig.groups.length).toBe(6);
    // Flatten: elke master-kabel in de stemketen wordt ×8.
    expect(sig.expanded).toBeGreaterThan(sig.edges.length);
  });

  it('mono bus-keten met mono én stereo effecten', () => {
    const p = buildRecipe(base(), { source: 'vco', bus: ['tape', 'dattorro'] });
    const sig = signature(p);
    expect(sig.types.filter((t) => t === 'tp_mmb_tape_echo').length).toBe(2);        // mono → L/R-paar
    expect(sig.types.filter((t) => t === 'tp_mmb_elements_reverb').length).toBe(1);  // stereo
    expect(sig.edges).toContain('tp_mmb_tape_echo.out>tp_mmb_elements_reverb.in_l');
    expect(sig.edges).toContain('tp_mmb_elements_reverb.out_l>tp_mmb_out.l');
    // R-kant iets kortere tijd (widen).
    const times = sig.controls.filter((c) => c.startsWith('tp_mmb_tape_echo:')).map((c) => JSON.parse(c.slice('tp_mmb_tape_echo:'.length)).time);
    expect(new Set(times).size).toBe(2);
  });

  it('stereo bron zonder keten (mono) gaat L/R op twee mixerkanalen', () => {
    const r = compileRecipe(base(), { source: 'rings', filter: null, ampEnv: false, velocity: false });
    expect(r.warnings).toEqual([]);
    const sig = signature(applyOps(base(), r.ops));
    expect(sig.edges).toContain('tp_mmb_rings.out_l>tp_mmb_mixer.in1');
    expect(sig.edges).toContain('tp_mmb_rings.out_r>tp_mmb_mixer.in2');
    expect(sig.edges).toContain('tp_mmb_midiin.gate>tp_mmb_rings.gate');
    expect(sig.types).not.toContain('tp_mmb_vca');
  });

  it('stereo bron in een poly-keten waarschuwt en gebruikt L', () => {
    const r = compileRecipe(base(), { voices: 4, source: 'elements' });
    expect(r.warnings.some((w) => w.includes('stereo'))).toBe(true);
    const sig = signature(applyOps(base(), r.ops));
    expect(sig.edges).toContain('tp_mmb_elements.out_l>tp_mmb_vcf.in');
    expect(sig.edges).toContain('tp_mmb_midiin.vel>tp_mmb_elements.strength');
  });

  it('STK: vibrato via modulation, geen bendSum', () => {
    const sig = signature(buildRecipe(base(), { voices: 2, source: 'stk' }));
    expect(sig.edges).toContain('tp_mmb_cvmath.out>tp_mmb_stk_sound.modulation');
    expect(sig.edges).not.toContain('tp_mmb_midiin.cv_bend>tp_mmb_cvmath.b');
    expect(sig.edges).toContain('tp_mmb_midiin.vel>tp_mmb_stk_sound.strength');
  });

  it('seedInternals-op alleen als het project types mist', () => {
    const empty = compileRecipe(emptyModularProject(), { source: 'vco' });
    expect(empty.ops[0]!.op).toBe('seedInternals');
    const full = compileRecipe(base(), { source: 'vco' });
    expect(full.ops.some((o) => o.op === 'seedInternals')).toBe(false);
    // En het resultaat speelt in beide gevallen.
    expect(signature(applyOps(emptyModularProject(), empty.ops)).edges)
      .toEqual(signature(applyOps(base(), full.ops)).edges);
  });

  it('ops zijn herhaalbaar: twee keer toepassen op hetzelfde uitgangspunt geeft hetzelfde project', () => {
    const r = compileRecipe(base(), { voices: 4, source: 'wt', filter: 'moog' });
    const a = applyOps(base(), r.ops);
    const b = applyOps(base(), r.ops);
    expect(JSON.stringify(a.patches)).toBe(JSON.stringify(b.patches));
    expect(JSON.stringify(a.racks.at(-1))).toBe(JSON.stringify(b.racks.at(-1)));
  });

  it('elke op heeft ten minste bij de hoofdstappen een uitleg', () => {
    const r = compileRecipe(base(), { voices: 4, source: 'vco', bus: ['diode'] });
    const noted = r.ops.filter((o) => o.note).length;
    expect(noted).toBeGreaterThanOrEqual(12);
    expect(r.ops.at(-1)!.op).toBe('activate');
  });
});

describe('knopstanden van buiten', () => {
  it('worden tegen het type gehouden: klemmen, standen, onbekende id\'s weg', () => {
    const r = compileRecipe(base(), {
      source: 'vco',
      bus: [{ type: 'bus comp', controls: { ratio: 4, attack: 30, threshold: -200, mix: 5, bypass: 'on', theremin: 1, release: 'auto' } as never }],
    });
    const comp = r.ops.find((o) => o.op === 'setControls' && 'values' in o && 'makeup' in o.values) as { values: Record<string, unknown> };
    expect(comp.values.ratio).toBe(2);        // 3 standen → hoogste index
    expect(comp.values.attack).toBeLessThan(30);
    expect(comp.values.threshold).toBe(-60);
    expect(comp.values.mix).toBe(1);
    expect(comp.values.bypass).toBe(1);        // tweestandenschakelaar: "on" → Aan
    expect(comp.values).not.toHaveProperty('theremin');
    // 'auto' is een standnaam van de release-schakelaar → die index.
    const rel = base().moduleTypes.find((t) => t.id === 'tp_mmb_bus_comp')!.controls.find((c) => c.id === 'release')!;
    expect(rel.kind).toBe('switch');
    expect(comp.values.release).toBe((rel as { positions: string[] }).positions.findIndex((p) => p.toLowerCase() === 'auto'));
    expect(r.warnings.some((w) => /theremin/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /threshold/.test(w))).toBe(true);
  });
});

describe('fouten en aliassen', () => {
  it('onbekende module geeft RecipeError met suggesties', () => {
    expect(() => compileRecipe(base(), { source: 'wavetablez' })).toThrowError(RecipeError);
    try { compileRecipe(base(), { source: 'diode' , filter: 'compressor xyz' }); }
    catch (e) {
      expect(e).toBeInstanceOf(RecipeError);
      expect((e as RecipeError).message).toMatch(/Onbekende module/);
    }
  });

  it('een bron zonder audio-uitgang wordt geweigerd', () => {
    expect(() => compileRecipe(base(), { source: 'lfo' })).toThrowError(/geen audio-uitgang/);
  });

  it('een stereo effect per stem wordt geweigerd met hint naar de bus', () => {
    expect(() => compileRecipe(base(), { source: 'vco', voiceFx: ['diode'] })).toThrowError(/op de bus/);
  });

  it('aliassen: NL/EN, spaties en streepjes tellen niet', () => {
    const types = base().moduleTypes;
    expect(resolveTypeId('Wavetable OSC', types)).toBe('tp_mmb_wt_vco');
    expect(resolveTypeId('wt_vco', types)).toBe('tp_mmb_wt_vco');
    expect(resolveTypeId('tp_mmb_wt_vco', types)).toBe('tp_mmb_wt_vco');
    expect(resolveTypeId('MS-20', types)).toBe('tp_mmb_ms20');
    expect(resolveTypeId('diode compressor', types)).toBe('tp_mmb_diode_comp');
    expect(resolveTypeId('galm', types)).toBe('tp_mmb_elements_reverb');
    expect(resolveTypeId('bestaat niet', types)).toBeNull();
    expect(normalizeAlias('TP_MMB_Diode-Comp')).toBe('diodecomp');
  });

  it('poortrollen uit poort-ids: mono, stereo, OUT', () => {
    const types = base().moduleTypes;
    const t = (id: string) => types.find((x) => x.id === id)!;
    expect(portRoles(t('tp_mmb_vcf'))).toMatchObject({ audioIn: { mono: 'in' }, audioOut: { mono: 'out' }, cv: 'cv' });
    expect(portRoles(t('tp_mmb_diode_comp')).audioIn).toMatchObject({ left: 'in_l', right: 'in_r' });
    expect(portRoles(t('tp_mmb_out')).audioIn).toMatchObject({ left: 'l', right: 'r' });
    expect(portRoles(t('tp_mmb_stk_sound'))).toMatchObject({ pitch: 'voct', gate: 'gate', modulation: 'modulation', strength: 'strength' });
    // Warps: in1/in2 zijn carrier/modulator, géén L/R.
    expect(portRoles(t('tp_mmb_warps')).audioIn.left).toBeUndefined();
  });
});
