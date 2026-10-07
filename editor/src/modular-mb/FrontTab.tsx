// Front-tab (doc/plans/patch-front.md §6): de fronts van de actieve patch
// naast het automatische front, als virtueel paneel; rechts de bewerker
// voor een opgeslagen front (naam, uitleg, kolommen, items: label, grootte,
// volgorde, kopjes). Draaien op het front wijzigt de patch; bewerken van
// het front zit in de bewaarcyclus van de patch (recipe/saved.ts) en in
// undo/redo. In de spelermodus (`expert` uit) is er geen bewerker.
//
// Kiezen welke knoppen, displays en jacks erop staan kan hier met
// "+ Toevoegen" (een lijst per module om aan te tikken; werkt ook op een
// telefoon, waar geen rechtsklik is), of in rack en patcher (rechtsklik →
// "Op front zetten", of de frontvelden in de eigenschappen).

import { useEffect, useRef, useState } from 'react';

import { FrontFields } from './FrontFields';
import { FrontKeys } from './FrontKeys';
import { FrontPanel } from './FrontPanel';
import { autoFront, frontAddModules } from './frontLayout';
import {
  addFront, insertFrontItem, moveFrontItem, newFront, pruneFronts, removeFront, removeFrontItemAt,
  updateFront, updateFrontItem,
} from './fronts';
import { DEMO_SEEDS } from './demoSeeds';
import { PatchSelect } from './PatchSelect';
import { runCommands } from './recipe/commands';
import { openPoolBrowser } from './sim/PoolWindows';
import { RecordStatus } from './sim/RecordButton';
import { getProject, setProject } from './store';
import { askAi, llmReady, loadLlmConfig } from './recipe/llm';
import { updateProject, useModularProject, uid } from './store';
import { resolveControls, resolvePorts, type FrontItem, type ModularProject, type Patch, type PatchFront } from './types';

const AUTO = 'front_auto';

export function FrontTab({ expert = true }: { expert?: boolean }): JSX.Element {
  const project = useModularProject();
  const patch = project.patches.find((p) => p.id === project.activePatchId);
  // ?front=<id> kiest het front bij het openen (patch-pool-links); anders
  // het eerste bewaarde front, en pas als dat er niet is het automatische.
  const [chosen, setChosen] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('front'); } catch { return null; }
  });

  // Schikmodus (stap 4): items vrij slepen; alleen op een bewaard front.
  // (Hook vóór de vroege return, anders klaagt React zodra er een patch komt.)
  const [arrange, setArrange] = useState(false);
  // "+ Toevoegen" open? De knop staat in de bovenste rij en de lijst direct
  // boven het front: op een telefoon staat de bewerker onder het
  // toetsenbord, en je wilt zien wat je aantikt. Vanaf Auto bewaart de knop
  // eerst het front.
  const [adding, setAdding] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // Op volledig scherm staat de werkbalk van de app buiten beeld; de
  // patchkeuze komt dan bovenin het podium (niet in de stand "alleen toetsen").
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = (): void => setFull(!!document.fullscreenElement && document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (!patch) return <EmptyStart expert={expert} />;

  const fronts = pruneFronts(patch, project).fronts ?? [];
  const stored = chosen === AUTO ? undefined : (fronts.find((f) => f.id === chosen) ?? fronts[0]);
  const front: PatchFront = stored ?? autoFront(patch, project);
  const isAuto = !stored;

  const edit = (fn: (x: Patch) => Patch): void =>
    updateProject((p) => ({ ...p, patches: p.patches.map((x) => (x.id === patch.id ? fn(x) : x)) }), { forceCommit: true });
  const arranging = expert && !isAuto && arrange;

  function saveAuto(): void {
    const f: PatchFront = { ...autoFront(patch!, project), id: uid('front'), name: `Front ${fronts.length + 1}` };
    edit((x) => addFront(x, f));
    setChosen(f.id);
  }
  function newEmpty(): void {
    const f = newFront(uid('front'), `Front ${fronts.length + 1}`);
    edit((x) => addFront(x, f));
    setChosen(f.id);
  }
  function remove(id: string): void {
    edit((x) => removeFront(x, id));
    setChosen(AUTO);
  }

  const btn: React.CSSProperties = { fontSize: 12, padding: '3px 10px', cursor: 'pointer' };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* In de speelmodus staat de patchkeuze al in de werkbalk van de app. */}
        {expert && <PatchSelect project={project} onChoose={() => setChosen(null)} />}
        <select value={isAuto ? AUTO : front.id} onChange={(e) => setChosen(e.target.value)} style={{ fontSize: 12 }}>
          <option value={AUTO}>Auto (afgeleid, niet opgeslagen)</option>
          {fronts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {expert && (isAuto
          ? <>
              <button type="button" style={btn} onClick={saveAuto}>Auto bewaren als front</button>
              <button type="button" style={btn} onClick={newEmpty}>+ Leeg front</button>
            </>
          : <button type="button" style={btn} onClick={() => remove(front.id)}>Front verwijderen</button>)}
        {expert && (
          <button type="button" style={{ ...btn, fontWeight: 600 }}
            title={isAuto ? 'Bewaart Auto als front en opent de lijst met knoppen, displays en jacks van de patch'
              : 'Kies per module welke knoppen, displays en jacks op dit front staan'}
            onClick={() => { if (isAuto) { saveAuto(); setAdding(true); } else setAdding(!adding); }}>
            {isAuto ? '+ Toevoegen (bewaart Auto)' : adding ? '− Klaar met toevoegen' : '+ Toevoegen'}
          </button>
        )}
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          Draaien op het front wijzigt de patch; wat niet op het front staat, staat vast.
        </span>
      </div>
      {expert && adding && !isAuto && <div style={{ maxWidth: 460 }}><FrontAdd patch={patch} front={front} /></div>}
      {expert && <FrontAi project={project} onDone={(id) => setChosen(id ?? null)} />}
      {front.description && <p style={{ margin: 0, maxWidth: 640, opacity: 0.85 }}>{front.description}</p>}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div ref={stageRef} className="mb-stage" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Op volledig scherm (⛶ in de werkbalk van het toetsenbord): witte
              achtergrond en scrollen, anders staat het front op zwart. */}
          <style>{`
            .mb-stage:fullscreen { background: #fff; overflow: auto; padding: 12px; box-sizing: border-box; }
            .mb-stage:fullscreen[data-full-mode="keys"] > .mb-stage-front,
            .mb-stage:fullscreen[data-full-mode="keys"] > .mb-stage-top { display: none; }
            .mb-stage:fullscreen[data-full-mode="keys"] { justify-content: center; }
          `}</style>
          {full && (
            <div className="mb-stage-top" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <PatchSelect project={project} onChoose={() => setChosen(null)} />
            </div>
          )}
          <RecordStatus />
          <div className="mb-stage-front" data-tour="play-front" style={{ overflow: 'auto' }}>
            <FrontPanel front={front} patch={patch} project={project} pxPerMm={4}
              onArrange={arranging ? (i, pos) => edit((x) => updateFrontItem(x, front.id, i, (y) => (y.kind === 'group' ? y : { ...y, pos }))) : undefined} />
          </div>
          <FrontKeys stage={stageRef} record={!expert} />
        </div>
        {expert && (isAuto
          ? <div style={{ fontSize: 12, color: '#6b7280', maxWidth: 300 }}>
              Dit front is afgeleid uit de patch: gelabelde en gebonden knoppen, de speelmodules, en per module de
              belangrijkste knoppen. Bewaar het als front om labels, volgorde en kopjes te bewerken, of zet er met
              "+ Toevoegen" meteen iets bij.
            </div>
          : <FrontEditor patch={patch} front={front} edit={edit} arrange={arrange} onArrange={setArrange} />)}
      </div>
    </div>
  );
}

// ── Bewerker van een opgeslagen front ────────────────────────────────────

function FrontEditor({ patch, front, edit, arrange, onArrange }: {
  patch: Patch; front: PatchFront; edit: (fn: (x: Patch) => Patch) => void; arrange: boolean; onArrange: (on: boolean) => void;
}): JSX.Element {
  const project = useModularProject();
  const id = front.id;
  const input: React.CSSProperties = { fontSize: 12, padding: '2px 6px' };
  const small: React.CSSProperties = { fontSize: 11, padding: '1px 6px', cursor: 'pointer' };
  const nameOf = (it: FrontItem): string => {
    if (it.kind === 'group') return '';
    const m = project.modules.find((x) => x.id === it.moduleId);
    if (!m) return it.moduleId;
    if (it.kind === 'control') {
      const c = resolveControls(m, project.moduleTypes).find((x) => x.id === it.controlId);
      return `${m.name} · ${c?.label || it.controlId}`;
    }
    const p = resolvePorts(m, project.moduleTypes).find((x) => x.id === it.portId);
    return `${m.name} · ${p?.name || it.portId} (jack)`;
  };
  const isReadout = (it: FrontItem): boolean => {
    if (it.kind !== 'control') return false;
    const m = project.modules.find((x) => x.id === it.moduleId);
    const k = m && resolveControls(m, project.moduleTypes).find((x) => x.id === it.controlId)?.kind;
    return k === 'display' || k === 'led';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 320, maxWidth: 460, fontSize: 12 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 70 }}>Naam</span>
        <input value={front.name} maxLength={40} style={{ ...input, flex: 1 }}
          onChange={(e) => edit((x) => updateFront(x, id, { name: e.target.value }))} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ width: 70 }}>Uitleg</span>
        <textarea value={front.description ?? ''} rows={2} placeholder="Voor de speler: wat doet dit front, hoe speel je het"
          style={{ ...input, flex: 1, resize: 'vertical' }}
          onChange={(e) => edit((x) => updateFront(x, id, { description: e.target.value || undefined }))} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 70 }}>Kolommen</span>
        <input type="number" min={1} max={8} value={front.columns ?? 4} style={{ ...input, width: 60 }}
          onChange={(e) => edit((x) => updateFront(x, id, { columns: Math.max(1, Math.min(8, Number(e.target.value) || 4)) }))} />
        <button type="button" style={small} onClick={() => edit((x) => insertFrontItem(x, id, front.items.length, { kind: 'group', text: 'Kopje' }))}>
          + Kopje
        </button>
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Sleep knoppen en jacks op het paneel naar een eigen plek; het raster blijft voor de rest">
          <input type="checkbox" checked={arrange} onChange={(e) => onArrange(e.target.checked)} /> Vrij schikken (slepen op het paneel)
        </label>
        {front.items.some((it) => it.kind !== 'group' && it.pos) && (
          <button type="button" style={small} onClick={() => edit((x) => ({ ...x, fronts: (x.fronts ?? []).map((f) => (f.id === id ? { ...f, items: f.items.map((it) => { if (it.kind === 'group') return it; const { pos: _p, ...rest } = it; void _p; return rest as FrontItem; }) } : f)) }))}>
            Alles terug in het raster
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>
        Items in rastervolgorde. Knoppen, displays en jacks erbij: "+ Toevoegen" bovenaan, rechtsklik in rack of patcher, of de frontvelden in de eigenschappen.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {front.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px', background: it.kind === 'group' ? '#eef2f7' : 'transparent', borderRadius: 4 }}>
            <span style={{ width: 14, textAlign: 'center', color: '#9ca3af' }}>{it.kind === 'group' ? '¶' : it.kind === 'port' ? '⚬' : isReadout(it) ? '▭' : '◉'}</span>
            {it.kind === 'group' ? (
              <input value={it.text} maxLength={30} style={{ ...input, flex: 1, fontWeight: 600 }}
                onChange={(e) => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'group' ? { ...y, text: e.target.value } : y)))} />
            ) : (
              <>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nameOf(it)}>{nameOf(it)}</span>
                <input value={it.label ?? ''} placeholder="label" maxLength={24} style={{ ...input, width: 110 }}
                  onChange={(e) => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'group' ? y : { ...y, label: e.target.value || undefined })))} />
                {it.kind === 'control' && (
                  <button type="button" style={small} title="Groot of klein"
                    onClick={() => edit((x) => updateFrontItem(x, id, i, (y) => (y.kind === 'control' ? { ...y, size: y.size === 'large' ? undefined : 'large' } : y)))}>
                    {it.size === 'large' ? 'groot' : 'klein'}
                  </button>
                )}
              </>
            )}
            <button type="button" style={small} disabled={i === 0} onClick={() => edit((x) => moveFrontItem(x, id, i, -1))} title="Omhoog">▲</button>
            <button type="button" style={small} disabled={i === front.items.length - 1} onClick={() => edit((x) => moveFrontItem(x, id, i, 1))} title="Omlaag">▼</button>
            <button type="button" style={small} onClick={() => edit((x) => removeFrontItemAt(x, id, i))} title="Van het front">✕</button>
          </div>
        ))}
        {front.items.length === 0 && <div style={{ color: '#9ca3af' }}>Nog leeg.</div>}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>
        Bewerkingen zitten in de bewaarcyclus van de patch (Bewaar, Terug, Vergelijk) en in undo (Ctrl+Z).
      </div>
    </div>
  );
}

// ── "+ Toevoegen": per module aantikken wat op het front staat ────────────

function FrontAdd({ patch, front }: { patch: Patch; front: PatchFront }): JSX.Element {
  const project = useModularProject();
  const mods = frontAddModules(patch, project);
  const [chosen, setChosen] = useState<string | null>(null);
  const onFront = (id: string): number => front.items.filter((it) => it.kind !== 'group' && it.moduleId === id).length;
  // Begin bij de eerste module die al op het front staat (de klankbron),
  // niet bij MIDI-IN, die vooraan in de signaalvolgorde staat.
  const current = mods.find((m) => m.id === chosen) ?? mods.find((m) => onFront(m.id) > 0) ?? mods[0];
  const m = current && project.modules.find((x) => x.id === current.id);
  return (
    <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, padding: 8, background: '#fff' }}>
      <select value={current?.id ?? ''} onChange={(e) => setChosen(e.target.value)}
        style={{ fontSize: 14, padding: '6px 8px', width: '100%', marginBottom: 4 }}>
        {mods.map((x) => {
          const n = onFront(x.id);
          return <option key={x.id} value={x.id}>{x.label}{n ? ` (${n} op het front)` : ''}</option>;
        })}
      </select>
      {m
        ? <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <FrontFields moduleId={m.id} controls={resolveControls(m, project.moduleTypes)} ports={resolvePorts(m, project.moduleTypes)}
              patchId={patch.id} frontId={front.id} roomy />
          </div>
        : <div style={{ color: '#9ca3af' }}>Deze patch heeft geen modules.</div>}
    </div>
  );
}

// ── AI-frontrecept (stap 3b): deterministisch eerst, AI als dat niet goed is ──

function FrontAi({ project, onDone }: { project: ModularProject; onDone: (frontId: string | null) => void }): JSX.Element {
  const [wish, setWish] = useState('Een speelfront met de 6 tot 8 belangrijkste knoppen, gegroepeerd per functie, met korte Nederlandse labels.');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const config = loadLlmConfig();
  const llm = config.profiles.find((x) => x.id === config.activeId) ?? config.profiles[0];
  const ready = !!llm && llmReady(llm);

  async function go(): Promise<void> {
    if (!llm || busy) return;
    setBusy(true); setMsg(null);
    try {
      const a = await askAi(`${wish.trim()} Gebruik get_front_candidates en stel het front voor met propose_front.`, project, llm, fetch);
      const fronts = a.commands.filter((c) => c.kind === 'front');
      if (!fronts.length) { setMsg({ ok: false, text: a.explanation || 'Het model stelde geen front voor.' }); return; }
      const r = runCommands(project, fronts);
      updateProject(() => r.project, { forceCommit: true });
      const made = r.project.patches.find((x) => x.id === project.activePatchId)?.fronts?.at(-1);
      onDone(made?.id ?? null);
      setMsg({ ok: true, text: [r.summary, ...r.warnings, a.explanation].filter(Boolean).join(' — ') });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
      <input value={wish} onChange={(e) => setWish(e.target.value)} style={{ fontSize: 12, padding: '3px 6px', minWidth: 360, flex: '1 1 360px', maxWidth: 640 }}
        placeholder="Wat voor front wil je? (vrije tekst)" disabled={busy} />
      <button type="button" onClick={() => void go()} disabled={!ready || busy} style={{ fontSize: 12, padding: '3px 10px', cursor: ready ? 'pointer' : 'default' }}
        title={ready ? 'Laat het AI-profiel uit de commandoregel (Ctrl+K, ⚙) een front voorstellen; het landt als gewone bewerking (undo, bewaarcyclus)' : 'Stel eerst een AI-profiel in: Ctrl+K → ⚙'}>
        {busy ? '✨ bezig…' : '✨ AI-front'}
      </button>
      {!ready && <span style={{ color: '#6b7280' }}>Geen AI-profiel: Ctrl+K → ⚙ (bring-your-own-key of de MusicBrain-server).</span>}
      {msg && <span style={{ color: msg.ok ? '#15803d' : '#b91c1c' }}>{msg.text}</span>}
    </div>
  );
}

// ── Lege start: voorbeelden, een project openen, of de pool ───────────────

function EmptyStart({ expert }: { expert: boolean }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null);
  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!setProject(JSON.parse(reader.result as string))) alert('Ongeldig formaat: verwacht MMB-JSON (v1 of v2).');
      } catch { alert('Kon het bestand niet lezen. Is het een MMB-JSON?'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
  const btn: React.CSSProperties = { fontSize: 14, padding: '8px 12px', cursor: 'pointer', textAlign: 'left' };
  return (
    <div style={{ padding: 16, maxWidth: 560, lineHeight: 1.5 }}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Er is nog geen patch.</p>
      <p style={{ margin: '0 0 12px', opacity: 0.8 }}>
        Kies een voorbeeld; je ziet dan het front: de belangrijkste knoppen, zonder kabels, en een toetsenbord om te spelen.
        {expert ? ' Of bouw er zelf een in Rack en Patcher.' : ' Binnenkijken ▸ opent de hele editor.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {DEMO_SEEDS.map((d) => (
          <button key={d.label} type="button" style={btn} title={d.title} onClick={() => setProject(d.run(getProject()))}>{d.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" style={btn} onClick={() => fileRef.current?.click()}>↑ Project openen (.json)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
        <button type="button" style={btn} onClick={openPoolBrowser} title="Patches van musicbrain.nl: bladeren en laden">📚 Patches van musicbrain.nl</button>
      </div>
    </div>
  );
}
