// "Op front zetten": het menu na een rechtsklik op een knop of jack in rack
// of patcher (doc/plans/patch-front.md §6). Toont de fronts van de patch
// met een vinkje als het doel er al op staat; klikken zet het erop of haalt
// het eraf. Zonder front: een nieuw front maken met dit item, leeg of uit
// het automatische front. Rendert via een portal, dus het werkt ook binnen
// een getransformeerde ReactFlow-node.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { addFront, addToFront, isOnFront, newFront, removeFromFront } from './fronts';
import { autoFront } from './frontLayout';
import { updateProject, useModularProject, uid } from './store';
import { resolveControls, type FrontItem, type Patch } from './types';

export interface FrontMenuAnchor { x: number; y: number; item: FrontItem }

export function FrontMenu({ anchor, patchId, onClose }: { anchor: FrontMenuAnchor; patchId: string; onClose: () => void }): JSX.Element | null {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === patchId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    const onDown = (): void => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  if (!patch) return null;
  const fronts = patch.fronts ?? [];
  const item = anchor.item;
  const moduleName = item.kind !== 'group' ? project.modules.find((m) => m.id === item.moduleId)?.name : undefined;

  const edit = (fn: (x: Patch) => Patch): void => {
    updateProject((p) => ({ ...p, patches: p.patches.map((x) => (x.id === patchId ? fn(x) : x)) }), { forceCommit: true });
    onClose();
  };
  const itemModule = item.kind !== 'group' ? project.modules.find((m) => m.id === item.moduleId) : undefined;
  const ctlKind = item.kind === 'control' && itemModule ? resolveControls(itemModule, project.moduleTypes).find((c) => c.id === item.controlId)?.kind : undefined;
  const describe = item.kind === 'control' ? `${ctlKind === 'display' ? 'display' : ctlKind === 'led' ? 'led' : 'knop'} ${item.controlId}`
    : item.kind === 'port' ? `jack ${item.portId}` : item.text;

  const row: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
    padding: '6px 12px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
  };

  return createPortal(
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left: anchor.x, top: anchor.y, zIndex: 80,
        background: '#fff', color: '#0f172a', border: '1px solid #cbd2d9', borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 200, padding: '4px 0',
      }}
    >
      <div style={{ padding: '4px 12px 6px', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
        Op front zetten · {describe}
      </div>
      {fronts.map((f) => {
        const on = isOnFront(f, item);
        return (
          <button key={f.id} type="button" style={row}
            onClick={() => edit((x) => (on ? removeFromFront(x, f.id, item) : addToFront(x, f.id, item, moduleName)))}>
            <span style={{ display: 'inline-block', width: 16 }}>{on ? '✓' : ''}</span>{f.name}
          </button>
        );
      })}
      {fronts.length === 0 && (
        // Nog geen bewaard front: het front dat de speler nu ziet is Auto.
        // Daarop zetten = Auto bewaren mét dit item, in één handeling.
        <button type="button" style={{ ...row, fontWeight: 600 }}
          onClick={() => edit((x) => {
            const f = { ...autoFront(x, project), id: uid('front'), name: 'Front 1' };
            return addToFront(addFront(x, f), f.id, item, moduleName);
          })}>
          <span style={{ display: 'inline-block', width: 16 }}>+</span>Op het huidige front (Auto wordt bewaard)
        </button>
      )}
      <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />
      <button type="button" style={row}
        onClick={() => edit((x) => addFront(x, newFront(uid('front'), `Front ${fronts.length + 1}`, [item])))}>
        <span style={{ display: 'inline-block', width: 16 }}>+</span>Nieuw leeg front met dit item
      </button>
      {fronts.length > 0 && (
        <button type="button" style={row}
          onClick={() => edit((x) => {
            const f = { ...autoFront(x, project), id: uid('front'), name: `Front ${fronts.length + 1}` };
            return addToFront(addFront(x, f), f.id, item, moduleName);
          })}>
          <span style={{ display: 'inline-block', width: 16 }}>+</span>Nieuw front uit Auto, met dit item
        </button>
      )}
    </div>,
    document.body,
  );
}
