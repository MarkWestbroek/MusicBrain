// Rack tab — manage racks (3U Eurorack rows × HP). Place modules into
// rows at HP offsets; show the rack as a horizontal strip per row with
// the actual SVG panels rendered inside.
//
// Conflicts (overlap, off-row) are detected and surfaced as red borders.

import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import {
  type Rack, type RackSlot, type Module, type ModuleType,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';

const PX_PER_MM = 2.2;

export function RackPanel(): JSX.Element {
  const project = useModularProject();
  const racks = project.racks;
  const activeId = project.activeRackId ?? racks[0]?.id;
  const rack = racks.find((r) => r.id === activeId) ?? racks[0];

  function addRack(): void {
    const r: Rack = {
      id: uid('rack'),
      name: `Rack ${racks.length + 1}`,
      rows: 3, hpPerRow: 84,
      slots: [],
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
        <button onClick={() => removeRack(rack.id)} style={{ fontSize: 12 }}>− Rack</button>
        <span style={{ flex: 1 }} />
        <RackHeaderEditor rack={rack} />
      </div>

      <RackGrid rack={rack} modules={project.modules} types={project.moduleTypes} />

      <ModuleSidebar rack={rack} modules={project.modules} types={project.moduleTypes} />
    </div>
  );
}

// ── Header (name/rows/HP) ──────────────────────────────────────────────

function RackHeaderEditor({ rack }: { rack: Rack }): JSX.Element {
  function update(fn: (r: Rack) => Rack): void {
    updateProject((p) => ({ ...p, racks: p.racks.map((r) => r.id === rack.id ? fn(r) : r) }));
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

function RackGrid({ rack, modules, types }: {
  rack: Rack; modules: Module[]; types: ModuleType[];
}): JSX.Element {
  const rowWidthMm = rack.hpPerRow * MM_PER_HP;

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
        return (
          <div key={rowIdx} style={{
            position: 'relative',
            width: rowWidthMm * PX_PER_MM,
            height: PANEL_HEIGHT_MM * PX_PER_MM,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 3,
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
              return (
                <div key={slot.id} style={{
                  position: 'absolute',
                  left: slot.hpOffset * MM_PER_HP * PX_PER_MM,
                  top: 0,
                  outline: overlap ? '2px solid #dc2626' : 'none',
                  outlineOffset: -2,
                }}>
                  <ModulePanel module={m} types={types} pxPerMm={PX_PER_MM} showPortLabels={false} />
                  {/* Slot toolbar */}
                  <div style={{
                    position: 'absolute', top: 2, right: 2,
                    display: 'flex', gap: 2,
                    background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: 1,
                  }}>
                    <button title="← HP" onClick={() => moveSlot(slot.id, -1)} style={slotBtn}>◀</button>
                    <button title="→ HP" onClick={() => moveSlot(slot.id,  1)} style={slotBtn}>▶</button>
                    <button title="↑ rij" onClick={() => moveRow(slot.id, -1)} style={slotBtn}>▲</button>
                    <button title="↓ rij" onClick={() => moveRow(slot.id,  1)} style={slotBtn}>▼</button>
                    <button title="Verwijder uit rack" onClick={() => removeSlot(slot.id)} style={slotBtn}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function detectOverlap(slot: RackSlot, all: RackSlot[], mod: Module, modules: Module[]): boolean {
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

// ── Sidebar: modules-niet-in-rack + plaats-knop ────────────────────────

function ModuleSidebar({ rack, modules, types }: {
  rack: Rack; modules: Module[]; types: ModuleType[];
}): JSX.Element {
  const inRack = new Set(rack.slots.map((s) => s.moduleId));
  const available = modules.filter((m) => !inRack.has(m.id));
  const [pickedRow, setPickedRow] = useState(0);

  function placeAt(moduleId: string, mod: Module): void {
    // Find first free HP in chosen row
    const slotsInRow = rack.slots.filter((s) => s.row === pickedRow)
      .sort((a, b) => a.hpOffset - b.hpOffset);
    let offset = 0;
    for (const s of slotsInRow) {
      const sm = modules.find((m) => m.id === s.moduleId);
      const w = sm?.visual.hpWidth ?? 4;
      if (offset + mod.visual.hpWidth <= s.hpOffset) break;
      offset = Math.max(offset, s.hpOffset + w);
    }
    if (offset + mod.visual.hpWidth > rack.hpPerRow) {
      alert('Geen ruimte op deze rij — kies een andere rij.');
      return;
    }
    const slot: RackSlot = {
      id: uid('slot'), moduleId, row: pickedRow, hpOffset: offset,
    };
    updateProject((p) => ({
      ...p,
      racks: p.racks.map((r) => r.id === rack.id
        ? { ...r, slots: [...r.slots, slot] } : r),
    }));
  }

  return (
    <section style={{
      marginTop: 12, border: '1px solid #cbd2d9', borderRadius: 6,
      padding: 10, background: '#ffffff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#374151' }}>
          Modules niet in rack ({available.length})
        </h3>
        <label style={{ fontSize: 12, marginLeft: 'auto' }}>
          Plaats in rij:
          <select value={pickedRow} onChange={(e) => setPickedRow(Number(e.target.value))}
                  style={{ marginLeft: 4, fontSize: 12 }}>
            {Array.from({ length: rack.rows }).map((_, i) =>
              <option key={i} value={i}>{i + 1}</option>)}
          </select>
        </label>
      </div>

      {available.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Alle modules zijn al geplaatst. Maak nieuwe modules aan in de Modules-tab.
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
                <ModulePanel module={m} types={types} pxPerMm={1.2} showPortLabels={false} />
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

const slotBtn: React.CSSProperties = {
  fontSize: 10, padding: '0 4px', border: 'none',
  background: '#475569', color: 'white', cursor: 'pointer', borderRadius: 2,
};
