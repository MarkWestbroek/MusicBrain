// sampleBank — schrijft het `.mmbs`-formaat (zie
// firmware/lib/mmb-dsp/mmb_dsp/sample_bank.h): één bestand met alle samples
// én de keymap, zodat de Teensy het zonder parser in PSRAM kan zetten.
//
// Naamgeving: `mmb` is de prefix van dit deelproject (Modular Music Brain),
// en de vierde letter zegt welke soort bank het is — gelijk aan de vierde
// magic-byte, zodat naam en inhoud niet uiteen kunnen lopen:
//   .mmbs / "MMBS"  samplebank   ·   .mmbw / .mmbd  gereserveerd
//
// Layout (little-endian):
//   BankHeader  44 bytes   "MMBS", versie, aantal slots/zones, naam[32]
//   SlotHeader  16 × slots frameOffset, frames, channels, rate
//   ZoneRecord  40 × zones slot, key/vel-bereik, root, gain, pan, loop, decay
//   int16       data       alle samples achter elkaar, interleaved

import type { WasmZone } from './runtime';

export interface BankSlot {
  /** Interleaved int16, `channels` waarden per frame. */
  data: Int16Array;
  channels: number;
  rate: number;
  name?: string;
}

export function buildBank(name: string, slots: BankSlot[], zones: WasmZone[]): ArrayBuffer {
  const headerSize = 44;
  const slotTable = 16 * slots.length;
  const zoneTable = 40 * zones.length;
  const dataSamples = slots.reduce((s, x) => s + x.data.length, 0);
  const buf = new ArrayBuffer(headerSize + slotTable + zoneTable + dataSamples * 2);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // ── header ──
  bytes.set([0x4d, 0x4d, 0x42, 0x53], 0);           // "MMBS" — samplebank
  dv.setUint32(4, 1, true);                          // versie
  dv.setUint32(8, slots.length, true);
  dv.setUint32(12, zones.length, true);
  const nameBytes = new TextEncoder().encode(name).subarray(0, 31);
  bytes.set(nameBytes, 16);

  // ── slot-tabel; offsets in frames vanaf het begin van het datablok ──
  let off = headerSize;
  let frameOffset = 0;
  for (const s of slots) {
    const frames = Math.floor(s.data.length / s.channels);
    dv.setUint32(off, frameOffset, true);
    dv.setUint32(off + 4, frames, true);
    dv.setUint16(off + 8, s.channels, true);
    dv.setUint16(off + 10, 0, true);
    dv.setFloat32(off + 12, s.rate, true);
    off += 16;
    frameOffset += frames;
  }

  // ── zone-tabel ──
  for (const z of zones) {
    dv.setUint16(off, z.slot, true);
    dv.setUint8(off + 2, z.lowKey);   dv.setUint8(off + 3, z.highKey);
    dv.setUint8(off + 4, z.lowVel);   dv.setUint8(off + 5, z.highVel);
    dv.setUint8(off + 6, z.loopMode); dv.setUint8(off + 7, 0);
    dv.setFloat32(off + 8, z.root, true);
    dv.setFloat32(off + 12, z.tuneCents, true);
    dv.setFloat32(off + 16, z.gain, true);
    dv.setFloat32(off + 20, z.pan, true);
    dv.setUint32(off + 24, z.loopStart, true);
    dv.setUint32(off + 28, z.loopEnd, true);
    dv.setFloat32(off + 32, z.decay, true);
    dv.setFloat32(off + 36, z.release, true);
    off += 40;
  }

  // ── sampledata ──
  const out = new Int16Array(buf, off);
  let p = 0;
  for (const s of slots) { out.set(s.data, p); p += s.data.length; }
  return buf;
}

/** Leesbare samenvatting voor de UI. */
export function bankSummary(slots: BankSlot[], zones: WasmZone[]): string {
  const frames = slots.reduce((s, x) => s + Math.floor(x.data.length / x.channels), 0);
  const bytes = slots.reduce((s, x) => s + x.data.length * 2, 0);
  const ch = slots.length ? slots[0]!.channels : 1;
  const rate = slots.length ? slots[0]!.rate : 44100;
  return `${slots.length} samples · ${zones.length} zones · ${(frames / rate).toFixed(1)} s ` +
    `${ch === 1 ? 'mono' : ch === 2 ? 'stereo' : ch + ' kanalen'} · ${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * Lees een `.mmbs` terug — de tegenhanger van `buildBank`, zodat een bank die
 * je bewaard hebt (of die `make-test-bank.mjs` schreef) weer in de simulator
 * te laden is. De Teensy doet dit niet: die leest het bestand rechtstreeks van
 * SD naar PSRAM. Hier kopiëren we het datablok, want een Int16Array wil
 * uitgelijnd zijn en de tabellen ervoor garanderen dat niet.
 */
export function parseBank(buf: ArrayBuffer): { name: string; slots: BankSlot[]; zones: WasmZone[] } {
  if (buf.byteLength < 44) throw new Error('te klein voor een .mmbs');
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'MMBS') throw new Error(`geen samplebank (magic "${magic}", verwacht "MMBS")`);
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`bankversie ${version} wordt niet ondersteund`);
  const slotCount = dv.getUint32(8, true);
  const zoneCount = dv.getUint32(12, true);
  const nameEnd = bytes.subarray(16, 48).indexOf(0);
  const name = new TextDecoder().decode(bytes.subarray(16, 16 + (nameEnd < 0 ? 31 : nameEnd)));

  let off = 44;
  const table: { frameOffset: number; frames: number; channels: number; rate: number }[] = [];
  for (let i = 0; i < slotCount; i++) {
    table.push({
      frameOffset: dv.getUint32(off, true),
      frames:      dv.getUint32(off + 4, true),
      channels:    dv.getUint16(off + 8, true) || 1,
      rate:        dv.getFloat32(off + 12, true) || 44100,
    });
    off += 16;
  }
  const zones: WasmZone[] = [];
  for (let i = 0; i < zoneCount; i++) {
    zones.push({
      slot:      dv.getUint16(off, true),
      lowKey:    dv.getUint8(off + 2),  highKey: dv.getUint8(off + 3),
      lowVel:    dv.getUint8(off + 4),  highVel: dv.getUint8(off + 5),
      loopMode:  dv.getUint8(off + 6),
      root:      dv.getFloat32(off + 8, true),
      tuneCents: dv.getFloat32(off + 12, true),
      gain:      dv.getFloat32(off + 16, true),
      pan:       dv.getFloat32(off + 20, true),
      loopStart: dv.getUint32(off + 24, true),
      loopEnd:   dv.getUint32(off + 28, true),
      decay:     dv.getFloat32(off + 32, true),
      release:   dv.getFloat32(off + 36, true),
    });
    off += 40;
  }

  const all = new Int16Array((buf.byteLength - off) >> 1);
  new Uint8Array(all.buffer).set(bytes.subarray(off, off + (all.length << 1)));
  const slots: BankSlot[] = table.map((t, i) => {
    const start = t.frameOffset * t.channels;
    const len = t.frames * t.channels;
    if (start + len > all.length) throw new Error(`slot ${i} valt buiten het bestand`);
    return { data: all.slice(start, start + len), channels: t.channels, rate: t.rate, name: `slot ${i}` };
  });
  return { name, slots, zones };
}
