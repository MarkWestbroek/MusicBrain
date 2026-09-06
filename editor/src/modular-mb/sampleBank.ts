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
