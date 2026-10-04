// Bestandsnamen die alleen in hoofdletter verschillen, botsen op Windows en
// macOS: Vite probeert bij `./FrontPanel` eerst `.ts` en vindt daar dan
// `frontPanel.ts` (hoofdletterongevoelig bestandssysteem), terwijl Linux
// doorzoekt naar `FrontPanel.tsx`. Dit gaf op 2026-10-04 een wit scherm op
// Windows. Hier bewaken we het voor de hele src-map: per map mag een
// modulenaam (zonder extensie) maar één keer voorkomen, ongeacht hoofdletters.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

describe('bestandsnamen', () => {
  it('verschillen per map nooit alleen in hoofdletter (zonder extensie)', () => {
    const byKey = new Map<string, string[]>();
    for (const f of walk(join(__dirname))) {
      const m = /^(.*[\\/])([^\\/]+?)(\.test)?\.(ts|tsx|js|jsx|mjs|css|json)$/.exec(f);
      if (!m) continue;
      const key = `${m[1]}${m[2]!.toLowerCase()}${m[3] ?? ''}`;
      byKey.set(key, [...(byKey.get(key) ?? []), f]);
    }
    const clashes = [...byKey.values()].filter((v) => new Set(v.map((x) => x.replace(/\.[a-z]+$/, ''))).size > 1);
    expect(clashes, clashes.map((c) => c.join(' ↔ ')).join('\n')).toEqual([]);
  });
});
