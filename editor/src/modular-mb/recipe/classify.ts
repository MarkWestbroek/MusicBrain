// Patches ordenen (ED-RC-8): automatische indeling op inhoud, voor mappen,
// groeperen en sorteren in de Patches-tab. Puur; geen UI.
//
//   familie   — waar de klank vandaan komt: VCO, Wavetable, FM, Physical
//               modelling, Sampling, Drums, Generatief, … (uit de bronmodule)
//   stemmen   — mono / duo / poly N
//   rack      — het (eerste fysieke) rack
//   kabels    — aantal master-kabels

import type { ModularProject, Patch } from '../types';
import { CATALOG } from './catalog';

export type Family =
  | 'VCO' | 'Wavetable' | 'FM' | 'Physical modelling' | 'Sampling' | 'Drums'
  | 'Generatief' | 'Effect' | 'Leeg' | 'Overig';

const FAMILY_BY_TYPE: Record<string, Family> = {
  tp_mmb_vco: 'VCO', tp_mmb_quad_vco_shared: 'VCO', tp_mmb_octa_vco: 'VCO', tp_mmb_noise: 'VCO',
  tp_mmb_wt_vco: 'Wavetable', tp_mmb_morph_wt: 'Wavetable', tp_mmb_draw_vco: 'Wavetable',
  tp_mmb_fm_vco: 'FM', tp_mmb_dx7: 'FM',
  tp_mmb_string: 'Physical modelling', tp_mmb_stk_sound: 'Physical modelling', tp_mmb_rings: 'Physical modelling',
  tp_mmb_elements: 'Physical modelling', tp_mmb_plaits: 'Physical modelling',
  tp_mmb_sampler: 'Sampling',
  tp_mmb_peaks: 'Drums', tp_mmb_cr78: 'Drums', tp_mmb_grids: 'Drums',
  tp_mmb_marbles: 'Generatief',
};

/** Familie van één moduletype (voor recepten: de bron bepaalt de map). */
export function familyOf(typeId: string): Family {
  const f = FAMILY_BY_TYPE[typeId];
  if (f) return f;
  const kind = CATALOG[typeId]?.kind;
  return kind === 'source' ? 'Overig' : kind === 'fx' ? 'Effect' : kind === 'seq' ? 'Generatief' : 'Overig';
}

export interface PatchClass {
  family: Family;
  /** 'mono' | 'duo' | 'poly 4' … */
  voices: string;
  voiceCount: number;
  rackName: string;
  cables: number;
  modules: number;
  /** Bus-effecten (fx-modules aan een kabel) — voor de tabel. */
  fx: string[];
}

export function voicesLabel(n: number): string {
  return n <= 1 ? 'mono' : n === 2 ? 'duo' : `poly ${n}`;
}

/** Deel een patch in op inhoud. De familie komt van de bronmodule die het
 *  meest stroomopwaarts aan een kabel hangt; sequencers en drums tellen ook. */
export function classifyPatch(p: ModularProject, patch: Patch): PatchClass {
  const modById = new Map(p.modules.map((m) => [m.id, m]));
  const cabled = new Set<string>();
  for (const c of patch.connections) { cabled.add(c.from.moduleId); cabled.add(c.to.moduleId); }
  const families = new Map<Family, number>();
  const fx = new Set<string>();
  for (const id of cabled) {
    const m = modById.get(id); if (!m) continue;
    const kind = CATALOG[m.typeId]?.kind;
    if (kind === 'source' || kind === 'drum' || kind === 'noise' || m.typeId === 'tp_mmb_marbles') {
      const f = familyOf(m.typeId);
      families.set(f, (families.get(f) ?? 0) + 1);
    } else if (kind === 'fx') {
      fx.add(CATALOG[m.typeId]?.short ?? m.typeId);
    }
  }
  let family: Family = 'Leeg';
  if (families.size) {
    // Meest voorkomende familie wint; 'Generatief' alleen als er geen andere bron is.
    const ranked = [...families.entries()].sort((a, b) => b[1] - a[1]);
    const firstReal = ranked.find(([f]) => f !== 'Generatief');
    family = (firstReal ?? ranked[0]!)[0];
  } else if (fx.size) {
    family = 'Effect';
  } else if (patch.connections.length) {
    family = 'Overig';
  }
  const rack = p.racks.find((r) => patch.rackIds.includes(r.id) && r.kind !== 'internal')
    ?? p.racks.find((r) => patch.rackIds.includes(r.id));
  const modules = new Set(patch.rackIds.flatMap((rid) => p.racks.find((r) => r.id === rid)?.slots.map((s) => s.moduleId) ?? []));
  return {
    family, voices: voicesLabel(patch.voiceCount), voiceCount: patch.voiceCount,
    rackName: rack?.name ?? '—', cables: patch.connections.length, modules: modules.size,
    fx: [...fx].sort(),
  };
}

export type GroupBy = 'folder' | 'family' | 'voices' | 'rack' | 'none';
export type SortBy = 'name' | 'voices' | 'cables' | 'rack' | 'program' | 'family';

/** Groepssleutel van een patch voor de gekozen indeling. */
export function groupKey(p: ModularProject, patch: Patch, by: GroupBy): string {
  if (by === 'none') return '';
  if (by === 'folder') return patch.folder?.trim() || '(geen map)';
  const c = classifyPatch(p, patch);
  return by === 'family' ? c.family : by === 'voices' ? c.voices : c.rackName;
}

export function comparePatches(p: ModularProject, by: SortBy, dir: 1 | -1 = 1): (a: Patch, b: Patch) => number {
  const cls = new Map<string, PatchClass>();
  const c = (x: Patch) => { let v = cls.get(x.id); if (!v) { v = classifyPatch(p, x); cls.set(x.id, v); } return v; };
  return (a, b) => {
    let r = 0;
    switch (by) {
      case 'name':    r = a.name.localeCompare(b.name, 'nl'); break;
      case 'voices':  r = a.voiceCount - b.voiceCount; break;
      case 'cables':  r = a.connections.length - b.connections.length; break;
      case 'rack':    r = c(a).rackName.localeCompare(c(b).rackName, 'nl'); break;
      case 'family':  r = c(a).family.localeCompare(c(b).family, 'nl'); break;
      case 'program': r = (a.programNumber ?? 999) - (b.programNumber ?? 999); break;
    }
    if (r === 0) r = a.name.localeCompare(b.name, 'nl');
    return r * dir;
  };
}

// ── bank / program ──────────────────────────────────────────────────────
//
// Mappen zijn banken, patches programma's: bank = volgnummer van de map
// (alfabetisch, "(geen map)" achteraan), program = expliciet programNumber
// van de patch, anders de positie op naam binnen de map. MIDI bank select
// (CC 0) + program change kiezen zo een patch in de editor/sim.

export interface BankProgram { bank: number; program: number; bankName: string }

export function bankPrograms(p: ModularProject): Map<string, BankProgram> {
  const byFolder = new Map<string, Patch[]>();
  for (const x of p.patches) {
    const k = x.folder?.trim() || '(geen map)';
    if (!byFolder.has(k)) byFolder.set(k, []);
    byFolder.get(k)!.push(x);
  }
  const banks = [...byFolder.keys()].sort((a, b) => (a === '(geen map)' ? 1 : b === '(geen map)' ? -1 : a.localeCompare(b, 'nl')));
  const out = new Map<string, BankProgram>();
  banks.forEach((bankName, bank) => {
    const list = [...byFolder.get(bankName)!].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    const taken = new Set(list.map((x) => x.programNumber).filter((n): n is number => n !== undefined));
    let next = 0;
    for (const x of list) {
      let program = x.programNumber;
      if (program === undefined) { while (taken.has(next)) ++next; program = next++; }
      out.set(x.id, { bank, program, bankName });
    }
  });
  return out;
}

export function findPatchByBankProgram(p: ModularProject, bank: number | null, program: number): Patch | null {
  const map = bankPrograms(p);
  const hit = p.patches.find((x) => { const bp = map.get(x.id)!; return bp.program === program && (bank === null || bp.bank === bank); });
  return hit ?? null;
}

/** Alle patches op bank/program-volgorde (voor de stappers in de patcher). */
export function patchOrder(p: ModularProject): (BankProgram & { id: string; name: string })[] {
  const map = bankPrograms(p);
  return p.patches
    .map((x) => ({ id: x.id, name: x.name, ...map.get(x.id)! }))
    .sort((a, b) => a.bank - b.bank || a.program - b.program || a.name.localeCompare(b.name, 'nl'));
}

/**
 * Volgende/vorige patch als op een synth: `scope: 'patch'` stapt binnen de
 * bank (met omslag), `scope: 'bank'` springt naar het eerste programma van
 * de volgende/vorige bank. null = niets te kiezen.
 */
export function stepPatch(p: ModularProject, currentId: string | undefined, delta: 1 | -1, scope: 'patch' | 'bank'): string | null {
  const order = patchOrder(p);
  if (!order.length) return null;
  const i = Math.max(0, order.findIndex((x) => x.id === currentId));
  const cur = order[i]!;
  if (scope === 'patch') {
    const inBank = order.filter((x) => x.bank === cur.bank);
    const j = inBank.findIndex((x) => x.id === cur.id);
    return inBank[(j + delta + inBank.length) % inBank.length]!.id;
  }
  const banks = [...new Set(order.map((x) => x.bank))];
  const b = banks[(banks.indexOf(cur.bank) + delta + banks.length) % banks.length]!;
  return order.find((x) => x.bank === b)!.id;
}

/** Vul lege mappen met de familie (bijv. "Physical modelling"). */
export function autoFolders(p: ModularProject, overwrite = false): ModularProject {
  return {
    ...p,
    patches: p.patches.map((x) => (!overwrite && x.folder?.trim()) ? x
      : { ...x, folder: classifyPatch(p, x).family }),
  };
}
