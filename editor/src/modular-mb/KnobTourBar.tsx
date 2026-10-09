// KnobTourBar — de balk van de knoptour (knobTour.ts): welke knop er draait
// met zijn uitlegregel, ⏸/▶, Houden (in de pauze) en ✕. Staat bovenaan in
// beeld, zodat het front en het klavier vrij blijven.

import { useEffect } from 'react';

import { nlen, useLang } from '../i18n';
import { keepKnobTour, stopKnobTour, toggleKnobTourPause, useKnobTour } from './knobTour';

export function KnobTourBar({ patchId }: { patchId: string | undefined }): JSX.Element | null {
  useLang();
  const tour = useKnobTour();
  // Andere patch of weg uit de speelmodus: stoppen en terugzetten.
  useEffect(() => { if (tour.status !== 'idle' && tour.patchId !== patchId) stopKnobTour(); }, [patchId, tour.status, tour.patchId]);
  useEffect(() => () => stopKnobTour(), []);
  useEffect(() => {
    if (tour.status === 'idle') return;
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') stopKnobTour();
      else if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); toggleKnobTourPause(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [tour.status]);
  if (tour.status === 'idle') return null;
  const paused = tour.status === 'paused';
  const b: React.CSSProperties = { fontSize: 13, padding: '4px 10px', cursor: 'pointer', borderRadius: 6, border: '1px solid #4b5563', background: '#374151', color: '#f9fafb' };
  return (
    <div role="status" style={{
      position: 'fixed', zIndex: 45, top: 8, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, calc(100vw - 16px))', boxSizing: 'border-box',
      background: '#1f2937', color: '#f9fafb', borderRadius: 10, padding: '8px 10px', boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 13, lineHeight: 1.35 }}>
        <strong style={{ color: '#fbbf24' }}>{tour.label}</strong>
        {tour.help && <> · {tour.help}</>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={b} onClick={toggleKnobTourPause}>
          {paused ? nlen('▶ Verder', '▶ Resume') : nlen('⏸ Pauze', '⏸ Pause')}
        </button>
        {paused && (
          <button type="button" style={{ ...b, background: '#f59e0b', borderColor: '#f59e0b', color: '#111827', fontWeight: 700 }} onClick={keepKnobTour}
            title={nlen('Deze stand in de patch zetten; daarna kun je bewaren', 'Put this setting in the patch; then you can save it')}>
            {nlen('Houden', 'Keep')}
          </button>
        )}
        <span style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>
          {paused ? nlen('Mooi? Houden zet deze stand in de patch.', 'Like it? Keep puts this setting in the patch.')
            : nlen('Luister en kijk naar de oranje knop.', 'Listen and watch the orange knob.')}
        </span>
        <button type="button" style={b} onClick={stopKnobTour} aria-label={nlen('Stoppen', 'Stop')}
          title={nlen('Stoppen; de knop gaat terug', 'Stop; the knob goes back')}>✕</button>
      </div>
    </div>
  );
}
