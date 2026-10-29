import { describe, expect, it } from 'vitest';

import { BYPASS_EXCEPTIONS, bypassRoute, bypassUndecided } from './bypassRoute';
import { seedInternals } from './seedModules';
import { emptyModularProject } from './types';

const types = seedInternals(emptyModularProject()).moduleTypes;
const effects = types.filter((t) => t.categoryId === 'effect');

describe('bypassRoute', () => {
  it('elk effecttype heeft een besluit: patroon, eigen knop of uitzondering', () => {
    expect(effects.length).toBeGreaterThan(30);
    expect(effects.filter(bypassUndecided).map((t) => t.id)).toEqual([]);
  });

  it('elke uitzondering hoort bij een bestaand effecttype', () => {
    const ids = new Set(effects.map((t) => t.id));
    expect(Object.keys(BYPASS_EXCEPTIONS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('een droog pad dekt elke audio-uitgang precies één keer, met bestaande audio-ingangen', () => {
    for (const t of effects) {
      const r = bypassRoute(t);
      if (!r || !('pairs' in r)) continue;
      const audio = (dir: 'in' | 'out') => new Set(t.ports.filter((p) => p.direction === dir && p.signalType === 'audio').map((p) => p.id));
      const ins = audio('in'), outs = audio('out');
      expect(r.pairs.map((p) => p.out).sort(), t.id).toEqual([...outs].sort());
      for (const p of r.pairs) {
        expect(ins.has(p.in), `${t.id}: ${p.in}`).toBe(true);
        if (p.fallback) expect(ins.has(p.fallback), `${t.id}: ${p.fallback}`).toBe(true);
      }
    }
  });

  it('eigen knop alleen als het effect een `bypass`-control heeft', () => {
    const own = effects.filter((t) => bypassRoute(t)?.hasOwnProperty('own')).map((t) => t.id);
    expect(own.length).toBe(8);
    for (const t of effects) {
      const hasCtl = t.controls.some((c) => c.id === 'bypass');
      expect(bypassRoute(t)?.hasOwnProperty('own') ?? false, t.id).toBe(hasCtl);
    }
  });

  it('niet-effecten krijgen geen bypass, ook met een audio-ingang', () => {
    const others = types.filter((t) => t.categoryId !== 'effect');
    expect(others.filter((t) => bypassRoute(t) !== null).map((t) => t.id)).toEqual([]);
    expect(others.some((t) => t.ports.some((p) => p.direction === 'in' && p.signalType === 'audio'))).toBe(true);
  });

  it('stereo: rechts valt terug op links; mono → stereo droog op beide', () => {
    const byId = (id: string) => bypassRoute(types.find((t) => t.id === id)!);
    expect(byId('tp_mmb_hall')).toEqual({ pairs: [{ out: 'out_l', in: 'in_l' }, { out: 'out_r', in: 'in_r', fallback: 'in_l' }] });
    expect(byId('tp_mmb_harmonizer')).toEqual({ pairs: [{ out: 'out_l', in: 'in' }, { out: 'out_r', in: 'in' }] });
    expect(byId('tp_mmb_stereo_vca')).toBeNull();
    expect(byId('tp_mmb_fet_comp')).toEqual({ own: 'bypass' });
  });
});
