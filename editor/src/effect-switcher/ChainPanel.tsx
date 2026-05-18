import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
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
import { t } from '../i18n';
import type { EffectDevice } from './types';

// ─── Align-menu icons (inline SVG, mirror the Layout-panel look) ──────────
type AlignKind = 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right' | 'distH' | 'distV';

function AlignIcon({ kind }: { kind: AlignKind }): JSX.Element {
  // 16×16 grid; three little boxes get aligned along the indicated axis.
  // Stroke is the menu text colour so it picks up CSS hover/disabled later.
  const stroke = 'currentColor';
  const rect = (x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth="1" rx="0.5" />
  );
  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.2" />
  );
  switch (kind) {
    case 'top':    return (<svg width="16" height="16" viewBox="0 0 16 16">{line(1, 2, 15, 2)}{rect(3, 4, 4, 9)}{rect(9, 4, 4, 6)}</svg>);
    case 'middle': return (<svg width="16" height="16" viewBox="0 0 16 16">{line(1, 8, 15, 8)}{rect(3, 4, 4, 9)}{rect(9, 5, 4, 6)}</svg>);
    case 'bottom': return (<svg width="16" height="16" viewBox="0 0 16 16">{line(1, 14, 15, 14)}{rect(3, 3, 4, 10)}{rect(9, 7, 4, 6)}</svg>);
    case 'left':   return (<svg width="16" height="16" viewBox="0 0 16 16">{line(2, 1, 2, 15)}{rect(4, 3, 9, 4)}{rect(4, 9, 6, 4)}</svg>);
    case 'center': return (<svg width="16" height="16" viewBox="0 0 16 16">{line(8, 1, 8, 15)}{rect(4, 3, 9, 4)}{rect(5, 9, 6, 4)}</svg>);
    case 'right':  return (<svg width="16" height="16" viewBox="0 0 16 16">{line(14, 1, 14, 15)}{rect(3, 3, 10, 4)}{rect(7, 9, 6, 4)}</svg>);
    case 'distH':  return (<svg width="16" height="16" viewBox="0 0 16 16">{rect(1, 5, 3, 6)}{rect(6.5, 5, 3, 6)}{rect(12, 5, 3, 6)}{line(0.5, 14.5, 15.5, 14.5)}</svg>);
    case 'distV':  return (<svg width="16" height="16" viewBox="0 0 16 16">{rect(5, 1, 6, 3)}{rect(5, 6.5, 6, 3)}{rect(5, 12, 6, 3)}{line(14.5, 0.5, 14.5, 15.5)}</svg>);
  }
}

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

// ─── Auto image search ─────────────────────────────────────────────────────
// Source order: 1. allthepedals.com  2. effectsdatabase.com  3. Wikipedia
//
// Strategy: use <img> element probes instead of fetch() for sources 1 & 2 —
// this sidesteps CORS entirely. Images are stored as remote URLs (not data URLs)
// so no blob reading is needed.

// Helper: blob → data URL (used for Wikipedia only)
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// Helper: probe a URL via <img> — works without CORS, returns natural dimensions
function probeImageUrl(url: string): Promise<{ ok: boolean; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve({ ok: false, w: 0, h: 0 }), 8000);
    img.onload = () => { clearTimeout(timer); resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(timer); resolve({ ok: false, w: 0, h: 0 }); };
    img.src = url;
  });
}

// Sentinel URL — definitely does not exist on allthepedals.com.
// Used to detect CDN placeholder behaviour: if the real slug returns the same
// dimensions as this sentinel, the site is serving a default "no image" graphic.
const ATP_SENTINEL = 'https://allthepedals.com/assets/pedals/zzz-does-not-exist-sentinel-check.webp';

// 1. All The Pedals — probe slug via <img>; compare to sentinel to reject placeholders
async function searchAllThePedalsImage(brand: string, model: string): Promise<string | null> {
  const slug = `${brand} ${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const url = `https://allthepedals.com/assets/pedals/${slug}.webp`;
  const [target, sentinel] = await Promise.all([probeImageUrl(url), probeImageUrl(ATP_SENTINEL)]);
  if (!target.ok) return null;
  if (target.w < 50 || target.h < 50) return null;  // too tiny → reject
  // Same dimensions as the sentinel → allthepedals.com is serving its default placeholder → reject
  if (sentinel.ok && target.w === sentinel.w && target.h === sentinel.h) return null;
  return url;  // store URL directly — <img src> works without CORS
}

// 2. Effects Database — probe files.effectsdatabase.com directly via <img>
//    The /find/name/ search endpoint blocks cross-origin fetch(); probing the
//    CDN image files directly avoids that entirely.
//    Image URL pattern: files.effectsdatabase.com/gear/pics/{brand-slug}_{model-slug}_001.jpg
async function searchEffectsDbImage(brand: string, model: string): Promise<string | null> {
  const b = brand.toLowerCase().replace(/[^a-z0-9]/g, '');  // e.g. "boss", "joyo"
  const m = model
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');  // e.g. "ds-1", "jf-33", "phase-90"
  const mNoDash = m.replace(/-/g, '');  // e.g. "ds1", "jf33"

  const base = 'https://files.effectsdatabase.com/gear/pics/';
  const candidates: string[] = [
    `${base}${b}_${m}_001.jpg`,
    ...(mNoDash !== m ? [`${base}${b}_${mNoDash}_001.jpg`] : []),
  ];

  // Joyo organises pedals into named series; the series slug becomes part of the
  // brand prefix in the image filename (e.g. "joyo-2012_jf-33_001.jpg").
  if (b === 'joyo') {
    const numStr = m.replace(/^[a-z]+-?/, '');   // "33" from "jf-33"
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      if (num >= 1  && num <= 29) candidates.push(`${base}joyo-classic_${m}_001.jpg`, `${base}joyo-classic_${mNoDash}_001.jpg`);
      if (num >= 30 && num <= 39) candidates.push(`${base}joyo-2012_${m}_001.jpg`,    `${base}joyo-2012_${mNoDash}_001.jpg`);
      if (num >= 40 && num <= 59) candidates.push(`${base}joyo_${m}_001.jpg`);  // already first candidate
    }
    if (m.startsWith('r-') || /^r\d/.test(m)) candidates.push(`${base}joyo-rseries_${m}_001.jpg`);
    if (m.startsWith('jf3') && num >= 300)   candidates.push(`${base}joyo-ironman_${m}_001.jpg`);
  }

  const results = await Promise.all(candidates.map(probeImageUrl));
  for (let i = 0; i < candidates.length; i++) {
    const r = results[i]!;
    if (r.ok && r.w >= 50 && r.h >= 50) return candidates[i] ?? null;
  }
  return null;
}

// 3. Wikipedia — REST summary thumbnail
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
    return blobToDataUrl(await imgRes.blob());
  } catch {
    return null;
  }
}

// ─── Main editor ───────────────────────────────────────────────────────────

function ChainPanelInner(): JSX.Element {
  const project = useProject();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [epPos, setEpPos] = useState<{
    input: { x: number; y: number };
    output: { x: number; y: number };
  }>(() => ({
    input:  { x: -40, y: 200 },
    output: { x: Math.max(1200, 80 + 3 * 220 + 80), y: 200 },
  }));
  const [searching, setSearching] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const nodes: Node[] = useMemo(() => {
    const result: Node[] = [
      {
        id: 'input',
        type: 'endpoint',
        position: epPos.input,
        data: { label: 'IN' },
      },
      {
        id: 'output',
        type: 'endpoint',
        position: epPos.output,
        data: { label: 'OUT' },
      },
    ];
    const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));
    for (const d of project.devices) {
      result.push({
        id: d.id,
        type: 'device',
        position: { x: d.x, y: d.y },
        // Note: `selected` is intentionally NOT set here. ReactFlow tracks
        // selection internally and passes it to DeviceNode via NodeProps.
        // Mirroring it caused a feedback loop that rebuilt every node on
        // every click → noticeable lag and selection jitter.
        data: {
          device: d,
          categoryLabel: catLabel.get(d.categoryId) ?? d.categoryId,
          onSelect,
        },
      });
    }
    return result;
  }, [project.devices, project.categories, onSelect, epPos]);

  const edges: Edge[] = useMemo(
    () => project.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      selected: selectedEdgeIds.has(e.id),
      reconnectable: true,
      markerEnd: {
        type: MarkerType.ArrowClosed, width: 12, height: 12,
        color: selectedEdgeIds.has(e.id) ? '#2563eb' : '#374151',
      },
      style: {
        stroke: selectedEdgeIds.has(e.id) ? '#2563eb' : '#374151',
        strokeWidth: selectedEdgeIds.has(e.id) ? 3 : 1.5,
      },
    })),
    [project.edges, selectedEdgeIds],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        if (ch.id === 'input' || ch.id === 'output') {
          if (!ch.dragging) {
            const key = ch.id as 'input' | 'output';
            setEpPos((prev) => ({ ...prev, [key]: ch.position! }));
          }
        } else if (!ch.dragging) {
          moveDevice(ch.id, Math.round(ch.position.x), Math.round(ch.position.y));
        }
      }
      if (ch.type === 'remove' && ch.id !== 'input' && ch.id !== 'output') {
        removeDevice(ch.id);
      }
      if (ch.type === 'select') {
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (ch.selected) { next.add(ch.id); setSelectedId(ch.id); }
          else next.delete(ch.id);
          return next;
        });
      }
    }
    void applyNodeChanges;
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === 'remove') removeChainEdge(ch.id);
      if (ch.type === 'select') {
        setSelectedEdgeIds((prev) => {
          const next = new Set(prev);
          if (ch.selected) next.add(ch.id); else next.delete(ch.id);
          return next;
        });
      }
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

  // ─── Alignment context menu ─────────────────────────────────────────────

  const selectedDeviceIds = useMemo(
    () => [...selectedNodeIds].filter((id) => id !== 'input' && id !== 'output'),
    [selectedNodeIds],
  );

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  function handleContextMenu(e: React.MouseEvent): void {
    if (selectedDeviceIds.length < 2) { setContextMenu(null); return; }
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function alignNodes(axis: 'x' | 'y', method: 'min' | 'max' | 'avg'): void {
    const positions = selectedDeviceIds.map((id) => {
      const d = project.devices.find((dev) => dev.id === id)!;
      return { id, x: d.x, y: d.y };
    });
    const vals = positions.map((p) => p[axis]);
    const target = method === 'min' ? Math.min(...vals)
      : method === 'max' ? Math.max(...vals)
      : Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    for (const p of positions) {
      moveDevice(p.id, axis === 'x' ? target : p.x, axis === 'y' ? target : p.y);
    }
    setContextMenu(null);
  }

  function distributeNodes(axis: 'x' | 'y'): void {
    if (selectedDeviceIds.length < 3) return;
    const positions = selectedDeviceIds
      .map((id) => { const d = project.devices.find((dev) => dev.id === id)!; return { id, x: d.x, y: d.y }; })
      .sort((a, b) => a[axis] - b[axis]);
    const first = positions[0]![axis];
    const last = positions[positions.length - 1]![axis];
    const step = (last - first) / (positions.length - 1);
    positions.forEach((p, i) => {
      const val = Math.round(first + i * step);
      moveDevice(p.id, axis === 'x' ? val : p.x, axis === 'y' ? val : p.y);
    });
    setContextMenu(null);
  }

  const selected = project.devices.find((d) => d.id === selectedId) ?? null;

  async function onAutoSearch(): Promise<void> {
    if (!selected) return;
    setSearching(true);
    let dataUrl: string | null = await searchAllThePedalsImage(selected.brand, selected.model);
    if (!dataUrl) dataUrl = await searchEffectsDbImage(selected.brand, selected.model);
    if (!dataUrl) dataUrl = await searchWikipediaImage(selected.brand, selected.model);
    setSearching(false);
    if (dataUrl) {
      updateDevice(selected.id, { imageDataUrl: dataUrl });
    } else {
      window.open(
        `https://allthepedals.com/search/?q=${encodeURIComponent(`${selected.brand} ${selected.model}`)}`,
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
    <section className="es-chain-section" onContextMenu={handleContextMenu} onClick={() => setContextMenu(null)}>
      {/* Context menu overlay — click outside to close */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
      )}
      {contextMenu && selectedDeviceIds.length >= 2 && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            zIndex: 1000, background: 'white', border: '1px solid #d1d5db',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 210, padding: '6px 0', fontSize: 14,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 14px 8px', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #f3f4f6', letterSpacing: '0.04em' }}>
            {t('align.title', { n: selectedDeviceIds.length })}
          </div>
          {([
            { icon: <AlignIcon kind="top"    />, label: t('align.top'),    fn: () => alignNodes('y', 'min') },
            { icon: <AlignIcon kind="middle" />, label: t('align.middle'), fn: () => alignNodes('y', 'avg') },
            { icon: <AlignIcon kind="bottom" />, label: t('align.bottom'), fn: () => alignNodes('y', 'max') },
            null,
            { icon: <AlignIcon kind="left"   />, label: t('align.left'),   fn: () => alignNodes('x', 'min') },
            { icon: <AlignIcon kind="center" />, label: t('align.center'), fn: () => alignNodes('x', 'avg') },
            { icon: <AlignIcon kind="right"  />, label: t('align.right'),  fn: () => alignNodes('x', 'max') },
            null,
            { icon: <AlignIcon kind="distH"  />, label: t('align.distH'),  fn: () => distributeNodes('x') },
            { icon: <AlignIcon kind="distV"  />, label: t('align.distV'),  fn: () => distributeNodes('y') },
          ] as const).map((item, i) =>
            item === null
              ? <hr key={i} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #f3f4f6' }} />
              : <button
                  key={item.label}
                  onClick={item.fn}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1f2937' }}
                  onMouseEnter={(e) => { (e.currentTarget).style.background = '#eff6ff'; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = 'none'; }}
                ><span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>{item.icon}</span>{item.label}</button>
          )}
        </div>
      )}
      <div className="es-toolbar">
        <button className="primary" onClick={() => addDevice({})}>{t('chain.addEffect')}</button>
        <button onClick={autoAssignRelays} title="Topological order → relay 1..n">
          {t('chain.autoAssign')}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {t('chain.relays')}
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
          {t('chain.hint')}
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
            Properties
          </h3>
          {!selected && (
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Click a device to edit its properties.
            </p>
          )}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Brand
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
                Category
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
                Relay (1..{project.relayCount}; 0 = unassigned)
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
                    {selected.imageDataUrl ? 'Replace' : 'Upload'}
                  </button>
                  <button
                    onClick={() => { void onAutoSearch(); }}
                    disabled={searching || !selected.brand || !selected.model}
                    title="Auto-search: All The Pedals → Effects Database → Wikipedia. Falls back to allthepedals.com search."
                  >
                    {searching ? 'Searching…' : '🔍 Auto-search'}
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
                    placeholder="Paste image URL…"
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
                onClick={() => { removeDevice(selected.id); setSelectedId(null); setSelectedNodeIds(new Set()); }}
              >
                Delete device
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
