// Rechtsklikmenu in de patcher (ED-RC-2): de werkwoorden uit edits.ts op
// een module of op de patch als geheel.
//   module : Vervang door ▸ · LFO op ▸ · Envelope op ▸ · (OUT) Bus-effect ▸
//   patch  : Stemmen ▸ · Bus-effect toevoegen ▸
//
// Vervangen van een module die ook in andere patches op hetzelfde rack wordt
// gebruikt vraagt eerst hoe ver het moet reiken (alleen hier, eigen rack of
// overal) — anders veranderen die patches ongemerkt mee.

import { useEffect, useMemo, useState } from 'react';
import { updateProject, useModularProject } from '../store';
import { resolvePorts } from '../types';
import { kindOf, shortName, type ModuleKindTag } from './catalog';
import { replaceModule, otherPatchesUsing, setVoices, addBusFx, addModulation, removeModule, type EditResult, type ReplaceScope } from './edits';

export interface MenuAnchor { x: number; y: number; moduleId: string | null }

interface Item { label: string; run?: () => EditResult; sub?: Item[]; disabled?: boolean; ask?: ReplaceAsk }
/** Vervangen van een module die ook elders gebruikt wordt: eerst vragen. */
interface ReplaceAsk { from: string; to: string; users: string[]; run: (scope: ReplaceScope) => EditResult }

export function RecipeContextMenu(props: {
  anchor: MenuAnchor; patchId: string; onClose: () => void;
  onResult: (r: { ok: boolean; text: string }) => void;
}): JSX.Element {
  const { anchor, patchId, onClose, onResult } = props;
  const project = useModularProject();
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [asking, setAsking] = useState<ReplaceAsk | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    const onDown = (): void => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  const items = useMemo((): Item[] => {
    const p = project;
    const types = p.moduleTypes;
    const internal = types.filter((t) => t.internal && t.role !== 'multi');
    const byKind = (kinds: ModuleKindTag[]) => internal.filter((t) => kinds.includes(kindOf(t)));
    const fxItems = (): Item[] => byKind(['fx']).map((t) => ({
      label: shortName(t.id, types), run: () => addBusFx(p, patchId, t.id),
    }));
    const voiceItems: Item = {
      label: 'Stemmen',
      sub: [1, 2, 4, 6, 8, 12, 16].map((n) => ({ label: n === 1 ? 'Mono' : `${n} stemmen`, run: () => setVoices(p, patchId, n) })),
    };
    if (!anchor.moduleId) {
      return [voiceItems, { label: 'Bus-effect toevoegen', sub: fxItems() }];
    }
    const m = p.modules.find((x) => x.id === anchor.moduleId);
    if (!m) return [];
    const t = types.find((x) => x.id === m.typeId);
    const kind = t ? kindOf(t) : undefined;
    const out: Item[] = [];
    if (t?.role !== 'multi') {
      const candidates = (kind === 'source' ? byKind(['source', 'drum', 'noise'])
        : kind === 'filter' ? byKind(['filter'])
        : kind === 'fx' ? byKind(['fx'])
        : kind === 'env' || kind === 'lfo' ? byKind(['env', 'lfo'])
        : internal).filter((x) => x.id !== m.typeId);
      out.push({
        label: `Vervang ${shortName(m.typeId, types)} door`,
        sub: candidates.map((x) => {
          const users = otherPatchesUsing(p, patchId, m.id).map((q) => q.name);
          return {
            label: shortName(x.id, types),
            run: () => replaceModule(p, patchId, m.id, x.id, 'all'),
            ...(users.length ? { ask: {
              from: shortName(m.typeId, types), to: shortName(x.id, types), users,
              run: (scope: ReplaceScope) => replaceModule(p, patchId, m.id, x.id, scope),
            } } : {}),
          };
        }),
      });
    }
    const cvIns = resolvePorts(m, types).filter((q) => q.direction === 'in' && q.signalType === 'cv');
    if (cvIns.length) {
      for (const [label, src] of [['LFO op', 'tp_mmb_lfo'], ['Envelope op', 'tp_mmb_ahdsr']] as const) {
        out.push({
          label,
          sub: cvIns.map((q) => ({ label: q.name || q.id, run: () => addModulation(p, patchId, src, { moduleId: m.id, portId: q.id }) })),
        });
      }
    }
    if (m.typeId === 'tp_mmb_out') out.push({ label: 'Bus-effect vóór OUT', sub: fxItems() });
    else out.push({ label: `Verwijder ${shortName(m.typeId, types)} (audio doorverbinden)`, run: () => removeModule(p, patchId, m.id) });
    out.push(voiceItems);
    return out;
  }, [project, anchor.moduleId, patchId]);

  const fire = (item: Item): void => {
    if (item.ask) { setAsking(item.ask); return; }
    if (item.run) runEdit(item.run);
  };
  const runEdit = (run: () => EditResult): void => {
    try {
      let res: EditResult | null = null;
      updateProject((_p) => { res = run(); return res.project; }, { forceCommit: true });
      const r = res as EditResult | null;
      if (r) onResult({ ok: true, text: r.summary + (r.warnings.length ? ` — ${r.warnings.join(' ')}` : '') });
    } catch (e) {
      onResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    onClose();
  };

  const menu: React.CSSProperties = {
    position: 'fixed', zIndex: 80, background: '#fff', color: '#0f172a',
    border: '1px solid #cbd2d9', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
    minWidth: 190, padding: 4, fontSize: 13,
  };
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 10px',
    cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap',
  };
  if (asking) {
    const choice: React.CSSProperties = {
      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginTop: 6,
      border: '1px solid #cbd2d9', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 13,
    };
    const others = asking.users.length === 1 ? `patch "${asking.users[0]}"` : `${asking.users.length} andere patches (${asking.users.join(', ')})`;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
           onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
        <div style={{ ...menu, position: 'relative', maxWidth: 460, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{asking.from} vervangen door {asking.to}</div>
          <div style={{ color: '#475569' }}>
            Let op: deze {asking.from} wordt ook gebruikt in {others}. Hoe ver moet de vervanging reiken?
          </div>
          <button style={choice} onClick={() => runEdit(() => asking.run('patch'))}>
            <b>Alleen in deze patch</b> — een nieuwe {asking.to} achteraan in het rack; de kabels van deze patch gaan erheen. De {asking.from} blijft voor de andere patches.
          </button>
          <button style={choice} onClick={() => runEdit(() => asking.run('rack'))}>
            <b>Nieuw rack voor deze patch</b> — een kopie van het rack met de {asking.to} erin; de andere patches houden het oude rack.
          </button>
          <button style={choice} onClick={() => runEdit(() => asking.run('all'))}>
            <b>Overal vervangen</b> — ook in {others} (bijvoorbeeld bij een upgrade).
          </button>
          <button style={{ ...choice, background: 'transparent', border: 'none', textAlign: 'center', color: '#64748b' }} onClick={onClose}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  const x = Math.min(anchor.x, window.innerWidth - 220);
  const y = Math.min(anchor.y, window.innerHeight - 40 * Math.max(1, items.length) - 20);

  return (
    <div style={{ ...menu, left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {items.length === 0 && <div style={{ ...row, color: '#94a3b8', cursor: 'default' }}>Geen acties</div>}
      {items.map((it, i) => (
        <div key={it.label} style={{ position: 'relative' }}
             onMouseEnter={() => setOpenSub(it.sub ? i : null)}>
          <div style={{ ...row, background: openSub === i ? '#f1f5f9' : undefined }}
               onClick={() => (it.sub ? setOpenSub(i) : fire(it))}>
            <span>{it.label}</span>{it.sub && <span style={{ color: '#94a3b8' }}>▸</span>}
          </div>
          {it.sub && openSub === i && (
            <div style={{ ...menu, position: 'absolute', left: '100%', top: -4, maxHeight: 360, overflowY: 'auto' }}>
              {it.sub.length === 0 && <div style={{ ...row, color: '#94a3b8', cursor: 'default' }}>—</div>}
              {it.sub.map((s) => (
                <div key={s.label} style={row} onClick={() => fire(s)}
                     onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f1f5f9'; }}
                     onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}>
                  {s.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
