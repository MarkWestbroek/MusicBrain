/// <reference types="vite/client" />
// SampleImportModal — één lange opname ontleden tot een keymap.
//
// Werkwijze: neem één take op (C1 zacht/midden/hard, C2 idem, …, één gain,
// stiltes ertussen), gooi hem hierin, en de importer splitst de aanslagen,
// meet toonhoogte, luidheid en uitsterving, verdeelt de velocity-lagen en
// zoekt desgewenst loop-punten. Corrigeer wat ernaast zit in de tabel en
// stuur het naar de simulator, of schrijf een `.mmbk` voor de SD-kaart.
//
// De analyse zelf staat in sampleAnalysis.ts (los te testen onder node);
// dit bestand is de UI eromheen.
import { useEffect, useRef, useState } from 'react';
import {
  segmentRecording, detectPitch, measureDecay, findLoop, bakeCrossfade,
  assignVelocityLayers, spreadKeyRanges, enforceAscending, toMono,
  type Segment, type PitchResult,
} from './sampleAnalysis';
import { WasmModule, type WasmZone } from './runtime';
import { buildBank, bankSummary, type BankSlot } from './sampleBank';

const TYPE_ID = 'tp_mmb_sampler';
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number): string => m < 0 ? '—' : `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

interface Row {
  segment: Segment;
  pitch: PitchResult;
  midi: number;          // gecorrigeerd
  layer: number;
  lowVel: number; highVel: number;
  lowKey: number; highKey: number;
  decay: number;         // s tot −60 dB (trage fase)
  loop: { start: number; end: number; quality: number } | null;
  loopMode: number;      // 0 geen · 3 tot note-off
  include: boolean;
}

export function SampleImportModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [audio, setAudio] = useState<{ data: Float32Array; mono: Float32Array; ch: number; rate: number; name: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [layers, setLayers] = useState(3);
  const [minGap, setMinGap] = useState(0.35);
  const [ascending, setAscending] = useState(true);
  const [busy, setBusy] = useState('');
  const [bankName, setBankName] = useState('bank');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (open) drawWave(); });

  if (!open) return null;

  // ── laden & analyseren ──────────────────────────────────────────────
  async function loadFile(file: File): Promise<void> {
    setBusy(`decoderen: ${file.name}…`);
    setRows([]);
    try {
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const b = await ctx.decodeAudioData(await file.arrayBuffer());
      const ch = Math.min(b.numberOfChannels, 4);
      const inter = new Float32Array(b.length * ch);
      for (let c = 0; c < ch; c++) {
        const src = b.getChannelData(c);
        for (let i = 0; i < b.length; i++) inter[i * ch + c] = src[i] ?? 0;
      }
      const mono = toMono(inter, ch);
      setAudio({ data: inter, mono, ch, rate: b.sampleRate, name: file.name });
      setBankName(file.name.replace(/\.[^.]+$/, '').slice(0, 31) || 'bank');
      setBusy(`${(b.length / b.sampleRate).toFixed(1)} s · ${ch === 1 ? 'mono' : ch === 2 ? 'stereo' : ch + ' kanalen'} · ${b.sampleRate} Hz — klik Analyseren`);
    } catch (err) {
      setBusy(`mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function analyse(): void {
    if (!audio) return;
    setBusy('segmenteren…');
    const segs = segmentRecording(audio.mono, audio.rate, { minGap, minLength: 0.15 });
    if (!segs.length) { setBusy('geen aanslagen gevonden — verlaag de stilte-drempel of check de opname'); return; }

    const items = segs.map((s) => ({ segment: s, pitch: detectPitch(audio.mono, audio.rate, s.start, s.end) }));
    let midis = items.map((it) => it.pitch.midi);
    let fixed = 0;
    if (ascending) {
      const r = enforceAscending(items.map((it) => it.pitch), layers);
      midis = r.midi; fixed = r.changed;
    }
    const withMidi = items.map((it, i) => ({ segment: it.segment, pitch: { ...it.pitch, midi: midis[i]! } }));
    const layered = assignVelocityLayers(withMidi, layers);
    const ranges = spreadKeyRanges(layered.map((l) => l.pitch.midi));

    const next: Row[] = layered.map((l) => {
      const dec = measureDecay(audio.mono, audio.rate, l.segment.start, l.segment.end);
      const r = ranges.get(l.pitch.midi) ?? { low: 0, high: 127 };
      return {
        segment: l.segment, pitch: l.pitch, midi: l.pitch.midi, layer: l.layer,
        lowVel: l.lowVel, highVel: l.highVel, lowKey: r.low, highKey: r.high,
        decay: dec.slowT60, loop: null, loopMode: 0, include: true,
      };
    });
    setRows(next);
    setBusy(`${next.length} aanslagen · ${new Set(next.map((r) => r.midi)).size} noten` +
      (fixed ? ` · ${fixed} octaafcorrecties` : ''));
  }

  function searchLoops(): void {
    if (!audio) return;
    setBusy('loops zoeken…');
    setRows((prev) => prev.map((r) => {
      const dec = measureDecay(audio.mono, audio.rate, r.segment.start, r.segment.end);
      const lp = findLoop(audio.mono, audio.rate, dec.stableFrom, r.segment.end, r.pitch.hz);
      return lp ? { ...r, loop: lp, loopMode: 3 } : r;   // 3 = LOOP_SUSTAIN
    }));
    setBusy('loops gezocht — kijk naar de kwaliteit (boven 0,90 klinkt schoon)');
  }

  // ── slots + zones bouwen ────────────────────────────────────────────
  function build(): { slots: BankSlot[]; zones: WasmZone[] } {
    if (!audio) return { slots: [], zones: [] };
    const slots: BankSlot[] = [];
    const zones: WasmZone[] = [];
    rows.filter((r) => r.include).forEach((r, i) => {
      const frames = r.segment.end - r.segment.start;
      const f32 = audio.data.subarray(r.segment.start * audio.ch, r.segment.end * audio.ch);
      const cut = Float32Array.from(f32);
      // Loop-naad wegvloeien in de sampledata zelf (frames zijn segment-relatief).
      const ls = r.loop ? r.loop.start - r.segment.start : 0;
      const le = r.loop ? r.loop.end - r.segment.start : 0;
      if (r.loop && r.loopMode !== 0) {
        bakeCrossfade(cut, audio.ch, ls, le, Math.round(0.01 * audio.rate));
      }
      const pcm = new Int16Array(cut.length);
      for (let k = 0; k < cut.length; k++) {
        pcm[k] = Math.max(-32768, Math.min(32767, Math.round((cut[k] ?? 0) * 32767)));
      }
      slots.push({ data: pcm, channels: audio.ch, rate: audio.rate, name: `${noteName(r.midi)} L${r.layer}` });
      zones.push({
        slot: i,
        lowKey: r.lowKey, highKey: r.highKey,
        lowVel: r.lowVel, highVel: r.highVel,
        root: r.midi, tuneCents: -r.pitch.cents,   // stem de detectie-afwijking weg
        gain: 1, pan: 0,
        loopMode: r.loop ? r.loopMode : 0,
        loopStart: r.loop ? ls : 0, loopEnd: r.loop ? le : 0,
        // Sample draagt zijn eigen uitsterving, tenzij we loopen.
        decay: r.loop && r.loopMode !== 0 ? r.decay : 0,
        release: 0.12,
      });
      void frames;
    });
    return { slots, zones };
  }

  function toSimulator(): void {
    const { slots, zones } = build();
    if (!slots.length) { setBusy('niets te sturen'); return; }
    slots.forEach((s, i) => WasmModule.setBlob(TYPE_ID, i, s.data, s.rate, s.name ?? '', s.channels));
    WasmModule.setZones(TYPE_ID, zones);
    setBusy(`naar de simulator: ${bankSummary(slots, zones)}`);
  }

  function downloadBank(): void {
    const { slots, zones } = build();
    if (!slots.length) { setBusy('niets te schrijven'); return; }
    const buf = buildBank(bankName, slots, zones);
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${bankName}.mmbk`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy(`${bankName}.mmbk geschreven — ${bankSummary(slots, zones)} · kopieer naar /mmb/banks op de SD`);
  }

  // ── golfvorm ────────────────────────────────────────────────────────
  function drawWave(): void {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { width: W, height: H } = cv;
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H);
    if (!audio) return;
    const n = audio.mono.length;
    ctx.strokeStyle = '#38bdf8'; ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const a = Math.floor((x / W) * n), b = Math.floor(((x + 1) / W) * n);
      let lo = 0, hi = 0;
      for (let i = a; i < b; i++) { const v = audio.mono[i] ?? 0; if (v < lo) lo = v; if (v > hi) hi = v; }
      ctx.moveTo(x + 0.5, H / 2 - hi * H * 0.47);
      ctx.lineTo(x + 0.5, H / 2 - lo * H * 0.47);
    }
    ctx.stroke();
    // Segmentgrenzen + noot.
    ctx.font = '10px system-ui';
    for (const r of rows) {
      const x0 = (r.segment.start / n) * W, x1 = (r.segment.end / n) * W;
      ctx.fillStyle = r.include ? 'rgba(245,166,35,0.18)' : 'rgba(120,120,120,0.12)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), H);
      ctx.fillStyle = '#f5a623';
      ctx.fillRect(x0, 0, 1, H);
      ctx.fillText(`${noteName(r.midi)}·${r.layer}`, x0 + 2, 11);
      if (r.loop && r.loopMode !== 0) {
        ctx.fillStyle = 'rgba(52,211,153,0.85)';
        ctx.fillRect((r.loop.start / n) * W, H - 6, Math.max(1, ((r.loop.end - r.loop.start) / n) * W), 4);
      }
    }
  }

  function patch(i: number, p: Partial<Row>): void {
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...p } : r)));
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 980, maxWidth: '96vw',
    maxHeight: '92vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const th: React.CSSProperties = { textAlign: 'left', color: '#64748b', fontWeight: 500, padding: '2px 6px' };
  const td: React.CSSProperties = { padding: '1px 6px', borderTop: '1px solid #e2e8f0' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎹 Multisample importeren</h3>
          <span style={{ color: '#64748b' }}>één lange take → keymap</span>
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <p style={{ color: '#475569', margin: '8px 0 12px' }}>
          Neem op met <strong>één gain-instelling</strong>, oplopend, {layers} aanslagen per noot,
          en laat elke noot helemaal uitklinken. De importer splitst op stilte, meet toonhoogte
          (YIN), luidheid en uitsterving, en verdeelt de velocity-lagen.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <input type="file" accept="audio/*,.wav,.aif,.aiff,.flac,.mp3"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.currentTarget.value = ''; }} />
          <label>Lagen/noot <input type="number" min={1} max={8} value={layers} style={{ width: 48 }}
            onChange={(e) => setLayers(Math.max(1, Math.min(8, Number(e.target.value))))} /></label>
          <label>Min. stilte <input type="number" min={0.05} max={3} step={0.05} value={minGap} style={{ width: 58 }}
            onChange={(e) => setMinGap(Number(e.target.value))} /> s</label>
          <label><input type="checkbox" checked={ascending} onChange={(e) => setAscending(e.target.checked)} /> oplopend gespeeld</label>
          <button onClick={analyse} disabled={!audio} className="primary">Analyseren</button>
          <button onClick={searchLoops} disabled={!rows.length}>Loops zoeken</button>
        </div>

        <canvas ref={canvasRef} width={1880} height={200}
          style={{ width: '100%', height: 130, borderRadius: 4, background: '#0b1220' }} />
        <div style={{ minHeight: 18, margin: '8px 0', color: busy.startsWith('mislukt') ? '#b91c1c' : '#334155' }}>{busy}</div>

        {rows.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>
                <th style={th}>✓</th><th style={th}>t</th><th style={th}>Hz</th><th style={th}>Noot</th>
                <th style={th}>ct</th><th style={th}>conf</th><th style={th}>Laag</th><th style={th}>Vel</th>
                <th style={th}>Keys</th><th style={th}>T60</th><th style={th}>Loop</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.include ? 1 : 0.45 }}>
                    <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} /></td>
                    <td style={td}>{(r.segment.start / (audio?.rate ?? 44100)).toFixed(2)}</td>
                    <td style={td}>{r.pitch.hz.toFixed(1)}</td>
                    <td style={td}>
                      <input type="number" value={r.midi} style={{ width: 52 }}
                        onChange={(e) => patch(i, { midi: Number(e.target.value) })} />
                      <span style={{ color: '#64748b', marginLeft: 4 }}>{noteName(r.midi)}</span>
                    </td>
                    <td style={td}>{r.pitch.cents}</td>
                    <td style={{ ...td, color: r.pitch.confidence < 0.5 ? '#b91c1c' : '#64748b' }}>{r.pitch.confidence.toFixed(2)}</td>
                    <td style={td}>{r.layer}</td>
                    <td style={td}>
                      <input type="number" value={r.lowVel} style={{ width: 44 }} onChange={(e) => patch(i, { lowVel: Number(e.target.value) })} />–
                      <input type="number" value={r.highVel} style={{ width: 44 }} onChange={(e) => patch(i, { highVel: Number(e.target.value) })} />
                    </td>
                    <td style={td}>
                      <input type="number" value={r.lowKey} style={{ width: 44 }} onChange={(e) => patch(i, { lowKey: Number(e.target.value) })} />–
                      <input type="number" value={r.highKey} style={{ width: 44 }} onChange={(e) => patch(i, { highKey: Number(e.target.value) })} />
                    </td>
                    <td style={td}>{r.decay > 0 ? `${r.decay.toFixed(1)} s` : '—'}</td>
                    <td style={td}>
                      {r.loop
                        ? <label title="loop tot note-off, daarna de staart">
                            <input type="checkbox" checked={r.loopMode !== 0}
                              onChange={(e) => patch(i, { loopMode: e.target.checked ? 3 : 0 })} />
                            <span style={{ color: r.loop.quality > 0.9 ? '#15803d' : '#b45309' }}> {r.loop.quality.toFixed(2)}</span>
                          </label>
                        : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={toSimulator} className="primary">→ Simulator</button>
              <label>Banknaam <input value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: 140 }} /></label>
              <button onClick={downloadBank}>⤓ .mmbk opslaan</button>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                Kopieer het bestand naar <code>/mmb/banks</code> op de SD-kaart van de Teensy.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
