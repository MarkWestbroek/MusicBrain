// Patcher — Graph view. Modules are nodes; ports are coloured handles;
// cables are edges. All state lives in the same project store as the
// matrix view, so toggling between Graph/Matrix shows the same patch.

import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { updateProject, useModularProject } from './store';
import {
  type ModuleDef,
  type Port,
  type PatchConnection,
  canConnect,
  SIGNAL_COLOUR,
  SIGNAL_LABEL,
} from './types';
import { ParamWidget } from './ParamWidget';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Module node ─────────────────────────────────────────────────────────

interface ModuleNodeData { module: ModuleDef; }

function ModuleNode({ data, selected }: NodeProps): JSX.Element {
  const { module: m } = data as unknown as ModuleNodeData;
  const rowH = 18;
  const maxRows = Math.max(m.inputs.length, m.outputs.length, 1);
  const bodyH  = 24 + maxRows * rowH;
  const headerBg = m.visual?.color ?? kindColour(m.kind);

  return (
    <div style={{
      width: 160,
      minHeight: bodyH,
      background: '#ffffff',
      border: selected ? '2px solid #2563eb' : '1px solid #475569',
      borderRadius: 6,
      boxShadow: selected ? '0 0 0 3px rgba(37,99,235,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
      fontSize: 11,
      overflow: 'visible',
    }}>
      <div style={{
        background: headerBg, color: 'white',
        padding: '3px 8px', fontWeight: 600,
        borderTopLeftRadius: 4, borderTopRightRadius: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span>{m.label}</span>
        <span style={{ fontSize: 9, opacity: 0.8 }}>{m.kind}</span>
      </div>

      <div style={{ position: 'relative', padding: '4px 8px' }}>
        {/* Inputs (left column) */}
        {m.inputs.map((p, i) => (
          <PortRow key={`in.${p.id}`} port={p} side="in" rowY={i * rowH + 4} />
        ))}
        {/* Outputs (right column) */}
        {m.outputs.map((p, i) => (
          <PortRow key={`out.${p.id}`} port={p} side="out" rowY={i * rowH + 4} />
        ))}
      </div>
    </div>
  );
}

function PortRow({ port, side, rowY }: {
  port: Port; side: 'in' | 'out'; rowY: number;
}): JSX.Element {
  const colour = SIGNAL_COLOUR[port.signalType];
  return (
    <div style={{
      position: 'relative', height: 18, marginBottom: 0,
      display: 'flex',
      justifyContent: side === 'in' ? 'flex-start' : 'flex-end',
      alignItems: 'center',
    }}>
      <Handle
        type={side === 'in' ? 'target' : 'source'}
        position={side === 'in' ? Position.Left : Position.Right}
        id={port.id}
        style={{
          background: colour,
          width: 10, height: 10,
          border: '1.5px solid white',
          top: rowY + 10,
        }}
      />
      <span style={{
        color: colour, fontWeight: 600,
        marginLeft: side === 'in' ? 8 : 0,
        marginRight: side === 'out' ? 8 : 0,
      }}
        title={`${port.name} · ${SIGNAL_LABEL[port.signalType]}`}>
        {port.name}
      </span>
    </div>
  );
}

const nodeTypes: NodeTypes = { module: ModuleNode };

function kindColour(kind: ModuleDef['kind']): string {
  switch (kind) {
    case 'vco':       return '#0891b2';
    case 'vcf':       return '#0e7490';
    case 'vca':       return '#15803d';
    case 'envelope':  return '#7c3aed';
    case 'lfo':       return '#c026d3';
    case 'mixer':     return '#475569';
    case 'breakout':  return '#92400e';
    case 'midiRouter':return '#9333ea';
    case 'sequencer': return '#be123c';
    default:          return '#475569';
  }
}

// ─── Panel ───────────────────────────────────────────────────────────────

function PatcherGraphInner({ patchId }: { patchId: string }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId)!;
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const nodes: Node[] = useMemo(
    () => project.modules.map((m, i) => ({
      id: m.id,
      type: 'module',
      position: { x: m.x ?? 60 + (i % 4) * 200, y: m.y ?? 60 + Math.floor(i / 4) * 180 },
      data: { module: m },
    })),
    [project.modules],
  );

  const edges: Edge[] = useMemo(
    () => patch.connections.map((c) => {
      const srcMod = project.modules.find((m) => m.id === c.from.moduleId);
      const srcPort = srcMod?.outputs.find((p) => p.id === c.from.portId);
      const colour = srcPort ? SIGNAL_COLOUR[srcPort.signalType] : '#475569';
      return {
        id: c.id,
        source: c.from.moduleId,
        sourceHandle: c.from.portId,
        target: c.to.moduleId,
        targetHandle: c.to.portId,
        style: { stroke: colour, strokeWidth: 2 },
      } as Edge;
    }),
    [patch.connections, project.modules],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && !ch.dragging) {
        const id = ch.id;
        const { x, y } = ch.position;
        updateProject((p) => ({
          ...p,
          modules: p.modules.map((m) => (m.id === id ? { ...m, x: Math.round(x), y: Math.round(y) } : m)),
        }));
      }
      if (ch.type === 'select') {
        if (ch.selected) setSelectedModuleId(ch.id);
        else if (selectedModuleId === ch.id) setSelectedModuleId(null);
      }
    }
  }, [selectedModuleId]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'remove') {
        const eid = ch.id;
        updateProject((p) => ({
          ...p,
          patches: p.patches.map((px) => px.id !== patchId ? px
            : { ...px, connections: px.connections.filter((c) => c.id !== eid) }),
        }));
      }
    }
  }, [patchId]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
    const srcMod = project.modules.find((m) => m.id === c.source);
    const dstMod = project.modules.find((m) => m.id === c.target);
    const srcPort = srcMod?.outputs.find((p) => p.id === c.sourceHandle);
    const dstPort = dstMod?.inputs .find((p) => p.id === c.targetHandle);
    if (!srcPort || !dstPort) return;
    if (!canConnect(srcPort.signalType, dstPort.signalType)) {
      // Silent reject; could surface a toast in a later iteration.
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
  }, [project.modules, patchId]);

  const selectedModule = selectedModuleId
    ? project.modules.find((m) => m.id === selectedModuleId) ?? null
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>
      <div style={{
        height: 540, border: '1px solid #cbd2d9', borderRadius: 6, background: '#fafbfc',
        userSelect: 'none',
      }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode="Delete"
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <ModuleAside module={selectedModule} patchId={patchId} />
    </div>
  );
}

// ─── Properties side panel ───────────────────────────────────────────────

function ModuleAside({ module: m, patchId }: {
  module: ModuleDef | null; patchId: string;
}): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId)!;

  if (!m) {
    return (
      <aside style={asideStyle}>
        <h3 style={asideH3}>Module</h3>
        <p style={{ color: '#6b7280', fontSize: 12 }}>
          Klik een module in de graph om parameters te bewerken.
        </p>
        <Legend />
      </aside>
    );
  }

  const settings = patch.moduleSettings[m.id] ?? {};

  function setParam(paramId: string, value: number): void {
    const mod = m!;
    updateProject((proj) => ({
      ...proj,
      patches: proj.patches.map((px) => {
        if (px.id !== patchId) return px;
        const prev = px.moduleSettings[mod.id] ?? {};
        return {
          ...px,
          moduleSettings: { ...px.moduleSettings, [mod.id]: { ...prev, [paramId]: value } },
        };
      }),
    }));
  }

  return (
    <aside style={asideStyle}>
      <h3 style={asideH3}>{m.label}</h3>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
        {m.kind}{m.externallyControlled ? ' · extern bediend' : ''}
      </div>

      {m.params.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 12, fontStyle: 'italic' }}>
          Geen instelbare parameters.
        </p>
      )}

      {m.params.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          {m.params.map((p) => (
            <ParamWidget
              key={p.id}
              label={p.name}
              value={settings[p.id] ?? p.defaultValue}
              min={p.min} max={p.max} unit={p.unit}
              view={p.preferredView ?? 'knob'}
              onChange={(v) => setParam(p.id, v)}
            />
          ))}
        </div>
      )}

      <Legend />
    </aside>
  );
}

function Legend(): JSX.Element {
  return (
    <div style={{ marginTop: 12, fontSize: 11, color: '#475569' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Kabel-types</div>
      {(['cv', 'gate', 'trigger', 'audio', 'midi'] as const).map((t) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '18px' }}>
          <span style={{
            display: 'inline-block', width: 18, height: 3,
            background: SIGNAL_COLOUR[t], borderRadius: 1,
          }} />
          {SIGNAL_LABEL[t]}
        </div>
      ))}
    </div>
  );
}

const asideStyle: React.CSSProperties = {
  border: '1px solid #cbd2d9', borderRadius: 6, padding: 12, background: 'white',
};
const asideH3: React.CSSProperties = {
  marginTop: 0, marginBottom: 4, fontSize: 13,
  textTransform: 'uppercase', color: '#374151',
};

export function PatcherGraphPanel(props: { patchId: string }): JSX.Element {
  return (
    <ReactFlowProvider>
      <PatcherGraphInner {...props} />
    </ReactFlowProvider>
  );
}
