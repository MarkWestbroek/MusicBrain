// Modules tab — manages the two middle layers of the v2 model:
//   • ModuleType  — template: which ports and controls (e.g. "ladder VCF")
//   • Module      — concrete realisation: brand, model, panel visual
//
// Layout: split-pane. Left = ModuleTypes list, right = Modules list.
// Selecting a type filters the Modules table to instances of that type.

import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { ModulePanel } from './ModulePanel';
import {
  type ModuleType, type ModuleInstance, type Control, type Port,
  type ModuleCategory, MM_PER_HP,
} from './types';

export function ModulesPanel(): JSX.Element {
  const project = useModularProject();
  const [selTypeId,   setSelTypeId]   = useState<string | null>(null);
  const [selModuleId, setSelModuleId] = useState<string | null>(null);

  const selType   = project.moduleTypes.find((t) => t.id === selTypeId)   ?? null;
  const selModule = project.modules    .find((m) => m.id === selModuleId) ?? null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <TypesPane categories={project.categories} types={project.moduleTypes}
                   selectedId={selTypeId} onSelect={setSelTypeId} />
        <ModulesPane types={project.moduleTypes} modules={project.modules}
                     filterTypeId={selTypeId}
                     selectedId={selModuleId} onSelect={setSelModuleId} />
      </div>

      {selType && (
        <TypeEditor type={selType} categories={project.categories} />
      )}

      {selModule && (
        <ModuleEditor module={selModule} types={project.moduleTypes} />
      )}
    </div>
  );
}

// ── ModuleType list + create ───────────────────────────────────────────

function TypesPane({
  categories, types, selectedId, onSelect,
}: {
  categories: ModuleCategory[];
  types: ModuleType[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  const [newCatId,   setNewCatId]   = useState(categories[0]?.id ?? '');
  const [newVariant, setNewVariant] = useState('');

  function addType(): void {
    if (!newCatId) return;
    const t: ModuleType = {
      id: uid('type'),
      categoryId: newCatId,
      variant: newVariant.trim() || `Nieuw type ${types.length + 1}`,
      ports: [],
      controls: [],
    };
    updateProject((p) => ({ ...p, moduleTypes: [...p.moduleTypes, t] }));
    setNewVariant('');
    onSelect(t.id);
  }

  function removeType(id: string): void {
    if (!confirm('Type verwijderen? Modules van dit type behouden hun typeId maar verwijzen naar niets.')) return;
    updateProject((p) => ({ ...p, moduleTypes: p.moduleTypes.filter((t) => t.id !== id) }));
    if (selectedId === id) onSelect(null);
  }

  return (
    <section style={paneStyle}>
      <h3 style={paneH3}>ModuleTypes</h3>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)} style={{ fontSize: 12 }}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input type="text" placeholder="Variant (b.v. ladder)" value={newVariant}
          onChange={(e) => setNewVariant(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
        <button onClick={addType} style={{ fontSize: 12 }}>+ Type</button>
      </div>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={th}>Categorie</th>
            <th style={th}>Variant</th>
            <th style={th}>Ports/Ctrls</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {types.length === 0 && (
            <tr><td colSpan={4} style={{ color: '#6b7280', padding: 8 }}>
              Nog geen types. Maak een type aan om concrete modules erop te baseren.
            </td></tr>
          )}
          {types.map((t) => {
            const cat = categories.find((c) => c.id === t.categoryId);
            const isSel = selectedId === t.id;
            return (
              <tr key={t.id}
                  onClick={() => onSelect(isSel ? null : t.id)}
                  style={{
                    background: isSel ? 'var(--mb-accent-tint)' : undefined,
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                <td style={td}>{cat?.label ?? t.categoryId}</td>
                <td style={td}>{t.variant}</td>
                <td style={td}>{t.ports.length} / {t.controls.length}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); removeType(t.id); }}
                          style={{ fontSize: 11 }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Module list + create ────────────────────────────────────────────────

function ModulesPane({
  types, modules, filterTypeId, selectedId, onSelect,
}: {
  types: ModuleType[];
  modules: ModuleInstance[];
  filterTypeId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): JSX.Element {
  const [pickedTypeId, setPickedTypeId] = useState(types[0]?.id ?? '');

  const shown = filterTypeId ? modules.filter((m) => m.typeId === filterTypeId) : modules;

  function addModule(): void {
    const typeId = filterTypeId ?? pickedTypeId;
    if (!typeId) return;
    const t = types.find((x) => x.id === typeId);
    if (!t) return;
    const m: ModuleInstance = {
      id: uid('mod'),
      typeId,
      internal: false,
      name: `${t.variant} ${modules.filter((x) => x.typeId === typeId).length + 1}`,
      visual: {
        hpWidth: Math.max(6, Math.min(20, t.controls.length + 4)),
        texture: 'aluminum',
        controlPlacements: autoPlaceControls(t.controls, Math.max(6, Math.min(20, t.controls.length + 4))),
        portPlacements:    autoPlacePorts(t.ports, Math.max(6, Math.min(20, t.controls.length + 4))),
      },
    };
    updateProject((p) => ({ ...p, modules: [...p.modules, m] }));
    onSelect(m.id);
  }

  function removeModule(id: string): void {
    if (!confirm('Module verwijderen? Eventuele rack-slots en patch-verbindingen ernaartoe blijven verwijzen.')) return;
    updateProject((p) => ({ ...p, modules: p.modules.filter((m) => m.id !== id) }));
    if (selectedId === id) onSelect(null);
  }

  function rename(id: string, name: string): void {
    updateProject((p) => ({
      ...p,
      modules: p.modules.map((m) => m.id === id ? { ...m, name } : m),
    }));
  }

  return (
    <section style={paneStyle}>
      <h3 style={paneH3}>
        Modules{filterTypeId ? ' (gefilterd op geselecteerd type)' : ''}
      </h3>

      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {!filterTypeId && (
          <select value={pickedTypeId} onChange={(e) => setPickedTypeId(e.target.value)}
                  style={{ fontSize: 12, flex: 1 }} disabled={types.length === 0}>
            {types.length === 0
              ? <option>(eerst type aanmaken)</option>
              : types.map((t) => <option key={t.id} value={t.id}>{t.variant}</option>)}
          </select>
        )}
        <button onClick={addModule}
                disabled={types.length === 0}
                style={{ fontSize: 12 }}>
          + Module{filterTypeId ? ' van type' : ''}
        </button>
      </div>

      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#6b7280', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={th}>Naam</th>
            <th style={th}>Type</th>
            <th style={th}>HP</th>
            <th style={th}>I/O</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr><td colSpan={5} style={{ color: '#6b7280', padding: 8 }}>
              Nog geen modules.
            </td></tr>
          )}
          {shown.map((m) => {
            const t = types.find((x) => x.id === m.typeId);
            const isSel = selectedId === m.id;
            const portCount = (m.portsOverride ?? t?.ports ?? []).length;
            return (
              <tr key={m.id}
                  onClick={() => onSelect(isSel ? null : m.id)}
                  style={{
                    background: isSel ? 'var(--mb-accent-tint)' : (m.internal ? '#fefce8' : undefined),
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                  }}>
                <td style={td}>
                  <input type="text" value={m.name}
                         onChange={(e) => rename(m.id, e.target.value)}
                         onClick={(e) => e.stopPropagation()}
                         style={{ width: '100%', fontSize: 12, border: 'none', background: 'transparent' }} />
                </td>
                <td style={td}>{t?.variant ?? <span style={{ color: '#dc2626' }}>?</span>}</td>
                <td style={td}>{m.visual.hpWidth}</td>
                <td style={td}>{portCount}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); removeModule(m.id); }}
                          style={{ fontSize: 11 }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Type editor (ports + controls CRUD) ────────────────────────────────

function TypeEditor({ type: t, categories }: { type: ModuleType; categories: ModuleCategory[] }): JSX.Element {
  function update(fn: (t: ModuleType) => ModuleType): void {
    updateProject((p) => ({
      ...p,
      moduleTypes: p.moduleTypes.map((x) => x.id === t.id ? fn(x) : x),
    }));
  }

  function addPort(direction: 'in' | 'out'): void {
    const port: Port = {
      id: uid('p'),
      name: direction === 'in' ? 'In' : 'Out',
      signalType: 'cv',
      direction,
    };
    update((x) => ({ ...x, ports: [...x.ports, port] }));
  }
  function removePort(id: string): void {
    update((x) => ({ ...x, ports: x.ports.filter((p) => p.id !== id) }));
  }
  function patchPort(id: string, patch: Partial<Port>): void {
    update((x) => ({
      ...x,
      ports: x.ports.map((p) => p.id === id ? { ...p, ...patch } : p),
    }));
  }

  function addControl(kind: Control['kind']): void {
    const id = uid('c');
    let c: Control;
    switch (kind) {
      case 'knob':
        c = { kind: 'knob', id, label: 'Knob', min: 0, max: 1, defaultValue: 0.5, style: 'generic', size: 'medium' };
        break;
      case 'slider':
        c = { kind: 'slider', id, label: 'Slider', min: 0, max: 1, defaultValue: 0.5, orientation: 'v' };
        break;
      case 'toggle':
        c = { kind: 'toggle', id, label: 'Toggle', defaultValue: false };
        break;
      case 'switch':
        c = { kind: 'switch', id, label: 'Switch', positions: ['A', 'B', 'C'], defaultIndex: 0 };
        break;
      case 'button':
        c = { kind: 'button', id, label: 'Btn', momentary: true, style: 'momentary' };
        break;
      case 'joystick':
        c = { kind: 'joystick', id, label: 'Joy', axes: ['x', 'y'], defaultValue: { x: 0, y: 0 } };
        break;
      case 'exotic':
        c = { kind: 'exotic', id, label: 'X', defaultValue: 0, description: '' };
        break;
    }
    update((x) => ({ ...x, controls: [...x.controls, c] }));
  }
  function removeControl(id: string): void {
    update((x) => ({ ...x, controls: x.controls.filter((c) => c.id !== id) }));
  }
  function patchControl(id: string, patch: Partial<Control>): void {
    update((x) => ({
      ...x,
      controls: x.controls.map((c) => c.id === id ? ({ ...c, ...patch } as Control) : c),
    }));
  }

  return (
    <section style={editorStyle}>
      <h3 style={editorH3}>Type-editor: {t.variant}</h3>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <label style={lbl}>Categorie:
          <select value={t.categoryId}
                  onChange={(e) => update((x) => ({ ...x, categoryId: e.target.value }))}
                  style={{ marginLeft: 4, fontSize: 12 }}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label style={lbl}>Variant:
          <input type="text" value={t.variant}
                 onChange={(e) => update((x) => ({ ...x, variant: e.target.value }))}
                 style={{ marginLeft: 4, fontSize: 12 }} />
        </label>
      </div>

      {/* Ports */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <strong style={{ fontSize: 12 }}>Ports</strong>
          <button onClick={() => addPort('in')}  style={{ fontSize: 11 }}>+ In</button>
          <button onClick={() => addPort('out')} style={{ fontSize: 11 }}>+ Out</button>
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: '#6b7280', textAlign: 'left' }}>
            <th style={th}>Dir</th><th style={th}>Naam</th><th style={th}>Signaal</th><th />
          </tr></thead>
          <tbody>
            {t.ports.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={td}>{p.direction}</td>
                <td style={td}>
                  <input type="text" value={p.name}
                         onChange={(e) => patchPort(p.id, { name: e.target.value })}
                         style={{ fontSize: 12, width: '100%' }} />
                </td>
                <td style={td}>
                  <select value={p.signalType}
                          onChange={(e) => patchPort(p.id, { signalType: e.target.value as Port['signalType'] })}
                          style={{ fontSize: 12 }}>
                    {(['cv', 'gate', 'trigger', 'audio', 'midi'] as const).map((s) =>
                      <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => removePort(p.id)} style={{ fontSize: 11 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controls */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12 }}>Controls</strong>
          {(['knob', 'slider', 'toggle', 'switch', 'button', 'joystick', 'exotic'] as const).map((k) =>
            <button key={k} onClick={() => addControl(k)} style={{ fontSize: 11 }}>+ {k}</button>
          )}
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: '#6b7280', textAlign: 'left' }}>
            <th style={th}>Kind</th><th style={th}>Label</th><th style={th}>Details</th><th />
          </tr></thead>
          <tbody>
            {t.controls.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={td}>{c.kind}</td>
                <td style={td}>
                  <input type="text" value={c.label}
                         onChange={(e) => patchControl(c.id, { label: e.target.value })}
                         style={{ fontSize: 12, width: '100%' }} />
                </td>
                <td style={{ ...td, color: '#6b7280', fontSize: 11 }}>
                  {controlDetail(c)}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => removeControl(c.id)} style={{ fontSize: 11 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function controlDetail(c: Control): string {
  switch (c.kind) {
    case 'knob':
    case 'slider':   return `${c.min}..${c.max}, default ${c.defaultValue}`;
    case 'exotic':   return `default ${c.defaultValue}${c.description ? ' — ' + c.description : ''}`;
    case 'toggle':   return `default ${c.defaultValue}`;
    case 'switch':   return `${c.positions.length} posities`;
    case 'button':   return c.momentary ? 'momentary' : 'latching';
    case 'joystick': return `xy default (${c.defaultValue.x}, ${c.defaultValue.y})`;
    case 'display':  return `${c.digits} digits${c.bindTo ? ` → ${c.bindTo}` : ''}`;
    case 'led':      return c.bindTo ? `bound to ${c.bindTo}` : 'static';
  }
}

// ── Module editor: name/brand/visual + live panel preview ──────────────

function ModuleEditor({ module: m, types }: { module: ModuleInstance; types: ModuleType[] }): JSX.Element {
  function patch(fn: (m: ModuleInstance) => ModuleInstance): void {
    updateProject((p) => ({
      ...p,
      modules: p.modules.map((x) => x.id === m.id ? fn(x) : x),
    }));
  }
  return (
    <section style={editorStyle}>
      <h3 style={editorH3}>Module-editor: {m.name}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <label style={lbl}>Naam:
              <input value={m.name}
                     onChange={(e) => patch((x) => ({ ...x, name: e.target.value }))}
                     style={inp} />
            </label>
            <label style={lbl}>Type:
              <select value={m.typeId}
                      onChange={(e) => patch((x) => ({ ...x, typeId: e.target.value }))}
                      style={{ marginLeft: 4, fontSize: 12 }}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.variant}</option>)}
              </select>
            </label>
            <label style={lbl}>Brand:
              <input value={m.brand ?? ''} placeholder="(optioneel)"
                     onChange={(e) => patch((x) => ({ ...x, brand: e.target.value || undefined }))}
                     style={inp} />
            </label>
            <label style={lbl}>Model:
              <input value={m.modelNumber ?? ''} placeholder="(optioneel)"
                     onChange={(e) => patch((x) => ({ ...x, modelNumber: e.target.value || undefined }))}
                     style={inp} />
            </label>
            <label style={lbl}>
              <input type="checkbox" checked={m.internal}
                     onChange={(e) => patch((x) => ({ ...x, internal: e.target.checked }))} />
              &nbsp;Intern (brain levert dit)
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <label style={lbl}>HP:
              <input type="number" min={2} max={84} value={m.visual.hpWidth}
                     onChange={(e) => patch((x) => ({
                       ...x,
                       visual: { ...x.visual, hpWidth: Math.max(2, Math.min(84, Number(e.target.value) || 2)) },
                     }))}
                     style={{ ...inp, width: 60 }} />
            </label>
            <label style={lbl}>Textuur:
              <select value={m.visual.texture}
                      onChange={(e) => patch((x) => ({
                        ...x,
                        visual: { ...x.visual, texture: e.target.value as ModuleInstance['visual']['texture'] },
                      }))}
                      style={{ marginLeft: 4, fontSize: 12 }}>
                {(['aluminum', 'pcb-black', 'mi-cream', 'gold-plate', 'wood'] as const).map((tx) =>
                  <option key={tx} value={tx}>{tx}</option>)}
              </select>
            </label>
            <button onClick={() => {
              const t = types.find((x) => x.id === m.typeId);
              if (!t) return;
              patch((x) => ({
                ...x,
                visual: {
                  ...x.visual,
                  controlPlacements: autoPlaceControls(x.controlsOverride ?? t.controls, x.visual.hpWidth),
                  portPlacements:    autoPlacePorts   (x.portsOverride    ?? t.ports,    x.visual.hpWidth),
                },
              }));
            }} style={{ fontSize: 12 }}>Auto-layout</button>
          </div>

          <textarea placeholder="Notities…" value={m.notes ?? ''}
                    onChange={(e) => patch((x) => ({ ...x, notes: e.target.value || undefined }))}
                    style={{ width: '100%', minHeight: 50, fontSize: 12 }} />
        </div>

        <div style={{ background: '#1f2937', padding: 8, borderRadius: 6, alignSelf: 'start' }}>
          <ModulePanel module={m} types={types} pxPerMm={2.4} />
        </div>
      </div>
    </section>
  );
}

// ── Auto-layout helpers ────────────────────────────────────────────────
//
// Lays controls in a grid roughly in the top half, ports in a column near
// the bottom. Designed only for "looks reasonable out of the box"; user
// can later drag in a dedicated editor.

function autoPlaceControls(controls: Control[], hpWidth: number): Record<string, { x: number; y: number }> {
  const widthMm = hpWidth * MM_PER_HP;
  const cols = Math.max(1, Math.min(controls.length, Math.floor(widthMm / 14)));
  const cellW = widthMm / cols;
  const out: Record<string, { x: number; y: number }> = {};
  controls.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[c.id] = { x: cellW * (col + 0.5), y: 20 + row * 22 };
  });
  return out;
}

function autoPlacePorts(ports: Port[], hpWidth: number): Record<string, { x: number; y: number; labelPos: 'above' | 'below' }> {
  const widthMm = hpWidth * MM_PER_HP;
  const cols = Math.max(1, Math.min(ports.length, Math.floor(widthMm / 8)));
  const cellW = widthMm / cols;
  const out: Record<string, { x: number; y: number; labelPos: 'above' | 'below' }> = {};
  ports.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[p.id] = { x: cellW * (col + 0.5), y: 95 + row * 12, labelPos: 'above' };
  });
  return out;
}

// ── Styles ─────────────────────────────────────────────────────────────

const paneStyle: React.CSSProperties = {
  border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: '#ffffff',
};
const paneH3: React.CSSProperties = {
  marginTop: 0, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', color: '#374151',
};
const editorStyle: React.CSSProperties = {
  border: '1px solid #cbd2d9', borderRadius: 6, padding: 12,
  background: '#f8fafc', marginBottom: 12,
};
const editorH3: React.CSSProperties = {
  marginTop: 0, marginBottom: 10, fontSize: 13, color: '#1f2937',
};
const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 500 };
const td: React.CSSProperties = { padding: '4px 6px' };
const lbl: React.CSSProperties = { fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center' };
const inp: React.CSSProperties = { marginLeft: 4, fontSize: 12 };
