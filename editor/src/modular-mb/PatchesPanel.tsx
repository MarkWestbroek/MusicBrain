// Patches tab — list/CRUD of Patches. Each patch is bound to one Rack
// and carries per-(module, control) state. Editing the cables happens
// in the Patcher tab.
//
// ED-RC-8: de lijst is een compacte tabel met mappen (vrije tekst per patch,
// automatisch te vullen op familie: VCO, Wavetable, Physical modelling, …),
// groeperen (map / familie / stemmen / rack) en sorteren (naam, stemmen,
// kabels, rack, familie, prog#). De rack-kolom toont alleen de racks die de
// patch gebruikt, met een klein menu om er een bij te doen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { canRedo, canUndo, redo, undo, updateProject, useModularProject, uid } from './store';
import type { Patch } from './types';
import { OptimizeModal } from './recipe/OptimizeModal';
import {
  autoFolders, classifyPatch, comparePatches, groupKey, type GroupBy, type SortBy,
} from './recipe/classify';

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'folder', label: 'Map' }, { id: 'family', label: 'Familie' }, { id: 'voices', label: 'Stemmen' },
  { id: 'rack', label: 'Rack' }, { id: 'none', label: 'Geen' },
];
const SORTS: { id: SortBy; label: string }[] = [
  { id: 'name', label: 'Naam' }, { id: 'voices', label: 'Stemmen' }, { id: 'cables', label: 'Kabels' },
  { id: 'rack', label: 'Rack' }, { id: 'family', label: 'Familie' }, { id: 'program', label: 'Prog#' },
];

export function PatchesPanel(): JSX.Element {
  const project = useModularProject();
  const [showOptimize, setShowOptimize] = useState(false);   // ED-RC-7
  const [groupBy, setGroupBy] = useState<GroupBy>('folder');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [dir, setDir] = useState<1 | -1>(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  // Slepen tussen mappen (alleen bij groeperen op map): de rij pak je aan de
  // greep, je laat hem los op een groepskop, een rij in die groep, of op
  // "nieuwe map". Het losse map-veld verdwijnt dan: dat was dubbel.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const byFolder = groupBy === 'folder';

  function moveToFolder(id: string, key: string | null): void {
    const folder = key === null || key === '(geen map)' ? undefined : key;
    patch(id, (p) => ({ ...p, folder }));
  }
  function dropOn(key: string | null): void {
    if (!dragId) return;
    if (key === '__new__') {
      const name = window.prompt('Naam van de nieuwe map:', '');
      if (name && name.trim()) moveToFolder(dragId, name.trim());
    } else {
      moveToFolder(dragId, key);
    }
    setDragId(null); setDropKey(null);
  }
  function renameFolder(key: string): void {
    if (key === '(geen map)') return;
    const name = window.prompt('Map hernoemen:', key);
    if (name === null) return;
    const folder = name.trim() || undefined;
    updateProject((p) => ({ ...p, patches: p.patches.map((x) => (x.folder?.trim() === key ? { ...x, folder } : x)) }), { forceCommit: true });
  }

  function addPatch(): void {
    const physical = project.racks.find((r) => r.id === project.activeRackId)
      ?? project.racks.find((r) => r.kind !== 'internal')
      ?? project.racks[0];
    if (!physical) {
      alert('Maak eerst een rack aan (Rack-tab).');
      return;
    }
    // Alleen het gekozen rack. Het interne rack is de modulecatalogus; zet je
    // die erbij, dan staat de hele voorraad in de patcher. Wie hem tóch wil,
    // vinkt hem hieronder aan.
    const rackIds = [physical.id];
    const patch: Patch = {
      id: uid('patch'),
      name: `Patch ${project.patches.length + 1}`,
      voiceCount: 8,
      rackIds,
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

  /** Dupliceer een bestaande patch naar een nieuwe naam. De kopie krijgt
   *  een vers id en wordt direct de actieve patch. Het programmanummer
   *  wordt NIET overgenomen (zou botsen met het origineel). */
  function duplicatePatch(id: string): void {
    const src = project.patches.find((x) => x.id === id);
    if (!src) return;
    const suggested = `${src.name} (kopie)`;
    const name = window.prompt('Naam voor de gekopieerde patch:', suggested);
    if (name === null) return;
    const copy: Patch = {
      ...(JSON.parse(JSON.stringify(src)) as Patch),
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

  function patch(id: string, fn: (p: Patch) => Patch): void {
    updateProject((p) => ({
      ...p,
      patches: p.patches.map((x) => x.id === id ? fn(x) : x),
    }));
  }

  function setActive(id: string): void {
    updateProject((p) => ({ ...p, activePatchId: id }));
  }

  // ── indeling ──────────────────────────────────────────────────────────
  // De sorteervolgorde gebruikt de namen zoals ze waren toen je begon te
  // typen: een rij verspringt dus niet halverwege een naamwijziging (en je
  // typt niet per ongeluk verder in de patch die eronder schoof). Bij het
  // verlaten van het naamveld (blur/Enter) sorteert de lijst opnieuw.
  const frozenNames = useRef(new Map<string, string>());
  const [sortTick, setSortTick] = useState(0);
  useEffect(() => {
    const m = frozenNames.current;
    const ids = new Set(project.patches.map((x) => x.id));
    for (const id of [...m.keys()]) if (!ids.has(id)) m.delete(id);
    for (const x of project.patches) if (!m.has(x.id)) m.set(x.id, x.name);
  }, [project.patches]);
  const resort = (): void => { frozenNames.current = new Map(project.patches.map((x) => [x.id, x.name])); setSortTick((t) => t + 1); };

  const folders = useMemo(() => [...new Set(project.patches.map((x) => x.folder?.trim()).filter((f): f is string => !!f))].sort(), [project.patches]);
  const classes = useMemo(() => new Map(project.patches.map((x) => [x.id, classifyPatch(project, x)])), [project]);
  const groups = useMemo(() => {
    void sortTick;
    const q = filter.trim().toLowerCase();
    const visible = project.patches.filter((x) => !q || x.name.toLowerCase().includes(q)
      || (x.folder ?? '').toLowerCase().includes(q) || classes.get(x.id)!.family.toLowerCase().includes(q));
    const byId = new Map(visible.map((x) => [x.id, x]));
    const sorted = visible
      .map((x) => ({ ...x, name: frozenNames.current.get(x.id) ?? x.name }))
      .sort(comparePatches(project, sortBy, dir))
      .map((x) => byId.get(x.id)!);
    const map = new Map<string, Patch[]>();
    for (const x of sorted) { const k = groupKey(project, x, groupBy); if (!map.has(k)) map.set(k, []); map.get(k)!.push(x); }
    const keys = [...map.keys()].sort((a, b) => {
      if (groupBy === 'voices') return (map.get(a)![0]!.voiceCount) - (map.get(b)![0]!.voiceCount);
      if (a.startsWith('(')) return 1; if (b.startsWith('(')) return -1;
      return a.localeCompare(b, 'nl');
    });
    return keys.map((k) => ({ key: k, patches: map.get(k)! }));
  }, [project, classes, groupBy, sortBy, dir, filter, sortTick]);

  const toggleGroup = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const th = (id: SortBy, label: string, title?: string) => (
    <th style={{ padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }} title={title ?? `Sorteer op ${label.toLowerCase()}`}
        onClick={() => { if (sortBy === id) setDir((d) => (d === 1 ? -1 : 1)); else { setSortBy(id); setDir(1); } }}>
      {label}{sortBy === id ? (dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const chip: React.CSSProperties = {
    fontSize: 11, display: 'inline-flex', gap: 3, alignItems: 'center', padding: '1px 6px', borderRadius: 10, color: 'white',
  };

  return (
    <div>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={addPatch} className="primary" style={{ fontSize: 13 }}>+ Patch</button>
        <button onClick={() => setShowOptimize(true)} style={{ fontSize: 13 }}
          title="Ruim op en voeg (bijna) identieke racks samen — je ziet eerst een rapport"
          data-tour="optimize-button">🧹 Optimaliseer racks…</button>
        <button onClick={() => updateProject((p) => autoFolders(p), { forceCommit: true })} style={{ fontSize: 13 }}
          title="Zet patches zonder map in de map van hun familie: VCO, Wavetable, FM, Physical modelling, Sampling, Drums, …">
          📁 Mappen automatisch
        </button>
        <OptimizeModal open={showOptimize} onClose={() => setShowOptimize(false)} />
        <button onClick={() => undo()} disabled={!canUndo()} style={{ fontSize: 13 }} title="Ongedaan maken (Ctrl+Z buiten een tekstveld)">↶</button>
        <button onClick={() => redo()} disabled={!canRedo()} style={{ fontSize: 13 }} title="Opnieuw (Ctrl+Y)">↷</button>
        <span style={{ flex: 1 }} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="zoek naam / map / familie"
               style={{ fontSize: 12, padding: '3px 6px', width: 180 }} />
        <label style={{ fontSize: 12, color: '#475569' }}>Groepeer:{' '}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} style={{ fontSize: 12 }}>
            {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#475569' }}>Sorteer:{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={{ fontSize: 12 }}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={() => setDir((d) => (d === 1 ? -1 : 1))} style={{ fontSize: 11, marginLeft: 4 }} title="Oplopend / aflopend">{dir === 1 ? '▲' : '▼'}</button>
        </label>
        <span style={{ fontSize: 12, color: '#64748b' }}>{project.patches.length} patches · {project.racks.filter((r) => r.kind !== 'internal').length} racks</span>
      </div>

      {project.patches.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Nog geen patches. Maak er een aan, of typ er een in ⌘ Recept (Ctrl+K).
        </p>
      )}

      <datalist id="mmb-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '4px 8px' }} title="Actieve patch">●</th>
            {th('name', 'Naam')}
            {!byFolder && <th style={{ padding: '4px 8px' }}>Map</th>}
            {th('family', 'Familie', 'Klankbron: VCO, Wavetable, FM, Physical modelling, Sampling, Drums …')}
            {th('voices', 'Stemmen')}
            {th('rack', 'Rack')}
            {th('cables', 'Kabels')}
            <th style={{ padding: '4px 8px' }} title="Bus-effecten aan een kabel">FX</th>
            {th('program', 'Prog#', 'MIDI Program Change-nummer (0–127)')}
            <th />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key || '_'} label={g.key} count={g.patches.length} collapsed={collapsed.has(g.key)} onToggle={() => toggleGroup(g.key)} show={groupBy !== 'none'}
                       highlight={byFolder && dragId !== null && dropKey === g.key}
                       onDragOver={byFolder && dragId ? () => setDropKey(g.key) : undefined}
                       onDrop={byFolder ? () => dropOn(g.key) : undefined}
                       onRename={byFolder && g.key !== '(geen map)' ? () => renameFolder(g.key) : undefined}>
              {g.patches.map((x) => {
                const cls = classes.get(x.id)!;
                const usedRacks = project.racks.filter((r) => x.rackIds.includes(r.id));
                const otherRacks = project.racks.filter((r) => !x.rackIds.includes(r.id));
                return (
                  <tr key={x.id}
                      onDragOver={byFolder && dragId ? (e) => { e.preventDefault(); setDropKey(g.key); } : undefined}
                      onDrop={byFolder ? (e) => { e.preventDefault(); dropOn(g.key); } : undefined}
                      style={{ borderBottom: '1px solid #f3f4f6', opacity: dragId === x.id ? 0.4 : 1,
                               background: project.activePatchId === x.id ? 'var(--mb-accent-tint)' : undefined }}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      {byFolder && (
                        <span draggable
                              onDragStart={(e) => { setDragId(x.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); }}
                              onDragEnd={() => { setDragId(null); setDropKey(null); }}
                              title="Sleep naar een andere map"
                              style={{ cursor: 'grab', color: '#94a3b8', marginRight: 6, userSelect: 'none' }}>⋮⋮</span>
                      )}
                      <input type="radio" name="activePatch" checked={project.activePatchId === x.id} onChange={() => setActive(x.id)} />
                    </td>
                    <td style={{ padding: '4px 8px', minWidth: 180 }}>
                      <input type="text" value={x.name}
                        onChange={(e) => patch(x.id, (p) => ({ ...p, name: e.target.value }))}
                        onBlur={resort}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        title="Naam — de lijst sorteert pas opnieuw als je het veld verlaat"
                        style={{ width: '100%', fontSize: 13 }} />
                    </td>
                    {!byFolder && (
                      <td style={{ padding: '4px 8px' }}>
                        <input type="text" list="mmb-folders" value={x.folder ?? ''} placeholder="—"
                          onChange={(e) => patch(x.id, (p) => ({ ...p, folder: e.target.value || undefined }))}
                          title="Map (vrije tekst; bestaande mappen verschijnen als suggestie)"
                          style={{ width: 130, fontSize: 12 }} />
                      </td>
                    )}
                    <td style={{ padding: '4px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{cls.family}</td>
                    <td style={{ padding: '4px 8px', color: '#475569' }}>
                      <input type="number" min={1} max={64} value={x.voiceCount}
                        onChange={(e) => patch(x.id, (p) => ({ ...p, voiceCount: Math.max(1, Math.min(64, Number(e.target.value) || 1)) }))}
                        style={{ width: 48, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {usedRacks.map((r) => (
                          <span key={r.id} style={{ ...chip, background: r.kind === 'internal' ? '#1d4ed8' : '#475569' }} title={`${r.slots.length} modules`}>
                            {r.name}{r.kind === 'internal' ? ' 🧠' : ''}
                            <button onClick={() => patch(x.id, (p) => ({ ...p, rackIds: p.rackIds.filter((id) => id !== r.id) }))}
                                    title="Rack loskoppelen van deze patch"
                                    style={{ border: 'none', background: 'transparent', color: 'white', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                        {otherRacks.length > 0 && (
                          <select value="" onChange={(e) => { const id = e.target.value; if (id) patch(x.id, (p) => ({ ...p, rackIds: [...p.rackIds, id] })); }}
                                  title="Rack toevoegen aan deze patch" style={{ fontSize: 11, width: 22 }}>
                            <option value="">+</option>
                            {otherRacks.map((r) => <option key={r.id} value={r.id}>{r.name}{r.kind === 'internal' ? ' 🧠' : ''}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '4px 8px', color: '#475569' }}>{x.connections.length}</td>
                    <td style={{ padding: '4px 8px', color: '#475569', fontSize: 12 }}>{cls.fx.join(', ')}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <input type="number" min={0} max={127} value={x.programNumber ?? ''} placeholder="—"
                        title="MIDI Program Change 0–127 (leeg = niet gekoppeld)"
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          patch(x.id, (p) => ({ ...p, programNumber: raw === '' ? undefined : Math.max(0, Math.min(127, Number(raw) || 0)) }));
                        }}
                        style={{ width: 52, fontSize: 13 }} />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => duplicatePatch(x.id)} style={{ fontSize: 11, marginRight: 4 }} title="Kopieer deze patch naar een nieuwe naam">⧉</button>
                      <button onClick={() => removePatch(x.id)} style={{ fontSize: 11 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </GroupRows>
          ))}
        </tbody>
      </table>

      {byFolder && project.patches.length > 0 && (
        <div onDragOver={dragId ? (e) => { e.preventDefault(); setDropKey('__new__'); } : undefined}
             onDrop={(e) => { e.preventDefault(); dropOn('__new__'); }}
             style={{ marginTop: 8, padding: '8px 12px', border: `2px dashed ${dropKey === '__new__' ? 'var(--mb-accent)' : '#cbd2d9'}`,
                      borderRadius: 6, color: '#64748b', fontSize: 12,
                      background: dropKey === '__new__' ? 'var(--mb-accent-tint)' : 'transparent' }}>
          {dragId ? '📁 Laat hier los voor een nieuwe map…' : 'Sleep een patch aan ⋮⋮ naar een map, of hierheen voor een nieuwe map. Dubbelklik op een mapkop om te hernoemen.'}
        </div>
      )}
    </div>
  );
}

/** Groepskop (inklapbaar, dropzone bij slepen, dubbelklik = hernoemen) + de rijen eronder. */
function GroupRows(props: {
  label: string; count: number; collapsed: boolean; onToggle: () => void; show: boolean; children: React.ReactNode;
  highlight?: boolean; onDragOver?: () => void; onDrop?: () => void; onRename?: () => void;
}): JSX.Element {
  const { label, count, collapsed, onToggle, show, children, highlight, onDragOver, onDrop, onRename } = props;
  return (
    <>
      {show && (
        <tr style={{ background: highlight ? 'var(--mb-accent-tint)' : '#f8fafc', cursor: 'pointer',
                     outline: highlight ? '2px dashed var(--mb-accent)' : undefined }}
            onClick={onToggle}
            onDoubleClick={onRename ? (e) => { e.stopPropagation(); onRename(); } : undefined}
            onDragOver={onDragOver ? (e) => { e.preventDefault(); onDragOver(); } : undefined}
            onDrop={onDrop ? (e) => { e.preventDefault(); onDrop(); } : undefined}
            title={onRename ? 'Klik: in-/uitklappen · dubbelklik: hernoemen · sleep patches hierheen' : undefined}>
          <td colSpan={10} style={{ padding: '5px 8px', fontWeight: 600, color: '#0f172a', borderTop: '1px solid #e5e7eb' }}>
            <span style={{ display: 'inline-block', width: 14, color: '#64748b' }}>{collapsed ? '▶' : '▼'}</span>
            {onRename ? '📁 ' : ''}{label} <span style={{ color: '#64748b', fontWeight: 400 }}>({count})</span>
          </td>
        </tr>
      )}
      {!collapsed && children}
    </>
  );
}
