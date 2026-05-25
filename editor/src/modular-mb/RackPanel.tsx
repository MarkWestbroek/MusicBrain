// Rack tab — manage racks (3U Eurorack rows × HP). Place modules into
// rows at HP offsets; show the rack as a horizontal strip per row with
// the actual SVG panels rendered inside.
//
// Conflicts (overlap, off-row) are detected and surfaced as red borders.

import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { useEngineStatus } from './sim/engineSingleton';
import {
  type Rack, type RackSlot, type ModuleInstance, type ModuleType,
  type PolyGroup, type PolyGroupMember,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';

const PX_PER_MM = 2.2;

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

      <VoiceGroupsPanel rack={rack} modules={project.modules} types={project.moduleTypes} />

      <RackGrid
        rack={rack} modules={project.modules} types={project.moduleTypes}
        activeRow={activeRow} onSelectRow={setActiveRow}
      />

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
  if (rack.kind === 'internal') {
    // Interne racks groeien automatisch — alleen naam-edit, geen rows/HP-knoppen.
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
        <label>Naam:
          <input value={rack.name}
                 onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
                 style={{ marginLeft: 4, fontSize: 12, width: 160 }} />
        </label>
        <span style={{ color: '#6b7280' }}>auto-grow • nu {rack.hpPerRow} HP</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <label>Naam:
        <input value={rack.name}
               onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
               style={{ marginLeft: 4, fontSize: 12, width: 120 }} />
      </label>
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
    </div>
  );
}

// ── Rack visual grid ───────────────────────────────────────────────────

function RackGrid({ rack, modules, types, activeRow, onSelectRow }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
  activeRow: number; onSelectRow: (row: number) => void;
}): JSX.Element {
  const rowWidthMm = rack.hpPerRow * MM_PER_HP;
  const engineStatus = useEngineStatus();
  const voiceMap = buildVoiceMap(rack);

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
      alert('Geen vrije ruimte voor duplicaat in dit rack — voeg eerst een rij of HP toe.');
      return;
    }
    const newSlot: RackSlot = { id: uid('slot'), moduleId: newMod.id, row, hpOffset: offset };
    updateProject((p) => ({
      ...p,
      modules: [...p.modules, newMod],
      racks: p.racks.map((r) => r.id === rack.id ? { ...r, slots: [...r.slots, newSlot] } : r),
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
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r,
        slots: r.slots.map((s) => s.id === slotId
          ? { ...s, hpOffset: Math.max(0, Math.min(r.hpPerRow - 1, s.hpOffset + deltaHp)) }
          : s),
      })),
    }));
  }

  function moveRow(slotId: string, deltaRow: number): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r,
        slots: r.slots.map((s) => s.id === slotId
          ? { ...s, row: Math.max(0, Math.min(r.rows - 1, s.row + deltaRow)) }
          : s),
      })),
    }));
  }

  function setSlotPosition(slotId: string, row: number, hpOffset: number): void {
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id !== rack.id ? r : ({
        ...r,
        slots: r.slots.map((s) => s.id === slotId
          ? {
              ...s,
              row: Math.max(0, Math.min(r.rows - 1, row)),
              hpOffset: Math.max(0, Math.min(r.hpPerRow - 1, hpOffset)),
            }
          : s),
      })),
    }));
  }

  // Context-menu voor module-strip (rechter-muis op een slot).
  const [menu, setMenu] = useState<{ x: number; y: number; slotId: string } | null>(null);
  // Geselecteerde slot voor toetsenbordnavigatie + visuele highlight.
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  function onSlotKeyDown(e: React.KeyboardEvent<HTMLDivElement>, slotId: string): void {
    const big = e.shiftKey ? 4 : 1;
    let handled = true;
    if (e.key === 'ArrowLeft')       moveSlot(slotId, -big);
    else if (e.key === 'ArrowRight') moveSlot(slotId,  big);
    else if (e.key === 'ArrowUp')    moveRow(slotId, -1);
    else if (e.key === 'ArrowDown')  moveRow(slotId,  1);
    else if (e.key === 'Delete')     removeSlot(slotId);
    else handled = false;
    if (handled) {
      e.preventDefault();
      // Houd focus op de slot-wrapper zodat herhaalde pijltjes blijven werken.
      const el = e.currentTarget;
      requestAnimationFrame(() => el.focus());
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: 6, background: '#0f172a', borderRadius: 6,
      overflowX: 'auto',
    }}>
      {Array.from({ length: rack.rows }).map((_, rowIdx) => {
        const slotsInRow = rack.slots
          .filter((s) => s.row === rowIdx)
          .sort((a, b) => a.hpOffset - b.hpOffset);
        const isActive = rowIdx === activeRow;
        return (
          <div key={rowIdx}
               onClick={() => onSelectRow(rowIdx)}
               onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
               onDrop={(e) => {
                 e.preventDefault();
                 const slotId = e.dataTransfer.getData('text/slot-id');
                 if (!slotId) return;
                 const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                 const xPx = e.clientX - rect.left;
                 const hp = Math.max(0, Math.round(xPx / (MM_PER_HP * PX_PER_MM)));
                 setSlotPosition(slotId, rowIdx, hp);
               }}
               title={`Rij ${rowIdx + 1} — klik om als actieve rij te kiezen (volgende ‘Plaats →’ komt hierheen)`}
               style={{
            position: 'relative',
            width: rowWidthMm * PX_PER_MM,
            height: PANEL_HEIGHT_MM * PX_PER_MM,
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
                left: (i + 1) * 10 * MM_PER_HP * PX_PER_MM,
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
                    left: slot.hpOffset * MM_PER_HP * PX_PER_MM,
                    top: 0,
                    height: PANEL_HEIGHT_MM * PX_PER_MM,
                    width: 60,
                    background: '#dc2626',
                    color: 'white', fontSize: 10, padding: 4,
                  }}>
                    Missing<br/>{slot.moduleId}
                  </div>
                );
              }
              const overlap = detectOverlap(slot, slotsInRow, m, modules);
              const isSelected = selectedSlotId === slot.id;
              const voice = voiceMap.get(m.id);
              return (
                <div key={slot.id}
                  tabIndex={0}
                  data-slot-id={slot.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSlotId(slot.id);
                    onSelectRow(rowIdx);
                  }}
                  onFocus={() => setSelectedSlotId(slot.id)}
                  onKeyDown={(e) => onSlotKeyDown(e, slot.id)}
                  style={{
                  position: 'absolute',
                  left: slot.hpOffset * MM_PER_HP * PX_PER_MM,
                  top: 0,
                  outline: overlap
                    ? '2px solid #dc2626'
                    : isSelected ? '2px solid #fbbf24' : 'none',
                  outlineOffset: -2,
                  boxShadow: isSelected ? '0 0 14px rgba(251,191,36,0.55)' : undefined,
                  cursor: 'pointer',
                }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ x: e.clientX, y: e.clientY, slotId: slot.id });
                  }}
                >
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
                  <ModulePanel module={m} types={types} pxPerMm={PX_PER_MM} showPortLabels={false}
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
                        V{voice.voiceIndex + 1}/{voice.group.voiceCount}
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
      {menu && (
        <div
          onClick={() => setMenu(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
          }}
        >
          <ul
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: menu.x, top: menu.y,
              listStyle: 'none', margin: 0, padding: 4,
              background: '#0f172a', border: '1px solid #334155',
              borderRadius: 4, minWidth: 160, fontSize: 12,
              color: '#e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            }}
          >
            <li><button style={ctxItem} onClick={() => { duplicateSlot(menu.slotId); setMenu(null); }}>⎘ Dupliceer module</button></li>
            <li><button style={ctxItem} onClick={() => { moveRow(menu.slotId, -1); setMenu(null); }}>▲ Rij omhoog</button></li>
            <li><button style={ctxItem} onClick={() => { moveRow(menu.slotId,  1); setMenu(null); }}>▼ Rij omlaag</button></li>
            <li><button style={ctxItem} onClick={() => { moveSlot(menu.slotId, -1); setMenu(null); }}>◀ 1 HP naar links</button></li>
            <li><button style={ctxItem} onClick={() => { moveSlot(menu.slotId,  1); setMenu(null); }}>▶ 1 HP naar rechts</button></li>
            <li><button style={{ ...ctxItem, color: '#fca5a5' }} onClick={() => { removeSlot(menu.slotId); setMenu(null); }}>× Verwijder uit rack</button></li>
          </ul>
        </div>
      )}
    </div>
  );
}

const ctxItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '4px 8px', background: 'transparent', color: 'inherit',
  border: 'none', cursor: 'pointer', fontSize: 12,
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

function VoiceGroupsPanel({ rack, modules, types }: {
  rack: Rack; modules: ModuleInstance[]; types: ModuleType[];
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
  }
  function deleteGroup(id: string): void {
    if (!confirm('Voice group verwijderen?')) return;
    update((r) => ({ ...r, polyGroups: (r.polyGroups ?? []).filter((g) => g.id !== id) }));
  }
  function updateGroup(id: string, fn: (g: PolyGroup) => PolyGroup): void {
    update((r) => ({
      ...r,
      polyGroups: (r.polyGroups ?? []).map((g) => g.id === id ? fn(g) : g),
    }));
  }
  function addMember(groupId: string, moduleId: string): void {
    updateGroup(groupId, (g) => {
      const m: PolyGroupMember = { kind: 'module', moduleId };
      const members = [...g.members, m];
      return { ...g, members, voiceCount: members.length };
    });
  }
  function removeMember(groupId: string, idx: number): void {
    updateGroup(groupId, (g) => {
      const members = g.members.filter((_, i) => i !== idx);
      return { ...g, members, voiceCount: members.length };
    });
  }
  function moveMember(groupId: string, idx: number, dir: -1 | 1): void {
    updateGroup(groupId, (g) => {
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

  // Welke modules zijn al lid van een group (in dit rack)?
  const memberOf = new Map<string, string>();   // moduleId -> groupId
  for (const g of groups) {
    for (const m of g.members) {
      if (m.kind === 'module') memberOf.set(m.moduleId, g.id);
    }
  }

  function candidates(g: PolyGroup): ModuleInstance[] {
    const rackModuleIds = new Set(rack.slots.map((s) => s.moduleId));
    const first = g.members[0];
    const anchorTypeId = first && first.kind === 'module'
      ? modules.find((m) => m.id === first.moduleId)?.typeId
      : undefined;
    return modules.filter((m) =>
      rackModuleIds.has(m.id) &&
      !memberOf.has(m.id) &&
      (anchorTypeId ? m.typeId === anchorTypeId : true),
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ margin: '6px 0 8px', fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={addGroup} style={{ fontSize: 12 }}>+ Voice group</button>
        <span>Bundel N modules van hetzelfde type tot één polyfone stack (de eerste = master).</span>
      </div>
    );
  }

  return (
    <div style={{ margin: '6px 0 8px', padding: 8, background: '#1e293b', borderRadius: 4, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ color: '#e2e8f0' }}>Voice groups</strong>
        <span style={{ color: '#64748b', fontSize: 11 }}>({groups.length})</span>
        <button onClick={addGroup} style={{ fontSize: 12 }}>+ Group</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {groups.map((g) => {
          const first = g.members[0];
          const anchor = first && first.kind === 'module'
            ? modules.find((m) => m.id === first.moduleId)
            : undefined;
          const anchorType = anchor ? types.find((t) => t.id === anchor.typeId) : undefined;
          const cand = candidates(g);
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 6, background: '#0f172a', borderRadius: 3 }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3,
                background: g.color || '#888', flexShrink: 0, marginTop: 3,
                border: '1px solid rgba(255,255,255,0.1)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <input value={g.label}
                         onChange={(e) => updateGroup(g.id, (gg) => ({ ...gg, label: e.target.value }))}
                         style={{ fontSize: 12, width: 140 }} />
                  <span style={{ color: '#9ca3af', fontSize: 11 }}>
                    {g.voiceCount} {g.voiceCount === 1 ? 'voice' : 'voices'}
                    {anchorType ? ` · ${anchorType.variant}` : ' · (no anchor yet)'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => deleteGroup(g.id)} style={{ fontSize: 11, color: '#fca5a5' }}>× Delete</button>
                </div>
                {g.members.length === 0 && (
                  <div style={{ color: '#fbbf24', fontSize: 11, marginBottom: 4 }}>
                    Lege group — voeg een module toe (de eerste wordt de master en bepaalt het type).
                  </div>
                )}
                {g.members.length > 0 && (
                  <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {g.members.map((mem, i) => {
                      const mm = mem.kind === 'module' ? modules.find((m) => m.id === mem.moduleId) : undefined;
                      const label = mm ? `${mm.name}${i === 0 ? '  ★ master' : ''}` : '(missing)';
                      return (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ flex: 1, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            V{i + 1}: {label}
                          </span>
                          <button onClick={() => moveMember(g.id, i, -1)} disabled={i === 0}
                                  style={{ fontSize: 10 }} title="Voice-index omhoog">↑</button>
                          <button onClick={() => moveMember(g.id, i, 1)} disabled={i === g.members.length - 1}
                                  style={{ fontSize: 10 }} title="Voice-index omlaag">↓</button>
                          <button onClick={() => removeMember(g.id, i)}
                                  style={{ fontSize: 10, color: '#fca5a5' }} title="Uit group halen">×</button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {cand.length > 0 ? (
                  <div style={{ marginTop: 4 }}>
                    <select defaultValue="" onChange={(e) => {
                      const v = e.target.value;
                      e.currentTarget.value = '';
                      if (v) addMember(g.id, v);
                    }} style={{ fontSize: 11 }}>
                      <option value="">+ Add voice…</option>
                      {cand.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                ) : (
                  g.members.length > 0 && (
                    <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                      Geen vrije modules van type {anchorType?.variant ?? '?'} meer in dit rack.
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
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
