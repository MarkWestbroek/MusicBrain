// Patcher tab — hosts two interchangeable views on the same patch model:
//   • Graph view  (PatcherGraphPanel)  — draw cables between modules
//   • Matrix view (PatcherMatrixPanel) — source × destination grid
//
// Both views read/write the same `PatchConnection[]` array; switching is
// purely a presentation choice (model-view-controller pattern).

import { useState } from 'react';
import { useModularProject } from './store';
import { PatcherGraphPanel } from './PatcherGraphPanel';
import { PatcherMatrixPanel } from './PatcherMatrixPanel';
import { TeensyStatusBar } from './TeensyStatusBar';
import type { Patch } from './types';
import { PatchStepper, CompareSlots } from './recipe/PatchSwitcher';
import { MorphPanel } from './recipe/MorphPanel';
import { SaveAsButton } from './PatchSave';

type View = 'graph' | 'matrix';

export function PatcherPanel(): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId)
             ?? project.patches[0];
  const [view, setView] = useState<View>('graph');

  if (!patch) {
    return (
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Selecteer eerst een patch in de Patches-tab (of maak er een aan).
      </p>
    );
  }
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const totalSlots = racks.reduce((n, r) => n + r.slots.length, 0);
  if (racks.length === 0 || totalSlots === 0) {
    return (
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        De geselecteerde racks zijn leeg of niet meer aanwezig. Vink in de Patches-tab
        de juiste racks aan en plaats modules in de Rack-tab.
      </p>
    );
  }

  void (null as unknown as Patch);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
        {/* Synth-gevoel (ED-RC-8): bank en patch als stappers met pijltjes,
            geen dropdown. Wisselen gaat ook naar de Teensy: zit de patch in
            de laatst gestuurde config (A/B-set), dan is het een selectPatch. */}
        <PatchStepper project={project} patch={patch} />
        <CompareSlots project={project} patch={patch} />
        <SaveAsButton project={project} patch={patch} />
        <div style={{
          marginLeft: 'auto', display: 'flex', gap: 0,
          border: '1px solid #cbd2d9', borderRadius: 6, overflow: 'hidden',
        }}>
          {(['graph', 'matrix'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 12px',
                border: 'none',
                background: view === v ? 'var(--mb-accent)'    : '#f5f7fa',
                color:      view === v ? 'var(--mb-on-accent)' : '#1f2933',
                fontSize: 12,
                fontWeight: view === v ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {v === 'graph' ? 'Graph' : 'Matrix'}
            </button>
          ))}
        </div>
      </div>
      {/* Teensy-status op een eigen regel: in de kop vocht hij met de rest om ruimte. */}
      <div style={{ marginBottom: 10 }}><TeensyStatusBar compact /></div>
      {/* Alleen zichtbaar als de actieve patch een morph is (ED-MORPH-2). */}
      <MorphPanel project={project} patch={patch} />

      {view === 'graph'  && <PatcherGraphPanel patchId={patch.id} />}
      {view === 'matrix' && <PatcherMatrixPanel patchId={patch.id} />}
    </div>
  );
}
