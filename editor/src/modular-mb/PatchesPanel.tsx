// Patches tab — list/CRUD of Patches. Each patch is bound to one Rack
// and carries per-(module, control) state. Editing the cables happens
// in the Patcher tab.

import { updateProject, useModularProject, uid } from './store';
import type { Patch } from './types';

export function PatchesPanel(): JSX.Element {
  const project = useModularProject();

  function addPatch(): void {
    const rackId = project.activeRackId ?? project.racks[0]?.id;
    if (!rackId) {
      alert('Maak eerst een rack aan (Rack-tab).');
      return;
    }
    const patch: Patch = {
      id: uid('patch'),
      name: `Patch ${project.patches.length + 1}`,
      voiceCount: 8,
      rackId,
      connections: [],
      controlState: {},
      envelopes: [],
      lfos: [],
    };
    updateProject((p) => ({
      ...p,
      patches: [...p.patches, patch],
      activePatchId: p.activePatchId ?? patch.id,
    }));
  }

  function removePatch(id: string): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.filter((x) => x.id !== id),
      activePatchId: p.activePatchId === id ? undefined : p.activePatchId,
    }));
  }

  function patch(id: string, fn: (p: Patch) => Patch): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((x) => x.id === id ? fn(x) : x),
    }));
  }

  function setActive(id: string): void {
    updateProject((p) => ({ ...p, activePatchId: id }));
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <button onClick={addPatch} className="primary" style={{ fontSize: 13 }}>
          + Patch
        </button>
      </div>

      {project.patches.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Nog geen patches. Maak er een aan en bewerk de verbindingen in de
          Patcher-tab.
        </p>
      )}

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '4px 8px' }}>Actief</th>
            <th style={{ padding: '4px 8px' }}>Naam</th>
            <th style={{ padding: '4px 8px' }}>Rack</th>
            <th style={{ padding: '4px 8px' }}>Verbindingen</th>
            <th style={{ padding: '4px 8px' }}>Env / LFO</th>
            <th style={{ padding: '4px 8px' }}>Stemmen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {project.patches.map((x) => (
            <tr key={x.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '4px 8px' }}>
                <input type="radio" name="activePatch"
                  checked={project.activePatchId === x.id}
                  onChange={() => setActive(x.id)} />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <input type="text" value={x.name}
                  onChange={(e) => patch(x.id, (p) => ({ ...p, name: e.target.value }))}
                  style={{ width: '100%', fontSize: 13 }} />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <select value={x.rackId}
                  onChange={(e) => patch(x.id, (p) => ({ ...p, rackId: e.target.value }))}
                  style={{ fontSize: 12 }}>
                  {project.racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </td>
              <td style={{ padding: '4px 8px', color: '#475569' }}>{x.connections.length}</td>
              <td style={{ padding: '4px 8px', color: '#475569' }}>
                {x.envelopes.length} / {x.lfos.length}
              </td>
              <td style={{ padding: '4px 8px', color: '#475569' }}>
                <input type="number" min={1} max={64} value={x.voiceCount}
                  onChange={(e) => patch(x.id, (p) => ({ ...p, voiceCount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) }))}
                  style={{ width: 50, fontSize: 13 }} />
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                <button onClick={() => removePatch(x.id)} style={{ fontSize: 11 }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
