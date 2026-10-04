// Het front als los SVG-bestand (doc/plans/patch-front.md §7, stap 6): de
// "hoes" van een patch voor de patch-pool op musicbrain.nl. Hetzelfde
// virtuele paneel als in de Front-tab, statisch gerenderd, met de
// waarden van de patch erin. Geen React-state, dus bruikbaar in de
// browser (bij Voorstellen) en in tests.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ModulePanel } from './ModulePanel';
import { autoFront, buildFrontModule, frontControlState } from './frontLayout';
import type { ModularProject, Patch, PatchFront } from './types';

/** Het front dat de pool te zien krijgt: het eerste bewaarde, anders Auto. */
export function frontForPool(patch: Patch, project: ModularProject): PatchFront {
  return patch.fronts?.[0] ?? autoFront(patch, project);
}

/** Zelfstandig SVG-document (met xmlns) van een front. */
export function frontSvg(front: PatchFront, patch: Patch, project: ModularProject, pxPerMm = 4): string {
  const fm = buildFrontModule(front, patch, project);
  const svg = renderToStaticMarkup(createElement(ModulePanel, {
    module: fm.module, types: [fm.type], controlState: frontControlState(fm, patch), pxPerMm,
  }));
  // React zet geen xmlns op een losse <svg>; als bestand heeft hij die nodig.
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + svg.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
}
