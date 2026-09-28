// LEDjes op de uitgangen van MIDI-In: lichten op als de sim-engine een
// bericht voor die poort doorgeeft. Mouseover geeft de laatste waarde;
// klikken opent de MIDI-monitor. Leest de 'patch'-stroom van midiMonitor,
// dus alleen wat de sim speelt (niet wat rechtstreeks naar de Teensy gaat).

import { useEffect, useState } from 'react';
import { midiMonitor, noteName, type PortActivity } from './midiMonitor';
import { openMidiMonitor } from './MidiMonitorWindow';
import type { ControlValue, Port } from '../types';

const FLASH_MS = 160;

interface LedInfo { t: number; steady?: boolean; text: string }

/** Laatste activiteit per MIDI-In-uitgang; null = nog nooit. */
export function portActivity(portId: string, a: PortActivity, cc1: number, cc2: number, now: number): LedInfo | null {
  const ago = (t: number): string => {
    const s = (now - t) / 1000;
    return s < 1 ? 'zojuist' : s < 60 ? `${s.toFixed(0)} s geleden` : `${(s / 60).toFixed(0)} min geleden`;
  };
  const cc = (n: number, label: string): LedInfo | null => {
    const v = a.cc.get(n);
    return v ? { t: v.t, text: `${label} (CC ${n}) = ${v.value} · ${ago(v.t)}` } : { t: -Infinity, text: `${label}: nog niets ontvangen (CC ${n})` };
  };
  switch (portId) {
    case 'pitch': return a.noteOn ? { t: a.noteOn.t, text: `Laatste noot ${noteName(a.noteOn.note)} (${a.noteOn.note}) · ${ago(a.noteOn.t)}` } : null;
    case 'gate': {
      const held = [...a.held].sort((x, y) => x - y);
      return { t: a.noteOn?.t ?? -Infinity, steady: held.length > 0, text: held.length ? `Gate open: ${held.map(noteName).join(' ')}` : 'Gate dicht' };
    }
    case 'vel': return a.noteOn ? { t: a.noteOn.t, text: `Velocity ${a.noteOn.vel} (${noteName(a.noteOn.note)}) · ${ago(a.noteOn.t)}` } : null;
    case 'rel': return a.noteOff ? { t: a.noteOff.t, text: `Release ${a.noteOff.rel || '— (niet gemeld)'} (${noteName(a.noteOff.note)}) · ${ago(a.noteOff.t)}` } : null;
    case 'press': return a.press
      ? { t: a.press.t, text: `${a.press.note === undefined ? 'Aftertouch (kanaal)' : `Poly AT ${noteName(a.press.note)}`} = ${a.press.value} · ${ago(a.press.t)}` }
      : { t: -Infinity, text: 'Aftertouch: nog niets ontvangen' };
    case 'cv_mod': return cc(1, 'Modwheel');
    case 'cv_bend': return a.bend ? { t: a.bend.t, text: `Pitch bend ${a.bend.value > 0 ? '+' : ''}${a.bend.value} · ${ago(a.bend.t)}` } : { t: -Infinity, text: 'Pitch bend: nog niets ontvangen' };
    case 'cv_cc1': return cc(cc1, 'CC1');
    case 'cv_cc2': return cc(cc2, 'CC2');
    default: return null;
  }
}

function useMonitorTick(): number {
  const [, setV] = useState(0);
  useEffect(() => {
    let raf = 0, fade: ReturnType<typeof setTimeout> | null = null;
    const bump = (): void => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setV((x) => x + 1); });
      if (fade) clearTimeout(fade);
      fade = setTimeout(() => setV((x) => x + 1), FLASH_MS + 20);   // LED weer uit
    };
    const unsub = midiMonitor.subscribe(bump);
    return () => { unsub(); if (raf) cancelAnimationFrame(raf); if (fade) clearTimeout(fade); };
  }, []);
  return performance.now();
}

export function MidiPortLeds({ ports, placements, controlState, r }: {
  ports: Port[];
  placements: Record<string, { x: number; y: number } | undefined>;
  controlState?: Record<string, ControlValue>;
  r: number;
}): JSX.Element {
  const now = useMonitorTick();
  const cc1 = Number(controlState?.cc1Num ?? 74), cc2 = Number(controlState?.cc2Num ?? 71);
  return (
    <g>
      {ports.filter((p) => p.direction === 'out').map((p) => {
        const pl = placements[p.id];
        if (!pl) return null;
        const info = portActivity(p.id, midiMonitor.activity, cc1, cc2, now);
        if (info === null && !['pitch', 'vel', 'rel'].includes(p.id)) return null;
        const on = !!info && (info.steady || now - info.t < FLASH_MS);
        const x = pl.x - r - 0.9, y = pl.y - r - 1.0;
        return (
          <g key={p.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openMidiMonitor(); }}>
            <title>{`${p.name}: ${info?.text ?? 'nog niets ontvangen'}\nKlik: MIDI-monitor`}</title>
            <circle cx={x} cy={y} r={1.3} fill="transparent" />
            <circle cx={x} cy={y} r={0.75} fill="#0a0a0a" />
            <circle cx={x} cy={y} r={0.55} fill={on ? '#22c55e' : '#1f3b2a'}
              style={on ? { filter: 'drop-shadow(0 0 0.8px #22c55e)' } : undefined} />
          </g>
        );
      })}
    </g>
  );
}
