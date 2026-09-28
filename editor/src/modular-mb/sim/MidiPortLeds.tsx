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

/** Zelfde maat als de Act-LED (medium). */
const LED_R = 1.1;

function Led({ x, y, on }: { x: number; y: number; on: boolean }): JSX.Element {
  return (
    <>
      <circle cx={x} cy={y} r={LED_R + 0.9} fill="transparent" />
      <circle cx={x} cy={y} r={LED_R + 0.4} fill="#0a0a0a" />
      <circle cx={x} cy={y} r={LED_R} fill={on ? '#22c55e' : '#333'}
        style={on ? { filter: `drop-shadow(0 0 ${LED_R * 1.4}px #22c55e)` } : undefined} />
    </>
  );
}

export function MidiPortLeds({ ports, placements, controlState, r, act }: {
  ports: Port[];
  placements: Record<string, { x: number; y: number } | undefined>;
  controlState?: Record<string, ControlValue>;
  r: number;
  /** Plek van de Act-LED op het paneel: knippert bij elk bericht naar de patch. */
  act?: { x: number; y: number };
}): JSX.Element {
  const now = useMonitorTick();
  const list = midiMonitor.list();
  let lastPatch: (typeof list)[number] | undefined;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.dir === 'patch') { lastPatch = list[i]; break; }
  const actOn = !!lastPatch && now - lastPatch.t < FLASH_MS;
  const cc1 = Number(controlState?.cc1Num ?? 74), cc2 = Number(controlState?.cc2Num ?? 71);
  return (
    <g>
      {act && (
        <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openMidiMonitor(); }}>
          <title>{`MIDI-activiteit naar de patch${lastPatch ? ` · laatste: ${((now - lastPatch.t) / 1000).toFixed(1)} s geleden` : ' · nog niets'}
Klik: MIDI-monitor`}</title>
          <Led x={act.x} y={act.y} on={actOn} />
        </g>
      )}
      {ports.filter((p) => p.direction === 'out').map((p) => {
        const pl = placements[p.id];
        if (!pl) return null;
        const info = portActivity(p.id, midiMonitor.activity, cc1, cc2, now);
        if (info === null && !['pitch', 'vel', 'rel'].includes(p.id)) return null;
        const on = !!info && (info.steady || now - info.t < FLASH_MS);
        // Midden boven de jack, vrij van het uitgangspijltje rechtsboven.
        const x = pl.x, y = pl.y - r - LED_R - 1.2;
        return (
          <g key={p.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openMidiMonitor(); }}>
            <title>{`${p.name}: ${info?.text ?? 'nog niets ontvangen'}\nKlik: MIDI-monitor`}</title>
            <Led x={x} y={y} on={on} />
          </g>
        );
      })}
    </g>
  );
}
