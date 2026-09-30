// MORPH-paneel (ED-MORPH-2): zichtbaar als de actieve patch een morph is. Een
// balk A ····· B met wijzer en een schuif; elke beweging herschrijft de
// morph-patch M(A, B, t) in de store (gewichten op kabels, geïnterpoleerde
// knoppen). Het simulatiepaneel zet die live door (setCableWeight +
// updateControl), zonder rebuild. De MORPH-module met cv-ingang en de
// Teensy-kant komen later (doc/plans/morph-a-b.md).
//
// Spelen met A en B zonder de morph te verlaten: de knoppen A en B zetten de
// schuif helemaal links of rechts; dubbelklik op de schuif = het midden. Staat
// de schuif op een uiteinde, dan ís de morph die patch: een knop die je daar
// draait wordt meteen in A (of B) bewaard, met een melding en Annuleer. In de
// tussenstand wordt niets bewaard (de volgende schuifbeweging rekent opnieuw).

import { useEffect, useMemo, useRef, useState } from 'react';
import { updateProject } from '../store';
import type { ControlValue, ModularProject, Patch } from '../types';
import { morphDescriptor, describeMorph, upsertMorph, morphPatch } from './morph';

/** Knoppen in de morph-patch die afwijken van wat de morph op stand t geeft:
 *  dat heeft iemand gedraaid. */
export function morphEdits(project: ModularProject, patch: Patch): { moduleId: string; controlId: string; value: ControlValue }[] {
  const m = patch.morph;
  if (!m) return [];
  let expected: Patch;
  try { expected = morphPatch(project, morphDescriptor(project, m.a, m.b), m.t); } catch { return []; }
  const out: { moduleId: string; controlId: string; value: ControlValue }[] = [];
  for (const [mid, cs] of Object.entries(patch.controlState)) {
    for (const [cid, v] of Object.entries(cs ?? {})) {
      if (JSON.stringify(v) !== JSON.stringify(expected.controlState[mid]?.[cid])) out.push({ moduleId: mid, controlId: cid, value: v });
    }
  }
  return out;
}

/** Schrijf knopwijzigingen in patch @p targetId (A of B). */
export function writeEditsTo(p: ModularProject, targetId: string, edits: { moduleId: string; controlId: string; value: ControlValue }[]): ModularProject {
  return {
    ...p,
    patches: p.patches.map((x) => {
      if (x.id !== targetId) return x;
      const cs = { ...x.controlState };
      for (const e of edits) cs[e.moduleId] = { ...(cs[e.moduleId] ?? {}), [e.controlId]: e.value };
      return { ...x, controlState: cs };
    }),
  };
}

interface Notice { text: string; undo?: { targetId: string; before: Patch['controlState'] } }

export function MorphPanel(props: { project: ModularProject; patch: Patch }): JSX.Element | null {
  const { project, patch } = props;
  const m = patch.morph;
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const desc = useMemo(() => {
    if (!m) return null;
    try { return { ok: true as const, d: morphDescriptor(project, m.a, m.b) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [project, m]);

  // Knop gedraaid op een uiteinde → meteen in A of B bewaren. Alleen wat
  // sinds de vorige weergave veranderde telt (een oudere morph-patch die net
  // anders is uitgerekend is geen draai van jou).
  const prevCs = useRef<{ id: string; cs: Patch['controlState'] } | null>(null);
  const atEnd = m ? (m.t <= 0 ? m.a : m.t >= 1 ? m.b : null) : null;
  useEffect(() => {
    const last = prevCs.current;
    prevCs.current = { id: patch.id, cs: patch.controlState };
    if (!m || !last || last.id !== patch.id || last.cs === patch.controlState) return;   // eerste weergave of andere patch
    const prev = last.cs;
    const changed = (e: { moduleId: string; controlId: string }) =>
      JSON.stringify(prev[e.moduleId]?.[e.controlId]) !== JSON.stringify(patch.controlState[e.moduleId]?.[e.controlId]);
    const edits = morphEdits(project, patch).filter(changed);
    if (!edits.length) return;
    if (!atEnd) {
      setNotice({ text: 'Tussenstand: een knop die je hier draait wordt niet bewaard — de volgende schuifbeweging rekent opnieuw. Zet de schuif op A of B om daar te bewerken.' });
      return;
    }
    const target = project.patches.find((x) => x.id === atEnd);
    if (!target) return;
    const before = target.controlState;
    updateProject((p) => writeEditsTo(p, atEnd, edits), { forceCommit: true });
    const side = atEnd === m.a ? 'A' : 'B';
    const what = edits.length === 1 ? `${edits[0]!.controlId}` : `${edits.length} knoppen`;
    setNotice({ text: `✓ ${what} bewaard in ${side} · ${target.name}`, undo: { targetId: atEnd, before } });
  }, [patch.controlState]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const A = project.patches.find((x) => x.id === m.a), B = project.patches.find((x) => x.id === m.b);
  const t = m.t;

  function setT(next: number, commit: boolean): void {
    const u = Math.max(0, Math.min(1, next));
    updateProject((p) => {
      try { return upsertMorph(p, m!.a, m!.b, u, patch.id); } catch { return p; }
    }, commit ? { forceCommit: true } : { skipHistory: true });
  }

  function undo(n: Notice): void {
    if (!n.undo) return;
    const { targetId, before } = n.undo;
    updateProject((p) => {
      const q = { ...p, patches: p.patches.map((x) => (x.id === targetId ? { ...x, controlState: before } : x)) };
      try { return upsertMorph(q, m!.a, m!.b, m!.t, patch.id); } catch { return q; }
    }, { forceCommit: true });
    setNotice(null);
  }

  const pct = Math.round(t * 100);
  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#f8fafc', cursor: 'pointer' };
  const on = (v: number): React.CSSProperties => (t === v ? { ...btn, borderColor: 'var(--mb-accent-strong)', fontWeight: 700 } : btn);
  return (
    <div style={{ padding: '8px 12px', marginBottom: 10, border: '1px solid var(--mb-accent-tint-border)',
                  background: 'var(--mb-accent-tint)', borderRadius: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>MORPH</span>
        <button onClick={() => setT(0, true)} style={on(0)} title="Schuif helemaal naar A (links). Knoppen die je daar draait worden in A bewaard.">A · {A?.name ?? '?'}</button>
        {/* Balk met wijzer: de werkelijke stand (later inclusief modulatie). */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220, height: 28 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 4, background: '#cbd2d9', borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: 0, top: 12, height: 4, width: `${pct}%`, background: 'var(--mb-accent)', borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: '50%', top: 9, width: 1, height: 10, background: '#94a3b8' }} />
          <div style={{ position: 'absolute', left: `calc(${pct}% - 7px)`, top: 7, width: 14, height: 14, borderRadius: 7,
                        background: '#fff', border: '2px solid var(--mb-accent-strong)', boxShadow: dragging ? '0 0 0 4px var(--mb-accent-ring)' : undefined,
                        pointerEvents: 'none' }} />
          <input type="range" min={0} max={1000} value={Math.round(t * 1000)}
                 onChange={(e) => setT(Number(e.target.value) / 1000, false)}
                 onMouseDown={() => setDragging(true)}
                 onMouseUp={(e) => { setDragging(false); setT(Number((e.target as HTMLInputElement).value) / 1000, true); }}
                 onKeyUp={(e) => setT(Number((e.target as HTMLInputElement).value) / 1000, true)}
                 onDoubleClick={() => setT(0.5, true)}
                 title="Morph: links A, rechts B · dubbelklik = midden"
                 style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'ew-resize', margin: 0 }} />
        </div>
        <span style={{ fontFamily: 'var(--mb-font-mono)', minWidth: 42, textAlign: 'right' }}>{pct}%</span>
        <button onClick={() => setT(1, true)} style={on(1)} title="Schuif helemaal naar B (rechts). Knoppen die je daar draait worden in B bewaard.">B · {B?.name ?? '?'}</button>
        <span style={{ fontSize: 11, color: desc?.ok ? '#475569' : '#b91c1c' }}>
          {desc?.ok ? describeMorph(project, desc.d) : desc?.error}
          {desc?.ok && desc.d.warnings.length > 0 ? ` · ${desc.d.warnings.join(' ')}` : ''}
        </span>
      </div>
      {notice && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: 12,
                                    color: notice.undo ? '#065f46' : '#92400e' }}>
          <span>{notice.text}</span>
          {notice.undo && <button onClick={() => undo(notice)} style={{ ...btn, padding: '1px 8px' }}>Annuleer</button>}
          <button onClick={() => setNotice(null)} style={{ ...btn, padding: '1px 6px', background: 'transparent', border: 'none' }} aria-label="Sluiten">✕</button>
        </div>
      )}
    </div>
  );
}
