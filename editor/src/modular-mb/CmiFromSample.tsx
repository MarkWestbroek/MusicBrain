// UIT SAMPLE op Page 4 (doc/plans/fairlight.md §6.3): kies een geluid (.wav,
// een bankzone of de laatste opname), kies het gebied, controleer de
// grondtoon, luister origineel tegen CMI en neem het profiel over.
// Het rekenwerk staat in cmiAnalyse.ts, de bronnen in cmiSources.ts.

import { useEffect, useMemo, useRef, useState } from 'react';

import { nlen, useLang } from '../i18n';
import { analyseSample, noteOf, soundStart } from './cmiAnalyse';
import { SEG, type CmiProfile } from './cmiProfile';
import { bankZones, decodeToMono, lastTakeSound, serverBanks, type BankZoneSound, type MonoSound } from './cmiSources';
import { lastTakeFor } from './sim/lastTakeStore';
import { getEngine } from './sim/engineSingleton';

const GREEN = '#39ff7a', DIM = '#0f4d24', MID = '#1f8a45', BG = '#020a04';
const W = 320, HT = 70;
const MAX_REGION_S = 4;

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
function playRegion(s: MonoSound, a: number, b: number): void {
  ctx ??= new AudioContext();
  playing?.stop();
  const n = Math.max(1, Math.round(b - a));
  const buf = ctx.createBuffer(1, n, s.rate);
  buf.getChannelData(0).set(s.x.subarray(Math.round(a), Math.round(a) + n));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playing = src;
}

export function CmiFromSample({ patchId, segMs, btn, onPreview, onApply, onClose }: {
  patchId: string;
  /** De Seg-knop van de stem in ms (voor DURATION). */
  segMs: number;
  btn: (on: boolean) => React.CSSProperties;
  /** Tijdelijk naar de stemmen; null = het profiel van Page 4 terug. */
  onPreview: (p: CmiProfile | null) => void;
  onApply: (p: CmiProfile) => void;
  onClose: () => void;
}): JSX.Element {
  useLang();
  const [sound, setSound] = useState<MonoSound | null>(null);
  const [region, setRegion] = useState<[number, number]>([0, 0]);
  const [f0Override, setF0Override] = useState<number | null>(null);
  const [fine, setFine] = useState(true);
  const [banks, setBanks] = useState<{ file: string; name: string }[] | null>(null);
  const [zones, setZones] = useState<BankZoneSound[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<0 | 1 | null>(null);
  const [dragRegion, setDragRegion] = useState<[number, number] | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bankFile, setBankFile] = useState('');
  // Proefklank (▶ CMI) nog in de stemmen? Bij sluiten zonder Overnemen
  // (ook via ✕ van Page 4) gaat het profiel van Page 4 terug.
  const previewed = useRef(false);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => () => { if (previewed.current) previewRef.current(null); }, []);
  const hasTake = !!lastTakeFor(patchId)?.take.files.some((f) => /\.wav$/i.test(f.name));

  useEffect(() => () => { playing?.stop(); if (noteTimer.current) clearTimeout(noteTimer.current); }, []);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const stop = (ev: TouchEvent): void => { ev.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, [sound]);

  function load(s: MonoSound): void {
    const a = soundStart(s.x);
    setSound(s);
    setRegion([a, Math.min(s.x.length, a + MAX_REGION_S * s.rate)]);
    setF0Override(null);
    setErr(null);
  }
  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const analysis = useMemo(() => (sound && region[1] > region[0]
    ? analyseSample(sound.x, sound.rate, { start: region[0], end: region[1], hintHz: sound.hintHz, f0Hz: f0Override ?? undefined, fineAttack: fine, segMs })
    : null), [sound, region, f0Override, fine, segMs]);

  // Golfvorm: piek per kolom.
  const peaks = useMemo(() => {
    if (!sound) return null;
    const cols = W, per = Math.max(1, Math.floor(sound.x.length / cols));
    const out = new Float32Array(cols);
    let top = 1e-9;
    for (let c = 0; c < cols; c++) {
      let m = 0;
      for (let i = c * per; i < (c + 1) * per && i < sound.x.length; i++) m = Math.max(m, Math.abs(sound.x[i]!));
      out[c] = m; top = Math.max(top, m);
    }
    return out.map((v) => v / top);
  }, [sound]);

  const shown = dragRegion ?? region;
  const toX = (i: number): number => (sound ? (i / sound.x.length) * W : 0);
  function onDown(e: React.PointerEvent): void {
    if (!sound) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    drag.current = Math.abs(x - toX(region[0])) <= Math.abs(x - toX(region[1])) ? 0 : 1;
    onMove(e);
  }
  function onMove(e: React.PointerEvent): void {
    if (drag.current === null || !sound) return;
    const r = svgRef.current!.getBoundingClientRect();
    const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * sound.x.length);
    const cur = dragRegion ?? region;
    const minLen = Math.round(0.05 * sound.rate);
    const next: [number, number] = drag.current === 0
      ? [Math.min(i, cur[1] - minLen), cur[1]]
      : [cur[0], Math.max(i, cur[0] + minLen)];
    setDragRegion([Math.max(0, next[0]), Math.min(sound.x.length, next[1])]);
  }
  function onUp(): void {
    if (dragRegion) setRegion(dragRegion);
    setDragRegion(null);
    drag.current = null;
  }

  function playCmi(): void {
    if (!analysis || !(analysis.f0 > 0)) return;
    onPreview(analysis.profile);
    previewed.current = true;
    const engine = getEngine();
    const midi = noteOf(analysis.f0).midi;
    const ms = analysis.profile.duration.reduce((s, d) => s + d * segMs, 0);
    if (noteTimer.current) { clearTimeout(noteTimer.current); engine.noteOff(midi); }
    void engine.start().then(() => {
      engine.noteOn(midi, 0.9);
      noteTimer.current = setTimeout(() => { engine.noteOff(midi); noteTimer.current = null; }, Math.min(8000, ms + 100));
    });
  }

  const small: React.CSSProperties = { ...btn(false), minWidth: 0, padding: '0 8px' };
  const f0 = analysis?.f0 ?? 0;
  const nt = f0 > 0 ? noteOf(f0) : null;
  const regionS = sound ? (region[1] - region[0]) / sound.rate : 0;

  return (
    <div style={{ border: `1px solid ${MID}`, borderRadius: 4, padding: 8, marginTop: 10, background: BG }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
        <strong style={{ letterSpacing: '0.06em' }}>{nlen('UIT SAMPLE', 'FROM SAMPLE')}</strong>
        <span style={{ flex: 1 }} />
        <button type="button" style={small} onClick={() => fileRef.current?.click()}>{nlen('BESTAND', 'FILE')}</button>
        <input ref={fileRef} type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.ogg" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBankFile(''); setZones(null);
            void run('file', async () => load(await decodeToMono(await f.arrayBuffer(), f.name)));
          }} />
        <select aria-label={nlen('Samplebank', 'Sample bank')} value={bankFile}
          onFocus={() => { if (!banks) void run('banks', async () => setBanks(await serverBanks())); }}
          onChange={(e) => { const file = e.target.value; setBankFile(file); if (file) void run('bank', async () => { const z = await bankZones(file); setZones(z); if (z[0]) load(z[0]); }); }}
          style={{ ...small, background: BG, color: GREEN }}>
          <option value="">{nlen('BANK…', 'BANK…')}</option>
          {!banks && bankFile && <option value={bankFile}>{bankFile}</option>}
          {(banks ?? []).map((b) => <option key={b.file} value={b.file}>{b.name}</option>)}
        </select>
        {zones && zones.length > 1 && (
          <select aria-label={nlen('Zone', 'Zone')} style={{ ...small, background: BG, color: GREEN }}
            value={sound && zones.includes(sound as BankZoneSound) ? zones.indexOf(sound as BankZoneSound) : ''}
            onChange={(e) => { const z = zones[Number(e.target.value)]; if (z) load(z); }}>
            {zones.map((z, i) => <option key={i} value={i}>{z.label}</option>)}
          </select>
        )}
        <button type="button" style={{ ...small, opacity: hasTake ? 1 : 0.4 }} disabled={!hasTake}
          title={hasTake ? nlen('De laatste opname van deze patch', 'The last recording of this patch') : nlen('Nog geen opname van deze patch (⏺)', 'No recording of this patch yet (⏺)')}
          onClick={() => { setBankFile(''); setZones(null); void run('take', async () => { const s = await lastTakeSound(patchId); if (s) load(s); }); }}>{nlen('OPNAME', 'TAKE')}</button>
        <button type="button" style={small} onClick={() => { onPreview(null); onClose(); }} aria-label={nlen('Sluiten', 'Close')}>✕</button>
      </div>

      {busy && <div style={{ fontSize: 11, marginTop: 6, opacity: 0.8 }}>{nlen('laden…', 'loading…')}</div>}
      {err && <div style={{ fontSize: 11, marginTop: 6, color: '#ff6b6b' }}>{err}</div>}

      {!sound && !busy && (
        <div style={{ fontSize: 11, marginTop: 8, opacity: 0.75, lineHeight: 1.4 }}>
          {nlen('Kies een geluid. De analyse zoekt de grondtoon, snijdt het in 32 segmenten en meet per segment de 32 harmonischen. Toonvaste klanken (stem, koper, strijkers, orgel) werken het best.',
                'Pick a sound. The analysis finds the pitch, cuts it into 32 segments and measures the 32 harmonics of each. Pitched sounds (voice, brass, strings, organ) work best.')}
        </div>
      )}

      {sound && peaks && (
        <>
          <div style={{ fontSize: 11, marginTop: 8, opacity: 0.85 }}>
            {sound.name} · {nlen('gebied', 'region')} {regionS.toFixed(2)} s
          </div>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${HT}`} width="100%" role="slider" aria-label={nlen('Gebied: sleep begin of eind', 'Region: drag start or end')}
            aria-valuenow={Math.round(regionS * 100) / 100}
            style={{ display: 'block', touchAction: 'none', background: '#000', border: `1px solid ${DIM}`, cursor: 'ew-resize', marginTop: 4, WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <rect x={toX(shown[0])} y={0} width={Math.max(1, toX(shown[1]) - toX(shown[0]))} height={HT} fill={DIM} opacity={0.6} />
            {Array.from(peaks, (v, c) => <line key={c} x1={c + 0.5} x2={c + 0.5} y1={HT / 2 - (v * HT) / 2} y2={HT / 2 + (v * HT) / 2} stroke={GREEN} strokeWidth={0.8} opacity={0.8} />)}
            {/* segmentgrenzen */}
            {!dragRegion && analysis?.bounds.map((b, i) => <line key={`b${i}`} x1={toX(b)} x2={toX(b)} y1={HT - 6} y2={HT} stroke={GREEN} strokeWidth={0.4} />)}
            {[0, 1].map((k) => <line key={k} x1={toX(shown[k]!)} x2={toX(shown[k]!)} y1={0} y2={HT} stroke={GREEN} strokeWidth={2} />)}
          </svg>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
            <span>{nlen('GRONDTOON', 'PITCH')}:</span>
            <strong>{nt ? `${nt.name}${nt.cents ? ` ${nt.cents > 0 ? '+' : ''}${nt.cents}c` : ''} · ${f0.toFixed(1).replace('.', nlen(',', '.'))} Hz` : nlen('geen toon gevonden', 'no pitch found')}</strong>
            <button type="button" style={small} disabled={!f0} onClick={() => setF0Override(f0 / 2)}>½×</button>
            <button type="button" style={small} disabled={!f0} onClick={() => setF0Override(f0 * 2)}>2×</button>
            {f0Override !== null && <button type="button" style={small} onClick={() => setF0Override(null)}>{nlen('AUTO', 'AUTO')}</button>}
            {analysis && f0 > 0 && (
              <span style={{ opacity: 0.85 }}>· {nlen('harmonisch', 'harmonic')} {Math.round(analysis.harmonicity * 100)} %</span>
            )}
          </div>
          {analysis && f0 > 0 && analysis.harmonicity < 0.6 && (
            <div style={{ fontSize: 11, marginTop: 4, color: '#ffd166' }}>
              {nlen('Dit geluid is maar deels harmonisch: wat niet op de harmonischen valt (klokken, ruis, drums) klinkt anders na. Dat is de CMI-klank.',
                    'This sound is only partly harmonic: what is not on the harmonics (bells, noise, drums) will sound different. That is the CMI sound.')}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
            <input type="checkbox" checked={fine} onChange={(e) => setFine(e.target.checked)} />
            {nlen('aanzet fijner (korte segmenten vooraan)', 'finer attack (short segments first)')}
          </label>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" style={small} onClick={() => playRegion(sound, region[0], region[1])}>▶ {nlen('ORIGINEEL', 'ORIGINAL')}</button>
            <button type="button" style={small} disabled={!f0} onClick={playCmi}>▶ CMI</button>
            <span style={{ flex: 1 }} />
            <button type="button" style={{ ...small, ...btn(true) }} disabled={!analysis || !f0}
              onClick={() => { if (analysis) { previewed.current = false; onApply(analysis.profile); onClose(); } }}>{nlen('OVERNEMEN', 'APPLY')}</button>
            <button type="button" style={small} onClick={() => { onPreview(null); onClose(); }}>{nlen('TERUG', 'BACK')}</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>
            {nlen(`${SEG} segmenten; DURATION volgt het origineel bij Seg = ${Math.round(segMs)} ms.`, `${SEG} segments; DURATION follows the original at Seg = ${Math.round(segMs)} ms.`)}
          </div>
        </>
      )}
    </div>
  );
}
