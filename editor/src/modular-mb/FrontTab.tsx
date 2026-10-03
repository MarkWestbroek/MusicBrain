// Front-tab, eerste versie (doc/plans/patch-front.md §6, stap 2): de fronts
// van de actieve patch naast het automatische front, als virtueel paneel.
// Nog zonder ontwerpen (dat komt via rechtsklik in rack en patcher) en
// zonder spelermodus; wel "Auto bewaren als front" zodat een automatisch
// front een echt, bewerkbaar front wordt.

import { useState } from 'react';

import { FrontPanel } from './FrontPanel';
import { autoFront } from './frontPanel';
import { pruneFronts } from './fronts';
import { updateProject, useModularProject, uid } from './store';
import type { PatchFront } from './types';

export function FrontTab(): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  const [chosen, setChosen] = useState<string>('auto');

  if (!patch) return <div style={{ padding: 16, opacity: 0.7 }}>Geen actieve patch.</div>;

  const fronts = pruneFronts(patch, project).fronts ?? [];
  const front: PatchFront = fronts.find((f) => f.id === chosen) ?? (chosen === 'auto' || !fronts.length ? autoFront(patch, project) : fronts[0]!);

  function saveAuto(): void {
    const f: PatchFront = { ...autoFront(patch!, project), id: uid('front'), name: `Front ${fronts.length + 1}` };
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((x) => (x.id === patch!.id ? { ...x, fronts: [...(x.fronts ?? []), f] } : x)),
    }));
    setChosen(f.id);
  }

  function removeFront(id: string): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((x) => (x.id === patch!.id ? { ...x, fronts: (x.fronts ?? []).filter((f) => f.id !== id) } : x)),
    }));
    setChosen('auto');
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{patch.name}</strong>
        <select value={front.id} onChange={(e) => setChosen(e.target.value)}>
          <option value="auto">Auto (afgeleid, niet opgeslagen)</option>
          {fronts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {front.id === 'front_auto'
          ? <button type="button" onClick={saveAuto}>Auto bewaren als front</button>
          : <button type="button" onClick={() => removeFront(front.id)}>Front verwijderen</button>}
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          Draaien op het front wijzigt de patch; wat niet op het front staat, staat vast.
        </span>
      </div>
      {front.description && <p style={{ margin: 0, maxWidth: 640, opacity: 0.85 }}>{front.description}</p>}
      <div style={{ overflow: 'auto' }}>
        <FrontPanel front={front} patch={patch} project={project} pxPerMm={4} />
      </div>
    </div>
  );
}
