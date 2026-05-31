// Rack tab — manage racks (3U Eurorack rows × HP). Place modules into
// rows at HP offsets; show the rack as a horizontal strip per row with
// the actual SVG panels rendered inside.
//
// Conflicts (overlap, off-row) are detected and surfaced as red borders.

import { useEffect, useRef, useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { compactRack as compactRackLayout } from './rackLayout';
import { useEngineStatus } from './sim/engineSingleton';
import {
  type Rack, type RackSlot, type ModuleInstance, type ModuleType,
  type PolyGroup, type PolyGroupMember, type Port, type Control,
  resolvePorts, resolveControls, SIGNAL_LABEL, CV_FORMAT_LABEL,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';

const PX_PER_MM = 2.2;

// Floating zoom-overlay button style (mirrors the patcher's ReactFlow Controls).
const zoomBtn: React.CSSProperties = {
  width: 26, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', color: '#e2e8f0', border: 'none',
  fontSize: 14, cursor: 'pointer', padding: 0,
};

// Palette voor voice-groups (cycled in volgorde van aanmaken).
const POLY_COLORS = [
  '#22d3ee', '#a78bfa', '#fb923c', '#34d399',
  '#f472b6', '#facc15', '#60a5fa', '#fb7185',
];

/** Build a quick lookup: moduleId → { group, voiceIndex } for the rack. */
function buildVoiceMap(rack: Rack): Map<string, { group: PolyGroup; voiceIndex: number }> {
  const map = new Map<string, { group: PolyGroup; voiceIndex: number }>();
  for (const g of rack.polyGroups ?? []) {
    g.members.forEach((m, i) => {
      if (m.kind === 'module') map.set(m.moduleId, { group: g, voiceIndex: i });
    });
  }
  return map;
}

export function RackPanel(): JSX.Element {
  const project = useModularProject();
  const engineStatus = useEngineStatus();
  const racks = project.racks;
  const activeId = project.activeRackId ?? racks[0]?.id;
  const rack = racks.find((r) => r.id === activeId) ?? racks[0];
  const [activeRow, setActiveRow] = useState<number>(0);
  // Multi-select state lives here so the side inspector + grid share it.
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  // Anchor for shift-range select (last single-click target).
  const [lastSelectedSlotId, setLastSelectedSlotId] = useState<string | null>(null);
  // Which voice-group's popover is currently open (also drives the group
  // highlight ring around its member slots in the grid). null = none.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  // Rack zoom factor (multiplies the base px-per-mm). 1 = 100%. Persisted in
  // localStorage so it survives unmount when switching tabs.
  const [zoom, setZoom] = useState<number>(() => {
    const raw = Number(localStorage.getItem('mmb.rackZoom'));
    return raw >= 0.4 && raw <= 3 ? raw : 1;
  });
  useEffect(() => {
    localStorage.setItem('mmb.rackZoom', String(zoom));
  }, [zoom]);

  function addRack(): void {
    const r: Rack = {
      id: uid('rack'),
      name: `Rack ${racks.length + 1}`,
      rows: 3, hpPerRow: 84,
      slots: [],
      kind: 'physical',
    };
    updateProject((p) => ({ ...p, racks: [...p.racks, r], activeRackId: r.id }));
  }

  function addInternalRack(): void {
    const existing = racks.find((r) => r.kind === 'internal');
    if (existing) { updateProject((p) => ({ ...p, activeRackId: existing.id })); return; }
    const r: Rack = {
      id: uid('rack'),
      name: 'MMB Brain (intern)',
      description: 'Virtueel rack voor brain-modules; groeit automatisch mee.',
      rows: 1, hpPerRow: 64, slots: [], kind: 'internal',
    };
    updateProject((p) => ({ ...p, racks: [...p.racks, r], activeRackId: r.id }));
  }

  function removeRack(id: string): void {
    if (racks.length <= 1) { alert('Tenminste één rack moet bestaan.'); return; }
    if (!confirm('Rack verwijderen? Patches die ernaar verwijzen blijven over.')) return;
    updateProject((p) => ({
      ...p,
      racks: p.racks.filter((r) => r.id !== id),
      activeRackId: p.activeRackId === id ? p.racks.find((r) => r.id !== id)?.id : p.activeRackId,
    }));
  }

  /** Schuif alle modules in het actieve rack compact aan: masters (+ niet-poly
   *  modules) op rij 0, followers per stem in een lagere rij (vult het gat dat
   *  ontstaat door PolyGroup-inklapping). Zie {@link compactRack}. */
  function compactRack(): void {
    updateProject((p) => {
      const rackId = p.activeRackId ?? p.racks[0]?.id;
      const r = p.racks.find((x) => x.id === rackId);
      if (!r) return p;
      const compacted = compactRackLayout(r, p.modules);
      return { ...p, racks: p.racks.map((x) => x.id !== r.id ? x : compacted) };
    });
  }

  if (!rack) {
    return (
      <div>
        <button onClick={addRack}>+ Rack</button>
        <p style={{ color: '#6b7280', fontSize: 13 }}>Geen racks. Maak er een aan.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12 }}>Rack:
          <select value={rack.id}
                  onChange={(e) => updateProject((p) => ({ ...p, activeRackId: e.target.value }))}
                  style={{ marginLeft: 4, fontSize: 12 }}>
            {racks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button onClick={addRack} style={{ fontSize: 12 }}>+ Rack</button>
        <button onClick={addInternalRack} style={{ fontSize: 12 }} title="Maak/activeer het MMB Brain (intern) rack">+ Intern</button>
        <button onClick={() => removeRack(rack.id)} style={{ fontSize: 12 }}>− Rack</button>
        <button onClick={compactRack} style={{ fontSize: 12 }} title="Schuif modules per rij naar links aan (vult gaten na PolyGroup-inklapping)">Compact</button>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 11, padding: '2px 6px', borderRadius: 10,
          background: rack.kind === 'internal' ? '#1d4ed8' : '#475569',
          color: 'white',
        }} title={rack.kind === 'internal' ? 'Virtueel rack — groeit mee, geen HP-budget' : 'Fysiek rack — HP-budget telt'}>
          {rack.kind === 'internal' ? 'INTERN' : 'FYSIEK'}
        </span>
        <RackHeaderEditor rack={rack} />
      </div>

      <VoiceGroupsPanel rack={rack} modules={project.modules} types={project.moduleTypes}
                        openGroupId={openGroupId}
                        setOpenGroupId={(id) => {
                          setOpenGroupId(id);
                          if (id) {
                            setSelectedSlotIds(new Set());
                            setLastSelectedSlotId(null);
                          }
                        }} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RackGrid
            rack={rack} modules={project.modules} types={project.moduleTypes}
            activeRow={activeRow} onSelectRow={setActiveRow}
            zoom={zoom} setZoom={setZoom}
            selectedSlotIds={selectedSlotIds}
            setSelectedSlotIds={(s) => {
              setSelectedSlotIds(s);
              if (s.size > 0) setOpenGroupId(null);
            }}
            lastSelectedSlotId={lastSelectedSlotId} setLastSelectedSlotId={setLastSelectedSlotId}
            openGroupId={openGroupId} setOpenGroupId={setOpenGroupId}
          />
        </div>
        {(selectedSlotIds.size > 0 || openGroupId) && (
          <RackInspector
            rack={rack} modules={project.modules} types={project.moduleTypes}
            selectedSlotIds={selectedSlotIds} setSelectedSlotIds={setSelectedSlotIds}
            openGroupId={openGroupId} setOpenGroupId={setOpenGroupId}
          />
        )}
      </div>

      <ModuleSidebar
        rack={rack} modules={project.modules} types={project.moduleTypes}
        pickedRow={activeRow} setPickedRow={setActiveRow}
      />
    </div>
  );
}

// ── Header (name/rows/HP) ──────────────────────────────────────────────

function RackHeaderEditor({ rack }: { rack: Rack }): JSX.Element {
  function update(fn: (r: Rack) => Rack): void {
    updateProject((p) => ({ ...p, racks: p.racks.map((r) => r.id === rack.id ? fn(r) : r) }));
  }
  const isInternal = rack.kind === 'internal';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <label>Naam:
        <input value={rack.name}
               onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
               style={{ marginLeft: 4, fontSize: 12, width: isInternal ? 160 : 120 }} />
      </label>
      {isInternal ? (
        <span style={{ color: '#6b7280' }}>auto-grow • nu {rack.hpPerRow} HP</span>
      ) : (
        <>
          <label>Rijen:
            <input type="number" min={1} max={6} value={rack.rows}
                   onChange={(e) => update((r) => ({ ...r, rows: Math.max(1, Math.min(6, Number(e.target.value) || 1)) }))}
                   style={{ marginLeft: 4, fontSize: 12, width: 50 }} />
          </label>
          <label>HP/rij:
            <input type="number" min={20} max={168} value={rack.hpPerRow}
                   onChange={(e) => update((r) => ({ ...r, hpPerRow: Math.max(20, Math.min(168, Number(e.target.value) || 84)) }))}
                   style={{ marginLeft: 4, fontSize: 12, width: 60 }} />
          </label>
        </>
      )}
    </div>
  );
}

// ── Rack visual grid ───────────────────────────────────────────────────

function RackGrid({ rack, modules, types, activeRow, onSelectRow,
                   selectedSlotIds, setSelectedSlotIds,
                   lastSelectedSlotId, setLastSelectedSlotId,
                   openGroupId, setOpenGroupId, zoom, setZoom }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
  activeRow: number; onSelectRow: (row: number) => void;
  selectedSlotIds: Set<string>; setSelectedSlotIds: (s: Set<string>) => void;
  lastSelectedSlotId: string | null; setLastSelectedSlotId: (id: string | null) => void;
  openGroupId: string | null; setOpenGroupId: (id: string | null) => void;
  zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>>;
}): JSX.Element {
  // Effective px-per-mm including the user's rack-zoom. All layout + the
  // drop/click→HP math below use PX so zoom stays self-consistent.
  const PX = PX_PER_MM * zoom;
  const rowWidthMm = rack.hpPerRow * MM_PER_HP;
  const engineStatus = useEngineStatus();
  const voiceMap = buildVoiceMap(rack);

  // Ingeklapte poly-groepen (backlog B4 / ED-RK-2): de master toont één blok
  // met "×N", de followers (voiceIndex ≥ 1) worden niet getekend. Per-rack
  // weergavestaat; raakt het project-model niet.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  function toggleCollapse(groupId: string): void {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  // After an arrow-move the slot's DOM node is unmounted+remounted under a
  // different row container, so the browser drops focus. We schedule a
  // refocus by data-slot-id after the next render so repeated arrows keep
  // working without the user having to click again.
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    pendingFocusRef.current = null;
    const el = document.querySelector<HTMLDivElement>(`[data-slot-id="${id}"]`);
    el?.focus();
  });

  function duplicateSlot(slotId: string): void {
    const slot = rack.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const src = modules.find((m) => m.id === slot.moduleId);
    if (!src) return;
    const newMod: ModuleInstance = {
      ...src,
      id: uid('mod'),
      name: `${src.name} copy`,
    };
    // Find next free HP slot in same row, fallback to subsequent rows.
    const placeInRow = (row: number, w: number): number | null => {
      const rowSlots = rack.slots.filter((s) => s.row === row).sort((a, b) => a.hpOffset - b.hpOffset);
      let off = 0;
      for (const s of rowSlots) {
        const sm = modules.find((m) => m.id === s.moduleId);
        const sw = sm?.visual.hpWidth ?? 4;
        if (off + w <= s.hpOffset) return off;
        off = Math.max(off, s.hpOffset + sw);
      }
      return off + w <= rack.hpPerRow ? off : null;
    };
    let row = slot.row, offset: number | null = null;
    for (let r = slot.row; r < rack.rows; r++) {
      const o = placeInRow(r, newMod.visual.hpWidth);
      if (o !== null) { row = r; offset = o; break; }
    }
    if (offset === null) {
      if (rack.kind === 'internal') {
        // Auto-grow: bereken rechteruiteinde van rij 0 en plak er direct achteraan.
        const usedHp = rack.slots.reduce((mx, s) => {
          const sm = modules.find((m) => m.id === s.moduleId);
          return Math.max(mx, s.hpOffset + (sm?.visual.hpWidth ?? 4));
        }, 0);
        row = 0;
        offset = usedHp;
      } else {
        alert('Geen vrije ruimte voor duplicaat in dit rack — voeg eerst een rij of HP toe.');
        return;
      }
    }
    const newHpPerRow = rack.kind === 'internal'
      ? Math.max(rack.hpPerRow, offset + newMod.visual.hpWidth)
      : rack.hpPerRow;
    const newSlot: RackSlot = { id: uid('slot'), moduleId: newMod.id, row, hpOffset: offset };
    updateProject((p) => ({
      ...p,
      modules: [...p.modules, newMod],
      racks: p.racks.map((r) => r.id === rack.id
        ? { ...r, hpPerRow: newHpPerRow, slots: [...r.slots, newSlot] }
        : r),
    }));
  }

  function removeSlot(slotId: string): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id === rack.id
        ? { ...r, slots: r.slots.filter((s) => s.id !== slotId) } : r),
    }));
  }

  function moveSlot(slotId: string, deltaHp: number): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => {
        if (r.id !== rack.id) return r;
        const slot = r.slots.find((s) => s.id === slotId);
        if (!slot) return r;
        const newOffset = Math.max(0, slot.hpOffset + deltaHp);
        if (r.kind === 'internal') {
          const mod = p.modules.find((m) => m.id === slot.moduleId);
          const w = mod?.visual.hpWidth ?? 4;
          return {
            ...r,
            hpPerRow: Math.max(r.hpPerRow, newOffset + w),
            slots: r.slots.map((s) => s.id === slotId ? { ...s, hpOffset: newOffset } : s),
          };
        }
        return {
          ...r,
          slots: r.slots.map((s) => s.id === slotId
            ? { ...s, hpOffset: Math.min(r.hpPerRow - 1, newOffset) } : s),
        };
      }),
    }));
  }

  function moveRow(slotId: string, deltaRow: number): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => {
        if (r.id !== rack.id) return r;
        const slot = r.slots.find((s) => s.id === slotId);
        if (!slot) return r;
        const newRow = Math.max(0, slot.row + deltaRow);
        if (r.kind === 'internal') {
          return {
            ...r,
            rows: Math.max(r.rows, newRow + 1),
            slots: r.slots.map((s) => s.id === slotId ? { ...s, row: newRow } : s),
          };
        }
        return {
          ...r,
          slots: r.slots.map((s) => s.id === slotId
            ? { ...s, row: Math.min(r.rows - 1, newRow) } : s),
        };
      }),
    }));
  }

  function setSlotPosition(slotId: string, row: number, hpOffset: number): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => {
        if (r.id !== rack.id) return r;
        const clampedRow    = Math.max(0, r.kind === 'internal' ? row    : Math.min(r.rows     - 1, row));
        const clampedOffset = Math.max(0, r.kind === 'internal' ? hpOffset : Math.min(r.hpPerRow - 1, hpOffset));
        if (r.kind === 'internal') {
          const slot = r.slots.find((s) => s.id === slotId);
          const mod  = slot ? p.modules.find((m) => m.id === slot.moduleId) : undefined;
          const w    = mod?.visual.hpWidth ?? 4;
          return {
            ...r,
            rows:     Math.max(r.rows,     clampedRow    + 1),
            hpPerRow: Math.max(r.hpPerRow, clampedOffset + w),
            slots: r.slots.map((s) => s.id === slotId
              ? { ...s, row: clampedRow, hpOffset: clampedOffset } : s),
          };
        }
        return {
          ...r,
          slots: r.slots.map((s) => s.id === slotId
            ? { ...s, row: clampedRow, hpOffset: clampedOffset } : s),
        };
      }),
    }));
  }

  // Context-menu voor module-strip (rechter-muis op een slot).
  const [menu, setMenu] = useState<{ x: number; y: number; slotId: string } | null>(null);

  // ── Multi-select aware helpers ────────────────────────────────────

  function handleSlotClick(e: React.MouseEvent, slotId: string, rowIdx: number): void {
    e.stopPropagation();
    onSelectRow(rowIdx);
    // Shift = range select within the same row (between last single-click anchor and this).
    if (e.shiftKey && lastSelectedSlotId) {
      const last = rack.slots.find((s) => s.id === lastSelectedSlotId);
      const cur  = rack.slots.find((s) => s.id === slotId);
      if (last && cur && last.row === cur.row) {
        const lo = Math.min(last.hpOffset, cur.hpOffset);
        const hi = Math.max(last.hpOffset, cur.hpOffset);
        const inRange = rack.slots.filter((s) => s.row === cur.row && s.hpOffset >= lo && s.hpOffset <= hi);
        const next = new Set(selectedSlotIds);
        for (const s of inRange) next.add(s.id);
        setSelectedSlotIds(next);
        return;
      }
      // fall through to ctrl-toggle behaviour if rows differ
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedSlotIds);
      if (next.has(slotId)) next.delete(slotId); else next.add(slotId);
      setSelectedSlotIds(next);
      setLastSelectedSlotId(slotId);
      return;
    }
    setSelectedSlotIds(new Set([slotId]));
    setLastSelectedSlotId(slotId);
  }

  // Move every selected slot by (deltaRow, deltaHp). Atomic: if ANY would
  // collide / go OOB on a physical rack, the whole move is rejected. On an
  // internal rack rows/HP grow to fit (but never shrink negative).
  function moveSelection(deltaRow: number, deltaHp: number): void {
    if (selectedSlotIds.size === 0) return;
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => {
        if (r.id !== rack.id) return r;
        const sel = new Map<string, { row: number; hp: number; w: number }>();
        for (const s of r.slots) {
          if (!selectedSlotIds.has(s.id)) continue;
          const mod = p.modules.find((m) => m.id === s.moduleId);
          const w = mod?.visual.hpWidth ?? 4;
          sel.set(s.id, { row: s.row + deltaRow, hp: s.hpOffset + deltaHp, w });
        }
        if (sel.size === 0) return r;
        const isInternal = r.kind === 'internal';
        // Bounds checks
        for (const v of sel.values()) {
          if (v.row < 0 || v.hp < 0) return r;
          if (!isInternal && v.row > r.rows - 1) return r;
          if (!isInternal && v.hp + v.w > r.hpPerRow) return r;
        }
        // Overlap with non-selected slots
        const others = r.slots.filter((s) => !selectedSlotIds.has(s.id))
          .map((s) => {
            const mod = p.modules.find((m) => m.id === s.moduleId);
            return { row: s.row, hp: s.hpOffset, w: mod?.visual.hpWidth ?? 4 };
          });
        for (const v of sel.values()) {
          for (const o of others) {
            if (o.row !== v.row) continue;
            if (v.hp < o.hp + o.w && o.hp < v.hp + v.w) return r;
          }
        }
        // Overlap between selected slots themselves
        const selArr = Array.from(sel.values());
        for (let i = 0; i < selArr.length; i++) {
          for (let j = i + 1; j < selArr.length; j++) {
            const a = selArr[i]!, b = selArr[j]!;
            if (a.row === b.row && a.hp < b.hp + b.w && b.hp < a.hp + a.w) return r;
          }
        }
        let newRows = r.rows;
        let newHp   = r.hpPerRow;
        if (isInternal) {
          for (const v of sel.values()) {
            newRows = Math.max(newRows, v.row + 1);
            newHp   = Math.max(newHp,   v.hp + v.w);
          }
        }
        return {
          ...r,
          rows: newRows,
          hpPerRow: newHp,
          slots: r.slots.map((s) => {
            const nv = sel.get(s.id);
            return nv ? { ...s, row: nv.row, hpOffset: nv.hp } : s;
          }),
        };
      }),
    }));
  }

  // Drop handler entry point. Uses the dragged slot as anchor: computes
  // (deltaRow, deltaHp) from its current position to the drop target, then
  // applies that delta to the whole selection (so dragging a group keeps
  // their relative layout). If the anchor isn't in the selection, the drag
  // promotes it to a single-slot selection first.
  function dropToPosition(anchorSlotId: string, newRow: number, newHp: number): void {
    const anchor = rack.slots.find((s) => s.id === anchorSlotId);
    if (!anchor) return;
    if (!selectedSlotIds.has(anchorSlotId)) {
      // Promote anchor to single-selection and apply directly.
      setSelectedSlotIds(new Set([anchorSlotId]));
      setLastSelectedSlotId(anchorSlotId);
      setSlotPosition(anchorSlotId, newRow, newHp);
      return;
    }
    moveSelection(newRow - anchor.row, newHp - anchor.hpOffset);
  }

  // Pack selected slots flush against each other, per row. Direction = 'left'
  // keeps the leftmost as anchor; 'right' keeps the rightmost. Non-selected
  // modules in the same row stay put — if there isn't enough free space
  // between them the operation aborts with an alert.
  function packSelection(direction: 'left' | 'right'): void {
    if (selectedSlotIds.size < 2) return;
    updateProject((p) => {
      const r = p.racks.find((rr) => rr.id === rack.id);
      if (!r) return p;
      const widthOf = (mid: string) =>
        p.modules.find((m) => m.id === mid)?.visual.hpWidth ?? 4;

      const slotsBySelected = r.slots.filter((s) => selectedSlotIds.has(s.id));
      const rowGroups = new Map<number, typeof slotsBySelected>();
      for (const s of slotsBySelected) {
        const arr = rowGroups.get(s.row) ?? [];
        arr.push(s);
        rowGroups.set(s.row, arr);
      }

      const newOffsets = new Map<string, number>();
      for (const [, rowSel] of rowGroups) {
        const sorted = [...rowSel].sort((a, b) => a.hpOffset - b.hpOffset);
        if (direction === 'left') {
          const anchor = sorted[0]!;
          let cursor = anchor.hpOffset + widthOf(anchor.moduleId);
          newOffsets.set(anchor.id, anchor.hpOffset);
          for (let i = 1; i < sorted.length; i++) {
            const s = sorted[i]!;
            newOffsets.set(s.id, cursor);
            cursor += widthOf(s.moduleId);
          }
        } else {
          const anchor = sorted[sorted.length - 1]!;
          let cursor = anchor.hpOffset;
          newOffsets.set(anchor.id, anchor.hpOffset);
          for (let i = sorted.length - 2; i >= 0; i--) {
            const s = sorted[i]!;
            cursor -= widthOf(s.moduleId);
            if (cursor < 0) { alert('Niet genoeg ruimte links van het rechter-anker.'); return p; }
            newOffsets.set(s.id, cursor);
          }
        }
      }

      const others = r.slots.filter((s) => !selectedSlotIds.has(s.id))
        .map((s) => ({ row: s.row, hp: s.hpOffset, w: widthOf(s.moduleId) }));
      for (const s of slotsBySelected) {
        const hp = newOffsets.get(s.id)!;
        const w  = widthOf(s.moduleId);
        if (r.kind !== 'internal' && hp + w > r.hpPerRow) {
          alert('Niet genoeg HP in deze rij om alles aan te sluiten.'); return p;
        }
        for (const o of others) {
          if (o.row !== s.row) continue;
          if (hp < o.hp + o.w && o.hp < hp + w) {
            alert('Botst met een niet-geselecteerde module — maak eerst ruimte.'); return p;
          }
        }
      }

      let newHp = r.hpPerRow;
      if (r.kind === 'internal') {
        for (const s of slotsBySelected) {
          newHp = Math.max(newHp, newOffsets.get(s.id)! + widthOf(s.moduleId));
        }
      }

      return {
        ...p,
        racks: p.racks.map((rr) => rr.id !== r.id ? rr : ({
          ...rr,
          hpPerRow: newHp,
          slots: rr.slots.map((s) => {
            const off = newOffsets.get(s.id);
            return off !== undefined ? { ...s, hpOffset: off } : s;
          }),
        })),
      };
    });
  }

  // Create a new voice-group from the current selection. All selected modules
  // must share the same typeId and none may already belong to another group
  // in this rack. Members are ordered by (row, hpOffset); leftmost = master.
  function makeVoiceGroupFromSelection(): void {
    if (selectedSlotIds.size < 2) {
      alert('Selecteer minstens twee modules voor een voice-group.');
      return;
    }
    const slots = rack.slots.filter((s) => selectedSlotIds.has(s.id))
      .sort((a, b) => a.row - b.row || a.hpOffset - b.hpOffset);
    const mods = slots.map((s) => modules.find((m) => m.id === s.moduleId)).filter(Boolean) as ModuleInstance[];
    if (mods.length !== slots.length) { alert('Geselecteerde slot zonder module — afgebroken.'); return; }
    const typeId = mods[0]!.typeId;
    if (!mods.every((m) => m.typeId === typeId)) {
      alert('Voice-group leden moeten allemaal hetzelfde type hebben.');
      return;
    }
    const taken = new Set<string>();
    for (const g of rack.polyGroups ?? []) {
      for (const m of g.members) if (m.kind === 'module') taken.add(m.moduleId);
    }
    if (mods.some((m) => taken.has(m.id))) {
      alert('Eén of meer modules zitten al in een andere voice-group.');
      return;
    }
    const color = POLY_COLORS[(rack.polyGroups ?? []).length % POLY_COLORS.length];
    const newGroup: PolyGroup = {
      id: uid('pg'),
      label: `Group ${(rack.polyGroups ?? []).length + 1}`,
      voiceCount: mods.length,
      members: mods.map((m) => ({ kind: 'module', moduleId: m.id }) as PolyGroupMember),
      color,
    };
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r, polyGroups: [...(r.polyGroups ?? []), newGroup],
      })),
    }));
  }

  // Voice-group of every rack module with the same typeId as `slotId`'s
  // module (skipping any already grouped). The right-clicked slot becomes
  // voice 1 ★ (master); the rest follow in (row, hp) order.
  function makeVoiceGroupFromSameType(slotId: string): void {
    const slot = rack.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const src = modules.find((m) => m.id === slot.moduleId);
    if (!src) return;
    const taken = new Set<string>();
    for (const g of rack.polyGroups ?? []) {
      for (const m of g.members) if (m.kind === 'module') taken.add(m.moduleId);
    }
    if (taken.has(src.id)) { alert('Deze module zit al in een voice-group.'); return; }
    const sameType = rack.slots
      .map((s) => ({ slot: s, mod: modules.find((m) => m.id === s.moduleId) }))
      .filter((x) => x.mod && x.mod.typeId === src.typeId && !taken.has(x.mod.id))
      .sort((a, b) => a.slot.row - b.slot.row || a.slot.hpOffset - b.slot.hpOffset);
    if (sameType.length < 2) {
      alert(`Geen andere vrije "${src.typeId}" modules in dit rack.`);
      return;
    }
    const ordered = [
      sameType.find((x) => x.slot.id === slotId)!,
      ...sameType.filter((x) => x.slot.id !== slotId),
    ];
    const color = POLY_COLORS[(rack.polyGroups ?? []).length % POLY_COLORS.length];
    const newGroup: PolyGroup = {
      id: uid('pg'),
      label: `Group ${(rack.polyGroups ?? []).length + 1}`,
      voiceCount: ordered.length,
      members: ordered.map((x) => ({ kind: 'module', moduleId: x.mod!.id }) as PolyGroupMember),
      color,
    };
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r, polyGroups: [...(r.polyGroups ?? []), newGroup],
      })),
    }));
  }

  /** Maak N stemmen uit één module: dupliceer de module (N-1)× in lagere rijen
   *  (exact onder de master uitgelijnd) en bundel master + followers tot één
   *  PolyGroup. Snelle weg om een poly-stack te seeden vanuit één module
   *  (backlog B3 / ED-RK-1) zonder de modules eerst handmatig te dupliceren. */
  function makePolyGroupOfN(slotId: string): void {
    const slot = rack.slots.find((s) => s.id === slotId);
    if (!slot) return;
    const src = modules.find((m) => m.id === slot.moduleId);
    if (!src) return;
    const taken = new Set<string>();
    for (const g of rack.polyGroups ?? []) {
      for (const m of g.members) if (m.kind === 'module') taken.add(m.moduleId);
    }
    if (taken.has(src.id)) { alert('Deze module zit al in een voice-group.'); return; }

    const raw = window.prompt('Aantal stemmen voor deze poly-voicegroup (2–16):', '4');
    if (raw === null) return;
    const N = Math.max(2, Math.min(16, Math.round(Number(raw))));
    if (!Number.isFinite(N) || N < 2) { alert('Ongeldig aantal stemmen.'); return; }

    // Master blijft op zijn plek; followers komen er recht onder (zelfde HP).
    const newMods: ModuleInstance[] = [];
    const newSlots: RackSlot[] = [];
    for (let i = 1; i < N; ++i) {
      const m: ModuleInstance = { ...src, id: uid('mod'), name: `${src.name} v${i + 1}` };
      newMods.push(m);
      newSlots.push({ id: uid('slot'), moduleId: m.id, row: slot.row + i, hpOffset: slot.hpOffset });
    }
    const color = POLY_COLORS[(rack.polyGroups ?? []).length % POLY_COLORS.length];
    const newGroup: PolyGroup = {
      id: uid('pg'),
      label: src.name || `Group ${(rack.polyGroups ?? []).length + 1}`,
      voiceCount: N,
      members: [
        { kind: 'module', moduleId: src.id },
        ...newMods.map((m) => ({ kind: 'module', moduleId: m.id }) as PolyGroupMember),
      ],
      color,
    };
    const neededRows = Math.max(rack.rows, slot.row + N);
    updateProject((p) => ({
      ...p,
      modules: [...p.modules, ...newMods],
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r,
        rows: neededRows,
        slots: [...r.slots, ...newSlots],
        polyGroups: [...(r.polyGroups ?? []), newGroup],
      })),
    }));
  }

  function onSlotKeyDown(e: React.KeyboardEvent<HTMLDivElement>, slotId: string): void {
    const big = e.shiftKey ? 4 : 1;
    let handled = true;
    if      (e.key === 'ArrowLeft')  moveSelection(0, -big);
    else if (e.key === 'ArrowRight') moveSelection(0,  big);
    else if (e.key === 'ArrowUp')    moveSelection(-1, 0);
    else if (e.key === 'ArrowDown')  moveSelection( 1, 0);
    else if (e.key === 'Delete') {
      const ids = selectedSlotIds.size > 0 ? selectedSlotIds : new Set([slotId]);
      updateProject((p) => ({
        ...p,
        racks: p.racks.map((r) => r.id !== rack.id ? r : ({
          ...r, slots: r.slots.filter((s) => !ids.has(s.id)),
        })),
      }));
      setSelectedSlotIds(new Set());
    }
    else handled = false;
    if (handled) {
      e.preventDefault();
      // Tell the effect above to refocus this slot after React commits the
      // new DOM (the old element may have been unmounted by a row change).
      pendingFocusRef.current = slotId;
    }
  }

  return (
    <div
      onClick={() => { setSelectedSlotIds(new Set()); setLastSelectedSlotId(null); }}
      style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: 6, background: '#0f172a', borderRadius: 6,
      overflowX: 'auto',
    }}>
      {/* Zoom-overlay — zwevend zoals in de patcher (ReactFlow Controls-stijl). */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 10, bottom: 10, zIndex: 5,
          display: 'flex', flexDirection: 'column',
          borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          background: '#1e293b', border: '1px solid #334155',
        }}>
        <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          title="Inzoomen"
          style={zoomBtn}>+</button>
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
          title="Uitzoomen"
          style={{ ...zoomBtn, borderTop: '1px solid #334155' }}>−</button>
        <button onClick={() => setZoom(1)}
          title={`Reset naar 100% (nu ${Math.round(zoom * 100)}%)`}
          style={{ ...zoomBtn, borderTop: '1px solid #334155', fontSize: 9, lineHeight: 1 }}>
          {Math.round(zoom * 100)}%
        </button>
      </div>
      {Array.from({ length: rack.rows }).map((_, rowIdx) => {
        const slotsInRow = rack.slots
          .filter((s) => s.row === rowIdx)
          .filter((s) => {
            // Verberg followers van een ingeklapte poly-groep (B4).
            const v = voiceMap.get(s.moduleId);
            return !(v && v.voiceIndex >= 1 && collapsedGroups.has(v.group.id));
          })
          .sort((a, b) => a.hpOffset - b.hpOffset);
        const isActive = rowIdx === activeRow;
        return (
          <div key={rowIdx}
               onClick={(e) => {
                 e.stopPropagation();
                 // Click on empty row background = clear selection AND make
                 // this the active row for the sidebar's "Plaats →" target.
                 setSelectedSlotIds(new Set());
                 setLastSelectedSlotId(null);
                 onSelectRow(rowIdx);
               }}
               onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
               onDrop={(e) => {
                 e.preventDefault();
                 const slotId = e.dataTransfer.getData('text/slot-id');
                 if (!slotId) return;
                 const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                 const xPx = e.clientX - rect.left;
                 const hp = Math.max(0, Math.round(xPx / (MM_PER_HP * PX)));
                 dropToPosition(slotId, rowIdx, hp);
               }}
               title={`Rij ${rowIdx + 1} — klik om als actieve rij te kiezen (volgende ‘Plaats →’ komt hierheen)`}
               style={{
            position: 'relative',
            width: rowWidthMm * PX,
            height: PANEL_HEIGHT_MM * PX,
            background: '#1e293b',
            border: isActive ? '2px solid #2563eb' : '1px solid #334155',
            boxShadow: isActive ? '0 0 0 1px #1d4ed8 inset' : undefined,
            borderRadius: 3,
            cursor: 'pointer',
          }}>
            {/* HP grid lines every 10 HP */}
            {Array.from({ length: Math.floor(rack.hpPerRow / 10) }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: (i + 1) * 10 * MM_PER_HP * PX,
                top: 0, bottom: 0,
                width: 1, background: '#334155', opacity: 0.6,
              }} />
            ))}
            {slotsInRow.map((slot) => {
              const m = modules.find((x) => x.id === slot.moduleId);
              if (!m) {
                return (
                  <div key={slot.id} style={{
                    position: 'absolute',
                    left: slot.hpOffset * MM_PER_HP * PX,
                    top: 0,
                    height: PANEL_HEIGHT_MM * PX,
                    width: 60,
                    background: '#dc2626',
                    color: 'white', fontSize: 10, padding: 4,
                  }}>
                    Missing<br/>{slot.moduleId}
                  </div>
                );
              }
              const overlap = detectOverlap(slot, slotsInRow, m, modules);
              const isSelected = selectedSlotIds.has(slot.id);
              // Interne MMB-modules dragen hun poort-namen alleen in data (geen
              // gedrukte faceplate-grafiek), dus tonen we de jack-labels expliciet.
              const isInternal = types.find((x) => x.id === m.typeId)?.internal ?? false;
              const voice = voiceMap.get(m.id);
              const isGroupActive = !!(openGroupId && voice && voice.group.id === openGroupId);
              const isCollapsedMaster = !!(voice && voice.voiceIndex === 0 && collapsedGroups.has(voice.group.id));
              return (
                <div key={slot.id}
                  tabIndex={0}
                  data-slot-id={slot.id}
                  onClick={(e) => handleSlotClick(e, slot.id, rowIdx)}
                  onFocus={() => {
                    if (selectedSlotIds.size === 0) {
                      setSelectedSlotIds(new Set([slot.id]));
                      setLastSelectedSlotId(slot.id);
                    }
                  }}
                  onKeyDown={(e) => onSlotKeyDown(e, slot.id)}
                  style={{
                  position: 'absolute',
                  left: slot.hpOffset * MM_PER_HP * PX,
                  top: 0,
                  outline: overlap
                    ? '2px solid #dc2626'
                    : isSelected ? '2px solid #fbbf24'
                    : isGroupActive ? `2px solid ${voice!.group.color || '#22d3ee'}` : 'none',
                  outlineOffset: -2,
                  boxShadow: isSelected
                    ? '0 0 14px rgba(251,191,36,0.55)'
                    : isGroupActive ? `0 0 14px ${voice!.group.color || '#22d3ee'}88` : undefined,
                  cursor: 'pointer',
                }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Right-click on a slot that's not in the selection promotes
                    // it to a single-slot selection so menu actions are unambiguous.
                    if (!selectedSlotIds.has(slot.id)) {
                      setSelectedSlotIds(new Set([slot.id]));
                      setLastSelectedSlotId(slot.id);
                    }
                    setMenu({ x: e.clientX, y: e.clientY, slotId: slot.id });
                  }}
                >
                  {/* Poly-groep badge: klik om in/uit te klappen (B4). Op een
                      ingeklapte master toont hij "×N", anders alleen wanneer
                      de groep al ingeklapt elders is — hier altijd op master. */}
                  {voice && voice.voiceIndex === 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(voice.group.id); }}
                      title={isCollapsedMaster
                        ? `Poly-groep "${voice.group.label}" — klik om uit te klappen (×${voice.group.voiceCount})`
                        : `Poly-groep "${voice.group.label}" — klik om in te klappen`}
                      style={{
                        position: 'absolute', top: 2, left: 2, zIndex: 6,
                        fontSize: 9, fontWeight: 600, lineHeight: 1,
                        color: '#0f172a', cursor: 'pointer',
                        background: voice.group.color || '#22d3ee',
                        border: 'none', borderRadius: 3, padding: '2px 5px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.45)',
                      }}
                    >
                      {isCollapsedMaster
                        ? `${voice.group.label} ×${voice.group.voiceCount}`
                        : '⊟'}
                    </button>
                  )}
                  {/* Drag-handle bar — versleep naar andere HP/rij */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/slot-id', slot.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    title="Sleep om te verplaatsen (HP / rij)"
                    style={{
                      position: 'absolute', left: 0, right: 0, top: 0,
                      height: 8, background: 'rgba(37,99,235,0.55)',
                      cursor: 'grab', borderTopLeftRadius: 2, borderTopRightRadius: 2,
                      zIndex: 2,
                    }}
                  />
                  <ModulePanel module={m} types={types} pxPerMm={PX} showPortLabels={isInternal}
                    controlState={engineStatus.liveControls[m.id]} />
                  {voice && (
                    <>
                      {/* Kleur-ribbon onderaan = visuele tag van de voice-group. */}
                      <div
                        title={`${voice.group.label} — voice ${voice.voiceIndex + 1} / ${voice.group.voiceCount}`}
                        style={{
                          position: 'absolute', left: 0, right: 0, bottom: 0,
                          height: 4, background: voice.group.color || '#888',
                          zIndex: 3, pointerEvents: 'none',
                          borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
                        }}
                      />
                      {/* Voice-badge linksboven (onder de drag-handle). */}
                      <div
                        title={`${voice.group.label} — voice ${voice.voiceIndex + 1} / ${voice.group.voiceCount}`}
                        style={{
                          position: 'absolute', left: 2, top: 10,
                          padding: '1px 4px',
                          fontSize: 9, lineHeight: 1.1, fontWeight: 600,
                          color: '#0f172a',
                          background: voice.group.color || '#cbd5e1',
                          borderRadius: 2, zIndex: 3, pointerEvents: 'none',
                        }}
                      >
                        {voice.voiceIndex + 1}/{voice.group.voiceCount}
                        {voice.voiceIndex === 0 ? ' ★' : ''}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {menu && (() => {
        const multi = selectedSlotIds.size > 1;
        const close = () => setMenu(null);
        // Determine whether the focused module(s) already live in a voice-group.
        // For multi: shared iff all selected map to the same group.
        // For single: just look up the right-clicked module.
        let sharedGroupId: string | null = null;
        if (multi) {
          const ids = new Set<string>();
          for (const sid of selectedSlotIds) {
            const s = rack.slots.find((x) => x.id === sid);
            const v = s ? voiceMap.get(s.moduleId) : undefined;
            ids.add(v ? v.group.id : '');
          }
          if (ids.size === 1) {
            const only = [...ids][0]!;
            if (only !== '') sharedGroupId = only;
          }
        } else {
          const s = rack.slots.find((x) => x.id === menu.slotId);
          const v = s ? voiceMap.get(s.moduleId) : undefined;
          sharedGroupId = v ? v.group.id : null;
        }
        const openGroup = (gid: string): void => {
          setSelectedSlotIds(new Set());
          setLastSelectedSlotId(null);
          setOpenGroupId(gid);
        };
        return (
          <div
            onClick={close}
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          >
            <ul
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed', left: menu.x, top: menu.y,
                listStyle: 'none', margin: 0, padding: 4,
                background: '#0f172a', border: '1px solid #334155',
                borderRadius: 4, minWidth: 200, fontSize: 12,
                color: '#e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
              }}
            >
              {multi ? (
                <>
                  <li style={ctxHeader}>{selectedSlotIds.size} modules geselecteerd</li>
                  <li><button style={ctxItem} onClick={() => { packSelection('left');  close(); }}>⇤ Aansluiten naar links</button></li>
                  <li><button style={ctxItem} onClick={() => { packSelection('right'); close(); }}>⇥ Aansluiten naar rechts</button></li>
                  <li style={ctxSep} />
                  {sharedGroupId
                    ? <li><button style={ctxItem} onClick={() => { openGroup(sharedGroupId!); close(); }}>⛓ Toon voice-group eigenschappen</button></li>
                    : <li><button style={ctxItem} onClick={() => { makeVoiceGroupFromSelection(); close(); }}>⛓ Maak voice-group van selectie</button></li>}
                  <li style={ctxSep} />
                  <li><button style={{ ...ctxItem, color: '#fca5a5' }} onClick={() => {
                    const ids = selectedSlotIds;
                    updateProject((p) => ({
                      ...p,
                      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
                        ...r, slots: r.slots.filter((s) => !ids.has(s.id)),
                      })),
                    }));
                    setSelectedSlotIds(new Set());
                    close();
                  }}>× Verwijder selectie ({selectedSlotIds.size})</button></li>
                </>
              ) : (
                <>
                  <li><button style={ctxItem} onClick={() => { duplicateSlot(menu.slotId); close(); }}>⎘ Dupliceer module</button></li>
                  <li><button style={ctxItem} onClick={() => { moveRow(menu.slotId, -1);    close(); }}>▲ Rij omhoog</button></li>
                  <li><button style={ctxItem} onClick={() => { moveRow(menu.slotId,  1);    close(); }}>▼ Rij omlaag</button></li>
                  <li><button style={ctxItem} onClick={() => { moveSlot(menu.slotId, -1);   close(); }}>◀ 1 HP naar links</button></li>
                  <li><button style={ctxItem} onClick={() => { moveSlot(menu.slotId,  1);   close(); }}>▶ 1 HP naar rechts</button></li>
                  <li style={ctxSep} />
                  {sharedGroupId
                    ? <>
                        <li><button style={ctxItem} onClick={() => { openGroup(sharedGroupId!); close(); }}>⛓ Toon voice-group eigenschappen</button></li>
                        <li><button style={ctxItem} onClick={() => { toggleCollapse(sharedGroupId!); close(); }}>{collapsedGroups.has(sharedGroupId!) ? '⊞ Klap poly-groep uit' : '⊟ Klap poly-groep in'}</button></li>
                      </>
                    : <>
                        <li><button style={ctxItem} onClick={() => { makePolyGroupOfN(menu.slotId); close(); }}>✥ Maak poly-voicegroup ×N…</button></li>
                        <li><button style={ctxItem} onClick={() => { makeVoiceGroupFromSameType(menu.slotId); close(); }}>⛓ Voice-group van alle modules met dit type</button></li>
                      </>}
                  <li style={ctxSep} />
                  <li><button style={{ ...ctxItem, color: '#fca5a5' }} onClick={() => { removeSlot(menu.slotId); close(); }}>× Verwijder uit rack</button></li>
                </>
              )}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}

const ctxItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '4px 8px', background: 'transparent', color: 'inherit',
  border: 'none', cursor: 'pointer', fontSize: 12,
};
const ctxHeader: React.CSSProperties = {
  padding: '4px 8px', fontSize: 11, color: '#94a3b8',
  borderBottom: '1px solid #334155', marginBottom: 2,
};
const ctxSep: React.CSSProperties = {
  height: 1, background: '#334155', margin: '4px 0',
};

// ── Inspector side-panel ───────────────────────────────────────────────
// IDE-style right column: shows properties for the (single) selected module,
// or a count + bulk-actions when multiple are selected. Renamed module
// instances feed back into the project store immediately.

function RackInspector({ rack, modules, types, selectedSlotIds, setSelectedSlotIds,
                        openGroupId, setOpenGroupId }: {
  rack: Rack;
  modules: ModuleInstance[];
  types: ModuleType[];
  selectedSlotIds: Set<string>;
  setSelectedSlotIds: (s: Set<string>) => void;
  openGroupId: string | null;
  setOpenGroupId: (id: string | null) => void;
}): JSX.Element {
  const slots = rack.slots.filter((s) => selectedSlotIds.has(s.id));

  function renameModule(moduleId: string, name: string): void {
    updateProject((p) => ({
      ...p,
      modules: p.modules.map((m) => m.id === moduleId ? { ...m, name } : m),
    }));
  }
  function deleteSelected(): void {
    if (selectedSlotIds.size === 0) return;
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r, slots: r.slots.filter((s) => !selectedSlotIds.has(s.id)),
      })),
    }));
    setSelectedSlotIds(new Set());
  }

  // Mode priority: selection > open voice-group > placeholder (auto-hidden
  // by the parent when both are empty, so we never reach the placeholder).
  if (slots.length === 0 && openGroupId) {
    const group = (rack.polyGroups ?? []).find((g) => g.id === openGroupId);
    return (
      <aside style={inspectorBox}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Voice group</div>
        {group ? (
          <GroupEditor rack={rack} modules={modules} types={types} group={group}
                       onClose={() => setOpenGroupId(null)} />
        ) : (
          <div style={{ color: '#fca5a5', fontSize: 12 }}>Group niet gevonden.</div>
        )}
      </aside>
    );
  }

  if (slots.length === 0) {
    return (
      <aside style={inspectorBox}>
        <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
          Geen module geselecteerd.
        </div>
      </aside>
    );
  }

  if (slots.length > 1) {
    return (
      <aside style={inspectorBox}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{slots.length} modules geselecteerd</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, lineHeight: 1.4 }}>
          Pijltjes ←↑→↓: verplaats hele selectie (Shift = 4 HP).<br />
          Sleep een lid: hele groep verschuift mee.<br />
          Delete: verwijder selectie.
        </div>
        <button onClick={deleteSelected} style={{ ...inspectorBtn, color: '#fca5a5' }}>
          × Verwijder selectie uit rack
        </button>
      </aside>
    );
  }

  const slot = slots[0]!;
  const mod = modules.find((m) => m.id === slot.moduleId);
  if (!mod) {
    return (
      <aside style={inspectorBox}>
        <div style={{ color: '#fca5a5' }}>Module ontbreekt ({slot.moduleId})</div>
      </aside>
    );
  }
  return (
    <aside style={inspectorBox}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Module eigenschappen</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
        <span>Naam</span>
        <input value={mod.name}
               onChange={(e) => renameModule(mod.id, e.target.value)}
               style={{
                 fontSize: 12, padding: '3px 6px',
                 background: '#1e293b', color: '#e2e8f0',
                 border: '1px solid #334155', borderRadius: 3,
               }} />
      </label>
      <InspectorRow k="Type"      v={mod.typeId} />
      <InspectorRow k="HP"        v={String(mod.visual.hpWidth)} />
      <InspectorRow k="Rij"       v={String(slot.row + 1)} />
      <InspectorRow k="HP-offset" v={String(slot.hpOffset)} />
      <InspectorRow k="Module-id" v={mod.id} />
      <ModulePortsControls mod={mod} types={types} />
      <button onClick={deleteSelected} style={{ ...inspectorBtn, marginTop: 10, color: '#fca5a5' }}>
        × Verwijder uit rack
      </button>
    </aside>
  );
}

/** Toont de poorten en controls van de geselecteerde module. Klik op een
 *  regel om de details (signaaltype/richting resp. bereik/eenheid) uit te
 *  klappen — zo zie je in het rack óók de poort/control-eigenschappen. */
function ModulePortsControls({ mod, types }: { mod: ModuleInstance; types: ModuleType[] }): JSX.Element {
  const ports = resolvePorts(mod, types);
  const controls = resolveControls(mod, types);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string): void => setOpen((cur) => cur === key ? null : key);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', margin: '6px 0 3px' }}>
        Poorten ({ports.length})
      </div>
      {ports.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>Geen poorten.</div>}
      {ports.map((p) => {
        const key = `port:${p.id}`;
        const dot = SIGNAL_COLOUR_LOCAL(p.signalType);
        return (
          <div key={key}>
            <button onClick={() => toggle(key)} style={listRowBtn}>
              <span style={{ width: 8, height: 8, borderRadius: p.direction === 'in' ? 2 : 8,
                             background: dot, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              <span style={{ color: '#64748b', fontSize: 10 }}>{p.direction === 'in' ? 'in' : 'uit'}</span>
            </button>
            {open === key && (
              <div style={detailBox}>
                <InspectorRow k="Poort-id" v={p.id} />
                <InspectorRow k="Signaal"  v={SIGNAL_LABEL[p.signalType]} />
                <InspectorRow k="Richting" v={p.direction === 'in' ? 'ingang' : 'uitgang'} />
                {p.signalType === 'cv' && <InspectorRow k="CV-formaat" v={CV_FORMAT_LABEL[p.cvFormat ?? 'analog']} />}
                {p.eventKind && <InspectorRow k="Event"  v={p.eventKind === 'voice' ? 'per stem (poly)' : 'globaal'} />}
                {p.cellGroupId && <InspectorRow k="Celgroep" v={p.cellGroupId} />}
                {p.range && <InspectorRow k="Bereik" v={`${p.range.min}…${p.range.max} V${p.range.bipolar ? ' (bipolair)' : ''}`} />}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', margin: '10px 0 3px' }}>
        Controls ({controls.length})
      </div>
      {controls.length === 0 && <div style={{ fontSize: 11, color: '#64748b' }}>Geen controls.</div>}
      {controls.map((c) => {
        const key = `ctl:${c.id}`;
        return (
          <div key={key}>
            <button onClick={() => toggle(key)} style={listRowBtn}>
              <span style={{ flex: 1, textAlign: 'left' }}>{controlLabel(c)}</span>
              <span style={{ color: '#64748b', fontSize: 10 }}>{c.kind}</span>
            </button>
            {open === key && (
              <div style={detailBox}>
                <InspectorRow k="Control-id" v={c.id} />
                <InspectorRow k="Soort"      v={c.kind} />
                {controlDetailRows(c)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function controlLabel(c: Control): string {
  return ('label' in c && c.label) ? c.label : c.id;
}

function controlDetailRows(c: Control): JSX.Element {
  switch (c.kind) {
    case 'knob':
    case 'slider':
      return (
        <>
          <InspectorRow k="Bereik"  v={`${c.min}…${c.max}${c.unit ? ' ' + c.unit : ''}`} />
          <InspectorRow k="Default" v={String(c.defaultValue)} />
          {c.kind === 'knob' && c.step !== undefined && <InspectorRow k="Stap" v={String(c.step)} />}
        </>
      );
    case 'switch':
      return (
        <>
          <InspectorRow k="Posities" v={c.positions.join(' / ')} />
          <InspectorRow k="Default"  v={c.positions[c.defaultIndex] ?? String(c.defaultIndex)} />
        </>
      );
    case 'toggle':
      return <InspectorRow k="Default" v={c.defaultValue ? 'aan' : 'uit'} />;
    case 'button':
      return <InspectorRow k="Type" v={c.momentary ? 'momentary' : 'latch'} />;
    case 'display':
      return <InspectorRow k="Bindt aan" v={c.bindTo ?? '(statisch)'} />;
    default:
      return <></>;
  }
}

// Lokale kleur-helper zodat we geen extra import nodig hebben naast SIGNAL_LABEL.
function SIGNAL_COLOUR_LOCAL(t: Port['signalType']): string {
  const map: Record<string, string> = {
    cv: '#2563eb', gate: '#16a34a', trigger: '#eab308', audio: '#ea580c', midi: '#9333ea',
  };
  return map[t] ?? '#64748b';
}

const listRowBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
  background: '#0b1220', border: '1px solid #1e293b', borderRadius: 3,
  padding: '3px 6px', fontSize: 11, color: '#e2e8f0', cursor: 'pointer',
  marginBottom: 2,
};
const detailBox: React.CSSProperties = {
  background: '#0b1220', border: '1px solid #1e293b', borderRadius: 3,
  padding: '4px 6px', margin: '0 0 4px 8px',
};

function InspectorRow({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', fontSize: 12, gap: 8, padding: '2px 0' }}>
      <span style={{ width: 80, color: '#94a3b8', flexShrink: 0 }}>{k}</span>
      <span style={{ flex: 1, color: '#e2e8f0', wordBreak: 'break-all', fontFamily: 'monospace' }}>{v}</span>
    </div>
  );
}

const inspectorBox: React.CSSProperties = {
  width: 260, flexShrink: 0, alignSelf: 'stretch',
  background: '#0f172a', border: '1px solid #334155',
  borderRadius: 6, padding: 10, color: '#e2e8f0',
};
const inspectorBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #475569',
  borderRadius: 3, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
  color: '#e2e8f0',
};

function detectOverlap(slot: RackSlot, all: RackSlot[], mod: ModuleInstance, modules: ModuleInstance[]): boolean {
  const start = slot.hpOffset;
  const end   = start + mod.visual.hpWidth;
  for (const other of all) {
    if (other.id === slot.id) continue;
    const om = modules.find((x) => x.id === other.moduleId);
    if (!om) continue;
    const oStart = other.hpOffset;
    const oEnd   = oStart + om.visual.hpWidth;
    if (start < oEnd && end > oStart) return true;
  }
  return false;
}

// ── Voice groups (rack-level polyphony) ────────────────────────────────

function VoiceGroupsPanel({ rack, modules, types, openGroupId, setOpenGroupId }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
  openGroupId: string | null; setOpenGroupId: (id: string | null) => void;
}): JSX.Element {
  const groups = rack.polyGroups ?? [];

  function update(fn: (r: Rack) => Rack): void {
    updateProject((p) => ({ ...p, racks: p.racks.map((r) => r.id === rack.id ? fn(r) : r) }));
  }
  function addGroup(): void {
    const color = POLY_COLORS[groups.length % POLY_COLORS.length];
    const id = uid('pg');
    update((r) => ({
      ...r,
      polyGroups: [
        ...(r.polyGroups ?? []),
        { id, label: `Group ${groups.length + 1}`, voiceCount: 0, members: [], color },
      ],
    }));
    setOpenGroupId(id);
  }

  // Compact chip-bar. The popover for whichever group is open is rendered
  // inline; clicking outside (overlay) or the chip again closes it.
  return (
    <div style={{ margin: '6px 0 8px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
        <strong style={{ color: '#e2e8f0' }}>Voice groups</strong>
        <span style={{ color: '#64748b', fontSize: 11 }}>({groups.length})</span>
        {groups.map((g) => {
          const isOpen = openGroupId === g.id;
          return (
            <button key={g.id}
                    onClick={() => setOpenGroupId(isOpen ? null : g.id)}
                    title={`${g.label} — ${g.voiceCount} voice${g.voiceCount === 1 ? '' : 's'} (klik om te bewerken)`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', fontSize: 11,
                      background: isOpen ? '#1e293b' : '#0f172a',
                      color: '#e2e8f0',
                      border: `1px solid ${isOpen ? (g.color || '#64748b') : '#334155'}`,
                      borderRadius: 10, cursor: 'pointer',
                    }}>
              <span style={{
                width: 8, height: 8, borderRadius: 4,
                background: g.color || '#888', display: 'inline-block',
              }} />
              {g.label}
              <span style={{ color: '#94a3b8' }}>· {g.voiceCount}</span>
            </button>
          );
        })}
        <button onClick={addGroup} style={{ fontSize: 11, padding: '2px 8px' }}>+ Group</button>
        {groups.length === 0 && (
          <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 4 }}>
            Bundel N modules van hetzelfde type tot één polyfone stack (de eerste = master).
          </span>
        )}
      </div>
    </div>
  );
}

// Editor body for a single voice-group; rendered inside the chip-bar popover.
function GroupEditor({ rack, modules, types, group, onClose }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
  group: PolyGroup; onClose: () => void;
}): JSX.Element {
  function update(fn: (r: Rack) => Rack): void {
    updateProject((p) => ({ ...p, racks: p.racks.map((r) => r.id === rack.id ? fn(r) : r) }));
  }
  function updateGroup(fn: (g: PolyGroup) => PolyGroup): void {
    update((r) => ({
      ...r,
      polyGroups: (r.polyGroups ?? []).map((g) => g.id === group.id ? fn(g) : g),
    }));
  }
  function deleteGroup(): void {
    if (!confirm('Voice group verwijderen?')) return;
    update((r) => ({ ...r, polyGroups: (r.polyGroups ?? []).filter((g) => g.id !== group.id) }));
    onClose();
  }
  function addMember(moduleId: string): void {
    updateGroup((g) => {
      const m: PolyGroupMember = { kind: 'module', moduleId };
      const members = [...g.members, m];
      return { ...g, members, voiceCount: members.length };
    });
  }
  function removeMember(idx: number): void {
    updateGroup((g) => {
      const members = g.members.filter((_, i) => i !== idx);
      return { ...g, members, voiceCount: members.length };
    });
  }
  function moveMember(idx: number, dir: -1 | 1): void {
    updateGroup((g) => {
      const j = idx + dir;
      if (j < 0 || j >= g.members.length) return g;
      const members = [...g.members];
      const a = members[idx], b = members[j];
      if (!a || !b) return g;
      members[idx] = b;
      members[j]   = a;
      return { ...g, members };
    });
  }

  const memberOf = new Map<string, string>();
  for (const g of rack.polyGroups ?? []) {
    for (const m of g.members) if (m.kind === 'module') memberOf.set(m.moduleId, g.id);
  }
  const first = group.members[0];
  const anchor = first && first.kind === 'module'
    ? modules.find((m) => m.id === first.moduleId) : undefined;
  const anchorType = anchor ? types.find((t) => t.id === anchor.typeId) : undefined;
  const rackModuleIds = new Set(rack.slots.map((s) => s.moduleId));
  const cand = modules.filter((m) =>
    rackModuleIds.has(m.id) && !memberOf.has(m.id) &&
    (anchor ? m.typeId === anchor.typeId : true),
  );

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          background: group.color || '#888',
          border: '1px solid rgba(255,255,255,0.1)',
        }} />
        <input value={group.label}
               onChange={(e) => updateGroup((g) => ({ ...g, label: e.target.value }))}
               style={{ fontSize: 12, flex: 1, minWidth: 0, padding: '2px 4px' }} />
        <button onClick={deleteGroup} style={{ fontSize: 11, color: '#fca5a5', flexShrink: 0 }}>× Delete</button>
      </div>
      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 8 }}>
        {group.voiceCount} {group.voiceCount === 1 ? 'voice' : 'voices'}
        {anchorType ? ` · ${anchorType.variant}` : ' · (no anchor)'}
      </div>
      {group.members.length === 0 && (
        <div style={{ color: '#fbbf24', fontSize: 11, marginBottom: 6 }}>
          Lege group — voeg een module toe (de eerste wordt de master en bepaalt het type).
        </div>
      )}
      {group.members.length > 0 && (
        <ol style={{ margin: '0 0 6px 0', padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {group.members.map((mem, i) => {
            const mm = mem.kind === 'module' ? modules.find((m) => m.id === mem.moduleId) : undefined;
            const label = mm ? `${mm.name}${i === 0 ? '  ★ master' : ''}` : '(missing)';
            return (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ flex: 1, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {i + 1}: {label}
                </span>
                <button onClick={() => moveMember(i, -1)} disabled={i === 0}
                        style={{ fontSize: 10 }} title="Voice-index omhoog">↑</button>
                <button onClick={() => moveMember(i, 1)} disabled={i === group.members.length - 1}
                        style={{ fontSize: 10 }} title="Voice-index omlaag">↓</button>
                <button onClick={() => removeMember(i)}
                        style={{ fontSize: 10, color: '#fca5a5' }} title="Uit group halen">×</button>
              </li>
            );
          })}
        </ol>
      )}
      {cand.length > 0 ? (
        <select defaultValue="" onChange={(e) => {
          const v = e.target.value;
          e.currentTarget.value = '';
          if (v) addMember(v);
        }} style={{ fontSize: 11 }}>
          <option value="">+ Add voice…</option>
          {cand.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      ) : (
        group.members.length > 0 && (
          <div style={{ color: '#6b7280', fontSize: 11 }}>
            Geen vrije modules van type {anchorType?.variant ?? '?'} meer in dit rack.
          </div>
        )
      )}
    </div>
  );
}

// ── Sidebar: modules-niet-in-rack + plaats-knop ────────────────────────

function ModuleSidebar({ rack, modules, types, pickedRow, setPickedRow }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
  pickedRow: number; setPickedRow: (row: number) => void;
}): JSX.Element {
  const engineStatus = useEngineStatus();
  const inRack = new Set(rack.slots.map((s) => s.moduleId));
  // Interne racks tonen alleen internal modules; fysieke racks tonen ALLE
  // niet-geplaatste modules (inclusief internal) zodat NOISE/ECHO/PHASER
  // gewoon in een testpatch geplaatst kunnen worden.
  const wantInternal = rack.kind === 'internal';
  const available = modules.filter((m) =>
    !inRack.has(m.id) && (wantInternal ? m.internal : true),
  );

  function placeAt(moduleId: string, mod: ModuleInstance): void {
    const isInternal = rack.kind === 'internal';
    const row = isInternal ? 0 : pickedRow;
    // Find first free HP in chosen row
    const slotsInRow = rack.slots.filter((s) => s.row === row)
      .sort((a, b) => a.hpOffset - b.hpOffset);
    let offset = 0;
    for (const s of slotsInRow) {
      const sm = modules.find((m) => m.id === s.moduleId);
      const w = sm?.visual.hpWidth ?? 4;
      if (offset + mod.visual.hpWidth <= s.hpOffset) break;
      offset = Math.max(offset, s.hpOffset + w);
    }
    const needHp = offset + mod.visual.hpWidth;
    const newHpPerRow = isInternal ? Math.max(rack.hpPerRow, needHp) : rack.hpPerRow;
    if (!isInternal && needHp > rack.hpPerRow) {
      alert('Geen ruimte op deze rij — kies een andere rij of verhoog HP/rij.');
      return;
    }
    const slot: RackSlot = { id: uid('slot'), moduleId, row, hpOffset: offset };
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id === rack.id
        ? { ...r, hpPerRow: newHpPerRow, slots: [...r.slots, slot] } : r),
    }));
  }

  return (
    <section style={{
      marginTop: 12, border: '1px solid #cbd2d9', borderRadius: 6,
      padding: 10, background: '#ffffff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#374151' }}>
          {wantInternal ? 'Brain-modules niet geplaatst' : 'Modules niet in rack'} ({available.length})
        </h3>
        {!wantInternal && (
          <label style={{ fontSize: 12, marginLeft: 'auto' }}>
            Plaats in rij:
            <select value={pickedRow} onChange={(e) => setPickedRow(Number(e.target.value))}
                    style={{ marginLeft: 4, fontSize: 12 }}>
              {Array.from({ length: rack.rows }).map((_, i) =>
                <option key={i} value={i}>{i + 1}</option>)}
            </select>
          </label>
        )}
        {wantInternal && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>
            Interne modules worden automatisch achteraan toegevoegd; HP groeit mee.
          </span>
        )}
      </div>

      {available.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          {wantInternal
            ? 'Geen losse brain-modules. Klik "✨ Internals" in de project-balk om AHDSR/LFO/S&H te seeden.'
            : 'Alle modules zijn al geplaatst. Maak nieuwe modules aan in de Modules-tab.'}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {available.map((m) => {
          const t = types.find((x) => x.id === m.typeId);
          return (
            <div key={m.id} style={{
              border: '1px solid #cbd2d9', borderRadius: 4, padding: 6,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ background: '#1f2937', borderRadius: 3 }}>
                <ModulePanel module={m} types={types} pxPerMm={1.2} showPortLabels={false}
                  controlState={engineStatus.liveControls[m.id]} />
              </div>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{m.name}</div>
                <div style={{ color: '#6b7280' }}>{t?.variant ?? '?'} · {m.visual.hpWidth} HP</div>
                <button onClick={() => placeAt(m.id, m)} style={{ fontSize: 11, marginTop: 4 }}>
                  Plaats →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
