// ⏺ Opname / ⏹ Stop: de ene opnameknop, in de Simulatie-tab en rechtsboven
// naast ▶ Sim (ook in de speelmodus). Op volledig scherm staat die werkbalk
// buiten beeld: dan staat de knop in het podium, rechts naast de
// patchkeuze. Wat er opgenomen wordt en waar het heen gaat regelt het
// simulatiepaneel (zie recordControl.ts).

import { toggleRecording, useRecordState } from './recordControl';

const TITLE = 'Schrijft de master-som rechtstreeks mee als WAV, en de gespeelde MIDI als .mid met dezelfde naam — geen BlackHole of DAW nodig';

/** `compact`: alleen het teken, voor de werkbalk rechtsboven (telefoon). */
export function RecordButton({ compact = false, style }: { compact?: boolean; style?: React.CSSProperties }): JSX.Element {
  const rec = useRecordState();
  if (!rec.recording) {
    return (
      <button type="button" onClick={toggleRecording} style={style} title={TITLE} aria-label="Opname starten">
        {compact ? <span aria-hidden style={{ color: '#b91c1c' }}>⏺</span> : '⏺ Opname'}
      </button>
    );
  }
  const secs = compact ? `${Math.floor(rec.secs / 60)}:${String(Math.floor(rec.secs % 60)).padStart(2, '0')}` : `${rec.secs.toFixed(1)} s`;
  return (
    <button type="button" onClick={toggleRecording} style={{ ...style, color: '#b91c1c', fontWeight: 600 }}
      title="Opname stoppen en bewaren" aria-label="Opname stoppen">
      {compact ? `⏹ ${secs}` : `⏹ Stop · ${secs}`}
    </button>
  );
}

/** De regel onder de knop: loopt er een opname, wat kwam eruit, of wat ging mis. */
export function RecordStatus({ style }: { style?: React.CSSProperties }): JSX.Element | null {
  const rec = useRecordState();
  if (rec.error) return <div style={{ color: '#b91c1c', fontSize: 12, ...style }}>⚠ {rec.error}</div>;
  if (rec.recording) return <div style={{ color: '#b91c1c', fontSize: 12, ...style }}>⏺ Opname loopt: speel, en tik dan op ⏹.</div>;
  if (rec.done) return <div style={{ color: '#475569', fontSize: 12, ...style }}>✔ {rec.done}</div>;
  return null;
}
