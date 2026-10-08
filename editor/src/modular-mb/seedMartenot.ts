// Ondes Martenot ×N: een ensemble van ondes door één Palme. Het instrument
// zelf is monofoon (één oscillator); meerstemmig schreef men voor meerdere
// instrumenten (Messiaens Fête des belles eaux: zes ondes). Zo ook hier:
// MidiIn → [MARTENOT]×N (PolyGroup) → MIXER → DIFFUSEUR → OUT, één kast
// voor alle stemmen, zoals een ensemble dat één Palme deelt.

import { seedInternals } from './seedModules';
import { uid } from './store';
import type { ControlValue, ModularProject, ModuleInstance, Patch, PatchConnection, PolyGroup, Rack, RackSlot } from './types';

export function seedMartenotPolyPatch(project: ModularProject, voiceCount = 4): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  const mixerTypeId = N > 4 ? 'tp_mmb_mixer8' : 'tp_mmb_mixer';
  const needed = ['tp_mmb_midiin', 'tp_mmb_martenot', 'tp_mmb_diffuseur', mixerTypeId, 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi     = fresh('tp_mmb_midiin');
  const ondes  = Array.from({ length: N }, () => fresh('tp_mmb_martenot'));
  const master = ondes[0]!;
  const mixer  = fresh(mixerTypeId);
  const diff   = fresh('tp_mmb_diffuseur');
  const out    = fresh('tp_mmb_out');

  const ondeOffset  = mi.visual.hpWidth;
  const mixerOffset = ondeOffset + master.visual.hpWidth;
  const diffOffset  = mixerOffset + mixer.visual.hpWidth;
  const outOffset   = diffOffset + diff.visual.hpWidth;
  const slots: RackSlot[] = [
    { id: uid('slot'), moduleId: mi.id,    row: 0, hpOffset: 0 },
    ...ondes.map((d, vi) => ({ id: uid('slot'), moduleId: d.id, row: vi, hpOffset: ondeOffset })),
    { id: uid('slot'), moduleId: mixer.id, row: 0, hpOffset: mixerOffset },
    { id: uid('slot'), moduleId: diff.id,  row: 0, hpOffset: diffOffset },
    { id: uid('slot'), moduleId: out.id,   row: 0, hpOffset: outOffset },
  ];
  const polyGroups: PolyGroup[] = [{
    id: uid('poly'), label: 'Ondes', voiceCount: N,
    members: ondes.map((d) => ({ kind: 'module' as const, moduleId: d.id })),
  }];
  const rack: Rack = {
    id: uid('rack'), name: `Ondes ×${N}`,
    description: `MidiIn → [MARTENOT]×${N} (PolyGroup) → ${N > 4 ? 'MIXER-8' : 'MIXER'} → DIFFUSEUR (Palme) → OUT. Eén kast voor alle stemmen.`,
    rows: N, hpPerRow: Math.max(64, outOffset + out.visual.hpWidth + 4),
    slots,
    kind: 'physical',
    polyGroups,
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name: `Ondes ×${N}`,
    description: `Een ensemble van ${N} ondes Martenot door één Palme-luidspreker, zoals Messiaen voor zes ondes schreef (het instrument zelf is eenstemmig). Akkoorden zingen na in de twaalf snaren van de Palme; het modwiel geeft meer vibrato, aftertouch zwelt. Speel langzaam en legato.`,
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch',  master, 'voct'),
      c(mi, 'gate',   master, 'gate'),
      c(mi, 'vel',    master, 'vel'),
      c(mi, 'press',  master, 'press'),
      c(mi, 'cv_mod', master, 'vib_cv'),
      c(master, 'out', mixer, 'in1'),
      c(mixer, 'out_l', diff, 'in'),
      c(diff, 'out', out, 'l'),
      c(diff, 'out', out, 'r'),
    ],
    controlState: {
      [mi.id]:     { channel: 0, voiceCount: N, steal: 0 },
      [master.id]: { onde: 0.8, creux: 0.15, souffle: 0.05, glide: 0, vib: 0.18, vib_rate: 5.5, touche: 0, attack: 12, release: 400, bright: 0.6, level: 0.7 },
      [mixer.id]:  Object.fromEntries(Array.from({ length: N }, (_, i) => [[`vol${i + 1}`, 0.5], [`pan${i + 1}`, 0]]).flat()) as Record<string, ControlValue>,
      [diff.id]:   { type: 1, mix: 0.5, tune: 0, ring: 0.55, gong: 196, level: 1 },
      [out.id]:    { level: 0.8 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, ...ondes, mixer, diff, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}
