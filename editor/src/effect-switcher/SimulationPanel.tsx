import { useEffect, useState } from 'react';
import { devicesInFlowOrder, nextPatch, prevPatch, setActivePatch } from './actions';
import { useProject } from './store';

interface LogEntry {
  t: number;
  text: string;
}

export function SimulationPanel(): JSX.Element {
  const project = useProject();
  const active  = project.patches.find((p) => p.id === project.activePatchId)
               ?? project.patches[0];
  const ordered  = devicesInFlowOrder(project);
  const bypassed = new Set(active?.bypassed ?? []);
  const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));

  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  function push(text: string): void {
    setLog((prev) => [...prev.slice(-29), { t: Date.now(), text }]);
  }

  function onUp(): void   { nextPatch(); push('FS▲ → next patch'); }
  function onDown(): void { prevPatch(); push('FS▼ → prev patch'); }
  function onPC(id: number): void {
    const name = project.patches.find((p) => p.id === id)?.name ?? '';
    setActivePatch(id);
    push(`PC ${id + 1} → "${name}"`);
  }

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

        {/* MIDI connector */}
        <div className="es-sim-connector">
          <div className="es-sim-cable" />
          <span className="es-sim-conn-badge">MIDI</span>
          <div className="es-sim-cable" />
          <span className="es-sim-conn-arrow">▶</span>
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

