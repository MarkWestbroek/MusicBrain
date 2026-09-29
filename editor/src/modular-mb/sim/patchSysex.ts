// patchSysex — MusicBrain-patches als SysEx (.syx, of ingebed in een .mid).
//
// Bericht (alle bytes na F0 zijn 7-bit):
//   F0 7D 4D 42 <ver> <cmd> <seqHi> <seqLo> <totHi> <totLo> <data…> <sum> F7
//   7D        = fabrikant-ID voor niet-commercieel/eigen gebruik (MMA);
//   4D 42     = "MB", zodat andere 7D-gebruikers ons herkennen/negeren;
//   ver       = formaatversie (1);
//   cmd       = 01 editor-patch (patch-JSON zoals de editor hem bewaart),
//               02 firmwareconfig (de JSON die de Teensy via de link krijgt);
//   seq/tot   = volgnummer en aantal berichten, 14-bit (2× 7 bit);
//   data      = een stuk van de gepakte inhoud (max. CHUNK bytes);
//   sum       = Roland-stijl: (128 − som(data) mod 128) mod 128.
// Inhoud: UTF-8-JSON → deflate-raw → [lengte 4 bytes BE] + gecomprimeerd →
// 7-bit gepakt (per 7 bytes: 1 byte met de hoogste bits, dan 7 × 7 bit).
// Berichten blijven ≤ 252 bytes: de USB-MIDI-sysexbuffer van de Teensy is 290.
// Zie doc/plans/sysex-patch.md.

export const MB_MANUFACTURER = 0x7D;
export const MB_SIG = [0x4D, 0x42] as const;
export const MB_SYSEX_VERSION = 1;
export const SYSEX_CMD = { editorPatch: 0x01, firmwareConfig: 0x02 } as const;
export type SysexCmd = typeof SYSEX_CMD[keyof typeof SYSEX_CMD];
export const CHUNK = 240;

export class SysexError extends Error {}

/** 8 → 7 bit: per groep van 7 bytes eerst een byte met de hoogste bits (bit i = byte i). */
export function pack7(raw: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 7) {
    const grp = raw.subarray(i, i + 7);
    let msb = 0;
    grp.forEach((b, j) => { if (b & 0x80) msb |= 1 << j; });
    out.push(msb, ...[...grp].map((b) => b & 0x7F));
  }
  return Uint8Array.from(out);
}

export function unpack7(packed: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < packed.length; i += 8) {
    const msb = packed[i]!;
    for (let j = 0; j < 7 && i + 1 + j < packed.length; j++) out.push(packed[i + 1 + j]! | (((msb >> j) & 1) << 7));
  }
  return Uint8Array.from(out);
}

async function through(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([data.slice()]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const checksum = (d: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i]!;
  return (128 - (s % 128)) % 128;
};

/** JSON → SysEx-berichten (elk F0 … F7). */
export async function encodePatchSysex(cmd: SysexCmd, json: string): Promise<Uint8Array[]> {
  const comp = await through(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  const body = new Uint8Array(4 + comp.length);
  new DataView(body.buffer).setUint32(0, comp.length);
  body.set(comp, 4);
  const packed = pack7(body);
  const total = Math.max(1, Math.ceil(packed.length / CHUNK));
  if (total > 16383) throw new SysexError('Patch te groot voor SysEx.');
  const msgs: Uint8Array[] = [];
  for (let seq = 0; seq < total; seq++) {
    const data = packed.subarray(seq * CHUNK, (seq + 1) * CHUNK);
    msgs.push(Uint8Array.from([
      0xF0, MB_MANUFACTURER, ...MB_SIG, MB_SYSEX_VERSION, cmd,
      (seq >> 7) & 0x7F, seq & 0x7F, (total >> 7) & 0x7F, total & 0x7F,
      ...data, checksum(data), 0xF7,
    ]));
  }
  return msgs;
}

/** Losse berichten uit een .syx (of andere bytes): alles van F0 tot en met F7. */
export function splitSysex(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xF0) start = i;
    else if (bytes[i] === 0xF7 && start >= 0) { out.push(bytes.slice(start, i + 1)); start = -1; }
  }
  return out;
}

export function isMusicBrainSysex(m: Uint8Array): boolean {
  return m[0] === 0xF0 && m[1] === MB_MANUFACTURER && m[2] === MB_SIG[0] && m[3] === MB_SIG[1];
}

/** Alle MusicBrain-inhoud per commando uit een reeks berichten; andere SysEx wordt overgeslagen. */
export async function decodePatchSysex(messages: readonly Uint8Array[]): Promise<Map<SysexCmd, string>> {
  const groups = new Map<number, { total: number; parts: Map<number, Uint8Array> }>();
  for (const m of messages) {
    if (!isMusicBrainSysex(m) || m.length < 13) continue;
    if (m[4] !== MB_SYSEX_VERSION) throw new SysexError(`Onbekende SysEx-versie ${m[4]}.`);
    const cmd = m[5]!, seq = (m[6]! << 7) | m[7]!, total = (m[8]! << 7) | m[9]!;
    const data = m.subarray(10, m.length - 2);
    if (checksum(data) !== m[m.length - 2]) throw new SysexError(`Controlegetal klopt niet (bericht ${seq + 1} van ${total}).`);
    let g = groups.get(cmd);
    if (!g) { g = { total, parts: new Map() }; groups.set(cmd, g); }
    g.parts.set(seq, data);
  }
  const out = new Map<SysexCmd, string>();
  for (const [cmd, g] of groups) {
    if (g.parts.size !== g.total) throw new SysexError(`Onvolledig: ${g.parts.size} van ${g.total} berichten.`);
    const packed = new Uint8Array([...Array(g.total).keys()].reduce((n, i) => n + g.parts.get(i)!.length, 0));
    let o = 0;
    for (let i = 0; i < g.total; i++) { packed.set(g.parts.get(i)!, o); o += g.parts.get(i)!.length; }
    const body = unpack7(packed);
    const len = new DataView(body.buffer, body.byteOffset).getUint32(0);
    const json = await through(body.subarray(4, 4 + len), new DecompressionStream('deflate-raw'));
    out.set(cmd as SysexCmd, new TextDecoder().decode(json));
  }
  return out;
}

/** Alle berichten achter elkaar, als inhoud van een .syx-bestand. */
export function joinSysex(msgs: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(msgs.reduce((n, m) => n + m.length, 0));
  let o = 0;
  for (const m of msgs) { out.set(m, o); o += m.length; }
  return out;
}

/**
 * Live SysEx verzamelen (Web MIDI, of uit een .mid): geef elk bericht; is een
 * MusicBrain-reeks compleet, dan komt de inhoud terug. Vreemde SysEx en
 * onvolledige reeksen geven null. Een nieuwe reeks (seq 0) begint opnieuw.
 */
export class SysexCollector {
  private groups = new Map<number, { total: number; msgs: Uint8Array[] }>();

  async feed(m: Uint8Array): Promise<{ cmd: SysexCmd; json: string } | null> {
    if (!isMusicBrainSysex(m) || m.length < 13) return null;
    const cmd = m[5]!, seq = (m[6]! << 7) | m[7]!, total = (m[8]! << 7) | m[9]!;
    let g = this.groups.get(cmd);
    if (seq === 0 || !g || g.total !== total) { g = { total, msgs: [] }; this.groups.set(cmd, g); }
    if (seq !== g.msgs.length) { this.groups.delete(cmd); return null; }   // gat in de reeks
    g.msgs.push(m);
    if (g.msgs.length < g.total) return null;
    this.groups.delete(cmd);
    const got = await decodePatchSysex(g.msgs);
    const json = got.get(cmd as SysexCmd);
    return json === undefined ? null : { cmd: cmd as SysexCmd, json };
  }
}

/** Fabrikanten die je in de praktijk tegenkomt (1- en 3-byte-ID's). */
const MANUFACTURERS: Record<string, string> = {
  '01': 'Sequential', '04': 'Moog', '06': 'Lexicon', '07': 'Kurzweil', '0f': 'Ensoniq', '10': 'Oberheim',
  '18': 'E-mu', '40': 'Kawai', '41': 'Roland', '42': 'Korg', '43': 'Yamaha', '44': 'Casio', '47': 'Akai',
  '7d': 'eigen gebruik', '7e': 'universeel (non-realtime)', '7f': 'universeel (realtime)',
  '002032': 'Behringer', '00206b': 'Arturia', '002029': 'Novation', '00201f': 'TC Electronic',
  '000066': 'Mackie', '002033': 'Nord (Clavia)', '00202b': 'Native Instruments', '000106': 'Elektron',
};

/** Korte omschrijving van een SysEx-bericht, voor de MIDI-monitor. */
export function describeSysex(m: Uint8Array | readonly number[]): string {
  const b = m as ArrayLike<number>;
  if (b.length < 3) return `${b.length} bytes`;
  if (b[1] === MB_MANUFACTURER && b[2] === MB_SIG[0] && b[3] === MB_SIG[1] && b.length >= 13) {
    const cmd = b[5], seq = ((b[6]! << 7) | b[7]!) + 1, tot = (b[8]! << 7) | b[9]!;
    const what = cmd === SYSEX_CMD.editorPatch ? 'editor-patch' : cmd === SYSEX_CMD.firmwareConfig ? 'firmwareconfig' : `cmd ${cmd}`;
    return `MusicBrain ${what}, deel ${seq} van ${tot}`;
  }
  const hex = (x: number): string => x.toString(16).padStart(2, '0');
  const id = b[1] === 0 && b.length >= 4 ? hex(b[1]!) + hex(b[2]!) + hex(b[3]!) : hex(b[1]!);
  const who = MANUFACTURERS[id] ?? `fabrikant ${id.toUpperCase()}`;
  return `${who}, ${b.length} bytes`;
}
