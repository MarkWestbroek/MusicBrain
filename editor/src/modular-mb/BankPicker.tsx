// Bankenlijst bij een klik op het bankstrookje van SAMPLER, TAPE STRIP en
// PERCUTER: alle nummers met hun naam, één klik kiest. Met 64 banken is de
// draaiknop te grof, en zonder muiswiel (trackpad, telefoon) is dit de weg.
// Rendert via een portal, net als FrontMenu, dus het werkt ook in een
// getransformeerde ReactFlow-node.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function BankPicker({ at, current, max, nameOf, onPick, onClose }: {
  at: { x: number; y: number };
  current: number;
  max: number;
  /** Naam van bank k, of null als er niets staat. */
  nameOf: (k: number) => string | null;
  onPick: (k: number) => void;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    const onDown = (): void => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onClose]);

  const rows = Array.from({ length: max + 1 }, (_, k) => ({ k, name: nameOf(k) }));
  // Binnen het scherm houden: smal genoeg voor een telefoon, hoogstens 60 % hoog.
  const width = Math.min(260, window.innerWidth - 16);
  const left = Math.max(8, Math.min(at.x - width / 2, window.innerWidth - width - 8));
  const maxH = Math.round(window.innerHeight * 0.6);
  const top = Math.max(8, Math.min(at.y + 8, window.innerHeight - maxH - 8));

  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      // De gekozen bank in beeld, zonder de pagina mee te scrollen.
      ref={(el) => { const c = el?.querySelector<HTMLElement>('[data-current]'); if (el && c) el.scrollTop = c.offsetTop - maxH / 2; }}
      style={{
        position: 'fixed', left, top, width, maxHeight: maxH, overflowY: 'auto', zIndex: 80,
        background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '4px 0',
        fontFamily: 'ui-monospace, monospace', fontSize: 12, touchAction: 'pan-y',
      }}
    >
      {rows.map(({ k, name }) => (
        <button key={k} type="button" {...(k === current ? { 'data-current': '' } : {})}
          onClick={() => onPick(k)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
            padding: '5px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            background: k === current ? '#1e293b' : 'transparent',
            color: k === current ? '#67e8f9' : name ? '#e2e8f0' : '#475569',
            fontFamily: 'inherit', fontSize: 'inherit',
          }}>
          {String(k).padStart(2, '0')} · {name ?? '(leeg)'}
        </button>
      ))}
    </div>,
    document.body,
  );
}
