// Geen knoppen of jacks over elkaar heen, en niets buiten het paneel. Mark zag
// het bij Clouds (2026-10-12: vijf grote knoppen op 14 HP gerekend, terwijl de
// module 16 HP was); de SID had het eerder. Dezelfde maten als ModulePanel.

import { describe, expect, it } from 'vitest';

import { seedInternals } from './seedModules';
import { emptyModularProject, MM_PER_HP } from './types';

const KNOB_R: Record<string, number> = { small: 3.2, medium: 5.5, large: 8.5 };
const JACK_R = 2.6;

describe('paneelindeling van de interne modules', () => {
  it('geen overlappende knoppen of jacks, niets buiten het paneel', () => {
    const b = seedInternals(emptyModularProject());
    const problems: string[] = [];
    for (const m of b.modules) {
      if (!m.typeId.startsWith('tp_mmb_')) continue;
      const t = b.moduleTypes.find((x) => x.id === m.typeId);
      if (!t) continue;
      const v = m.visual;
      const width = v.hpWidth * MM_PER_HP;
      const items: { id: string; x: number; y: number; r: number }[] = [];
      for (const c of t.controls) {
        const p = v.controlPlacements?.[c.id];
        if (!p || c.kind === 'display') continue;
        const size = p.sizeOverride ?? ('size' in c ? c.size : undefined) ?? 'medium';
        items.push({ id: c.id, x: p.x, y: p.y, r: c.kind === 'knob' ? KNOB_R[size]! : c.kind === 'led' ? 1 : 2.5 });
      }
      for (const p of t.ports) {
        const pl = v.portPlacements?.[p.id];
        if (pl) items.push({ id: `jack ${p.id}`, x: pl.x, y: pl.y, r: JACK_R });
      }
      for (const a of items) if (a.x - a.r < -0.5 || a.x + a.r > width + 0.5) problems.push(`${m.typeId}: ${a.id} buiten het paneel`);
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!, c = items[j]!;
        if (Math.hypot(a.x - c.x, a.y - c.y) < a.r + c.r - 0.3) problems.push(`${m.typeId}: ${a.id} × ${c.id}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
