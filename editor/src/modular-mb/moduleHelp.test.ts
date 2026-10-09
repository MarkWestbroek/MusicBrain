// Elke knop op een front van de standaardset heeft een uitleg, in het
// Nederlands en het Engels; anders ziet een speler bij ? of lang drukken
// niets, en valt een nieuwe seed daar stil buiten.

import { describe, expect, it } from 'vitest';

import { standardProject } from './demoSeeds';
import { autoFront } from './frontLayout';
import { MODULE_HELP } from './moduleHelp';
import { resolveControls } from './types';

describe('help per knop', () => {
  it('elke knop op de fronts van de standaardset heeft een regel (NL en EN) en elke module een uitleg', () => {
    const p = standardProject();
    const missing: string[] = [];
    for (const patch of p.patches) {
      const front = patch.fronts?.[0] ?? autoFront(patch, p);
      for (const it of front.items) {
        if (it.kind !== 'control') continue;
        const m = p.modules.find((x) => x.id === it.moduleId);
        if (!m) continue;
        const c = resolveControls(m, p.moduleTypes).find((x) => x.id === it.controlId);
        if (!c || c.kind === 'display' || c.kind === 'led') continue;
        const h = MODULE_HELP[m.typeId];
        if (!h) { missing.push(`${m.typeId} (module)`); continue; }
        const t = h.controls[c.id];
        if (!t || !t[0] || !t[1]) missing.push(`${m.typeId}.${c.id}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('elke regel is kort genoeg voor een ballonnetje', () => {
    for (const [tid, h] of Object.entries(MODULE_HELP)) {
      for (const [cid, [nl, en]] of Object.entries(h.controls)) {
        expect(nl.length, `${tid}.${cid}`).toBeLessThan(140);
        expect(en.length, `${tid}.${cid}`).toBeLessThan(140);
      }
    }
  });
});

describe('?-blad', () => {
  it('geeft per module op elk front van de standaardset een uitleg en per knop een regel', async () => {
    const { frontHelpBlocks } = await import('./FrontHelp');
    const p = standardProject();
    for (const patch of p.patches) {
      const front = patch.fronts?.[0] ?? autoFront(patch, p);
      for (const b of frontHelpBlocks(front, patch, p)) {
        expect(b.about, `${patch.name}: ${b.title}`).toBeTruthy();
        for (const r of b.rows) expect(r.text, `${patch.name}: ${b.title} ${r.label}`).toBeTruthy();
      }
    }
  });
});
