// Demonstratiemodus (ED-RC-4): speel de ops van een recept één voor één af
// met de uitleg (`note`) als ballon. De patcher bouwt zichtbaar mee. De
// eerste op maakt één undo-punt; de rest gaat buiten de history om, zodat
// Ctrl+Z de hele demonstratie in één keer terugdraait.

import { useEffect, useState } from 'react';
import { updateProject } from '../store';
import type { ModularProject } from '../types';
import { applyOp } from './compile';
import type { PatchOp, PatchRecipe } from './types';

export interface DemoState {
  index: number;      // aantal toegepaste ops
  total: number;
  note: string;       // laatst getoonde uitleg
  done: boolean;
}

export interface DemoHandle { stop: () => void; finish: () => void }

export function startDemo(
  ops: PatchOp[],
  onState: (s: DemoState) => void,
  opts: { noteMs?: number; stepMs?: number } = {},
): DemoHandle {
  const noteMs = opts.noteMs ?? 1800;
  const stepMs = opts.stepMs ?? 120;
  let i = 0;
  let note = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const applyNext = (): void => {
    const op = ops[i]!;
    updateProject((p: ModularProject) => applyOp(p, op), i === 0 ? { forceCommit: true } : { skipHistory: true });
    if (op.note) note = op.note;
    i += 1;
    onState({ index: i, total: ops.length, note, done: i >= ops.length });
  };
  const tick = (): void => {
    if (stopped || i >= ops.length) return;
    applyNext();
    if (i < ops.length) timer = setTimeout(tick, ops[i - 1]!.note ? noteMs : stepMs);
  };
  tick();

  return {
    stop: () => { stopped = true; if (timer) clearTimeout(timer); },
    finish: () => {
      stopped = true; if (timer) clearTimeout(timer);
      while (i < ops.length) applyNext();
    },
  };
}

/** Ballon onder in beeld met de lopende uitleg en een voortgangsbalk. */
export function DemoCaption(props: { state: DemoState | null; onSkip: () => void; onClose: () => void }): JSX.Element | null {
  const { state, onSkip, onClose } = props;
  const [visible, setVisible] = useState(true);
  useEffect(() => { setVisible(true); }, [state]);
  if (!state || !visible) return null;
  const pct = Math.round((state.index / Math.max(1, state.total)) * 100);
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 70,
      background: '#0f172a', color: '#f8fafc', borderRadius: 10, padding: '12px 16px', width: 560, maxWidth: '92vw',
      boxShadow: '0 12px 40px rgba(0,0,0,0.35)', fontSize: 14, border: '1px solid #334155',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{state.done ? '✅' : '🎬'}</span>
        <div style={{ flex: 1, minHeight: 20 }}>{state.note || 'De patch wordt opgebouwd…'}</div>
        {!state.done && <button onClick={onSkip} style={btn}>Sla over ⏭</button>}
        <button onClick={() => { setVisible(false); onClose(); }} style={btn}>{state.done ? 'Sluiten' : '✕'}</button>
      </div>
      <div style={{ marginTop: 8, height: 4, background: '#334155', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mb-accent)', borderRadius: 2, transition: 'width 200ms' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>stap {state.index} van {state.total}</div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12,
};

// ── uitlegvragen ("hoe maak ik vibrato?") → recept + intro ──────────────

export interface ExplainTopic { id: string; title: string; intro: string; recipe: PatchRecipe; match: RegExp }

export const EXPLAIN_TOPICS: ExplainTopic[] = [
  { id: 'basis', title: 'Een basis-synthstem', match: /\b(basis|begin|start|eerste|simpel\w*|simple|basic|hoe werkt|how does)\b/,
    intro: 'De kortste speelbare keten: MIDI-in → VCO → VCF → VCA → OUT, met een envelope op de VCA.',
    recipe: { voices: 1, source: 'vco', filter: 'vcf', vibrato: false } },
  { id: 'vibrato', title: 'Vibrato met de modwheel', match: /\bvibrato\b/,
    intro: 'Een LFO wordt vermenigvuldigd met de modwheel en opgeteld bij de pitch-bend; samen sturen ze de tune-ingang van de VCO.',
    recipe: { voices: 1, source: 'vco', filter: 'vcf', vibrato: true } },
  { id: 'poly', title: 'Polyfonie met poly-groepen', match: /\b(poly\w*|stemmen|meerstemmig|voices|chords?|akkoord\w*)\b/,
    intro: 'Je patcht alleen de master-stem; de poly-groepen laten de firmware dezelfde kabels per stem leggen. De mixer telt de stemmen op.',
    recipe: { voices: 4, source: 'vco', filter: 'vcf' } },
  { id: 'filterenv', title: 'Een filter-envelope', match: /\b(filter[- ]?env\w*|sweep|cutoff)\b/,
    intro: 'Een tweede envelope sweept de cutoff van het filter per noot: dat geeft de klassieke "wow" aan het begin van elke toon.',
    recipe: { voices: 1, source: 'vco', filter: 'ladder', filterEnv: true, vibrato: false } },
  { id: 'bus', title: 'Een effect op de bus', match: /\b(bus|master|compress\w*|effect\w*|galm|reverb|echo|delay)\b/,
    intro: 'Bus-effecten staan achter de mixer en werken op alle stemmen tegelijk; stereo modules krijgen L en R, mono modules een paar.',
    recipe: { voices: 2, source: 'vco', filter: 'vcf', bus: ['diode'] } },
  { id: 'string', title: 'Physical modelling (String)', match: /\b(string|snaar|karplus|pluck|physical)\b/,
    intro: 'De String-module heeft een eigen gate-ingang: de MIDI-gate plukt de snaar. Een VCF erachter kleurt het geluid.',
    recipe: { voices: 4, source: 'string', filter: 'vcf' } },
];

/** Herken een uitlegvraag ("hoe maak ik …", "wat is …", "laat zien …"). */
export function findExplainTopic(text: string): ExplainTopic | null {
  const t = text.toLowerCase();
  if (!/^(hoe|how|wat is|wat zijn|what is|laat\b.*\bzien|show me|demonstreer|demo|leg\b.*\buit|explain)\b/.test(t.trim())) return null;
  return EXPLAIN_TOPICS.find((x) => x.match.test(t)) ?? null;
}
