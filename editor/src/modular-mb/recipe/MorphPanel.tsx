// MORPH-paneel (ED-MORPH-2, eerste versie): zichtbaar als de actieve patch
// een morph is. Een balk A ····· B met wijzer en een schuif; elke beweging
// herschrijft de morph-patch M(A, B, t) in de store (gewichten op kabels,
// geïnterpoleerde knoppen). Het simulatiepaneel zet die live door
// (setCableWeight + updateControl), zonder rebuild. De MORPH-module met
// cv-ingang en de Teensy-kant komen later (doc/plans/morph-a-b.md).

import { useMemo, useState } from 'react';
import { updateProject } from '../store';
import type { ModularProject, Patch } from '../types';
import { morphDescriptor, describeMorph, upsertMorph } from './morph';

function activate(id: string): void {
  updateProject((p) => {
    const x = p.patches.find((q) => q.id === id);
    return x ? { ...p, activePatchId: x.id, activeRackId: x.rackIds[0] ?? p.activeRackId } : p;
  }, { forceCommit: true });
}

export function MorphPanel(props: { project: ModularProject; patch: Patch }): JSX.Element | null {
  const { project, patch } = props;
  const m = patch.morph;
  const [dragging, setDragging] = useState(false);
  const desc = useMemo(() => {
    if (!m) return null;
    try { return { ok: true as const, d: morphDescriptor(project, m.a, m.b) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [project, m]);
  if (!m) return null;
  const A = project.patches.find((x) => x.id === m.a), B = project.patches.find((x) => x.id === m.b);
  const t = m.t;

  function setT(next: number, commit: boolean): void {
    const u = Math.max(0, Math.min(1, next));
    updateProject((p) => {
      try { return upsertMorph(p, m!.a, m!.b, u, patch.id); } catch { return p; }
    }, commit ? { forceCommit: true } : { skipHistory: true });
  }

  const pct = Math.round(t * 100);
  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#f8fafc', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', marginBottom: 10,
                  border: '1px solid var(--mb-accent-tint-border)', background: 'var(--mb-accent-tint)', borderRadius: 8, fontSize: 13 }}>
      <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>MORPH</span>
      <button onClick={() => A && activate(A.id)} style={btn} title="Ga naar patch A om te bewerken">A · {A?.name ?? '?'}</button>
      {/* Balk met wijzer: de werkelijke stand (later inclusief modulatie). */}
      <div style={{ position: 'relative', flex: 1, minWidth: 220, height: 28 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 4, background: '#cbd2d9', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 0, top: 12, height: 4, width: `${pct}%`, background: 'var(--mb-accent)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: `calc(${pct}% - 7px)`, top: 7, width: 14, height: 14, borderRadius: 7,
                      background: '#fff', border: '2px solid var(--mb-accent-strong)', boxShadow: dragging ? '0 0 0 4px var(--mb-accent-ring)' : undefined,
                      pointerEvents: 'none' }} />
        <input type="range" min={0} max={1000} value={Math.round(t * 1000)}
               onChange={(e) => setT(Number(e.target.value) / 1000, false)}
               onMouseDown={() => setDragging(true)}
               onMouseUp={(e) => { setDragging(false); setT(Number((e.target as HTMLInputElement).value) / 1000, true); }}
               onKeyUp={(e) => setT(Number((e.target as HTMLInputElement).value) / 1000, true)}
               title="Morph: links A, rechts B"
               style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'ew-resize', margin: 0 }} />
      </div>
      <span style={{ fontFamily: 'var(--mb-font-mono)', minWidth: 42, textAlign: 'right' }}>{pct}%</span>
      <button onClick={() => B && activate(B.id)} style={btn} title="Ga naar patch B om te bewerken">B · {B?.name ?? '?'}</button>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {[0, 0.5, 1].map((v) => (
          <button key={v} onClick={() => setT(v, true)} style={{ ...btn, padding: '3px 7px', fontWeight: t === v ? 700 : 400 }}>{v === 0 ? 'A' : v === 1 ? 'B' : '½'}</button>
        ))}
      </span>
      <span style={{ fontSize: 11, color: desc?.ok ? '#475569' : '#b91c1c' }}>
        {desc?.ok ? describeMorph(project, desc.d) : desc?.error}
        {desc?.ok && desc.d.warnings.length > 0 ? ` · ${desc.d.warnings.join(' ')}` : ''}
      </span>
    </div>
  );
}
