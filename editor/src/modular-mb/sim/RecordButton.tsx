// Opname / Stop: de ene opnameknop, in de Simulatie-tab, rechtsboven naast
// ▶ Sim (expertstand) en in de werkbalk van het toetsenbord (speelmodus en
// volledig scherm). Wat er opgenomen wordt en waar het heen gaat regelt het
// simulatiepaneel (zie recordControl.ts).
//
// Geen ⏺/⏹-emoji: Android tekent die allebei als oranje vierkantje, en dan
// lijkt de opnameknop op de paniekknop. Een rood rondje (opnemen) en een rood
// vierkantje (stoppen) als SVG zien er op elk toestel hetzelfde uit.

import { toggleRecording, useRecordState } from './recordControl';

const TITLE = 'Schrijft de master-som rechtstreeks mee als WAV, en de gespeelde MIDI als .mid met dezelfde naam — geen BlackHole of DAW nodig';

/** Rood rondje (opnemen) of rood vierkantje (stoppen), zo groot als een letter. */
export function RecGlyph({ stop = false }: { stop?: boolean }): JSX.Element {
  return (
    <svg aria-hidden width="0.9em" height="0.9em" viewBox="0 0 10 10" style={{ display: 'block', flex: 'none' }}>
      {stop ? <rect x={1.5} y={1.5} width={7} height={7} rx={1} fill="#dc2626" />
            : <circle cx={5} cy={5} r={4} fill="#dc2626" />}
    </svg>
  );
}

/** `compact`: alleen het teken, voor de werkbalk rechtsboven (telefoon). */
export function RecordButton({ compact = false, style }: { compact?: boolean; style?: React.CSSProperties }): JSX.Element {
  const rec = useRecordState();
  if (!rec.recording) {
    return (
      <button type="button" onClick={toggleRecording} style={style} title={TITLE} aria-label="Opname starten">
        <RecGlyph />{compact ? null : ' Opname'}
      </button>
    );
  }
  const secs = compact ? `${Math.floor(rec.secs / 60)}:${String(Math.floor(rec.secs % 60)).padStart(2, '0')}` : `${rec.secs.toFixed(1)} s`;
  return (
    <button type="button" onClick={toggleRecording} style={{ ...style, color: '#b91c1c', fontWeight: 600, gap: 4 }}
      title="Opname stoppen en bewaren" aria-label="Opname stoppen">
      <RecGlyph stop />{compact ? secs : `Stop · ${secs}`}
    </button>
  );
}

/** De regel onder de knop: loopt er een opname, wat kwam eruit, of wat ging mis. */
export function RecordStatus({ style }: { style?: React.CSSProperties }): JSX.Element | null {
  const rec = useRecordState();
  if (rec.error) return <div style={{ color: '#b91c1c', fontSize: 12, ...style }}>⚠ {rec.error}</div>;
  if (rec.recording) return <div style={{ color: '#b91c1c', fontSize: 12, ...style }}>Opname loopt: speel, en tik dan op het rode vierkantje.</div>;
  if (rec.done) return <div style={{ color: '#475569', fontSize: 12, ...style }}>✔ {rec.done}</div>;
  return null;
}
