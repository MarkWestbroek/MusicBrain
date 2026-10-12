// De bovenbalk na Binnenkijken (editor-structuur.md stap 8, besluit UX
// 2026-10-01): een paar vaste knoppen, vaste menu's, en een snelmenu dat je
// zelf vult. Elk menu-item heeft een ☆; aanklikken zet het als losse knop in
// het snelmenu rechts, nog eens klikken haalt het eruit. Onthouden per
// browser (localStorage), dus in de testfase blijft alles één klik weg.

import { useEffect, useRef, useState } from 'react';

export interface ToolAction {
  /** Vast id; het snelmenu onthoudt het. */
  id: string;
  label: string;
  title?: string;
  run: () => void;
  /** Rood, zoals Nieuw. */
  danger?: boolean;
  /** Nu niet te gebruiken (bv. Page 4 zonder Fairlight in de patch); de titel zegt waarom. */
  disabled?: boolean;
  /** Anker voor de rondleiding (`data-tour`): op de snelknop, of anders op het menu. */
  tour?: string;
}
export type ToolMenuItem = ToolAction | 'sep';
export interface ToolMenu { id: string; label: string; title?: string; items: ToolMenuItem[] }

const PINS_KEY = 'mmb.toolbar.pins';

export function loadPins(fallback: readonly string[]): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw === null) return [...fallback];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [...fallback];
  } catch { return [...fallback]; }
}
function savePins(ids: readonly string[]): void {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(ids)); } catch { /* geen opslag */ }
}
/** Zuiver: ☆ aan of uit. Nieuwe pins achteraan, in de volgorde waarin je ze zet. */
export function togglePin(pins: readonly string[], id: string): string[] {
  return pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
}

const actionsOf = (menus: readonly ToolMenu[]): ToolAction[] =>
  menus.flatMap((m) => m.items.filter((x): x is ToolAction => x !== 'sep'));

const pop: React.CSSProperties = {
  position: 'absolute', top: '100%', zIndex: 50, marginTop: 2, minWidth: 230, maxHeight: 420, overflowY: 'auto',
  background: '#fff', border: '1px solid #cbd2d9', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
  display: 'flex', flexDirection: 'column', padding: 4,
};
const row: React.CSSProperties = { display: 'flex', alignItems: 'stretch', gap: 2 };
const itemBtn: React.CSSProperties = {
  flex: 1, textAlign: 'left', border: 'none', background: 'transparent', padding: '7px 10px', cursor: 'pointer', fontSize: 13,
  height: 'auto', justifyContent: 'flex-start',
};
const starBtn: React.CSSProperties = { border: 'none', background: 'transparent', padding: '0 8px', cursor: 'pointer', fontSize: 14, height: 'auto', color: '#b27510' };

function Menu({ menu, pins, onPin, tour }: { menu: ToolMenu; pins: readonly string[]; onPin: (id: string) => void; tour?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [right, setRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  function toggle(): void {
    // In de rechterhelft van het scherm naar links openklappen, anders valt hij eraf.
    const r = ref.current?.getBoundingClientRect();
    setRight(!!r && r.left > window.innerWidth / 2);
    setOpen((v) => !v);
  }
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={toggle} title={menu.title} aria-haspopup="menu" aria-expanded={open} data-tour={tour}
        style={open ? { background: '#fff4d6', borderColor: '#d2a24d' } : undefined}>{menu.label} ▾</button>
      {open && (
        <div role="menu" aria-label={menu.label} style={{ ...pop, ...(right ? { right: 0 } : { left: 0 }) }}>
          {menu.items.map((it, i) => it === 'sep'
            ? <hr key={`sep${i}`} style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '4px 6px', width: 'auto' }} />
            : (
              <div key={it.id} style={row}>
                <button role="menuitem" title={it.title} disabled={it.disabled}
                  style={{ ...itemBtn, color: it.danger ? '#b91c1c' : undefined, opacity: it.disabled ? 0.45 : 1, cursor: it.disabled ? 'default' : 'pointer' }}
                  onClick={() => { setOpen(false); it.run(); }}>{it.label}</button>
                <button style={starBtn} onClick={() => onPin(it.id)} aria-pressed={pins.includes(it.id)}
                  title={pins.includes(it.id) ? 'Uit het snelmenu halen' : 'In het snelmenu zetten (als losse knop in de balk)'}>
                  {pins.includes(it.id) ? '★' : '☆'}
                </button>
              </div>
            ))}
        </div>
      )}
    </span>
  );
}

/** Vaste knoppen (`before`), de menu's, `after` (bv. ?), en het snelmenu. */
export function ToolbarMenus({ menus, defaultPins, before, after }: {
  menus: readonly ToolMenu[]; defaultPins: readonly string[]; before?: React.ReactNode; after?: React.ReactNode;
}): JSX.Element {
  const [pins, setPins] = useState<string[]>(() => loadPins(defaultPins));
  const onPin = (id: string): void => setPins((p) => { const n = togglePin(p, id); savePins(n); return n; });
  const all = actionsOf(menus);
  const pinned = pins.map((id) => all.find((a) => a.id === id)).filter((a): a is ToolAction => !!a);
  // Rondleiding: een anker op de snelknop als die er is, anders op zijn menu.
  const tourOf = (m: ToolMenu): string | undefined =>
    m.items.find((x): x is ToolAction => x !== 'sep' && !!x.tour && !pins.includes(x.id))?.tour;
  return (
    <>
      {before}
      {menus.map((m) => <Menu key={m.id} menu={m} pins={pins} onPin={onPin} tour={tourOf(m)} />)}
      {after}
      {pinned.length > 0 && <span aria-hidden style={{ color: '#cbd2d9', padding: '0 2px' }}>│</span>}
      {pinned.map((a) => (
        <button key={a.id} onClick={a.run} data-tour={a.tour} className={a.danger ? 'es-projectbar-reset' : undefined} disabled={a.disabled}
          title={`${a.title ?? a.label}\n(snelmenu: ☆ in het menu haalt hem weg)`}>{a.label}</button>
      ))}
    </>
  );
}
