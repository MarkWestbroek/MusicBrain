import { useEffect, useState } from 'react';
import { devicesInFlowOrder, nextPatch, prevPatch, setActivePatch } from './actions';
import { useProject } from './store';

interface LogEntry {
  t: number;
  text: string;
}

export function SimulationPanel(): JSX.Element {
  const project = useProject();
  const active   = project.patches.find((p) => p.id === project.activePatchId)
                ?? project.patches[0];
  const ordered  = devicesInFlowOrder(project);
  const bypassed = new Set(active?.bypassed ?? []);
  const catLabel = new Map(project.categories.map((c) => [c.id, c.label] as const));

  const [log, setLog] = useState<LogEntry[]>([]);
  const [compact, setCompact] = useState(true);

  function push(text: string): void {
    setLog((prev) => [...prev.slice(-19), { t: Date.now(), text }]);
  }

  function onUp(): void   { prevPatch(); push('FS▲ → prev'); }
  function onDown(): void { nextPatch(); push('FS▼ → next'); }
  function onPC(id: number): void { setActivePatch(id); push(`PC ${id}`); }

  // Reset log when project resets
  useEffect(() => {
    if (project.patches.length === 0) setLog([]);
  }, [project.patches.length]);

  const visibleEffects = compact ? ordered.filter((d) => !bypassed.has(d.id)) : ordered;

  return (
    <section>
      <div className="es-toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />
          Compact: alleen actieve effecten tonen
        </label>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          (Stuur ook via PC&nbsp;0..{project.patches.length - 1})
        </span>
      </div>

      <div className="es-sim">
        {/* ─── Input device (footswitch) ─── */}
        <div className="es-sim-col">
          <h3>Input</h3>
          <div style={{ textAlign: 'center' }}>
            <div>
              <button className="es-fs-button" onClick={onUp} title="Vorige patch">▲</button>
            </div>
            <div>
              <button className="es-fs-button" onClick={onDown} title="Volgende patch">▼</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              footswitches
            </div>
            <div style={{ marginTop: 12 }}>
              <select
                value={active?.id ?? 0}
                onChange={(e) => onPC(parseInt(e.target.value, 10))}
                style={{ width: '100%', fontSize: 12, padding: 4 }}
              >
                {project.patches.map((p) => (
                  <option key={p.id} value={p.id}>PC {p.id} — {p.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                MIDI ProgramChange
              </div>
            </div>
          </div>
        </div>

        {/* ─── Brain ─── */}
        <div className="es-sim-col">
          <h3>Brain</h3>
          <div className="es-brain">
            <div><span className="es-brain-led" /> active</div>
            <div style={{ marginTop: 6, fontSize: 14 }}>
              {active ? `PC ${active.id}` : '—'}
            </div>
            <div style={{ color: '#a5f3fc', marginBottom: 8 }}>{active?.name}</div>
            <div style={{ borderTop: '1px solid #334155', paddingTop: 6, color: '#94a3b8', fontSize: 11 }}>
              event log
            </div>
            <div style={{ maxHeight: 90, overflowY: 'auto', marginTop: 4 }}>
              {log.length === 0 && <div style={{ color: '#475569' }}>—</div>}
              {[...log].reverse().map((e, i) => (
                <div key={e.t + '_' + i}>
                  {new Date(e.t).toLocaleTimeString()} {e.text}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            (toekomst: MIDI-out per patch tonen)
          </div>
        </div>

        {/* ─── Output (effects) ─── */}
        <div className="es-sim-col">
          <h3>Output — effects</h3>
          {visibleEffects.length === 0 && (
            <div className="es-empty" style={{ padding: 12 }}>
              {ordered.length === 0
                ? 'Geen apparaten gedefinieerd.'
                : 'Alle effecten zijn bypassed (clean).'}
            </div>
          )}
          <div className="es-sim-compact">
            {visibleEffects.map((d, i) => (
              <span key={d.id} style={{ display: 'contents' }}>
                <div
                  className="es-sim-pedal"
                  style={{
                    opacity: bypassed.has(d.id) ? 0.35 : 1,
                    filter:  bypassed.has(d.id) ? 'grayscale(0.7)' : 'none',
                  }}
                  title={`${d.brand} ${d.model} — relais ${d.relayIndex >= 0 ? d.relayIndex + 1 : '?'}`}
                >
                  <div>{catLabel.get(d.categoryId)}</div>
                  <div style={{ fontWeight: 400, fontSize: 11, marginTop: 2 }}>
                    {d.brand} {d.model}
                  </div>
                </div>
                {i < visibleEffects.length - 1 && <span style={{ fontSize: 18, color: '#16a34a' }}>▶</span>}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#4b5563' }}>
            Relais:&nbsp;
            <code>{relayBitView(active?.bypassed ?? [], project.devices, project.relayCount)}</code>
          </div>
        </div>
      </div>
    </section>
  );
}

function relayBitView(
  bypassed: string[],
  devices: { id: string; relayIndex: number }[],
  relayCount: number,
): string {
  const bp = new Set(bypassed);
  const bits: string[] = [];
  for (let i = 0; i < relayCount; i += 1) {
    const dev = devices.find((d) => d.relayIndex === i);
    if (!dev) { bits.push('.'); continue; }
    bits.push(bp.has(dev.id) ? '0' : '1');
  }
  return bits.join('');
}
