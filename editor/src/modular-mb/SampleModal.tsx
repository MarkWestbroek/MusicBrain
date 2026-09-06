/// <reference types="vite/client" />
// SampleModal — snel één sample in de sampler laden (slot 0, één zone over
// het hele klavier). Voor een echte keymap met key- en velocity-zones: de
// 🎹 Multisample-import.
//
// De voorbeelden zijn door MusicBrain zelf gerenderd
// (tools/mmb-wasm/render-samples.mjs) en staan in public/samples/.
import { useEffect, useState } from 'react';
import { WasmModule } from './runtime';

const TYPE_ID = 'tp_mmb_sampler';
const MAX_SECONDS = 30;
const RATE = 44100;

interface ExampleSample { file: string; name: string; root: number; seconds: number; source: string }

/** Decodeer naar interleaved int16 (max 4 kanalen) op de contextrate. */
async function decode(file: File): Promise<{ data: Int16Array; channels: number; seconds: number }> {
  const ctx = new OfflineAudioContext(1, 1, RATE);
  const b = await ctx.decodeAudioData(await file.arrayBuffer());
  const ch = Math.min(b.numberOfChannels, 4);
  const n = Math.min(b.length, MAX_SECONDS * RATE);
  const out = new Int16Array(n * ch);
  for (let c = 0; c < ch; c++) {
    const src = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      out[i * ch + c] = Math.max(-32768, Math.min(32767, Math.round((src[i] ?? 0) * 32767)));
    }
  }
  return { data: out, channels: ch, seconds: n / RATE };
}

export function SampleModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [root, setRoot] = useState(60);
  const [busy, setBusy] = useState('');
  const [examples, setExamples] = useState<ExampleSample[]>([]);
  const [example, setExample] = useState('');
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || examples.length) return;
    fetch(`${base}samples/index.json`).then((r) => (r.ok ? r.json() : []))
      .then((list: ExampleSample[]) => {
        setExamples(list);
        if (list[0]) { setExample(list[0].file); setRoot(list[0].root); }
      })
      .catch(() => { /* geen voorbeelden aanwezig */ });
  }, [open, examples.length, base]);

  if (!open) return null;

  async function load(file: File, rootNote: number): Promise<void> {
    try {
      setBusy(`decoderen: ${file.name}…`);
      const { data, channels, seconds } = await decode(file);
      WasmModule.setBlob(TYPE_ID, 0, data, RATE, file.name, channels);
      WasmModule.setZones(TYPE_ID, [{
        slot: 0, lowKey: 0, highKey: 127, lowVel: 1, highVel: 127,
        root: rootNote, tuneCents: 0, gain: 1, pan: 0,
        loopMode: 0, loopStart: 0, loopEnd: 0, decay: 0, release: 0.12,
      }]);
      setBusy(`slot 0: ${file.name} · ${seconds.toFixed(2)} s · ` +
        `${channels === 1 ? 'mono' : channels === 2 ? 'stereo' : `${channels} kanalen`} · root ${rootNote}`);
    } catch (err) {
      setBusy(`mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function loadExample(): Promise<void> {
    const ex = examples.find((e) => e.file === example);
    if (!ex) return;
    try {
      setBusy(`ophalen: ${ex.name}…`);
      const r = await fetch(`${base}samples/${ex.file}`);
      if (!r.ok) throw new Error(`${ex.file} niet gevonden`);
      setRoot(ex.root);
      await load(new File([await r.blob()], ex.name, { type: 'audio/wav' }), ex.root);
    } catch (err) {
      setBusy(`mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 560, maxWidth: '92vw',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎧 Sample laden</h3>
          <span style={{ color: '#64748b' }}>één sample, hele klavier</span>
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <p style={{ color: '#475569', margin: '8px 0 12px' }}>
          Laadt één sample in slot 0 van de <code>SAMPLER</code>-modules in de simulator, met
          één zone over het hele klavier. <strong>Root</strong> is de noot waarop het sample
          van huis uit staat; daarvandaan transponeert V/Oct. Voor een keymap met meerdere
          noten en velocity-lagen: de knop <strong>🎹 Multisample</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <label>Root <input type="number" min={0} max={127} value={root} style={{ width: 56 }}
            onChange={(e) => setRoot(Math.max(0, Math.min(127, Number(e.target.value))))} /></label>
          <input type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f, root); e.currentTarget.value = ''; }} />
        </div>
        {examples.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <label>Voorbeeld
              <select value={example} onChange={(e) => setExample(e.target.value)} style={{ marginLeft: 6 }}>
                {examples.map((e) => (
                  <option key={e.file} value={e.file}>{e.name} · {e.seconds.toFixed(1)} s · root {e.root}</option>
                ))}
              </select>
            </label>
            <button onClick={() => void loadExample()}>Laden</button>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>gerenderd door de wasm-modules zelf</span>
          </div>
        )}
        <div style={{ minHeight: 18, color: busy.startsWith('mislukt') ? '#b91c1c' : '#334155' }}>{busy}</div>
        <p style={{ color: '#94a3b8', marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          Samples blijven in de browser tot een herlaad. Voor de Teensy schrijf je een
          <code> .mmbs</code>-bank met de Multisample-import en kopieer je die naar
          <code> /mmb/banks</code> op de SD-kaart.
        </p>
      </div>
    </div>
  );
}
