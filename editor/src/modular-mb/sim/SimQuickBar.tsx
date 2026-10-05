// Sim starten/stoppen, opnemen en de MIDI-monitor openen vanuit de tabbalk,
// zonder eerst naar de Simulatie-tab te gaan. De balk staat ook in de
// speelmodus rechtsboven, naast de patchkeuze. Het simulatiepaneel blijft altijd
// gemount; het volgt de engine-status en start dan zelf de MIDI-bron.

import { useEffect, useState } from 'react';
import { getEngine, useEngineStatus } from './engineSingleton';
import { midiMonitor } from './midiMonitor';
import { openMidiMonitor } from './MidiMonitorWindow';
import { RecordButton } from './RecordButton';
import { TuningChip } from './TuningChip';

function useMidiFlash(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | null = null;
    const unsub = midiMonitor.subscribe(() => {
      const last = midiMonitor.list().at(-1);
      if (!last || last.bytes[0] === 0xF8 || last.bytes[0] === 0xFE) return;   // clock telt niet
      setOn(true);
      if (off) clearTimeout(off);
      off = setTimeout(() => setOn(false), 150);
    });
    return () => { unsub(); if (off) clearTimeout(off); };
  }, []);
  return on;
}

export function SimQuickBar(): JSX.Element {
  const status = useEngineStatus();
  const flash = useMidiFlash();
  const [err, setErr] = useState<string | null>(null);
  const btn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd2d9', background: '#fff',
    cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
  };
  async function toggle(): Promise<void> {
    setErr(null);
    try {
      if (status.running) getEngine().stop();
      else await getEngine().start();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', paddingBottom: 4 }}>
      {err && <span style={{ color: '#b91c1c', fontSize: 12 }} title={err}>⚠</span>}
      <button style={{ ...btn, fontWeight: status.running ? 600 : 400, color: status.running ? '#15803d' : undefined }}
        onClick={() => void toggle()}
        title={status.running ? 'Simulator stoppen' : 'Simulator starten (de MIDI-bron uit de Simulatie-tab speelt mee)'}>
        {status.running ? '■ Sim' : '▶ Sim'}
      </button>
      <RecordButton compact style={btn} />
      <TuningChip style={btn} />
      <button style={btn} onClick={openMidiMonitor} title="MIDI-monitor: wat je keyboard stuurt en wat de patch ontvangt">
        <span aria-hidden style={{
          width: 8, height: 8, borderRadius: 4, display: 'inline-block',
          background: flash ? '#22c55e' : '#d1d5db', boxShadow: flash ? '0 0 4px #22c55e' : undefined,
        }} />
        MIDI
      </button>
    </span>
  );
}
