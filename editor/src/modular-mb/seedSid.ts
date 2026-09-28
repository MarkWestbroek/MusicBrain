// SID ×3: de C64-chip als drie-stemmige synth. MidiIn verdeelt de noten over
// de drie stem-cellen van één SID (PolyGroup, net als de sampler); een LFO
// beweegt de pulsbreedte (PWM, het klassieke Hubbard-geluid) en de
// pitch-wheel buigt alle stemmen. Het filter staat aan (lowpass, halfopen,
// wat resonantie).

import type { ControlValue, ModularProject, ModuleInstance, Patch, PatchConnection, Rack, RackSlot } from './types';
import { seedInternals } from './seedModules';
import { uid } from './store';

export function seedSidPolyPatch(project: ModularProject, chips = 1): ModularProject {
  const C = Math.max(1, Math.min(4, Math.round(chips)));
  const N = 3 * C;
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
  const name = C > 1 ? `SID ×${N} (${C} chips, stereo)` : 'SID ×3 (C64)';

  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name,
    description: `MidiIn → SID (${N} stem-cellen als PolyGroup, ${C} chip${C > 1 ? 's' : ''}) → OUT (stereo); LFO → pulsbreedte.`,
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
    description: (C > 1 ? `${C} SID's naast elkaar (${N} stemmen, elke chip een eigen filter), over het stereobeeld verdeeld. ` : '')
      + 'De SID uit de Commodore 64 als drie-stemmige synth: pulse met een langzame PWM (LFO op PW+), een korte decay en een hoge sustain, door het filter (lowpass, cutoff 700, res 8). ' + (C > 1 ? `${N} noten tegelijk; een ${N + 1}e steelt een stem.` : 'Drie noten tegelijk, zoals op de chip; een vierde steelt een stem.') + ' Probeer Saw of Tri+Saw, Ring en Sync, of Noise voor drums.',
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', sid, 'voct_1'),
      c(mi, 'gate',  sid, 'gate_1'),
      c(mi, 'cv_bend', sid, 'bend'),
      c(lfo, 'out', sid, 'pw_cv'),
      c(sid, 'out_l', out, 'l'),
      c(sid, 'out_r', out, 'r'),
    ],
    controlState: {
      [mi.id]:  { channel: 0, voiceCount: N, steal: 0 },
      [sid.id]: { tri: 0, saw: 0, pulse: 1, noise: 0, pw: 0.5, ring: 0, sync: 0,
                  attack: 0, decay: 6, sustain: 12, release: 8, coarse: 0, fine: 0, volume: 15, level: 0.8, combo: 7,
                  filt: 1, cutoff: 700, res: 8, lp: 1, bp: 0, hp: 0, chips: C, spread: 0.7 },
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

/** Klank van de 3-osc-seeds: pulse, saw 8 ct hoger, driehoek een octaaf lager,
 *  allemaal door een 6581-lowpass met wat resonantie. */
const SID3_SOUND: Record<string, ControlValue> = {
  stack: 1, combo: 7, volume: 15, level: 0.8,
  cutoff: 900, res: 6, lp: 1, bp: 0, hp: 0, model: 0, curve: 0.5,
  ...Object.fromEntries([1, 2, 3].flatMap((k) => [
    [`tri_${k}`, k === 3 ? 1 : 0], [`saw_${k}`, k === 2 ? 1 : 0], [`pulse_${k}`, k === 1 ? 1 : 0], [`noise_${k}`, 0],
    [`pw_${k}`, 0.4], [`ring_${k}`, 0], [`sync_${k}`, 0],
    [`attack_${k}`, 0], [`decay_${k}`, 8], [`sustain_${k}`, 11], [`release_${k}`, 7],
    [`coarse_${k}`, k === 3 ? -12 : 0], [`fine_${k}`, k === 2 ? 8 : 0], [`filt_${k}`, 1],
  ])),
};

/**
 * SID 3-osc: mono lead (N = 1) of polyfoon (N > 1): N SID 3-osc's in een
 * PolyGroup, elke noot een eigen chip met eigen filter, via een mixer.
 */
export function seedSid3Patch(project: ModularProject, voiceCount = 1): ModularProject {
  const N = Math.max(1, Math.min(8, Math.round(voiceCount)));
  const mixerTypeId = N > 4 ? 'tp_mmb_mixer8' : 'tp_mmb_mixer';
  const needed = ['tp_mmb_midiin', 'tp_mmb_sid3', 'tp_mmb_out', ...(N > 1 ? [mixerTypeId] : [])];
  const p = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid)) ? seedInternals(project) : project;
  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi = fresh('tp_mmb_midiin');
  const sids = Array.from({ length: N }, () => fresh('tp_mmb_sid3'));
  const master = sids[0]!;
  const mixer = N > 1 ? fresh(mixerTypeId) : null;
  const out = fresh('tp_mmb_out');
  const name = N > 1 ? `SID 3-osc ×${N}` : 'SID 3-osc lead';

  const sidOffset = mi.visual.hpWidth;
  let offset = sidOffset + master.visual.hpWidth;
  const mixerOffset = offset; if (mixer) offset += mixer.visual.hpWidth;
  const outOffset = offset; offset += out.visual.hpWidth;
  const slots: RackSlot[] = [
    { id: uid('slot'), moduleId: mi.id, row: 0, hpOffset: 0 },
    ...sids.map((m, vi) => ({ id: uid('slot'), moduleId: m.id, row: vi, hpOffset: sidOffset })),
    ...(mixer ? [{ id: uid('slot'), moduleId: mixer.id, row: 0, hpOffset: mixerOffset }] : []),
    { id: uid('slot'), moduleId: out.id, row: 0, hpOffset: outOffset },
  ];
  const rack: Rack = {
    id: uid('rack'), name,
    description: N > 1
      ? `MidiIn → [SID 3-osc]×${N} (PolyGroup: elke noot een eigen chip) → MIXER → OUT.`
      : 'MidiIn → SID 3-osc (Stack: drie oscillatoren op één noot) → OUT.',
    rows: N, hpPerRow: Math.max(64, offset + 4),
    slots,
    kind: 'physical',
    ...(N > 1 ? { polyGroups: [{
      id: uid('poly'), label: 'SID 3-osc', voiceCount: N,
      members: sids.map((m) => ({ kind: 'module' as const, moduleId: m.id })),
    }] } : {}),
  };
  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: fm.id, portId: fp }, to: { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: (N > 1
      ? `${N} SID 3-osc's, elke noot een eigen chip met eigen filter — een stapel SID's. `
      : 'Eén SID, drie oscillatoren op één noot (Stack). ')
      + 'Stem 1 pulse, stem 2 saw 8 cent hoger, stem 3 driehoek een octaaf lager, samen door een 6581-lowpass. Probeer Sync op stem 2 met Coarse +7, of Ring op stem 3.',
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', master, 'voct_1'),
      c(mi, 'gate',  master, 'gate_1'),
      c(mi, 'cv_bend', master, 'bend'),
      ...(mixer
        ? [c(master, 'out', mixer, 'in1'), c(mixer, 'out_l', out, 'l'), c(mixer, 'out_r', out, 'r')]
        : [c(master, 'out', out, 'l'), c(master, 'out', out, 'r')]),
    ],
    controlState: {
      [mi.id]: { channel: 0, voiceCount: N, steal: 0 },
      [master.id]: { ...SID3_SOUND },
      ...(mixer ? { [mixer.id]: Object.fromEntries(Array.from({ length: N }, (_, i) => [
        [`vol${i + 1}`, 0.7], [`pan${i + 1}`, (i / Math.max(1, N - 1)) * 1.0 - 0.5],
      ]).flat()) as Record<string, ControlValue> } : {}),
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, ...sids, ...(mixer ? [mixer] : []), out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}
