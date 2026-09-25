// CS-80-koper (Vangelis, Blade Runner): een seed waarin aftertouch duidelijk
// hoorbaar is. Gebouwd op seedPolyVoicePatch (ladder + aftertouch) en daarna
// met de recept-werkwoorden bijgewerkt, zodat de bedrading dezelfde regels
// volgt als wat de AI en de commandoregel doen.
//
// Aftertouch doet twee dingen, zoals op de CS-80:
//   1. het filter opent (per stem; channel pressure van een Keystep opent
//      alle stemmen tegelijk): tot vier octaven bij volle druk;
//   2. vibrato komt erbij: druk telt op bij het modwheel als vibratodiepte.

import type { ControlValue, ModularProject } from './types';
import { seedPolyVoicePatch } from './seedModules';
import { addBusFx, feedCvInput, spreadVoices } from './recipe/edits';

export function seedCs80BrassPatch(project: ModularProject, voiceCount = 6): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  let p = seedPolyVoicePatch(project, N, { filterType: 'ladder', aftertouch: true, label: 'CS-80 koper (aftertouch)' });
  const pid = p.activePatchId!;
  const rack = p.racks.find((r) => r.id === p.activeRackId)!;
  const group = (label: string) => rack.polyGroups!.find((g) => g.label === label)!.members.map((m) => m.moduleId);
  const byType = (typeId: string) => rack.slots.map((s) => p.modules.find((m) => m.id === s.moduleId)!).filter((m) => m.typeId === typeId);
  const conns = () => p.patches.find((x) => x.id === pid)!.connections;
  const mi = byType('tp_mmb_midiin')[0]!;
  // De vibrato-mult (LFO × modwheel) is de CvMath waar MidiIn.cv_mod op binnenkomt.
  const vibDepth = conns().find((c) => c.from.moduleId === mi.id && c.from.portId === 'cv_mod')!.to.moduleId;
  const lfo = byType('tp_mmb_lfo')[0]!;
  const bendSum = conns().find((c) => c.from.moduleId === vibDepth && c.from.portId === 'out')!.to.moduleId;

  // Klank: zaagtand, lichte ontstemming per stem (analoog-drift), trage
  // filter-attack (de "blaas"-inzet), volle sustain.
  const detune = [0, 6, -5, 3, -7, 4, -3, 7];
  const set = (id: string, v: Record<string, ControlValue>) => {
    p = {
      ...p,
      patches: p.patches.map((x) => x.id !== pid ? x : { ...x, controlState: { ...x.controlState, [id]: { ...x.controlState[id], ...v } } }),
    };
  };
  group('VCO').forEach((id, i) => set(id, { wave: 2, fine: detune[i % detune.length]!, level: 0.9 }));
  for (const id of group('Ladder')) set(id, { cutoff: 200, q: 0.6, drive: 1.6, cv_amt: 5, q_cv_amt: 0 });
  for (const id of group('envFlt')) set(id, { attack: 140, hold: 0, decay: 900, sustain: 0.45, release: 700, curve: 1, retrig: true });
  for (const id of group('envAmp')) set(id, { attack: 35, hold: 0, decay: 400, sustain: 1, release: 750, curve: 1 });
  // Filter-cv = envelope×0,4 + aftertouch×0,8, ×5 oct (cv_amt). De cv-ingang
  // van het ladderfilter kapt af op 1 (Teensy-DC): de envelope houdt
  // daarom maar een klein deel, zodat de druk de ruimte krijgt. In rust
  // (sustain) staat het filter ~1 oct open, volle druk erbij ~4 oct.
  for (const id of group('LfoSum')) set(id, { mode: 0, gain_a: 0.4, gain_b: 0, gain_c: 0.8, offset: 0 });
  // Vibrato iets sneller dan standaard, subtiel: ~0,2 halve toon bij volle druk.
  set(lfo.id, { rate: 6, wave: 0, depth: 1, bipolar: true, run: 0 });
  set(bendSum, { gain_a: 0.025 });

  // Aftertouch erbij op de vibratodiepte: feedCvInput zet een optel-CvMath
  // (modwheel + druk) vóór de mult.
  p = feedCvInput(p, pid, { moduleId: mi.id, portId: 'press' }, { moduleId: vibDepth, portId: 'b' }, 0.7).project;

  // Bus: BBD-chorus voor breedte, dan een lange plaat.
  p = addBusFx(p, pid, 'tp_mmb_bbd_chorus').project;
  p = addBusFx(p, pid, 'tp_mmb_elements_reverb').project;
  const inPatch = (typeId: string) => {
    const ids = new Set(conns().flatMap((c) => [c.from.moduleId, c.to.moduleId]));
    return p.modules.find((m) => m.typeId === typeId && ids.has(m.id))!.id;
  };
  set(inPatch('tp_mmb_bbd_chorus'), { rate: 0.5, depth: 0.45, delay: 12, feedback: 0, mix: 0.4, spread: 1, age: 0.3, tone: 0.6 });
  set(inPatch('tp_mmb_elements_reverb'), { amount: 0.35, time: 0.8, diffusion: 0.7, lp: 0.55 });
  p = spreadVoices(p, pid, 0.6).project;

  return {
    ...p,
    patches: p.patches.map((x) => x.id !== pid ? x : {
      ...x,
      description: `CS-80-koper à la Vangelis: ${N} stemmen zaagtand → ladder, trage filter-attack. Aftertouch opent het filter (tot vier octaven) en voegt vibrato toe (opgeteld bij het modwheel). BBD-chorus en plaatgalm op de bus. Speel langzaam en druk ná de aanslag door.`,
    }),
  };
}
