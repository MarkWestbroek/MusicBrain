// patchRequires — wat een gedeelde patch nodig heeft (doc/plans/patch-pool.md §3):
// met welke editor en welk firmwarecontract hij gemaakt is, en welke
// moduletypes hij gebruikt. Daarmee kan een editor vóór het laden zeggen
// "deze patch gebruikt de SID-module, die zit niet in jouw editor/firmware".

import type { ModularProject } from '../types';

// Bouwconstanten uit vite.config.ts (`define`); onder vitest via dezelfde config, buiten git leeg.
declare const __MMB_EDITOR_VERSION__: string;
declare const __MMB_FIRMWARE_CONTRACT__: string;

export interface PatchRequires {
  /** Semver van de editor (laatste cortex-tag), bv. "0.5.48". */
  editorVersion: string;
  /** Commits sinds die tag + hash, bv. "355-g62e7389"; leeg op een tag. */
  editorBuild: string;
  /** Semver van het firmwarecontract (module-types.json). */
  firmwareContract: string;
  /** Gesorteerd, uniek; alleen modules die in de racks van de patch staan. */
  moduleTypes: string[];
}

/** Bouwconstanten uit vite.config.ts; leeg onder vitest of buiten git. */
export function buildInfo(): { editorVersion: string; editorBuild: string; firmwareContract: string } {
  const raw = typeof __MMB_EDITOR_VERSION__ === 'string' ? __MMB_EDITOR_VERSION__ : '';
  const fw = typeof __MMB_FIRMWARE_CONTRACT__ === 'string' ? __MMB_FIRMWARE_CONTRACT__ : '';
  return { ...splitDescribe(raw), firmwareContract: fw };
}

/** "v0.5.48-355-g62e7389" → { editorVersion: "0.5.48", editorBuild: "355-g62e7389" }; een losse hash → build. */
export function splitDescribe(raw: string): { editorVersion: string; editorBuild: string } {
  const m = /^v?(\d+\.\d+\.\d+)(?:-(\d+-g[0-9a-f]+))?$/.exec(raw.trim());
  if (m) return { editorVersion: m[1]!, editorBuild: m[2] ?? '' };
  return { editorVersion: '', editorBuild: raw.trim() };
}

/** Voor een snapshot van één patch (patchSnapshot/slimSnapshot). */
export function patchRequires(snapshot: ModularProject, info = buildInfo()): PatchRequires {
  const patch = snapshot.patches.find((p) => p.id === snapshot.activePatchId) ?? snapshot.patches[0];
  const racks = snapshot.racks.filter((r) => !patch || patch.rackIds.includes(r.id));
  const inRacks = new Set(racks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  const types = new Set(snapshot.modules.filter((m) => inRacks.has(m.id)).map((m) => m.typeId));
  return { ...info, moduleTypes: [...types].sort() };
}

/**
 * Wat er in deze editor ontbreekt om de patch te laden: moduletypes die de
 * catalogus niet kent. Een leeg resultaat = veilig te laden.
 */
export function missingTypes(req: PatchRequires, project: ModularProject): string[] {
  const have = new Set(project.moduleTypes.map((t) => t.id));
  return req.moduleTypes.filter((t) => !have.has(t));
}
