// De song van een stijl als Standard MIDI File (type 1, één spoor per stem),
// om in een DAW (Logic) verder te bouwen. Geen opname: het bestand wordt
// uitgerekend uit dezelfde tabellen als de patch (style.ts) en een port van
// de Grids-kaart (firmware/app-modular-brain/src/GridsModule.h), zodat het
// precies de noten zijn die de machine speelt.
//
// Wat er wél en niet in zit:
// - Drums: Grids per stap nagerekend (x/y/density van de sectie, de fill in
//   de laatste maat van een sectie), zonder chaos (de perturbatie werkt per
//   patroonronde en die begint nooit in een fill-maat). Accent → velocity.
// - Bas: per kick, uit EUCLID, of de glijder (bass 'slide'): een gebonden
//   noot (overlap) waar de slide-rij hoog staat, een korte stoot waar hij
//   laag staat. Een mono-synth met legato en ±60 ms glide speelt dat na.
// - Toetsen: het motief (per Grids-accent), de akkoorden (CHORD + lijn +
//   sustainpedaal) of de riff (SYNTHEX op het toetsen-Euclid).
// - Pad: één noot per maat of het hele akkoord, gate = de Div-puls.
// - A/B-maten zoals de bedieningslaag ze speelt (oneven maat = B).
// - Geen swing (die zit in de klokmodule; in de DAW zelf te zetten), geen
//   Autopilot-mutes, geen DROP.

import { abChanges } from './performance';
import { euclidHits, type Change, type ModuleKey, type Section, type SectionRole, type Style } from './style';

export const SONG_PPQ = 480;
const S16 = SONG_PPQ / 4;
const BAR = 16 * S16;

/** De liedvorm: welke secties, hoeveel maten elk. */
export interface SongPart { role: SectionRole; bars: number }
/** I V H V H B V H E (style.ts): intro 4, vers 16, hook 8, break 4, outro 4. */
export const DEFAULT_FORM: readonly SongPart[] = [
  { role: 'intro', bars: 4 }, { role: 'verse', bars: 16 }, { role: 'hook', bars: 8 },
  { role: 'verse', bars: 16 }, { role: 'hook', bars: 8 }, { role: 'break', bars: 4 },
  { role: 'verse', bars: 16 }, { role: 'hook', bars: 8 }, { role: 'outro', bars: 4 },
];

export interface SongOptions {
  form?: readonly SongPart[];
  /** De fill-standen in de laatste maat van elke sectie behalve de intro (zoals de Autopilot). */
  fills?: boolean;
}

interface Note { t: number; dur: number; note: number; vel: number }
type Ctrl = Partial<Record<ModuleKey, Record<string, number | boolean>>>;

/** MIDI-nootnummers (ch 10 voor de drums). */
export const DRUM_NOTES = { kick: 36, snare: 38, hat: 42 } as const;
export const TRACKS = ['KICK', 'SNARE', 'HATS', 'BASS', 'KEYS', 'PAD'] as const;
export type SongTrack = (typeof TRACKS)[number];

// ── Grids-kaart (port van GridsModule.h; eigen patroondata, MIT) ──────────
const G_BASE = [
  [255,10,20,30, 96,12,36,20, 208,10,24,40, 88,12,60,22, 232,10,20,30, 92,12,44,20, 216,10,28,36, 84,14,70,26],
  [12,8,20,10, 30,12,40,16, 255,12,24,18, 40,14,60,24, 16,10,24,12, 36,12,50,20, 248,16,40,24, 70,20,90,40],
  [190,14,120,16, 200,14,130,18, 190,14,120,16, 200,16,130,20, 190,14,124,16, 200,16,130,18, 190,16,124,18, 200,18,140,24],
];
const G_BUSY = [
  [255,20,60,90, 160,24,110,60, 224,30,130,60, 150,30,120,70, 240,20,60,100, 160,26,110,60, 224,40,140,70, 150,40,160,90],
  [20,30,60,50, 80,40,90,60, 255,50,90,60, 100,60,120,70, 30,36,70,50, 90,44,100,60, 250,60,110,70, 130,80,160,100],
  [220,120,170,120, 210,120,170,130, 215,120,170,124, 210,124,174,134, 220,120,170,124, 210,124,170,130, 215,124,174,130, 210,130,180,150],
];
const G_ALT = [
  [255,12,30,100, 40,20,170,40, 60,24,190,50, 90,26,120,36, 235,14,40,110, 44,22,160,40, 70,30,180,60, 100,30,130,60],
  [16,12,40,24, 210,20,60,30, 90,20,200,30, 60,24,90,40, 20,14,44,26, 215,22,70,30, 100,26,190,40, 80,30,120,60],
  [40,12,60,14, 235,16,70,18, 44,12,64,16, 235,16,74,20, 40,14,60,14, 235,16,70,20, 44,14,66,18, 235,20,90,30],
];
const f32 = Math.fround;
function hash8(cx: number, cy: number, k: number): number {
  let h = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + Math.imul(k, 2246822519)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return h & 0xFF;
}
/** Prioriteit 0..255 van stap `s` voor instrument `instr` (0 bd, 1 sd, 2 hh) op (x, y). */
export function gridsLevel(instr: number, s: number, x: number, y: number): number {
  const a = G_BASE[instr]![s]!, b = G_BUSY[instr]![s]!, c = G_ALT[instr]![s]!;
  let v = f32(a + f32(f32(b - a) * x));
  v = f32(v + f32(f32(c - v) * f32(y * 0.6)));
  const gx = f32(x * 4), gy = f32(y * 4);
  const cx = Math.trunc(gx), cy = Math.trunc(gy);
  const fx = f32(gx - cx), fy = f32(gy - cy);
  const k = instr * 37 + s;
  const n00 = hash8(cx, cy, k), n10 = hash8(cx + 1, cy, k), n01 = hash8(cx, cy + 1, k), n11 = hash8(cx + 1, cy + 1, k);
  const n = f32(f32(f32(n00 + f32((n10 - n00) * fx)) * f32(1 - fy)) + f32(f32(n01 + f32((n11 - n01) * fx)) * fy));
  v = f32(v + f32(f32(n - 128) * 0.45));
  return Math.trunc(Math.min(255, Math.max(0, v)));
}
/** Slaat Grids op stap `s`? Geeft de velocity (accent bij niveau > 192), anders 0. */
export function gridsHit(instr: number, s: number, x: number, y: number, density: number): number {
  const level = gridsLevel(instr, s, x, y);
  const threshold = 255 - Math.trunc(density * 255);
  if (level <= threshold) return 0;
  return level > 192 ? 115 : 92;
}

// ── de song ───────────────────────────────────────────────────────────────
const num = (ctrl: Ctrl, m: ModuleKey, c: string, d: number): number => {
  const v = ctrl[m]?.[c];
  return typeof v === 'number' ? v : d;
};
const apply = (ctrl: Ctrl, changes: readonly Change[]): void => {
  for (const ch of changes) (ctrl[ch.module] ??= {})[ch.control] = ch.value;
};
const CHORDS: readonly (readonly number[])[] = [
  [0, 4, 7, 12], [0, 3, 7, 12], [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10], [0, 2, 7, 12], [0, 5, 7, 12], [0, 3, 6, 9], [0, 4, 8, 12], [0, 7, 12, 19],
];
const chordNotes = (ctrl: Ctrl, root: number): number[] => {
  const type = CHORDS[Math.max(0, Math.min(9, Math.round(num(ctrl, 'chord', 'chord', 1))))]!;
  const inv = Math.round(num(ctrl, 'chord', 'inv', 0));
  return type.map((semi, i) => root + semi + (i < inv ? 12 : 0));
};
/** Noot `i` (0-based, per slag in de maat) van een sequencer met de s1-kopie (`seqLine`). */
const seqNote = (ctrl: Ctrl, m: 'bassSeq' | 'motifSeq', i: number): number => {
  const length = Math.max(1, Math.round(num(ctrl, m, 'length', 16)));
  return num(ctrl, m, 'root', 60) + num(ctrl, m, `s${((i + 1) % length) + 1}`, 0);
};
const msTicks = (ms: number, bpm: number): number => Math.max(1, Math.round((ms / 60_000) * bpm * SONG_PPQ));

/** Alle noten van de song, per spoor, in ticks (SONG_PPQ per kwart). */
export function songNotes(style: Style, opts: SongOptions = {}): Record<SongTrack, Note[]> & { markers: { t: number; text: string }[]; bars: number; sustain: { t: number; on: boolean }[] } {
  const form = opts.form ?? DEFAULT_FORM;
  const fills = opts.fills ?? true;
  const notes: Record<SongTrack, Note[]> = { KICK: [], SNARE: [], HATS: [], BASS: [], KEYS: [], PAD: [] };
  const markers: { t: number; text: string }[] = [];
  const sustain: { t: number; on: boolean }[] = [];
  const sectionOf = (role: SectionRole): Section | undefined => style.sections.find((s) => s.role === role);

  // De maten op een rij: sectie, standen (sound + sectie + A/B + fill), stems.
  type Bar = { sec: Section; ctrl: Ctrl; stems: Section['stems'] };
  const bars: Bar[] = [];
  for (const part of form) {
    const sec = sectionOf(part.role) ?? (part.role === 'outro' ? sectionOf('break') : undefined);
    if (!sec) continue;
    markers.push({ t: bars.length * BAR, text: `${sec.name} · ${sec.chord}` });
    for (let i = 0; i < part.bars; i++) {
      const abs = bars.length;
      const ctrl: Ctrl = {};
      apply(ctrl, style.sound);
      apply(ctrl, sec.changes);
      apply(ctrl, abChanges(sec, abs));
      if (fills && i === part.bars - 1 && sec.role !== 'intro') apply(ctrl, style.fill);
      bars.push({ sec, ctrl, stems: sec.stems });
    }
  }
  const bpm = style.bpm;
  const push = (track: SongTrack, n: Note): void => { notes[track].push(n); };

  // Drums: Grids loopt vrij vanaf stap 0 (geen reset in de patch).
  const stepTicks = style.gridsClock === 'x2' ? 2 * S16 : S16;
  const stepsPerBar = BAR / stepTicks;
  const accents: number[][] = bars.map(() => []);
  const kicks: number[][] = bars.map(() => []);
  bars.forEach((bar, b) => {
    const x = num(bar.ctrl, 'grids', 'x', 0.5), y = num(bar.ctrl, 'grids', 'y', 0.5);
    const dens = [num(bar.ctrl, 'grids', 'bd', 0.75), num(bar.ctrl, 'grids', 'sd', 0.6), num(bar.ctrl, 'grids', 'hh', 0.7)];
    const on: Array<[SongTrack, boolean, number]> = [['KICK', bar.stems.kick, DRUM_NOTES.kick], ['SNARE', bar.stems.snare, DRUM_NOTES.snare], ['HATS', bar.stems.hats, DRUM_NOTES.hat]];
    for (let k = 0; k < stepsPerBar; k++) {
      const s = (b * stepsPerBar + k) & 31;
      const t = b * BAR + k * stepTicks;
      let accent = false;
      for (let i = 0; i < 3; i++) {
        const vel = gridsHit(i, s, x, y, dens[i]!);
        if (!vel) continue;
        if (vel > 100) accent = true;
        const [track, enabled, note] = on[i]!;
        if (enabled) push(track, { t, dur: S16 / 2, note, vel });
        if (i === 0) kicks[b]!.push(t);
      }
      if (accent) accents[b]!.push(t);
    }
  });

  // Bas.
  bars.forEach((bar, b) => {
    if (!bar.stems.bass) return;
    const t0 = b * BAR;
    if (style.bass === 'kick') {
      kicks[b]!.forEach((t, i) => push('BASS', { t, dur: S16, note: seqNote(bar.ctrl, 'bassSeq', i), vel: 100 }));
      return;
    }
    const hits = euclidHits(changesOf(bar.ctrl, 'bassGate'), 'bassGate', style.bass === 'slide' ? [1] : [1, 2, 3]);
    if (style.bass === 'euclid') {
      const dur = msTicks((num(bar.ctrl, 'bassSeq', 'gate', 0.95) * 1000) / num(bar.ctrl, 'bassSeq', 'rate', 4), bpm);
      hits.forEach((k, i) => push('BASS', { t: t0 + k * S16, dur, note: seqNote(bar.ctrl, 'bassSeq', i), vel: 100 }));
      return;
    }
    // Glijder: de slide-rij per zestiende (s1 = zestiende 15, s(k+2) = zestiende k).
    const row = Array.from({ length: 16 }, (_, k) => num(bar.ctrl, 'slideSeq', k === 15 ? 's1' : `s${k + 2}`, 0) >= 6);
    const stab = msTicks((num(bar.ctrl, 'bassSeq', 'gate', 0.95) * 1000) / num(bar.ctrl, 'bassSeq', 'rate', 10), bpm);
    hits.forEach((k, i) => {
      const note = seqNote(bar.ctrl, 'bassSeq', i);
      const t = t0 + k * S16;
      // Rij laag op de slag: een korte stoot. Hoog: de noot blijft tot de rij
      // laag gaat of tot de volgende slag (gebonden: iets overlappen).
      let end = t + stab;
      if (row[k]) {
        let j = k + 1;
        while (j < 16 && row[j] && !hits.includes(j)) j++;
        // Gestopt op een slag in de boog (rij nog hoog): gebonden, dus iets
        // overlappen; gestopt omdat de rij laag ging: precies daar los.
        end = j >= 16 ? t0 + BAR + S16 / 8 : t0 + j * S16 + (row[j] ? S16 / 8 : 0);
      }
      const prev = notes.BASS[notes.BASS.length - 1];
      // Dezelfde toon in de boog: de slag doet niets, de noot loopt door.
      if (prev && prev.note === note && prev.t + prev.dur > t) { prev.dur = end - prev.t; return; }
      push('BASS', { t, dur: end - t, note, vel: 100 });
    });
  });

  // Toetsen.
  bars.forEach((bar, b) => {
    if (!bar.stems.motif) return;
    const t0 = b * BAR;
    const gate = msTicks((num(bar.ctrl, 'motifSeq', 'gate', 0.5) * 1000) / num(bar.ctrl, 'motifSeq', 'rate', 2), bpm);
    if (style.keys === 'motif') {
      accents[b]!.forEach((t, i) => push('KEYS', { t, dur: gate, note: seqNote(bar.ctrl, 'motifSeq', i), vel: 96 }));
    } else if (style.keys === 'riff') {
      euclidHits(changesOf(bar.ctrl, 'keysGate'), 'keysGate', [1]).forEach((k, i) => push('KEYS', { t: t0 + k * S16, dur: gate, note: seqNote(bar.ctrl, 'motifSeq', i), vel: 110 }));
    } else {
      // Akkoorden op kanaal 1 (CHORD op de grondtoon van het pad of C4), de
      // lijn op kanaal 2, het sustainpedaal hoog tot 90 % van de maat.
      const root = style.chordRoot === 'pad' ? num(bar.ctrl, 'padSeq', 'root', 60) + num(bar.ctrl, 'padSeq', `s${(b % Math.max(1, Math.round(num(bar.ctrl, 'padSeq', 'length', 2)))) + 1}`, 0) : 60;
      const hold = Math.round(num(bar.ctrl, 'clock', 'width', 0.5) * num(bar.ctrl, 'clock', 'div', 16) * S16);
      euclidHits(changesOf(bar.ctrl, 'keysGate'), 'keysGate', [1]).forEach((k) => {
        for (const n of chordNotes(bar.ctrl, root)) push('KEYS', { t: t0 + k * S16, dur: Math.max(S16, hold - k * S16), note: n, vel: 90 });
      });
      euclidHits(changesOf(bar.ctrl, 'keysGate'), 'keysGate', [2]).forEach((k, i) => push('KEYS', { t: t0 + k * S16, dur: gate, note: seqNote(bar.ctrl, 'motifSeq', i), vel: 96 }));
      sustain.push({ t: t0, on: true }, { t: t0 + hold, on: false });
    }
  });

  // Pad: de padsequencer stapt per maat (zonder reset), gate = de Div-puls.
  if (style.pad) {
    bars.forEach((bar, b) => {
      if (!bar.stems.motif) return;
      const div = Math.max(1, Math.round(num(bar.ctrl, 'clock', 'div', 16)));
      const width = num(bar.ctrl, 'clock', 'width', 0.5);
      const t0 = b * BAR;
      const length = Math.max(1, Math.round(num(bar.ctrl, 'padSeq', 'length', 2)));
      const root = num(bar.ctrl, 'padSeq', 'root', 60) + num(bar.ctrl, 'padSeq', `s${(b % length) + 1}`, 0);
      const pitches = style.padVoices === 'chord' && style.chordRoot === 'pad' ? chordNotes(bar.ctrl, root) : [root];
      // Welke stukken van deze maat de Div-gate hoog is (periode div zestienden, width hoog).
      for (let k = 0; k < 16; k++) {
        const phase = ((b * 16 + k) % div) / div;
        if (phase >= width) continue;
        const t = t0 + k * S16;
        for (const n of pitches) {
          const prev = notes.PAD.find((p) => p.note === n && p.t + p.dur === t);
          if (prev) prev.dur += S16; else push('PAD', { t, dur: S16, note: n, vel: 80 });
        }
      }
    });
  }

  return { ...notes, markers, bars: bars.length, sustain };
}

const changesOf = (ctrl: Ctrl, m: ModuleKey): Change[] => Object.entries(ctrl[m] ?? {}).map(([control, value]) => ({ module: m, control, value: value as number }));

/** De song als SMF type 1: spoor 0 tempo en markers, dan één spoor per stem. */
export function encodeSongMidi(style: Style, opts: SongOptions = {}): Uint8Array {
  const song = songNotes(style, opts);
  const enc = new TextEncoder();
  const varLen = (n: number): number[] => { let v = Math.max(0, Math.round(n)); const out = [v & 0x7F]; while ((v >>= 7) > 0) out.unshift((v & 0x7F) | 0x80); return out; };
  type Ev = { t: number; order: number; bytes: number[] };
  const trackBytes = (evs: Ev[], name: string, endTick: number): number[] => {
    const nm = [...enc.encode(name)];
    const out: number[] = [0, 0xFF, 0x03, ...varLen(nm.length), ...nm];
    let last = 0;
    for (const e of evs.sort((a, b) => a.t - b.t || a.order - b.order)) {
      const t = Math.max(last, Math.round(e.t));
      out.push(...varLen(t - last), ...e.bytes); last = t;
    }
    out.push(...varLen(Math.max(0, endTick - last)), 0xFF, 0x2F, 0x00);
    return out;
  };
  const end = song.bars * BAR;
  const us = Math.round(60_000_000 / style.bpm);
  const tempo: Ev[] = [
    { t: 0, order: 0, bytes: [0xFF, 0x51, 0x03, (us >> 16) & 0xFF, (us >> 8) & 0xFF, us & 0xFF] },
    { t: 0, order: 1, bytes: [0xFF, 0x58, 0x04, 4, 2, 24, 8] },
    { t: 0, order: 2, bytes: [0xFF, 0x59, 0x02, ...keySig(style.key)] },
    ...song.markers.map((m, i) => ({ t: m.t, order: 10 + i, bytes: [0xFF, 0x06, ...varLen(enc.encode(m.text).length), ...enc.encode(m.text)] })),
  ];
  const channel: Record<SongTrack, number> = { KICK: 9, SNARE: 9, HATS: 9, BASS: 0, KEYS: 1, PAD: 2 };
  const tracks: number[][] = [trackBytes(tempo, `${style.name} · ${style.bpm}`, end)];
  for (const name of TRACKS) {
    const ch = channel[name];
    const evs: Ev[] = [];
    for (const n of song[name]) {
      const note = Math.max(0, Math.min(127, n.note));
      evs.push({ t: n.t, order: 1, bytes: [0x90 | ch, note, n.vel] });
      evs.push({ t: n.t + n.dur, order: 0, bytes: [0x80 | ch, note, 0] });
    }
    if (name === 'KEYS') for (const s of song.sustain) evs.push({ t: s.t, order: s.on ? 2 : -1, bytes: [0xB0 | ch, 64, s.on ? 127 : 0] });
    tracks.push(trackBytes(evs, name, end));
  }
  const size = 14 + tracks.reduce((n, t) => n + 8 + t.length, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string): void => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'MThd'); dv.setUint32(4, 6); dv.setUint16(8, 1); dv.setUint16(10, tracks.length); dv.setUint16(12, SONG_PPQ);
  let p = 14;
  for (const t of tracks) { str(p, 'MTrk'); dv.setUint32(p + 4, t.length); out.set(t, p + 8); p += 8 + t.length; }
  return out;
}

/** Toonsoort-meta uit de naam van de stijl ("F♯ minor" → 3 kruisen, mineur). */
function keySig(key: string): [number, number] {
  const m = /^([A-G])([♯#♭b]?)\s*(minor|major)?/i.exec(key);
  if (!m) return [0, 0];
  const minor = (m[3] ?? '').toLowerCase() === 'minor' ? 1 : 0;
  const base: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
  let sf = base[m[1]!.toUpperCase()] ?? 0;
  if (m[2] === '♯' || m[2] === '#') sf += 7; else if (m[2] === '♭' || m[2] === 'b') sf -= 7;
  if (minor) sf -= 3;
  return [sf & 0xFF, minor];
}
