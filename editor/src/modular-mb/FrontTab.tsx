// Front-tab (doc/plans/patch-front.md §6): de fronts van de actieve patch
// naast het automatische front, als virtueel paneel; rechts de bewerker
// voor een opgeslagen front (naam, uitleg, kolommen, items: label, grootte,
// volgorde, kopjes). Draaien op het front wijzigt de patch; bewerken van
// het front zit in de bewaarcyclus van de patch (recipe/saved.ts) en in
// undo/redo. In de spelermodus (`expert` uit) is er geen bewerker.
//
// Kiezen welke knoppen en jacks erop staan gebeurt in rack en patcher
// (rechtsklik → "Op front zetten", of de frontvelden in de eigenschappen);
// hier schik je ze.

import { useState } from 'react';

import { FrontPanel } from './FrontPanel';
import { autoFront } from './frontPanel';
import {
  addFront, insertFrontItem, moveFrontItem, newFront, pruneFronts, removeFront, removeFrontItemAt,
  updateFront, updateFrontItem,
} from './fronts';
import { updateProject, useModularProject, uid } from './store';
import { resolveControls, resolvePorts, type FrontItem, type Patch, type PatchFront } from './types';

const AUTO = 'front_auto';

export function FrontTab({ expert = true }: { expert?: boolean }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  // ?front=<id> kiest het front bij het openen (patch-pool-links); anders
  // het eerste bewaarde front, en pas als dat er niet is het automatische.
  const [chosen, setChosen] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('front'); } catch { return null; }
  });

  if (!patch) {
    return (
      <div style={{ padding: 16, opacity: 0.8, maxWidth: 560, lineHeight: 1.5 }}>
        <p style={{ margin: '0 0 8px' }}>Er is nog geen patch.</p>
        {expert
          ? <p style={{ margin: 0 }}>Kies een voorbeeld (Solo ▾ of Poly ▾ in de balk hierboven), laad een project, of bouw er een in Rack en Patcher.</p>
          : <p style={{ margin: 0 }}>Klik op <strong>Binnenkijken ▸</strong> en kies een voorbeeld (Solo ▾ of Poly ▾), of open een patch via een link van musicbrain.nl. Daarna zie je hier het front: de belangrijkste knoppen, zonder kabels.</p>}
      </div>
    );
  }

  const fronts = pruneFronts(patch, project).fronts ?? [];
  const stored = chosen === AUTO ? undefined : (fronts.find((f) => f.id === chosen) ?? fronts[0]);
  const front: PatchFront = stored ?? autoFront(patch, project);
  const isAuto = !stored;

  const edit = (fn: (x: Patch) => Patch): void =>
    updateProject((p) => ({ ...p, patches: p.patches.map((x) => (x.id === patch.id ? fn(x) : x)) }), { forceCommit: true });

  function saveAuto(): void {
    const f: PatchFront = { ...autoFront(patch!, project), id: uid('front'), name: `Front ${fronts.length + 1}` };
    edit((x) => addFront(x, f));
    setChosen(f.id);
  }
  function newEmpty(): void {
    const f = newFront(uid('front'), `Front ${fronts.length + 1}`);
    edit((x) => addFront(x, f));
    setChosen(f.id);
  }
  function remove(id: string): void {
    edit((x) => removeFront(x, id));
    setChosen(AUTO);
  }

  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', cursor: 'pointer' };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{patch.name}</strong>
        <select value={isAuto ? AUTO : front.id} onChange={(e) => setChosen(e.target.value)} style={{ fontSize: 12 }}>
          <option value={AUTO}>Auto (afgeleid, niet opgeslagen)</option>
          {fronts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {expert && (isAuto
          ? <>
              <button type="button" style={btn} onClick={saveAuto}>Auto bewaren als front</button>
              <button type="button" style={btn} onClick={newEmpty}>+ Leeg front</button>
            </>
          : <button type="button" style={btn} onClick={() => remove(front.id)}>Front verwijderen</button>)}
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          Draaien op het front wijzigt de patch; wat niet op het front staat, staat vast.
        </span>
      </div>
      {front.description && <p style={{ margin: 0, maxWidth: 640, opacity: 0.85 }}>{front.description}</p>}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ overflow: 'auto' }}>
          <FrontPanel front={front} patch={patch} project={project} pxPerMm={4} />
        </div>
        {expert && (isAuto
          ? <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 300 }}>
              Dit front is afgeleid uit de patch: gelabelde en gebonden knoppen, de speelmodules, en per module de
              belangrijkste twee knoppen. Bewaar het als front om labels, volgorde en kopjes te bewerken; knoppen en
              jacks kies je in rack en patcher met rechtsklik → "Op front zetten".
            </div>
          : <FrontEditor patch={patch} front={front} edit={edit} />)}
      </div>
    </div>
  );
}

// ── Bewerker van een opgeslagen front ────────────────────────────────────

function FrontEditor({ patch, front, edit }: { patch: Patch; front: PatchFront; edit: (fn: (x: Patch) => Patch) => void }): JSX.Element {
  const project = useModularProject();
  const id = front.id;
  const input: React.CSSProperties = { fontSize: 12, padding: '2px 6px' };
  const small: React.CSSProperties = { fontSize: 11, padding: '1px 6px', cursor: 'pointer' };
  const nameOf = (it: FrontItem): string => {
    if (it.kind === 'group') return '';
    const m = project.modules.find((x) => x.id === it.moduleId);
    if (!m) return it.moduleId;
    if (it.kind === 'control') {
      const c = resolveControls(m, project.moduleTypes).find((x) => x.id === it.controlId);
      return `${m.name} · ${c?.label || it.controlId}`;
    }
    const p = resolvePorts(m, project.moduleTypes).find((x) => x.id === it.portId);
    return `${m.name} · ${p?.name || it.portId} (jack)`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320, maxWidth: 460, fontSize: 12 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 70 }}>Naam</span>
        <input value={front.name} maxLength={40} style={{ ...input, flex: 1 }}
          onChange={(e) => edit((x) => updateFront(x, id, { name: e.target.value }))} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ width: 70 }}>Uitleg</span>
        <textarea value={front.description ?? ''} rows={2} placeholder="Voor de speler: wat doet dit front, hoe speel je het"
          style={{ ...input, flex: 1, resize: 'vertical' }}
          onChange={(e) => edit((x) => updateFront(x, id, { description: e.target.value || undefined }))} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 70 }}>Kolommen</span>
        <input type="number" min={1} max={8} value={front.columns ?? 4} style={{ ...input, width: 60 }}
          onChange={(e) => edit((x) => updateFront(x, id, { columns: Math.max(1, Math.min(8, Number(e.target.value) || 4)) }))} />
        <button type="button" style={small} onClick={() => edit((x) => insertFrontItem(x, id, front.items.length, { kind: 'group', text: 'Kopje' }))}>
          + Kopje
        </button>
      </label>
      <div style={{ fontSize: 11, color: '#6b7280' }}>
        Items in rastervolgorde. Knoppen en jacks toevoegen: rechtsklik in rack of patcher, of de frontvelden in de eigenschappen.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {front.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px', background: it.kind === 'group' ? '#eef2f7' : 'transparent', borderRadius: 4 }}>
            <span style={{ width: 14, textAlign: 'center', color: '#9ca3af' }}>{it.kind === 'group' ? '¶' : it.kind === 'port' ? '⚬' : '◉'}</span>
            {it.kind === 'group' ? (
              <input value={it.text} maxLength={30} style={{ ...input, flex: 1, fontWeight: 600 }}
                onChange={(e) => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'group' ? { ...y, text: e.target.value } : y)))} />
            ) : (
              <>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nameOf(it)}>{nameOf(it)}</span>
                <input value={it.label ?? ''} placeholder="label" maxLength={24} style={{ ...input, width: 110 }}
                  onChange={(e) => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'group' ? y : { ...y, label: e.target.value || undefined })))} />
                {it.kind === 'control' && (
                  <button type="button" style={small} title="Groot of klein"
                    onClick={() => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'control' ? { ...y, size: y.size === 'large' ? undefined : 'large' } : y)))}>
                    {it.size === 'large' ? 'groot' : 'klein'}
                  </button>
                )}
              </>
            )}
            <button type="button" style={small} disabled={i === 0} onClick={() => edit((x) => moveFrontItem(x, id, i, -1))} title="Omhoog">▲</button>
            <button type="button" style={small} disabled={i === front.items.length - 1} onClick={() => edit((x) => moveFrontItem(x, id, i, 1))} title="Omlaag">▼</button>
            <button type="button" style={small} onClick={() => edit((x) => removeFrontItemAt(x, id, i))} title="Van het front">✕</button>
          </div>
        ))}
        {front.items.length === 0 && <div style={{ color: '#9ca3af' }}>Nog leeg.</div>}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>
        Bewerkingen zitten in de bewaarcyclus van de patch (Bewaar, Terug, Vergelijk) en in undo (Ctrl+Z).
      </div>
    </div>
  );
}
