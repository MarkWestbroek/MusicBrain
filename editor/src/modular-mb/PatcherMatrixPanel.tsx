// Patcher — Matrix view (v2). Rows = sources (output ports), cols =
// targets (input ports), click a cell to toggle a PatchConnection.
// Only modules placed in the active patch's rack are listed.
//
// Poly-groepen: followers (schaduw-voices) worden standaard verborgen —
// je patcht één stem (de master, gemarkeerd ×N) en polyExpand waaiert de
// kabels bij compile uit. Zo blijft de matrix bij poly-patches compact én
// verschijnt elk vinkje ook echt als kabel in de graph-view (kabels op
// verborgen followers worden daar niet getekend). Een toggle toont de
// followers alsnog voor wie per-voice wil patchen.

import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import {
  type Port, type PatchConnection, type PolyGroup,
  canConnect, resolvePorts, SIGNAL_COLOUR,
} from './types';

interface PortRef {
  moduleId: string;
  portId: string;
  port: Port;
  moduleName: string;
  /** Gezet wanneer deze poort een poly-master is (hele module of master-cell):
   *  één vinkje staat voor ×N stemmen. */
  poly?: PolyGroup;
}

export function PatcherMatrixPanel({ patchId }: { patchId: string }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId)!;
  const patchRacks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const [showFollowers, setShowFollowers] = useState(false);

  // ── Poly-groepslidmaatschap per module / per cell-poort ──────────────
  const followerModuleIds = new Set<string>();
  const followerCellPorts = new Set<string>();          // `${moduleId}:${portId}`
  const masterModuleGroup = new Map<string, PolyGroup>(); // moduleId → group
  const masterCellPorts   = new Map<string, PolyGroup>(); // `${moduleId}:${portId}` → group

  for (const rack of patchRacks) {
    for (const g of rack.polyGroups ?? []) {
      g.members.forEach((mem, idx) => {
        if (mem.kind === 'module') {
          if (idx === 0) masterModuleGroup.set(mem.moduleId, g);
          else followerModuleIds.add(mem.moduleId);
          return;
        }
        // Cell-member: poorten van deze cell heten `<base>_<cellIndex+1>`.
        const mod  = project.modules.find((m) => m.id === mem.moduleId);
        const type = project.moduleTypes.find((t) => t.id === mod?.typeId);
        const cg   = type?.cellGroups?.find((x) => x.id === mem.cellGroupId);
        if (!cg) return;
        for (const base of cg.portIds) {
          const key = `${mem.moduleId}:${base}_${mem.cellIndex + 1}`;
          if (idx === 0) masterCellPorts.set(key, g);
          else followerCellPorts.add(key);
        }
      });
    }
  }

  const sources: PortRef[] = [];
  const targets: PortRef[] = [];
  let hiddenPortCount = 0;

  for (const rack of patchRacks) {
    for (const slot of rack.slots) {
      const m = project.modules.find((x) => x.id === slot.moduleId);
      if (!m) continue;
      const ports = resolvePorts(m, project.moduleTypes);
      for (const p of ports) {
        const key = `${m.id}:${p.id}`;
        const isFollower = followerModuleIds.has(m.id) || followerCellPorts.has(key);
        if (isFollower && !showFollowers) { hiddenPortCount++; continue; }
        const poly = masterModuleGroup.get(m.id) ?? masterCellPorts.get(key);
        const ref: PortRef = { moduleId: m.id, portId: p.id, port: p, moduleName: m.name, poly };
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

  const portLabel = (r: PortRef): string =>
    `${r.moduleName}.${r.port.name}${r.poly ? ` ×${r.poly.voiceCount}` : ''}`;
  const portTitle = (r: PortRef): string =>
    `${r.moduleName} · ${r.port.name} (${r.port.signalType})`
    + (r.poly ? ` · poly-master ×${r.poly.voiceCount} (${r.poly.label})` : '');

  return (
    <div>
      {hiddenPortCount > 0 || showFollowers ? (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', marginBottom: 6 }}>
          <input type="checkbox" checked={showFollowers}
                 onChange={(e) => setShowFollowers(e.target.checked)} />
          Toon voices (followers) van poly-groepen
          {!showFollowers && <span style={{ color: '#9ca3af' }}>— {hiddenPortCount} poorten verborgen</span>}
        </label>
      ) : null}
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
                      minWidth: 22, fontWeight: t.poly ? 700 : 500,
                      color: SIGNAL_COLOUR[t.port.signalType],
                    }}
                    title={portTitle(t)}>
                  {portLabel(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={`${s.moduleId}.${s.portId}`}>
                <th style={{
                  padding: '4px 8px', background: '#f8fafc', textAlign: 'left',
                  position: 'sticky', left: 0, fontWeight: s.poly ? 700 : 500, whiteSpace: 'nowrap',
                  borderTop: '1px solid #e5e7eb',
                  color: SIGNAL_COLOUR[s.port.signalType],
                }} title={portTitle(s)}>
                  {portLabel(s)}
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
        Poorten gemarkeerd <strong>×N</strong> zijn poly-masters: één vinkje
        patcht alle N stemmen tegelijk.
      </p>
    </div>
  );
}
