// Axel F-lead (Harold Faltermeyer, 1984): het recept van Doctor Mix in vier
// stappen, "two saws, detuning, an EQ cut and delay"
// (https://youtube.com/shorts/AKmTlQ9m1hA). Gebouwd op seedPolyVoicePatch en
// daarna met de recept-werkwoorden bijgewerkt, net als de CS-80-seed.
//
// De lead is monofoon. De twee saws zijn daarom twee stemmen in unison:
// MidiIn.unison laat één toets beide stemmen spelen, en Sprd waaiert ze
// symmetrisch uit (±6 ct). Dat is "twee saws + detune" zonder een extra VCO
// per stem.

import type { ControlValue, ModularProject } from './types';
import { seedPolyVoicePatch } from './seedModules';
import { addBusFx } from './recipe/edits';

/** Tempo van het origineel (~117 BPM); de echo staat op een punt-achtste. */
const BPM = 117;

export function seedAxelFLeadPatch(project: ModularProject): ModularProject {
  let p = seedPolyVoicePatch(project, 2, { filterType: 'ladder', label: 'Axel F lead' });
  const pid = p.activePatchId!;
  const rack = p.racks.find((r) => r.id === p.activeRackId)!;
  const group = (label: string) => rack.polyGroups!.find((g) => g.label === label)!.members.map((m) => m.moduleId);
  const byType = (typeId: string) => rack.slots.map((s) => p.modules.find((m) => m.id === s.moduleId)!).filter((m) => m.typeId === typeId);
  const conns = () => p.patches.find((x) => x.id === pid)!.connections;
  const set = (id: string, v: Record<string, ControlValue>) => {
    p = {
      ...p,
      patches: p.patches.map((x) => x.id !== pid ? x : { ...x, controlState: { ...x.controlState, [id]: { ...x.controlState[id], ...v } } }),
    };
  };

  // 1 + 2: twee saws, ontstemd. Unison aan, 12 ct spreiding = ±6 ct. Geen
  // glide: de octaafsprongen van de melodie moeten hard springen.
  set(byType('tp_mmb_midiin')[0]!.id, { unison: 1, spread: 12, glide: 0 });
  group('VCO').forEach((id) => set(id, { wave: 2, coarse: 0, fine: 0, level: 0.8 }));

  // Ladder staat ver open, met een korte envelope-tik op de aanslag. De
  // helderheid moet van de saws komen, niet van resonantie.
  for (const id of group('Ladder')) set(id, { cutoff: 1800, q: 0.15, drive: 1.2, cv_amt: 2.5, q_cv_amt: 0 });
  for (const id of group('envFlt')) set(id, { attack: 0, hold: 0, decay: 220, sustain: 0.35, release: 180, curve: 1, retrig: true });
  // Strakke staccato-noten: snelle attack, kort afsluiten.
  for (const id of group('envAmp')) set(id, { attack: 3, hold: 0, decay: 300, sustain: 0.8, release: 120, curve: 1 });

  // 3: EQ-cut. Low-cut plus een brede dip in de lage mid maakt de lead dun en
  // snijdend; een klein beetje presence erbij.
  p = addBusFx(p, pid, 'tp_mmb_para_eq').project;
  // 4: delay op een punt-achtste, weinig feedback, laag in de mix. De
  // Digital Echo is een rack-delay uit begin jaren tachtig: dezelfde tijd.
  p = addBusFx(p, pid, 'tp_mmb_digital_echo').project;
  const inPatch = (typeId: string) => {
    const ids = new Set(conns().flatMap((c) => [c.from.moduleId, c.to.moduleId]));
    return p.modules.find((m) => m.typeId === typeId && ids.has(m.id))!.id;
  };
  set(inPatch('tp_mmb_para_eq'), {
    hpf: 160, lf_gain: 0,
    lmf_freq: 450, lmf_gain: -6, lmf_q: 0.8,
    hmf_freq: 2500, hmf_gain: 2, hmf_q: 1,
    hf_gain: 0, lpf: 20000, prop_q: 0, output: 2, bypass: 0,
  });
  const dottedEighth = (60 / BPM) * 0.75;
  set(inPatch('tp_mmb_digital_echo'), {
    time: Math.round(dottedEighth * 1000) / 1000, ratio: 1, feedback: 0.3, cross: 0.3,
    mod_rate: 0.8, mod_depth: 0.1, bits: 12, band: 8000, mix: 0.25,
  });

  return {
    ...p,
    patches: p.patches.map((x) => x.id !== pid ? x : {
      ...x,
      description: 'Axel F-lead (Faltermeyer) naar het recept van Doctor Mix: twee saws in unison (±6 ct) → ladder die ver openstaat → Para EQ (low-cut, dip bij 450 Hz) → Digital Echo op een punt-achtste bij 117 BPM. Monofoon; speel staccato.',
    }),
  };
}
