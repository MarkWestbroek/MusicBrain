// Commandoregel (Ctrl+K) — ED-RC-2/3/4.
//
// Typ wat je wilt; de deterministische parser toont meteen wat hij ervan
// begrijpt (preview) en wat niet ("niet begrepen"). Enter bouwt of past toe.
//   • Nieuwe patches lopen via het recept (compileRecipe → ops), bewerkingen
//     via de werkwoorden in edits.ts. Nooit rechtstreeks aan het project.
//   • "Demonstreer" speelt de ops stap voor stap af met uitleg (demo.tsx).
//   • "✨ AI" stuurt de vraag naar een OpenAI-compatibele API (llm.ts) en
//     toont het voorstel als preview; pas na "Toepassen" gebeurt er iets.
//   • Uitlegvragen ("hoe maak ik vibrato?") koppelen aan een demonstratie.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject, useModularProject } from '../store';
import { parseCommand, type Command } from './parse';
import { compileRecipe, buildRecipe } from './compile';
import {
  replaceModule, setVoices, addBusFx, addModulation, findModuleByWord, findPortByWord, type EditResult,
} from './edits';
import { RecipeError, type PatchOp } from './types';
import { resolvePorts, type ModularProject } from '../types';
import { askLlm, loadLlmSettings, saveLlmSettings, LLM_PRESETS, type LlmSettings } from './llm';
import { findExplainTopic, type ExplainTopic } from './demo';

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

/** Voer een geparseerd commando uit op het project. Gooit RecipeError. */
export function runCommand(p: ModularProject, cmd: Command): { project: ModularProject; summary: string; warnings: string[] } {
  const patchId = p.activePatchId;
  const needPatch = (): string => {
    if (!patchId || !p.patches.some((x) => x.id === patchId)) throw new RecipeError('Geen actieve patch om te bewerken.');
    return patchId;
  };
  switch (cmd.kind) {
    case 'build': {
      const r = compileRecipe(p, cmd.recipe);
      return { project: buildRecipe(p, cmd.recipe), summary: `Gebouwd: ${r.summary}`, warnings: r.warnings };
    }
    case 'voices': return setVoices(p, needPatch(), cmd.voices);
    case 'replace': {
      const pid = needPatch();
      const m = findModuleByWord(p, pid, cmd.from);
      if (!m) throw new RecipeError(`Geen module "${cmd.from}" in deze patch.`);
      return replaceModule(p, pid, m.id, cmd.to);
    }
    case 'addBus': return addBusFx(p, needPatch(), cmd.module);
    case 'addModulation': {
      const pid = needPatch();
      const m = findModuleByWord(p, pid, cmd.target);
      if (!m) throw new RecipeError(`Geen module "${cmd.target}" in deze patch.`);
      let port = cmd.port ? findPortByWord(p, m, cmd.port) : null;
      if (!port && !cmd.port) {
        const cvIns = resolvePorts(m, p.moduleTypes).filter((q) => q.direction === 'in' && q.signalType === 'cv');
        port = (cvIns.find((q) => q.id === 'cv') ?? cvIns[0])?.id ?? null;
      }
      if (!port) throw new RecipeError(`${m.name} heeft geen cv-ingang "${cmd.port ?? ''}".`);
      return addModulation(p, pid, cmd.source, { moduleId: m.id, portId: port });
    }
  }
}

/** Voor tests en scripts: één regel uitvoeren op het huidige project. */
export function runCommandLine(text: string): { summary: string; warnings: string[] } {
  const p = getProject();
  const parsed = parseCommand(text, p.moduleTypes, !!p.activePatchId);
  let out = { summary: '', warnings: [] as string[] };
  updateProject((q) => { const r = runCommand(q, parsed.command); out = { summary: r.summary, warnings: r.warnings }; return r.project; },
    { forceCommit: true });
  return out;
}

interface Proposal { command: Command | null; summary: string; explanation: string; source: 'ai' | 'explain'; topic?: ExplainTopic }

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
  // Het commando dat "Bouw/Toepassen/Demonstreer" zou uitvoeren: het AI-/
  // uitleg-voorstel als dat er is, anders de deterministische lezing.
  const command: Command | null = proposal ? proposal.command
    : topic ? { kind: 'build', recipe: topic.recipe, mentioned: [], explicitNew: true }
    : parsed?.command ?? null;
  // Droogloop van een nieuwe patch: laat fouten en waarschuwingen vast zien.
  const dry = useMemo(() => {
    if (!command || command.kind !== 'build') return null;
    try { const r = compileRecipe(project, command.recipe); return { ok: true as const, warnings: r.warnings, ops: r.ops, summary: r.summary }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [command, project]);

  if (!open) return null;

  function apply(): void {
    if (!command) return;
    try {
      let result: EditResult | null = null;
      updateProject((p) => { result = runCommand(p, command!); return result.project; }, { forceCommit: true });
      const r = result as EditResult | null;
      if (r) {
        setStatus({ ok: true, text: r.summary + (r.warnings.length ? ` — ${r.warnings.join(' ')}` : '') });
        setText(''); setProposal(null);
        if (command.kind === 'build') onBuilt?.();
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
      const a = await askLlm(text, project, llm);
      setProposal({ command: a.command, summary: a.summary, explanation: a.explanation, source: 'ai' });
      if (!a.command) setStatus({ ok: false, text: a.explanation });
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
  const canApply = !!command && (command.kind !== 'build' || (dry?.ok ?? false)) && (command.kind === 'build' || hasPatch);
  const canDemo = !!onDemo && !!command && command.kind === 'build' && (dry?.ok ?? false);
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
            {command?.kind === 'build' ? 'Bouw' : 'Toepassen'}
          </button>
          <button onClick={demo} disabled={!canDemo} style={canDemo ? secondary : { ...secondary, color: '#9ca3af', cursor: 'default' }}
                  title="Bouw de patch stap voor stap op, met uitleg per stap">▶ Demonstreer</button>
          <button onClick={ask} disabled={!text.trim() || aiBusy || !aiReady} style={{ ...secondary, color: aiReady ? '#0f172a' : '#9ca3af' }}
                  title={aiReady ? 'Laat een taalmodel de vraag vertalen (je ziet eerst een voorstel)' : 'Stel eerst een API-key in (⚙)'}>
            {aiBusy ? '⏳ AI…' : '✨ AI'}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} style={secondary} title="AI-instellingen: endpoint, model, key">⚙</button>
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
              <div style={{ fontSize: 11, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Voorstel van de AI</div>
              <div style={{ fontWeight: 600 }}>{proposal.summary}</div>
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
              {!hasPatch && parsed.command.kind !== 'build' && (
                <div style={{ color: '#b91c1c', marginTop: 4 }}>Er is geen actieve patch om te bewerken.</div>
              )}
            </>
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
