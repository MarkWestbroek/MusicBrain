import { useEffect, useRef, useState } from 'react';
import { TraceBuffer } from './TraceBuffer';

// Stable colour per channel so visual identity persists across redraws.
const palette = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#a855f7',
                 '#06b6d4', '#84cc16', '#ec4899'];
const colorFor = (ch: string, channels: string[]): string =>
  palette[channels.indexOf(ch) % palette.length] ?? '#888';

interface Props { url?: string }

export function ScopePanel({ url = 'ws://localhost:8765' }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef    = useRef<TraceBuffer>(new TraceBuffer(2000));
  const [status, setStatus]   = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [tick, setTick]       = useState(0);  // forces redraws on new data
  const [bridgeUrl, setUrl]   = useState(url);

  // WebSocket lifecycle
  useEffect(() => {
    setStatus('connecting');
    let ws: WebSocket;
    let stopped = false;
    const connect = (): void => {
      if (stopped) return;
      ws = new WebSocket(bridgeUrl);
      ws.onopen    = () => setStatus('open');
      ws.onerror   = () => setStatus('error');
      ws.onclose   = () => { setStatus('closed'); if (!stopped) setTimeout(connect, 1500); };
      ws.onmessage = (m) => { bufRef.current.ingest(String(m.data)); };
    };
    connect();
    return () => { stopped = true; ws?.close(); };
  }, [bridgeUrl]);

  // Animation frame loop — re-paint at the browser's refresh rate.
  useEffect(() => {
    let raf = 0;
    const loop = (): void => { setTick((t) => t + 1); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const buf = bufRef.current;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    const channels = buf.channels();
    const { tMin, tMax, vMin, vMax } = buf.bounds();
    const padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const xOf = (t: number): number => padL + ((t - tMin) / (tMax - tMin)) * plotW;
    const yOf = (v: number): number => padT + (1 - (v - vMin) / (vMax - vMin)) * plotH;

    // Grid (5 horizontal lines).
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 1;
    ctx.fillStyle   = '#94a3b8';
    ctx.font        = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = vMin + ((vMax - vMin) * i) / 4;
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2) + 'V', padL - 6, y);
    }
    // X axis ticks
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const t = tMin + ((tMax - tMin) * i) / 4;
      const x = xOf(t);
      ctx.fillText((t / 1000).toFixed(1) + ' ms', x, h - padB + 6);
    }

    // Series — step lines (CV holds last value until next sample).
    for (const ch of channels) {
      const pts = buf.pointsFor(ch);
      if (pts.length === 0) continue;
      ctx.strokeStyle = colorFor(ch, channels);
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      let lastY = yOf(pts[0]!.volts);
      ctx.moveTo(xOf(pts[0]!.t_us), lastY);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]!;
        const x = xOf(p.t_us);
        const y = yOf(p.volts);
        ctx.lineTo(x, lastY);  // horizontal hold
        ctx.lineTo(x, y);      // step down/up
        lastY = y;
      }
      ctx.stroke();
    }
  }, [tick]);

  const channels = bufRef.current.channels();

  return (
    <section style={{ padding: 12, color: '#e2e8f0', background: '#020617' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <strong>Scope</strong>
        <span style={{ fontSize: 12, color: status === 'open' ? '#10b981' : '#ef4444' }}>
          {status} @ {bridgeUrl}
        </span>
        <input
          style={{ marginLeft: 'auto', width: 260, fontFamily: 'ui-monospace', fontSize: 12 }}
          value={bridgeUrl}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button onClick={() => { bufRef.current.clear(); setTick((t) => t + 1); }}>clear</button>
      </header>
      <canvas
        ref={canvasRef}
        width={900}
        height={360}
        style={{ width: '100%', maxWidth: 900, border: '1px solid #1e293b', display: 'block' }}
      />
      <footer style={{ marginTop: 8, fontSize: 12 }}>
        {channels.length === 0
          ? <em>waiting for trace events…</em>
          : channels.map((ch) => (
              <span key={ch} style={{ marginRight: 12, color: colorFor(ch, channels) }}>
                ■ {ch} ({bufRef.current.pointsFor(ch).length} pts)
              </span>
            ))}
      </footer>
    </section>
  );
}
