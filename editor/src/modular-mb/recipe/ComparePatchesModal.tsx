// Twee patches vergelijken (ED-RC-8): kabels die alleen in A of B liggen en
// knopstanden die verschillen, zonder tussen tabs te hoeven wisselen.
// Rekenwerk in optimize.ts (diffPatches); dit is alleen de weergave.

import { useMemo, useState } from 'react';
import { useModularProject } from '../store';
import { diffPatches } from './optimize';

export function ComparePatchesModal(props: { open: boolean; onClose: () => void; initialA?: string; initialB?: string }): JSX.Element | null {
  const { open, onClose, initialA, initialB } = props;
  const project = useModularProject();
  const [a, setA] = useState<string>(initialA ?? project.activePatchId ?? project.patches[0]?.id ?? '');
  const [b, setB] = useState<string>(initialB ?? '');

  // Standaard B: de patch die het meest op A lijkt (zelfde kabels, of de minste verschillen).
  const suggestion = useMemo(() => {
    if (!a) return '';
    let best = '', score = Infinity;
    for (const x of project.patches) {
      if (x.id === a) continue;
      try {
        const d = diffPatches(project, a, x.id);
        const s = d.onlyA.length + d.onlyB.length + d.controls.length * 0.01 + (d.voices ? 100 : 0);
        if (s < score) { score = s; best = x.id; }
      } catch { /* overslaan */ }
    }
    return best;
  }, [project, a]);
  const bId = b || suggestion;
  const diff = useMemo(() => {
    if (!a || !bId || a === bId) return null;
    try { return diffPatches(project, a, bId); } catch { return null; }
  }, [project, a, bId]);

  if (!open) return null;
  const name = (id: string) => project.patches.find((x) => x.id === id)?.name ?? '?';
  const sel = (v: string, set: (s: string) => void, label: string) => (
    <label style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
      {label}
      <select value={v} onChange={(e) => set(e.target.value)} style={{ fontSize: 13 }}>
        <option value="">—</option>
        {project.patches.map((x) => <option key={x.id} value={x.id}>{x.folder ? `${x.folder} / ` : ''}{x.name}</option>)}
      </select>
    </label>
  );
  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const panel: React.CSSProperties = { background: '#fff', borderRadius: 8, padding: 18, width: 760, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13 };
  const td: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid #f1f5f9', fontFamily: 'var(--mb-font-mono)', fontSize: 12 };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Vergelijk twee patches</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12, margin: '10px 0' }}>
          {sel(a, setA, 'A')}
          {sel(bId, setB, b ? 'B' : 'B (meest gelijkend)')}
        </div>
        {!diff && <div style={{ color: '#64748b' }}>Kies twee verschillende patches.</div>}
        {diff && (
          <>
            <div style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 10,
                          background: diff.identical ? '#ecfdf5' : diff.sameTopology ? '#fefce8' : '#f8fafc',
                          color: diff.identical ? '#065f46' : '#0f172a' }}>
              {diff.identical ? '✓ Identiek: zelfde kabels, knopstanden en stemmen. Eén van de twee kan weg (Optimaliseer racks… ontdubbelt).'
                : diff.sameTopology ? `Zelfde kabels en stemmen; ${diff.controls.length} knop${diff.controls.length === 1 ? '' : 'pen'} anders.`
                : `${diff.onlyA.length + diff.onlyB.length} kabel${diff.onlyA.length + diff.onlyB.length === 1 ? '' : 's'} verschillen` +
                  (diff.voices ? `, stemmen ${diff.voices[0]} ↔ ${diff.voices[1]}` : '') +
                  (diff.controls.length ? `, ${diff.controls.length} knoppen anders` : '') + '.'}
              {diff.racks && <div style={{ fontSize: 12, color: '#64748b' }}>Racks: {diff.racks[0]} ↔ {diff.racks[1]} (vergelijking op type-niveau).</div>}
            </div>
            {(diff.onlyA.length > 0 || diff.onlyB.length > 0) && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ padding: '3px 8px' }}>Alleen in A · {name(a)}</th>
                  <th style={{ padding: '3px 8px' }}>Alleen in B · {name(bId)}</th>
                </tr></thead>
                <tbody>
                  {Array.from({ length: Math.max(diff.onlyA.length, diff.onlyB.length) }, (_, i) => (
                    <tr key={i}><td style={td}>{diff.onlyA[i] ?? ''}</td><td style={td}>{diff.onlyB[i] ?? ''}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {diff.controls.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ padding: '3px 8px' }}>Module</th><th style={{ padding: '3px 8px' }}>Knop</th>
                  <th style={{ padding: '3px 8px' }}>A</th><th style={{ padding: '3px 8px' }}>B</th>
                </tr></thead>
                <tbody>
                  {diff.controls.map((c, i) => (
                    <tr key={i}>
                      <td style={td}>{c.module}</td><td style={td}>{c.control}</td>
                      <td style={td}>{String(c.a ?? '—')}</td><td style={td}>{String(c.b ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
