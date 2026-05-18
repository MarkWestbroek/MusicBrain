import { useEffect, useRef, useState } from 'react';
import { devicesInFlowOrder, setActivePatch } from './actions';
import { useProject } from './store';
import { EditorSimulationPanel } from './EditorSimulationPanel';
import { t } from '../i18n';
import {
  MidiParser,
  MidiType,
  describeMessage,
  hex2,
  serializeProgramChange,
} from './midiSim';

interface LogEntry {
  t: number;
  text: string;
}

/** A byte currently in flight on the simulated MIDI cable. */
interface WireByte {
  id:      number;   // unique key for React
  value:   number;   // 0..255
  bornAt:  number;   // performance.now() when launched
}

/** Total transit time per byte across the visualised cable. The real MIDI
 *  bitrate (31 250 baud → ~320 µs per byte) is invisible to humans — we
 *  inflate it so the user can actually watch the bytes travel. */
const WIRE_TRANSIT_MS = 700;

/**
 * Top-level Simulation tab — switches between two distinct use-case views.
 * Each view simulates a *different* user story, so they intentionally show
 * different things on screen.
 */
export function SimulationPanel(): JSX.Element {
  type Mode = 'box' | 'editor';
  const [mode, setMode] = useState<Mode>('box');

  return (
    <section>
      <div className="es-sim-modetabs">
        <button
          className="es-sim-modetab"
          aria-selected={mode === 'box'}
          onClick={() => setMode('box')}
        >
          🎸 {t('sim.box.title')}
          <span className="es-sim-modetab-sub">{t('sim.box.subtitle')}</span>
        </button>
        <button
          className="es-sim-modetab"
          aria-selected={mode === 'editor'}
          onClick={() => setMode('editor')}
        >
          💻 {t('sim.editor.title')}
          <span className="es-sim-modetab-sub">{t('sim.editor.subtitle')}</span>
        </button>
      </div>

      {mode === 'box'    && <BoxSimulationPanel />}
      {mode === 'editor' && <EditorSimulationPanel />}
    </section>
  );
}

/**
 * "Musician using the box" — the original, on-stage view: footswitch + brain
 * + relay matrix + audio signal path. Pure offline simulation; no device
 * involvement.
 */
function BoxSimulationPanel(): JSX.Element {
  const project = useProject();
  const active  = project.patches.find((p) => p.id === project.activePatchId)
               ?? project.patches[0];
  const ordered  = devicesInFlowOrder(project);
  const bypassed = new Set(active?.bypassed ?? []);
  const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));

  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  // ── Simulated MIDI cable: bytes currently travelling left→right ──────────
  const [wire, setWire] = useState<WireByte[]>([]);
  const nextByteId = useRef(1);
  // Parser lives on the "Brain" end of the cable. It is recreated only once;
  // its callback closes over `setActivePatch` + `push` which are stable.
  const parserRef = useRef<MidiParser | null>(null);
  if (parserRef.current === null) {
    parserRef.current = new MidiParser((m) => {
      const label = describeMessage(m);
      push(`◀ MIDI in: ${label}`);
      if (m.type === MidiType.ProgramChange) {
        // The editor's SwitcherPatch.id IS the MIDI program number (see
        // types.ts). Match exactly; if no patch has that id, fall back to
        // index modulo so something audible always happens.
        const ps = projectRef.current.patches;
        if (ps.length > 0) {
          const exact = ps.find((p) => p.id === m.data1);
          const target = exact ?? ps[m.data1 % ps.length]!;
          setActivePatch(target.id);
        }
      }
    });
  }
  // Keep a ref to the latest project so the parser callback always sees
  // current patches without resubscribing.
  const projectRef = useRef(project);
  projectRef.current = project;

  function push(text: string): void {
    setLog((prev) => [...prev.slice(-29), { t: Date.now(), text }]);
  }

  /** Push raw bytes onto the simulated cable; they will be parsed on arrival. */
  function transmitBytes(bytes: Uint8Array, label: string): void {
    push(`▶ MIDI out: ${label}  [${Array.from(bytes).map(hex2).join(' ')}]`);
    const now = performance.now();
    setWire((prev) => [
      ...prev,
      // Stagger so successive bytes don't visually overlap. ~120 ms is enough
      // to keep them readable.
      ...Array.from(bytes, (value, i) => ({
        id:     nextByteId.current++,
        value,
        bornAt: now + i * 120,
      })),
    ]);
  }

  function onUp(): void {
    const ps = projectRef.current.patches;
    if (ps.length === 0) return;
    const i = ps.findIndex((p) => p.id === projectRef.current.activePatchId);
    const next = ps[((i < 0 ? 0 : i) + 1) % ps.length]!;
    transmitBytes(serializeProgramChange(1, next.id), `PC1 #${next.id}  (▲ next)`);
  }
  function onDown(): void {
    const ps = projectRef.current.patches;
    if (ps.length === 0) return;
    const i = ps.findIndex((p) => p.id === projectRef.current.activePatchId);
    const prev = ps[((i < 0 ? 0 : i) - 1 + ps.length) % ps.length]!;
    transmitBytes(serializeProgramChange(1, prev.id), `PC1 #${prev.id}  (▼ prev)`);
  }
  function onPC(id: number): void {
    const p = projectRef.current.patches.find((x) => x.id === id);
    if (!p) return;
    transmitBytes(serializeProgramChange(1, p.id), `PC1 #${p.id} → "${p.name}"`);
  }

  // ── Animation loop: advance the wire and dispatch bytes as they arrive ──
  // We bump a frame counter every requestAnimationFrame so the byte chips
  // are re-rendered (and their `left` is recomputed) while in flight.
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (wire.length === 0) return;
    let raf = 0;
    const tick = (): void => {
      const now = performance.now();
      const arrived: WireByte[] = [];
      const stillFlying: WireByte[] = [];
      for (const b of wire) {
        if (now - b.bornAt >= WIRE_TRANSIT_MS) arrived.push(b);
        else stillFlying.push(b);
      }
      if (arrived.length > 0) {
        // Feed parser in the order they were launched.
        arrived.sort((a, b) => a.bornAt - b.bornAt);
        for (const b of arrived) parserRef.current!.processByte(b.value);
        setWire(stillFlying);
        return;
      }
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wire]);

  useEffect(() => {
    if (project.patches.length === 0) setLog([]);
  }, [project.patches.length]);

  // relayIndex → true (closed/active) | false (open/bypassed) | undefined (unassigned)
  const relayState = new Map<number, boolean>();
  for (const d of project.devices) {
    if (d.relayIndex >= 0) relayState.set(d.relayIndex, !bypassed.has(d.id));
  }

  return (
    <section>
      {/* ── Control flow row ── */}
      <div className="es-sim-flow">

        {/* Input */}
        <div className="es-sim-stage">
          <div className="es-sim-stage-title">Input</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <button className="es-fs-button" onClick={onUp} title="Previous patch">▲</button>
            <button className="es-fs-button" onClick={onDown} title="Next patch">▼</button>
            <div style={{ fontSize: 10, color: '#6b7280' }}>footswitch</div>
            <select
              value={active?.id ?? 0}
              onChange={(e) => onPC(parseInt(e.target.value, 10))}
              style={{ width: '100%', fontSize: 11, marginTop: 4 }}
            >
              {project.patches.map((p) => (
                <option key={p.id} value={p.id}>PC {p.id + 1} — {p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* MIDI connector — animated: shows real serialized bytes flying through */}
        <div className="es-sim-connector es-sim-connector--midi">
          <div className="es-sim-midi-wire">
            <div className="es-sim-cable" />
            <span className="es-sim-conn-badge">MIDI</span>
            <div className="es-sim-cable" />
            <span className="es-sim-conn-arrow">▶</span>
            {wire.map((b) => {
              const now = performance.now();
              const progress = Math.max(0,
                Math.min(1, (now - b.bornAt) / WIRE_TRANSIT_MS));
              return (
                <span
                  key={b.id}
                  className={`es-sim-midi-byte${(b.value & 0x80) ? ' status' : ''}`}
                  style={{ left: `calc(${progress * 100}% - 14px)` }}
                  title={`0x${hex2(b.value)} (${b.value})`}
                >
                  {hex2(b.value)}
                </span>
              );
            })}
          </div>
        </div>

        {/* Brain */}
        <div className="es-sim-stage">
          <div className="es-sim-stage-title">Brain</div>
          <div className="es-brain es-brain--sim">
            <div><span className="es-brain-led" />{active?.name ?? '—'}</div>
            <div style={{ color: '#a5f3fc', fontSize: 11, marginTop: 2 }}>
              PC {active ? active.id + 1 : '—'}
            </div>
          </div>
          <button className="es-sim-log-toggle" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Log ▲' : 'Log ▼'}
          </button>
          {showLog && (
            <div className="es-sim-log">
              {log.length === 0
                ? <span style={{ color: '#94a3b8', fontSize: 11 }}>No events yet.</span>
                : [...log].reverse().map((e, i) => (
                    <div key={e.t + '_' + i} className="es-sim-log-entry">
                      {new Date(e.t).toLocaleTimeString()} {e.text}
                    </div>
                  ))}
            </div>
          )}
        </div>

        {/* Relay control connector */}
        <div className="es-sim-connector">
          <div className="es-sim-cable" />
          <span className="es-sim-conn-badge">relay ctrl</span>
          <div className="es-sim-cable" />
          <span className="es-sim-conn-arrow">▶</span>
        </div>

        {/* Relay matrix */}
        <div className="es-sim-stage">
          <div className="es-sim-stage-title">Relay Matrix</div>
          <div className="es-relay-matrix">
            {Array.from({ length: project.relayCount }, (_, i) => (
              <div
                key={i}
                className={`es-relay-cell${relayState.get(i) === true ? ' closed' : ''}`}
                title={`R${i + 1}: ${
                  !relayState.has(i)
                    ? 'unassigned'
                    : relayState.get(i) ? 'closed (active)' : 'open (bypassed)'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Output connector */}
        <div className="es-sim-connector">
          <div className="es-sim-cable" />
          <span className="es-sim-conn-arrow">▶</span>
        </div>

        {/* Output */}
        <div className="es-sim-stage es-sim-stage--out">
          <div className="es-sim-stage-title">Output</div>
          <div style={{ fontSize: 32, textAlign: 'center', paddingTop: 8 }}>🔊</div>
        </div>

      </div>

      {/* ── Audio signal path ── */}
      <div className="es-sim-audio">
        <div className="es-sim-audio-ep">Guitar IN</div>
        <div className="es-sim-audio-arrow active">▶</div>

        {ordered.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: 12, padding: '0 12px', alignSelf: 'center' }}>
            No effects defined — add them in the Effect-chain tab.
          </div>
        )}

        {ordered.map((d, i) => {
          const isBypassed = bypassed.has(d.id);
          const next = ordered[i + 1];
          const arrowActive = !isBypassed && (!next || !bypassed.has(next.id));
          return (
            <span key={d.id} style={{ display: 'contents' }}>
              <div className={`es-sim-pedal-card${isBypassed ? ' bypassed' : ' active'}`}>
                <div className="es-sim-pedal-relay">
                  {d.relayIndex >= 0 ? `R${d.relayIndex + 1}` : 'R—'}
                </div>
                {d.imageDataUrl
                  ? <img src={d.imageDataUrl} alt={d.model} className="es-sim-pedal-img" />
                  : <div className="es-sim-pedal-img-ph">🎛️</div>}
                <div className="es-sim-pedal-brand">{d.brand}</div>
                <div className="es-sim-pedal-model">{d.model}</div>
                <div className="es-sim-pedal-cat">{catLabel.get(d.categoryId)}</div>
              </div>
              {i < ordered.length - 1 && (
                <div className={`es-sim-audio-arrow${arrowActive ? ' active' : ''}`}>▶</div>
              )}
            </span>
          );
        })}

        {ordered.length > 0 && (
          <div className={`es-sim-audio-arrow${
            !bypassed.has(ordered[ordered.length - 1]!.id) ? ' active' : ''
          }`}>▶</div>
        )}
        <div className="es-sim-audio-ep">Guitar OUT</div>
      </div>
    </section>
  );
}

