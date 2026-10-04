// Eén schrijfpad voor een controlwijziging in een patch.
//
// Tot 2026-10-03 stond dit recept drie keer uitgeschreven (de knop op een
// paneel in de patcher, het eigenschappenpaneel en de inkomende CC van een
// control-surface), met twee stille verschillen: de patcher keek alleen naar
// de rack-poly-groep en niet naar `polyOverrides` van de patch, en de
// surface-bridge stuurde ook niet-scalaire waarden door. Hier staat het één
// keer, zodat het patch-front (doc/plans/patch-front.md) er de vierde
// gebruiker van is en niet de vierde kopie.
//
// Het recept:
//   1. poly-fan-out: een edit op een groepslid geldt voor alle stemmen van de
//      groep, met de patch-eigen herverdeling (`polyControlTargets`);
//   2. live naar de Teensy (FW-LIVE-1): per doel één controlPoke, alleen voor
//      scalaire waarden (joystick-standen hebben geen poke-vorm);
//   3. persistent: `patch.controlState[doel][control] = waarde`.

import { polyControlTargets } from './polyExpand';
import { findTwin } from './recipe/edits';
import { getProject, updateProject } from './store';
import { sendControlPoke } from './teensyLink';
import type { ControlValue, ModularProject } from './types';

/** Puur: de waarde op alle poly-doelen in `controlState` van de patch.
 *  Geeft het project ongewijzigd terug als de patch niet bestaat. */
export function writePatchControl(
  project: ModularProject, patchId: string, moduleId: string, controlId: string, value: ControlValue,
  opts: { twins?: boolean } = {},
): { project: ModularProject; targets: string[] } {
  const patch = project.patches.find((x) => x.id === patchId);
  if (!patch) return { project, targets: [] };
  let targets = polyControlTargets(patch, project, moduleId);
  // Stereopaar (twee gelijke mono-modules op L en R, zie edits.findTwin):
  // op een front staan ze als één knop, dus schrijft die naar allebei. In
  // de patcher blijven L en R los te draaien (opts.twins uit).
  if (opts.twins) {
    for (const id of [...targets]) {
      const m = project.modules.find((x) => x.id === id);
      const tw = m ? findTwin(project, patch, m) : null;
      for (const t of tw ?? []) if (!targets.includes(t.id)) targets = [...targets, t.id];
    }
  }
  const cs = { ...patch.controlState };
  for (const id of targets) cs[id] = { ...(cs[id] ?? {}), [controlId]: value };
  return {
    project: { ...project, patches: project.patches.map((x) => (x.id === patchId ? { ...x, controlState: cs } : x)) },
    targets,
  };
}

/** Met bijwerkingen: de store bijwerken én de waarde live naar de Teensy
 *  sturen. Geeft de module-id's terug waarop geschreven is. */
export function setPatchControl(
  patchId: string, moduleId: string, controlId: string, value: ControlValue, opts: { twins?: boolean } = {},
): string[] {
  const { targets } = writePatchControl(getProject(), patchId, moduleId, controlId, value, opts);
  if (targets.length === 0) return targets;
  if (typeof value === 'number' || typeof value === 'boolean')
    for (const id of targets) void sendControlPoke(id, controlId, value);
  updateProject((p) => writePatchControl(p, patchId, moduleId, controlId, value, opts).project);
  return targets;
}
