// Patch-pool in de editor (doc/plans/patch-pool.md §6):
//   ⤴ Voorstellen — de actieve patch (of een vraag erover) naar musicbrain.nl,
//     met de take erbij: de laatste opname van deze patch, of een demo die de
//     sim zelf opneemt.
//   📚 Patches — bladeren in de pool, demo beluisteren, laden als nieuwe patch
//     (met een compatibiliteitsregel: welke moduletypes deze editor mist).
// Openen via openPropose(patchId) / openPoolBrowser(); hosts in ModularMbApp.

import { useEffect, useRef, useState } from 'react';
import { getProject, updateProject, uid } from '../store';
import { seedInternals } from '../seedModules';
import { getEngine } from './engineSingleton';
import { loadLibrarySettings, uploadTakeWithExtras, renameTake, splitTakeName, slugName, type LibrarySettings } from './mediaLibrary';
import { patchSnapshot, slimSnapshot } from './midiRecorder';
import { patchRequires, missingTypes } from './patchRequires';
import { encodePatchSysex, joinSysex, SYSEX_CMD } from './patchSysex';
import { buildConfigPayload } from '../teensyLink';
import { proposePatch, listPool, fetchPatchFile, rememberOrigin, originOf, siteBase, assetUrl, type PoolItem, type Pool, type License } from './patchPool';
import { recordDemo } from './demoTake';
import { lastTakeFor, setLastTake, markUploaded, onLastTake } from './lastTakeStore';
import { listTakes, addPatchSnapshot } from './takeLibrary';
import { offerPatch } from './PatchInbox';
import type { ModularProject } from '../types';

// ── open/dicht ───────────────────────────────────────────────────────────
type Win = { kind: 'propose'; patchId: string } | { kind: 'browse' } | null;
let current: Win = null;
const listeners = new Set<(w: Win) => void>();
function set(w: Win): void { current = w; listeners.forEach((fn) => fn(w)); }
export function openPropose(patchId: string): void { set({ kind: 'propose', patchId }); }
export function openPoolBrowser(): void { set({ kind: 'browse' }); }
export function closePoolWindows(): void { set(null); }

export function PoolWindowsHost(): JSX.Element | null {
  const [w, setW] = useState<Win>(current);
  useEffect(() => { listeners.add(setW); return () => { listeners.delete(setW); }; }, []);
  if (!w) return null;
  return w.kind === 'propose' ? <ProposeDialog patchId={w.patchId} onClose={closePoolWindows} /> : <PoolBrowser onClose={closePoolWindows} />;
}

/** Een patch uit de pool ophalen en via de inbox aanbieden (ook voor ?patch=<slug>). */
export async function offerFromPool(slug: string, s: LibrarySettings = loadLibrarySettings()): Promise<void> {
  const [item] = await listPool({ slug }, s);
  if (!item) throw new Error(`Patch "${slug}" niet gevonden in de pool.`);
  const json = await fetchPatchFile(item, s);
  offerPatch(json, `musicbrain.nl (${item.title})`, { slug: item.slug, missing: item.requires ? missingTypes(item.requires, getProject()) : [] });
}

const TAG_SUGGESTIONS = ['lead', 'pad', 'bas', 'drums', 'fx', 'keys', 'koper', 'strijkers', 'subtractief', 'fm', 'fysisch', 'wavetable', 'sampler', 'sid', 'mono', 'poly'];

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 62, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const panel: React.CSSProperties = { background: '#fff', color: '#0f172a', borderRadius: 8, padding: 18, width: 640, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#475569', marginTop: 10 };

// ── ⤴ Voorstellen ─────────────────────────────────────────────────────────
function ProposeDialog({ patchId, onClose }: { patchId: string; onClose: () => void }): JSX.Element {
  const project = getProject();
  const patch = project.patches.find((p) => p.id === patchId);
  const [kind, setKind] = useState<'proposal' | 'question'>('proposal');
  const [title, setTitle] = useState(patch?.name ?? '');
  const [description, setDescription] = useState(patch?.description ?? '');
  const [question, setQuestion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [license, setLicense] = useState<License>('CC-BY-4.0');
  const [withTake, setWithTake] = useState(true);
  const [, bump] = useState(0);
  useEffect(() => onLastTake(() => bump((x) => x + 1)), []);
  const [demoFrac, setDemoFrac] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const lib = loadLibrarySettings();
  const existing = lastTakeFor(patchId);
  const derivedFrom = originOf(patchId);

  if (!patch) return <div style={overlay} onMouseDown={onClose}><div style={panel}>Patch niet gevonden.</div></div>;
  const snap = patchSnapshot(project, patch);
  const req = patchRequires(snap);

  async function demo(): Promise<void> {
    if (!patch) return;
    if (project.activePatchId !== patchId) { updateProject((p) => ({ ...p, activePatchId: patchId })); await new Promise((r) => setTimeout(r, 300)); }
    setBusy('demo'); setMsg(null); setDemoFrac(0);
    try {
      const take = await recordDemo(getEngine(), getProject(), patch, setDemoFrac);
      setLastTake(patchId, take);
      setWithTake(true);
      setMsg({ ok: true, text: `Demo opgenomen (${(take.files[0]!.blob.size / 1024 / 1024).toFixed(1)} MB).` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); setDemoFrac(null); }
  }

  async function send(): Promise<void> {
    if (!patch) return;
    if (!title.trim()) { setMsg({ ok: false, text: 'Geef de patch een naam.' }); return; }
    if (kind === 'question' && !question.trim()) { setMsg({ ok: false, text: 'Schrijf je vraag.' }); return; }
    if (!lib.token.trim()) { setMsg({ ok: false, text: 'Geen API-token: zet hem bij ⚙ Library in de Simulatie-tab.' }); return; }
    setBusy('send'); setMsg(null);
    try {
      const group = `mmb-${slugName(title) || 'patch'}-${splitTakeName(existing?.take.group ?? '').stamp || stamp()}`;
      const takes: string[] = [];
      if (withTake && existing) {
        let g = existing.uploadedGroup;
        if (!g) {
          const t = renameTake(existing.take, title);
          const r = await uploadTakeWithExtras(t, lib);
          if (r.assets.length) { g = t.group; markUploaded(patchId, g); }
        }
        if (g) takes.push(g);
      }
      const slim = slimSnapshot(snap);
      const syx = joinSysex([...await encodePatchSysex(SYSEX_CMD.firmwareConfig, buildConfigPayload(snap).json), ...await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify(slim))]);
      const item = await proposePatch(
        { kind, title, description, tags, license, requires: req, derivedFrom, question },
        { group: `${group}-patch`, patchJson: new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' }), syx: new Blob([syx], { type: 'application/octet-stream' }) },
        takes, lib,
      );
      setSent(true);
      setMsg({ ok: true, text: kind === 'question' ? `Vraag geplaatst als "${item.slug}".` : `Voorgesteld als "${item.slug}"; Mark beoordeelt hem.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  }

  return (
    <div style={overlay} onMouseDown={(e) => { if (busy === null) onClose(); e.stopPropagation(); }}>
      <div style={panel} role="dialog" aria-label="Patch voorstellen" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>{kind === 'question' ? 'Vraag stellen over' : 'Voorstellen voor de pool'}: {patch.name}</h3>
          <button onClick={onClose} aria-label="Sluiten" disabled={busy !== null}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label><input type="radio" checked={kind === 'proposal'} onChange={() => setKind('proposal')} /> voorstel voor de pool</label>
          <label><input type="radio" checked={kind === 'question'} onChange={() => setKind('question')} /> vraag ("lukt niet, wie helpt?")</label>
        </div>
        <label style={lbl}>Naam <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></label>
        <label style={lbl}>Beschrijving (wat is het, hoe speel je het)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: '100%' }} />
        </label>
        {kind === 'question' && (
          <label style={lbl}>Je vraag <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="Ik probeer … maar …" /></label>
        )}
        <div style={lbl}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {TAG_SUGGESTIONS.map((t) => (
            <button key={t} onClick={() => setTags((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid #cbd2d9', background: tags.includes(t) ? '#fefce8' : '#fff', fontWeight: tags.includes(t) ? 600 : 400 }}
              aria-pressed={tags.includes(t)}>{t}</button>
          ))}
        </div>
        <div style={lbl}>Demo (take)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {existing
            ? <label><input type="checkbox" checked={withTake} onChange={(e) => setWithTake(e.target.checked)} /> take meesturen: {existing.take.group}{existing.uploadedGroup ? ' (al in de library)' : ''}</label>
            : <span style={{ color: '#6b7280' }}>Nog geen opname van deze patch.</span>}
          <button onClick={() => void demo()} disabled={busy !== null} title="De sim speelt een vaste testsequentie (loopje, akkoord, modwheel, aftertouch) door deze patch en neemt wav + mid op; ~12 s">
            {busy === 'demo' ? `… opnemen ${Math.round((demoFrac ?? 0) * 100)}%` : existing ? '⏺ Demo opnieuw opnemen' : '⏺ Demo opnemen'}
          </button>
        </div>
        <div style={lbl}>Licentie</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label title="Delen en bewerken mag, ook commercieel, met je naam erbij"><input type="radio" checked={license === 'CC-BY-4.0'} onChange={() => setLicense('CC-BY-4.0')} /> CC BY 4.0 (naam noemen)</label>
          <label title="Iedereen mag alles, zonder voorwaarden"><input type="radio" checked={license === 'CC0'} onChange={() => setLicense('CC0')} /> CC0 (vrijgeven)</label>
        </div>
        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 10 }}>
          Mee: editor {req.editorVersion || '?'}, contract {req.firmwareContract || '?'}, {req.moduleTypes.length} moduletypes, .syx voor de Teensy
          {derivedFrom ? `, afgeleid van "${derivedFrom}"` : ''}.
        </div>
        {msg && <div style={{ marginTop: 10, padding: '6px 8px', borderRadius: 6, background: msg.ok ? '#ecfdf5' : '#fef2f2', color: msg.ok ? '#065f46' : '#991b1b' }}>{msg.ok ? '✓ ' : '✕ '}{msg.text}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} disabled={busy !== null}>{sent ? 'Sluiten' : 'Annuleren'}</button>
          {!sent && <button className="primary" onClick={() => void send()} disabled={busy !== null}>{busy === 'send' ? '… versturen' : kind === 'question' ? '⤴ Vraag plaatsen' : '⤴ Voorstellen'}</button>}
        </div>
      </div>
    </div>
  );
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ── 📚 Patches ────────────────────────────────────────────────────────────
const POOLS: { id: Pool; label: string; hint: string }[] = [
  { id: 'centraal', label: 'Basisset', hint: 'de patches die bij de editor horen' },
  { id: 'experimenteel', label: 'Lab', hint: 'werkt, maar geen belofte' },
  { id: 'vraag', label: 'Vragen', hint: 'patches waar iemand hulp bij zoekt' },
  { id: 'voorstel', label: 'Voorstellen', hint: 'wachten op beoordeling (alleen eigen en admin)' },
];

function PoolBrowser({ onClose }: { onClose: () => void }): JSX.Element {
  const lib = loadLibrarySettings();
  const [pool, setPool] = useState<Pool>('centraal');
  const [tag, setTag] = useState('');
  const [items, setItems] = useState<PoolItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [demos, setDemos] = useState<Record<string, string | null>>({});   // slug → wav-url
  const project = getProject();
  const reqRef = useRef(0);

  async function refresh(): Promise<void> {
    const n = ++reqRef.current;
    setBusy('lijst'); setMsg(null);
    try {
      const list = await listPool({ pool, tag }, lib);
      if (n !== reqRef.current) return;
      setItems(list);
    } catch (e) { if (n === reqRef.current) { setItems(null); setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } }
    finally { if (n === reqRef.current) setBusy(null); }
  }
  useEffect(() => { void refresh(); }, [pool]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function demoUrl(it: PoolItem): Promise<string | null> {
    if (it.slug in demos) return demos[it.slug]!;
    let url: string | null = null;
    try {
      const g = it.takes?.[0];
      if (g) { const t = (await listTakes(lib, {})).find((x) => x.group === g); url = t?.wav?.url ?? null; }
    } catch { url = null; }
    setDemos((d) => ({ ...d, [it.slug]: url }));
    return url;
  }

  async function load(it: PoolItem): Promise<void> {
    setBusy(it.slug); setMsg(null);
    try {
      const json = await fetchPatchFile(it, lib);
      const snap = JSON.parse(json) as ModularProject;
      let newId = '';
      updateProject((p) => { const r = addPatchSnapshot(seedInternals(p), snap, it.title, uid); newId = r.activePatchId ?? ''; return r; }, { forceCommit: true });
      if (newId) rememberOrigin(newId, it.slug);
      setMsg({ ok: true, text: `"${it.title}" toegevoegd als nieuwe patch en actief.` });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  }

  const base = siteBase(lib);
  return (
    <div style={overlay} onMouseDown={(e) => { onClose(); e.stopPropagation(); }}>
      <div style={{ ...panel, width: 760 }} role="dialog" aria-label="Patches van musicbrain.nl" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>📚 Patches van musicbrain.nl</h3>
          <a href={`${base}/patches`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>op de site ↗</a>
          <button onClick={onClose} aria-label="Sluiten">✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {POOLS.map((p) => (
            <button key={p.id} onClick={() => setPool(p.id)} aria-pressed={pool === p.id} title={p.hint}
              style={pool === p.id ? { fontWeight: 700, background: '#e0f2fe' } : undefined}>{p.label}</button>
          ))}
          <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void refresh(); }} placeholder="tag" style={{ width: 110, marginLeft: 8 }} />
          <button onClick={() => void refresh()} disabled={busy === 'lijst'}>{busy === 'lijst' ? '…' : '↻'}</button>
          {items && <span style={{ color: '#6b7280', fontSize: 12 }}>{items.length} patch{items.length === 1 ? '' : 'es'}</span>}
        </div>
        {msg && <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: msg.ok ? '#ecfdf5' : '#fef2f2', color: msg.ok ? '#065f46' : '#991b1b' }}>{msg.ok ? '✓ ' : '✕ '}{msg.text}</div>}
        {items?.length === 0 && <div style={{ color: '#6b7280', marginTop: 10 }}>Niets in deze pool{tag ? ` met tag "${tag}"` : ''}.</div>}
        {items?.map((it) => {
          const missing = it.requires ? missingTypes(it.requires, project) : [];
          return (
            <div key={it.slug} style={{ borderTop: '1px solid #e5e7eb', padding: '8px 0', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <div>
                <div><strong>{it.title}</strong>{it.author ? <span style={{ color: '#6b7280' }}> · {it.author}</span> : null}
                  {it.tags?.map((t) => <span key={t} style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 8, background: '#f1f5f9' }}>{t}</span>)}</div>
                {it.description && <div style={{ color: '#475569', marginTop: 2 }}>{it.description}</div>}
                {it.pool === 'vraag' && it.question && <div style={{ marginTop: 2 }}><em>Vraag:</em> {it.question}{it.answered ? ' ✓ beantwoord' : ''}</div>}
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                  {it.requires ? `editor ${it.requires.editorVersion || '?'} · contract ${it.requires.firmwareContract || '?'} · ${it.requires.moduleTypes.length} moduletypes` : ''}
                  {it.license ? ` · ${it.license}` : ''}{it.derivedFrom ? ` · afgeleid van ${it.derivedFrom}` : ''}
                </div>
                {missing.length > 0 && <div style={{ color: '#b45309', fontSize: 12, marginTop: 2 }}>⚠ Deze editor kent {missing.join(', ')} niet; laden kan, maar die modules blijven stil.</div>}
                {it.slug in demos && demos[it.slug] && <audio controls preload="none" src={demos[it.slug]!} style={{ height: 28, marginTop: 4 }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <button onClick={() => void load(it)} disabled={busy !== null} title="Als nieuwe patch toevoegen; je eigen patches blijven staan">{busy === it.slug ? '…' : '⤵ Laden'}</button>
                {it.takes?.length ? <button onClick={() => void demoUrl(it)} disabled={it.slug in demos} title="Demo beluisteren">▶ demo</button> : null}
                <a href={`${base}/patches/${encodeURIComponent(it.slug)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>pagina ↗</a>
                <a href={assetUrl(it.file, lib)} download style={{ fontSize: 12 }}>⤓ .patch.json</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
