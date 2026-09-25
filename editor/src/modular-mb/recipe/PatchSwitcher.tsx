// Patch kiezen als op een synth (ED-RC-8): bank- en patch-stappers met
// pijltjes, en A/B/C/D-slots om snel tussen patches te wisselen en op je
// oren te vergelijken. Een wissel gaat ook naar de Teensy: zit de patch in
// de laatst gestuurde config (de A/B-set gaat bij een push mee), dan is het
// een selectPatch en houdt de brain zijn modules; anders een nieuwe config.

import { useEffect, useState } from 'react';
import { updateProject } from '../store';
import type { ModularProject, Patch } from '../types';
import { bankPrograms, stepPatch } from './classify';
import { activateOnTeensy, hasPushedPatch, isConnected, sendConfig } from '../teensyLink';

function activate(id: string): void {
  updateProject((p) => {
    const x = p.patches.find((q) => q.id === id);
    return x ? { ...p, activePatchId: x.id, activeRackId: x.rackIds[0] ?? p.activeRackId } : p;
  }, { forceCommit: true });
}

const btn: React.CSSProperties = {
  fontSize: 14, lineHeight: 1, padding: '4px 8px', border: '1px solid #cbd2d9', borderRadius: 6,
  background: '#f8fafc', cursor: 'pointer', color: '#0f172a',
};

export function PatchStepper(props: { project: ModularProject; patch: Patch }): JSX.Element {
  const { project, patch } = props;
  const bp = bankPrograms(project).get(patch.id);
  const [teensy, setTeensy] = useState<string | null>(null);

  // Wissel naar de Teensy doorgeven (alleen bij verbinding).
  useEffect(() => {
    if (!isConnected()) { setTeensy(null); return; }
    let cancelled = false;
    void activateOnTeensy(project).then((how) => {
      if (cancelled) return;
      setTeensy(how === 'select' ? 'Teensy: gewisseld' : how === 'config' ? 'Teensy: config opnieuw gestuurd' : null);
      setTimeout(() => { if (!cancelled) setTeensy(null); }, 2500);
    }).catch(() => { /* link meldt zelf */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch.id]);

  const step = (delta: 1 | -1, scope: 'patch' | 'bank') => {
    const id = stepPatch(project, patch.id, delta, scope);
    if (id && id !== patch.id) activate(id);
  };
  const box: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', border: '1px solid #cbd2d9',
    borderRadius: 8, background: '#fff',
  };
  const lbl: React.CSSProperties = { fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
      <span style={box} title="Bank = map. ◀ ▶ springt naar de vorige/volgende bank.">
        <span style={lbl}>Bank</span>
        <button onClick={() => step(-1, 'bank')} style={btn}>◀</button>
        <span style={{ fontFamily: 'var(--mb-font-mono)', fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{bp?.bank ?? 0}</span>
        <button onClick={() => step(1, 'bank')} style={btn}>▶</button>
        <span style={{ color: '#0f172a', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bp?.bankName ?? ''}</span>
      </span>
      <span style={box} title="Patch = program binnen de bank. ◀ ▶ bladert door de bank (met omslag).">
        <span style={lbl}>Patch</span>
        <button onClick={() => step(-1, 'patch')} style={btn}>◀</button>
        <span style={{ fontFamily: 'var(--mb-font-mono)', fontWeight: 700, minWidth: 26, textAlign: 'center' }}>{String(bp?.program ?? 0).padStart(2, '0')}</span>
        <button onClick={() => step(1, 'patch')} style={btn}>▶</button>
        <strong style={{ color: '#0f172a', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{patch.name}</strong>
      </span>
      <span>· {patch.connections.length} verbindingen</span>
      {teensy && <span style={{ fontSize: 11, color: '#065f46' }}>{teensy}</span>}
    </span>
  );
}

const SLOTS = ['A', 'B', 'C', 'D'] as const;

export function CompareSlots(props: { project: ModularProject; patch: Patch }): JSX.Element {
  const { project, patch } = props;
  const set = (project.compareSet ?? []).filter((id) => project.patches.some((x) => x.id === id));
  const setSet = (next: (string | null)[]) =>
    updateProject((p) => ({ ...p, compareSet: next.filter((x): x is string => !!x) }), { skipHistory: true });
  const slots: (string | null)[] = SLOTS.map((_, i) => set[i] ?? null);
  const sameRack = set.every((id) => project.patches.find((x) => x.id === id)?.rackIds.some((r) => patch.rackIds.includes(r)));
  const allPushed = set.length > 0 && set.every(hasPushedPatch) && hasPushedPatch(patch.id);

  // Toetsen 1–4 wisselen tussen de slots (buiten tekstvelden).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0 && slots[i] && slots[i] !== patch.id) { e.preventDefault(); activate(slots[i]!); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slots, patch.id]);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569' }}
          title="Vergelijken op je oren: klik een leeg slot om de huidige patch erin te zetten, klik een gevuld slot om te wisselen (toetsen 1–4). × haalt hem eruit.">
      <span style={{ marginRight: 2 }}>Vergelijk:</span>
      {SLOTS.map((label, i) => {
        const id = slots[i];
        const name = id ? project.patches.find((x) => x.id === id)?.name ?? '?' : null;
        const isActive = id === patch.id;
        return (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'stretch' }}>
            <button
              onClick={() => { if (!id) { const next = [...slots]; next[i] = patch.id; setSet(next); } else if (!isActive) activate(id); }}
              style={{ ...btn, fontSize: 12, padding: '3px 8px', borderRadius: id ? '6px 0 0 6px' : 6,
                       background: isActive ? 'var(--mb-accent)' : id ? '#e2e8f0' : '#f8fafc',
                       color: isActive ? 'var(--mb-on-accent)' : '#0f172a', fontWeight: isActive ? 700 : 500,
                       maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={name ? `${label}: ${name}` : `${label}: zet de huidige patch hier (${patch.name})`}>
              {label}{name ? ` · ${name}` : ' +'}
            </button>
            {id && (
              <button onClick={() => { const next = [...slots]; next[i] = null; setSet(next); }}
                      style={{ ...btn, fontSize: 11, padding: '3px 5px', borderRadius: '0 6px 6px 0', borderLeft: 'none', color: '#64748b' }}
                      title="Uit de set halen">×</button>
            )}
          </span>
        );
      })}
      {set.length > 0 && !sameRack && (
        <span style={{ fontSize: 11, color: '#b45309' }} title="Patches op verschillende racks: de Teensy krijgt de modules van allebei; wisselen blijft een graph-herbouw.">
          verschillende racks
        </span>
      )}
      {set.length > 0 && isConnected() && !allPushed && (
        <button onClick={() => { void sendConfig(project); }} style={{ ...btn, fontSize: 11 }}
                title="Stuur de set naar de Teensy; daarna wisselt hij zonder nieuwe config.">⇪ Set naar Teensy</button>
      )}
    </span>
  );
}
