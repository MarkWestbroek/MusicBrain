// SampleModal — laad een audiobestand in een slot van de samplebank (16
// slots, gedeeld door alle tp_mmb_sampler-instanties): decodeert in de
// browser naar mono int16 op 44,1 kHz, zet 'm in de wasm-sampler van de
// simulator en stuurt 'm — als de Teensy verbonden is — in chunks over de
// serial-link naar PSRAM + SD (frame 'sample', zie TeensyLink.h).
import { useEffect, useRef, useState } from 'react';
import { WasmModule } from './runtime';
import { sendSample, isConnected } from './teensyLink';

const TYPE_ID = 'tp_mmb_sampler';
const SLOTS = 16;
const MAX_SECONDS = 20;
const RATE = 44100;

/** Decodeer een bestand naar mono int16 op 44,1 kHz (OfflineAudioContext resamplet). */
async function decodeToInt16(file: File): Promise<{ data: Int16Array; seconds: number }> {
  const buf = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, RATE);
  const audio = await ctx.decodeAudioData(buf);
  const n = Math.min(audio.length, MAX_SECONDS * RATE);
  const mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] = (mono[i] ?? 0) + (ch[i] ?? 0) / audio.numberOfChannels;
  }
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round((mono[i] ?? 0) * 32767)));
  return { data: out, seconds: n / RATE };
}

export function SampleModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState<string>('');
  const [, bump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const list = WasmModule.blobList(TYPE_ID);

  async function load(file: File): Promise<void> {
    try {
      setBusy(`decoderen: ${file.name}…`);
      const { data, seconds } = await decodeToInt16(file);
      WasmModule.setBlob(TYPE_ID, slot, data, RATE, file.name);
      bump((n) => n + 1);
      if (isConnected()) {
        setBusy(`→ Teensy slot ${slot} (${(data.length * 2 / 1024).toFixed(0)} KB)…`);
        await sendSample(slot, RATE, data, (done, total) => setBusy(`→ Teensy slot ${slot}: ${Math.round(100 * done / total)} %`));
        setBusy(`slot ${slot}: ${file.name} (${seconds.toFixed(2)} s) — in browser én op de Teensy (PSRAM + SD)`);
      } else {
        setBusy(`slot ${slot}: ${file.name} (${seconds.toFixed(2)} s) — in de browser; Teensy niet verbonden`);
      }
    } catch (err) {
      setBusy(`mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 520, maxWidth: '92vw',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎧 Sample laden</h3>
          <span style={{ color: '#64748b' }}>samplebank · 16 slots · mono 44,1 kHz · max {MAX_SECONDS} s</span>
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <p style={{ color: '#475569', margin: '8px 0 12px' }}>
          Kies een slot, laad een wav/mp3/flac/aiff. Het sample gaat direct naar alle
          <code> SAMPLER</code>-modules in de simulator (knop <em>Slot</em> kiest het slot) en,
          als de Teensy verbonden is, in chunks naar PSRAM + SD (<code>/mmb/samples/NN.raw</code>).
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <label>Slot
            <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} style={{ marginLeft: 6 }}>
              {Array.from({ length: SLOTS }, (_, i) => {
                const b = list.find((x) => x.slot === i);
                return <option key={i} value={i}>{i}{b ? ` — ${b.name} (${b.seconds.toFixed(2)} s)` : ' — leeg'}</option>;
              })}
            </select>
          </label>
          <input ref={fileRef} type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.currentTarget.value = ''; }} />
        </div>
        <div style={{ minHeight: 18, color: busy.startsWith('mislukt') ? '#b91c1c' : '#334155' }}>{busy}</div>
        {list.length > 0 && (
          <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b' }}><th>Slot</th><th>Bestand</th><th>Lengte</th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.slot} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td>{b.slot}</td><td>{b.name}</td><td>{b.seconds.toFixed(2)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ color: '#94a3b8', marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          Samples blijven in de browser tot een herlaad; op de Teensy blijven ze op SD staan.
        </p>
      </div>
    </div>
  );
}
