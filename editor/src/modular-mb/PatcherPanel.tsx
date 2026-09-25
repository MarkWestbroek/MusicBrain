// Patcher tab — hosts two interchangeable views on the same patch model:
//   • Graph view  (PatcherGraphPanel)  — draw cables between modules
//   • Matrix view (PatcherMatrixPanel) — source × destination grid
//
// Both views read/write the same `PatchConnection[]` array; switching is
// purely a presentation choice (model-view-controller pattern).

import { useState } from 'react';
import { useModularProject, updateProject, uid } from './store';
import { PatcherGraphPanel } from './PatcherGraphPanel';
import { PatcherMatrixPanel } from './PatcherMatrixPanel';
import { TeensyStatusBar } from './TeensyStatusBar';
import type { Patch } from './types';

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

  /** Bewaar de huidige patch onder een nieuwe naam (binnen het project).
   *  Maakt een diepe kopie met een vers id; deze wordt direct actief. Het
   *  programmanummer wordt niet meegekopieerd (zou botsen met origineel). */
  function saveAsNewPatch(): void {
    if (!patch) return;
    const suggested = `${patch.name} (kopie)`;
    const name = window.prompt('Bewaar patch als — nieuwe naam:', suggested);
    if (name === null) return;
    const copy: Patch = {
      ...(JSON.parse(JSON.stringify(patch)) as Patch),
      id: uid('patch'),
      name: name.trim() || suggested,
      programNumber: undefined,
    };
    updateProject((p) => ({
      ...p,
      patches: [...p.patches, copy],
      activePatchId: copy.id,
    }));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Patch:
          {/* Wisselen zonder naar de Patches-tab te hoeven (ED-RC-8); gegroepeerd op map. */}
          <select value={patch.id}
                  onChange={(e) => updateProject((p) => {
                    const x = p.patches.find((q) => q.id === e.target.value);
                    return x ? { ...p, activePatchId: x.id, activeRackId: x.rackIds[0] ?? p.activeRackId } : p;
                  })}
                  style={{ fontSize: 13, fontWeight: 600, maxWidth: 360 }}
                  title="Actieve patch wisselen">
            {(() => {
              const folders = new Map<string, Patch[]>();
              for (const x of project.patches) {
                const k = x.folder?.trim() || '(geen map)';
                if (!folders.has(k)) folders.set(k, []);
                folders.get(k)!.push(x);
              }
              const keys = [...folders.keys()].sort((a, b) => (a === '(geen map)' ? 1 : b === '(geen map)' ? -1 : a.localeCompare(b, 'nl')));
              return keys.map((k) => (
                <optgroup key={k} label={k}>
                  {folders.get(k)!.sort((a, b) => a.name.localeCompare(b.name, 'nl')).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </optgroup>
              ));
            })()}
          </select>
          &nbsp;·&nbsp; {patch.connections.length} verbindingen
        </span>
        <button onClick={saveAsNewPatch} style={{ fontSize: 12, padding: '3px 10px' }}
          title="Bewaar deze patch als een nieuwe patch (kopie met nieuwe naam)">
          Bewaar als…
        </button>
        <TeensyStatusBar compact />
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

      {view === 'graph'  && <PatcherGraphPanel patchId={patch.id} />}
      {view === 'matrix' && <PatcherMatrixPanel patchId={patch.id} />}
    </div>
  );
}
