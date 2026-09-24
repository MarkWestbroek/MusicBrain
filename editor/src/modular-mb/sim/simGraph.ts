// simGraph — welke graaf bouwt de simulator voor een patch? Los van Tone,
// zodat hij zonder AudioContext na te rekenen is (simGraph.test.ts legt hem
// over alle seed-patches heen).
//
// Dit is de simulator-kant van wat `polyExpand.ts` voor de firmware doet:
// PolyGroups uitvouwen, en MIDI-In per stem `pitchK`/`gateK`/`velK` laten
// leveren. `AudioEngine.build()` bouwt precies dit plan.

import type { ModularProject, Patch, PatchConnection, ControlValue } from '../types';
import { WasmModule } from '../runtime';
import { expandPolyConnections, patchVoiceLimit } from './polySim';

export const MIDIIN_TYPE = 'tp_mmb_midiin';
/** `kMaxAllocVoices` in de firmware (VoiceAllocator.h). */
export const MAX_VOICES = 16;

export interface SimGraphPlan {
  /** Modules die in het rack van de patch staan. */
  inRack: Set<string>;
  /** PolyGroups: master → leden (incl. master). Een stem is een module-id of
   *  een cel `moduleId#k` (k 1-based). */
  groups: Map<string, string[]>;
  /** Lid → master. */
  followerOf: Map<string, string>;
  /** Multi-module → zijn master-cel (`moduleId#1`). */
  cellMasterOf: Map<string, string>;
  /** Wat MIDI-In als `voiceCount` krijgt (firmwarevoorrang, minstens 1). */
  midiVoices: number;
  /** Hoeveel `pitchK`-uitgangen MIDI-In krijgt: genoeg voor de grootste groep. */
  midiOuts: number;
  /** De kabels na het uitvouwen. */
  conns: PatchConnection[];
}

function readKnob(controls: Record<string, ControlValue>, id: string, def: number): number {
  const v = controls[id];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : def;
}

export function planSimGraph(project: ModularProject, patch: Patch): SimGraphPlan {
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const inRack = new Set<string>();
  for (const r of racks) for (const s of r.slots) inRack.add(s.moduleId);

  // MIDI-In bepaalt hoevéél stemmen er spelen, met de voorrang van
  // `applyPatchVoiceCount()` in de firmware: `patch.voiceCount`, dan de knop
  // op MIDI-In, en anders de beginstand van de module (1).
  const miMod = project.modules.find((m) => m.typeId === MIDIIN_TYPE && inRack.has(m.id));
  const miCtl = (miMod ? patch.controlState[miMod.id] : undefined) ?? {};
  const voiceLimit = patchVoiceLimit(patch.voiceCount, readKnob(miCtl, 'voiceCount', 0));
  const midiVoices = Math.max(1, Math.min(MAX_VOICES, voiceLimit));

  const groups = new Map<string, string[]>();
  const followerOf = new Map<string, string>();
  const cellMasterOf = new Map<string, string>();
  let largest = 0;
  for (const r of racks) for (const g of r.polyGroups ?? []) {
    const all = g.members.map((mem) => mem.kind === 'module' ? mem.moduleId : `${mem.moduleId}#${mem.cellIndex + 1}`);
    const ids = voiceLimit > 0 ? all.slice(0, voiceLimit) : all;
    // Eén stem = geen groep: de kabels blijven op de master staan en de
    // overige modules zwijgen, precies zoals de firmware ze niet bouwt.
    if (ids.length < 2) continue;
    const masterType = project.modules.find((m) => m.id === ids[0]!.split('#')[0])?.typeId ?? '';
    if (!WasmModule.supports(masterType)) continue;
    groups.set(ids[0]!, ids);
    for (const id of ids.slice(1)) followerOf.set(id, ids[0]!);
    if (ids[0]!.includes('#')) cellMasterOf.set(ids[0]!.split('#')[0]!, ids[0]!);
    largest = Math.max(largest, ids.length);
  }
  // Stemmen boven `voiceCount` krijgen van de firmware 0 V en een dichte gate.
  const midiOuts = Math.min(MAX_VOICES, Math.max(midiVoices, largest));

  const typeOf = new Map(project.modules.map((m) => [m.id, m.typeId]));
  const conns = expandPolyConnections(patch.connections, {
    groups, cellMasterOf,
    isVoicePort: (id, port) => typeOf.get(id) === MIDIIN_TYPE
      && (port === 'pitch' || port === 'gate' || port === 'vel'),
  });
  return { inRack, groups, followerOf, cellMasterOf, midiVoices, midiOuts, conns };
}
