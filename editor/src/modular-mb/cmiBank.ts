// CMI-bank (doc/plans/fairlight.md §8): 32 klanken voor de CMI-stem, los
// van de patches, in het project. Een klank = het Page 4-profiel én de
// knoppen Seg, Smooth, Loop, Attack, Release. Zuiver: projecten erin,
// projecten eruit; CmiPage4 doet de store, de Teensy en de stemmen.

import { CMI_TYPE, PRESETS, encodeProfile, preset } from './cmiProfile';
import { writePatchControl } from './setPatchControl';
import { defaultValueOf, resolveControls, type CmiBank, type CmiVoice, type ModularProject } from './types';

export const BANK_SIZE = 32;
export const CMI_VOICE_CONTROLS = ['seg', 'smooth', 'loop', 'attack', 'release'] as const;
const FORMAT = 'musicbrain-cmibank';

/** Knoppen bij de startpunten: wat bij elk profiel natuurlijk klinkt. */
const PRESET_CONTROLS: Record<string, Record<string, number>> = {
  brass:   { seg: 40, smooth: 0.3, loop: 20, attack: 15, release: 250 },
  saw:     { seg: 40, smooth: 0.3, loop: 32, attack: 5, release: 200 },
  square:  { seg: 40, smooth: 0.3, loop: 32, attack: 5, release: 200 },
  organ:   { seg: 30, smooth: 0.2, loop: 32, attack: 5, release: 80 },
  strings: { seg: 80, smooth: 0.6, loop: 24, attack: 120, release: 700 },
  choir:   { seg: 60, smooth: 0.5, loop: 20, attack: 30, release: 600 },
  bell:    { seg: 90, smooth: 0.4, loop: 32, attack: 2, release: 1500 },
};

/** Een nieuwe bank: de zeven startpunten vooraan, de rest leeg. */
export function newBank(): CmiBank {
  const voices: (CmiVoice | null)[] = Array.from({ length: BANK_SIZE }, () => null);
  PRESETS.forEach((pr, i) => {
    voices[i] = { name: pr.nl, cmi: encodeProfile(preset(pr.id)), controls: { ...PRESET_CONTROLS[pr.id]! } };
  });
  return { name: 'CMI-bank', voices };
}

/** De bank van het project, of een nieuwe als die er nog niet is. */
export function bankOf(project: ModularProject): CmiBank {
  return project.cmiBank ?? newBank();
}

/** De klank zoals hij nu op de stem `owner` in de patch staat. */
export function voiceFromPatch(project: ModularProject, patchId: string, owner: string, name: string): CmiVoice | null {
  const patch = project.patches.find((p) => p.id === patchId);
  const mod = project.modules.find((m) => m.id === owner);
  if (!patch || !mod || mod.typeId !== CMI_TYPE) return null;
  const cmi = patch.moduleData?.[owner]?.cmi ?? encodeProfile(preset('brass'));
  const ctrls = resolveControls(mod, project.moduleTypes);
  const controls: Record<string, number> = {};
  for (const id of CMI_VOICE_CONTROLS) {
    const c = ctrls.find((x) => x.id === id);
    const v = patch.controlState[owner]?.[id] ?? (c ? defaultValueOf(c) : undefined);
    if (typeof v === 'number') controls[id] = v;
  }
  return { name, cmi, controls };
}

/** Klank op plek `slot` zetten (overschrijft wat er stond). */
export function storeVoice(project: ModularProject, slot: number, voice: CmiVoice): ModularProject {
  if (slot < 0 || slot >= BANK_SIZE) return project;
  const bank = bankOf(project);
  const voices = bank.voices.slice();
  voices[slot] = voice;
  return { ...project, cmiBank: { ...bank, voices } };
}

/** Plek leegmaken. */
export function clearVoice(project: ModularProject, slot: number): ModularProject {
  const bank = bankOf(project);
  const voices = bank.voices.slice();
  voices[slot] = null;
  return { ...project, cmiBank: { ...bank, voices } };
}

/** Klank op de stem zetten: het profiel in `moduleData` van de eigenaar, de
 *  knoppen op alle stemmen van de poly-groep (zoals setPatchControl). Geeft
 *  ook de doelen per knop terug, voor de Teensy. */
export function applyVoice(project: ModularProject, patchId: string, owner: string, voice: CmiVoice): {
  project: ModularProject; pokes: { moduleId: string; controlId: string; value: number }[];
} {
  let p = project;
  const pokes: { moduleId: string; controlId: string; value: number }[] = [];
  for (const [id, v] of Object.entries(voice.controls)) {
    if (!(CMI_VOICE_CONTROLS as readonly string[]).includes(id) || typeof v !== 'number') continue;
    const r = writePatchControl(p, patchId, owner, id, v);
    p = r.project;
    for (const t of r.targets) pokes.push({ moduleId: t, controlId: id, value: v });
  }
  p = {
    ...p,
    patches: p.patches.map((x) => (x.id === patchId
      ? { ...x, moduleData: { ...(x.moduleData ?? {}), [owner]: { ...(x.moduleData?.[owner] ?? {}), cmi: voice.cmi } } }
      : x)),
  };
  return { project: p, pokes };
}

// ── als bestand ───────────────────────────────────────────────────────────

export function exportBank(bank: CmiBank): string {
  return JSON.stringify({ format: FORMAT, version: 1, ...bank }, null, 1);
}

/** Een bankbestand lezen; null als het geen CMI-bank is. */
export function parseBankFile(text: string): CmiBank | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  const o = j as { format?: unknown; name?: unknown; voices?: unknown };
  if (!o || o.format !== FORMAT || !Array.isArray(o.voices)) return null;
  const voices: (CmiVoice | null)[] = Array.from({ length: BANK_SIZE }, (_, i) => {
    const v = (o.voices as unknown[])[i] as Partial<CmiVoice> | null | undefined;
    if (!v || typeof v.cmi !== 'string' || typeof v.name !== 'string') return null;
    const controls: Record<string, number> = {};
    for (const id of CMI_VOICE_CONTROLS) { const x = v.controls?.[id]; if (typeof x === 'number' && Number.isFinite(x)) controls[id] = x; }
    return { name: v.name.slice(0, 40), cmi: v.cmi, controls };
  });
  return { name: typeof o.name === 'string' ? o.name : 'CMI-bank', voices };
}

const same = (a: CmiVoice, b: CmiVoice): boolean => a.name === b.name && a.cmi === b.cmi && JSON.stringify(a.controls) === JSON.stringify(b.controls);

/** Een ingelezen bank in het project: alles vervangen, of alleen de lege
 *  plekken vullen (in volgorde; een klank die er precies zo al staat, zoals
 *  de startpunten, slaat hij over). Geeft ook terug hoeveel er niet paste. */
export function importBank(project: ModularProject, incoming: CmiBank, mode: 'replace' | 'fill'): { project: ModularProject; skipped: number } {
  if (mode === 'replace') return { project: { ...project, cmiBank: { name: incoming.name, voices: incoming.voices.slice(0, BANK_SIZE) } }, skipped: 0 };
  const bank = bankOf(project);
  const voices = bank.voices.slice();
  let skipped = 0;
  for (const v of incoming.voices) {
    if (!v || voices.some((x) => x && same(x, v))) continue;
    const free = voices.findIndex((x) => x === null);
    if (free < 0) { skipped++; continue; }
    voices[free] = v;
  }
  return { project: { ...project, cmiBank: { ...bank, voices } }, skipped };
}
