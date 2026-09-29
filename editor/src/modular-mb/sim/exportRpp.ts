// exportRpp — een take als Reaper-project (.RPP, platte tekst).
//
// Twee tracks: de wav als audio-item (verwijst naar het bestand naast het
// project, dus download ze in dezelfde map) en de MIDI als item met de events
// erin (Reaper-formaat "E delta b1 b2 b3", 960 ticks per kwart op het
// projecttempo). Tempo en maatsoort komen in de kop; het lusvenster wordt de
// tijdselectie met lus aan.

import type { MidiEvent } from './midiRecorder';

export interface RppInput {
  name: string;
  bpm: number;
  beatsPerBar: number;
  lengthMs: number;
  /** Bestandsnaam van de wav naast het project; weg = geen audiotrack. */
  wavFile?: string;
  midi?: MidiEvent[];
  loop?: { start: number; end: number } | null;
}

const PPQ = 960;
const q = (s: string): string => `"${s.replace(/"/g, "'")}"`;
const sec = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(6);
const hex = (n: number): string => (n & 0xFF).toString(16).padStart(2, '0');

export function buildRpp(inp: RppInput): string {
  const bpm = Math.max(20, Math.min(400, inp.bpm || 120));
  const L: string[] = [];
  L.push('<REAPER_PROJECT 0.1 "7.0/MusicBrain" 0');
  L.push(`  TEMPO ${bpm} ${Math.max(1, Math.round(inp.beatsPerBar || 4))} 4`);
  if (inp.loop && inp.loop.end > inp.loop.start) {
    L.push('  LOOP 1');
    L.push(`  SELECTION ${sec(inp.loop.start)} ${sec(inp.loop.end)}`);
  }
  if (inp.wavFile) {
    L.push('  <TRACK', `    NAME ${q(`${inp.name} audio`)}`, '    <ITEM', '      POSITION 0',
      `      LENGTH ${sec(inp.lengthMs)}`, `      NAME ${q(inp.wavFile)}`, '      <SOURCE WAVE',
      `        FILE ${q(inp.wavFile)}`, '      >', '    >', '  >');
  }
  if (inp.midi && inp.midi.length) {
    const ticksPerMs = (PPQ * bpm) / 60_000;
    L.push('  <TRACK', `    NAME ${q(`${inp.name} MIDI`)}`, '    <ITEM', '      POSITION 0',
      `      LENGTH ${sec(inp.lengthMs)}`, `      NAME ${q(inp.name)}`, '      <SOURCE MIDI', `        HASDATA 1 ${PPQ} QN`);
    const evs = [...inp.midi].filter((e) => e.status >= 0x80 && e.status < 0xF0).sort((a, b) => a.t - b.t);
    let last = 0;
    for (const e of evs) {
      const tick = Math.max(last, Math.round(Math.max(0, e.t) * ticksPerMs));
      L.push(`        E ${tick - last} ${hex(e.status)} ${hex(e.d1)} ${hex(e.d2)}`);
      last = tick;
    }
    // Einde van het item: "all notes off" op de lengte.
    const end = Math.max(last, Math.round(inp.lengthMs * ticksPerMs));
    L.push(`        E ${end - last} b0 7b 00`, '      >', '    >', '  >');
  }
  L.push('>');
  return L.join('\n') + '\n';
}
