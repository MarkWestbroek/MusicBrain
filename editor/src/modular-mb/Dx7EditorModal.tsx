// Dx7EditorModal — DX7-patches bewerken en meteen horen.
//
// De DX7 is berucht om zijn 155 parameters achter één dataslider en een
// display van twee regels. Hier staat alles tegelijk in beeld, en omdat de
// synth als wasm in de browser draait hoor je elke wijziging direct: de
// editor zet een *edit-patch* die de bank overstemt (dx7Host.setEditPatch), dus
// alle DX7-modules in de simulatie spelen wat je hier maakt.
//
// Beginnen doe je vanuit een factory-voice; het resultaat kun je als
// 32-voice .syx wegschrijven — dat bestand laadt zowel in onze USER-bank als
// in een échte DX7.
import { useEffect, useRef, useState } from 'react';
import { dx7Host } from './runtime';
import { getEngine } from './sim/engineSingleton';
import {
  DX7, opOffset, unpackPatch, packPatch, patchName, setPatchName,
  algorithmRouting, modulationTargets, modulatorsOf, opRatio, LFO_WAVES,
} from './dx7Patch';
import { DX7_BANK_SHORT, DX7_BANK_LABELS, DX7_VOICE_NAMES } from './dx7BankNames';
import {
  DX7_ROTO_CHANNEL, DX7_ROTO_PAGES, DX7_ROTO_BUTTONS, knobCc, buttonCc,
  paramForCc, buttonForCc, paramOffset, rotoFeedback, exportDx7RotoSetup,
} from './dx7Roto';
import { addCcTap, sendCc, useSurfaceBridge } from './surfaceBridge';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Output level → dB, zoals msfa's Env::scaleoutlevel (env.cc): boven 19 is het
// 28 + level, daaronder een tabel; elke stap is 0,75 dB. Gemeten tegen de wasm:
// level 90 = −6 dB, 50 = −36 dB, 35 = −47 dB, 0 = helemaal uit. Dat is de reden
// dat een operator op 35 naast een op 99 niet meer te horen is.
const LEVEL_LUT = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];
function levelDb(level: number): string {
  if (level <= 0) return 'stil';
  const scaled = level >= 20 ? 28 + level : LEVEL_LUT[level]!;
  return `${((scaled - 127) * 0.75).toFixed(0)} dB`;
}
const noteName = (m: number): string => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export function Dx7EditorModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [patch, setPatch] = useState<Uint8Array | null>(null);
  const [bank, setBank] = useState(0);
  const [program, setProgram] = useState(0);
  const [busy, setBusy] = useState('');
  const [rotoOp, setRotoOp] = useState(1);
  const [, bump] = useState(0);
  const held = useRef<number | null>(null);
  const surface = useSurfaceBridge();
  // De CC-tap leeft langer dan één render; via een ref ziet hij altijd de
  // huidige patch en operator in plaats van die van zijn registratiemoment.
  const live = useRef<{ patch: Uint8Array | null; op: number }>({ patch: null, op: 1 });
  live.current = { patch, op: rotoOp };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Roto-Control: encoders en buttons van kanaal 16 rechtstreeks op de patch.
  // De tap ziet de CC vóór de project-bindings, zodat het Surface-paneel op
  // kanaal 1 gewoon kan blijven draaien.
  useEffect(() => {
    if (!open) return;
    return addCcTap((ch, cc, val) => {
      if (ch !== DX7_ROTO_CHANNEL) return false;
      const cur = live.current;
      const knob = paramForCc(cc);
      if (knob && cur.patch) {
        const off = paramOffset(knob.param, cur.op);
        cur.patch[off] = Math.max(0, Math.min(knob.param.max, val));
        dx7Host.setEditPatch(cur.patch);
        bump((n) => n + 1);
        return true;
      }
      const btn = buttonForCc(cc);
      if (btn && val > 0) {
        if (btn.kind === 'selectOp') setRotoOp(btn.op);
        else if (btn.kind === 'bankVoice') { dx7Host.setEditPatch(null); setBusy('terug naar de bank-voice'); }
        else if (btn.kind === 'nextVoice') { const n = (program + 1) & 31; setProgram(n); void loadFromRom(bank, n); }
        return true;
      }
      return cc >= 20 && cc <= 61;              // ons CC-blok, verder niets mee
    });
  }, [open, bank, program]);

  // Knoppenstand terug naar het apparaat na een voicewissel of een andere
  // operator — anders staan de ringen op de vorige patch.
  useEffect(() => {
    if (!open || !patch) return;
    for (const { cc, val } of rotoFeedback(patch, rotoOp)) sendCc(DX7_ROTO_CHANNEL, cc, val);
  }, [open, patch, rotoOp]);

  // Eerste opening: begin bij de patch die al klinkt, of bij ROM1A #1.
  useEffect(() => {
    if (!open || patch) return;
    const existing = dx7Host.getEditPatch();
    if (existing) { setPatch(Uint8Array.from(existing)); return; }
    void loadFromRom(0, 0);
  }, [open, patch]);

  if (!open) return null;

  async function loadFromRom(b: number, p: number): Promise<void> {
    try {
      const packed = await dx7Host.getPackedVoice(b, p);
      const un = unpackPatch(packed, 0);
      setPatch(un);
      dx7Host.setEditPatch(un);
      setBusy(`geladen: ${DX7_BANK_SHORT[b]} #${p + 1} "${patchName(un).trim()}"`);
    } catch (err) {
      setBusy(`mislukt: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Eén byte zetten en meteen laten horen. */
  function set(offset: number, value: number, lo = 0, hi = 99): void {
    if (!patch) return;
    const v = Math.max(lo, Math.min(hi, Math.round(value)));
    patch[offset] = v;
    dx7Host.setEditPatch(patch);
    bump((n) => n + 1);
    // Staat deze parameter op een Roto-knop van de huidige operator, laat de
    // ring dan meedraaien.
    DX7_ROTO_PAGES.forEach((pg, page) => pg.params.forEach((param, slot) => {
      if (paramOffset(param, rotoOp) === offset) sendCc(DX7_ROTO_CHANNEL, knobCc(page, slot), v);
    }));
  }

  function exportSyx(): void {
    if (!patch) return;
    const packed = packPatch(patch);
    const body = new Uint8Array(4096);
    for (let i = 0; i < 32; i++) body.set(packed, i * 128);   // 32× dezelfde voice
    let sum = 0;
    for (const b of body) sum = (sum + b) & 0x7f;
    const syx = new Uint8Array(4096 + 8);
    syx.set([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00], 0);
    syx.set(body, 6);
    syx[4102] = (128 - sum) & 0x7f;
    syx[4103] = 0xf7;
    const url = URL.createObjectURL(new Blob([syx], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patchName(patch).trim().replace(/[^\w-]+/g, '_') || 'voice'}.syx`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy('.syx geschreven — laadt in onze USER-bank én in een echte DX7');
  }

  function exportRoto(): void {
    const setup = exportDx7RotoSetup('MMB DX7');
    const url = URL.createObjectURL(new Blob([JSON.stringify(setup, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MMB DX7.json';
    a.click();
    URL.revokeObjectURL(url);
    setBusy('setup geschreven — importeer in ROTO-SETUP en push naar het apparaat');
  }

  function play(midi: number, on: boolean): void {
    if (dx7Host.instanceCount() === 0) { setBusy('geen DX7 in de patch — Poly ▾ → DX7 poly ×8, dan ▶ Start in Simulatie'); return; }
    // Construct A: de noot gaat de gewone weg — MIDI-in-dispatcher en
    // stemtoewijzer van de engine — net als een toets op het klavier.
    if (on) getEngine().noteOn(midi, 0.85); else getEngine().noteOff(midi);
  }

  const routing = patch ? algorithmRouting(patch[DX7.algorithm] ?? 0) : [];
  const targets = patch ? modulationTargets(patch[DX7.algorithm] ?? 0) : new Map<number, number[]>();
  const modBy   = patch ? modulatorsOf(patch[DX7.algorithm] ?? 0) : new Map<number, number[]>();

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 1000, maxWidth: '96vw',
    maxHeight: '92vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const th: React.CSSProperties = { textAlign: 'left', color: '#64748b', fontWeight: 500, padding: '2px 5px' };
  const td: React.CSSProperties = { padding: '2px 5px', borderTop: '1px solid #e2e8f0' };
  const num = (w = 46): React.CSSProperties => ({ width: w });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎛 DX7-patch</h3>
          <span style={{ color: '#64748b' }}>bewerken en direct horen</span>
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>

        {/* ── startpunt + naam ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
          <label>ROM
            <select value={bank} onChange={(e) => { const b = Number(e.target.value); setBank(b); void loadFromRom(b, program); }} style={{ marginLeft: 6 }}>
              {DX7_BANK_LABELS.slice(0, 8).map((l, i) => <option key={i} value={i}>{l}</option>)}
            </select>
          </label>
          <label>Voice
            <select value={program} onChange={(e) => { const p = Number(e.target.value); setProgram(p); void loadFromRom(bank, p); }} style={{ marginLeft: 6 }}>
              {Array.from({ length: 32 }, (_, i) => (
                <option key={i} value={i}>{i + 1}. {DX7_VOICE_NAMES?.[bank]?.[i] ?? ''}</option>
              ))}
            </select>
          </label>
          <label>Naam <input value={patch ? patchName(patch).trimEnd() : ''} maxLength={10} style={{ width: 96 }}
            onChange={(e) => { if (!patch) return; setPatchName(patch, e.target.value); dx7Host.setEditPatch(patch); bump((n) => n + 1); }} /></label>
          <button onClick={exportSyx} disabled={!patch}>⤓ .syx</button>
          <button onClick={() => { dx7Host.setEditPatch(null); setBusy('terug naar de bank-voice (Bank/Program van de module)'); }}>
            edit uit
          </button>
        </div>

        {patch && (
          <>
            {/* ── algoritme ── */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <label>Algoritme <input type="number" min={1} max={32} style={num(56)}
                  value={(patch[DX7.algorithm] ?? 0) + 1}
                  onChange={(e) => set(DX7.algorithm, Number(e.target.value) - 1, 0, 31)} /></label>
                <label style={{ marginLeft: 12 }}>Feedback <input type="number" min={0} max={7} style={num(46)}
                  value={patch[DX7.feedback] ?? 0} onChange={(e) => set(DX7.feedback, Number(e.target.value), 0, 7)} /></label>
                <label style={{ marginLeft: 12 }}>Transpose <input type="number" min={0} max={48} style={num(46)}
                  value={patch[DX7.transpose] ?? 24} onChange={(e) => set(DX7.transpose, Number(e.target.value), 0, 48)} /></label>
              </div>
              <div style={{ fontFamily: 'var(--mb-font-mono, monospace)', fontSize: 12, color: '#334155' }}>
                {routing.map((r) => {
                  const t = targets.get(r.op) ?? [];
                  return (
                    <div key={r.op}>
                      OP{r.op} → {r.carrier ? 'uitgang' : t.sort((a, b) => a - b).map((x) => `OP${x}`).join(', ')}
                      {r.feedback ? '  ⟲ feedback' : ''}
                    </div>
                  );
                })}
              </div>
              <div style={{ color: '#64748b', maxWidth: 320, fontSize: 12 }}>
                Dragers gaan rechtstreeks naar de uitgang; de rest moduleert. Eén modulator
                kan meerdere dragers tegelijk voeden — in algoritme 22 voedt OP6 er drie,
                en daarom doet die knop zoveel. De output-level van een modulator is de
                FM-diepte, niet het volume.
              </div>
            </div>

            {/* ── operators ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr>
                <th style={th}>OP</th><th style={th}>rol</th><th style={th}>level</th>
                <th style={th}>mode</th><th style={th}>coarse</th><th style={th}>fine</th>
                <th style={th}>detune</th><th style={th}>ratio</th>
                <th style={th}>R1 R2 R3 R4</th><th style={th}>L1 L2 L3 L4</th>
                <th style={th}>vel</th><th style={th}>envelope</th>
              </tr></thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6].map((uiOp) => {
                  const o = opOffset(uiOp);
                  const r = routing.find((x) => x.op === uiOp)!;
                  const mods = (modBy.get(uiOp) ?? []).slice().sort((a, b) => a - b);
                  const lvl = patch[o + DX7.op.outputLevel] ?? 0;
                  return (
                    <tr key={uiOp}>
                      <td style={td}><strong>{uiOp}</strong></td>
                      <td style={{ ...td, color: r.carrier ? '#15803d' : '#b45309' }}>
                        {r.carrier ? 'drager' : 'mod'}
                        {mods.length > 0 && <span style={{ color: '#94a3b8' }}> ←{mods.join(',')}</span>}
                      </td>
                      <td style={td}>
                        <input type="number" min={0} max={99} style={num()}
                          value={lvl}
                          onChange={(e) => set(o + DX7.op.outputLevel, Number(e.target.value))} />
                        <span style={{ marginLeft: 4, fontSize: 11, color: lvl < 45 ? '#b91c1c' : '#94a3b8' }}
                          title="Niveau van deze operator t.o.v. 99. Elke stap is ~0,75 dB, dus 35 ligt 47 dB onder 99 — naast een luide drager hoor je die niet meer.">
                          {levelDb(lvl)}
                        </span>
                      </td>
                      <td style={td}>
                        <select value={patch[o + DX7.op.oscMode] ?? 0}
                          onChange={(e) => set(o + DX7.op.oscMode, Number(e.target.value), 0, 1)}>
                          <option value={0}>ratio</option><option value={1}>vast</option>
                        </select>
                      </td>
                      <td style={td}><input type="number" min={0} max={31} style={num(44)}
                        value={patch[o + DX7.op.freqCoarse] ?? 1}
                        onChange={(e) => set(o + DX7.op.freqCoarse, Number(e.target.value), 0, 31)} /></td>
                      <td style={td}><input type="number" min={0} max={99} style={num(44)}
                        value={patch[o + DX7.op.freqFine] ?? 0}
                        onChange={(e) => set(o + DX7.op.freqFine, Number(e.target.value))} /></td>
                      <td style={td}><input type="number" min={0} max={14} style={num(44)}
                        value={patch[o + DX7.op.detune] ?? 7}
                        onChange={(e) => set(o + DX7.op.detune, Number(e.target.value), 0, 14)} /></td>
                      <td style={{ ...td, color: '#475569' }}>{opRatio(patch, uiOp)}</td>
                      <td style={td}>
                        {[0, 1, 2, 3].map((i) => (
                          <input key={i} type="number" min={0} max={99} style={{ width: 38 }}
                            value={patch[o + DX7.op.rate + i] ?? 0}
                            onChange={(e) => set(o + DX7.op.rate + i, Number(e.target.value))} />
                        ))}
                      </td>
                      <td style={td}>
                        {[0, 1, 2, 3].map((i) => (
                          <input key={i} type="number" min={0} max={99} style={{ width: 38 }}
                            value={patch[o + DX7.op.level + i] ?? 0}
                            onChange={(e) => set(o + DX7.op.level + i, Number(e.target.value))} />
                        ))}
                      </td>
                      <td style={td}><input type="number" min={0} max={7} style={num(38)}
                        value={patch[o + DX7.op.velSens] ?? 0}
                        onChange={(e) => set(o + DX7.op.velSens, Number(e.target.value), 0, 7)} /></td>
                      <td style={td}><EnvCurve patch={patch} offset={o} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── LFO ── */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <strong style={{ color: '#475569' }}>LFO</strong>
              <label>golf
                <select value={patch[DX7.lfoWave] ?? 0} style={{ marginLeft: 4 }}
                  onChange={(e) => set(DX7.lfoWave, Number(e.target.value), 0, 5)}>
                  {LFO_WAVES.map((w, i) => <option key={i} value={i}>{w}</option>)}
                </select></label>
              {([['speed', DX7.lfoSpeed], ['delay', DX7.lfoDelay], ['pitch-mod', DX7.lfoPmd], ['amp-mod', DX7.lfoAmd]] as const).map(([label, off]) => (
                <label key={label}>{label} <input type="number" min={0} max={99} style={num()}
                  value={patch[off] ?? 0} onChange={(e) => set(off, Number(e.target.value))} /></label>
              ))}
              <label>mod-gevoeligheid <input type="number" min={0} max={7} style={num(40)}
                value={patch[DX7.pitchModSens] ?? 0} onChange={(e) => set(DX7.pitchModSens, Number(e.target.value), 0, 7)} /></label>
            </div>

            {/* ── Roto-Control ── */}
            <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ color: '#475569' }}>🎛 Roto-Control</strong>
                <span style={{ color: '#64748b', fontSize: 12 }}>kanaal {DX7_ROTO_CHANNEL}</span>
                <span style={{ display: 'inline-flex', gap: 3 }}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button key={n} onClick={() => setRotoOp(n)}
                      style={{
                        padding: '2px 8px',
                        background: n === rotoOp ? '#0ea5e9' : '#fff',
                        color: n === rotoOp ? '#fff' : '#334155',
                        border: '1px solid #cbd5e1', borderRadius: 3, cursor: 'pointer',
                      }}>OP{n}</button>
                  ))}
                </span>
                <span style={{ color: '#64748b', fontSize: 12 }}>
                  {surface.inputId ? 'knoppen actief' : 'kies een MIDI-in in het Surface-paneel'}
                  {surface.outputId ? ' · ringen volgen' : ''}
                </span>
                <button onClick={exportRoto} style={{ marginLeft: 'auto' }}>⤓ ROTO-SETUP</button>
              </div>
              <table style={{ marginTop: 8, borderCollapse: 'collapse', fontSize: 11, color: '#475569' }}>
                <tbody>
                  {DX7_ROTO_PAGES.map((pg, page) => (
                    <tr key={pg.name}>
                      <td style={{ padding: '1px 8px 1px 0', color: '#94a3b8' }}>{page + 1}. {pg.name}</td>
                      {pg.params.map((param, slot) => (
                        <td key={param.label} style={{ padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}
                          title={`CC ${knobCc(page, slot)}`}>
                          {param.label} <strong>{patch[paramOffset(param, rotoOp)] ?? 0}</strong>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '1px 8px 1px 0', color: '#94a3b8' }}>buttons</td>
                    {DX7_ROTO_BUTTONS.map((b, i) => (
                      <td key={b.label} style={{ padding: '1px 8px' }} title={`CC ${buttonCc(i)}`}>{b.label}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                Zes buttons kiezen de operator, de acht encoders tonen steeds díé operator.
                Elke knop stuurt zijn eigen bereik (0–99 voor een level, 0–31 voor het
                algoritme), dus het Roto-display toont hetzelfde getal als de tabel hierboven.
              </div>
            </div>

            {/* ── klavier ── */}
            <div style={{ display: 'flex', gap: 3, marginTop: 12, userSelect: 'none' }}>
              {Array.from({ length: 25 }, (_, i) => 48 + i).map((m) => {
                const black = [1, 3, 6, 8, 10].includes(m % 12);
                return (
                  <button key={m}
                    onMouseDown={() => { held.current = m; play(m, true); }}
                    onMouseUp={() => { play(m, false); held.current = null; }}
                    onMouseLeave={() => { if (held.current === m) { play(m, false); held.current = null; } }}
                    style={{
                      flex: 1, height: 44, padding: 0, fontSize: 9,
                      background: black ? '#1e293b' : '#f8fafc',
                      color: black ? '#94a3b8' : '#475569',
                      border: '1px solid #cbd5e1', borderRadius: '0 0 3px 3px', cursor: 'pointer',
                    }}>{m % 12 === 0 ? noteName(m) : ''}</button>
                );
              })}
            </div>
            <div style={{ minHeight: 18, marginTop: 8, color: busy.startsWith('mislukt') ? '#b91c1c' : '#334155' }}>{busy}</div>
            <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 0 }}>
              Wat je hier hoort is dezelfde msfa-kern als op de Teensy. De bewerking geldt voor
              álle DX7-modules in de patch, tot je op <em>edit uit</em> drukt.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Kleine envelope-schets: L4 → R1/L1 → R2/L2 → R3/L3, en na loslaten R4 → L4. */
function EnvCurve({ patch, offset }: { patch: Uint8Array; offset: number }): JSX.Element {
  const W = 110, H = 30;
  const r = [0, 1, 2, 3].map((i) => patch[offset + DX7.op.rate + i] ?? 0);
  const l = [0, 1, 2, 3].map((i) => patch[offset + DX7.op.level + i] ?? 0);
  // Duur ≈ (99 − rate); genormaliseerd zodat de hele curve past.
  const durs = r.map((v) => 99 - v + 4);
  const total = durs.reduce((a, b) => a + b, 0);
  const y = (v: number): number => H - 2 - (v / 99) * (H - 4);
  let x = 1;
  const pts = [`${x},${y(l[3]!)}`];
  for (let i = 0; i < 4; i++) { x += (durs[i]! / total) * (W - 2); pts.push(`${x.toFixed(1)},${y(l[i]!)}`); }
  return (
    <svg width={W} height={H} style={{ background: '#f1f5f9', borderRadius: 3, display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth="1.5" />
    </svg>
  );
}
