import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Rack tab — manage racks (3U Eurorack rows × HP). Place modules into
// rows at HP offsets; show the rack as a horizontal strip per row with
// the actual SVG panels rendered inside.
//
// Conflicts (overlap, off-row) are detected and surfaced as red borders.
import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import { useEngineStatus } from './sim/engineSingleton';
import { MM_PER_HP, PANEL_HEIGHT_MM, } from './types';
const PX_PER_MM = 2.2;
export function RackPanel() {
    const project = useModularProject();
    const engineStatus = useEngineStatus();
    const racks = project.racks;
    const activeId = project.activeRackId ?? racks[0]?.id;
    const rack = racks.find((r) => r.id === activeId) ?? racks[0];
    const [activeRow, setActiveRow] = useState(0);
    function addRack() {
        const r = {
            id: uid('rack'),
            name: `Rack ${racks.length + 1}`,
            rows: 3, hpPerRow: 84,
            slots: [],
            kind: 'physical',
        };
        updateProject((p) => ({ ...p, racks: [...p.racks, r], activeRackId: r.id }));
    }
    function addInternalRack() {
        const existing = racks.find((r) => r.kind === 'internal');
        if (existing) {
            updateProject((p) => ({ ...p, activeRackId: existing.id }));
            return;
        }
        const r = {
            id: uid('rack'),
            name: 'MMB Brain (intern)',
            description: 'Virtueel rack voor brain-modules; groeit automatisch mee.',
            rows: 1, hpPerRow: 64, slots: [], kind: 'internal',
        };
        updateProject((p) => ({ ...p, racks: [...p.racks, r], activeRackId: r.id }));
    }
    function removeRack(id) {
        if (racks.length <= 1) {
            alert('Tenminste één rack moet bestaan.');
            return;
        }
        if (!confirm('Rack verwijderen? Patches die ernaar verwijzen blijven over.'))
            return;
        updateProject((p) => ({
            ...p,
            racks: p.racks.filter((r) => r.id !== id),
            activeRackId: p.activeRackId === id ? p.racks.find((r) => r.id !== id)?.id : p.activeRackId,
        }));
    }
    if (!rack) {
        return (_jsxs("div", { children: [_jsx("button", { onClick: addRack, children: "+ Rack" }), _jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Geen racks. Maak er een aan." })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Rack:", _jsx("select", { value: rack.id, onChange: (e) => updateProject((p) => ({ ...p, activeRackId: e.target.value })), style: { marginLeft: 4, fontSize: 12 }, children: racks.map((r) => _jsx("option", { value: r.id, children: r.name }, r.id)) })] }), _jsx("button", { onClick: addRack, style: { fontSize: 12 }, children: "+ Rack" }), _jsx("button", { onClick: addInternalRack, style: { fontSize: 12 }, title: "Maak/activeer het MMB Brain (intern) rack", children: "+ Intern" }), _jsx("button", { onClick: () => removeRack(rack.id), style: { fontSize: 12 }, children: "\u2212 Rack" }), _jsx("span", { style: { flex: 1 } }), _jsx("span", { style: {
                            fontSize: 11, padding: '2px 6px', borderRadius: 10,
                            background: rack.kind === 'internal' ? '#1d4ed8' : '#475569',
                            color: 'white',
                        }, title: rack.kind === 'internal' ? 'Virtueel rack — groeit mee, geen HP-budget' : 'Fysiek rack — HP-budget telt', children: rack.kind === 'internal' ? 'INTERN' : 'FYSIEK' }), _jsx(RackHeaderEditor, { rack: rack })] }), _jsx(RackGrid, { rack: rack, modules: project.modules, types: project.moduleTypes, activeRow: activeRow, onSelectRow: setActiveRow }), _jsx(ModuleSidebar, { rack: rack, modules: project.modules, types: project.moduleTypes, pickedRow: activeRow, setPickedRow: setActiveRow })] }));
}
// ── Header (name/rows/HP) ──────────────────────────────────────────────
function RackHeaderEditor({ rack }) {
    function update(fn) {
        updateProject((p) => ({ ...p, racks: p.racks.map((r) => r.id === rack.id ? fn(r) : r) }));
    }
    if (rack.kind === 'internal') {
        // Interne racks groeien automatisch — alleen naam-edit, geen rows/HP-knoppen.
        return (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }, children: [_jsxs("label", { children: ["Naam:", _jsx("input", { value: rack.name, onChange: (e) => update((r) => ({ ...r, name: e.target.value })), style: { marginLeft: 4, fontSize: 12, width: 160 } })] }), _jsxs("span", { style: { color: '#6b7280' }, children: ["auto-grow \u2022 nu ", rack.hpPerRow, " HP"] })] }));
    }
    return (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }, children: [_jsxs("label", { children: ["Naam:", _jsx("input", { value: rack.name, onChange: (e) => update((r) => ({ ...r, name: e.target.value })), style: { marginLeft: 4, fontSize: 12, width: 120 } })] }), _jsxs("label", { children: ["Rijen:", _jsx("input", { type: "number", min: 1, max: 6, value: rack.rows, onChange: (e) => update((r) => ({ ...r, rows: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })), style: { marginLeft: 4, fontSize: 12, width: 50 } })] }), _jsxs("label", { children: ["HP/rij:", _jsx("input", { type: "number", min: 20, max: 168, value: rack.hpPerRow, onChange: (e) => update((r) => ({ ...r, hpPerRow: Math.max(20, Math.min(168, Number(e.target.value) || 84)) })), style: { marginLeft: 4, fontSize: 12, width: 60 } })] })] }));
}
// ── Rack visual grid ───────────────────────────────────────────────────
function RackGrid({ rack, modules, types, activeRow, onSelectRow }) {
    const rowWidthMm = rack.hpPerRow * MM_PER_HP;
    const engineStatus = useEngineStatus();
    function duplicateSlot(slotId) {
        const slot = rack.slots.find((s) => s.id === slotId);
        if (!slot)
            return;
        const src = modules.find((m) => m.id === slot.moduleId);
        if (!src)
            return;
        const newMod = {
            ...src,
            id: uid('mod'),
            name: `${src.name} copy`,
        };
        // Find next free HP slot in same row, fallback to subsequent rows.
        const placeInRow = (row, w) => {
            const rowSlots = rack.slots.filter((s) => s.row === row).sort((a, b) => a.hpOffset - b.hpOffset);
            let off = 0;
            for (const s of rowSlots) {
                const sm = modules.find((m) => m.id === s.moduleId);
                const sw = sm?.visual.hpWidth ?? 4;
                if (off + w <= s.hpOffset)
                    return off;
                off = Math.max(off, s.hpOffset + sw);
            }
            return off + w <= rack.hpPerRow ? off : null;
        };
        let row = slot.row, offset = null;
        for (let r = slot.row; r < rack.rows; r++) {
            const o = placeInRow(r, newMod.visual.hpWidth);
            if (o !== null) {
                row = r;
                offset = o;
                break;
            }
        }
        if (offset === null) {
            alert('Geen vrije ruimte voor duplicaat in dit rack — voeg eerst een rij of HP toe.');
            return;
        }
        const newSlot = { id: uid('slot'), moduleId: newMod.id, row, hpOffset: offset };
        updateProject((p) => ({
            ...p,
            modules: [...p.modules, newMod],
            racks: p.racks.map((r) => r.id === rack.id ? { ...r, slots: [...r.slots, newSlot] } : r),
        }));
    }
    function removeSlot(slotId) {
        updateProject((p) => ({
            ...p,
            racks: p.racks.map((r) => r.id === rack.id
                ? { ...r, slots: r.slots.filter((s) => s.id !== slotId) } : r),
        }));
    }
    function moveSlot(slotId, deltaHp) {
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
    function moveRow(slotId, deltaRow) {
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
    function setSlotPosition(slotId, row, hpOffset) {
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
    const [menu, setMenu] = useState(null);
    // Geselecteerde slot voor toetsenbordnavigatie + visuele highlight.
    const [selectedSlotId, setSelectedSlotId] = useState(null);
    function onSlotKeyDown(e, slotId) {
        const big = e.shiftKey ? 4 : 1;
        let handled = true;
        if (e.key === 'ArrowLeft')
            moveSlot(slotId, -big);
        else if (e.key === 'ArrowRight')
            moveSlot(slotId, big);
        else if (e.key === 'ArrowUp')
            moveRow(slotId, -1);
        else if (e.key === 'ArrowDown')
            moveRow(slotId, 1);
        else if (e.key === 'Delete')
            removeSlot(slotId);
        else
            handled = false;
        if (handled) {
            e.preventDefault();
            // Houd focus op de slot-wrapper zodat herhaalde pijltjes blijven werken.
            const el = e.currentTarget;
            requestAnimationFrame(() => el.focus());
        }
    }
    return (_jsxs("div", { style: {
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: 6, background: '#0f172a', borderRadius: 6,
            overflowX: 'auto',
        }, children: [Array.from({ length: rack.rows }).map((_, rowIdx) => {
                const slotsInRow = rack.slots
                    .filter((s) => s.row === rowIdx)
                    .sort((a, b) => a.hpOffset - b.hpOffset);
                const isActive = rowIdx === activeRow;
                return (_jsxs("div", { onClick: () => onSelectRow(rowIdx), onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, onDrop: (e) => {
                        e.preventDefault();
                        const slotId = e.dataTransfer.getData('text/slot-id');
                        if (!slotId)
                            return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const xPx = e.clientX - rect.left;
                        const hp = Math.max(0, Math.round(xPx / (MM_PER_HP * PX_PER_MM)));
                        setSlotPosition(slotId, rowIdx, hp);
                    }, title: `Rij ${rowIdx + 1} — klik om als actieve rij te kiezen (volgende ‘Plaats →’ komt hierheen)`, style: {
                        position: 'relative',
                        width: rowWidthMm * PX_PER_MM,
                        height: PANEL_HEIGHT_MM * PX_PER_MM,
                        background: '#1e293b',
                        border: isActive ? '2px solid #2563eb' : '1px solid #334155',
                        boxShadow: isActive ? '0 0 0 1px #1d4ed8 inset' : undefined,
                        borderRadius: 3,
                        cursor: 'pointer',
                    }, children: [Array.from({ length: Math.floor(rack.hpPerRow / 10) }).map((_, i) => (_jsx("div", { style: {
                                position: 'absolute',
                                left: (i + 1) * 10 * MM_PER_HP * PX_PER_MM,
                                top: 0, bottom: 0,
                                width: 1, background: '#334155', opacity: 0.6,
                            } }, i))), slotsInRow.map((slot) => {
                            const m = modules.find((x) => x.id === slot.moduleId);
                            if (!m) {
                                return (_jsxs("div", { style: {
                                        position: 'absolute',
                                        left: slot.hpOffset * MM_PER_HP * PX_PER_MM,
                                        top: 0,
                                        height: PANEL_HEIGHT_MM * PX_PER_MM,
                                        width: 60,
                                        background: '#dc2626',
                                        color: 'white', fontSize: 10, padding: 4,
                                    }, children: ["Missing", _jsx("br", {}), slot.moduleId] }, slot.id));
                            }
                            const overlap = detectOverlap(slot, slotsInRow, m, modules);
                            const isSelected = selectedSlotId === slot.id;
                            return (_jsxs("div", { tabIndex: 0, "data-slot-id": slot.id, onClick: (e) => {
                                    e.stopPropagation();
                                    setSelectedSlotId(slot.id);
                                    onSelectRow(rowIdx);
                                }, onFocus: () => setSelectedSlotId(slot.id), onKeyDown: (e) => onSlotKeyDown(e, slot.id), style: {
                                    position: 'absolute',
                                    left: slot.hpOffset * MM_PER_HP * PX_PER_MM,
                                    top: 0,
                                    outline: overlap
                                        ? '2px solid #dc2626'
                                        : isSelected ? '2px solid #fbbf24' : 'none',
                                    outlineOffset: -2,
                                    boxShadow: isSelected ? '0 0 14px rgba(251,191,36,0.55)' : undefined,
                                    cursor: 'pointer',
                                }, onContextMenu: (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setMenu({ x: e.clientX, y: e.clientY, slotId: slot.id });
                                }, children: [_jsx("div", { draggable: true, onDragStart: (e) => {
                                            e.dataTransfer.setData('text/slot-id', slot.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                        }, title: "Sleep om te verplaatsen (HP / rij)", style: {
                                            position: 'absolute', left: 0, right: 0, top: 0,
                                            height: 8, background: 'rgba(37,99,235,0.55)',
                                            cursor: 'grab', borderTopLeftRadius: 2, borderTopRightRadius: 2,
                                            zIndex: 2,
                                        } }), _jsx(ModulePanel, { module: m, types: types, pxPerMm: PX_PER_MM, showPortLabels: false, controlState: engineStatus.liveControls[m.id] })] }, slot.id));
                        })] }, rowIdx));
            }), menu && (_jsx("div", { onClick: () => setMenu(null), style: {
                    position: 'fixed', inset: 0, zIndex: 999,
                }, children: _jsxs("ul", { onClick: (e) => e.stopPropagation(), style: {
                        position: 'fixed', left: menu.x, top: menu.y,
                        listStyle: 'none', margin: 0, padding: 4,
                        background: '#0f172a', border: '1px solid #334155',
                        borderRadius: 4, minWidth: 160, fontSize: 12,
                        color: '#e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                    }, children: [_jsx("li", { children: _jsx("button", { style: ctxItem, onClick: () => { duplicateSlot(menu.slotId); setMenu(null); }, children: "\u2398 Dupliceer module" }) }), _jsx("li", { children: _jsx("button", { style: ctxItem, onClick: () => { moveRow(menu.slotId, -1); setMenu(null); }, children: "\u25B2 Rij omhoog" }) }), _jsx("li", { children: _jsx("button", { style: ctxItem, onClick: () => { moveRow(menu.slotId, 1); setMenu(null); }, children: "\u25BC Rij omlaag" }) }), _jsx("li", { children: _jsx("button", { style: ctxItem, onClick: () => { moveSlot(menu.slotId, -1); setMenu(null); }, children: "\u25C0 1 HP naar links" }) }), _jsx("li", { children: _jsx("button", { style: ctxItem, onClick: () => { moveSlot(menu.slotId, 1); setMenu(null); }, children: "\u25B6 1 HP naar rechts" }) }), _jsx("li", { children: _jsx("button", { style: { ...ctxItem, color: '#fca5a5' }, onClick: () => { removeSlot(menu.slotId); setMenu(null); }, children: "\u00D7 Verwijder uit rack" }) })] }) }))] }));
}
const ctxItem = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '4px 8px', background: 'transparent', color: 'inherit',
    border: 'none', cursor: 'pointer', fontSize: 12,
};
function detectOverlap(slot, all, mod, modules) {
    const start = slot.hpOffset;
    const end = start + mod.visual.hpWidth;
    for (const other of all) {
        if (other.id === slot.id)
            continue;
        const om = modules.find((x) => x.id === other.moduleId);
        if (!om)
            continue;
        const oStart = other.hpOffset;
        const oEnd = oStart + om.visual.hpWidth;
        if (start < oEnd && end > oStart)
            return true;
    }
    return false;
}
// ── Sidebar: modules-niet-in-rack + plaats-knop ────────────────────────
function ModuleSidebar({ rack, modules, types, pickedRow, setPickedRow }) {
    const engineStatus = useEngineStatus();
    const inRack = new Set(rack.slots.map((s) => s.moduleId));
    // Interne racks tonen alleen internal modules; fysieke racks tonen ALLE
    // niet-geplaatste modules (inclusief internal) zodat NOISE/ECHO/PHASER
    // gewoon in een testpatch geplaatst kunnen worden.
    const wantInternal = rack.kind === 'internal';
    const available = modules.filter((m) => !inRack.has(m.id) && (wantInternal ? m.internal : true));
    function placeAt(moduleId, mod) {
        const isInternal = rack.kind === 'internal';
        const row = isInternal ? 0 : pickedRow;
        // Find first free HP in chosen row
        const slotsInRow = rack.slots.filter((s) => s.row === row)
            .sort((a, b) => a.hpOffset - b.hpOffset);
        let offset = 0;
        for (const s of slotsInRow) {
            const sm = modules.find((m) => m.id === s.moduleId);
            const w = sm?.visual.hpWidth ?? 4;
            if (offset + mod.visual.hpWidth <= s.hpOffset)
                break;
            offset = Math.max(offset, s.hpOffset + w);
        }
        const needHp = offset + mod.visual.hpWidth;
        const newHpPerRow = isInternal ? Math.max(rack.hpPerRow, needHp) : rack.hpPerRow;
        if (!isInternal && needHp > rack.hpPerRow) {
            alert('Geen ruimte op deze rij — kies een andere rij of verhoog HP/rij.');
            return;
        }
        const slot = { id: uid('slot'), moduleId, row, hpOffset: offset };
        updateProject((p) => ({
            ...p,
            racks: p.racks.map((r) => r.id === rack.id
                ? { ...r, hpPerRow: newHpPerRow, slots: [...r.slots, slot] } : r),
        }));
    }
    return (_jsxs("section", { style: {
            marginTop: 12, border: '1px solid #cbd2d9', borderRadius: 6,
            padding: 10, background: '#ffffff',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }, children: [_jsxs("h3", { style: { margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#374151' }, children: [wantInternal ? 'Brain-modules niet geplaatst' : 'Modules niet in rack', " (", available.length, ")"] }), !wantInternal && (_jsxs("label", { style: { fontSize: 12, marginLeft: 'auto' }, children: ["Plaats in rij:", _jsx("select", { value: pickedRow, onChange: (e) => setPickedRow(Number(e.target.value)), style: { marginLeft: 4, fontSize: 12 }, children: Array.from({ length: rack.rows }).map((_, i) => _jsx("option", { value: i, children: i + 1 }, i)) })] })), wantInternal && (_jsx("span", { style: { marginLeft: 'auto', fontSize: 11, color: '#6b7280' }, children: "Interne modules worden automatisch achteraan toegevoegd; HP groeit mee." }))] }), available.length === 0 && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: wantInternal
                    ? 'Geen losse brain-modules. Klik "✨ Internals" in de project-balk om AHDSR/LFO/S&H te seeden.'
                    : 'Alle modules zijn al geplaatst. Maak nieuwe modules aan in de Modules-tab.' })), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 10 }, children: available.map((m) => {
                    const t = types.find((x) => x.id === m.typeId);
                    return (_jsxs("div", { style: {
                            border: '1px solid #cbd2d9', borderRadius: 4, padding: 6,
                            display: 'flex', alignItems: 'center', gap: 8,
                        }, children: [_jsx("div", { style: { background: '#1f2937', borderRadius: 3 }, children: _jsx(ModulePanel, { module: m, types: types, pxPerMm: 1.2, showPortLabels: false, controlState: engineStatus.liveControls[m.id] }) }), _jsxs("div", { style: { fontSize: 12 }, children: [_jsx("div", { style: { fontWeight: 600 }, children: m.name }), _jsxs("div", { style: { color: '#6b7280' }, children: [t?.variant ?? '?', " \u00B7 ", m.visual.hpWidth, " HP"] }), _jsx("button", { onClick: () => placeAt(m.id, m), style: { fontSize: 11, marginTop: 4 }, children: "Plaats \u2192" })] })] }, m.id));
                }) })] }));
}
