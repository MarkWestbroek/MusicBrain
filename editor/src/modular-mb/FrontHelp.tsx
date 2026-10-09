// FrontHelp — het uitlegblad van de speelmodus (ⓘ Uitleg) (doc/plans/help-en-instrumenttour.md):
// per module op het front een korte uitleg en per knop één regel. Tekst uit
// moduleHelp.ts; zonder regel daar de eerste zin van de module-notes.

import { useEffect } from 'react';

import { nlen, useLang } from '../i18n';
import { frontLabel } from './frontLayout';
import { startKnobTour, tourable } from './knobTour';
import { controlHelp, moduleAbout } from './moduleHelp';
import { resolveControls, type ModularProject, type Patch, type PatchFront } from './types';

interface Row { label: string; text: string | null; moduleId: string; controlId: string; range?: { min: number; max: number }; playable: boolean }
interface Block { moduleId: string; title: string; about: string | null; rows: Row[] }

/** De blokken van het blad, in de volgorde van het front. Zuiver. */
export function frontHelpBlocks(front: PatchFront, patch: Patch, project: ModularProject): Block[] {
  const blocks = new Map<string, Block>();
  for (const it of front.items) {
    if (it.kind !== 'control') continue;
    const m = project.modules.find((x) => x.id === it.moduleId);
    if (!m) continue;
    const c = resolveControls(m, project.moduleTypes).find((x) => x.id === it.controlId);
    if (!c || c.kind === 'display' || c.kind === 'led') continue;
    let b = blocks.get(m.id);
    if (!b) {
      const notes = project.moduleTypes.find((t) => t.id === m.typeId)?.notes ?? m.notes;
      b = { moduleId: m.id, title: m.name, about: moduleAbout(m.typeId) ?? firstSentence(notes), rows: [] };
      blocks.set(m.id, b);
    }
    b.rows.push({ label: frontLabel(it, patch, c), text: controlHelp(m.typeId, c.id), moduleId: m.id, controlId: c.id, range: it.range, playable: tourable(c) });
  }
  return [...blocks.values()];
}

function firstSentence(text: string | undefined): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();
  const m = /^(.{20,240}?[.!?])(\s|$)/.exec(t);
  return m ? m[1]! : t.slice(0, 240);
}

export function FrontHelp({ front, patch, project, onClose }: {
  front: PatchFront; patch: Patch; project: ModularProject; onClose: () => void;
}): JSX.Element {
  useLang();
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const blocks = frontHelpBlocks(front, patch, project);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16, overflow: 'auto' }}>
      <div role="dialog" aria-label={nlen('Uitleg bij dit front', 'About this front panel')} onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', color: '#111827', borderRadius: 10, padding: '14px 16px', maxWidth: 560, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 16, flex: 1 }}>{nlen('Wat doen de knoppen?', 'What do the knobs do?')}</strong>
          <button type="button" onClick={onClose} style={{ fontSize: 14, padding: '2px 10px', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280' }}>
          {nlen('Tip: houd een knop even vast (of wijs hem aan met de muis) voor alleen die regel. ▶ speelt iets en draait aan de knop.',
                'Tip: press and hold a knob (or hover over it with the mouse) for just its line. ▶ plays something and turns the knob.')}
        </p>
        {blocks.length === 0 && <p style={{ margin: 0 }}>{nlen('Er staan geen knoppen op dit front.', 'There are no knobs on this front panel.')}</p>}
        {blocks.map((b) => (
          <section key={b.moduleId} style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 2px', fontSize: 14 }}>{b.title}</h3>
            {b.about && <p style={{ margin: '0 0 4px', fontSize: 13, color: '#374151' }}>{b.about}</p>}
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(90px, max-content) 1fr', columnGap: 10, rowGap: 2, fontSize: 13 }}>
              {b.rows.map((r, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  <dt style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {r.playable
                      ? <button type="button"
                          onClick={() => { onClose(); void startKnobTour({ patchId: patch.id, moduleId: r.moduleId, controlId: r.controlId, label: r.label, help: r.text, range: r.range }); }}
                          title={nlen('Laat horen: speel en draai aan deze knop', 'Let me hear it: play and turn this knob')}
                          aria-label={nlen(`Laat ${r.label} horen`, `Let me hear ${r.label}`)}
                          style={{ fontSize: 11, lineHeight: 1, padding: '3px 5px', cursor: 'pointer', borderRadius: 4 }}>▶</button>
                      : <span style={{ width: 22 }} />}
                    {r.label}
                  </dt>
                  <dd style={{ margin: 0, color: r.text ? '#111827' : '#9ca3af' }}>{r.text ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
