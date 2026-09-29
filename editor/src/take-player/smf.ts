// smf — Standard MIDI Files lezen voor de pianorol en de spelers.
// Zuiver en zonder afhankelijkheden (geen DOM, geen React), zodat het ook
// server-side en onder node te testen is.
//
// parseSmf: SMF type 0 en 1, running status, tempowissels (ook uit andere
// sporen dan het eerste), SMPTE-tijdbasis, maatsoort, markers
// (loopStart/loopEnd, "MMB tel 1"). Meta en SysEx verder overgeslagen; alle
// sporen samengevoegd tot één lijst in ms.
//
// Bron: MusicBrain-editor (editor/src/take-player). Gevendord in Imprint:
// zie README.md.

export interface SmfEvent { t: number; bytes: number[] }
export interface ParsedSmf {
  events: SmfEvent[]; durationMs: number; name?: string; tracks: number;
  /** Eerste tempo in het bestand (120 als er geen staat): voor de tellen in de pianorol. */
  bpm: number;
  /** Maatsoort-teller (4 als er geen staat). */
  beatsPerBar: number;
  /** Uit markers "loopStart"/"loopEnd" (ms), als beide er staan. */
  loop?: { start: number; end: number };
  /** Uit marker "MMB tel 1" (ms): waar tel 1 van het raster ligt. */
  tel1Ms?: number;
}

export class SmfError extends Error {}

export function parseSmf(buf: Uint8Array): ParsedSmf {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number): string => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.length < 14 || tag(0) !== 'MThd') throw new SmfError('Geen MIDI-bestand (MThd ontbreekt).');
  const hdrLen = dv.getUint32(4);
  const ntrks = dv.getUint16(10);
  const division = dv.getUint16(12);
  let p = 8 + hdrLen;

  // Ruwe events per spoor in ticks, tempo's apart.
  type Raw = { tick: number; bytes: number[]; order: number };
  const raws: Raw[] = [];
  const tempos: { tick: number; us: number }[] = [];
  let name: string | undefined;
  let timeSigNum: number | undefined;
  const markers: { tick: number; text: string }[] = [];
  let order = 0;
  let endTick = 0;
  for (let tr = 0; tr < ntrks && p + 8 <= buf.length; tr++) {
    const len = dv.getUint32(p + 4);
    const isTrk = tag(p) === 'MTrk';
    let q = p + 8;
    const end = Math.min(buf.length, q + len);
    p = q + len;
    if (!isTrk) { tr--; continue; }
    let tick = 0, running = 0;
    const vl = (): number => { let v = 0, c = 0; do { c = buf[q++] ?? 0; v = (v << 7) | (c & 0x7F); } while (c & 0x80 && q < end); return v; };
    while (q < end) {
      tick += vl();
      let s = buf[q]!;
      if (s < 0x80) { s = running; } else { q++; }
      if (s === 0xFF) {
        const type = buf[q++]!; const n = vl();
        if (type === 0x51 && n === 3) tempos.push({ tick, us: (buf[q]! << 16) | (buf[q + 1]! << 8) | buf[q + 2]! });
        if (type === 0x58 && n >= 1 && timeSigNum === undefined) timeSigNum = buf[q]!;
        if (type === 0x06) markers.push({ tick, text: new TextDecoder().decode(buf.slice(q, q + n)).trim() });
        if (type === 0x03 && name === undefined && tr === 0) name = new TextDecoder().decode(buf.slice(q, q + n));
        if (type === 0x2F) { endTick = Math.max(endTick, tick); }
        q += n; continue;
      }
      if (s === 0xF0 || s === 0xF7) { q += vl(); continue; }
      if (s < 0x80) break;                       // kapot spoor: niet verder gokken
      running = s;
      const hi = s & 0xF0;
      const n = hi === 0xC0 || hi === 0xD0 ? 1 : 2;
      const bytes = [s, buf[q]! & 0x7F];
      if (n === 2) bytes.push(buf[q + 1]! & 0x7F);
      q += n;
      raws.push({ tick, bytes, order: order++ });
      endTick = Math.max(endTick, tick);
    }
  }

  // Ticks → ms met de tempokaart.
  const toMs = (() => {
    if (division & 0x8000) {
      const fps = 256 - (division >> 8), tpf = division & 0xFF;
      return (tick: number): number => (tick / (fps * tpf)) * 1000;
    }
    const ppq = division || 480;
    const map = tempos.sort((a, b) => a.tick - b.tick);
    return (tick: number): number => {
      let ms = 0, lastTick = 0, us = 500_000;
      for (const tp of map) {
        if (tp.tick >= tick) break;
        ms += ((tp.tick - lastTick) * us) / ppq / 1000;
        lastTick = tp.tick; us = tp.us;
      }
      return ms + ((tick - lastTick) * us) / ppq / 1000;
    };
  })();

  raws.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const events = raws.map((r) => ({ t: toMs(r.tick), bytes: r.bytes }));
  const firstTempo = [...tempos].sort((a, b) => a.tick - b.tick)[0]?.us ?? 500_000;
  const markerMs = (text: string): number | undefined => {
    const m = markers.find((x) => x.text.toLowerCase() === text.toLowerCase());
    return m ? toMs(m.tick) : undefined;
  };
  const ls = markerMs('loopStart'), le = markerMs('loopEnd'), tel1 = markerMs('MMB tel 1');
  return {
    events, durationMs: toMs(endTick), name: name || undefined, tracks: ntrks,
    bpm: division & 0x8000 ? 120 : 60_000_000 / firstTempo, beatsPerBar: timeSigNum || 4,
    ...(ls !== undefined && le !== undefined && le > ls ? { loop: { start: ls, end: le } } : {}),
    ...(tel1 !== undefined ? { tel1Ms: tel1 } : {}),
  };
}

export interface LoopRegion { start: number; end: number }

/** Maatraster van de pianorol: tempo, waar tel 1 valt, tellen per maat. */
export interface Grid { bpm: number; offsetMs: number; beatsPerBar: number }

/** Noten als balkjes voor de pianorol: van noot-aan tot noot-uit. */
export interface NoteSpan { note: number; start: number; end: number; vel: number }

export function noteSpans(f: ParsedSmf): NoteSpan[] {
  const open = new Map<number, { start: number; vel: number }>();   // (kanaal<<7|noot)
  const out: NoteSpan[] = [];
  for (const e of f.events) {
    const s = e.bytes[0]! & 0xF0, key = ((e.bytes[0]! & 0x0F) << 7) | e.bytes[1]!;
    const on = s === 0x90 && (e.bytes[2] ?? 0) > 0;
    if (on || s === 0x80 || s === 0x90) {
      const o = open.get(key);
      if (o) { out.push({ note: key & 0x7F, start: o.start, end: e.t, vel: o.vel }); open.delete(key); }
      if (on) open.set(key, { start: e.t, vel: e.bytes[2]! });
    }
  }
  for (const [key, o] of open) out.push({ note: key & 0x7F, start: o.start, end: f.durationMs, vel: o.vel });
  return out.sort((a, b) => a.start - b.start);
}

/** Controllers voor de laag onder de noten: stappen (t, 0..1) per soort. */
export type CtlKind = 'mod' | 'at' | 'bend' | 'cc';
export interface CtlSeries { kind: CtlKind; label: string; points: { t: number; v: number }[] }

export function controllerSeries(f: ParsedSmf): CtlSeries[] {
  const by = new Map<string, CtlSeries>();
  const add = (key: string, kind: CtlKind, label: string, t: number, v: number): void => {
    let s = by.get(key);
    if (!s) { s = { kind, label, points: [] }; by.set(key, s); }
    s.points.push({ t, v });
  };
  for (const e of f.events) {
    const b = e.bytes, s = b[0]! & 0xF0;
    if (s === 0xB0 && b[1] === 1) add('mod', 'mod', 'Modwheel', e.t, b[2]! / 127);
    else if (s === 0xB0 && b[1]! < 120) add(`cc${b[1]}`, 'cc', `CC ${b[1]}`, e.t, b[2]! / 127);
    else if (s === 0xD0) add('at', 'at', 'Aftertouch', e.t, b[1]! / 127);
    else if (s === 0xA0) add('at', 'at', 'Aftertouch', e.t, b[2]! / 127);
    else if (s === 0xE0) add('bend', 'bend', 'Pitch bend', e.t, (((b[2]! << 7) | b[1]!) / 16383));
  }
  const order: CtlKind[] = ['mod', 'at', 'bend', 'cc'];
  return [...by.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
}
