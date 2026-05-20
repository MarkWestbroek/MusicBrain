// Patcher — Graph view (v2).
//
// Each module placed in the active patch's rack is rendered as a ReactFlow
// node containing the full SVG ModulePanel; ports of the module become
// ReactFlow handles on the node's borders. Cables (edges) follow the same
// signal-type colour rules. Knob/slider/switch values are read from and
// written back to `patch.controlState`.
//
// Module positions in the graph mirror their rack slot (row × HP), so the
// graph view is a free zoom/pan of the same physical layout.

import { useCallback, useMemo, useState } from 'react';
import {
  Background, Controls, Handle, Position,
  ReactFlow, ReactFlowProvider, ConnectionMode,
  useReactFlow,
  type Connection, type Edge, type EdgeChange,
  type Node, type NodeChange, type NodeProps, type NodeTypes,
  type EdgeProps, type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { useEngineStatus } from './sim/engineSingleton';
import {
  type Module, type ModuleType, type Port, type PatchConnection,
  type ControlValue, type RackSlot,
  canConnect, resolvePorts,
  SIGNAL_COLOUR, SIGNAL_LABEL,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';

const PX_PER_MM = 2.4;

// ── Node ───────────────────────────────────────────────────────────────

interface ModuleNodeData {
  module: Module;
  types: ModuleType[];
  controlState: Record<string, ControlValue>;
  patchId: string;
}

function ModuleNode({ data }: NodeProps): JSX.Element {
  const { module: m, types, controlState, patchId } = data as unknown as ModuleNodeData;
  // Live-status (step-LEDs etc.) wordt hier lokaal gemerged zodat een
  // engineStatus-tick niet de hele graph laat re-builden — alleen deze
  // node re-rendert.
  const engineStatus = useEngineStatus();
  const liveCtrl = engineStatus.liveControls[m.id];
  const merged = liveCtrl ? { ...controlState, ...liveCtrl } : controlState;
  const ports = resolvePorts(m, types);
  const heightMm = m.visual.heightMm ?? PANEL_HEIGHT_MM;
  const widthMm  = m.visual.hpWidth * MM_PER_HP;

  function setControl(controlId: string, value: ControlValue): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((px) => {
        if (px.id !== patchId) return px;
        const prev = px.controlState[m.id] ?? {};
        return {
          ...px,
          controlState: { ...px.controlState, [m.id]: { ...prev, [controlId]: value } },
        };
      }),
    }));
  }

  return (
    <div
      className="nopan nowheel"
      style={{ position: 'relative', background: '#0f172a', borderRadius: 4 }}
    >
      <ModulePanel
        module={m} types={types}
        controlState={merged}
        onControlChange={setControl}
        pxPerMm={PX_PER_MM}
        showPortLabels={true}
      />
      {/* Handles — positioned on top of each port using the panel's port
          placements so ReactFlow can draw cables from the actual jacks. */}
      {ports.map((p) => {
        const pl = m.visual.portPlacements[p.id];
        if (!pl) return null;
        const left = pl.x * PX_PER_MM;
        const top  = pl.y * PX_PER_MM;
        return (
          <Handle
            key={p.id}
            id={p.id}
            type={p.direction === 'in' ? 'target' : 'source'}
            position={p.direction === 'in' ? Position.Left : Position.Right}
            isConnectable={true}
            style={{
              left, top,
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12,
              background: SIGNAL_COLOUR[p.signalType],
              border: '1.5px solid rgba(0,0,0,0.55)',
              borderRadius: '50%',
              opacity: 0.95,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.35) inset',
              pointerEvents: 'all',
            }}
          />
        );
      })}
      {/* Hidden marker for total size — ensures ReactFlow gives node enough room */}
      <div style={{ width: widthMm * PX_PER_MM, height: heightMm * PX_PER_MM, pointerEvents: 'none', position: 'absolute', top: 0, left: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { module: ModuleNode };

// ── Edge: bezier-pad met sleepbare control-point ───────────────────────

interface BendableEdgeData {
  bends?: { x: number; y: number }[];
  patchId: string;
  connectionId: string;
}

/** Polyline-pad door alle waypoints. */
function buildPath(sx: number, sy: number, tx: number, ty: number,
                   bends: { x: number; y: number }[]): string {
  let p = `M ${sx},${sy}`;
  for (const b of bends) p += ` L ${b.x},${b.y}`;
  p += ` L ${tx},${ty}`;
  return p;
}

/** Loodrechte projectie van P op segment AB (geclamped op [A,B]). Geeft
 *  het projectie-punt en de afstand (in flow-coords). */
function projectOnSegment(
  ax: number, ay: number, bx: number, by: number, px: number, py: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  const ddx = px - x, ddy = py - y;
  return { x, y, t, dist: Math.sqrt(ddx * ddx + ddy * ddy) };
}

function BendableEdge(props: EdgeProps): JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, style, selected, data } = props;
  const d = data as unknown as BendableEdgeData;
  const bends = d?.bends ?? [];
  const path = buildPath(sourceX, sourceY, targetX, targetY, bends);
  const rf = useReactFlow();

  function writeBends(next: { x: number; y: number }[]): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((px) => px.id !== d.patchId ? px : ({
        ...px,
        connections: px.connections.map((c) => c.id !== d.connectionId
          ? c
          : { ...c, bends: next }),
      })),
    }));
  }

  /** Dubbelklik op de kabel zelf → voeg een knik toe op het dichtstbijzijnde punt. */
  function onCableDoubleClick(e: React.MouseEvent<SVGPathElement>): void {
    e.stopPropagation();
    e.preventDefault();
    const pt = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // Bouw waypoint-lijst inclusief endpoints om het beste segment te vinden.
    const wps = [{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }];
    let bestSeg = 0, bestProj = { x: pt.x, y: pt.y, t: 0, dist: Infinity };
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i]!; const b = wps[i + 1]!;
      const pr = projectOnSegment(a.x, a.y, b.x, b.y, pt.x, pt.y);
      if (pr.dist < bestProj.dist) { bestProj = pr; bestSeg = i; }
    }
    const next = bends.slice();
    next.splice(bestSeg, 0, { x: bestProj.x, y: bestProj.y });
    writeBends(next);
  }

  /** Sleep een knik via window-listeners (werkt buiten de cirkel om). */
  function onKnotPointerDown(idx: number, e: React.PointerEvent<SVGCircleElement>): void {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    e.preventDefault();
    const flowStart = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const orig = bends[idx]!;
    let latest = bends.slice();

    function onMove(ev: PointerEvent): void {
      const cur = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const nx = orig.x + (cur.x - flowStart.x);
      const ny = orig.y + (cur.y - flowStart.y);
      latest = latest.map((b, i) => i === idx ? { x: nx, y: ny } : b);
      writeBends(latest);
    }
    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /** Dubbelklik op een knik → verwijder hem. */
  function onKnotDoubleClick(idx: number, e: React.MouseEvent<SVGCircleElement>): void {
    e.stopPropagation();
    e.preventDefault();
    writeBends(bends.filter((_, i) => i !== idx));
  }

  return (
    <>
      {/* Onzichtbare hit-strip — vangt klikken op de kabel makkelijker op. */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
        onDoubleClick={onCableDoubleClick}
      />
      {/* Zichtbare kabel. */}
      <path d={path} fill="none" style={style} pointerEvents="none" />
      {/* Knikpunten — alleen als ze bestaan; geen ruis bij rechte kabels. */}
      {bends.map((b, i) => (
        <circle
          key={i}
          cx={b.x} cy={b.y}
          r={selected ? 7 : 5}
          fill={selected ? '#fbbf24' : '#f8fafc'}
          stroke="#0f172a"
          strokeWidth={2}
          className="nodrag nopan"
          style={{ cursor: 'grab', pointerEvents: 'all' }}
          onPointerDown={(e) => onKnotPointerDown(i, e)}
          onDoubleClick={(e) => onKnotDoubleClick(i, e)}
        >
          <title>Sleep om te verplaatsen · dubbelklik = verwijderen</title>
        </circle>
      ))}
    </>
  );
}

const edgeTypes: EdgeTypes = { bendable: BendableEdge };

// ── Inner panel (inside ReactFlowProvider) ─────────────────────────────

function PatcherGraphInner({ patchId }: { patchId: string }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId)!;
  const patchRacks = project.racks.filter((r) => patch.rackIds.includes(r.id));

  // Stack racks vertically: y-offset per rack = som van vorige rack-hoogtes
  // (rows × panel-hoogte) + gutter.
  const RACK_GUTTER_MM = 18;
  const rackYOffsetMm = useMemo(() => {
    const map = new Map<string, number>();
    let y = 0;
    for (const r of patchRacks) {
      map.set(r.id, y);
      y += r.rows * (PANEL_HEIGHT_MM + 6) + RACK_GUTTER_MM;
    }
    return map;
  }, [patchRacks]);

  const placedModules = useMemo(() => {
    const out: { slot: RackSlot; module: Module; rackId: string }[] = [];
    for (const r of patchRacks) {
      for (const s of r.slots) {
        const m = project.modules.find((x) => x.id === s.moduleId);
        if (m) out.push({ slot: s, module: m, rackId: r.id });
      }
    }
    return out;
  }, [patchRacks, project.modules]);

  const nodes: Node[] = useMemo(
    () => placedModules.map(({ slot, module: m, rackId }) => ({
      id: m.id,
      type: 'module',
      position: {
        x: slot.hpOffset * MM_PER_HP * PX_PER_MM,
        y: ((rackYOffsetMm.get(rackId) ?? 0)
            + slot.row * (PANEL_HEIGHT_MM + 6)) * PX_PER_MM,
      },
      data: {
        module: m,
        types: project.moduleTypes,
        controlState: patch.controlState[m.id] ?? {},
        patchId,
      },
      // Lock dragging — position derives from rack.
      draggable: false,
    })),
    [placedModules, rackYOffsetMm, project.moduleTypes, patch.controlState, patchId],
  );

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const edges: Edge[] = useMemo(
    () => patch.connections.map((c) => {
      const srcMod  = project.modules.find((m) => m.id === c.from.moduleId);
      const srcPort = srcMod && resolvePorts(srcMod, project.moduleTypes)
        .find((p) => p.id === c.from.portId);
      const colour = srcPort ? SIGNAL_COLOUR[srcPort.signalType] : '#475569';
      const isSel = c.id === selectedEdgeId;
      return {
        id: c.id,
        source: c.from.moduleId, sourceHandle: c.from.portId,
        target: c.to.moduleId,   targetHandle: c.to.portId,
        type: 'bendable',
        data: { bends: c.bends ?? [], patchId, connectionId: c.id },
        selected: isSel,
        // zIndex tilt edges above the node-panel (default they render below)
        zIndex: isSel ? 1500 : 1000,
        // brede onzichtbare hit-strip zodat de kabel makkelijker te klikken is
        interactionWidth: 24,
        // re-attach door uiteinde te slepen
        reconnectable: true,
        style: {
          stroke: colour,
          strokeWidth: isSel ? 6 : 3,
          strokeLinecap: 'round',
          filter: isSel
            ? `drop-shadow(0 0 6px ${colour})`
            : 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))',
        },
      } as Edge;
    }),
    [patch.connections, project.modules, project.moduleTypes, selectedEdgeId],
  );

  const onNodesChange = useCallback((_changes: NodeChange[]) => {
    // Positions are fixed (driven by rack). Nothing to persist.
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'select') {
        setSelectedEdgeId((prev) => ch.selected ? ch.id : (prev === ch.id ? null : prev));
      }
      if (ch.type === 'remove') {
        const eid = ch.id;
        setSelectedEdgeId((prev) => prev === eid ? null : prev);
        updateProject((p) => ({
          ...p,
          patches: p.patches.map((px) => px.id !== patchId ? px
            : { ...px, connections: px.connections.filter((c) => c.id !== eid) }),
        }));
      }
    }
  }, [patchId]);

  // Klik direct op een kabel: selecteer hem expliciet (React Flow doet dit
  // ook intern, maar we houden er onze eigen state op na zodat de visuele
  // dikte/glow door re-renders heen blijft staan en Delete het juiste id
  // pakt).
  const onEdgeClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) {
      console.warn('[patcher] connection missing source/target/handle', c);
      return;
    }
    // ConnectionMode=Loose: source/target may be reversed if user dragged in→out.
    // Normalise so srcPort is always the output.
    let aMod = project.modules.find((m) => m.id === c.source);
    let bMod = project.modules.find((m) => m.id === c.target);
    if (!aMod || !bMod) return;
    let aPort = resolvePorts(aMod, project.moduleTypes).find((p) => p.id === c.sourceHandle);
    let bPort = resolvePorts(bMod, project.moduleTypes).find((p) => p.id === c.targetHandle);
    if (!aPort || !bPort) return;
    if (aPort.direction === 'in' && bPort.direction === 'out') {
      [aMod, bMod] = [bMod, aMod];
      [aPort, bPort] = [bPort, aPort];
    }
    if (aPort.direction !== 'out' || bPort.direction !== 'in') {
      console.warn('[patcher] rejected: need out→in', { aPort, bPort });
      return;
    }
    const srcMod = aMod, dstMod = bMod, srcPort = aPort, dstPort = bPort;
    if (!canConnect(srcPort.signalType, dstPort.signalType)) {
      console.warn('[patcher] rejected: incompatible signal types', srcPort.signalType, '→', dstPort.signalType);
      return;
    }
    const conn: PatchConnection = {
      id: uid('c'),
      from: { moduleId: c.source, portId: c.sourceHandle },
      to:   { moduleId: c.target, portId: c.targetHandle },
    };
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((px) => px.id !== patchId ? px
        : { ...px, connections: [...px.connections, conn] }),
    }));
    console.log('[patcher] connected', srcMod.name, srcPort.name, '→', dstMod.name, dstPort.name);
  }, [project.modules, project.moduleTypes, patchId]);

  // Edge-reconnect: gebruiker sleept een uiteinde van een bestaande kabel
  // naar een andere jack. We verwijderen de oude verbinding en draaien de
  // nieuwe door dezelfde validatie/normalisatie als onConnect.
  const onReconnect = useCallback((oldEdge: Edge, conn: Connection) => {
    if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return;
    let aMod = project.modules.find((m) => m.id === conn.source);
    let bMod = project.modules.find((m) => m.id === conn.target);
    if (!aMod || !bMod) return;
    let aPort = resolvePorts(aMod, project.moduleTypes).find((p) => p.id === conn.sourceHandle);
    let bPort = resolvePorts(bMod, project.moduleTypes).find((p) => p.id === conn.targetHandle);
    if (!aPort || !bPort) return;
    if (aPort.direction === 'in' && bPort.direction === 'out') {
      [aMod, bMod] = [bMod, aMod];
      [aPort, bPort] = [bPort, aPort];
    }
    if (aPort.direction !== 'out' || bPort.direction !== 'in') return;
    if (!canConnect(aPort.signalType, bPort.signalType)) return;
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((px) => px.id !== patchId ? px
        : {
            ...px,
            connections: [
              ...px.connections.filter((c) => c.id !== oldEdge.id),
              { id: oldEdge.id,
                from: { moduleId: aMod!.id, portId: aPort!.id },
                to:   { moduleId: bMod!.id, portId: bPort!.id } },
            ],
          }),
    }));
  }, [project.modules, project.moduleTypes, patchId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }}>
      <style>{`
        /* Selected cable: dikker, lichte glow, kleine label-cue */
        .mmb-patcher .react-flow__edge.selected .react-flow__edge-path {
          stroke-width: 5 !important;
          filter: drop-shadow(0 0 4px rgba(255,255,255,0.55));
        }
        /* Hover-feedback op de brede onzichtbare hitzone */
        .mmb-patcher .react-flow__edge:hover .react-flow__edge-path {
          stroke-width: 4 !important;
          cursor: pointer;
        }
      `}</style>
      <div
        className="mmb-patcher"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
            const eid = selectedEdgeId;
            setSelectedEdgeId(null);
            updateProject((p) => ({
              ...p,
              patches: p.patches.map((px) => px.id !== patchId ? px
                : { ...px, connections: px.connections.filter((c) => c.id !== eid) }),
            }));
            e.preventDefault();
          }
        }}
        style={{
          height: 620, border: '1px solid #cbd2d9', borderRadius: 6,
          background: '#0f172a', userSelect: 'none', outline: 'none',
        }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={['Delete', 'Backspace']}
          edgesFocusable={true}
          fitView
          minZoom={0.3} maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#1e293b" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <Legend />
    </div>
  );
}

function Legend(): JSX.Element {
  return (
    <aside style={{
      border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: 'white',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', color: '#374151' }}>
        Signaal-types
      </h3>
      {(['cv', 'gate', 'trigger', 'audio', 'midi'] as const).map((t) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '18px', fontSize: 11 }}>
          <span style={{
            display: 'inline-block', width: 18, height: 3,
            background: SIGNAL_COLOUR[t], borderRadius: 1,
          }} />
          {SIGNAL_LABEL[t]}
        </div>
      ))}
      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
        Sleep van een uit-jack naar een in-jack om te patchen.
        Selecteer een kabel en druk Delete om te verwijderen.
      </p>
      <p style={{ fontSize: 11, color: '#6b7280' }}>
        Knoppen/schuiven/schakelaars zijn live: ze tonen en wijzigen de
        toestand van de huidige patch.
      </p>
    </aside>
  );
}

export function PatcherGraphPanel(props: { patchId: string }): JSX.Element {
  return (
    <ReactFlowProvider>
      <PatcherGraphInner {...props} />
    </ReactFlowProvider>
  );
}

/** Used by MatrixPanel via re-export to avoid an extra unused-Port warning. */
export type { Port };
