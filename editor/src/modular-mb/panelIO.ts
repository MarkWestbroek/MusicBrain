// Panel-I/O (ED-P-1): één paneel los exporteren/importeren.
//
// Een "paneel" is een View op één ModuleType: het ModuleType (ports/controls/
// cellGroups) plus het bijbehorende ModuleVisual (layout). Panels zijn 1→*
// t.o.v. ModuleType (zie doc/architecture/mmb-moduletype-panel.puml); dit
// bundelt het canonieke paar zodat je een paneel kunt delen of in een andere
// build laden. Bij import worden bestaande instanties van hetzelfde type
// ge-upgrade (nieuw visual, positie/controlState blijven) — zelfde upgrade-
// pad als seedInternals.

import type { ModularProject, ModuleType, ModuleVisual } from './types';

export const PANEL_FORMAT = 'mmb-panel.v1';

export interface PanelFile {
  format: typeof PANEL_FORMAT;
  exportedAt: string;
  /** Optioneel: laagste firmware-versie waarvoor dit paneel klopt (ED-P-3). */
  minFirmwareVersion?: string;
  moduleType: ModuleType;
  visual: ModuleVisual;
}

/** Vind het (interne) prototype van een type — dat draagt het canonieke
 *  visual dat seedInternals aanmaakt. */
function prototypeVisual(project: ModularProject, typeId: string): ModuleVisual | null {
  const proto = project.modules.find((m) => m.typeId === typeId && m.internal)
             ?? project.modules.find((m) => m.typeId === typeId);
  return proto?.visual ?? null;
}

/** Serialiseer één paneel naar een PanelFile (of null als het type ontbreekt). */
export function exportPanel(project: ModularProject, typeId: string): PanelFile | null {
  const moduleType = project.moduleTypes.find((t) => t.id === typeId);
  const visual = prototypeVisual(project, typeId);
  if (!moduleType || !visual) return null;
  return {
    format: PANEL_FORMAT,
    exportedAt: new Date().toISOString(),
    moduleType,
    visual,
  };
}

/** Herken en valideer een geïmporteerd PanelFile. */
export function parsePanelFile(raw: unknown): PanelFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<PanelFile>;
  if (f.format !== PANEL_FORMAT) return null;
  if (!f.moduleType?.id || !f.visual) return null;
  return f as PanelFile;
}

/** Voeg een geïmporteerd paneel toe of upgrade een bestaand type in-place.
 *  Instanties van het type krijgen het nieuwe visual mee (positie/controls
 *  blijven). Retourneert het bijgewerkte project. */
export function importPanel(project: ModularProject, panel: PanelFile): ModularProject {
  const { moduleType, visual } = panel;
  const exists = project.moduleTypes.some((t) => t.id === moduleType.id);

  const moduleTypes = exists
    ? project.moduleTypes.map((t) => (t.id === moduleType.id ? moduleType : t))
    : [...project.moduleTypes, moduleType];

  // Prototype-instantie (internal) — maak er één als hij nog niet bestaat.
  const hasProto = project.modules.some((m) => m.typeId === moduleType.id && m.internal);
  let modules = project.modules.map((m) =>
    m.typeId === moduleType.id ? { ...m, visual } : m);
  if (!hasProto) {
    modules = [...modules, {
      id: `mod_panel_${moduleType.id}`,
      typeId: moduleType.id,
      internal: true,
      name: moduleType.variant,
      visual,
    }];
  }

  return { ...project, moduleTypes, modules };
}
