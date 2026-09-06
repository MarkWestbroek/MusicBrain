// dx7Patch — het DX7-patchformaat, los van UI en audio.
//
// Twee vormen, allebei uit msfa (firmware/lib/msfa/msfa/patch.cc):
//   packed    128 bytes — zoals in een .syx-bank en in roms.bin
//   unpacked  156 bytes — wat de synth-kern leest (één byte per parameter)
//
// **Operatornummering.** In een DX7-bulkdump staan de operators achterstevoren:
// index 0 in het bestand is OP6, index 5 is OP1. msfa houdt die volgorde aan,
// dus `patch[0..20]` hoort bij OP6. De UI draait dat om, want een DX7-gebruiker
// denkt in OP1..OP6. Gebruik `opIndex()` om te vertalen.

/** Offsets binnen de 156-byte uitgepakte patch. */
export const DX7 = {
  opStride: 21,
  /** Per operator, relatief aan `op * 21`. */
  op: {
    rate: 0, level: 4,          // 4 rates (0..3) en 4 levels (4..7)
    breakPoint: 8, leftDepth: 9, rightDepth: 10,
    leftCurve: 11, rightCurve: 12, rateScaling: 13,
    ampModSens: 14, velSens: 15, outputLevel: 16,
    oscMode: 17, freqCoarse: 18, freqFine: 19, detune: 20,
  },
  pitchRate: 126, pitchLevel: 130,
  algorithm: 134, feedback: 135, oscSync: 136,
  lfoSpeed: 137, lfoDelay: 138, lfoPmd: 139, lfoAmd: 140,
  lfoSync: 141, lfoWave: 142, pitchModSens: 143,
  transpose: 144, name: 145, opOnOff: 155,
} as const;

/** UI-operator (1..6) → index in de patch (5..0). */
export const opIndex = (uiOp: number): number => 6 - uiOp;
export const opOffset = (uiOp: number): number => opIndex(uiOp) * DX7.opStride;

/** Packed (128) → unpacked (156). Port van msfa's UnpackPatch. */
export function unpackPatch(bulk: Uint8Array, off = 0): Uint8Array {
  const p = new Uint8Array(156);
  for (let op = 0; op < 6; op++) {
    const s = off + op * 17, d = op * 21;
    for (let i = 0; i < 11; i++) p[d + i] = bulk[s + i] ?? 0;
    const lrc = bulk[s + 11] ?? 0;
    p[d + 11] = lrc & 3; p[d + 12] = (lrc >> 2) & 3;
    const dr = bulk[s + 12] ?? 0;
    p[d + 13] = dr & 7; p[d + 20] = dr >> 3;
    const ka = bulk[s + 13] ?? 0;
    p[d + 14] = ka & 3; p[d + 15] = ka >> 2;
    p[d + 16] = bulk[s + 14] ?? 0;
    const fm = bulk[s + 15] ?? 0;
    p[d + 17] = fm & 1; p[d + 18] = fm >> 1;
    p[d + 19] = bulk[s + 16] ?? 0;
  }
  for (let i = 0; i < 9; i++) p[126 + i] = bulk[off + 102 + i] ?? 0;
  const ofb = bulk[off + 111] ?? 0;
  p[135] = ofb & 7; p[136] = ofb >> 3;
  for (let i = 0; i < 4; i++) p[137 + i] = bulk[off + 112 + i] ?? 0;
  const lp = bulk[off + 116] ?? 0;
  p[141] = lp & 1; p[142] = (lp >> 1) & 7; p[143] = lp >> 4;
  for (let i = 0; i < 11; i++) p[144 + i] = bulk[off + 117 + i] ?? 0;
  p[155] = 0x3f;
  return p;
}

/** Unpacked (156) → packed (128), voor een .syx-bank. */
export function packPatch(p: Uint8Array): Uint8Array {
  const b = new Uint8Array(128);
  for (let op = 0; op < 6; op++) {
    const s = op * 21, d = op * 17;
    for (let i = 0; i < 11; i++) b[d + i] = p[s + i] ?? 0;
    b[d + 11] = ((p[s + 11] ?? 0) & 3) | (((p[s + 12] ?? 0) & 3) << 2);
    b[d + 12] = ((p[s + 13] ?? 0) & 7) | (((p[s + 20] ?? 0) & 0x1f) << 3);
    b[d + 13] = ((p[s + 14] ?? 0) & 3) | (((p[s + 15] ?? 0) & 7) << 2);
    b[d + 14] = p[s + 16] ?? 0;
    b[d + 15] = ((p[s + 17] ?? 0) & 1) | (((p[s + 18] ?? 0) & 0x1f) << 1);
    b[d + 16] = p[s + 19] ?? 0;
  }
  for (let i = 0; i < 9; i++) b[102 + i] = p[126 + i] ?? 0;
  b[111] = ((p[135] ?? 0) & 7) | (((p[136] ?? 0) & 1) << 3);
  for (let i = 0; i < 4; i++) b[112 + i] = p[137 + i] ?? 0;
  b[116] = ((p[141] ?? 0) & 1) | (((p[142] ?? 0) & 7) << 1) | (((p[143] ?? 0) & 7) << 4);
  for (let i = 0; i < 11; i++) b[117 + i] = p[144 + i] ?? 0;
  return b;
}

export function patchName(p: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += String.fromCharCode(p[DX7.name + i] || 32);
  return s;
}
export function setPatchName(p: Uint8Array, name: string): void {
  const padded = (name + '          ').slice(0, 10);
  for (let i = 0; i < 10; i++) p[DX7.name + i] = padded.charCodeAt(i) & 0x7f;
}

// ── algoritmes ────────────────────────────────────────────────────────
// Zelfde tabel als msfa's fm_core.cc; index 0..5 = OP6..OP1.
// Vlaggen: 0x01/0x02 = schrijf naar bus 1/2, 0x04 = tel op bij de uitgang,
// 0x10/0x20 = lees bus 1/2, 0x40 = feedback-in, 0x80 = feedback-uit.
const ALGORITHMS: number[][] = [
  [0xc1, 0x11, 0x11, 0x14, 0x01, 0x14], [0x01, 0x11, 0x11, 0x14, 0xc1, 0x14],
  [0xc1, 0x11, 0x14, 0x01, 0x11, 0x14], [0x41, 0x11, 0x94, 0x01, 0x11, 0x14],
  [0xc1, 0x14, 0x01, 0x14, 0x01, 0x14], [0x41, 0x94, 0x01, 0x14, 0x01, 0x14],
  [0xc1, 0x11, 0x05, 0x14, 0x01, 0x14], [0x01, 0x11, 0xc5, 0x14, 0x01, 0x14],
  [0x01, 0x11, 0x05, 0x14, 0xc1, 0x14], [0x01, 0x05, 0x14, 0xc1, 0x11, 0x14],
  [0xc1, 0x05, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x05, 0x14, 0xc1, 0x14],
  [0xc1, 0x05, 0x05, 0x14, 0x01, 0x14], [0xc1, 0x05, 0x11, 0x14, 0x01, 0x14],
  [0x01, 0x05, 0x11, 0x14, 0xc1, 0x14], [0xc1, 0x11, 0x02, 0x25, 0x05, 0x14],
  [0x01, 0x11, 0x02, 0x25, 0xc5, 0x14], [0x01, 0x11, 0x11, 0xc5, 0x05, 0x14],
  [0xc1, 0x14, 0x14, 0x01, 0x11, 0x14], [0x01, 0x05, 0x14, 0xc1, 0x14, 0x14],
  [0x01, 0x14, 0x14, 0xc1, 0x14, 0x14], [0xc1, 0x14, 0x14, 0x14, 0x01, 0x14],
  [0xc1, 0x14, 0x14, 0x01, 0x14, 0x04], [0xc1, 0x14, 0x14, 0x14, 0x04, 0x04],
  [0xc1, 0x14, 0x14, 0x04, 0x04, 0x04], [0xc1, 0x05, 0x14, 0x01, 0x14, 0x04],
  [0x01, 0x05, 0x14, 0xc1, 0x14, 0x04], [0x04, 0xc1, 0x11, 0x14, 0x01, 0x14],
  [0xc1, 0x14, 0x01, 0x14, 0x04, 0x04], [0x04, 0xc1, 0x11, 0x14, 0x04, 0x04],
  [0xc1, 0x14, 0x04, 0x04, 0x04, 0x04], [0xc4, 0x04, 0x04, 0x04, 0x04, 0x04],
];

export interface OpRouting {
  /** UI-nummer 1..6. */
  op: number;
  /** true = gaat rechtstreeks naar de uitgang. */
  carrier: boolean;
  /** Bus waarop hij schrijft (0 = uitgang) en leest (0 = niets). */
  outBus: number;
  inBus: number;
  feedback: boolean;
}

/** Routering van algoritme `alg` (0..31), op UI-nummer gesorteerd (OP1 eerst). */
export function algorithmRouting(alg: number): OpRouting[] {
  const rows = ALGORITHMS[Math.max(0, Math.min(31, alg))]!;
  const out: OpRouting[] = [];
  for (let idx = 0; idx < 6; idx++) {
    const f = rows[idx]!;
    out.push({
      op: 6 - idx,
      outBus: f & 3,
      inBus: (f >> 4) & 3,
      carrier: (f & 3) === 0,
      feedback: (f & 0xc0) === 0xc0,
    });
  }
  return out.sort((a, b) => a.op - b.op);
}

/**
 * Welke operators voedt `op` rechtstreeks?
 *
 * De bussen werken sequentieel, zoals `FmCore::compute` ze afloopt (tabel-index
 * 0..5 = OP6..OP1): een operator schrijft zijn uitgang op bus 1 of 2, en élke
 * latere operator die van die bus leest wordt erdoor gemoduleerd — tot iemand
 * de bus *overschrijft* (schrijven zonder OUT_BUS_ADD, 0x04). Vandaar dat OP6
 * in algoritme 22 niet één maar drie dragers voedt.
 */
export function modulationTargets(alg: number): Map<number, number[]> {
  const rows = ALGORITHMS[Math.max(0, Math.min(31, alg))]!;
  const map = new Map<number, number[]>();
  for (let i = 0; i < 6; i++) {
    const outBus = rows[i]! & 3;
    if (outBus === 0) continue;             // drager: gaat naar de uitgang
    const targets: number[] = [];
    for (let j = i + 1; j < 6; j++) {
      const g = rows[j]!;
      if (((g >> 4) & 3) === outBus) targets.push(6 - j);
      if ((g & 3) === outBus && (g & 0x04) === 0) break;   // bus overschreven
    }
    if (targets.length) map.set(6 - i, targets);
  }
  return map;
}

/** Omgekeerd: welke operators moduleren `op`? (voor de rol-kolom) */
export function modulatorsOf(alg: number): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const [src, dsts] of modulationTargets(alg)) {
    for (const d of dsts) map.set(d, [...(map.get(d) ?? []), src]);
  }
  return map;
}

// ── parameter-metadata voor de UI ─────────────────────────────────────
export const LFO_WAVES = ['driehoek', 'zaag omlaag', 'zaag omhoog', 'blok', 'sinus', 'S&H'];
export const CURVES = ['-lin', '-exp', '+exp', '+lin'];

/** Frequentieverhouding van een operator, zoals het display van een DX7. */
export function opRatio(p: Uint8Array, uiOp: number): string {
  const o = opOffset(uiOp);
  const mode = p[o + DX7.op.oscMode] ?? 0;
  const coarse = p[o + DX7.op.freqCoarse] ?? 1;
  const fine = p[o + DX7.op.freqFine] ?? 0;
  if (mode === 1) {
    // Vaste frequentie: 10^((coarse & 3) + fine/100) Hz
    const hz = Math.pow(10, (coarse & 3) + fine / 100);
    return `${hz.toFixed(hz < 100 ? 2 : 0)} Hz`;
  }
  const base = coarse === 0 ? 0.5 : coarse;
  return `× ${(base * (1 + fine / 100)).toFixed(2)}`;
}
