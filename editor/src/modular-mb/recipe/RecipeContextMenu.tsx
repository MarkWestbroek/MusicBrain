// Rechtsklikmenu in de patcher (ED-RC-2): de werkwoorden uit edits.ts op
// een module of op de patch als geheel.
//   module : Vervang door ▸ · LFO op ▸ · Envelope op ▸ · (OUT) Bus-effect ▸
//   patch  : Stemmen ▸ · Bus-effect toevoegen ▸
//
// Vervangen van een module die ook in andere patches op hetzelfde rack wordt
// gebruikt vraagt eerst hoe ver het moet reiken (alleen hier, eigen rack of
// overal) — anders veranderen die patches ongemerkt mee. Verwijderen vraagt
// hetzelfde, zonder "overal" (uit andere patches halen doen we nooit).

import { useEffect, useMemo, useState, useId, useRef } from 'react';
import { updateProject, useModularProject } from '../store';
import { resolvePorts } from '../types';
import { kindOf, shortName, type ModuleKindTag } from './catalog';
import { replaceModule, otherPatchesUsing, setVoices, addBusFx, addModulation, removeModule, type EditResult, type ReplaceScope } from './edits';

export interface MenuAnchor { x: number; y: number; moduleId: string | null }

interface Item { label: string; run?: () => EditResult; sub?: Item[]; disabled?: boolean; ask?: ScopeAsk }
/** Vervangen van een module die ook elders gebruikt wordt: eerst vragen. */
interface ReplaceAsk { kind?: 'replace'; from: string; to: string; users: string[]; run: (scope: ReplaceScope) => EditResult }
/** Verwijderen van een module die ook elders gebruikt wordt: uit deze patch,
 *  of een eigen rack zonder de module. */
interface RemoveAsk { kind: 'remove'; from: string; users: string[]; run: (scope: 'patch' | 'rack') => EditResult }
type ScopeAsk = ReplaceAsk | RemoveAsk;

export function RecipeContextMenu(props: {
  anchor: MenuAnchor; patchId: string; onClose: () => void;
  onResult: (r: { ok: boolean; text: string }) => void;
}): JSX.Element {
  const { anchor, patchId, onClose, onResult } = props;
  const project = useModularProject();
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [asking, setAsking] = useState<ScopeAsk | null>(null);

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
    else {
      const users = otherPatchesUsing(p, patchId, m.id).map((q) => q.name);
      out.push({
        label: `Verwijder ${shortName(m.typeId, types)} (audio doorverbinden)`,
        run: () => removeModule(p, patchId, m.id),
        ...(users.length ? { ask: {
          kind: 'remove' as const, from: shortName(m.typeId, types), users,
          run: (scope: 'patch' | 'rack') => removeModule(p, patchId, m.id, scope),
        } } : {}),
      });
    }
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
    return <ReplaceScopeDialog ask={asking} onCancel={onClose}
      onRun={(scope) => runEdit(() => (asking.kind === 'remove' ? asking.run(scope === 'rack' ? 'rack' : 'patch') : asking.run(scope)))} />;
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

/**
 * Vraag bij "Vervang door" (en "Verwijder") als andere patches de module ook
 * gebruiken: hoe ver moet het reiken? Bij verwijderen zijn er twee keuzes:
 * alleen uit deze patch, of een eigen rack zonder de module. Zelfde vorm als de andere vensters van de editor
 * (kop met ✕, keuzes, Annuleren/Vervangen); "alleen deze patch" staat klaar
 * omdat die niets van andere patches verandert. Enter = vervangen, Esc = annuleren.
 */
export function ReplaceScopeDialog({ ask, onRun, onCancel }: {
  ask: ScopeAsk;
  onRun: (scope: Exclude<ReplaceScope, 'auto'>) => void;
  onCancel: () => void;
}): JSX.Element {
  const [scope, setScope] = useState<Exclude<ReplaceScope, 'auto'>>('patch');
  const titleId = useId();
  const okRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { okRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const names = ask.users.length <= 3 ? ask.users.map((u) => `"${u}"`).join(', ')
    : `${ask.users.slice(0, 3).map((u) => `"${u}"`).join(', ')} en ${ask.users.length - 3} meer`;
  const others = ask.users.length === 1 ? `patch ${names}` : `${ask.users.length} andere patches (${names})`;
  const removing = ask.kind === 'remove';
  const options: { id: Exclude<ReplaceScope, 'auto'>; title: string; detail: string }[] = ask.kind === 'remove' ? [
    { id: 'patch', title: 'Alleen uit deze patch',
      detail: `De kabels van deze patch gaan eraf (audio doorverbonden). De ${ask.from} blijft in het rack voor de andere patches.` },
    { id: 'rack', title: 'Nieuw rack voor deze patch',
      detail: `Een kopie van het rack zonder de ${ask.from}. De andere patches houden het oude rack.` },
  ] : [
    { id: 'patch', title: 'Alleen in deze patch',
      detail: `Een nieuwe ${ask.to} naast de ${ask.from}; de kabels van deze patch gaan erheen. De andere patches houden de ${ask.from}.` },
    { id: 'rack', title: 'Nieuw rack voor deze patch',
      detail: `Een kopie van het rack met de ${ask.to} erin. De andere patches houden het oude rack.` },
    { id: 'all', title: 'Overal vervangen',
      detail: `Ook in ${others}, bijvoorbeeld bij een upgrade.` },
  ];

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', color: '#0f172a', borderRadius: 8, padding: 18, width: 480, maxWidth: '94vw',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  return (
    <div style={overlay} onMouseDown={(e) => { e.stopPropagation(); onCancel(); }}>
      <div style={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(e) => e.stopPropagation()}
           onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); onRun(scope); } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 id={titleId} style={{ margin: 0, flex: 1 }}>{ask.kind === 'remove' ? `${ask.from} verwijderen` : `${ask.from} vervangen door ${ask.to}`}</h3>
          <button onClick={onCancel} aria-label="Sluiten">✕</button>
        </div>
        <div style={{ color: '#475569', margin: '6px 0 12px' }}>
          Deze {ask.from} zit ook in {others}. {removing ? 'Daar blijft hij in elk geval staan.' : 'Hoe ver moet de vervanging reiken?'}
        </div>
        <div role="radiogroup" aria-label={removing ? 'Bereik van het verwijderen' : 'Bereik van de vervanging'}>
          {options.map((o) => {
            const on = scope === o.id;
            return (
              <label key={o.id} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 6, marginBottom: 6, cursor: 'pointer',
                border: on ? '1px solid var(--mb-accent, #d97706)' : '1px solid #e5e7eb', background: on ? '#fefce8' : '#f8fafc',
              }}>
                <input type="radio" name="replace-scope" checked={on} onChange={() => setScope(o.id)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ display: 'block', color: '#475569', fontSize: 12 }}>{o.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onCancel}>Annuleren</button>
          <button ref={okRef} className="primary" onClick={() => onRun(scope)}>{removing ? 'Verwijderen' : 'Vervangen'}</button>
        </div>
      </div>
    </div>
  );
}
