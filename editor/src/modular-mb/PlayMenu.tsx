// ⋯ in de werkbalk van de speelmodus op de telefoon (doc/plans/editor-structuur.md
// §5b, besluit 5): Bewaar, Bewaar als, Binnenkijken en de rondleiding staan
// hierin, zodat de patchkeuze en ⋯ samen op één regel passen. Dezelfde
// knoppen als op de desktop (SaveButton, SaveAsButton), geen eigen variant.
// Een stip op ⋯ zegt dat de patch gewijzigd is en nog niet bewaard.

import { useEffect, useRef, useState } from 'react';

import { nlen } from '../i18n';
import { SaveAsButton, SaveButton } from './PatchSave';
import { isDirty } from './recipe/saved';
import type { ModularProject, Patch } from './types';

export function PlayMenu({ project, patch, onInside, onTour }: {
  project: ModularProject; patch?: Patch; onInside: () => void; onTour: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  const dirty = !!patch && isDirty(patch);
  const item: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 15,
    border: 'none', borderRadius: 0, background: 'transparent', cursor: 'pointer',
  };
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" data-tour="play-menu" onClick={() => setOpen(!open)}
        aria-label={nlen('Meer: bewaren, binnenkijken, rondleiding', 'More: save, look inside, tour')} aria-expanded={open}
        style={{ position: 'relative', padding: '4px 12px', fontSize: 16, lineHeight: 1, borderRadius: 6, border: '1px solid #cbd2d9',
          background: open ? '#fde68a' : '#f5f7fa', cursor: 'pointer' }}>
        ⋯
        {dirty && <span aria-hidden style={{ position: 'absolute', top: 2, right: 3, width: 7, height: 7, borderRadius: 4, background: 'var(--mb-accent)' }} />}
      </button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)}
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 40, minWidth: 220, background: '#fff',
            border: '1px solid #cbd2d9', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
          {patch && <SaveButton patch={patch} style={item} />}
          {patch && <SaveAsButton project={project} patch={patch} style={item} />}
          <button type="button" role="menuitem" style={item} onClick={onInside}>{nlen('Binnenkijken ▸', 'Look inside ▸')}</button>
          <button type="button" role="menuitem" style={item} onClick={onTour}>{nlen('Rondleiding', 'Tour')}</button>
        </div>
      )}
    </span>
  );
}
