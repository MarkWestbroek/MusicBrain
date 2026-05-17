// CV trace event as emitted by mb_simulator and forwarded by scope-bridge.
// One JSON object per line; see doc/Simulation.md for the full schema.
export type TraceEvent =
  | { t_us: number; kind: 'cv';   ch: string; code: number; volts: number }
  | { t_us: number; kind: 'gate'; ch: string; on: boolean }
  | { t_us: number; kind: 'spi';  op: number; bytes: number }
  | { t_us: number; kind: string; [k: string]: unknown };

export interface ScopePoint {
  t_us:  number;
  volts: number;
}

/**
 * Rolling per-channel buffer of CV samples. Bounded so memory stays flat
 * even on infinite streams; oldest samples are dropped.
 */
export class TraceBuffer {
  private series = new Map<string, ScopePoint[]>();
  constructor(private readonly maxPerChannel = 2000) {}

  ingest(line: string): void {
    let ev: TraceEvent;
    try { ev = JSON.parse(line) as TraceEvent; } catch { return; }
    if (ev.kind !== 'cv') return;
    const ch = (ev as { ch: string }).ch;
    const arr = this.series.get(ch) ?? [];
    arr.push({ t_us: ev.t_us, volts: (ev as { volts: number }).volts });
    if (arr.length > this.maxPerChannel) arr.shift();
    this.series.set(ch, arr);
  }

  channels(): string[]   { return Array.from(this.series.keys()).sort(); }
  pointsFor(ch: string): ScopePoint[] { return this.series.get(ch) ?? []; }
  clear(): void          { this.series.clear(); }

  bounds(): { tMin: number; tMax: number; vMin: number; vMax: number } {
    let tMin = +Infinity, tMax = -Infinity, vMin = +Infinity, vMax = -Infinity;
    for (const arr of this.series.values()) {
      for (const p of arr) {
        if (p.t_us  < tMin) tMin = p.t_us;
        if (p.t_us  > tMax) tMax = p.t_us;
        if (p.volts < vMin) vMin = p.volts;
        if (p.volts > vMax) vMax = p.volts;
      }
    }
    if (!isFinite(tMin)) { tMin = 0; tMax = 1; }
    if (!isFinite(vMin)) { vMin = -5; vMax = 5; }
    if (vMax - vMin < 0.1) { vMin -= 0.5; vMax += 0.5; }
    if (tMax - tMin < 1)   { tMax = tMin + 1; }
    return { tMin, tMax, vMin, vMax };
  }
}
