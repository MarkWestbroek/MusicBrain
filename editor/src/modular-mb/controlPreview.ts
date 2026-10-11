// Een knopwaarde laten klinken zonder hem in de patch te zetten: de engine
// en de Teensy krijgen hem, de patch niet. Geen Bewaar-knop, geen undo-punt.
//
// Twee gebruikers: de knoptour (knobTour.ts) en het afspelen van automation
// (automation.ts, ED-SM-10). Wie hier iets zet, zet het na afloop terug op
// de patchwaarde.

import { getEngine } from './sim/engineSingleton';
import { sendControlPoke } from './teensyLink';
import type { ControlValue } from './types';

/** De waarde op alle doelen (poly-stemmen, stereopaar), live. */
export function previewControl(controlId: string, targets: readonly string[], v: ControlValue): void {
  const engine = getEngine();
  for (const id of targets) {
    engine.updateControl(id, controlId, v);
    if (typeof v === 'number' || typeof v === 'boolean') void sendControlPoke(id, controlId, v);
  }
}

/** De panelen (front, patcher, rack) tonen `v` in plaats van de patchwaarde;
 *  `undefined` haalt dat weer weg. Via de live-waarden van de engine, waar
 *  ze al naar kijken. */
export function showControl(targets: readonly string[], controlId: string, v: ControlValue | undefined): void {
  const engine = getEngine();
  for (const id of targets) engine.showLive(id, controlId, v);
}
