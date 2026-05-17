import {
  addPatch, devicesInFlowOrder, duplicatePatch, removePatch, renamePatch,
  setActivePatch, toggleBypass,
} from './actions';
import { useProject } from './store';

export function PatchesPanel(): JSX.Element {
  const project = useProject();

  const sortedPatches = [...project.patches].sort((a, b) => a.id - b.id);
  const active = project.patches.find((p) => p.id === project.activePatchId)
              ?? project.patches[0];
  const ordered = devicesInFlowOrder(project);
  const bypassedSet = new Set(active?.bypassed ?? []);
  const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));

  return (
    <section>
      <div className="es-toolbar">
        <button className="primary" onClick={() => addPatch(`Patch ${project.patches.length}`)}>
          + Nieuwe patch
        </button>
        {active && (
          <button onClick={() => duplicatePatch(active.id, `${active.name} copy`)}>
            Dupliceer
          </button>
        )}
        {active && project.patches.length > 1 && (
          <button className="danger" onClick={() => removePatch(active.id)}>
            Verwijder patch
          </button>
        )}
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          Klik op een effect om bypass te togglen. Uitgegrijsd = bypass (relais uit).
        </span>
      </div>

      <div className="es-patches-layout">
        {/* ─── Patch list ─── */}
        <div>
          <div className="es-patch-list">
            {sortedPatches.map((p) => (
              <div
                key={p.id}
                className="es-patch-row"
                aria-selected={p.id === active?.id}
                onClick={() => setActivePatch(p.id)}
              >
                <span className="es-patch-pgm">PC&nbsp;{p.id + 1}</span>
                <span className="es-patch-name">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Properties + signal chain ─── */}
        <div>
          {/* Properties panel */}
          {active && (
            <div className="es-patch-props">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, flex: 1 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Naam</span>
                    <span style={{ color: '#9ca3af' }}>{active.name.length}/16</span>
                  </span>
                  <input
                    type="text"
                    maxLength={16}
                    value={active.name}
                    onChange={(e) => renamePatch(active.id, e.target.value)}
                    style={{ width: '100%', fontSize: 13 }}
                  />
                  <span style={{ fontSize: 10, color: '#6b7280' }}>max. 16 tekens (past op display)</span>
                </label>
                <div style={{ fontSize: 12, color: '#6b7280', paddingBottom: 4 }}>
                  PC&nbsp;<strong style={{ fontSize: 14, color: '#1f2933' }}>{active.id + 1}</strong>
                </div>
              </div>
            </div>
          )}

          <h3 style={{ margin: '12px 0 8px 0' }}>
            {active ? `${active.name}` : 'Geen patch'}
          </h3>
          {ordered.length === 0 && (
            <div className="es-empty">
              Nog geen effectapparaten. Voeg ze toe in tab “Effect-chain”.
            </div>
          )}
          {ordered.length > 0 && (
            <div className="es-chain-view">
              <div className="es-arrow active">IN ▶</div>
              {ordered.map((d, i) => {
                const bypassed = bypassedSet.has(d.id);
                return (
                  <span key={d.id} style={{ display: 'contents' }}>
                    <div
                      className={`es-effect-card ${bypassed ? 'bypassed' : 'active'}`}
                      onClick={() => active && toggleBypass(active.id, d.id)}
                      title={bypassed ? 'Klik om te activeren' : 'Klik om te bypassen'}
                    >
                      {d.imageDataUrl
                        ? <img src={d.imageDataUrl} alt={d.model}
                               style={{ width: '100%', height: 60, objectFit: 'contain', background: '#f5f7fa', borderRadius: 4 }} />
                        : <div style={{
                            height: 60, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 28, color: '#9ca3af',
                          }}>🎛️</div>
                      }
                      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>{d.brand}</div>
                      <div style={{ fontSize: 11, color: '#4b5563' }}>{d.model}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        {catLabel.get(d.categoryId)} · R{d.relayIndex >= 0 ? d.relayIndex + 1 : '?'}
                      </div>
                    </div>
                    {i < ordered.length - 1 && (
                      <div className={`es-arrow ${!bypassed && !bypassedSet.has(ordered[i + 1]!.id) ? 'active' : ''}`}>▶</div>
                    )}
                  </span>
                );
              })}
              <div className={`es-arrow ${ordered.length > 0 && !bypassedSet.has(ordered[ordered.length - 1]!.id) ? 'active' : ''}`}>▶ OUT</div>
            </div>
          )}

          {active && ordered.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#4b5563' }}>
              <strong>Relais-masker:</strong>{' '}
              <code>{formatRelayMask(active, project.devices, project.relayCount)}</code>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatRelayMask(
  patch: { bypassed: string[] },
  devices: { id: string; relayIndex: number }[],
  relayCount: number,
): string {
  const bypassed = new Set(patch.bypassed);
  let mask = 0;
  for (const d of devices) {
    if (d.relayIndex < 0 || d.relayIndex >= relayCount) continue;
    if (!bypassed.has(d.id)) mask |= (1 << d.relayIndex);
  }
  const hex = mask.toString(16).padStart(Math.ceil(relayCount / 4), '0').toUpperCase();
  const bin = mask.toString(2).padStart(relayCount, '0');
  return `0x${hex}  (${bin})`;
}
