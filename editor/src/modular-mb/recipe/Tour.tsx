// Rondleiding (ED-RC-4): coach-marks op `data-tour`-ankers in de UI.
// Elke stap wijst een element aan (spotlight + ballon) en kan op de store
// wachten ("ga verder zodra er een patch is"). Het aangewezen element blijft
// klikbaar: de overlay laat muisklikken door, alleen de ballon vangt ze.

import { useEffect, useLayoutEffect, useState } from 'react';
import { useModularProject } from '../store';
import type { ModularProject } from '../types';

export interface TourStep {
  /** Waarde van `data-tour` op het aan te wijzen element; weglaten = midden. */
  anchor?: string;
  title: string;
  text: string;
  /** Tab die open moet staan voor deze stap. */
  tab?: string;
  /** Actie-knop in de ballon. */
  action?: { label: string; run: 'openCommand' };
  /** Automatisch door zodra dit waar is. */
  done?: (p: ModularProject, start: ModularProject) => boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { title: 'Welkom in de MusicBrain-editor',
    text: 'Hier bouw je patches voor de brain: modules in een rack, kabels in de patcher, en je hoort alles meteen in de simulatie. Deze rondleiding duurt een minuut.' },
  { anchor: 'tab-rack', tab: 'rack', title: 'Het rack',
    text: 'Modules staan in racks. Het interne rack bevat de MMB-modules (VCO, VCF, envelopes, mixer); een fysiek rack is jouw eigen Eurorack-case.' },
  { anchor: 'tab-patcher', tab: 'patcher', title: 'De patcher',
    text: 'Hier trek je kabels tussen poorten. Bij een polyfone patch patch je alleen de master-stem; de poly-groepen doen de rest.' },
  { anchor: 'command-button', title: 'Het snelste begin: ⌘ Recept',
    text: 'Typ wat je wilt, bijvoorbeeld "maak een 4 stemmige patch met een wavetable osc en een galm achteraan", en kies Bouw of Demonstreer. Ctrl+K opent hetzelfde venster.',
    action: { label: 'Open de commandoregel', run: 'openCommand' },
    done: (p, start) => p.patches.length > start.patches.length },
  { anchor: 'tab-patcher', tab: 'patcher', title: 'Rechtsklik in de patcher',
    text: 'Rechtsklik op een module: vervangen door een ander type, een LFO of envelope op een cv-ingang. Rechtsklik op het lege vlak: stemmen of een bus-effect.' },
  { anchor: 'tab-simulation', tab: 'simulation', title: 'Simulatie',
    text: 'Druk op Start en speel op je MIDI-keyboard of de toetsen op het scherm. Elke knop die je draait hoor je direct.' },
  { anchor: 'teensy-button', title: 'Naar de hardware',
    text: 'Verbind de Teensy via USB en push de patch. Knopstanden gaan daarna live naar de brain.' },
  { title: 'Klaar', text: 'Veel plezier. De rondleiding kun je altijd opnieuw starten via de ?-knop.' },
];

const SEEN_KEY = 'mmb.tour.v1';
export function tourSeen(): boolean { try { return localStorage.getItem(SEEN_KEY) === 'seen'; } catch { return true; } }
export function markTourSeen(): void { try { localStorage.setItem(SEEN_KEY, 'seen'); } catch { /* geen opslag */ } }

function anchorRect(anchor?: string): DOMRect | null {
  if (!anchor) return null;
  const el = document.querySelector(`[data-tour="${anchor}"]`);
  return el ? el.getBoundingClientRect() : null;
}

export function Tour(props: {
  open: boolean; onClose: () => void;
  onTab: (tab: string) => void; onOpenCommand: () => void;
}): JSX.Element | null {
  const { open, onClose, onTab, onOpenCommand } = props;
  const project = useModularProject();
  const [i, setI] = useState(0);
  const [start, setStart] = useState<ModularProject | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[i];

  useEffect(() => { if (open) { setI(0); setStart(project); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && step?.tab) onTab(step.tab); }, [open, i]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && step?.done && start && step.done(project, start)) setI((n) => Math.min(n + 1, TOUR_STEPS.length - 1));
  }, [open, project, start, step]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => setRect(anchorRect(step?.anchor));
    update();
    const t = setInterval(update, 300);
    window.addEventListener('resize', update);
    return () => { clearInterval(t); window.removeEventListener('resize', update); };
  }, [open, step]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open || !step) return null;
  const last = i === TOUR_STEPS.length - 1;
  function close(): void { markTourSeen(); onClose(); }
  function next(): void { if (last) close(); else setI(i + 1); }

  const pad = 6;
  const spot: React.CSSProperties | null = rect ? {
    position: 'fixed', left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad,
    borderRadius: 8, boxShadow: '0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 3px var(--mb-accent)',
    pointerEvents: 'none', zIndex: 90, transition: 'all 200ms',
  } : null;
  const bubbleW = 380;
  const bubble: React.CSSProperties = rect ? {
    position: 'fixed', zIndex: 91, width: bubbleW,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - bubbleW - 8)),
    top: rect.bottom + 14 + (rect.bottom + 200 > window.innerHeight ? -(rect.height + 220) : 0),
  } : {
    position: 'fixed', zIndex: 91, width: 440, left: '50%', top: '30%', transform: 'translateX(-50%)',
  };

  return (
    <>
      {spot ? <div style={spot} /> : <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 90, pointerEvents: 'none' }} />}
      <div style={{ ...bubble, background: '#fff', color: '#0f172a', borderRadius: 10, padding: '14px 16px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.35)', fontSize: 14 }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>stap {i + 1} van {TOUR_STEPS.length}</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{step.title}</div>
        <div style={{ lineHeight: 1.45 }}>{step.text}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          {step.action && (
            <button onClick={() => { if (step.action!.run === 'openCommand') onOpenCommand(); }}
              style={{ ...b, background: 'var(--mb-accent)', color: 'var(--mb-on-accent)', border: 'none', fontWeight: 600 }}>
              {step.action.label}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={close} style={b}>Sluiten</button>
          {i > 0 && <button onClick={() => setI(i - 1)} style={b}>‹ Terug</button>}
          <button onClick={next} style={{ ...b, fontWeight: 600 }}>{last ? 'Klaar' : 'Volgende ›'}</button>
        </div>
      </div>
    </>
  );
}

const b: React.CSSProperties = {
  background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd2d9', borderRadius: 6,
  padding: '6px 12px', cursor: 'pointer', fontSize: 13,
};
