// Patcher — Matrix view (v2). Rows = sources (output ports), cols =
// targets (input ports), click a cell to toggle a PatchConnection.
// Only modules placed in the active patch's rack are listed.

import { updateProject, useModularProject, uid } from './store';
import {
  type Port, type PatchConnection,
  canConnect, resolvePorts, SIGNAL_COLOUR,
} from './types';

interface PortRef {
  moduleId: string;
  portId: string;
  port: Port;
  moduleName: string;
}

export function PatcherMatrixPanel({ patchId }: { patchId: string }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId)!;
  const patchRacks = project.racks.filter((r) => patch.rackIds.includes(r.id));

  const sources: PortRef[] = [];
  const targets: PortRef[] = [];

  for (const rack of patchRacks) {
    for (const slot of rack.slots) {
      const m = project.modules.find((x) => x.id === slot.moduleId);
      if (!m) continue;
      const ports = resolvePorts(m, project.moduleTypes);
      for (const p of ports) {
        const ref: PortRef = { moduleId: m.id, portId: p.id, port: p, moduleName: m.name };
        if (p.direction === 'out') sources.push(ref);
        else                       targets.push(ref);
      }
    }
  }

  function isConnected(s: PortRef, t: PortRef): boolean {
    return patch.connections.some(
      (c) => c.from.moduleId === s.moduleId && c.from.portId === s.portId
          && c.to.moduleId   === t.moduleId && c.to.portId   === t.portId,
    );
  }

  function toggle(s: PortRef, t: PortRef): void {
    if (!canConnect(s.port.signalType, t.port.signalType)) return;
    updateProject((proj) => ({
      ...proj,
      patches: proj.patches.map((px) => {
        if (px.id !== patchId) return px;
        const exists = px.connections.some(
          (c) => c.from.moduleId === s.moduleId && c.from.portId === s.portId
              && c.to.moduleId   === t.moduleId && c.to.portId   === t.portId,
        );
        if (exists) {
          return {
            ...px,
            connections: px.connections.filter(
              (c) => !(c.from.moduleId === s.moduleId && c.from.portId === s.portId
                    && c.to.moduleId   === t.moduleId && c.to.portId   === t.portId),
            ),
          };
        }
        const c: PatchConnection = {
          id: uid('c'),
          from: { moduleId: s.moduleId, portId: s.portId },
          to:   { moduleId: t.moduleId, portId: t.portId },
        };
        return { ...px, connections: [...px.connections, c] };
      }),
    }));
  }

  return (
    <div>
      <div style={{ overflow: 'auto', border: '1px solid #cbd2d9', borderRadius: 6 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: 4, background: '#f8fafc', position: 'sticky', left: 0, zIndex: 2 }}>
                bron \ doel
              </th>
              {targets.map((t) => (
                <th key={`${t.moduleId}.${t.portId}`}
                    style={{
                      padding: '6px 4px', background: '#f8fafc',
                      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                      whiteSpace: 'nowrap', borderLeft: '1px solid #e5e7eb',
                      minWidth: 22, fontWeight: 500,
                      color: SIGNAL_COLOUR[t.port.signalType],
                    }}
                    title={`${t.moduleName} · ${t.port.name} (${t.port.signalType})`}>
                  {t.moduleName}.{t.port.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={`${s.moduleId}.${s.portId}`}>
                <th style={{
                  padding: '4px 8px', background: '#f8fafc', textAlign: 'left',
                  position: 'sticky', left: 0, fontWeight: 500, whiteSpace: 'nowrap',
                  borderTop: '1px solid #e5e7eb',
                  color: SIGNAL_COLOUR[s.port.signalType],
                }} title={`${s.moduleName} · ${s.port.name} (${s.port.signalType})`}>
                  {s.moduleName}.{s.port.name}
                </th>
                {targets.map((t) => {
                  const ok = canConnect(s.port.signalType, t.port.signalType);
                  const on = ok && isConnected(s, t);
                  return (
                    <td key={`${t.moduleId}.${t.portId}`}
                        onClick={() => toggle(s, t)}
                        style={{
                          width: 22, height: 22, textAlign: 'center',
                          borderLeft: '1px solid #e5e7eb', borderTop: '1px solid #e5e7eb',
                          background: on ? SIGNAL_COLOUR[s.port.signalType] : (ok ? '#ffffff' : '#f3f4f6'),
                          color: on ? 'white' : '#9ca3af',
                          cursor: ok ? 'pointer' : 'not-allowed',
                          fontWeight: 700,
                        }}>
                      {on ? '●' : ok ? '' : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
        Klik een cel om bron→doel te (de)patchen. Alleen poorten van modules
        die in het rack van deze patch geplaatst zijn worden getoond.
      </p>
    </div>
  );
}
