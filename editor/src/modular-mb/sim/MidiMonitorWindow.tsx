// MIDI-monitor: een versleepbaar venster met de MIDI-stroom, zoals MIDI-OX.
// Toont ruwe MIDI van de apparaten ('in') en wat de sim naar de patch
// stuurt ('patch'), met hex/decimaal-schakelaar, pauze, wissen en filters.
// Openen: openMidiMonitor() (knop in de tabbalk, of een LEDje op MIDI-In).

import { useEffect, useRef, useState } from 'react';
import { midiMonitor, describeMidi, formatBytes, type MonEntry } from './midiMonitor';

// ── open/dicht, zonder globale store ──────────────────────────────────
const openListeners = new Set<(open: boolean) => void>();
let isOpen = false;
export function openMidiMonitor(): void { isOpen = true; openListeners.forEach((fn) => fn(true)); }
export function closeMidiMonitor(): void { isOpen = false; openListeners.forEach((fn) => fn(false)); }
export function useMidiMonitorOpen(): boolean {
  const [open, setOpen] = useState(isOpen);
  useEffect(() => { openListeners.add(setOpen); return () => { openListeners.delete(setOpen); }; }, []);
  return open;
}

interface Prefs { hex: boolean; hideRealtime: boolean; showIn: boolean; showPatch: boolean }
const PREFS_KEY = 'mmb.midimon.v1';
function loadPrefs(): Prefs {
  const def: Prefs = { hex: false, hideRealtime: true, showIn: true, showPatch: true };
  try { return { ...def, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) }; } catch { return def; }
}

const SHOW = 400;

/** Altijd gemount (in de app); rendert alleen als het venster open is. */
export function MidiMonitorHost(): JSX.Element | null {
  const open = useMidiMonitorOpen();
  return open ? <MidiMonitorWindow onClose={closeMidiMonitor} /> : null;
}

function MidiMonitorWindow({ onClose }: { onClose: () => void }): JSX.Element {
  const [prefs, setPrefsRaw] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>): void => {
    setPrefsRaw((old) => {
      const next = { ...old, ...p };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* geen opslag */ }
      return next;
    });
  };
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<readonly MonEntry[] | null>(null);
  const [, setTick] = useState(0);
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 640), y: 80 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // De ruwe stroom pas openen als het venster er is (toestemmingsvraag).
  useEffect(() => { void midiMonitor.startRaw(); }, []);

  useEffect(() => {
    let raf = 0;
    const unsub = midiMonitor.subscribe(() => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((x) => x + 1); });
    });
    return () => { unsub(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!drag.current) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)) });
    };
    const up = (): void => { drag.current = null; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const all = paused && frozen ? frozen : midiMonitor.list();
  const rows = all.filter((e) => (e.dir === 'in' ? prefs.showIn : prefs.showPatch)
    && !(prefs.hideRealtime && describeMidi(e.bytes).realtime));
  const shown = rows.slice(-SHOW);
  const t0 = shown[0]?.t ?? 0;

  useEffect(() => {
    if (!paused && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  });

  const inputs = midiMonitor.inputNames();
  const box: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 65, width: 600, maxWidth: 'calc(100vw - 32px)',
    background: '#0f172a', color: '#e2e8f0', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    fontSize: 12, display: 'flex', flexDirection: 'column',
  };
  const btn: React.CSSProperties = { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 };
  const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3 };

  return (
    <div style={box} role="dialog" aria-label="MIDI-monitor">
      <div onMouseDown={(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.preventDefault(); }}
        style={{ cursor: 'move', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #1e293b' }}>
        <strong>MIDI-monitor</strong>
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          title={inputs.join(', ')}>
          {midiMonitor.rawError ? `⚠ ${midiMonitor.rawError}` : inputs.length ? `in: ${inputs.join(', ')}` : 'geen MIDI-apparaten'}
        </span>
        <button style={btn} onClick={onClose} aria-label="Sluiten">✕</button>
      </div>
      <div style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button style={btn} onClick={() => setPrefs({ hex: !prefs.hex })} title="Bytes als hexadecimaal of decimaal">
          {prefs.hex ? 'HEX' : 'DEC'}
        </button>
        <button style={btn} onClick={() => { setFrozen(paused ? null : [...midiMonitor.list()]); setPaused(!paused); }}>
          {paused ? '▶ Verder' : '⏸ Pauze'}
        </button>
        <button style={btn} onClick={() => { midiMonitor.clear(); setFrozen(null); }}>Wissen</button>
        <label style={chk} title="Ruwe MIDI zoals het apparaat hem stuurt">
          <input type="checkbox" checked={prefs.showIn} onChange={(e) => setPrefs({ showIn: e.target.checked })} /> apparaat
        </label>
        <label style={chk} title="Wat de simulator naar de MIDI-In-modules van de patch stuurt">
          <input type="checkbox" checked={prefs.showPatch} onChange={(e) => setPrefs({ showPatch: e.target.checked })} /> → patch
        </label>
        <label style={chk} title="Clock (F8) en active sensing (FE) verbergen">
          <input type="checkbox" checked={prefs.hideRealtime} onChange={(e) => setPrefs({ hideRealtime: e.target.checked })} /> clock verbergen
        </label>
      </div>
      <div ref={listRef} style={{ fontFamily: 'ui-monospace, Consolas, monospace', height: 320, overflowY: 'auto', padding: '0 10px 8px' }}>
        {shown.length === 0 && (
          <div style={{ color: '#64748b', padding: '12px 0' }}>
            Nog niets. Speel iets op je keyboard; bij "apparaat" zie je wat het stuurt, bij "→ patch" wat de sim doorgeeft
            (alleen als de sim draait).
          </div>
        )}
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {shown.map((e) => {
              const d = describeMidi(e.bytes);
              return (
                <tr key={e.id} style={{ color: e.dir === 'patch' ? '#86efac' : '#e2e8f0' }}>
                  <td style={{ color: '#64748b', paddingRight: 8, whiteSpace: 'nowrap' }}>{((e.t - t0) / 1000).toFixed(3)}</td>
                  <td style={{ paddingRight: 8, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.src}>
                    {e.dir === 'patch' ? '→ patch' : e.src}
                  </td>
                  <td style={{ paddingRight: 8, whiteSpace: 'pre' }}>{formatBytes(e.bytes, prefs.hex)}</td>
                  <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>{d.channel ? `ch ${d.channel}` : ''}</td>
                  <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }}>{d.type}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
