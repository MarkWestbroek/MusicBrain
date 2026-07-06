// Control-surface-paneel (ED-CS-2) — bindings tussen een motorized MIDI-
// controller (Roto-Control) en module-controls, plus de WebMIDI-koppeling.
// Zie doc/plans/control-surface.md. De bridge zelf leeft in surfaceBridge.ts;
// dit paneel is er de UI voor.
//
// De module-dropdown toont alleen modules die de ACTIEVE patch raakt
// (kabels + rack-slots), minus poly-volgers: in een poly-groep bestuur je
// alleen de master, de overige stemmen volgen via de poly-expansie.
// Binding-groepen ("Elements") bewaren een setje rijen onder een naam;
// bij het laden worden rijen waarvan de module niet in de patch zit
// hertarget naar de eerste patch-module met hetzelfde moduletype.

import { useMemo, useRef } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { useTeensyLink } from './teensyLink';
import {
  armLearn, connectSurface, disarmLearn, selectSurfaceInput,
  selectSurfaceOutput, syncSurface, useSurfaceBridge,
} from './surfaceBridge';
import { exportRotoSetup, importRotoSetup } from './rotoSetup';
import { resolveControls } from './types';
import type {
  Control, MidiBinding, MidiBindingGroup, ModularProject, ModuleInstance, Patch,
} from './types';

const CELL: React.CSSProperties = {
  padding: '4px 6px', borderBottom: '1px solid #e4e7eb', fontSize: 13,
};
const NUM_INPUT: React.CSSProperties = { width: 52, fontSize: 13 };

/** Continue controls (knob/slider/exotic) — de enige die FW-CS-1 aankan. */
function continuousControls(p: ModularProject, moduleId: string): Control[] {
  const mod = p.modules.find((m) => m.id === moduleId);
  if (!mod) return [];
  return resolveControls(mod, p.moduleTypes)
    .filter((c) => c.kind === 'knob' || c.kind === 'slider' || c.kind === 'exotic');
}

function activePatchOf(p: ModularProject): Patch | undefined {
  return p.patches.find((x) => x.id === p.activePatchId) ?? p.patches[0];
}

/** Modules die de actieve patch echt raakt (kabels + rack-slots van de
 *  patch-racks), zonder poly-volgers: van elke poly-groep telt alleen de
 *  master mee (bij patch-overrides: de eerste member van elke partitie). */
function activePatchModules(p: ModularProject): ModuleInstance[] {
  const patch = activePatchOf(p);
  if (!patch) return p.modules;
  const ids = new Set<string>();
  for (const c of patch.connections) { ids.add(c.from.moduleId); ids.add(c.to.moduleId); }
  const racks = p.racks.filter((r) => patch.rackIds.includes(r.id));
  for (const r of racks) for (const s of r.slots) ids.add(s.moduleId);

  const followers = new Set<string>();
  for (const r of racks) {
    for (const g of r.polyGroups ?? []) {
      const ov = patch.polyOverrides?.find((o) => o.rackPolyGroupId === g.id);
      if (ov) {
        for (const part of ov.partition) {
          for (const mi of part.memberIndices.slice(1)) {
            const m = g.members[mi];
            if (m?.kind === 'module') followers.add(m.moduleId);
          }
        }
      } else {
        for (const m of g.members.slice(1)) {
          if (m.kind === 'module') followers.add(m.moduleId);
        }
      }
    }
  }
  return p.modules.filter((m) => ids.has(m.id) && !followers.has(m.id));
}

function updateBindings(fn: (bs: MidiBinding[]) => MidiBinding[]): void {
  updateProject((p) => ({
    ...p,
    midiMap: { ...(p.midiMap ?? { bindings: [] }), bindings: fn(p.midiMap?.bindings ?? []) },
  }));
}

function updateGroups(fn: (gs: MidiBindingGroup[]) => MidiBindingGroup[]): void {
  updateProject((p) => ({
    ...p,
    midiMap: {
      ...(p.midiMap ?? { bindings: [] }),
      bindings: p.midiMap?.bindings ?? [],
      groups: fn(p.midiMap?.groups ?? []),
    },
  }));
}

export function ControlSurfacePanel(): JSX.Element {
  const project = useModularProject();
  const bridge  = useSurfaceBridge();
  const link    = useTeensyLink();
  const rotoImportRef = useRef<HTMLInputElement>(null);

  const bindings = project.midiMap?.bindings ?? [];
  const groups   = project.midiMap?.groups ?? [];

  // Alleen modules van de actieve patch, poly-masters only, op naam.
  const patchModules = useMemo(
    () => activePatchModules(project).sort((a, b) => a.name.localeCompare(b.name)),
    [project],
  );

  function setBinding(i: number, patch: Partial<MidiBinding>): void {
    updateBindings((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  function addBinding(): void {
    updateBindings((bs) => [...bs, {
      ch: 0, cc: 74, mod: patchModules[0]?.id ?? '', ctrl: '',
      min: 0, max: 1,
    }]);
  }

  function removeBinding(i: number): void {
    updateBindings((bs) => bs.filter((_, j) => j !== i));
  }

  /** Control gekozen: min/max uit de controldefinitie voorvullen. */
  function onSelectControl(i: number, moduleId: string, ctrlId: string): void {
    const def = continuousControls(project, moduleId).find((c) => c.id === ctrlId);
    if (def && (def.kind === 'knob' || def.kind === 'slider')) {
      setBinding(i, { ctrl: ctrlId, min: def.min, max: def.max });
    } else {
      setBinding(i, { ctrl: ctrlId });
    }
  }

  // ── Groepen ────────────────────────────────────────────────────────────

  function saveGroup(): void {
    if (bindings.length === 0) return;
    const name = window.prompt('Naam voor deze binding-groep:', 'Elements');
    if (!name?.trim()) return;
    const snapshot = bindings.map((b) => ({
      ...b,
      typeId: project.modules.find((m) => m.id === b.mod)?.typeId,
    }));
    updateGroups((gs) => [...gs, { id: uid('bgrp'), name: name.trim(), bindings: snapshot }]);
  }

  /** Groep laden vervangt de huidige bindings. Modules die niet in de
   *  actieve patch zitten worden hertarget op moduletype. */
  function loadGroup(g: MidiBindingGroup): void {
    const retargeted: MidiBinding[] = g.bindings.map(({ typeId, ...b }) => {
      if (patchModules.some((m) => m.id === b.mod)) return b;
      const target = typeId ? patchModules.find((m) => m.typeId === typeId) : undefined;
      return target ? { ...b, mod: target.id } : b;
    });
    updateBindings(() => retargeted);
  }

  function deleteGroup(id: string): void {
    if (!confirm('Groep verwijderen?')) return;
    updateGroups((gs) => gs.filter((g) => g.id !== id));
  }

  // ── ROTO-SETUP import/export (ED-CS-4) ─────────────────────────────────

  function onRotoExport(): void {
    if (bindings.length === 0) return;
    const name = window.prompt('Setup-naam (op de Roto):', 'MMB SETUP');
    if (name === null) return;
    const setup = exportRotoSetup(project, bindings, name.trim() || 'MMB SETUP');
    const blob = new Blob([JSON.stringify(setup, null, 4)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${setup.name}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function onRotoImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = importRotoSetup(JSON.parse(reader.result as string));
        if (!rows || rows.length === 0) {
          alert('Geen CC-knobs gevonden — is dit een ROTO-SETUP-export (MIDI-mode)?');
          return;
        }
        // Bestaande rijen met dezelfde (ch-compatibele) CC behouden hun
        // module/control; nieuwe CC's worden lege rijen om in te vullen.
        updateBindings((bs) => rows.map((r) => {
          const existing = bs.find((b) => b.cc === r.cc && (b.ch === 0 || b.ch === r.ch));
          return existing ?? { ...r, mod: patchModules[0]?.id ?? '', ctrl: '', min: 0, max: 1 };
        }));
      } catch {
        alert('Kon het bestand niet verwerken — verwacht ROTO-SETUP JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const teensyConnected = link.status.kind === 'connected';
  const lastCcAge = bridge.lastCc ? Date.now() - bridge.lastCc.ts : Infinity;

  /** Opties voor de module-dropdown van rij @p b: patch-modules, plus de nu
   *  gebonden module als die (nog) buiten de patch valt — anders zou een
   *  bestaande binding onzichtbaar leeg lijken. */
  function moduleOptionsFor(b: MidiBinding): { m: ModuleInstance; outside: boolean }[] {
    const opts = patchModules.map((m) => ({ m, outside: false }));
    if (b.mod && !patchModules.some((m) => m.id === b.mod)) {
      const extra = project.modules.find((m) => m.id === b.mod);
      if (extra) opts.push({ m: extra, outside: true });
    }
    return opts;
  }

  return (
    <div style={{ maxWidth: 980 }}>

      {/* ── MIDI-verbinding ── */}
      <fieldset style={{ border: '1px solid #cbd2d9', borderRadius: 6, marginBottom: 14, padding: 10 }}>
        <legend style={{ fontSize: 13, fontWeight: 600 }}>Control surface (WebMIDI)</legend>
        {!bridge.supported ? (
          <p style={{ fontSize: 13, color: '#a11' }}>
            Web MIDI wordt niet ondersteund in deze browser (gebruik Chrome/Edge).
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            {!bridge.connected && (
              <button onClick={() => void connectSurface()}>🎛 Verbind MIDI</button>
            )}
            {bridge.connected && (
              <>
                <label>In:{' '}
                  <select value={bridge.inputId ?? ''}
                    onChange={(e) => selectSurfaceInput(e.target.value || null)}>
                    <option value="">— kies input —</option>
                    {bridge.inputs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>Uit (motor-feedback):{' '}
                  <select value={bridge.outputId ?? ''}
                    onChange={(e) => selectSurfaceOutput(e.target.value || null)}>
                    <option value="">— kies output —</option>
                    {bridge.outputs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <button onClick={syncSurface} disabled={!bridge.outputId}
                  title="Stuur alle gebonden waardes opnieuw naar het surface (knoppen draaien naar de huidige stand)">
                  ↻ Sync knoppen
                </button>
              </>
            )}
            <span style={{ color: '#666' }}>
              Teensy: {teensyConnected ? '✓ verbonden' : '— niet verbonden (pokes gaan verloren)'}
            </span>
            {bridge.lastCc && lastCcAge < 5000 && (
              <span style={{ background: '#eef4ff', border: '1px solid #b8ccf0', borderRadius: 4, padding: '2px 8px' }}>
                laatste CC: ch {bridge.lastCc.ch} · cc {bridge.lastCc.cc} · {bridge.lastCc.val}
              </span>
            )}
            {bridge.error && <span style={{ color: '#a11' }}>{bridge.error}</span>}
          </div>
        )}
      </fieldset>

      {/* ── Bindings-toolbar: groepen + ROTO-SETUP ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Bindings</h3>
        <button onClick={addBinding} disabled={patchModules.length === 0}>+ Binding</button>
        <span style={{ borderLeft: '1px solid #cbd2d9', height: 18 }} />
        <button onClick={saveGroup} disabled={bindings.length === 0}
          title="Bewaar de huidige bindings als benoemde groep (b.v. 'Elements')">
          💾 Als groep…
        </button>
        {groups.map((g) => (
          <span key={g.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2,
            border: '1px solid #cbd2d9', borderRadius: 12, padding: '1px 4px 1px 10px', fontSize: 13 }}>
            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13 }}
              onClick={() => loadGroup(g)}
              title={`Laad '${g.name}' (${g.bindings.length} bindings) — vervangt de huidige rijen; modules buiten de patch worden op moduletype hertarget`}>
              {g.name}
            </button>
            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#999' }}
              onClick={() => deleteGroup(g.id)} title="Groep verwijderen">✕</button>
          </span>
        ))}
        <span style={{ borderLeft: '1px solid #cbd2d9', height: 18 }} />
        <button onClick={onRotoExport} disabled={bindings.length === 0}
          title="Genereer een ROTO-SETUP-bestand met labels uit de controlnamen; importeer dat in de ROTO-SETUP-app om de displays te vullen">
          ⤓ ROTO-setup
        </button>
        <button onClick={() => rotoImportRef.current?.click()}
          title="Lees kanaal + CC-nummers uit een ROTO-SETUP-export (MIDI-mode)">
          ⤒ ROTO-setup
        </button>
        <input ref={rotoImportRef} type="file" accept=".json,application/json"
          style={{ display: 'none' }} onChange={onRotoImportFile} />
        {bridge.learning && (
          <span style={{ color: '#b26b00', fontSize: 13 }}>
            Learn actief — draai aan een knop op het surface…{' '}
            <button onClick={disarmLearn}>annuleer</button>
          </span>
        )}
      </div>

      {bindings.length === 0 ? (
        <p style={{ fontSize: 13, color: '#666' }}>
          Nog geen bindings. Voeg een rij toe, kies module + control, en klik 🎓 om
          kanaal + CC van het surface te leren (of vul ze handmatig in). Je kunt ook
          een ROTO-SETUP-export importeren (⤒) om de CC-nummers voor te vullen.
        </p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['', 'Ch (0=omni)', 'CC', 'Module', 'Control', 'Min', 'Max', 'Curve', ''].map((h, i) => (
                <th key={i} style={{ ...CELL, textAlign: 'left', color: '#666', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bindings.map((b, i) => (
              <tr key={i}>
                <td style={CELL}>
                  <button
                    title="Learn: neem kanaal + CC over van de eerstvolgende beweging op het surface"
                    disabled={!bridge.inputId}
                    onClick={() => armLearn((ch, cc) => setBinding(i, { ch, cc }))}
                  >🎓</button>
                </td>
                <td style={CELL}>
                  <input type="number" min={0} max={16} value={b.ch} style={NUM_INPUT}
                    onChange={(e) => setBinding(i, { ch: Math.max(0, Math.min(16, Number(e.target.value) || 0)) })} />
                </td>
                <td style={CELL}>
                  <input type="number" min={0} max={127} value={b.cc} style={NUM_INPUT}
                    onChange={(e) => setBinding(i, { cc: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })} />
                </td>
                <td style={CELL}>
                  <select value={b.mod}
                    onChange={(e) => setBinding(i, { mod: e.target.value, ctrl: '' })}>
                    <option value="">— module —</option>
                    {moduleOptionsFor(b).map(({ m, outside }) => (
                      <option key={m.id} value={m.id}>
                        {m.name}{outside ? ' (buiten patch)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={CELL}>
                  <select value={b.ctrl}
                    onChange={(e) => onSelectControl(i, b.mod, e.target.value)}>
                    <option value="">— control —</option>
                    {continuousControls(project, b.mod).map((c) => (
                      <option key={c.id} value={c.id}>{c.label || c.id}</option>
                    ))}
                  </select>
                </td>
                <td style={CELL}>
                  <input type="number" step="any" value={b.min} style={NUM_INPUT}
                    onChange={(e) => setBinding(i, { min: Number(e.target.value) || 0 })} />
                </td>
                <td style={CELL}>
                  <input type="number" step="any" value={b.max} style={NUM_INPUT}
                    onChange={(e) => setBinding(i, { max: Number(e.target.value) || 0 })} />
                </td>
                <td style={CELL}>
                  <select value={b.curve ?? 'lin'}
                    onChange={(e) => setBinding(i, { curve: e.target.value === 'exp' ? 'exp' : undefined })}>
                    <option value="lin">lin</option>
                    <option value="exp">exp</option>
                  </select>
                </td>
                <td style={CELL}>
                  <button title="Binding verwijderen" onClick={() => removeBinding(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 12, color: '#666', marginTop: 12, lineHeight: 1.5 }}>
        De module-lijst toont alleen modules van de actieve patch; van poly-groepen
        alleen de master (de overige stemmen volgen). Bindings werken hier live via de
        editor (patcher-knop beweegt mee; wijzigingen gaan als controlPoke naar de
        Teensy) en reizen mee met de config-push (🔌 Teensy) voor standalone gebruik
        (FW-CS-1). Displaylabels op de Roto: exporteer een ROTO-setup (⤓) en importeer
        die in de ROTO-SETUP-app — MIDI zelf kan geen tekst vervoeren.
      </p>
    </div>
  );
}
