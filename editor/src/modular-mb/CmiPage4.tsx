// Page 4 van de Fairlight CMI (doc/plans/fairlight.md): de harmonische
// profielen van een CMI-stem tekenen, groen op zwart. Kies een harmonische
// (1–32), of DUR (hoe lang elk segment klinkt) of ENRG (de volumecurve), en
// teken met vinger of muis over de 32 segmenten. Startpunten: koper, zaag,
// vierkant, orgel, strijkers, koor, klok, of UIT SAMPLE (CmiFromSample.tsx).
//
// Tijdens het tekenen hoor je het meteen (de tabel gaat elke ~120 ms naar de
// stemmen in de simulator en, met een open link, naar de Teensy); bij het
// loslaten komt het profiel in de patch (`moduleData`), dus Bewaar, Terug,
// export en pool werken zoals voor knoppen.
//
// Touch: `touch-action: none` en een niet-passieve touchstart met
// preventDefault op het tekenvlak, zoals het klavier.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { nlen, useLang } from '../i18n';
import { CmiFromSample } from './CmiFromSample';
import {
  H, PRESETS, SEG, computeTable, encodeProfile, harmonicsOf, level, preset, profileFromHarmonics,
  type CmiProfile, type PresetId,
} from './cmiProfile';
import { profileOf } from './cmiSync';
import { WasmModule } from './runtime';
import { getProject, updateProject } from './store';
import { isConnected, sendWaveform } from './teensyLink';

const GREEN = '#39ff7a', DIM = '#0f4d24', MID = '#1f8a45', BG = '#020a04';
const FONT = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';
type Row = number | 'dur' | 'energy';

/** Waarde van een rij in segment s, op 0..1 (DUR: log-schaal 1/16..16). */
function valueOf(p: CmiProfile, row: Row, s: number): number {
  if (row === 'dur') return (Math.log2(p.duration[s]!) + 4) / 8;
  if (row === 'energy') return p.energy[s]!;
  return level(p, row, s);
}
function setValue(p: CmiProfile, row: Row, s: number, v: number): void {
  const x = Math.max(0, Math.min(1, v));
  if (row === 'dur') p.duration[s] = 2 ** (x * 8 - 4);
  else if (row === 'energy') p.energy[s] = x;
  else p.levels[row * SEG + s] = x;
}
const cloneProfile = (p: CmiProfile): CmiProfile => ({ levels: p.levels.slice(), duration: p.duration.slice(), energy: p.energy.slice() });

export function CmiPage4({ patchId, owner, voices, onClose }: {
  patchId: string; owner: string; voices: string[]; onClose: () => void;
}): JSX.Element {
  useLang();
  const [profile, setProfile] = useState<CmiProfile>(() => {
    const patch = getProject().patches.find((x) => x.id === patchId);
    return cloneProfile(patch ? profileOf(patch, owner) : preset('brass'));
  });
  const [row, setRow] = useState<Row>(0);
  // UIT SAMPLE (§6): een geluid analyseren naar dit profiel.
  const [fromSample, setFromSample] = useState(false);
  const segMs = (() => {
    const v = getProject().patches.find((x) => x.id === patchId)?.controlState[owner]?.seg;
    return typeof v === 'number' && v > 0 ? v : 40;
  })();
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef<{ last: number | null } | null>(null);
  const lastPush = useRef(0);

  // Naar de stemmen: simulator altijd, Teensy als de link open is.
  function push(p: CmiProfile): void {
    const table = computeTable(p);
    for (const id of voices) WasmModule.setInstanceBlob(id, 0, table, 44100);
    if (isConnected()) { const data = Array.from(table); for (const id of voices) void sendWaveform(id, data); }
  }
  // In de patch: Bewaar/Terug/export/pool.
  function commit(p: CmiProfile): void {
    const cmi = encodeProfile(p);
    updateProject((proj) => ({
      ...proj,
      patches: proj.patches.map((x) => (x.id === patchId ? { ...x, moduleData: { ...(x.moduleData ?? {}), [owner]: { ...(x.moduleData?.[owner] ?? {}), cmi } } } : x)),
    }), { forceCommit: true });
  }
  function apply(p: CmiProfile, final: boolean): void {
    setProfile(p);
    const now = performance.now();
    if (final || now - lastPush.current > 120) { lastPush.current = now; push(p); }
    if (final) commit(p);
  }

  // Tekenen: x = segment, y = waarde; tussen twee punten alles invullen.
  const W = 320, HT = 160;
  function at(e: React.PointerEvent): { s: number; v: number } {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * HT;
    return { s: Math.max(0, Math.min(SEG - 1, Math.floor((x / W) * SEG))), v: 1 - y / HT };
  }
  function paint(e: React.PointerEvent, final: boolean): void {
    const { s, v } = at(e);
    const p = cloneProfile(profile);
    const from = drawing.current?.last ?? s;
    const lo = Math.min(from, s), hi = Math.max(from, s);
    for (let k = lo; k <= hi; k++) setValue(p, row, k, v);
    if (drawing.current) drawing.current.last = s;
    apply(p, final);
  }
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const stop = (ev: TouchEvent): void => { ev.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const xOf = (s: number): number => ((s + 0.5) / SEG) * W;
  const yOf = (v: number): number => (1 - v) * HT;
  const line = (r: Row): string => Array.from({ length: SEG }, (_, s) => `${xOf(s).toFixed(1)},${yOf(valueOf(profile, r, s)).toFixed(1)}`).join(' ');
  const rowLabel = row === 'dur' ? 'DURATION' : row === 'energy' ? 'ENERGY' : `${nlen('HARMONISCHE', 'HARMONIC')} ${row + 1}`;
  const btn = (on: boolean): React.CSSProperties => ({
    fontFamily: FONT, fontSize: 12, minWidth: 30, height: 26, padding: '0 4px', cursor: 'pointer',
    background: on ? GREEN : 'transparent', color: on ? BG : GREEN, border: `1px solid ${on ? GREEN : MID}`, borderRadius: 2,
  });

  // Page 6 → Page 4: een periode uit de wave-tekenaar (als die er een
  // onthouden heeft) of uit het eerste segment van nu.
  function fromWave(): void {
    const cycle = Array.from(computeTable(profile).subarray(0, 128));
    apply(profileFromHarmonics(harmonicsOf(cycle)), true);
  }

  return createPortal(
    <div role="dialog" aria-label="Page 4" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '12px 8px' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 720, background: BG, color: GREEN, fontFamily: FONT, border: `2px solid ${MID}`, borderRadius: 6, padding: 12, boxSizing: 'border-box', boxShadow: `0 0 24px ${DIM}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>PAGE 4</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{nlen('HARMONISCHE PROFIELEN', 'HARMONIC PROFILES')}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btn(false)} aria-label={nlen('Sluiten', 'Close')}>✕</button>
        </div>

        <div style={{ fontSize: 12, marginBottom: 4 }}>{rowLabel}</div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${HT}`} width="100%" style={{ display: 'block', touchAction: 'none', background: '#000', border: `1px solid ${DIM}`, cursor: 'crosshair', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
          onPointerDown={(e) => { e.preventDefault(); svgRef.current?.setPointerCapture(e.pointerId); drawing.current = { last: null }; paint(e, false); }}
          onPointerMove={(e) => { if (drawing.current) paint(e, false); }}
          onPointerUp={(e) => { if (drawing.current) { paint(e, true); drawing.current = null; } }}
          onPointerCancel={() => { drawing.current = null; apply(profile, true); }}>
          {/* raster: 32 segmenten, kwarten in de hoogte */}
          {Array.from({ length: SEG + 1 }, (_, s) => <line key={`v${s}`} x1={(s / SEG) * W} y1={0} x2={(s / SEG) * W} y2={HT} stroke={DIM} strokeWidth={s % 8 === 0 ? 0.8 : 0.3} />)}
          {[0.25, 0.5, 0.75].map((f) => <line key={`h${f}`} x1={0} y1={f * HT} x2={W} y2={f * HT} stroke={DIM} strokeWidth={0.3} />)}
          {/* de andere harmonischen vaag, de gekozen rij fel */}
          {typeof row === 'number' && Array.from({ length: H }, (_, h) => h).filter((h) => h !== row).map((h) => (
            <polyline key={h} points={line(h)} fill="none" stroke={MID} strokeWidth={0.6} opacity={0.5} />
          ))}
          {Array.from({ length: SEG }, (_, s) => {
            const v = valueOf(profile, row, s);
            return <rect key={s} x={(s / SEG) * W + 1.5} y={yOf(v)} width={W / SEG - 3} height={HT - yOf(v)} fill={GREEN} opacity={0.25} />;
          })}
          <polyline points={line(row)} fill="none" stroke={GREEN} strokeWidth={1.6} />
        </svg>

        {/* rijkeuze: de 32 harmonischen, DUR en ENRG */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }}>
          {Array.from({ length: H }, (_, h) => (
            <button key={h} type="button" onClick={() => setRow(h)} style={btn(row === h)}
              title={`${nlen('Harmonische', 'Harmonic')} ${h + 1}`}>{h + 1}</button>
          ))}
          <button type="button" onClick={() => setRow('dur')} style={{ ...btn(row === 'dur'), minWidth: 44 }} title={nlen('Hoe lang elk segment klinkt', 'How long each segment sounds')}>DUR</button>
          <button type="button" onClick={() => setRow('energy')} style={{ ...btn(row === 'energy'), minWidth: 44 }} title={nlen('De volumecurve over de segmenten', 'The volume curve over the segments')}>ENRG</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
          <span>{nlen('START', 'START')}:</span>
          {PRESETS.map((pr) => (
            <button key={pr.id} type="button" onClick={() => apply(cloneProfile(preset(pr.id as PresetId)), true)} style={{ ...btn(false), minWidth: 0, padding: '0 8px' }}>
              {nlen(pr.nl, pr.en)}
            </button>
          ))}
          <button type="button" onClick={fromWave} style={{ ...btn(false), minWidth: 0, padding: '0 8px' }}
            title={nlen('Analyseer de golf van segment 1 naar harmonischen en maak die overal gelijk', 'Analyse the wave of segment 1 into harmonics and make them equal everywhere')}>
            {nlen('vlak uit seg. 1', 'flat from seg. 1')}
          </button>
          <button type="button" onClick={() => setFromSample(true)} style={{ ...btn(fromSample), minWidth: 0, padding: '0 8px', fontWeight: 700 }}
            title={nlen('Een sample (.wav, bank of opname) analyseren naar harmonischen', 'Analyse a sample (.wav, bank or take) into harmonics')}>
            {nlen('UIT SAMPLE', 'FROM SAMPLE')}
          </button>
        </div>
        {fromSample && (
          <CmiFromSample patchId={patchId} segMs={segMs} btn={btn}
            onPreview={(p) => push(p ?? profile)}
            onApply={(p) => apply(cloneProfile(p), true)}
            onClose={() => setFromSample(false)} />
        )}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8, lineHeight: 1.4 }}>
          {nlen('Kies een harmonische (of DUR/ENRG) en teken over de 32 segmenten van de noot. Je hoort het meteen; bij loslaten staat het in de patch (Bewaar om te houden).',
                'Pick a harmonic (or DUR/ENRG) and draw across the 32 segments of the note. You hear it at once; on release it is in the patch (Save to keep it).')}
        </div>
      </div>
    </div>,
    document.fullscreenElement ?? document.body,
  );
}
