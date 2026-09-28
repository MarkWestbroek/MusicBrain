// Bediening van de MIDI-bestandsbron in het simulatiepaneel: bestand
// kiezen en lus aan/uit; transport en voortgang zitten in de pianorol.

import { useEffect, useState } from 'react';
import { MidiFileSource, parseSmf } from './midiFilePlayer';
import { MidiRoll } from './MidiRoll';

const fmt = (ms: number): string => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function MidiFileUi({ source, running, onStartSim }: { source: MidiFileSource; running: boolean; onStartSim?: () => void }): JSX.Element {
  const [, setTick] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => source.onState(() => setTick((x) => x + 1)), [source]);
  const st = source.state();

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const parsed = parseSmf(new Uint8Array(await file.arrayBuffer()));
      if (parsed.events.length === 0) throw new Error('Het bestand bevat geen noten of controllers.');
      source.load(parsed, file.name);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 12 }}>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input type="file" accept=".mid,.midi,audio/midi" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input type="checkbox" checked={st.loop} onChange={(e) => source.setLoop(e.target.checked)} /> lus
      </label>
      {st.name && <span><strong>{st.name}</strong> · {st.events} events · {fmt(st.durationMs)}</span>}
      {!st.name && <span style={{ color: '#6b7280' }}>Kies een .mid; hij speelt zodra de sim draait. Ook de .mid van een sim-opname werkt.</span>}
      {err && <span style={{ color: '#b91c1c' }}>⚠ {err}</span>}
    </div>
    <MidiRoll source={source} canPlay={running} onRequestStart={onStartSim} />
    </div>
  );
}
