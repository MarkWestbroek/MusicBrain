// takeEdit — een take (wav + mid) samen bewerken, zuiver en los te testen.
//
//   parseWav    — PCM 16/24/32-bit en float32, elk aantal kanalen; andere
//                 chunks (LIST, bext, …) worden overgeslagen.
//   wavPeaks    — min/max per kolom voor de golfvorm onder de pianorol.
//   cropTake    — audio en MIDI samen bijsnijden tot [start, end) ms, met
//                 korte fades tegen klikken. Noten die over de rand lopen
//                 worden afgekapt (noot-aan op 0, noot-uit op het einde); de
//                 stand van controllers, bend en aftertouch vóór de start
//                 komt op tijd 0 ("chase"). Tel 1 en lus schuiven mee.

import type { ParsedSmf } from '../../take-player/smf';
import type { MidiEvent as RecEvent } from './midiRecorder';

export interface WavData {
  sampleRate: number;
  channels: Float32Array[];
  /** Bit-diepte zoals gelezen (16/24/32) en of het float was. */
  bits: number;
  float: boolean;
}

export class WavError extends Error {}

export function parseWav(buf: Uint8Array): WavData {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number): string => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new WavError('Geen WAV-bestand.');
  let p = 12;
  let fmt: { format: number; ch: number; rate: number; bits: number } | null = null;
  let data: { off: number; len: number } | null = null;
  while (p + 8 <= buf.length) {
    const id = tag(p), len = dv.getUint32(p + 4, true), body = p + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      const ch = dv.getUint16(body + 2, true), rate = dv.getUint32(body + 4, true), bits = dv.getUint16(body + 14, true);
      if (format === 0xFFFE && len >= 26) format = dv.getUint16(body + 24, true);   // WAVE_FORMAT_EXTENSIBLE: subformat
      fmt = { format, ch, rate, bits };
    } else if (id === 'data') {
      data = { off: body, len: Math.min(len, buf.length - body) };
    }
    p = body + len + (len & 1);
  }
  if (!fmt || !data) throw new WavError('WAV zonder fmt- of data-blok.');
  const { format, ch, rate, bits } = fmt;
  const float = format === 3;
  if (!(format === 1 || float) || ![16, 24, 32].includes(bits) || (float && bits !== 32)) {
    throw new WavError(`WAV-formaat niet ondersteund (formaat ${format}, ${bits} bit).`);
  }
  const bytes = bits / 8, frames = Math.floor(data.len / (bytes * ch));
  const channels = Array.from({ length: ch }, () => new Float32Array(frames));
  let q = data.off;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      let v: number;
      if (float) v = dv.getFloat32(q, true);
      else if (bits === 16) v = dv.getInt16(q, true) / 32768;
      else if (bits === 24) { const x = buf[q]! | (buf[q + 1]! << 8) | (buf[q + 2]! << 16); v = ((x << 8) >> 8) / 8388608; }
      else v = dv.getInt32(q, true) / 2147483648;
      channels[c]![i] = v;
      q += bytes;
    }
  }
  return { sampleRate: rate, channels, bits, float };
}

/** Min/max per kolom (over alle kanalen), `cols` kolommen. */
export function wavPeaks(w: WavData, cols: number): Float32Array {
  const n = w.channels[0]?.length ?? 0;
  const out = new Float32Array(cols * 2);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((c / cols) * n), b = Math.max(a + 1, Math.floor(((c + 1) / cols) * n));
    let lo = 0, hi = 0;
    for (const ch of w.channels) for (let i = a; i < b && i < n; i++) { const v = ch[i]!; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[c * 2] = lo; out[c * 2 + 1] = hi;
  }
  return out;
}

export function wavDurationMs(w: WavData): number {
  return ((w.channels[0]?.length ?? 0) / w.sampleRate) * 1000;
}

/** Audio bijsnijden tot [startMs, endMs) met een lineaire fade in/uit van `fadeMs`. */
export function cropWav(w: WavData, startMs: number, endMs: number, fadeMs = 5): WavData {
  const n = w.channels[0]?.length ?? 0;
  const a = Math.max(0, Math.min(n, Math.round((startMs / 1000) * w.sampleRate)));
  const b = Math.max(a, Math.min(n, Math.round((endMs / 1000) * w.sampleRate)));
  const fade = Math.min(Math.floor((b - a) / 2), Math.round((fadeMs / 1000) * w.sampleRate));
  const channels = w.channels.map((ch) => {
    const out = ch.slice(a, b);
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      out[i]! *= g;
      out[out.length - 1 - i]! *= g;
    }
    return out;
  });
  return { ...w, channels };
}

export interface CroppedMidi {
  events: RecEvent[];
  lengthMs: number;
  /** Tel 1 en lus, verschoven; weg als ze buiten het stuk vallen. */
  tel1Ms?: number;
  loop?: { start: number; end: number };
}

/** MIDI bijsnijden tot [startMs, endMs); tijden worden relatief aan startMs. */
export function cropMidi(f: ParsedSmf, startMs: number, endMs: number, marks: { tel1Ms?: number; barMs?: number; loop?: { start: number; end: number } | null } = {}): CroppedMidi {
  const len = Math.max(0, endMs - startMs);
  const out: RecEvent[] = [];
  const held = new Map<number, { status: number; note: number; vel: number }>();   // (kanaal<<7|noot)
  const chase = new Map<string, number[]>();
  const push = (t: number, b: number[]): void => { out.push({ t, status: b[0]!, d1: b[1] ?? 0, d2: b[2] ?? 0 }); };
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    for (const b of chase.values()) push(0, b);
    for (const h of held.values()) push(0, [h.status, h.note, h.vel]);
  };
  for (const e of f.events) {
    const b = e.bytes, s = b[0]! & 0xF0, key = ((b[0]! & 0x0F) << 7) | (b[1] ?? 0);
    const on = s === 0x90 && (b[2] ?? 0) > 0, off = s === 0x80 || (s === 0x90 && (b[2] ?? 0) === 0);
    if (e.t < startMs) {
      if (on) held.set(key, { status: b[0]!, note: b[1]!, vel: b[2]! });
      else if (off) held.delete(key);
      else if (s === 0xB0) chase.set(`c${b[0]}:${b[1]}`, b);
      else if (s === 0xE0 || s === 0xD0 || s === 0xC0) chase.set(`s${b[0]}`, b);
      continue;
    }
    start();
    if (e.t >= endMs) break;
    push(e.t - startMs, b);
    if (on) held.set(key, { status: b[0]!, note: b[1]!, vel: b[2]! });
    else if (off) held.delete(key);
  }
  start();
  // Wat op het einde nog klinkt: noot-uit op de nieuwe lengte.
  for (const h of held.values()) push(len, [0x80 | (h.status & 0x0F), h.note, 0]);
  const res: CroppedMidi = { events: out, lengthMs: len };
  // Het maatraster blijft op de muziek liggen: tel 1 schuift binnen de maat mee.
  const t1 = (marks.tel1Ms ?? 0) - startMs;
  if (marks.barMs && marks.barMs > 0) { const m = ((t1 % marks.barMs) + marks.barMs) % marks.barMs; if (m > 0.5 && marks.barMs - m > 0.5) res.tel1Ms = m; }
  else if (t1 >= 0 && t1 < len && t1 > 0) res.tel1Ms = t1;
  if (marks.loop) {
    const ls = Math.max(marks.loop.start, startMs) - startMs, le = Math.min(marks.loop.end, endMs) - startMs;
    if (le - ls >= 20) res.loop = { start: ls, end: le };
  }
  return res;
}
