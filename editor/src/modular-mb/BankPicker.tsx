// Keuzelijst van een keuzedisplay (ADR 0017): alle standen met hun naam,
// één klik kiest. Eerst voor het bankstrookje van SAMPLER, TAPE STRIP en
// PERCUTER (64 banken: de draaiknop is te grof, en zonder muiswiel is dit de
// weg), daarna voor elk naamdisplay met `lookup` (DX7-voices, ritmes,
// Plaits-engines…). Rendert via een portal, net als FrontMenu, dus het werkt
// ook in een getransformeerde ReactFlow-node.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ChoiceRow {
  /** Uniek per rij; ook wat onPick terugkrijgt. */
  key: string;
  label: string;
  /** Leeg (grijs), zoals een bank zonder bestand. */
  empty?: boolean;
  /** Een kopje boven deze rij (bijv. de DX7-bank). */
  header?: string;
}

export function ChoicePicker({ at, rows, current, onPick, onClose }: {
  at: { x: number; y: number };
  rows: ChoiceRow[];
  current: string;
  onPick: (key: string) => void;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    const onDown = (): void => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [onClose]);

  // Binnen het scherm houden: smal genoeg voor een telefoon, hoogstens 60 % hoog.
  const width = Math.min(260, window.innerWidth - 16);
  const left = Math.max(8, Math.min(at.x - width / 2, window.innerWidth - width - 8));
  const maxH = Math.round(window.innerHeight * 0.6);
  const top = Math.max(8, Math.min(at.y + 8, window.innerHeight - maxH - 8));

  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      // De gekozen rij in beeld, zonder de pagina mee te scrollen.
      ref={(el) => { const c = el?.querySelector<HTMLElement>('[data-current]'); if (el && c) el.scrollTop = c.offsetTop - maxH / 2; }}
      style={{
        position: 'fixed', left, top, width, maxHeight: maxH, overflowY: 'auto', zIndex: 80,
        background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '4px 0',
        fontFamily: 'ui-monospace, monospace', fontSize: 12, touchAction: 'pan-y',
      }}
    >
      {rows.map(({ key, label, empty, header }) => (
        <div key={key}>
          {header && (
            <div style={{ padding: '6px 12px 2px', color: '#94a3b8', fontSize: 11, borderTop: '1px solid #1e293b' }}>{header}</div>
          )}
          <button type="button" {...(key === current ? { 'data-current': '' } : {})}
            onClick={() => onPick(key)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
              padding: '5px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              background: key === current ? '#1e293b' : 'transparent',
              color: key === current ? '#67e8f9' : empty ? '#475569' : '#e2e8f0',
              fontFamily: 'inherit', fontSize: 'inherit',
            }}>
            {label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** De bankenlijst: "NN · naam" of "(leeg)". */
export function BankPicker({ at, current, max, nameOf, onPick, onClose }: {
  at: { x: number; y: number };
  current: number;
  max: number;
  /** Naam van bank k, of null als er niets staat. */
  nameOf: (k: number) => string | null;
  onPick: (k: number) => void;
  onClose: () => void;
}): JSX.Element {
  const rows = Array.from({ length: max + 1 }, (_, k) => {
    const name = nameOf(k);
    return { key: String(k), label: `${String(k).padStart(2, '0')} · ${name ?? '(leeg)'}`, empty: !name };
  });
  return <ChoicePicker at={at} rows={rows} current={String(current)} onPick={(k) => onPick(Number(k))} onClose={onClose} />;
}
