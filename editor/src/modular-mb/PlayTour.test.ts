// Elke stap van de speelmodus-rondleiding wijst een `data-tour`-anker aan dat
// echt in de code staat; anders wijst een stap na een ombouw stilletjes naar
// niets (de ballon valt dan terug naar het midden).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PLAY_TOUR_STEPS } from './PlayTour';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('rondleiding speelmodus', () => {
  const all = sources(fileURLToPath(new URL('.', import.meta.url))).join('\n');

  it('elk anker bestaat als data-tour in de code', () => {
    for (const s of PLAY_TOUR_STEPS) {
      if (!s.anchor) continue;
      expect(all, s.anchor).toContain(`data-tour="${s.anchor}"`);
    }
  });

  it('begint bij de patchkeuze en eindigt met Klaar zonder anker', () => {
    expect(PLAY_TOUR_STEPS[0]!.anchor).toBe('play-patch');
    expect(PLAY_TOUR_STEPS.at(-1)!.anchor).toBeUndefined();
    const ids = PLAY_TOUR_STEPS.map((s) => s.anchor);
    expect(ids.indexOf('keys-ribbon')).toBe(ids.indexOf('keys-exit') - 1);   // lint vóór de sluitknop
  });
});
