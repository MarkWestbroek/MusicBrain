// Toetsenbord onder het front (spelermodus): speelt rechtstreeks op de
// engine, los van de MIDI-bron die in de Simulatie-tab gekozen is, zodat
// een speler zonder MIDI-keyboard kan spelen zonder binnen te kijken. De
// eerste aanslag start de simulator als die nog niet loopt (een aanraking
// is de gebruikersactie die Web Audio daarvoor vraagt). Het octaaf wordt
// onthouden.

import { useState } from 'react';

import { getEngine, useEngineStatus } from './sim/engineSingleton';
import { ScreenKeys } from './sim/ScreenKeys';

const OCT_KEY = 'mb.front.octave';

export function FrontKeys(): JSX.Element {
  const status = useEngineStatus();
  const [octave, setOctaveState] = useState<number>(() => {
    try { const raw = localStorage.getItem(OCT_KEY); const v = raw === null ? NaN : Number(raw); return v >= 0 && v <= 8 ? v : 4; } catch { return 4; }
  });
  const [err, setErr] = useState<string | null>(null);
  const setOctave = (d: number): void => {
    const o = Math.max(0, Math.min(8, octave + d));
    setOctaveState(o);
    try { localStorage.setItem(OCT_KEY, String(o)); } catch { /* geen opslag */ }
  };

  function noteOn(midi: number, velocity: number): void {
    const engine = getEngine();
    if (!status.running) {
      // Starten en dan pas de noot; de belofte wachten we niet af in de
      // event-handler, de noot volgt zodra de engine loopt.
      engine.start().then(() => engine.noteOn(midi, velocity)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
      return;
    }
    engine.noteOn(midi, velocity);
  }
  function noteOff(midi: number): void { getEngine().noteOff(midi); }

  return (
    <div>
      <ScreenKeys octave={octave} onOctave={setOctave} onNoteOn={noteOn} onNoteOff={noteOff}
        hint={status.running ? 'Tik of glij over de toetsen; laag op de toets is hard' : 'Eerste aanslag start de simulator'} />
      {err && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}
