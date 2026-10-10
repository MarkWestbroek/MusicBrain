// Weergave: op wat voor scherm draait de editor (doc/plans/editor-structuur.md
// §5b). Eén meting voor de hele editor, in plaats van dat elk onderdeel zelf
// de breedte meet of een `compact`-stand doorgegeven krijgt.
//
//   telefoon  smal (onder 640 px), of liggend met weinig hoogte (onder 500 px)
//   tablet    tot 1024 px breed
//   desktop   de rest
//
// De plaatsingstabel van de speelmodus (§5b) beslist per onderdeel waar het
// staat in elke weergave; onderdelen lezen deze hook en volgen die tabel.

import { useSyncExternalStore } from 'react';

export type Soort = 'telefoon' | 'tablet' | 'desktop';
export interface Weergave { soort: Soort; staand: boolean }

/** Puur, voor tests: de weergave bij een schermmaat in CSS-pixels. */
export function weergaveVan(breed: number, hoog: number): Weergave {
  const staand = hoog >= breed;
  const soort: Soort = breed < 640 || hoog < 500 ? 'telefoon' : breed < 1024 ? 'tablet' : 'desktop';
  return { soort, staand };
}

let huidig: Weergave = typeof window === 'undefined'
  ? { soort: 'desktop', staand: false }
  : weergaveVan(window.innerWidth, window.innerHeight);

function subscribe(fn: () => void): () => void {
  const sync = (): void => {
    const next = weergaveVan(window.innerWidth, window.innerHeight);
    if (next.soort !== huidig.soort || next.staand !== huidig.staand) { huidig = next; fn(); }
  };
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  return () => { window.removeEventListener('resize', sync); window.removeEventListener('orientationchange', sync); };
}

export function useWeergave(): Weergave {
  return useSyncExternalStore(subscribe, () => huidig, () => huidig);
}
