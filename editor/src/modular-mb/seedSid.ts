// SID ×3: de C64-chip als drie-stemmige synth. MidiIn verdeelt de noten over
// de drie stem-cellen van één SID (PolyGroup, net als de sampler); een LFO
// beweegt de pulsbreedte (PWM, het klassieke Hubbard-geluid) en de
// pitch-wheel buigt alle stemmen. Het filter staat aan (lowpass, halfopen,
// wat resonantie).

import type { ModularProject, ModuleInstance, Patch, PatchConnection, Rack, RackSlot } from './types';
import { seedInternals } from './seedModules';
import { uid } from './store';

export function seedSidPolyPatch(project: ModularProject): ModularProject {
  const N = 3;
  const needed = ['tp_mmb_midiin', 'tp_mmb_sid', 'tp_mmb_lfo', 'tp_mmb_out'];
  const p = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid)) ? seedInternals(project) : project;
  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi = fresh('tp_mmb_midiin');
  const sid = fresh('tp_mmb_sid');
  const lfo = fresh('tp_mmb_lfo');
  const out = fresh('tp_mmb_out');
  const name = 'SID ×3 (C64)';

  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name,
    description: 'MidiIn → SID (3 stem-cellen als PolyGroup) → OUT; LFO → pulsbreedte.',
    rows: 1, hpPerRow: 64,
    slots: [slot(mi), slot(sid), slot(lfo), slot(out)],
    kind: 'physical',
    polyGroups: [{
      id: uid('poly'), label: 'SID', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({
        kind: 'cell' as const, moduleId: sid.id, cellGroupId: 'voice', cellIndex: i,
      })),
    }],
  };
  rack.hpPerRow = Math.max(64, offset + 4);

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: fm.id, portId: fp }, to: { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: 'De SID uit de Commodore 64 als drie-stemmige synth: pulse met een langzame PWM (LFO op PW+), een korte decay en een hoge sustain, door het filter (lowpass, cutoff 700, res 8). Drie noten tegelijk, zoals op de chip; een vierde steelt een stem. Probeer Saw of Tri+Saw, Ring en Sync, of Noise voor drums.',
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', sid, 'voct_1'),
      c(mi, 'gate',  sid, 'gate_1'),
      c(mi, 'cv_bend', sid, 'bend'),
      c(lfo, 'out', sid, 'pw_cv'),
      c(sid, 'out', out, 'l'),
      c(sid, 'out', out, 'r'),
    ],
    controlState: {
      [mi.id]:  { channel: 0, voiceCount: N, steal: 0 },
      [sid.id]: { tri: 0, saw: 0, pulse: 1, noise: 0, pw: 0.5, ring: 0, sync: 0,
                  attack: 0, decay: 6, sustain: 12, release: 8, coarse: 0, fine: 0, volume: 15, level: 0.8, combo: 7,
                  filt: 1, cutoff: 700, res: 8, lp: 1, bp: 0, hp: 0 },
      // ±0,25 rond pw 0,5: de pulsbreedte zwaait tussen 25 % en 75 %.
      [lfo.id]: { rate: 0.8, wave: 1, depth: 0.25, bipolar: true, run: 0 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, sid, lfo, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}
