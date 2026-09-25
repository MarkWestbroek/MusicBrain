// Commandoregel (Ctrl+K) — ED-RC-2/3/4/5.
//
// Typ wat je wilt; de deterministische parser toont meteen wat hij ervan
// begrijpt (preview) en wat niet ("niet begrepen"). Enter bouwt of past toe.
//   • Nieuwe patches lopen via het recept (compileRecipe → ops), bewerkingen
//     via de werkwoorden in edits.ts (runCommand in commands.ts).
//   • "Demonstreer" speelt de ops stap voor stap af met uitleg (demo.tsx).
//   • "✨ AI" stuurt de vraag naar een OpenAI-compatibele API (llm.ts). In
//     tools-modus haalt het model zelf op wat het nodig heeft en plant het
//     wijzigingen; die verschijnen hier als voorstellenlijst. Pas na
//     "Toepassen" gebeurt er iets.
//   • Uitlegvragen ("hoe maak ik vibrato?") koppelen aan een demonstratie.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject, useModularProject } from '../store';
import { parseCommand, describeCommand, type Command } from './parse';
import { compileRecipe } from './compile';
import { runCommand, runCommands } from './commands';
import type { EditResult } from './edits';
import type { PatchOp } from './types';
import { askAi, loadLlmConfig, saveLlmConfig, llmReady, profileFromPreset, LLM_PRESETS, type LlmConfig, type LlmProfile, type LlmThread } from './llm';
import { findExplainTopic, type ExplainTopic } from './demo';

export { runCommand };

const EXAMPLES = [
  'maak een 8x poly patch met een wavetable osc, een simpele vcf en een diode compressor op het eind',
  'nieuwe mono string zonder filter met een galm achteraan',
  '4 stemmige plaits met ladder filter en een phaser per stem',
  'maak deze patch 4 stemmig',
  'vervang de osc door een wavetable',
  'voeg een tape echo toe op de bus',
  'zet een lfo op de cutoff van het filter',
  'hoe maak ik vibrato?',
];

/** Voor tests en scripts: één regel uitvoeren op het huidige project. */
export function runCommandLine(text: string): { summary: string; warnings: string[] } {
  const p = getProject();
  const parsed = parseCommand(text, p.moduleTypes, !!p.activePatchId);
  let out = { summary: '', warnings: [] as string[] };
  updateProject((q) => { const r = runCommand(q, parsed.command); out = { summary: r.summary, warnings: r.warnings }; return r.project; },
    { forceCommit: true });
  return out;
}

interface Proposal { commands: Command[]; summary: string; explanation: string; source: 'ai' | 'explain'; topic?: ExplainTopic }

export function CommandPalette(props: {
  open: boolean; onClose: () => void; onBuilt?: () => void;
  /** Speel de ops van een nieuwe patch stap voor stap af (ED-RC-4). */
  onDemo?: (ops: PatchOp[], title: string) => void;
}): JSX.Element | null {
  const { open, onClose, onBuilt, onDemo } = props;
  const project = useModularProject();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  // Gesprek met het model (tools-modus): na een voorstel kun je doorpraten
  // ("maak het toch 8-stemmig"); de voorstellen stapelen tot je Toepassen kiest.
  const [thread, setThread] = useState<LlmThread | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Meerdere AI-instellingen (DeepSeek, Claude, MusicBrain-server, …); één is actief.
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const llm: LlmProfile = config.profiles.find((x) => x.id === config.activeId) ?? config.profiles[0]!;
  // Gespreksverloop, zichtbaar in het venster (blijft staan als je het venster sluit).
  const [log, setLog] = useState<{ who: 'jij' | 'ai' | 'editor'; text: string }[]>([]);
  // Verschuifbaar, zonder donkere achtergrond: je ziet de patch eronder.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({ x: Math.max(16, (window.innerWidth - 760) / 2), y: 90 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!drag.current) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)) });
    };
    const up = (): void => { drag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Niets wissen bij openen: het gesprek en het voorstel blijven staan.
    setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hasPatch = !!project.activePatchId && project.patches.some((x) => x.id === project.activePatchId);
  const topic = useMemo(() => (text.trim() ? findExplainTopic(text) : null), [text]);
  const parsed = useMemo(() => (text.trim() && !topic ? parseCommand(text, project.moduleTypes, hasPatch) : null),
    [text, topic, project.moduleTypes, hasPatch]);
  // De commando's die "Bouw/Toepassen/Demonstreer" zou uitvoeren: het AI-/
  // uitleg-voorstel als dat er is, anders de deterministische lezing.
  const commands: Command[] = proposal ? proposal.commands
    : topic ? [{ kind: 'build', recipe: topic.recipe, mentioned: [], explicitNew: true }]
    : parsed ? [parsed.command] : [];
  const single = commands.length === 1 ? commands[0]! : null;
  // Droogloop van een (enkele) nieuwe patch: fouten en waarschuwingen vooraf.
  const dry = useMemo(() => {
    if (!single || single.kind !== 'build') return null;
    try { const r = compileRecipe(project, single.recipe); return { ok: true as const, warnings: r.warnings, ops: r.ops, summary: r.summary }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [single, project]);

  if (!open) return null;

  function apply(): void {
    if (!commands.length) return;
    try {
      let result: EditResult | null = null;
      updateProject((p) => { result = runCommands(p, commands); return result.project; }, { forceCommit: true });
      const r = result as EditResult | null;
      if (r) {
        setStatus({ ok: true, text: r.summary + (r.warnings.length ? ` — ${r.warnings.join(' ')}` : '') });
        setLog((l) => [...l, { who: 'editor', text: `✓ toegepast: ${r.summary}` }]);
        setText(''); setProposal(null);
        // Het gesprek blijft: je kunt verder vragen op de nieuwe stand ("en nu een galm erbij").
        if (thread) setThread({ ...thread, commands: [] });
        if (commands.some((c) => c.kind === 'build')) onBuilt?.();
      }
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  function demo(): void {
    if (!dry || !dry.ok || !onDemo) return;
    onDemo(dry.ops, dry.summary);
    setText(''); setProposal(null); setThread(null);
  }

  async function ask(): Promise<void> {
    if (!text.trim() || aiBusy) return;
    setAiBusy(true); setStatus(null);
    try {
      const asked = text;
      setLog((l) => [...l, { who: 'jij', text: asked }]);
      const a = await askAi(text, project, llm, fetch, thread ?? undefined);
      setProposal({ commands: a.commands, summary: a.summary, explanation: a.explanation, source: 'ai' });
      setLog((l) => [...l, { who: 'ai', text: [a.commands.length ? `Voorstel: ${a.summary}` : '', a.explanation].filter(Boolean).join(' — ') || 'Geen voorstel.' }]);
      if (a.thread) { setThread(a.thread); setText(''); }
      if (!a.commands.length) setStatus({ ok: false, text: a.explanation || 'Geen voorstel.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiBusy(false);
    }
  }

  function saveConfig(next: LlmConfig): void { setConfig(next); saveLlmConfig(next); }
  function updateLlm(patch: Partial<LlmProfile>): void {
    saveConfig({ ...config, profiles: config.profiles.map((x) => (x.id === llm.id ? { ...x, ...patch } : x)) });
  }
  function addProfile(key: string): void {
    const p = profileFromPreset(key);
    saveConfig({ profiles: [...config.profiles, p], activeId: p.id });
  }
  function removeProfile(): void {
    if (config.profiles.length <= 1) return;
    const rest = config.profiles.filter((x) => x.id !== llm.id);
    saveConfig({ profiles: rest, activeId: rest[0]!.id });
  }
  function newConversation(): void { setThread(null); setProposal(null); setText(''); setLog([]); setStatus(null); inputRef.current?.focus(); }

  const panel: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 60,
    background: '#fff', borderRadius: 8, width: 760, maxWidth: '96vw', maxHeight: '80vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', border: '1px solid #cbd2d9', fontSize: 13,
  };
  const needsPatch = commands.some((c) => c.kind !== 'build');
  const canApply = commands.length > 0 && (!single || single.kind !== 'build' || (dry?.ok ?? false)) && (!needsPatch || hasPatch);
  const canDemo = !!onDemo && !!single && single.kind === 'build' && (dry?.ok ?? false);
  const aiReady = llmReady(llm);
  const primary: React.CSSProperties = {
    padding: '8px 14px', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
    background: 'var(--mb-accent)', color: 'var(--mb-on-accent)',
  };
  const disabled: React.CSSProperties = { ...primary, background: '#e5e7eb', color: '#9ca3af', cursor: 'default' };
  const secondary: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #cbd2d9', borderRadius: 6, cursor: 'pointer', background: '#f8fafc', color: '#0f172a',
  };

  return (
    <div style={panel}>
      {/* Kop: vastpakken om te verschuiven. */}
      <div onMouseDown={(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); }}
           style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #e5e7eb',
                    borderRadius: '8px 8px 0 0', cursor: 'move', userSelect: 'none', position: 'sticky', top: 0, zIndex: 1 }}>
        <strong>⌘ Recept</strong>
        <span style={{ fontSize: 11, color: '#64748b' }}>sleep hier om te verplaatsen · Esc of — verbergt, het gesprek blijft</span>
        <span style={{ flex: 1 }} />
        {(thread || log.length > 0) && (
          <button onMouseDown={(e) => e.stopPropagation()} onClick={newConversation} style={{ fontSize: 11, padding: '2px 8px' }}>Nieuw gesprek</button>
        )}
        <button onMouseDown={(e) => e.stopPropagation()} onClick={onClose} title="Verbergen (het gesprek blijft staan)" style={{ fontSize: 13, padding: '0 8px' }}>—</button>
      </div>
      <div style={{ padding: 14 }}>
        {log.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 10, padding: '6px 8px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6 }}>
            {log.map((m, i) => (
              <div key={i} style={{ margin: '3px 0', color: m.who === 'jij' ? '#0f172a' : m.who === 'ai' ? '#1d4ed8' : '#065f46' }}>
                <strong style={{ fontSize: 11, textTransform: 'uppercase', marginRight: 6 }}>{m.who}</strong>{m.text}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setStatus(null); if (!thread) setProposal(null); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (thread && text.trim()) void ask();          // doorpraten
              else if (canApply) apply();
            }}
            placeholder={thread ? 'Reageer op het voorstel… (Enter stuurt, Toepassen voert uit)' : 'Wat wil je bouwen, veranderen of leren? (Esc sluit)'}
            style={{ flex: 1, fontSize: 15, padding: '8px 10px', border: '1px solid #cbd2d9', borderRadius: 6, outline: 'none' }}
            data-tour="command-input"
          />
          <button onClick={apply} disabled={!canApply} style={canApply ? primary : disabled}>
            {single?.kind === 'build' ? 'Bouw' : 'Toepassen'}
          </button>
          <button onClick={demo} disabled={!canDemo} style={canDemo ? secondary : { ...secondary, color: '#9ca3af', cursor: 'default' }}
                  title="Bouw de patch stap voor stap op, met uitleg per stap">▶ Demonstreer</button>
          <button onClick={ask} disabled={!text.trim() || aiBusy || !aiReady} style={{ ...secondary, color: aiReady ? '#0f172a' : '#9ca3af' }}
                  title={aiReady ? 'Laat een taalmodel de vraag vertalen (je ziet eerst een voorstel)' : 'Stel eerst een API-key in (⚙)'}>
            {aiBusy ? '⏳ AI…' : thread ? '✨ Verder' : '✨ AI'}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} style={secondary} title="AI-instellingen: endpoint, model, key, modus">⚙</button>
        </div>

        {showSettings && (
          <div style={{ marginTop: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, background: '#f8fafc',
                        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
            <span>Instelling</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {config.profiles.map((p) => (
                <button key={p.id} onClick={() => saveConfig({ ...config, activeId: p.id })}
                        style={{ ...secondary, padding: '4px 10px', fontWeight: p.id === llm.id ? 700 : 400,
                                 background: p.id === llm.id ? 'var(--mb-accent-tint)' : '#f8fafc' }}
                        title={`${p.provider === 'anthropic' ? 'Claude (Anthropic)' : p.endpoint} · ${p.model}${p.apiKey ? '' : ' · nog geen key'}`}>
                  {p.label}{p.apiKey ? '' : ' ⚠'}
                </button>
              ))}
              <select value="" onChange={(e) => { if (e.target.value) addProfile(e.target.value); }} style={{ fontSize: 12 }} title="Nog een instelling toevoegen">
                <option value="">+ toevoegen…</option>
                {Object.entries(LLM_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {config.profiles.length > 1 && <button onClick={removeProfile} style={{ ...secondary, padding: '4px 8px' }} title="Deze instelling verwijderen">🗑</button>}
            </div>
            <span>Naam</span>
            <input value={llm.label} onChange={(e) => updateLlm({ label: e.target.value })} style={{ padding: 5 }} />
            <span>Endpoint</span>
            <input value={llm.endpoint} onChange={(e) => updateLlm({ endpoint: e.target.value })} style={{ padding: 5 }} />
            <span>Model</span>
            <input value={llm.model} onChange={(e) => updateLlm({ model: e.target.value })} style={{ padding: 5 }} />
            <span>{llm.endpoint === LLM_PRESETS.server!.endpoint ? 'Toegangscode' : 'API-key'}</span>
            <input type="password" value={llm.apiKey} onChange={(e) => updateLlm({ apiKey: e.target.value })} style={{ padding: 5 }}
                   placeholder={llm.endpoint === LLM_PRESETS.server!.endpoint ? 'de code die je van de beheerder kreeg' : llm.provider === 'anthropic' ? 'sk-ant-… (blijft in deze browser)' : 'sk-… (blijft in deze browser, localStorage)'} />
            <span>Modus</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['tools', 'json'] as const).map((m) => (
                <button key={m} onClick={() => updateLlm({ mode: m })}
                        style={{ ...secondary, padding: '4px 10px', fontWeight: llm.mode === m ? 700 : 400 }}>{m}</button>
              ))}
              <span style={{ fontSize: 11, color: '#64748b' }}>
                tools = het model haalt zelf catalogus en patch op (function calling); json = alles in één prompt, één antwoord.
              </span>
            </div>
            <span />
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Naar buiten gaan alleen je vraag, de modulecatalogus en een korte samenvatting van de actieve patch.
              Claude gebruikt de officiële Anthropic-SDK (leeg endpoint = standaard). MusicBrain-server: de key staat op de
              server, jij vult alleen de toegangscode in.
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, minHeight: 44 }}>
          {proposal && (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Voorstel van de AI{proposal.commands.length > 1 ? ` (${proposal.commands.length} stappen)` : ''}
              </div>
              {proposal.commands.length === 0 && <div style={{ fontWeight: 600 }}>Geen voorstel.</div>}
              {proposal.commands.map((c, i) => (
                <div key={i} style={{ fontWeight: 600 }}>{proposal.commands.length > 1 ? `${i + 1}. ` : ''}{describeCommand(c, project.moduleTypes)}</div>
              ))}
              {proposal.explanation && <div style={{ color: '#334155', marginTop: 2 }}>{proposal.explanation}</div>}
              {thread && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                  Niet wat je bedoelde? Typ een reactie en druk Enter of ✨ Verder; het model past het voorstel aan.{' '}
                  <button onClick={() => { setThread(null); setProposal(null); setText(''); inputRef.current?.focus(); }}
                          style={{ border: 'none', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>
                    Nieuw gesprek
                  </button>
                </div>
              )}
            </div>
          )}
          {!proposal && topic && (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fefce8', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 11, color: '#a16207', textTransform: 'uppercase', letterSpacing: 0.5 }}>Demonstratie</div>
              <div style={{ fontWeight: 600 }}>{topic.title}</div>
              <div style={{ color: '#334155', marginTop: 2 }}>{topic.intro}</div>
              {dry?.ok && <div style={{ color: '#64748b', marginTop: 2 }}>{dry.summary}</div>}
            </div>
          )}
          {!proposal && !topic && parsed && (
            <>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{parsed.summary}</div>
              {parsed.unknown.length > 0 && (
                <div style={{ color: '#b45309', marginTop: 4 }}>
                  Niet begrepen: {parsed.unknown.join(', ')}{aiReady ? ' — probeer ✨ AI.' : ''}
                </div>
              )}
            </>
          )}
          {needsPatch && !hasPatch && (
            <div style={{ color: '#b91c1c', marginTop: 4 }}>Er is geen actieve patch om te bewerken.</div>
          )}
          {dry && !dry.ok && <div style={{ color: '#b91c1c', marginTop: 4 }}>{dry.error}</div>}
          {dry && dry.ok && dry.warnings.length > 0 && (
            <div style={{ color: '#b45309', marginTop: 4 }}>{dry.warnings.join(' ')}</div>
          )}
          {status && (
            <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6,
                          background: status.ok ? '#ecfdf5' : '#fef2f2',
                          color: status.ok ? '#065f46' : '#991b1b' }}>
              {status.ok ? '✓ ' : '✕ '}{status.text}
            </div>
          )}
        </div>

        {!text.trim() && (
          <div style={{ marginTop: 6, borderTop: '1px solid #e5e7eb', paddingTop: 8, color: '#475569' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Voorbeelden</div>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setText(ex); inputRef.current?.focus(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                         padding: '4px 6px', cursor: 'pointer', fontSize: 13, color: '#1e293b', borderRadius: 4 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                › {ex}
              </button>
            ))}
            <div style={{ fontSize: 11, marginTop: 6, color: '#64748b' }}>
              Modulenamen mogen NL of EN zijn (wavetable, ladder, moog, galm, diode compressor, …).
              Een nieuwe patch komt in een nieuw rack; bewerkingen werken op de actieve patch.
              Begrijpt de editor je niet, dan vertaalt ✨ AI de vraag en zie je eerst een voorstel.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
