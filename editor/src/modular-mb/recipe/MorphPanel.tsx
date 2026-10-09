// MORPH-paneel (ED-MORPH-2): zichtbaar als de actieve patch een morph is. Een
// balk A ····· B met wijzer en een schuif; elke beweging herschrijft de
// morph-patch M(A, B, t) in de store (gewichten op kabels, geïnterpoleerde
// knoppen). Het simulatiepaneel zet die live door (setCableWeight +
// updateControl), zonder rebuild. De MORPH-module met cv-ingang en de
// Teensy-kant komen later (doc/plans/morph-a-b.md).
//
// Spelen met A en B zonder de morph te verlaten: de knoppen A en B zetten de
// schuif helemaal links of rechts; dubbelklik op de schuif = het midden.
// Draaien aan knoppen verandert alleen de morph (de volgende schuifbeweging
// rekent opnieuw); A en B veranderen nooit vanzelf. Bewaren is een bewuste
// keuze in het menu Bewaar ▾ bovenaan (MorphSaveMenu): in A, in B, als nieuwe
// patch, of als nieuwe patch die meteen op A of B komt.

import { useEffect, useMemo, useRef, useState } from 'react';
import { cmiTeensyFrames } from '../cmiSync';
import { getProject, updateProject, uid } from '../store';
import { isConnected, sendWaveform } from '../teensyLink';
import type { ControlValue, ModularProject, Patch } from '../types';
import { morphDescriptor, describeMorph, upsertMorph, morphPatch } from './morph';
import { savePatch } from './saved';

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

/** De morph-patch: welke kant, welke patch. */
function sides(p: ModularProject, morphId: string): { mp: Patch; a: string; b: string; t: number } | null {
  const mp = p.patches.find((x) => x.id === morphId);
  return mp?.morph ? { mp, a: mp.morph.a, b: mp.morph.b, t: mp.morph.t } : null;
}

/**
 * Bewaar de huidige stand van de morph (knopstanden) in A of B, en zet de
 * schuif op die kant — dan hoor je precies wat je bewaarde. Kabels van A/B
 * blijven zoals ze zijn. Twee stappen voor de store: eerst schrijven, dan
 * bewaren (anders markeert de dirty-tracking hem meteen weer als gewijzigd).
 */
export function saveMorphInto(p: ModularProject, morphId: string, side: 'a' | 'b'): { write: ModularProject; commit: (q: ModularProject) => ModularProject } | null {
  const s = sides(p, morphId);
  if (!s) return null;
  const target = side === 'a' ? s.a : s.b;
  const write = {
    ...p,
    patches: p.patches.map((x) => (x.id === target ? { ...x, controlState: { ...x.controlState, ...structuredClone(s.mp.controlState) } } : x)),
  };
  const commit = (q: ModularProject): ModularProject => {
    const saved = savePatch(q, target);
    try { return upsertMorph(saved, s.a, s.b, side === 'a' ? 0 : 1, morphId); } catch { return saved; }
  };
  return { write, commit };
}

/**
 * Bewaar de huidige stand als nieuwe patch: de knopstanden van de morph en
 * de kabels die op de Teensy ook aan zouden staan (gewicht ≥ 0,5). Met
 * @p place komt de nieuwe patch meteen op A of B van de morph (schuif naar
 * die kant). Geeft ook de nieuwe id terug.
 */
export function saveMorphAsNew(p: ModularProject, morphId: string, name: string, place?: 'a' | 'b'): { project: ModularProject; id: string } | null {
  const s = sides(p, morphId);
  if (!s) return null;
  const base = p.patches.find((x) => x.id === s.a);
  if (!base) return null;
  const id = uid('patch');
  const { saved: _s, showingSaved: _v, programNumber: _pn, morph: _m, ...rest } = base; void _s; void _v; void _pn; void _m;
  const copy: Patch = {
    ...(structuredClone(rest) as Patch), id, name,
    connections: s.mp.connections
      .filter((c) => c.attenuation === undefined || c.attenuation >= 0.5)
      .map((c) => { const { attenuation: _a, ...r } = c; void _a; return structuredClone(r); }),
    controlState: structuredClone(s.mp.controlState),
  };
  let q: ModularProject = { ...p, patches: [...p.patches, copy] };
  if (place) {
    try { q = upsertMorph(q, place === 'a' ? id : s.a, place === 'b' ? id : s.b, place === 'a' ? 0 : 1, morphId); } catch { /* laat staan */ }
  }
  return { project: q, id };
}

export function MorphPanel(props: { project: ModularProject; patch: Patch }): JSX.Element | null {
  const { project, patch } = props;
  const m = patch.morph;
  const [dragging, setDragging] = useState(false);
  const lastCmiPush = useRef(0);
  const desc = useMemo(() => {
    if (!m) return null;
    try { return { ok: true as const, d: morphDescriptor(project, m.a, m.b) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [project, m]);

  // Knoppen die je in de morph draaide (sinds de laatste schuifbeweging): niet
  // bewaard. Alleen wat sinds de vorige weergave veranderde telt — een oudere
  // morph-patch die net anders is uitgerekend is geen draai van jou.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const prevCs = useRef<{ id: string; cs: Patch['controlState'] } | null>(null);
  useEffect(() => {
    const last = prevCs.current;
    prevCs.current = { id: patch.id, cs: patch.controlState };
    if (!m || !last || last.id !== patch.id) { setTouched(new Set()); return; }
    if (last.cs === patch.controlState) return;
    const prev = last.cs;
    const edits = morphEdits(project, patch).filter((e) =>
      JSON.stringify(prev[e.moduleId]?.[e.controlId]) !== JSON.stringify(patch.controlState[e.moduleId]?.[e.controlId]));
    if (edits.length) setTouched((t) => new Set([...t, ...edits.map((e) => `${e.moduleId}.${e.controlId}`)]));
  }, [patch.controlState, patch.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const A = project.patches.find((x) => x.id === m.a), B = project.patches.find((x) => x.id === m.b);
  const t = m.t;

  function setT(next: number, commit: boolean): void {
    const u = Math.max(0, Math.min(1, next));
    setTouched(new Set());
    updateProject((p) => {
      try { return upsertMorph(p, m!.a, m!.b, u, patch.id); } catch { return p; }
    }, commit ? { forceCommit: true } : { skipHistory: true });
    // CMI-profielen morphen mee; de Teensy krijgt de gemengde golfvormen
    // een paar keer per seconde (de simulator haalt ze uit de patch).
    const now = performance.now();
    if (isConnected() && (commit || now - lastCmiPush.current > 200)) {
      lastCmiPush.current = now;
      const proj = getProject(), mp = proj.patches.find((x) => x.id === patch.id);
      if (mp) for (const f of cmiTeensyFrames(proj, mp)) void sendWaveform(f.id, f.data);
    }
  }

  const pct = Math.round(t * 100);
  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#f8fafc', cursor: 'pointer' };
  const on = (v: number): React.CSSProperties => (t === v ? { ...btn, borderColor: 'var(--mb-accent-strong)', fontWeight: 700 } : btn);
  return (
    <div style={{ padding: '8px 12px', marginBottom: 10, border: '1px solid var(--mb-accent-tint-border)',
                  background: 'var(--mb-accent-tint)', borderRadius: 8, fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>MORPH</span>
        <button onClick={() => setT(0, true)} style={on(0)} title="Schuif helemaal naar A (links)">A · {A?.name ?? '?'}</button>
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
        <button onClick={() => setT(1, true)} style={on(1)} title="Schuif helemaal naar B (rechts)">B · {B?.name ?? '?'}</button>
        <span style={{ fontSize: 11, color: desc?.ok ? '#475569' : '#b91c1c' }}>
          {desc?.ok ? describeMorph(project, desc.d) : desc?.error}
          {desc?.ok && desc.d.warnings.length > 0 ? ` · ${desc.d.warnings.join(' ')}` : ''}
        </span>
      </div>
      {touched.size > 0 && (
        <div role="status" style={{ marginTop: 6, fontSize: 12, color: '#92400e' }}>
          ● {touched.size === 1 ? '1 knop' : `${touched.size} knoppen`} gewijzigd in de morph — niet bewaard.
          A en B veranderen niet vanzelf; een schuifbeweging rekent opnieuw. Bewaren: <b>Bewaar ▾</b> bovenaan.
        </div>
      )}
    </div>
  );
}

/**
 * Bewaar-menu voor een morph (staat bovenaan op de plek van "Bewaar als…").
 * Alles is een bewuste keuze: A of B overschrijven vraagt eerst bevestiging,
 * een nieuwe patch vraagt een naam.
 */
export function MorphSaveMenu(props: { project: ModularProject; patch: Patch }): JSX.Element | null {
  const { project, patch } = props;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const m = patch.morph;
  if (!m) return null;
  const A = project.patches.find((x) => x.id === m.a), B = project.patches.find((x) => x.id === m.b);
  const pct = Math.round(m.t * 100);
  const flash = (text: string): void => { setDone(text); setTimeout(() => setDone(null), 4000); };

  function into(side: 'a' | 'b'): void {
    const target = side === 'a' ? A : B;
    if (!target) return;
    if (!window.confirm(`De knopstanden van de morph (stand ${pct}%) bewaren in ${side.toUpperCase()} · "${target.name}"?\n\nDat overschrijft de knoppen van die patch (kabels blijven). De schuif gaat daarna naar ${side.toUpperCase()}.`)) return;
    const r = saveMorphInto(project, patch.id, side);
    if (!r) return;
    updateProject(() => r.write, { forceCommit: true });
    updateProject((q) => r.commit(q), { forceCommit: true });
    flash(`✓ Bewaard in ${side.toUpperCase()} · ${target.name}`);
  }
  function asNew(place?: 'a' | 'b'): void {
    const suggested = `${A?.name ?? 'A'} ⇄ ${B?.name ?? 'B'} ${pct}%`;
    const name = window.prompt(place ? `Nieuwe patch uit de huidige stand (${pct}%), daarna op ${place.toUpperCase()} van de morph. Naam:` : `Nieuwe patch uit de huidige stand (${pct}%). Naam:`, suggested);
    if (name === null) return;
    let id = '';
    updateProject((q) => { const r = saveMorphAsNew(q, patch.id, name.trim() || suggested, place); if (!r) return q; id = r.id; return r.project; }, { forceCommit: true });
    if (id) flash(place ? `✓ Nieuwe patch "${name.trim() || suggested}" staat op ${place.toUpperCase()}` : `✓ Nieuwe patch "${name.trim() || suggested}"`);
  }

  const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' };
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' }}
              title="De huidige stand van de morph bewaren: in A, in B of als nieuwe patch" aria-haspopup="menu" aria-expanded={open}>
        Bewaar ▾
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4, background: '#fff', color: '#0f172a',
                                  border: '1px solid #cbd2d9', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.2)', padding: 4 }}
             onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" style={item} onClick={pick(() => into('a'))}>Bewaar in A · {A?.name ?? '?'}</button>
          <button role="menuitem" style={item} onClick={pick(() => into('b'))}>Bewaar in B · {B?.name ?? '?'}</button>
          <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />
          <button role="menuitem" style={item} onClick={pick(() => asNew())}>Als nieuwe patch…</button>
          <button role="menuitem" style={item} onClick={pick(() => asNew('a'))}>Als nieuwe patch, en zet hem op A…</button>
          <button role="menuitem" style={item} onClick={pick(() => asNew('b'))}>Als nieuwe patch, en zet hem op B…</button>
        </div>
      )}
      {done && <span role="status" style={{ fontSize: 12, color: '#065f46' }}>{done}</span>}
    </span>
  );
}
