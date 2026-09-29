// Bediening van de MIDI-bestandsbron in het simulatiepaneel: bestand
// kiezen en lus aan/uit; transport en voortgang zitten in de pianorol.

import { useEffect, useState } from 'react';
import { MidiFileSource, parseSmf, encodeEdited } from './midiFilePlayer';
import { MidiRoll } from './MidiRoll';
import { offerFromSysex } from './PatchInbox';

const fmt = (ms: number): string => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function MidiFileUi({ source, running, onStartSim, onReplace }: {
  source: MidiFileSource; running: boolean; onStartSim?: () => void;
  /** Vervang het .mid-bestand van de take in de library; geeft de slug terug. */
  onReplace?: (slug: string, name: string, bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}): JSX.Element {
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** Tempo, tel 1 en lus in het bestand zetten. */
  function edited(): { bytes: Uint8Array<ArrayBuffer>; name: string } | null {
    const bytes = encodeEdited(source);
    const name = source.fileNameOf() ?? 'take.mid';
    return bytes ? { bytes, name } : null;
  }
  /** Het nieuwe bestand laden; de plek blijft staan. */
  function reloadFrom(bytes: Uint8Array<ArrayBuffer>, name: string): void {
    const pos = source.position();
    source.load(parseSmf(bytes), name, source.origin());
    source.seek(pos);
  }
  function download(): void {
    const e = edited(); if (!e) return;
    const url = URL.createObjectURL(new Blob([e.bytes], { type: 'audio/midi' }));
    const a = document.createElement('a'); a.href = url; a.download = e.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    reloadFrom(e.bytes, e.name);
    setSaveMsg({ ok: true, text: `${e.name} gedownload met tempo, tel 1 en lus.` });
  }
  async function replace(): Promise<void> {
    const e = edited(); const o = source.origin();
    if (!e || !o || !onReplace) return;
    setSaving(true); setSaveMsg(null);
    try {
      await onReplace(o.slug, e.name, e.bytes);
      reloadFrom(e.bytes, e.name);
      setSaveMsg({ ok: true, text: 'Vervangen in de library; de vorige versie blijft in de geschiedenis.' });
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally { setSaving(false); }
  }
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
      void offerFromSysex(parsed.sysex, file.name);
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
      <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}
        title="Sneller of trager afspelen; toonhoogte en klank blijven gelijk, alleen de noten schuiven">
        snelheid
        <select value={source.getSpeed()} onChange={(e) => source.setSpeed(Number(e.target.value))}>
          {[0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((x) => <option key={x} value={x}>{Math.round(x * 100)}%</option>)}
        </select>
      </label>
      {st.name && <span><strong>{st.name}</strong> · {st.events} events · {fmt(st.durationMs)}</span>}
      {!st.name && <span style={{ color: '#6b7280' }}>Kies een .mid; hij speelt zodra de sim draait. Ook de .mid van een sim-opname werkt.</span>}
      {st.name && (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <button onClick={download} title="Download de .mid met het tempo, tel 1 en het lusvenster van nu (markers loopStart/loopEnd)">⤓ .mid</button>
          {source.origin() && onReplace && (
            <button onClick={() => void replace()} disabled={saving}
              title="Zet deze .mid met het tempo, tel 1 en de lus van nu terug in de library, in plaats van het origineel">
              {saving ? '… bezig' : '⤴ In library vervangen'}
            </button>
          )}
        </span>
      )}
      {saveMsg && <span style={{ color: saveMsg.ok ? '#15803d' : '#b91c1c' }}>{saveMsg.ok ? '✔' : '⚠'} {saveMsg.text}</span>}
      {err && <span style={{ color: '#b91c1c' }}>⚠ {err}</span>}
    </div>
    <MidiRoll source={source} canPlay={running} onRequestStart={onStartSim} />
    </div>
  );
}
