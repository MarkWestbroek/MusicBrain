// Welke CC-nummers de MIDI-IN van een patch op zijn twee vrije CC-ingangen
// verwacht (CC1# en CC2#, controls `cc1Num`/`cc2Num`). Het schermtoetsenbord
// voedt zijn pedaalschuif daarmee, zodat hij de patch raakt zoals die bedraad
// is (de E-piano zet CC2# op 64 voor sustain).

import { defaultValueOf, resolveControls, type ModularProject, type Patch } from '../types';

export const SUSTAIN_CC = 64;

export function midiInCcNumbers(patch: Patch | undefined, project: ModularProject): { cc1: number; cc2: number } {
  const out = { cc1: 74, cc2: 71 };
  if (!patch) return out;
  const inPatch = new Set([
    ...patch.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]),
    ...project.racks.filter((r) => patch.rackIds.includes(r.id)).flatMap((r) => r.slots.map((s) => s.moduleId)),
  ]);
  const midi = project.modules.find((m) => m.typeId === 'tp_mmb_midiin' && inPatch.has(m.id));
  if (!midi) return out;
  const controls = resolveControls(midi, project.moduleTypes);
  const num = (id: 'cc1Num' | 'cc2Num', fallback: number): number => {
    const c = controls.find((x) => x.id === id);
    const v = patch.controlState[midi.id]?.[id] ?? (c ? defaultValueOf(c) : fallback);
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(127, Math.round(v))) : fallback;
  };
  return { cc1: num('cc1Num', out.cc1), cc2: num('cc2Num', out.cc2) };
}
