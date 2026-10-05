// De patchkeuze van de speelmodus en de Front-tab: de patches van het
// project, en daaronder de standaardset om er een bij te zetten. Zo kom je na
// de eerste keuze altijd terug bij de voorbeelden (ze stonden eerst alleen
// in de lege start), zonder extra knop of menu.

import type { CSSProperties } from 'react';

import { DEMO_SEEDS } from './demoSeeds';
import { getProject, setProject, updateProject } from './store';
import type { ModularProject } from './types';

const SEED = 'seed:';

/** Maak de patch actief (met zijn rack), of zet een voorbeeld uit de
 *  standaardset erbij en maak dat actief. Puur op de waarde van de keuzelijst. */
export function choosePatch(value: string): void {
  if (value.startsWith(SEED)) {
    const d = DEMO_SEEDS[Number(value.slice(SEED.length))];
    if (d) setProject(d.run(getProject()));
    return;
  }
  updateProject((p) => {
    const x = p.patches.find((q) => q.id === value);
    return x ? { ...p, activePatchId: x.id, activeRackId: x.rackIds[0] ?? p.activeRackId } : p;
  });
}

export function PatchSelect({ project, onChoose, style }: {
  project: ModularProject;
  /** Na de keuze (bijv. de frontkeuze terugzetten). */
  onChoose?: () => void;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <select value={project.activePatchId ?? ''} title="Kies een patch, of zet een voorbeeld uit de standaardset erbij"
      onChange={(e) => { choosePatch(e.target.value); onChoose?.(); }}
      style={{ fontSize: 13, fontWeight: 700, maxWidth: 260, ...style }}>
      {project.patches.length === 0 && <option value="">(nog geen patch)</option>}
      {project.patches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      <optgroup label="Voorbeeld toevoegen">
        {DEMO_SEEDS.map((d, i) => <option key={d.label} value={`${SEED}${i}`} title={d.title}>{d.label}</option>)}
      </optgroup>
    </select>
  );
}
