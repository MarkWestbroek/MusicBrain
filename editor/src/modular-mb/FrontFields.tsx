// "Front (deze patch)" in de eigenschappen van een module, naast de labels
// (doc/plans/patch-front.md §6): kies een front van de patch en vink aan
// welke knoppen en jacks van deze module erop staan. Hetzelfde als
// rechtsklik → "Op front zetten", maar zichtbaar en voor wie rechtsklik
// niet vindt. Een patch zonder front krijgt hier een knop om er een te
// maken uit het automatische front. Displays en LED's die iets tonen (een
// naam, een stap) staan er ook bij: zij kijken op het front naar dezelfde
// control als op het paneel.
//
// De Front-tab gebruikt hetzelfde onderdeel achter "+ Toevoegen", met
// `frontId` (het front dat daar open staat) en `roomy` (regels op
// vingerhoogte: op een telefoon is er geen rechtsklik).

import { useState } from 'react';

import { addFront, addToFront, isOnFront, removeFromFront } from './fronts';
import { autoFront } from './frontLayout';
import { updateProject, useModularProject, uid } from './store';
import type { Control, FrontItem, Patch, Port } from './types';

export function FrontFields({ moduleId, controls, ports, patchId, dark = false, frontId, roomy = false }: {
  moduleId: string; controls: Control[]; ports: Port[]; patchId?: string; dark?: boolean;
  /** Vast front (Front-tab): geen kop en geen frontkeuze. */
  frontId?: string;
  roomy?: boolean;
}): JSX.Element | null {
  const project = useModularProject();
  const id = patchId ?? project.activePatchId;
  const patch = project.patches.find((x) => x.id === id);
  const [chosen, setChosen] = useState<string | null>(null);
  if (!patch) return null;
  const fronts = patch.fronts ?? [];
  const front = frontId ? fronts.find((f) => f.id === frontId) : fronts.find((f) => f.id === chosen) ?? fronts[0];
  const moduleName = project.modules.find((m) => m.id === moduleId)?.name;
  const playable = controls.filter((c) => c.kind !== 'display' && c.kind !== 'led');
  // Een LED zonder binding brandt altijd en zegt op een front niets.
  const readouts = controls.filter((c) => c.kind === 'display' || (c.kind === 'led' && c.bindTo));
  const shows = (c: Control): string => {
    if (c.kind !== 'display' && c.kind !== 'led') return '';
    const of = (id?: string): string | undefined => (id ? controls.find((x) => x.id === id)?.label ?? id.replace(/^__/, '') : undefined);
    const parts = [of(c.bindTo), c.kind === 'display' ? of(c.bindTo2) : undefined].filter(Boolean);
    const what = c.kind === 'led' ? 'led' : c.lookup ? 'naam' : 'display';
    return parts.length ? `${what} bij ${parts.join(' en ')}` : what;
  };
  if (playable.length === 0 && readouts.length === 0 && ports.length === 0) return null;

  const edit = (fn: (x: Patch) => Patch): void =>
    updateProject((p) => ({ ...p, patches: p.patches.map((x) => (x.id === patch.id ? fn(x) : x)) }), { forceCommit: true });
  const toggle = (item: FrontItem): void => {
    if (!front) return;
    edit((x) => (isOnFront(front, item) ? removeFromFront(x, front.id, item) : addToFront(x, front.id, item, moduleName)));
  };
  const makeFront = (): void => {
    const f = { ...autoFront(patch, project), id: uid('front'), name: `Front ${fronts.length + 1}` };
    edit((x) => addFront(x, f));
    setChosen(f.id);
  };

  const muted = dark ? '#94a3b8' : '#6b7280';
  const head: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: dark ? '#94a3b8' : '#374151', margin: '6px 0 3px' };
  const line: React.CSSProperties = roomy
    ? { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', fontSize: 14, borderBottom: '1px solid #eef2f7', cursor: 'pointer' }
    : { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, fontSize: 11 };
  const box: React.CSSProperties | undefined = roomy ? { width: 20, height: 20, flex: 'none' } : undefined;
  const select: React.CSSProperties = dark
    ? { fontSize: 11, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3, padding: '1px 4px' }
    : { fontSize: 11 };

  return (
    <div style={{ marginTop: frontId ? 0 : 10 }}>
      {!frontId && <div style={head}>Front <span style={{ fontWeight: 400 }}>(deze patch)</span></div>}
      {!front ? (
        frontId ? null : <button type="button" onClick={makeFront} style={{ fontSize: 11 }}>+ Front maken (uit Auto)</button>
      ) : (
        <>
          {!frontId && fronts.length > 1 && (
            <select value={front.id} onChange={(e) => setChosen(e.target.value)} style={{ ...select, marginBottom: 4 }}>
              {fronts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {playable.map((c) => {
            const item: FrontItem = { kind: 'control', moduleId, controlId: c.id };
            return (
              <label key={`c-${c.id}`} style={line}>
                <input type="checkbox" style={box} checked={isOnFront(front, item)} onChange={() => toggle(item)} />
                <span style={{ color: muted }}>{c.label || c.id}</span>
              </label>
            );
          })}
          {readouts.map((c) => {
            const item: FrontItem = { kind: 'control', moduleId, controlId: c.id };
            return (
              <label key={`d-${c.id}`} style={line}>
                <input type="checkbox" style={box} checked={isOnFront(front, item)} onChange={() => toggle(item)} />
                <span style={{ color: muted }}>▭ {c.label || shows(c)}</span>
              </label>
            );
          })}
          {ports.map((p) => {
            const item: FrontItem = { kind: 'port', moduleId, portId: p.id };
            return (
              <label key={`p-${p.id}`} style={line}>
                <input type="checkbox" style={box} checked={isOnFront(front, item)} onChange={() => toggle(item)} />
                <span style={{ color: muted }}>⚬ {p.name} <em style={{ opacity: 0.7 }}>({p.direction === 'in' ? 'in' : 'uit'})</em></span>
              </label>
            );
          })}
        </>
      )}
    </div>
  );
}
