// lyric/lyricBank — `.mmbl` schrijven en lezen. De layout staat in
// firmware/lib/mmb-dsp/mmb_dsp/lyric_bank.h en is daar leidend.

import { MARK_UNVOICED, type Mark, type SyllableAnalysis } from './analyze';

export const LYRIC_MAGIC = 'MMBL';
export const LYRIC_VERSION = 1;
const HEADER = 48, SYL = 40;
const FLAG_WORD_END = 0x01;

export interface LyricSyllable {
  /** int16, mono. */
  data: Int16Array;
  marks: Mark[];
  sustainStart: number;
  sustainEnd: number;
  pitchHz: number;
  wordEnd: boolean;
  text: string;
}

export interface LyricBankData {
  name: string;
  rate: number;
  syllables: LyricSyllable[];
}

function putText(u8: Uint8Array, at: number, len: number, text: string, terminate: boolean): void {
  const bytes = new TextEncoder().encode(text);
  const max = terminate ? len - 1 : len;
  u8.set(bytes.subarray(0, max), at);
}

function getText(u8: Uint8Array, at: number, len: number): string {
  let end = at;
  while (end < at + len && u8[end] !== 0) end++;
  return new TextDecoder().decode(u8.subarray(at, end));
}

export function toInt16(x: Float32Array): Int16Array {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]!));
    out[i] = Math.round(v * 32767);
  }
  return out;
}

export function fromAnalysis(name: string, syllables: SyllableAnalysis[]): LyricBankData {
  return {
    name,
    rate: syllables[0]?.rate ?? 22050,
    syllables: syllables.map((s) => ({
      data: toInt16(s.data), marks: s.marks,
      sustainStart: s.sustainStart, sustainEnd: s.sustainEnd,
      pitchHz: s.pitchHz, wordEnd: s.wordEnd, text: s.text,
    })),
  };
}

/** Schrijf een bank. De lengte is altijd even (de wasm leest hem als int16). */
export function buildLyricBank(bank: LyricBankData): ArrayBuffer {
  const numMarks = bank.syllables.reduce((n, s) => n + s.marks.length, 0);
  const frames = bank.syllables.reduce((n, s) => n + s.data.length, 0);
  const dataAt = HEADER + bank.syllables.length * SYL + numMarks * 4;
  const buf = new ArrayBuffer(dataAt + frames * 2);
  const dv = new DataView(buf), u8 = new Uint8Array(buf);

  putText(u8, 0, 4, LYRIC_MAGIC, false);
  dv.setUint32(4, LYRIC_VERSION, true);
  dv.setUint32(8, bank.syllables.length, true);
  dv.setUint32(12, numMarks, true);
  dv.setFloat32(16, bank.rate, true);
  putText(u8, 20, 28, bank.name, true);

  let frameOffset = 0, markOffset = 0;
  bank.syllables.forEach((s, i) => {
    const at = HEADER + i * SYL;
    dv.setUint32(at, frameOffset, true);
    dv.setUint32(at + 4, s.data.length, true);
    dv.setUint32(at + 8, markOffset, true);
    dv.setUint32(at + 12, s.marks.length, true);
    dv.setUint32(at + 16, s.sustainStart, true);
    dv.setUint32(at + 20, s.sustainEnd, true);
    dv.setFloat32(at + 24, s.pitchHz, true);
    dv.setUint8(at + 28, s.wordEnd ? FLAG_WORD_END : 0);
    putText(u8, at + 32, 8, s.text, false);

    const marksAt = HEADER + bank.syllables.length * SYL + markOffset * 4;
    s.marks.forEach((m, k) => {
      dv.setUint32(marksAt + k * 4, ((m.frame >>> 0) | (m.unvoiced ? MARK_UNVOICED : 0)) >>> 0, true);
    });
    const at16 = dataAt + frameOffset * 2;
    for (let k = 0; k < s.data.length; k++) dv.setInt16(at16 + k * 2, s.data[k]!, true);

    frameOffset += s.data.length;
    markOffset += s.marks.length;
  });
  return buf;
}

export class LyricBankError extends Error {}

export function parseLyricBank(buf: ArrayBuffer): LyricBankData {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  if (buf.byteLength < HEADER || getText(u8, 0, 4) !== LYRIC_MAGIC) throw new LyricBankError('Geen lyricbank (.mmbl).');
  const version = dv.getUint32(4, true);
  if (version !== LYRIC_VERSION) throw new LyricBankError(`Lyricbank versie ${version} wordt niet ondersteund.`);
  const n = dv.getUint32(8, true), numMarks = dv.getUint32(12, true);
  const rate = dv.getFloat32(16, true);
  const marksAt = HEADER + n * SYL, dataAt = marksAt + numMarks * 4;
  if (dataAt > buf.byteLength) throw new LyricBankError('Lyricbank is afgekapt.');
  const dataFrames = Math.floor((buf.byteLength - dataAt) / 2);
  const syllables: LyricSyllable[] = [];
  for (let i = 0; i < n; i++) {
    const at = HEADER + i * SYL;
    const frameOffset = dv.getUint32(at, true), frames = dv.getUint32(at + 4, true);
    const markOffset = dv.getUint32(at + 8, true), marksN = dv.getUint32(at + 12, true);
    if (frameOffset + frames > dataFrames || markOffset + marksN > numMarks) {
      throw new LyricBankError(`Lettergreep ${i} wijst buiten de bank.`);
    }
    const data = new Int16Array(frames);
    for (let k = 0; k < frames; k++) data[k] = dv.getInt16(dataAt + (frameOffset + k) * 2, true);
    const marks: Mark[] = [];
    for (let k = 0; k < marksN; k++) {
      const v = dv.getUint32(marksAt + (markOffset + k) * 4, true);
      marks.push({ frame: v & 0x7FFFFFFF, unvoiced: (v & MARK_UNVOICED) !== 0 });
    }
    syllables.push({
      data, marks,
      sustainStart: dv.getUint32(at + 16, true), sustainEnd: dv.getUint32(at + 20, true),
      pitchHz: dv.getFloat32(at + 24, true),
      wordEnd: (dv.getUint8(at + 28) & FLAG_WORD_END) !== 0,
      text: getText(u8, at + 32, 8),
    });
  }
  return { name: getText(u8, 20, 28), rate, syllables };
}

/** Eén regel per lettergreep, voor logs en de importdialoog. */
export function lyricSummary(bank: LyricBankData): string {
  const secs = bank.syllables.reduce((n, s) => n + s.data.length, 0) / bank.rate;
  const lines = bank.syllables.map((s, i) => {
    const voiced = s.marks.filter((m) => !m.unvoiced).length;
    const sus = s.sustainEnd > s.sustainStart ? `kern ${s.sustainStart}–${s.sustainEnd}` : 'geen kern';
    return `${String(i).padStart(3)} ${(s.text || '·').padEnd(8)} ${(s.data.length / bank.rate * 1000).toFixed(0).padStart(4)} ms  `
      + `${s.pitchHz > 0 ? s.pitchHz.toFixed(0).padStart(3) + ' Hz' : '  – Hz'}  ${String(voiced).padStart(3)}/${String(s.marks.length).padStart(3)} marks  ${sus}${s.wordEnd ? '  ⏎' : ''}`;
  });
  return `${bank.name}: ${bank.syllables.length} lettergrepen, ${secs.toFixed(2)} s op ${bank.rate} Hz\n${lines.join('\n')}`;
}
