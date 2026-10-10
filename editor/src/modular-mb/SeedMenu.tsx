// Een uitklapmenu met patches uit de catalogus (patchCatalog.ts): Poly ▾,
// Solo ▾, Stress ▾ in de bovenbalk. Kiezen zet de patch erbij en maakt hem
// actief, net als de knoppen deden. Tijdelijk: de patchkiezer (stap 5 van
// editor-structuur.md) vervangt deze menu's.

import { useRef, useState } from 'react';

import { catalogMenu, type CatalogMenu } from './patchCatalog';
import { getProject, setProject } from './store';

export function SeedMenu({ menu, label, title, minWidth = 210 }: { menu: CatalogMenu; label: string; title: string; minWidth?: number }): JSX.Element {
  const [open, setOpen] = useState(false);
  // Staat de knop in de rechterhelft (de bovenbalk breekt af), dan klapt het
  // menu naar links open, anders valt het rechts buiten beeld.
  const [alignRight, setAlignRight] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = (): void => {
    const r = btnRef.current?.getBoundingClientRect();
    setAlignRight(!!r && r.left > window.innerWidth / 2);
    setOpen((v) => !v);
  };
  const item: React.CSSProperties = { textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 12px', cursor: 'pointer', fontSize: 13 };
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button ref={btnRef} onClick={toggle} title={title}>{label}</button>
      {open && (
        <div onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: '100%', ...(alignRight ? { right: 0 } : { left: 0 }), zIndex: 20, background: '#ffffff', border: '1px solid #cbd2d9', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2, minWidth, display: 'flex', flexDirection: 'column',
          }}>
          {catalogMenu(menu).map((e) => (
            <button key={e.id} title={e.title} style={e.divider ? { ...item, borderTop: '1px solid #e5e7eb' } : item}
              onClick={() => { setProject(e.build(getProject())); setOpen(false); }}>
              {e.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** De diagnoseknoppen (Voorbeelden, Internals, Test-patch, FM-test, CV-bridge)
 *  als losse knoppen, zoals ze stonden; voorlopig voor iedereen zichtbaar
 *  (besluit 2, editor-structuur.md §8). */
export function DiagnoseButtons(): JSX.Element {
  return (
    <>
      {catalogMenu('diagnose').map((e) => (
        <button key={e.id} title={e.title} onClick={() => setProject(e.build(getProject()))}>{e.label}</button>
      ))}
    </>
  );
}
