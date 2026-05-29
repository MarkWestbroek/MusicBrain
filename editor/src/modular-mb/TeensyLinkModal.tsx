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

  // ── One-click test: push config + select patch + play a short arpeggio ──
  const [testing, setTesting] = useState(false);
  async function onTest(): Promise<void> {
    if (testing) return;
    setTesting(true);
    try {
      await sendConfig(project);
      if (activePatchId) await sendSelectPatch(activePatchId);
      // Give the firmware a moment to (re)build the audio + CV graph.
      await sleep(250);
      const arp = [60, 64, 67, 72];   // C-major arpeggio
      for (const note of arp) {
        await sendMidi(true, note, 100);
        await sleep(220);
        await sendMidi(false, note);
        await sleep(40);
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
        if (e.kind === 'noteOn')  void sendMidi(true,  e.note, Math.round(e.velocity * 127));
        else if (e.kind === 'noteOff') void sendMidi(false, e.note);
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

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => { void onTest(); }}
              disabled={!isConnected || testing}
              title="Push config + selecteer actieve patch + speel een test-arpeggio"
            >{testing ? '⏳ Test loopt…' : '▶️ Test patch'}</button>
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
            <button onClick={clearLog} style={{ fontSize: 11 }}>Clear</button>
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
