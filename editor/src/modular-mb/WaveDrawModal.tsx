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
import { sendWaveform, sendControlPoke, isConnected } from './teensyLink';
import { WasmModule } from './runtime';

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

/** Minimale WAV-lezer: PCM 8/16/24/32-bit of 32-bit float, n kanalen → mono. */
function decodeWav(buf: ArrayBuffer): Float32Array | null {
  const dv = new DataView(buf);
  if (buf.byteLength < 44 || dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
  let p = 12, fmt = 0, ch = 1, bits = 16, data: [number, number] | null = null;
  while (p + 8 <= buf.byteLength) {
    const id = dv.getUint32(p, false), len = dv.getUint32(p + 4, true);
    if (id === 0x666d7420) { fmt = dv.getUint16(p + 8, true); ch = dv.getUint16(p + 10, true); bits = dv.getUint16(p + 22, true); }
    if (id === 0x64617461) { data = [p + 8, Math.min(len, buf.byteLength - p - 8)]; break; }
    p += 8 + len + (len & 1);
  }
  if (!data || (fmt !== 1 && fmt !== 3 && fmt !== 0xfffe)) return null;
  const bytes = bits / 8, frames = Math.floor(data[1] / (bytes * ch));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) {
      const o = data[0] + (i * ch + c) * bytes;
      if (fmt === 3 || (fmt === 0xfffe && bits === 32)) s += dv.getFloat32(o, true);
      else if (bits === 8)  s += (dv.getUint8(o) - 128) / 128;
      else if (bits === 16) s += dv.getInt16(o, true) / 32768;
      else if (bits === 24) s += ((dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16)) / 8388608);
      else if (bits === 32) s += dv.getInt32(o, true) / 2147483648;
    }
    out[i] = s / ch;
  }
  return out;
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

  // Doelen: alleen geplaatste modules (de interne prototypes uit seedInternals
  // zitten in geen enkele patch — daar ging de tekening vroeger standaard
  // heen, en dan hoorde je niets veranderen), de modules van de actieve
  // patch eerst.
  const activePatch = project.patches.find((p) => p.id === project.activePatchId);
  const targets = useMemo(() => {
    const inPatch = new Set<string>();
    for (const c of activePatch?.connections ?? []) { inPatch.add(c.from.moduleId); inPatch.add(c.to.moduleId); }
    return project.modules
      .filter((m) => TARGET_TYPES.includes(m.typeId) && !m.internal)
      .sort((a, b) => Number(inPatch.has(b.id)) - Number(inPatch.has(a.id)));
  }, [project.modules, activePatch]);
  const target = targets.find((m) => m.id === targetId) ?? targets[0];
  // Poly: de tekening naar alle stemmen van de groep, anders klinkt alleen
  // de master anders.
  const targetIds = useMemo(() => {
    if (!target) return [] as string[];
    for (const r of project.racks)
      for (const g of r.polyGroups ?? [])
        if (g.members.some((m) => m.kind === 'module' && m.moduleId === target.id))
          return g.members.flatMap((m) => (m.kind === 'module' ? [m.moduleId] : []));
    return [target.id];
  }, [project.racks, target]);
  // Morph-WT: het USER-frame dat de wslot-knop van de module aanwijst.
  const wslot = Math.max(0, Math.min(7, Math.round(Number(
    (target && activePatch?.controlState[target.id]?.wslot) ?? 0))));

  // ── live push (debounced) ────────────────────────────────────────────
  function schedulePush(): void {
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = null;
      if (!target) return;
      const data = Array.from(waveRef.current, (v) => Math.round(
        Math.max(-1, Math.min(1, v)) * 32767));
      // De simulator krijgt de tekening ook, met of zonder Teensy: Draw-VCO
      // op slot 0, Morph-WT in USER-frame `wslot` (slot = frame).
      const slot = target.typeId === 'tp_mmb_draw_vco' ? 0 : wslot;
      for (const id of targetIds) WasmModule.setInstanceBlob(id, slot, Int16Array.from(data));
      if (!isConnected()) return;
      for (const id of targetIds) void sendWaveform(id, data);
      setPushed(`→ ${target.name}${targetIds.length > 1 ? ` ×${targetIds.length}` : ''}`
        + `${target.typeId === 'tp_mmb_morph_wt' ? ` USER-frame ${wslot}` : ''} (${new Date().toLocaleTimeString()})`);
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

  // ── wavetable-bestand (.wav) ─────────────────────────────────────────
  // Serum-stijl: één mono .wav met frames van 2048 samples achter elkaar
  // (of 256, of één cyclus). We nemen acht frames gelijk verdeeld over het
  // bestand, herbemonsteren elk naar 256 punten en zetten ze in USER-frame
  // 0..7 van de Morph-WT (sim + Teensy, per frame via `wslot`). Een Draw-VCO
  // krijgt alleen het eerste frame.
  const fileRef = useRef<HTMLInputElement>(null);
  async function importWav(file: File): Promise<void> {
    if (!target) return;
    const mono = decodeWav(await file.arrayBuffer());
    if (!mono || mono.length < 16) { setPushed('geen leesbare .wav (PCM 16/24/32-bit of float)'); return; }
    const frameLen = mono.length % 2048 === 0 ? 2048 : mono.length % 256 === 0 ? 256 : mono.length;
    const nFrames = Math.max(1, Math.floor(mono.length / frameLen));
    const frames: Int16Array[] = [];
    const want = target.typeId === 'tp_mmb_morph_wt' ? 8 : 1;
    for (let k = 0; k < want; k++) {
      const fi = nFrames === 1 ? 0 : Math.round((k / (want - 1 || 1)) * (nFrames - 1));
      const src = mono.subarray(fi * frameLen, (fi + 1) * frameLen);
      const out = new Float32Array(N);
      let mx = 1e-6;
      for (let i = 0; i < N; i++) {
        const p = (i / N) * frameLen, i0 = Math.floor(p), f = p - i0;
        out[i] = src[i0 % frameLen]! * (1 - f) + src[(i0 + 1) % frameLen]! * f;
        mx = Math.max(mx, Math.abs(out[i]!));
      }
      frames.push(Int16Array.from(out, (v) => Math.round((v / mx) * 32767)));
    }
    // Laatste frame op het canvas, zodat je ziet wat er in ging.
    waveRef.current.set(Float32Array.from(frames[frames.length - 1]!, (v) => v / 32767));
    forceRender((n) => n + 1); redraw();
    for (const id of targetIds) frames.forEach((fr, k) => WasmModule.setInstanceBlob(id, k, fr));
    if (isConnected()) {
      for (const id of targetIds) {
        for (let k = 0; k < frames.length; k++) {
          if (frames.length > 1) await sendControlPoke(id, 'wslot', k);
          await sendWaveform(id, Array.from(frames[k]!));
        }
        if (frames.length > 1) await sendControlPoke(id, 'wslot', wslot);   // knop terug
      }
    }
    setPushed(`📂 ${file.name}: ${nFrames} frame${nFrames === 1 ? '' : 's'} van ${frameLen} → ${frames.length} USER-frame${frames.length === 1 ? '' : 's'} → ${target.name}${targetIds.length > 1 ? ` ×${targetIds.length}` : ''}`);
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
          <input ref={fileRef} type="file" accept=".wav,audio/wav" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importWav(f); e.target.value = ''; }} />
          <button style={btn} disabled={!target}
            title="Wavetable-bestand (.wav, Serum-stijl: frames van 2048 samples achter elkaar, of één cyclus). Morph-WT: acht frames gelijk verdeeld over het bestand naar USER-frame 0..7 — zet Bank op Usr en draai Morph. Draw-VCO: het eerste frame."
            onClick={() => fileRef.current?.click()}>📂 .wav wavetable</button>
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
