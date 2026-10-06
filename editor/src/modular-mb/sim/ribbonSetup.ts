// Staat de MIDI-IN van de actieve patch klaar voor het lint? Het lint speelt
// een ankernoot plus pitch bend; dat klinkt alleen traploos als de MIDI-IN
// de bend in de toonhoogte vouwt (`bendPitch` aan) met hetzelfde bereik als
// het lint (`bendRange`). Klaarzetten loopt via het ene schrijfpad
// (setPatchControl): poly-fan-out, Teensy-poke en opslag in de patch.

import { setPatchControl } from '../setPatchControl';
import { defaultValueOf, resolveControls, type ModularProject, type Patch } from '../types';
import { ribbonReady } from './ribbonLayout';

export interface RibbonMidiIn {
  /** Er is een MIDI-IN in de patch. */
  present: boolean;
  ready: (range: number) => boolean;
  /** Zet `bendPitch` aan en `bendRange` op `range`. */
  fix: (range: number) => void;
}

export function ribbonMidiIn(patch: Patch | undefined, project: ModularProject): RibbonMidiIn {
  const none: RibbonMidiIn = { present: false, ready: () => true, fix: () => { /* niets te doen */ } };
  if (!patch) return none;
  const inPatch = new Set([
    ...patch.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]),
    ...project.racks.filter((r) => patch.rackIds.includes(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)),
  ]);
  const midi = project.modules.find((m) => m.typeId === 'tp_mmb_midiin' && inPatch.has(m.id));
  if (!midi) return none;
  const controls = resolveControls(midi, project.moduleTypes);
  const value = (id: string): unknown => {
    const c = controls.find((x) => x.id === id);
    return patch.controlState[midi.id]?.[id] ?? (c ? defaultValueOf(c) : undefined);
  };
  return {
    present: true,
    ready: (range) => ribbonReady(value('bendPitch'), value('bendRange'), range),
    fix: (range) => {
      setPatchControl(patch.id, midi.id, 'bendPitch', 1);
      setPatchControl(patch.id, midi.id, 'bendRange', range);
    },
  };
}
