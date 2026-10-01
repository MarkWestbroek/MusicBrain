// 📱 Telefoon als bedieningsvlak (modlink): elke as van pad-phone.html wordt
// aftertouch, pitch bend, modwheel of een CC voor de sim, en desgewenst ook
// voor de Teensy. Aftertouch zonder AT-keyboard: punt 1 omhoog = meer druk,
// loslaten = terug naar 0.

import { useEffect, useRef, useState } from 'react';
import { getEngine } from './engineSingleton';
import { isConnected, sendMidiCC, sendMidiPressure, sendMidiBend } from '../teensyLink';
import {
  ModlinkHost, defaultMap, midiFor, slotAxisOf, labelsFor, axisName, CC_PER_SURFACE,
  type AxisMap, type AxisTarget, type MidiOut,
} from './modlinkHost';

const ON_KEY = 'mmb.modlink.on';
const MAP_KEY = 'mmb.modlink.map.v1';

function loadMaps(): Record<number, AxisMap[]> {
  try { const o = JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') as Record<number, AxisMap[]>; return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}

export function ModlinkPanel(): JSX.Element {
  const [on, setOnRaw] = useState<boolean>(() => { try { return localStorage.getItem(ON_KEY) === '1'; } catch { return false; } });
  const setOn = (v: boolean): void => { setOnRaw(v); try { localStorage.setItem(ON_KEY, v ? '1' : '0'); } catch { /* geen opslag */ } };
  const [maps, setMapsRaw] = useState<Record<number, AxisMap[]>>(loadMaps);
  const mapsRef = useRef(maps); mapsRef.current = maps;
  const [toTeensy, setToTeensy] = useState(true);
  const toTeensyRef = useRef(toTeensy); toTeensyRef.current = toTeensy;
  const [, setTick] = useState(0);
  const hostRef = useRef<ModlinkHost | null>(null);
  const live = useRef(new Map<string, number>());          // "slot:axis" → laatste waarde 0..1
  const lastSent = useRef(new Map<string, string>());       // dubbele berichten overslaan

  const mapFor = (slot: number): AxisMap[] => mapsRef.current[slot] ?? defaultMap();
  const setMaps = (next: Record<number, AxisMap[]>): void => {
    setMapsRaw(next); mapsRef.current = next;
    try { localStorage.setItem(MAP_KEY, JSON.stringify(next)); } catch { /* geen opslag */ }
    sendLabels();
  };
  function sendLabels(): void {
    const h = hostRef.current;
    if (h) h.sendLabels(labelsFor(h.surfaces().map((p) => p.slot), mapFor));
  }

  function out(m: MidiOut): void {
    const e = getEngine();
    const teensy = toTeensyRef.current && isConnected();
    if (m.kind === 'cc') { e.controlChange(m.cc, m.value); if (teensy) void sendMidiCC(m.cc, m.value); }
    else if (m.kind === 'at') { e.pressure(m.value); if (teensy) void sendMidiPressure(m.value); }
    else { e.pitchBend(m.value); if (teensy) void sendMidiBend(m.value); }
  }

  useEffect(() => {
    if (!on) return undefined;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/modlink`;
    let raf = 0;
    const h = new ModlinkHost(url, {
      value: ({ cc, v, up }) => {
        const sa = slotAxisOf(cc);
        if (!sa || sa.axis >= CC_PER_SURFACE) return;
        const key = `${sa.slot}:${sa.axis}`;
        const m = mapFor(sa.slot)[sa.axis];
        if (!m) return;
        const msg = midiFor(m, v, up);
        live.current.set(key, up && m.spring ? (m.target.kind === 'bend' ? 0.5 : 0) : v);
        if (msg) {
          const sig = JSON.stringify(msg);
          if (lastSent.current.get(key) !== sig) { lastSent.current.set(key, sig); out(msg); }
        }
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((x) => x + 1); });
      },
      change: () => { sendLabels(); setTick((x) => x + 1); },
    });
    hostRef.current = h;
    return () => { h.close(); hostRef.current = null; if (raf) cancelAnimationFrame(raf); };
  }, [on]);   // eslint-disable-line react-hooks/exhaustive-deps

  const h = hostRef.current;
  const surfaces = h?.surfaces() ?? [];
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const phoneUrl = local ? null : `${location.protocol}//${location.host}/pad-phone.html`;
  const fs: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', margin: 0 };

  function setTarget(slot: number, i: number, t: AxisTarget): void {
    const m = [...mapFor(slot)];
    const spring = t.kind === 'at' || t.kind === 'bend' ? true : t.kind === 'none' ? false : m[i]!.spring;
    m[i] = { target: t, spring };
    setMaps({ ...mapsRef.current, [slot]: m });
  }
  function setSpring(slot: number, i: number, spring: boolean): void {
    const m = [...mapFor(slot)];
    m[i] = { ...m[i]!, spring };
    setMaps({ ...mapsRef.current, [slot]: m });
  }
  const kindOf = (t: AxisTarget): string => t.kind === 'cc' ? (t.cc === 1 ? 'mod' : t.cc === 11 ? 'expr' : 'cc') : t.kind;

  return (
    <fieldset style={fs}>
      <legend style={{ fontSize: 12, color: '#475569', padding: '0 4px' }}>📱 Telefoon als bedieningsvlak</legend>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> aan
        </label>
        {on && (
          <span style={{ color: h?.state === 'verbonden' ? '#15803d' : '#b45309' }}>
            {h?.state === 'verbonden'
              ? `verbonden · ${surfaces.length ? surfaces.map((s) => `${s.name} (vlak ${s.slot})`).join(', ') : 'nog geen telefoon'}`
              : 'geen doorgeefluik: werkt alleen met de lokale dev-server (npm run dev)'}
          </span>
        )}
        {on && (
          <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Ook naar de Teensy sturen als die verbonden is">
            <input type="checkbox" checked={toTeensy} onChange={(e) => setToTeensy(e.target.checked)} /> ook naar de Teensy
          </label>
        )}
      </div>
      {on && (
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          Op de telefoon: {phoneUrl ? <code>{phoneUrl}</code> : <>het <em>Network</em>-adres dat <code>npm run dev</code> toont, met <code>/pad-phone.html</code> erachter</>}.
          Op de telefoon kies je XY of faders (↕ staand, ↔ liggend). Omhoog of naar rechts = meer. ↺ = terug naar rust bij loslaten.
        </div>
      )}
      {on && surfaces.map((s) => (
        <table key={s.id} style={{ borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
          <caption style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 2 }}>{s.name} · vlak {s.slot}</caption>
          <tbody>
            {mapFor(s.slot).map((m, i) => {
              const v = live.current.get(`${s.slot}:${i}`);
              return (
                <tr key={i}>
                  <td style={{ padding: '2px 8px 2px 0', color: '#475569', whiteSpace: 'nowrap' }}>{axisName(i)}</td>
                  <td style={{ padding: '2px 6px' }}>
                    <select value={kindOf(m.target)} aria-label={`Bestemming ${axisName(i)}`} onChange={(e) => {
                      const k = e.target.value;
                      setTarget(s.slot, i, k === 'none' ? { kind: 'none' } : k === 'at' ? { kind: 'at' } : k === 'bend' ? { kind: 'bend' }
                        : k === 'mod' ? { kind: 'cc', cc: 1 } : k === 'expr' ? { kind: 'cc', cc: 11 }
                        : { kind: 'cc', cc: m.target.kind === 'cc' && m.target.cc !== 1 && m.target.cc !== 11 ? m.target.cc : 74 });
                    }}>
                      <option value="none">— vrij —</option>
                      <option value="at">Aftertouch</option>
                      <option value="bend">Pitch bend</option>
                      <option value="mod">Modwheel (CC 1)</option>
                      <option value="expr">Expressie (CC 11)</option>
                      <option value="cc">CC …</option>
                    </select>
                    {m.target.kind === 'cc' && kindOf(m.target) === 'cc' && (
                      <input type="number" min={0} max={127} value={m.target.cc} aria-label={`CC-nummer ${axisName(i)}`} style={{ width: 52, marginLeft: 4 }}
                        onChange={(e) => { const n = Math.max(0, Math.min(127, Number(e.target.value) || 0)); setTarget(s.slot, i, { kind: 'cc', cc: n }); }} />
                    )}
                  </td>
                  <td style={{ padding: '2px 6px' }}>
                    <label title="Terug naar rust bij loslaten" style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                      <input type="checkbox" checked={m.spring} disabled={m.target.kind === 'none'} onChange={(e) => setSpring(s.slot, i, e.target.checked)} /> ↺
                    </label>
                  </td>
                  <td style={{ padding: '2px 0 2px 6px' }}>
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 90, height: 6, background: '#e5e7eb', borderRadius: 3, verticalAlign: 'middle' }}>
                      <span style={{ display: 'block', width: `${Math.round((v ?? 0) * 100)}%`, height: 6, background: '#0ea5e9', borderRadius: 3 }} />
                    </span>
                    <span style={{ marginLeft: 6, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{v === undefined ? '' : v.toFixed(2)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </fieldset>
  );
}
