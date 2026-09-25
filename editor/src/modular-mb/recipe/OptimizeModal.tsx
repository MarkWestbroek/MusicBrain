// "Optimaliseer racks en patches" (ED-RC-7): rapport eerst, dan bevestigen.
// Alle voorgestelde acties staan aangevinkt; je kunt er afzetten. Toepassen
// is één undo-stap.

import { useMemo, useState } from 'react';
import { updateProject, useModularProject } from '../store';
import { analyzeProject, applyActions, type OptimizeAction } from './optimize';

export function OptimizeModal(props: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { open, onClose } = props;
  const project = useModularProject();
  const [maxDiff, setMaxDiff] = useState(2);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const plan = useMemo(() => {
    try { return { ok: true as const, plan: analyzeProject(project, { maxDiff }) }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [project, maxDiff]);
  // Acties die standaard uit staan (bijna-duplicaten) tellen als "uit" tenzij aangevinkt.
  const [on, setOn] = useState<Set<number>>(new Set());
  const isOn = (i: number, a: OptimizeAction): boolean => (a.defaultOff ? on.has(i) : !off.has(i));

  if (!open) return null;

  const chosen: OptimizeAction[] = plan.ok ? plan.plan.actions.filter((a, i) => isOn(i, a)) : [];
  // Samenvoegingen hangen van elkaar af (gesimuleerd in volgorde); een
  // uitgezette merge maakt latere merges naar hetzelfde rack onzeker, dus
  // die zetten we mee uit.
  function toggle(i: number): void {
    if (plan.ok && plan.plan.actions[i]!.defaultOff) {
      setOn((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
      return;
    }
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      if (plan.ok) {
        const a = plan.plan.actions[i]!;
        if (a.kind === 'mergeRacks' && next.has(i)) {
          plan.plan.actions.forEach((b, j) => { if (j > i && b.kind === 'mergeRacks' && (b.into === a.into || b.into === a.from)) next.add(j); });
        }
      }
      return next;
    });
  }
  function apply(): void {
    try {
      let summary = '';
      updateProject((p) => { const r = applyActions(p, chosen); summary = r.summary + (r.warnings.length ? ` — ${r.warnings.join(' ')}` : ''); return r.project; },
        { forceCommit: true });
      setStatus({ ok: true, text: summary });
      setOff(new Set());
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 720, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const physical = project.racks.filter((r) => r.kind !== 'internal').length;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Optimaliseer racks en patches</h3>
          <label style={{ fontSize: 12, color: '#475569' }}>
            samenvoegen tot{' '}
            <input type="number" min={0} max={16} value={maxDiff} onChange={(e) => { setMaxDiff(Math.max(0, Number(e.target.value) || 0)); setOff(new Set()); }}
                   style={{ width: 44, padding: 3 }} /> afwijkende modules
          </label>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ color: '#475569', margin: '6px 0 10px' }}>
          {physical} fysieke racks, {project.patches.length} patches.
          Identieke of bijna identieke racks worden één rack; de patches delen het en laten elk hun eigen modules ongemoeid.
          Naar de Teensy gaan alleen bekabelde modules, dus een gedeeld rack kost daar niets.
        </div>

        {!plan.ok && <div style={{ color: '#b91c1c' }}>{plan.error}</div>}
        {plan.ok && plan.plan.actions.length === 0 && <div style={{ color: '#065f46' }}>✓ Niets te optimaliseren.</div>}
        {plan.ok && plan.plan.actions.map((a, i) => (
          <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 6,
                                   background: isOn(i, a) ? '#fefce8' : '#f8fafc', marginBottom: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={isOn(i, a)} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontWeight: 600 }}>{a.label}</span>
              <span style={{ display: 'block', color: '#475569', fontSize: 12 }}>{a.detail}</span>
            </span>
          </label>
        ))}
        {plan.ok && plan.plan.skipped.length > 0 && (
          <details style={{ marginTop: 8, color: '#475569', fontSize: 12 }}>
            <summary>Niet samengevoegd ({plan.plan.skipped.length})</summary>
            {plan.plan.skipped.map((s, i) => <div key={i}>"{s.b}" bij "{s.a}": {s.reason}</div>)}
          </details>
        )}

        {status && (
          <div style={{ marginTop: 10, padding: '6px 8px', borderRadius: 6,
                        background: status.ok ? '#ecfdf5' : '#fef2f2', color: status.ok ? '#065f46' : '#991b1b' }}>
            {status.ok ? '✓ ' : '✕ '}{status.text}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onClose}>Sluiten</button>
          <button className="primary" onClick={apply} disabled={chosen.length === 0}>
            Toepassen ({chosen.length})
          </button>
        </div>
      </div>
    </div>
  );
}
