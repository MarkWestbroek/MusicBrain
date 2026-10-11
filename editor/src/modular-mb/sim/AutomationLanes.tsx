// De knopbewegingen als lijnen (ED-SM-10 stap 3): onder een spoor in
// ≣ Sporen (OverdubPanel) en onder de pianorol van de MIDI-speler.

import { useEffect, useState } from 'react';

import type { AutomationLane } from '../automation';
import { automationLanes } from '../automation';
import type { MidiFileSource } from './midiFilePlayer';

/** Eén lijn: de stand blijft staan tot het volgende punt. */
export function LaneSvg({ lane, totalMs, pos, loop, height = 14 }: {
  lane: AutomationLane; totalMs: number; pos: number | null; loop: { start: number; end: number } | null; height?: number;
}): JSX.Element {
  const W = 1000, H = height;
  const x = (t: number): number => (totalMs > 0 ? Math.min(W, (t / totalMs) * W) : 0);
  const y = (v: number): number => H - 1 - v * (H - 2);
  let d = '';
  lane.points.forEach((p, i) => {
    d += i === 0 ? `M0 ${y(p.y).toFixed(1)} L${x(p.t).toFixed(1)} ${y(p.y).toFixed(1)}` : ` L${x(p.t).toFixed(1)} ${y(lane.points[i - 1]!.y).toFixed(1)} L${x(p.t).toFixed(1)} ${y(p.y).toFixed(1)}`;
  });
  const last = lane.points.at(-1);
  if (last) d += ` L${W} ${y(last.y).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ flex: '1 1 auto', minWidth: 0, width: '100%', height: H, display: 'block', background: '#eef2f7', borderRadius: 2 }} aria-hidden>
      {loop && <rect x={x(loop.start)} y={0} width={Math.max(1, x(loop.end) - x(loop.start))} height={H} fill="rgba(251,191,36,0.3)" />}
      <path d={d} fill="none" stroke="#7c3aed" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {pos !== null && <line x1={x(pos)} x2={x(pos)} y1={0} y2={H} stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Onder de pianorol: per bewogen knop een lijn op dezelfde tijdas, met de
 *  afspeelkop en de lus. Niets als het bestand geen knopbewegingen heeft. */
export function PlayerLanes({ source }: { source: MidiFileSource }): JSX.Element | null {
  const [, setTick] = useState(0);
  useEffect(() => source.onState(() => setTick((x) => x + 1)), [source]);
  const st = source.state();
  // De afspeelkop loopt mee zolang hij speelt.
  useEffect(() => {
    if (!st.playing) return undefined;
    let raf = 0;
    const tick = (): void => { setTick((x) => x + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [st.playing]);
  const file = source.automationFile();
  if (!file || st.durationMs <= 0) return null;
  const lanes = automationLanes(file);
  if (lanes.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }} aria-label="Knopbewegingen">
      {lanes.map((l) => (
        <div key={l.key} style={{ position: 'relative' }}>
          <LaneSvg lane={l} totalMs={st.durationMs} pos={st.playing || st.posMs > 0 ? st.posMs : null} loop={st.region} height={18} />
          <span style={{ position: 'absolute', left: 4, top: 1, fontSize: 10, color: '#6d28d9', pointerEvents: 'none' }}>🎛 {l.label}</span>
        </div>
      ))}
    </div>
  );
}
