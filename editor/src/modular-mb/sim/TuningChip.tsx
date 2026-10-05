// "A=440" in de kop: de persoonlijke stemtoon (sim/tuning.ts). Eén keuze-
// lijstje; de instelling gaat naar de engine, naar de Teensy (controlPoke
// `a4` op elke MIDI-IN van de actieve patch) en wordt onthouden.

import { useEffect, useState, type CSSProperties } from 'react';

import { getEngine } from './engineSingleton';
import { MIDIIN_TYPE } from './simGraph';
import { A4_MAX, A4_MIN, A4_PRESETS, loadA4, saveA4, subscribeA4 } from './tuning';
import { sendControlPoke } from '../teensyLink';
import { getProject, useModularProject } from '../store';

const OTHER = 'other';
const PATCH = 'patch';
const CUSTOM = 'custom';   // de huidige, niet-preset waarde (alleen tonen)

/** Zet de stemtoon op de MIDI-IN's van de actieve patch op de Teensy (no-op zonder verbinding). */
function pokeTeensy(a4: number | null): void {
  const p = getProject();
  const patch = p.patches.find((x) => x.id === p.activePatchId);
  if (!patch) return;
  const inPatch = new Set(patch.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]));
  for (const m of p.modules) {
    if (m.typeId !== MIDIIN_TYPE || !inPatch.has(m.id)) continue;
    const v = a4 ?? Number(patch.controlState[m.id]?.a4 ?? 440);
    void sendControlPoke(m.id, 'a4', v);
  }
}

export function TuningChip({ style }: { style?: CSSProperties }): JSX.Element {
  const [a4, setA4] = useState<number | null>(() => loadA4());
  const project = useModularProject();
  // Engine en Teensy volgen de instelling; bij een andere patch opnieuw poken.
  useEffect(() => {
    getEngine().setTuningA4(a4);
    pokeTeensy(a4);
  }, [a4, project.activePatchId]);
  useEffect(() => subscribeA4(() => setA4(loadA4())), []);

  const value = a4 === null ? PATCH : A4_PRESETS.includes(a4 as (typeof A4_PRESETS)[number]) ? String(a4) : CUSTOM;
  function choose(v: string): void {
    if (v === PATCH) { saveA4(null); return; }
    if (v === CUSTOM) return;
    if (v === OTHER) {
      const raw = window.prompt(`Stemtoon A4 in Hz (${A4_MIN}–${A4_MAX}):`, String(a4 ?? 440));
      const n = raw === null ? NaN : Number(raw.replace(',', '.'));
      if (Number.isFinite(n) && n >= A4_MIN && n <= A4_MAX) saveA4(n);
      return;
    }
    saveA4(Number(v));
  }
  return (
    <select value={value} onChange={(e) => choose(e.target.value)}
      title="Stemtoon: persoonlijk, voor elke patch (MIDI-IN schuift alle V/Oct mee; A432 = −31,8 cent). 'patch' = de A4-knop van de MIDI-IN van de patch."
      style={{ ...style, fontWeight: a4 !== null && a4 !== 440 ? 700 : 400, color: a4 !== null && a4 !== 440 ? '#b45309' : undefined }}>
      <option value={PATCH}>A = patch</option>
      {A4_PRESETS.map((hz) => <option key={hz} value={String(hz)}>A = {hz}</option>)}
      {value === CUSTOM && <option value={CUSTOM}>A = {a4}</option>}
      <option value={OTHER}>anders…</option>
    </select>
  );
}
