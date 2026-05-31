// Editor-side panel for the Teensy USB-Serial link. Live status, push-config
// button, and a scrollable log of all JSON traffic + raw Serial prints.

import { useEffect, useRef, useState } from 'react';
import { getProject } from './store';
import {
  useTeensyLink,
  connect,
  disconnect,
  sendConfig,
  sendSelectPatch,
  sendSetStatic,
  sendMidi,
  sendMidiBend,
  clearLog,
} from './teensyLink';
import { WebMidiSource } from './sim/MidiSource';

interface Props {
  onClose: () => void;
}

export function TeensyLinkModal({ onClose }: Props): JSX.Element {
  const link = useTeensyLink();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new log entries arrive.
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [link.log]);

  const isConnected = link.status.kind === 'connected';
  const project = getProject();
  const activePatchId = project.activePatchId;
  const [staticEnabled, setStaticEnabled] = useState(true);

  // ── Log export ──────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  async function copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatLog(link.log));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      alert(`Kopiëren faalde: ${(err as Error).message}`);
    }
  }
  function saveLog(): void {
    const blob = new Blob([formatLog(link.log)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `teensy-log-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleStatic(): Promise<void> {
    const next = !staticEnabled;
    try { await sendSetStatic(next); setStaticEnabled(next); }
    catch (err) { alert(`setStatic faalde: ${(err as Error).message}`); }
  }

  async function onPush(): Promise<void> {
    try { await sendConfig(project); }
    catch (err) { alert(`Push faalde: ${(err as Error).message}`); }
  }

  async function onPushActivePatch(): Promise<void> {
    if (!activePatchId) { alert('Geen actieve patch geselecteerd.'); return; }
    try { await sendSelectPatch(activePatchId); }
    catch (err) { alert(`selectPatch faalde: ${(err as Error).message}`); }
  }

  // ── One-click test: push config + select patch + play a parametric arpeggio ──
  const [testing, setTesting] = useState(false);
  const [testNotes,  setTestNotes]  = useState(8);   // hoeveel noten in de arpeggio
  const [testOctave, setTestOctave] = useState(48);  // MIDI-rootnoot (48 = C2)
  const [testBpm,    setTestBpm]    = useState(120); // tempo in BPM

  async function onTest(): Promise<void> {
    if (testing) return;
    setTesting(true);
    try {
      await sendConfig(project);
      if (activePatchId) await sendSelectPatch(activePatchId);
      // Give the firmware a moment to (re)build the audio + CV graph.
      await sleep(250);
      // C-groot drieklank arpeggio (0,4,7 semitonen) herhald omhoog.
      const triad = [0, 4, 7];
      const arp = Array.from({ length: testNotes }, (_, i) =>
        testOctave + triad[i % 3]! + 12 * Math.floor(i / 3));
      const noteDur = Math.round(60000 / testBpm * 0.82);
      const noteGap = Math.round(60000 / testBpm * 0.18);
      for (const note of arp) {
        await sendMidi(true, note, 100);
        await sleep(noteDur);
        await sendMidi(false, note);
        await sleep(noteGap);
      }
    } catch (err) {
      alert(`Test faalde: ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  // ── Live MIDI bridge: forward hardware MIDI (e.g. Keystep) to the Teensy ──
  const [bridging, setBridging] = useState(false);
  const midiSrcRef = useRef<WebMidiSource | null>(null);
  async function toggleBridge(): Promise<void> {
    if (bridging) {
      midiSrcRef.current?.stop();
      midiSrcRef.current = null;
      setBridging(false);
      return;
    }
    try {
      const src = new WebMidiSource();
      await src.start();
      src.subscribe((e) => {
        if (e.kind === 'noteOn')       void sendMidi(true,  e.note, Math.round(e.velocity * 127));
        else if (e.kind === 'noteOff') void sendMidi(false, e.note);
        else if (e.kind === 'pitchBend') void sendMidiBend(e.value);
      });
      midiSrcRef.current = src;
      setBridging(true);
    } catch (err) {
      alert(`MIDI-bridge faalde: ${(err as Error).message}`);
    }
  }

  // Stop the bridge when the modal unmounts or the link drops.
  useEffect(() => {
    return () => { midiSrcRef.current?.stop(); midiSrcRef.current = null; };
  }, []);
  useEffect(() => {
    if (!isConnected && bridging) {
      midiSrcRef.current?.stop();
      midiSrcRef.current = null;
      setBridging(false);
    }
  }, [isConnected, bridging]);

  function statusLabel(): string {
    switch (link.status.kind) {
      case 'unsupported':  return '⚠ Web Serial niet beschikbaar (gebruik Chrome/Edge)';
      case 'disconnected': return '○ Niet verbonden';
      case 'connecting':   return '… Verbinden';
      case 'connected':    return `● Verbonden${link.status.fw ? ` — ${link.status.fw}` : ''}${
                                   link.status.version ? ` v${link.status.version}` : ''}${
                                   link.status.step != null ? ` (step ${link.status.step})` : ''}`;
      case 'error':        return `✗ Fout: ${link.status.message}`;
    }
  }

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modalCard}>
        <header style={hdrRow}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Teensy-link (USB Serial)</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            {statusLabel()}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => { void connect(); }}
              disabled={link.status.kind === 'connecting' || link.status.kind === 'connected'
                       || link.status.kind === 'unsupported'}
            >Connect</button>
            <button
              onClick={() => { void disconnect(); }}
              disabled={!isConnected}
            >Disconnect</button>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => { void onPush(); }}
              disabled={!isConnected}
              title="Stuur het volledige ModularProject naar de Teensy"
            >📤 Push config</button>
            <button
              onClick={() => { void onPushActivePatch(); }}
              disabled={!isConnected || !activePatchId}
              title={activePatchId ? `selectPatch ${activePatchId}` : 'Geen actieve patch'}
            >🎯 Select active patch</button>
            <button
              onClick={() => { void toggleStatic(); }}
              disabled={!isConnected}
              title="Mute / unmute de statische 4-stem fallback-graph"
            >{staticEnabled ? '🔊 Static ON' : '🔇 Static OFF'}</button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => { void onTest(); }}
              disabled={!isConnected || testing}
              title="Push config + selecteer actieve patch + speel een test-arpeggio (C-groot drieklank)"
            >{testing ? '⏳ Test loopt…' : '▶️ Test patch'}</button>
            <label style={{ fontSize: 12 }} title="Aantal noten in de arpeggio">
              Noten 
              <select value={testNotes} onChange={(e) => setTestNotes(Number(e.target.value))}
                      disabled={testing} style={{ fontSize: 12 }}>
                {[1,2,3,4,5,6,7,8,9,10,12,14,16].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12 }} title="Startnoot (wortel van de arpeggio)">
              Start 
              <select value={testOctave} onChange={(e) => setTestOctave(Number(e.target.value))}
                      disabled={testing} style={{ fontSize: 12 }}>
                {([0,12,24,36,48,60,72] as const).map((midi) => {
                  const labels: Record<number,string> = {0:'C-3',12:'C-2',24:'C-1',36:'C0',48:'C2',60:'C3',72:'C4'};
                  return <option key={midi} value={midi}>{labels[midi] ?? `MIDI ${midi}`}</option>;
                })}
              </select>
            </label>
            <label style={{ fontSize: 12 }} title="Tempo in BPM">
              BPM 
              <select value={testBpm} onChange={(e) => setTestBpm(Number(e.target.value))}
                      disabled={testing} style={{ fontSize: 12 }}>
                {[30,60,90,120,150,180,210,240].map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <button
              onClick={() => { void toggleBridge(); }}
              disabled={!isConnected}
              title="Stuur MIDI van je hardware-keyboard (Keystep) rechtstreeks door naar de Teensy"
            >{bridging ? '⏹ Stop MIDI-bridge' : '🎹 Keystep → Teensy'}</button>
          </div>

          {link.lastAck && (
            <div style={ackBox(link.lastAck.ok)}>
              {link.lastAck.ok ? 'OK' : 'ERR'} — applied={link.lastAck.applied ?? '?'}
              {link.lastAck.modules != null && `  modules=${link.lastAck.modules}`}
              {link.lastAck.patches != null && `  patches=${link.lastAck.patches}`}
              {link.lastAck.racks   != null && `  racks=${link.lastAck.racks}`}
              {link.lastAck.err && `  err=${link.lastAck.err}`}
            </div>
          )}

          <div style={logHeaderRow}>
            <strong style={{ fontSize: 12 }}>Log</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => { void copyLog(); }}
                style={{ fontSize: 11 }}
                disabled={link.log.length === 0}
                title="Kopieer de volledige log naar het klembord"
              >{copied ? '✓ Gekopieerd' : '📋 Kopieer alles'}</button>
              <button
                onClick={saveLog}
                style={{ fontSize: 11 }}
                disabled={link.log.length === 0}
                title="Sla de volledige log op als tekstbestand"
              >💾 Bewaar</button>
              <button onClick={clearLog} style={{ fontSize: 11 }}>Clear</button>
            </div>
          </div>
          <div ref={logRef} style={logBox}>
            {link.log.length === 0 && <div style={{ opacity: 0.5 }}>(nog geen verkeer)</div>}
            {link.log.map((e, i) => (
              <div key={i} style={{ color: e.dir === 'tx' ? '#0a7' : e.dir === 'rx' ? '#06c' : '#888' }}>
                <span style={{ opacity: 0.6 }}>{fmtTs(e.ts)} {e.dir}</span> {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render the whole link log as plain text, one line per entry. */
function formatLog(log: { ts: number; dir: string; text: string }[]): string {
  return log.map((e) => `${fmtTs(e.ts)} ${e.dir} ${e.text}`).join('\n');
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 16, width: 'min(720px, 95vw)',
  maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};
const hdrRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer',
  lineHeight: 1, padding: '0 8px',
};
const logHeaderRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const logBox: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.4,
  background: '#f7f9fb', border: '1px solid #d6dde4', borderRadius: 4,
  padding: 8, height: 280, overflowY: 'auto', whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};
function ackBox(ok: boolean): React.CSSProperties {
  return {
    fontFamily: 'ui-monospace, monospace', fontSize: 12,
    background: ok ? '#e8f5e9' : '#ffebee',
    border: `1px solid ${ok ? '#a5d6a7' : '#ef9a9a'}`,
    borderRadius: 4, padding: '4px 8px',
  };
}
