// Commandoregel (Ctrl+K) — ED-RC-2.
//
// Typ wat je wilt; de deterministische parser toont meteen wat hij ervan
// begrijpt (preview) en wat niet ("niet begrepen"). Enter bouwt of past toe.
// Nieuwe patches lopen via het recept (compileRecipe → ops), bewerkingen
// via de werkwoorden in edits.ts. Nooit rechtstreeks aan het project.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject, useModularProject } from '../store';
import { parseCommand, type Command } from './parse';
import { compileRecipe, buildRecipe } from './compile';
import {
  replaceModule, setVoices, addBusFx, addModulation, findModuleByWord, findPortByWord, type EditResult,
} from './edits';
import { RecipeError } from './types';
import { resolvePorts, type ModularProject } from '../types';

const EXAMPLES = [
  'maak een 8x poly patch met een wavetable osc, een simpele vcf en een diode compressor op het eind',
  'nieuwe mono string zonder filter met een galm achteraan',
  '4 stemmige plaits met ladder filter en een phaser per stem',
  'maak deze patch 4 stemmig',
  'vervang de osc door een wavetable',
  'voeg een tape echo toe op de bus',
  'zet een lfo op de cutoff van het filter',
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

export function CommandPalette(props: { open: boolean; onClose: () => void; onBuilt?: () => void }): JSX.Element | null {
  const { open, onClose, onBuilt } = props;
  const project = useModularProject();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hasPatch = !!project.activePatchId && project.patches.some((x) => x.id === project.activePatchId);
  const parsed = useMemo(() => (text.trim() ? parseCommand(text, project.moduleTypes, hasPatch) : null), [text, project.moduleTypes, hasPatch]);
  // Droogloop van een nieuwe patch: laat fouten en waarschuwingen vast zien.
  const dry = useMemo(() => {
    if (!parsed || parsed.command.kind !== 'build') return null;
    try { const r = compileRecipe(project, parsed.command.recipe); return { ok: true as const, warnings: r.warnings }; }
    catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [parsed, project]);

  if (!open) return null;

  function apply(): void {
    if (!parsed) return;
    try {
      let result: EditResult | null = null;
      updateProject((p) => { result = runCommand(p, parsed.command); return result.project; }, { forceCommit: true });
      const r = result as EditResult | null;
      if (r) {
        setStatus({ ok: true, text: r.summary + (r.warnings.length ? ` — ${r.warnings.join(' ')}` : '') });
        setText('');
        if (parsed.command.kind === 'build') onBuilt?.();
      }
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 14, width: 720, maxWidth: '94vw',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const canApply = !!parsed && (parsed.command.kind !== 'build' || (dry?.ok ?? false));

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setStatus(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canApply) { e.preventDefault(); apply(); } }}
            placeholder="Wat wil je bouwen of veranderen? (Esc sluit)"
            style={{ flex: 1, fontSize: 15, padding: '8px 10px', border: '1px solid #cbd2d9', borderRadius: 6, outline: 'none' }}
            data-tour="command-input"
          />
          <button onClick={apply} disabled={!canApply}
            style={{ padding: '8px 14px', fontWeight: 600,
                     background: canApply ? 'var(--mb-accent)' : '#e5e7eb',
                     color: canApply ? 'var(--mb-on-accent)' : '#9ca3af',
                     border: 'none', borderRadius: 6, cursor: canApply ? 'pointer' : 'default' }}>
            {parsed?.command.kind === 'build' ? 'Bouw' : 'Toepassen'}
          </button>
        </div>

        <div style={{ marginTop: 10, minHeight: 44 }}>
          {parsed && (
            <>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{parsed.summary}</div>
              {parsed.unknown.length > 0 && (
                <div style={{ color: '#b45309', marginTop: 4 }}>
                  Niet begrepen: {parsed.unknown.join(', ')}
                </div>
              )}
              {dry && !dry.ok && <div style={{ color: '#b91c1c', marginTop: 4 }}>{dry.error}</div>}
              {dry && dry.ok && dry.warnings.length > 0 && (
                <div style={{ color: '#b45309', marginTop: 4 }}>{dry.warnings.join(' ')}</div>
              )}
              {!hasPatch && parsed.command.kind !== 'build' && (
                <div style={{ color: '#b91c1c', marginTop: 4 }}>Er is geen actieve patch om te bewerken.</div>
              )}
            </>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Voor tests en de LLM-adapter: één regel uitvoeren op het huidige project. */
export function runCommandLine(text: string): { summary: string; warnings: string[] } {
  const p = getProject();
  const parsed = parseCommand(text, p.moduleTypes, !!p.activePatchId);
  let out = { summary: '', warnings: [] as string[] };
  updateProject((q) => { const r = runCommand(q, parsed.command); out = { summary: r.summary, warnings: r.warnings }; return r.project; },
    { forceCommit: true });
  return out;
}
