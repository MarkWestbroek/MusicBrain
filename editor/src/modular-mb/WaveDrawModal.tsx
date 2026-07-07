// WaveDrawModal — teken een single-cycle golfvorm en push die live naar een
// Draw-VCO of Morph-WT (USER-bank) op de Teensy (ED-P-3, review-punt 7).
//
// Zelfstandige modal: eigen canvas-state, alleen `sendWaveform`/`isConnected`
// uit teensyLink (read-only import — het bestand zelf blijft onaangeraakt) en
// de project-store om doelmodules te vinden. De firmware resamplet het
// 'wavetable'-frame zelf naar 256 punten (FW-LIVE-1), dus we sturen exact
// onze 256 samples in −32768..32767.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useModularProject } from './store';
import { sendWaveform, isConnected } from './teensyLink';

const N = 256;                     // samples per cycle (firmware-resolutie)
const TARGET_TYPES = ['tp_mmb_draw_vco', 'tp_mmb_morph_wt'];

type Shape = 'sine' | 'tri' | 'saw' | 'square';

function makeShape(shape: Shape): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    switch (shape) {
      case 'sine':   w[i] = Math.sin(2 * Math.PI * t); break;
      case 'tri':    w[i] = t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4; break;
      case 'saw':    w[i] = 2 * t - 1; break;
      case 'square': w[i] = t < 0.5 ? 1 : -1; break;
    }
  }
  return w;
}

export function WaveDrawModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const project = useModularProject();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<Float32Array>(makeShape('sine'));
  const lastIdxRef = useRef<number | null>(null);
  const pushTimer = useRef<number | null>(null);
  const [, forceRender] = useState(0);
  const [targetId, setTargetId] = useState('');
  const [pushed, setPushed] = useState<string>('');

  const targets = useMemo(
    () => project.modules.filter((m) => TARGET_TYPES.includes(m.typeId)),
    [project.modules]);
  const target = targets.find((m) => m.id === targetId) ?? targets[0];

  // ── live push (debounced) ────────────────────────────────────────────
  function schedulePush(): void {
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = null;
      if (!target || !isConnected()) return;
      const data = Array.from(waveRef.current, (v) => Math.round(
        Math.max(-1, Math.min(1, v)) * 32767));
      void sendWaveform(target.id, data);
      setPushed(`→ ${target.name} (${new Date().toLocaleTimeString()})`);
    }, 150);
  }

  // ── canvas render ────────────────────────────────────────────────────
  function redraw(): void {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = cv;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1f2937';
    ctx.beginPath();                       // nullijn + kwart-rasters
    for (const fx of [0.25, 0.5, 0.75]) {
      ctx.moveTo(W * fx, 0); ctx.lineTo(W * fx, H);
    }
    ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const w = waveRef.current;
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W;
      const y = (1 - (w[i]! + 1) / 2) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  useEffect(() => { if (open) redraw(); });

  if (!open) return null;

  // ── muis-tekenen (met interpolatie tussen events) ────────────────────
  function plot(e: React.PointerEvent<HTMLCanvasElement>): void {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const idx = Math.max(0, Math.min(N - 1,
      Math.round(((e.clientX - r.left) / r.width) * (N - 1))));
    const val = Math.max(-1, Math.min(1,
      1 - 2 * ((e.clientY - r.top) / r.height)));
    const w = waveRef.current;
    const last = lastIdxRef.current;
    if (last !== null && Math.abs(idx - last) > 1) {
      const from = Math.min(last, idx), to = Math.max(last, idx);
      const v0 = w[last]!, span = idx - last;
      for (let i = from; i <= to; i++)
        w[i] = v0 + (val - v0) * ((i - last) / span);
    } else {
      w[idx] = val;
    }
    lastIdxRef.current = idx;
    redraw();
    schedulePush();
  }

  function apply(fn: (w: Float32Array) => void): void {
    fn(waveRef.current);
    forceRender((n) => n + 1);
    redraw();
    schedulePush();
  }

  const btn: React.CSSProperties = {
    border: '1px solid #cbd2d9', borderRadius: 4, background: '#f8fafc',
    padding: '4px 10px', cursor: 'pointer', fontSize: 12,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={onClose}>
      <div style={{ background: '#ffffff', borderRadius: 8, padding: 16, minWidth: 560,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
           onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 15 }}>🖊 Golfvorm tekenen</strong>
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 12 }}>Doel:&nbsp;
            <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
              {targets.length === 0 && <option value="">— geen Draw-VCO/Morph-WT in project —</option>}
              {targets.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.typeId === 'tp_mmb_draw_vco' ? 'Draw-VCO' : 'Morph-WT'})</option>
              ))}
            </select>
          </label>
          <button style={btn} onClick={onClose}>✕</button>
        </div>

        <canvas ref={canvasRef} width={512} height={220}
          style={{ width: 512, height: 220, borderRadius: 6, cursor: 'crosshair',
                   touchAction: 'none', display: 'block' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId);
                                  lastIdxRef.current = null; plot(e); }}
          onPointerMove={(e) => { if (e.buttons & 1) plot(e); }}
          onPointerUp={() => { lastIdxRef.current = null; }} />

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['sine', 'tri', 'saw', 'square'] as Shape[]).map((s) => (
            <button key={s} style={btn}
              onClick={() => apply((w) => { w.set(makeShape(s)); })}>{s}</button>
          ))}
          <button style={btn} title="3-taps moving average (herhaalbaar)"
            onClick={() => apply((w) => {
              const c = Float32Array.from(w);
              for (let i = 0; i < N; i++)
                w[i] = (c[(i + N - 1) % N]! + c[i]! + c[(i + 1) % N]!) / 3;
            })}>glad</button>
          <button style={btn} title="Schaal naar vol bereik"
            onClick={() => apply((w) => {
              let mx = 0;
              for (const v of w) mx = Math.max(mx, Math.abs(v));
              if (mx > 0.001) for (let i = 0; i < N; i++) w[i] = w[i]! / mx;
            })}>normaliseer</button>
          <button style={btn} onClick={() => apply((w) => { for (let i = 0; i < N; i++) w[i] = -w[i]!; })}>inverteer</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: isConnected() ? '#059669' : '#9ca3af' }}>
            {isConnected() ? (pushed || 'verbonden — tekenen pusht live') : 'niet verbonden (🔌 Teensy)'}
          </span>
        </div>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
          Teken met de muis; elke wijziging wordt (debounced) naar de gekozen module gepusht
          als single-cycle van 256 samples. Bij een Morph-WT beland je in de USER-bank;
          bij een Draw-VCO vervangt het de actieve golf. Werkt ook door tijdens het spelen.
        </p>
      </div>
    </div>
  );
}
