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
import { askAi, loadLlmSettings, saveLlmSettings, LLM_PRESETS, type LlmSettings } from './llm';
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
  const [aiBusy, setAiBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [llm, setLlm] = useState<LlmSettings>(() => loadLlmSettings());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null); setProposal(null);
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
        setText(''); setProposal(null);
        if (commands.some((c) => c.kind === 'build')) onBuilt?.();
      }
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  function demo(): void {
    if (!dry || !dry.ok || !onDemo) return;
    onDemo(dry.ops, dry.summary);
    setText(''); setProposal(null);
  }

  async function ask(): Promise<void> {
    if (!text.trim() || aiBusy) return;
    setAiBusy(true); setStatus(null);
    try {
      const a = await askAi(text, project, llm);
      setProposal({ commands: a.commands, summary: a.summary, explanation: a.explanation, source: 'ai' });
      if (!a.commands.length) setStatus({ ok: false, text: a.explanation || 'Geen voorstel.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiBusy(false);
    }
  }

  function updateLlm(patch: Partial<LlmSettings>): void {
    const next = { ...llm, ...patch };
    setLlm(next); saveLlmSettings(next);
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 14, width: 740, maxWidth: '94vw',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const needsPatch = commands.some((c) => c.kind !== 'build');
  const canApply = commands.length > 0 && (!single || single.kind !== 'build' || (dry?.ok ?? false)) && (!needsPatch || hasPatch);
  const canDemo = !!onDemo && !!single && single.kind === 'build' && (dry?.ok ?? false);
  const aiReady = !!llm.apiKey || /localhost|127\.0\.0\.1/.test(llm.endpoint);
  const primary: React.CSSProperties = {
    padding: '8px 14px', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer',
    background: 'var(--mb-accent)', color: 'var(--mb-on-accent)',
  };
  const disabled: React.CSSProperties = { ...primary, background: '#e5e7eb', color: '#9ca3af', cursor: 'default' };
  const secondary: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #cbd2d9', borderRadius: 6, cursor: 'pointer', background: '#f8fafc', color: '#0f172a',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setStatus(null); setProposal(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canApply) { e.preventDefault(); apply(); } }}
            placeholder="Wat wil je bouwen, veranderen of leren? (Esc sluit)"
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
            {aiBusy ? '⏳ AI…' : '✨ AI'}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} style={secondary} title="AI-instellingen: endpoint, model, key, modus">⚙</button>
        </div>

        {showSettings && (
          <div style={{ marginTop: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, background: '#f8fafc',
                        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
            <span>Preset</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(LLM_PRESETS).map(([k, v]) => (
                <button key={k} onClick={() => updateLlm({ endpoint: v.endpoint, model: v.model })}
                        style={{ ...secondary, padding: '4px 10px', fontWeight: llm.endpoint === v.endpoint ? 700 : 400 }}>{k}</button>
              ))}
            </div>
            <span>Endpoint</span>
            <input value={llm.endpoint} onChange={(e) => updateLlm({ endpoint: e.target.value })} style={{ padding: 5 }} />
            <span>Model</span>
            <input value={llm.model} onChange={(e) => updateLlm({ model: e.target.value })} style={{ padding: 5 }} />
            <span>API-key</span>
            <input type="password" value={llm.apiKey} onChange={(e) => updateLlm({ apiKey: e.target.value })} style={{ padding: 5 }}
                   placeholder="sk-… (blijft in deze browser, localStorage)" />
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
              Werkt het niet vanuit de browser (CORS), dan is een kleine proxy nodig.
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
