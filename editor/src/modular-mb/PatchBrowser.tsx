// De patchkiezer (doc/plans/editor-structuur.md §3.1, stap 5): één venster
// met vier tabbladen, in de speelmodus en na Binnenkijken hetzelfde.
//
//   Mijn patches  de patches van het project, per map
//   Voorbeelden   de patchcatalogus: standaardset, Poly en Solo
//   Pool          de patches van musicbrain.nl (PoolList)
//   Diagnose      bouwstenen, testpatches en Stress (voorlopig voor iedereen,
//                 besluit 2)
//
// De keuzelijst (PatchSelect) blijft de snelle keuze; "Meer…" daarin opent
// dit venster. Op de telefoon vult het het scherm (besluit 3).
// Openen: openPatchBrowser(tabblad); de host staat in ModularMbApp.

import { useEffect, useMemo, useState } from 'react';

import { nlen } from '../i18n';
import { contentText } from './contentEn';
import { catalogMenu, type CatalogEntry } from './patchCatalog';
import { choosePatch } from './PatchSelect';
import { PoolList } from './sim/PoolWindows';
import { getProject, setProject, useModularProject } from './store';
import { useWeergave } from './weergave';

export type BrowserTab = 'mijn' | 'voorbeelden' | 'pool' | 'diagnose';

let open: BrowserTab | null = null;
const listeners = new Set<(t: BrowserTab | null) => void>();
export function openPatchBrowser(tab: BrowserTab = 'voorbeelden'): void { open = tab; listeners.forEach((fn) => fn(tab)); }
export function closePatchBrowser(): void { open = null; listeners.forEach((fn) => fn(null)); }

export function PatchBrowserHost(): JSX.Element | null {
  const [tab, setTab] = useState<BrowserTab | null>(open);
  useEffect(() => { listeners.add(setTab); return () => { listeners.delete(setTab); }; }, []);
  if (!tab) return null;
  return <PatchBrowser tab={tab} onTab={(t) => openPatchBrowser(t)} onClose={closePatchBrowser} />;
}

/** Zoekt in label en uitleg, hoofdletters maken niet uit. */
function matches(q: string, ...texts: (string | undefined)[]): boolean {
  const s = q.trim().toLowerCase();
  return !s || texts.some((t) => t?.toLowerCase().includes(s));
}

function PatchBrowser({ tab, onTab, onClose }: { tab: BrowserTab; onTab: (t: BrowserTab) => void; onClose: () => void }): JSX.Element {
  const phone = useWeergave().soort === 'telefoon';
  const [q, setQ] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const tabs: { id: BrowserTab; label: string }[] = [
    { id: 'mijn', label: nlen('Mijn patches', 'My patches') },
    { id: 'voorbeelden', label: nlen('Voorbeelden', 'Examples') },
    { id: 'pool', label: 'Pool' },
    { id: 'diagnose', label: nlen('Diagnose', 'Diagnostics') },
  ];
  const overlay: React.CSSProperties = phone
    ? { position: 'fixed', inset: 0, zIndex: 62, background: '#fff' }
    : { position: 'fixed', inset: 0, zIndex: 62, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const panel: React.CSSProperties = phone
    ? { height: '100%', display: 'flex', flexDirection: 'column', color: '#0f172a' }
    : { width: 820, maxWidth: '94vw', height: '84vh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#0f172a', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' };

  return (
    <div style={overlay} onMouseDown={(e) => { if (!phone && e.target === e.currentTarget) onClose(); }}>
      <div style={panel} role="dialog" aria-label={nlen('Patch kiezen', 'Choose a patch')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: phone ? '10px 12px 0' : '14px 18px 0' }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: phone ? 18 : 17 }}>{nlen('Patch kiezen', 'Choose a patch')}</h3>
          <button type="button" onClick={onClose} aria-label={nlen('Sluiten', 'Close')} style={{ fontSize: 16, padding: '4px 12px' }}>✕</button>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: phone ? '10px 12px 0' : '12px 18px 0', borderBottom: '1px solid #e5e7eb' }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
              style={{ padding: phone ? '8px 12px' : '6px 14px', fontSize: phone ? 15 : 13, border: '1px solid #cbd2d9', borderBottom: 'none',
                borderRadius: '6px 6px 0 0', background: tab === t.id ? '#fff' : '#f5f7fa', fontWeight: tab === t.id ? 700 : 400,
                boxShadow: tab === t.id ? 'inset 0 3px 0 var(--mb-accent)' : undefined, cursor: 'pointer', marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: phone ? '10px 12px 16px' : '12px 18px 18px' }}>
          {tab !== 'pool' && (
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={nlen('Zoeken…', 'Search…')}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: phone ? 16 : 13, padding: '6px 10px', marginBottom: 10 }} />
          )}
          {tab === 'mijn' && <MyPatches q={q} phone={phone} onDone={onClose} />}
          {tab === 'voorbeelden' && <CatalogList q={q} phone={phone} onDone={onClose} sections={[
            { title: nlen('Standaardset', 'Standard set'), entries: catalogMenu('basisset') },
            { title: nlen('Poly: meerstemmig', 'Poly: several voices'), entries: catalogMenu('poly') },
            { title: nlen('Solo: één instrument, en zelfspelend', 'Solo: one instrument, and self-playing'), entries: catalogMenu('solo') },
          ]} />}
          {tab === 'pool' && <PoolList />}
          {tab === 'diagnose' && <CatalogList q={q} phone={phone} onDone={onClose} sections={[
            { title: nlen('Bouwstenen en testpatches', 'Building blocks and test patches'), entries: catalogMenu('diagnose') },
            { title: nlen('Stress: de Teensy tot het uiterste', 'Stress: push the Teensy'), entries: catalogMenu('stress') },
          ]} />}
        </div>
      </div>
    </div>
  );
}

const rowStyle = (phone: boolean, active = false): React.CSSProperties => ({
  display: 'block', width: '100%', textAlign: 'left', padding: phone ? '10px 8px' : '7px 8px', border: 'none',
  borderBottom: '1px solid #f1f5f9', background: active ? '#fff7e6' : 'transparent', cursor: 'pointer', color: 'inherit',
});
const sub: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginTop: 2 };
const head: React.CSSProperties = { margin: '14px 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' };

function MyPatches({ q, phone, onDone }: { q: string; phone: boolean; onDone: () => void }): JSX.Element {
  const project = useModularProject();
  const groups = useMemo(() => {
    const m = new Map<string, typeof project.patches>();
    for (const p of project.patches) {
      if (!matches(q, p.name, p.description)) continue;
      const k = p.folder || nlen('(geen map)', '(no folder)');
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [project.patches, q]);
  if (!groups.length) return <div style={{ color: '#6b7280' }}>{nlen('Geen patches gevonden.', 'No patches found.')}</div>;
  return (
    <>
      {groups.map(([folder, list]) => (
        <section key={folder}>
          {groups.length > 1 && <h4 style={head}>{folder}</h4>}
          {list.map((p) => (
            <button key={p.id} type="button" style={rowStyle(phone, p.id === project.activePatchId)}
              onClick={() => { choosePatch(p.id); onDone(); }}>
              <strong style={{ fontSize: phone ? 15 : 13 }}>{contentText(p.name)}</strong>
              {p.description && <span style={sub}>{contentText(p.description).slice(0, 140)}{p.description.length > 140 ? '…' : ''}</span>}
            </button>
          ))}
        </section>
      ))}
    </>
  );
}

function CatalogList({ q, phone, onDone, sections }: {
  q: string; phone: boolean; onDone: () => void; sections: { title: string; entries: CatalogEntry[] }[];
}): JSX.Element {
  const shown = sections.map((s) => ({ ...s, entries: s.entries.filter((e) => matches(q, contentText(e.label), e.title && contentText(e.title))) }))
    .filter((s) => s.entries.length);
  if (!shown.length) return <div style={{ color: '#6b7280' }}>{nlen('Niets gevonden.', 'Nothing found.')}</div>;
  return (
    <>
      {shown.map((s) => (
        <section key={s.title}>
          <h4 style={head}>{s.title} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({s.entries.length})</span></h4>
          {s.entries.map((e) => (
            <button key={e.id} type="button" style={rowStyle(phone)}
              title={nlen('Zet deze patch erbij en maak hem actief; je eigen patches blijven staan', 'Adds this patch and makes it active; your own patches stay')}
              onClick={() => { setProject(e.build(getProject())); onDone(); }}>
              <strong style={{ fontSize: phone ? 15 : 13 }}>{contentText(e.label)}</strong>
              {e.title && <span style={sub}>{contentText(e.title)}</span>}
            </button>
          ))}
        </section>
      ))}
    </>
  );
}
