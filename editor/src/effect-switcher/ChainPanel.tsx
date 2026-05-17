import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnReconnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  addDevice,
  addEdge as addChainEdge,
  autoAssignRelays,
  moveDevice,
  removeDevice,
  removeEdge as removeChainEdge,
  setRelayCount,
  updateDevice,
} from './actions';
import { useProject } from './store';
import type { EffectDevice } from './types';

// ─── Custom node components ────────────────────────────────────────────────

type EndpointData = { label: string };

function EndpointNode({ data }: NodeProps): JSX.Element {
  const d = data as EndpointData;
  const isInput = d.label === 'IN';
  return (
    <div className="es-node-endpoint">
      {d.label}
      {isInput ? (
        <Handle type="source" position={Position.Right} />
      ) : (
        <Handle type="target" position={Position.Left} />
      )}
    </div>
  );
}

type DeviceNodeData = {
  device: EffectDevice;
  categoryLabel: string;
  onSelect: (id: string) => void;
};

function DeviceNode({ data, selected }: NodeProps): JSX.Element {
  const d = data as DeviceNodeData;
  const relayLabel = d.device.relayIndex < 0 ? 'R—' : `R${d.device.relayIndex + 1}`;
  return (
    <div
      className={`es-node${selected ? ' es-node-selected' : ''}`}
      onClick={() => d.onSelect(d.device.id)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="es-node-relay">{relayLabel}</div>
      {d.device.imageDataUrl
        ? <img src={d.device.imageDataUrl} alt={d.device.model} className="es-node-img" />
        : <div className="es-node-img-placeholder">🎛️</div>}
      <div className="es-node-brand">{d.device.brand}</div>
      <div className="es-node-model">{d.device.model}</div>
      <div className="es-node-meta">{d.categoryLabel}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  endpoint: EndpointNode,
  device:   DeviceNode,
};

// ─── Main editor ───────────────────────────────────────────────────────────

// ─── Auto image search via Wikipedia ─────────────────────────────────────
async function searchWikipediaImage(brand: string, model: string): Promise<string | null> {
  const query = `${brand} ${model}`;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const thumb = data['thumbnail'] as Record<string, string> | undefined;
    const imgUrl = thumb?.['source'];
    if (!imgUrl) return null;
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return null;
    const blob = await imgRes.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Main editor ───────────────────────────────────────────────────────────

function ChainPanelInner(): JSX.Element {
  const project = useProject();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const nodes: Node[] = useMemo(() => {
    const result: Node[] = [
      {
        id: 'input',
        type: 'endpoint',
        position: { x: -40, y: 200 },
        data: { label: 'IN' },
        draggable: false,
        selectable: false,
      },
      {
        id: 'output',
        type: 'endpoint',
        position: {
          x: Math.max(1200, 80 + project.devices.length * 220 + 80),
          y: 200,
        },
        data: { label: 'OUT' },
        draggable: false,
        selectable: false,
      },
    ];
    const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));
    for (const d of project.devices) {
      result.push({
        id: d.id,
        type: 'device',
        position: { x: d.x, y: d.y },
        data: {
          device: d,
          categoryLabel: catLabel.get(d.categoryId) ?? d.categoryId,
          onSelect,
        },
      });
    }
    return result;
  }, [project.devices, project.categories, onSelect]);

  const edges: Edge[] = useMemo(
    () => project.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      reconnectable: true,
      style: { stroke: '#374151', strokeWidth: 3 },
    })),
    [project.edges],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Apply locally to compute positions, persist on drag-stop
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && !ch.dragging) {
        moveDevice(ch.id, Math.round(ch.position.x), Math.round(ch.position.y));
      }
      if (ch.type === 'remove' && ch.id !== 'input' && ch.id !== 'output') {
        removeDevice(ch.id);
      }
    }
    // For visual smoothness during drag, applyNodeChanges is needed only when
    // React Flow controls node state. Since we recompute nodes every render
    // from project state, ignore intermediate non-final position changes.
    void applyNodeChanges;
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'remove') removeChainEdge(ch.id);
    }
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) addChainEdge(c.source, c.target);
  }, []);

  const onReconnect = useCallback<OnReconnect>((oldEdge, newConnection) => {
    removeChainEdge(oldEdge.id);
    if (newConnection.source && newConnection.target) {
      addChainEdge(newConnection.source, newConnection.target);
    }
  }, []);

  const selected = project.devices.find((d) => d.id === selectedId) ?? null;

  async function onAutoSearch(): Promise<void> {
    if (!selected) return;
    setSearching(true);
    const dataUrl = await searchWikipediaImage(selected.brand, selected.model);
    setSearching(false);
    if (dataUrl) {
      updateDevice(selected.id, { imageDataUrl: dataUrl });
    } else {
      window.open(
        `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${selected.brand} ${selected.model} guitar pedal`)}`,
        '_blank',
      );
    }
  }

  function onPasteUrl(): void {
    if (!selected || !pasteUrl.trim()) return;
    updateDevice(selected.id, { imageDataUrl: pasteUrl.trim() });
    setPasteUrl('');
  }

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : undefined;
      if (url) updateDevice(selected.id, { imageDataUrl: url });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <section>
      <div className="es-toolbar">
        <button className="primary" onClick={() => addDevice({})}>+ Effect</button>
        <button onClick={autoAssignRelays} title="Topologische volgorde → relais 1..n">
          Auto-assign relais
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Relais:
          <input
            type="number"
            min={1}
            max={32}
            value={project.relayCount}
            onChange={(e) => setRelayCount(parseInt(e.target.value, 10) || 16)}
            style={{ width: 60 }}
          />
        </label>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          Sleep tussen handles om signaalpad te tekenen. Klik op een node om te bewerken.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12 }}>
        <div className="es-chain">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            deleteKeyCode="Delete"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside style={{ border: '1px solid #cbd2d9', borderRadius: 6, padding: 12, background: 'white' }}>
          <h3 style={{ marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: '#6b7280' }}>
            Eigenschappen
          </h3>
          {!selected && (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Klik op een apparaat om eigenschappen te bewerken.
            </p>
          )}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Merk
                <input
                  type="text"
                  value={selected.brand}
                  onChange={(e) => updateDevice(selected.id, { brand: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Model
                <input
                  type="text"
                  value={selected.model}
                  onChange={(e) => updateDevice(selected.id, { model: e.target.value })}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Categorie
                <select
                  value={selected.categoryId}
                  onChange={(e) => updateDevice(selected.id, { categoryId: e.target.value })}
                  style={{ width: '100%' }}
                >
                  {project.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Relais (1..{project.relayCount}; 0 = niet toegekend)
                <input
                  type="number"
                  min={0}
                  max={project.relayCount}
                  value={selected.relayIndex < 0 ? 0 : selected.relayIndex + 1}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    updateDevice(selected.id, { relayIndex: v <= 0 ? -1 : v - 1 });
                  }}
                  style={{ width: '100%' }}
                />
              </label>
              <div style={{ fontSize: 12 }}>
                Plaatje:
                {selected.imageDataUrl && (
                  <img
                    src={selected.imageDataUrl}
                    alt=""
                    style={{ width: '100%', maxHeight: 120, objectFit: 'contain', display: 'block', margin: '4px 0', background: '#f5f7fa', borderRadius: 4 }}
                  />
                )}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  <button onClick={() => fileRef.current?.click()}>
                    {selected.imageDataUrl ? 'Vervangen' : 'Uploaden'}
                  </button>
                  <button
                    onClick={() => { void onAutoSearch(); }}
                    disabled={searching || !selected.brand || !selected.model}
                    title="Zoek plaatje op Wikipedia. Als niet gevonden, opent Google Afbeeldingen."
                  >
                    {searching ? 'Zoeken…' : '🔍 Auto-zoek'}
                  </button>
                  {selected.imageDataUrl && (
                    <button
                      className="danger"
                      onClick={() => updateDevice(selected.id, { imageDataUrl: undefined })}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <input
                    type="url"
                    placeholder="Plak afbeelding-URL…"
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                  />
                  <button onClick={onPasteUrl} disabled={!pasteUrl.trim()}>OK</button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={onImageChange}
                />
              </div>
              <button
                className="danger"
                onClick={() => { removeDevice(selected.id); setSelectedId(null); }}
              >
                Verwijder apparaat
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export function ChainPanel(): JSX.Element {
  return (
    <ReactFlowProvider>
      <ChainPanelInner />
    </ReactFlowProvider>
  );
}
