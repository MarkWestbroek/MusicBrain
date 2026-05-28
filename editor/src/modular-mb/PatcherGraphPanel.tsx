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
  type ModuleInstance, type ModuleType, type Port, type PatchConnection,
  type ControlValue, type RackSlot, type PolyGroup, type PatchPolyOverride,
  canConnect, resolvePorts,
  SIGNAL_COLOUR, SIGNAL_LABEL,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';

const PX_PER_MM = 2.4;

// ── Node ───────────────────────────────────────────────────────────────

interface ModuleNodeData {
  module: ModuleInstance;
  types: ModuleType[];
  controlState: Record<string, ControlValue>;
  patchId: string;
  /** When this module is part of a PolyGroup: which group + voice-index.
   *  voiceIndex 0 = master, ≥1 = ghost follower (only present when the
   *  group is expanded in the patcher). */
  voice?: { group: PolyGroup; voiceIndex: number };
  /** True when rendered as a ghost (follower of an expanded group). */
  ghost?: boolean;
}

function ModuleNode({ data, selected }: NodeProps): JSX.Element {
  const { module: m, types, controlState, patchId, voice, ghost } = data as unknown as ModuleNodeData;
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
      style={{
        position: 'relative', background: '#0f172a', borderRadius: 4,
        outline: voice && !ghost ? `2px solid ${voice.group.color || '#22d3ee'}` : 'none',
        outlineOffset: -2,
        opacity: ghost ? 0.42 : 1,
        filter: ghost ? 'grayscale(0.45)' : undefined,
        boxShadow: selected
          ? 'inset 0 0 0 2px #fbbf24, inset 0 0 12px rgba(251,191,36,0.35)'
          : (voice && !ghost ? `0 0 14px ${voice.group.color || '#22d3ee'}55` : undefined),
        transition: 'box-shadow 120ms',
        pointerEvents: ghost ? 'none' : undefined,
      }}
    >
      <ModulePanel
        module={m} types={types}
        controlState={merged}
        onControlChange={setControl}
        pxPerMm={PX_PER_MM}
        showPortLabels={true}
      />
      {voice && (
        <div style={{
          position: 'absolute', top: 2, left: 2, zIndex: 5,
          fontSize: 11, fontWeight: 600, color: '#0f172a',
          background: voice.group.color || '#22d3ee',
          padding: '1px 6px', borderRadius: 3,
          boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          {ghost
            ? `${voice.voiceIndex + 1}/${voice.group.voiceCount}`
            : `× ${voice.group.voiceCount} · ${voice.group.label}`}
        </div>
      )}
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
            isConnectable={!ghost}
            style={{
              left, top,
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12,
              background: SIGNAL_COLOUR[p.signalType],
              border: '1.5px solid rgba(0,0,0,0.55)',
              borderRadius: ghost ? 2 : '50%',
              opacity: ghost ? 0.55 : 0.95,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.35) inset',
              pointerEvents: ghost ? 'none' : 'all',
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

/** Pad door alle waypoints. Wanneer `smooth=true` wordt door de tussen-
 *  liggende knikken een cardinal-achtige curve getrokken: per knik gaat
 *  de lijn naar het midden van het inkomende segment, maakt een
 *  kwadratische bocht door de knik en gaat door naar het midden van het
 *  uitgaande segment. Hoekige weergave (smooth=false) gebruikt een
 *  rechte polyline — handig tijdens het slepen voor exacte feedback. */
function buildPath(sx: number, sy: number, tx: number, ty: number,
                   bends: { x: number; y: number }[],
                   smooth: boolean): string {
  if (bends.length === 0 || !smooth) {
    let p = `M ${sx},${sy}`;
    for (const b of bends) p += ` L ${b.x},${b.y}`;
    p += ` L ${tx},${ty}`;
    return p;
  }
  // Smooth: M src L mid0 [Q b_i mid_i]* L tgt
  const pts = [{ x: sx, y: sy }, ...bends, { x: tx, y: ty }];
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let p = `M ${pts[0]!.x},${pts[0]!.y}`;
  // Lijn naar de eerste midpoint.
  const m0 = mid(pts[0]!, pts[1]!);
  p += ` L ${m0.x},${m0.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i]!;
    const nxt = pts[i + 1]!;
    const m = mid(cur, nxt);
    p += ` Q ${cur.x},${cur.y} ${m.x},${m.y}`;
  }
  p += ` L ${pts[pts.length - 1]!.x},${pts[pts.length - 1]!.y}`;
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
  const rf = useReactFlow();
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  // Tijdens drag rechte segmenten ("alsof je de kabel beetpakt"); anders smooth.
  const path = buildPath(sourceX, sourceY, targetX, targetY, bends, !dragging);
  const cableColor = (style as React.CSSProperties | undefined)?.stroke as string | undefined ?? '#94a3b8';

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
    setDragging(true);
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
      setDragging(false);
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
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      />
      {/* Zichtbare kabel. */}
      <path d={path} fill="none" style={style} pointerEvents="none" strokeLinejoin="round" strokeLinecap="round" />
      {/* Knikpunten — alleen als ze bestaan; geen ruis bij rechte kabels. */}
      {bends.map((b, i) => {
        const r = selected ? 6 : (hover || dragging) ? 5 : 3.2;
        // Rusttoestand: zelfde kleur als kabel, donkere dunne rand → "wegzakken".
        // Hover/drag/selected: licht oplichten.
        const fill = selected
          ? '#fbbf24'
          : (hover || dragging) ? '#f8fafc' : cableColor;
        const stroke = selected || hover || dragging ? '#0f172a' : 'rgba(15,23,42,0.65)';
        return (
          <circle
            key={i}
            cx={b.x} cy={b.y}
            r={r}
            fill={fill}
            fillOpacity={selected || hover || dragging ? 1 : 0.85}
            stroke={stroke}
            strokeWidth={selected || hover || dragging ? 2 : 1.2}
            className="nodrag nopan"
            style={{ cursor: 'grab', pointerEvents: 'all', transition: 'r 120ms, fill 120ms' }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onPointerDown={(e) => onKnotPointerDown(i, e)}
            onDoubleClick={(e) => onKnotDoubleClick(i, e)}
          >
            <title>Sleep om te verplaatsen · dubbelklik = verwijderen</title>
          </circle>
        );
      })}
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
    const out: { slot: RackSlot; module: ModuleInstance; rackId: string }[] = [];
    for (const r of patchRacks) {
      for (const s of r.slots) {
        const m = project.modules.find((x) => x.id === s.moduleId);
        if (m) out.push({ slot: s, module: m, rackId: r.id });
      }
    }
    return out;
  }, [patchRacks, project.modules]);

  // ── Polyphony view-state (A4-full) ───────────────────────────────────
  // For each module: which PolyGroup it belongs to + voice-index. Built
  // once across all racks visible in this patch.
  const voiceMap = useMemo(() => {
    const map = new Map<string, { group: PolyGroup; voiceIndex: number }>();
    for (const r of patchRacks) {
      for (const g of r.polyGroups ?? []) {
        g.members.forEach((mem, idx) => {
          if (mem.kind === 'module') map.set(mem.moduleId, { group: g, voiceIndex: idx });
        });
      }
    }
    return map;
  }, [patchRacks]);
  const allGroups = useMemo(() => {
    const gs: PolyGroup[] = [];
    for (const r of patchRacks) for (const g of r.polyGroups ?? []) gs.push(g);
    return gs;
  }, [patchRacks]);

  // Expand/collapse per group. Default = all collapsed (only masters shown).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleExpand = (gid: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // Real-but-hidden followers are kept as ghost nodes only when their
  // group is expanded. Masters are always rendered. Non-grouped modules
  // are always rendered.
  const visibleModules = useMemo(() =>
    placedModules.filter(({ module: m }) => {
      const v = voiceMap.get(m.id);
      if (!v) return true;                             // not in a group
      if (v.voiceIndex === 0) return true;             // master → always
      return expandedGroups.has(v.group.id);           // follower → only if expanded
    }),
  [placedModules, voiceMap, expandedGroups]);

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodes: Node[] = useMemo(
    () => visibleModules.map(({ slot, module: m, rackId }) => {
      const voice = voiceMap.get(m.id);
      const ghost = !!(voice && voice.voiceIndex > 0);
      return {
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
          voice,
          ghost,
        },
        selected: m.id === selectedNodeId,
        // Lock dragging — position derives from rack.
        draggable: false,
        selectable: !ghost,
      };
    }),
    [visibleModules, rackYOffsetMm, project.moduleTypes, patch.controlState, patchId, selectedNodeId, voiceMap],
  );

  const edges: Edge[] = useMemo(
    () => patch.connections.flatMap((c) => {
      const srcMod  = project.modules.find((m) => m.id === c.from.moduleId);
      const srcPort = srcMod && resolvePorts(srcMod, project.moduleTypes)
        .find((p) => p.id === c.from.portId);
      const colour = srcPort ? SIGNAL_COLOUR[srcPort.signalType] : '#475569';
      const isSel = c.id === selectedEdgeId;
      // Hide cables touching a hidden follower (collapsed group).
      const srcV = voiceMap.get(c.from.moduleId);
      const dstV = voiceMap.get(c.to.moduleId);
      const srcHidden = !!(srcV && srcV.voiceIndex > 0 && !expandedGroups.has(srcV.group.id));
      const dstHidden = !!(dstV && dstV.voiceIndex > 0 && !expandedGroups.has(dstV.group.id));
      if (srcHidden || dstHidden) return [];
      // Poly-cable detection: both endpoints are masters in (the same) group,
      // OR one is a master — then this cable visually carries N voices.
      const polyGroup = srcV && srcV.voiceIndex === 0 ? srcV.group
                       : dstV && dstV.voiceIndex === 0 ? dstV.group
                       : null;
      const tintColour = polyGroup ? (polyGroup.color || colour) : colour;
      const stroke = polyGroup ? Math.max(isSel ? 7 : 5, 5) : (isSel ? 6 : 3);
      return [{
        id: c.id,
        source: c.from.moduleId, sourceHandle: c.from.portId,
        target: c.to.moduleId,   targetHandle: c.to.portId,
        type: 'bendable',
        data: { bends: c.bends ?? [], patchId, connectionId: c.id },
        selected: isSel,
        zIndex: isSel ? 1500 : 1000,
        interactionWidth: 24,
        reconnectable: true,
        label: polyGroup ? `×${polyGroup.voiceCount}` : undefined,
        labelStyle: polyGroup ? { fill: '#0f172a', fontWeight: 700, fontSize: 11 } : undefined,
        labelBgStyle: polyGroup ? { fill: tintColour } : undefined,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
        style: {
          stroke: tintColour,
          strokeWidth: stroke,
          strokeLinecap: 'round',
          strokeDasharray: polyGroup ? '0' : undefined,
          filter: isSel
            ? `drop-shadow(0 0 6px ${tintColour})`
            : (polyGroup
                ? `drop-shadow(0 0 4px ${tintColour}88)`
                : 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))'),
        },
      } as Edge];
    }),
    [patch.connections, project.modules, project.moduleTypes, selectedEdgeId, voiceMap, expandedGroups, patchId],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Positions are fixed — only handle selection changes so the internal
    // ReactFlow Zustand store stays in sync with our selectedNodeId state.
    // Without this, the store can be reset to selected=false by the next
    // nodes-prop sync before our React state update has landed.
    for (const ch of changes) {
      if (ch.type === 'select') {
        if (ch.selected) {
          setSelectedNodeId(ch.id);
          setSelectedEdgeId(null);
        } else {
          setSelectedNodeId((prev) => prev === ch.id ? null : prev);
        }
      }
    }
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
    setSelectedNodeId(null);
  }, []);
  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
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
        {allGroups.length > 0 && (
          <div style={{
            position: 'absolute', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            fontSize: 11, color: '#e2e8f0', padding: 6,
          }}>
            <strong style={{ color: '#cbd5e1', fontSize: 11 }}>Voice groups:</strong>
            {allGroups.map((g) => {
              const isOpen = expandedGroups.has(g.id);
              return (
                <button key={g.id}
                        onClick={() => toggleExpand(g.id)}
                        title={isOpen ? 'Inklappen (alleen master tonen)' : 'Uitklappen (ghost voices tonen)'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', fontSize: 11,
                          background: isOpen ? '#1e293b' : '#0f172a',
                          color: '#e2e8f0',
                          border: `1px solid ${g.color || '#64748b'}`,
                          borderRadius: 10, cursor: 'pointer',
                        }}>
                  <span>{isOpen ? '▼' : '▶'}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: g.color || '#888' }} />
                  {g.label} <span style={{ color: '#94a3b8' }}>× {g.voiceCount}</span>
                </button>
              );
            })}
          </div>
        )}
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
          onNodeClick={onNodeClick}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <PropertiesPanel
          patchId={patchId}
          selectedNodeId={selectedNodeId}
        />
        {allGroups.length > 0 && (
          <PolyOverridesPanel patchId={patchId} allGroups={allGroups} />
        )}
        <Legend />
      </div>
    </div>
  );
}

function PropertiesPanel(props: { patchId: string; selectedNodeId: string | null }): JSX.Element {
  const { patchId, selectedNodeId } = props;
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId);
  const m = selectedNodeId ? project.modules.find((x) => x.id === selectedNodeId) : undefined;
  const t = m ? project.moduleTypes.find((tp) => tp.id === m.typeId) : undefined;

  function setControl(controlId: string, value: ControlValue): void {
    if (!m) return;
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

  if (!m || !t || !patch) {
    return (
      <aside style={{
        border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: 'white',
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', color: '#374151' }}>
          Properties
        </h3>
        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
          Klik een module aan om zijn controls hier te bewerken.
        </p>
      </aside>
    );
  }

  const cs = patch.controlState[m.id] ?? {};
  const ports = resolvePorts(m, project.moduleTypes);

  return (
    <aside style={{
      border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: 'white',
      maxHeight: 360, overflowY: 'auto',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 12, textTransform: 'uppercase', color: '#374151' }}>
        {m.name}
      </h3>
      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
        {t.variant} · {m.visual.hpWidth} HP
      </div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <tbody>
          {t.controls.map((ctrl) => {
            const v = cs[ctrl.id];
            const lbl = ctrl.label || ctrl.id;
            let editor: JSX.Element;
            if (ctrl.kind === 'knob' || ctrl.kind === 'slider') {
              const num = typeof v === 'number' ? v : ctrl.defaultValue;
              editor = (
                <input
                  type="number" value={num}
                  min={ctrl.min} max={ctrl.max}
                  step={(ctrl.max - ctrl.min) / 100}
                  onChange={(e) => setControl(ctrl.id, Number(e.target.value))}
                  style={{ width: 70 }}
                />
              );
            } else if (ctrl.kind === 'toggle') {
              editor = (
                <input
                  type="checkbox" checked={typeof v === 'boolean' ? v : ctrl.defaultValue}
                  onChange={(e) => setControl(ctrl.id, e.target.checked)}
                />
              );
            } else if (ctrl.kind === 'switch') {
              const idx = typeof v === 'number' ? v : ctrl.defaultIndex;
              editor = (
                <select
                  value={idx}
                  onChange={(e) => setControl(ctrl.id, Number(e.target.value))}
                >
                  {ctrl.positions.map((p, i) => (
                    <option key={i} value={i}>{p}</option>
                  ))}
                </select>
              );
            } else if (ctrl.kind === 'button') {
              editor = (
                <input
                  type="checkbox" checked={typeof v === 'boolean' ? v : (ctrl.defaultValue ?? false)}
                  onChange={(e) => setControl(ctrl.id, e.target.checked)}
                />
              );
            } else if (ctrl.kind === 'display' || ctrl.kind === 'led') {
              editor = <span style={{ color: '#6b7280' }}>(read-only)</span>;
            } else {
              editor = <span style={{ color: '#6b7280' }}>—</span>;
            }
            return (
              <tr key={ctrl.id}>
                <td style={{ padding: '2px 6px 2px 0', color: '#374151' }}>{lbl}</td>
                <td style={{ padding: '2px 0', textAlign: 'right' }}>{editor}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {ports.length > 0 && (
        <>
          <h4 style={{ fontSize: 10, textTransform: 'uppercase', color: '#6b7280', margin: '10px 0 4px' }}>
            Poorten
          </h4>
          <ul style={{ margin: 0, paddingLeft: 14, fontSize: 10, color: '#374151' }}>
            {ports.map((p) => (
              <li key={p.id}>
                <span style={{ color: SIGNAL_COLOUR[p.signalType] }}>●</span>{' '}
                {p.name} <em style={{ color: '#9ca3af' }}>({p.direction === 'in' ? 'in' : 'uit'} · {SIGNAL_LABEL[p.signalType]})</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

// ── A5: PatchPolyOverride panel ────────────────────────────────────────
//
// Lets a patch repartition a rack-level PolyGroup without touching the
// rack definition. The override's `partition` array describes how the
// group's N member-indices are split into one or more patch-local
// sub-groups. Empty array = ungroup completely (every cell becomes
// single). One entry covering all indices = no-op (= rack default).

function PolyOverridesPanel({ patchId, allGroups }: {
  patchId: string; allGroups: PolyGroup[];
}): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId);
  const overrides = patch?.polyOverrides ?? [];

  function update(fn: (overs: PatchPolyOverride[]) => PatchPolyOverride[]): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((px) => px.id !== patchId
        ? px : { ...px, polyOverrides: fn(px.polyOverrides ?? []) }),
    }));
  }
  function addOverride(gid: string): void {
    const g = allGroups.find((x) => x.id === gid);
    if (!g) return;
    update((overs) => [...overs, {
      rackPolyGroupId: gid,
      partition: [{
        label: g.label,
        voiceCount: g.voiceCount,
        memberIndices: g.members.map((_, i) => i),
      }],
    }]);
  }
  function removeOverride(gid: string): void {
    update((overs) => overs.filter((o) => o.rackPolyGroupId !== gid));
  }
  function setPartition(gid: string, partition: PatchPolyOverride['partition']): void {
    update((overs) => overs.map((o) => o.rackPolyGroupId !== gid ? o : ({ ...o, partition })));
  }
  function toggleUnison(gid: string): void {
    update((overs) => overs.map((o) => o.rackPolyGroupId !== gid ? o : ({ ...o, unison: !o.unison })));
  }

  const available = allGroups.filter((g) => !overrides.some((o) => o.rackPolyGroupId === g.id));

  return (
    <aside style={{
      border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: 'white',
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', color: '#374151' }}>
        Voice-overrides
      </h3>
      {overrides.length === 0 && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
          Patch gebruikt de rack-defaults. Voeg een override toe om een rack-group
          patch-lokaal anders op te delen (bijv. N=8 → 2× N=4 of ungroup naar 8× mono).
        </div>
      )}
      {overrides.map((o) => {
        const g = allGroups.find((x) => x.id === o.rackPolyGroupId);
        if (!g) {
          return (
            <div key={o.rackPolyGroupId} style={{ fontSize: 11, color: '#dc2626', marginBottom: 6 }}>
              Onbekende rack-group {o.rackPolyGroupId}
              <button onClick={() => removeOverride(o.rackPolyGroupId)} style={{ marginLeft: 6 }}>×</button>
            </div>
          );
        }
        return (
          <OverrideEditor key={o.rackPolyGroupId} group={g} override={o}
                          onChangePartition={(p) => setPartition(o.rackPolyGroupId, p)}
                          onToggleUnison={() => toggleUnison(o.rackPolyGroupId)}
                          onRemove={() => removeOverride(o.rackPolyGroupId)} />
        );
      })}
      {available.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <select defaultValue="" onChange={(e) => {
            const v = e.target.value;
            e.currentTarget.value = '';
            if (v) addOverride(v);
          }} style={{ fontSize: 11 }}>
            <option value="">+ Override toevoegen…</option>
            {available.map((g) => <option key={g.id} value={g.id}>{g.label} (N={g.voiceCount})</option>)}
          </select>
        </div>
      )}
    </aside>
  );
}

function OverrideEditor({ group, override, onChangePartition, onToggleUnison, onRemove }: {
  group: PolyGroup;
  override: PatchPolyOverride;
  onChangePartition: (p: PatchPolyOverride['partition']) => void;
  onToggleUnison: () => void;
  onRemove: () => void;
}): JSX.Element {
  const N = group.voiceCount;
  // For each member-index 0..N-1: which partition row does it belong to?
  // -1 means "ungrouped" (not in any sub-group). Initial mapping derives
  // from the override's partition array.
  const ownerOf = new Array<number>(N).fill(-1);
  override.partition.forEach((p, partIdx) => {
    for (const mi of p.memberIndices) if (mi >= 0 && mi < N) ownerOf[mi] = partIdx;
  });

  function setOwner(mi: number, partIdx: number): void {
    // Recompute partition from updated ownerOf.
    const owners = [...ownerOf];
    owners[mi] = partIdx;
    rebuildFrom(owners);
  }
  function rebuildFrom(owners: number[]): void {
    // Group cells by current ownership; preserve existing partition labels
    // where possible (matched by partIdx position).
    const buckets = new Map<number, number[]>();
    owners.forEach((own, mi) => {
      if (own < 0) return;
      const arr = buckets.get(own) ?? [];
      arr.push(mi);
      buckets.set(own, arr);
    });
    const newParts: PatchPolyOverride['partition'] = [];
    const sorted = [...buckets.entries()].sort(([a], [b]) => a - b);
    for (const [oldIdx, indices] of sorted) {
      const oldLabel = override.partition[oldIdx]?.label ?? `${group.label} ${newParts.length + 1}`;
      newParts.push({
        label: oldLabel,
        voiceCount: indices.length,
        memberIndices: indices,
      });
    }
    onChangePartition(newParts);
  }
  function addPartition(): void {
    // Create a new empty partition row; user assigns cells to it via the
    // per-cell dropdowns.
    onChangePartition([
      ...override.partition,
      { label: `${group.label} ${override.partition.length + 1}`, voiceCount: 0, memberIndices: [] },
    ]);
  }
  function renamePartition(idx: number, label: string): void {
    onChangePartition(override.partition.map((p, i) => i === idx ? { ...p, label } : p));
  }

  return (
    <div style={{
      border: `1px solid ${group.color || '#cbd2d9'}`, borderRadius: 4,
      padding: 6, marginBottom: 6, fontSize: 11, background: '#f9fafb',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 10, height: 10, borderRadius: 2, flexShrink: 0,
          background: group.color || '#888',
        }} />
        <strong style={{ flex: 1 }}>{group.label} · N={N}</strong>
        <label style={{ fontSize: 10, color: '#4b5563' }}>
          <input type="checkbox" checked={!!override.unison} onChange={onToggleUnison}
                 style={{ verticalAlign: 'middle', marginRight: 2 }} />
          unison
        </label>
        <button onClick={onRemove} style={{ fontSize: 10, color: '#b91c1c' }}>× Reset</button>
      </div>

      <div style={{ marginBottom: 4 }}>
        {override.partition.length === 0
          ? <span style={{ color: '#9ca3af' }}>Ungrouped (elk cell wordt mono).</span>
          : override.partition.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <input value={p.label}
                       onChange={(e) => renamePartition(i, e.target.value)}
                       style={{ fontSize: 11, flex: 1, minWidth: 0, padding: '1px 4px' }} />
                <span style={{ color: '#6b7280' }}>{p.voiceCount} v</span>
              </div>
          ))}
        <button onClick={addPartition} style={{ fontSize: 10, marginTop: 2 }}>+ sub-group</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {ownerOf.map((own, mi) => (
          <select key={mi} value={own} onChange={(e) => setOwner(mi, Number(e.target.value))}
                  title={`Cell ${mi + 1}`}
                  style={{
                    fontSize: 10, padding: '0 2px',
                    background: own >= 0 ? '#e5e7eb' : '#fff',
                  }}>
            <option value={-1}>{mi + 1}: —</option>
            {override.partition.map((p, pi) => (
              <option key={pi} value={pi}>{mi + 1}: {p.label}</option>
            ))}
          </select>
        ))}
      </div>

      {(() => {
        // Validation: each cell must belong to exactly one partition
        // (or none, but the "no partition" state is also a valid "ungroup
        // this cell" expression — only flag duplicates).
        const counts = new Map<number, number>();
        ownerOf.forEach((own) => { if (own >= 0) counts.set(own, (counts.get(own) ?? 0) + 1); });
        const cellsAssigned = ownerOf.filter((o) => o >= 0).length;
        if (cellsAssigned === 0 && override.partition.length > 0) {
          return <div style={{ color: '#b45309', marginTop: 4 }}>⚠ Geen cells toegewezen — override doet niets.</div>;
        }
        return null;
      })()}
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
