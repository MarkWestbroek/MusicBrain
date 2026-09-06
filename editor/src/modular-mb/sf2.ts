// sf2 — SoundFont 2 lezen en omzetten naar een MMB-samplebank.
//
// Een SF2 is precies het model dat onze sampler ook heeft: samples in één
// blok, plus een keymap van zones met key- en velocity-bereik, root-noot,
// stemming, pan en loop-punten. De vertaling is dus vooral boekhouding.
//
// Structuur (RIFF 'sfbk'):
//   LIST INFO   naam, maker, versie
//   LIST sdta   'smpl' = alle samples achter elkaar, 16-bit mono
//               ('sm24' = de lage bytes voor 24-bit; wij lezen alleen de 16)
//   LIST pdta   phdr pbag pgen  presets  → verwijzen naar
//               inst ibag igen  instrumenten → verwijzen naar
//               shdr            sample-headers
//
// Twee lagen zones. Een preset-zone zegt "toets 36–47 speelt instrument 5,
// −3 dB"; de instrument-zones daarbinnen zeggen welk sample. De bereiken
// snijden en de meeste generatoren tellen op. Dat vouwen we hier plat tot
// één lijst zones, want dat is wat `mmb_dsp::SamplePlayer` leest.
//
// Wat we *niet* overnemen: filter, LFO's, modulatoren en de volledige
// volume-envelope. Onze sampler heeft geen filter per zone, en het sample
// draagt zijn eigen uitsterving (`decay = 0`); alleen de release nemen we
// mee, want die hoor je bij het loslaten.
import type { WasmZone } from './runtime';
import type { BankSlot } from './sampleBank';

// ── generator-nummers die we gebruiken (SF2.04 §8.1) ─────────────────
const GEN = {
  startAddrsOffset: 0, endAddrsOffset: 1,
  startloopAddrsOffset: 2, endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4, endAddrsCoarseOffset: 12,
  startloopAddrsCoarseOffset: 45, endloopAddrsCoarseOffset: 50,
  pan: 17, releaseVolEnv: 38,
  instrument: 41, keyRange: 43, velRange: 44,
  initialAttenuation: 48, coarseTune: 51, fineTune: 52,
  sampleID: 53, sampleModes: 54, scaleTuning: 56, overridingRootKey: 58,
} as const;

interface Chunk { id: string; start: number; size: number }
interface Gen { op: number; lo: number; hi: number; amount: number; uAmount: number }
interface Bag { genStart: number }
interface Shdr {
  name: string; start: number; end: number; startLoop: number; endLoop: number;
  rate: number; originalPitch: number; correction: number; link: number; type: number;
}

export interface Sf2Preset {
  index: number; bank: number; program: number; name: string;
  /** Aantal zones — een preset met 0 zones is de lege terminator. */
  zones: number;
}

export interface Sf2 {
  name: string;
  engineer: string;
  copyright: string;
  presets: Sf2Preset[];
  /** Interne tabellen; alleen `sf2ToBank` heeft ze nodig. */
  readonly tables: {
    phdr: { name: string; program: number; bank: number; bagIndex: number }[];
    pbag: Bag[]; pgen: Gen[];
    inst: { name: string; bagIndex: number }[];
    ibag: Bag[]; igen: Gen[];
    shdr: Shdr[];
    smpl: Int16Array;
  };
}

function readChunks(dv: DataView, start: number, end: number): Chunk[] {
  const out: Chunk[] = [];
  let p = start;
  while (p + 8 <= end) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
    const size = dv.getUint32(p + 4, true);
    out.push({ id, start: p + 8, size });
    p += 8 + size + (size & 1);
  }
  return out;
}

const zstr = (bytes: Uint8Array, off: number, len: number): string => {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i]!;
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
};

function readGens(dv: DataView, start: number, size: number): Gen[] {
  const out: Gen[] = [];
  for (let p = start; p + 4 <= start + size; p += 4) {
    const op = dv.getUint16(p, true);
    out.push({
      op,
      lo: dv.getUint8(p + 2), hi: dv.getUint8(p + 3),
      amount: dv.getInt16(p + 2, true), uAmount: dv.getUint16(p + 2, true),
    });
  }
  return out;
}

/** Lees een `.sf2`. Gooit met een leesbare melding als het er geen is. */
export function readSf2(buf: ArrayBuffer): Sf2 {
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const form = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff !== 'RIFF' || form !== 'sfbk') throw new Error('geen SoundFont 2 (RIFF/sfbk ontbreekt)');

  let info: Chunk[] = [], sdta: Chunk[] = [], pdta: Chunk[] = [];
  for (const c of readChunks(dv, 12, buf.byteLength)) {
    if (c.id !== 'LIST') continue;
    const kind = String.fromCharCode(...bytes.subarray(c.start, c.start + 4));
    const inner = readChunks(dv, c.start + 4, c.start + c.size);
    if (kind === 'INFO') info = inner;
    else if (kind === 'sdta') sdta = inner;
    else if (kind === 'pdta') pdta = inner;
  }
  const infoText = (id: string): string => {
    const c = info.find((x) => x.id === id);
    return c ? zstr(bytes, c.start, c.size) : '';
  };

  const smplChunk = sdta.find((c) => c.id === 'smpl');
  if (!smplChunk) throw new Error('geen sampledata (smpl-chunk ontbreekt) — een SF3 met Ogg-samples kan ik niet lezen');
  // Kopiëren: de chunk begint niet gegarandeerd op een even byte.
  const smpl = new Int16Array(smplChunk.size >> 1);
  new Uint8Array(smpl.buffer).set(bytes.subarray(smplChunk.start, smplChunk.start + (smpl.length << 1)));

  const need = (id: string): Chunk => {
    const c = pdta.find((x) => x.id === id);
    if (!c) throw new Error(`pdta mist "${id}"`);
    return c;
  };

  const phdrC = need('phdr'), pbagC = need('pbag'), pgenC = need('pgen');
  const instC = need('inst'), ibagC = need('ibag'), igenC = need('igen');
  const shdrC = need('shdr');

  const phdr: Sf2['tables']['phdr'] = [];
  for (let p = phdrC.start; p + 38 <= phdrC.start + phdrC.size; p += 38) {
    phdr.push({
      name: zstr(bytes, p, 20),
      program: dv.getUint16(p + 20, true),
      bank: dv.getUint16(p + 22, true),
      bagIndex: dv.getUint16(p + 24, true),
    });
  }
  const inst: Sf2['tables']['inst'] = [];
  for (let p = instC.start; p + 22 <= instC.start + instC.size; p += 22) {
    inst.push({ name: zstr(bytes, p, 20), bagIndex: dv.getUint16(p + 20, true) });
  }
  const bags = (c: Chunk): Bag[] => {
    const out: Bag[] = [];
    for (let p = c.start; p + 4 <= c.start + c.size; p += 4) out.push({ genStart: dv.getUint16(p, true) });
    return out;
  };
  const shdr: Shdr[] = [];
  for (let p = shdrC.start; p + 46 <= shdrC.start + shdrC.size; p += 46) {
    shdr.push({
      name: zstr(bytes, p, 20),
      start: dv.getUint32(p + 20, true), end: dv.getUint32(p + 24, true),
      startLoop: dv.getUint32(p + 28, true), endLoop: dv.getUint32(p + 32, true),
      rate: dv.getUint32(p + 36, true),
      originalPitch: dv.getUint8(p + 40), correction: dv.getInt8(p + 41),
      link: dv.getUint16(p + 42, true), type: dv.getUint16(p + 44, true),
    });
  }

  const tables = {
    phdr, pbag: bags(pbagC), pgen: readGens(dv, pgenC.start, pgenC.size),
    inst, ibag: bags(ibagC), igen: readGens(dv, igenC.start, igenC.size),
    shdr, smpl,
  };

  // De laatste phdr/inst/shdr is per spec een terminator ("EOP"/"EOI"/"EOS").
  const presets: Sf2Preset[] = [];
  for (let i = 0; i < phdr.length - 1; i++) {
    presets.push({
      index: i, bank: phdr[i]!.bank, program: phdr[i]!.program, name: phdr[i]!.name,
      zones: phdr[i + 1]!.bagIndex - phdr[i]!.bagIndex,
    });
  }
  presets.sort((a, b) => (a.bank - b.bank) || (a.program - b.program));

  return {
    name: infoText('INAM') || 'soundfont',
    engineer: infoText('IENG'),
    copyright: infoText('ICOP'),
    presets,
    tables,
  };
}

/** Generatoren van één bag als map; latere waarden winnen (SF2 §9.4). */
function genMap(gens: Gen[], from: number, to: number): Map<number, Gen> {
  const m = new Map<number, Gen>();
  for (let i = from; i < to && i < gens.length; i++) m.set(gens[i]!.op, gens[i]!);
  return m;
}

const intersect = (a: [number, number], b: [number, number]): [number, number] =>
  [Math.max(a[0], b[0]), Math.min(a[1], b[1])];

/** Timecents → seconden (SF2's tijdmaat: 1200 tc = ×2). */
const timecents = (tc: number): number => (tc <= -12000 ? 0 : Math.pow(2, tc / 1200));

export interface Sf2BankOptions {
  /** Zones buiten dit key-bereik weglaten (bv. om drumkits te snoeien). */
  keyRange?: [number, number];
  /** Maximaal aantal samples; daarboven stopt de conversie met een melding. */
  maxSlots?: number;
  /**
   * Velocity-tracking per zone in dB. SF2 laat de dynamiek over aan een
   * *default modulator* (velocity → initial attenuation) die wij niet
   * nabouwen; zonder dit klinken alle lagen even hard en hoor je alleen het
   * timbre wisselen. 24 dB is een bruikbare pianowaarde: zacht en hard
   * verschillen dan hoorbaar zonder dat de zachtste laag wegvalt.
   */
  velTrackDb?: number;
  /**
   * Hoogstens zoveel velocity-lagen behouden. Een gesampelde vleugel heeft er
   * al gauw vijf, en dat is vijf keer het geheugen; de Teensy leest de hele
   * bank in PSRAM. De overgebleven lagen worden gelijkmatig gekozen en hun
   * bereiken opgerekt tot ze 1..127 weer helemaal dekken.
   */
  velLayers?: number;
}

/**
 * Zet één preset om naar slots + zones voor `buildBank`.
 *
 * Preset- en instrument-zones worden platgevouwen: de bereiken snijden, de
 * meeste generatoren tellen op (SF2 §9.4 — de preset-laag is een *offset* op
 * de instrument-laag). Samples blijven mono, zoals ze in het bestand staan;
 * een stereo-paar komt als twee zones met pan −1 en +1 terug en klinkt dus
 * gewoon als stereo.
 */
export function sf2ToBank(
  sf2: Sf2, presetIndex: number, opts: Sf2BankOptions = {},
): { name: string; slots: BankSlot[]; zones: WasmZone[]; skipped: number } {
  const t = sf2.tables;
  const preset = t.phdr[presetIndex];
  if (!preset) throw new Error(`preset ${presetIndex} bestaat niet`);
  const pBagEnd = t.phdr[presetIndex + 1]?.bagIndex ?? t.pbag.length;

  const slots: BankSlot[] = [];
  const zones: WasmZone[] = [];
  const slotOfSample = new Map<number, number>();
  const maxSlots = opts.maxSlots ?? 128;
  let skipped = 0;

  // ── preset-zones ──
  let pGlobal = new Map<number, Gen>();
  for (let pb = preset.bagIndex; pb < pBagEnd; pb++) {
    const pGenEnd = t.pbag[pb + 1]?.genStart ?? t.pgen.length;
    const pg = genMap(t.pgen, t.pbag[pb]!.genStart, pGenEnd);
    const instGen = pg.get(GEN.instrument);
    if (!instGen) { pGlobal = pg; continue; }          // globale zone
    const merged = new Map([...pGlobal, ...pg]);

    let pKeys: [number, number] = [0, 127];
    let pVels: [number, number] = [0, 127];
    const pk = merged.get(GEN.keyRange); if (pk) pKeys = [pk.lo, pk.hi];
    const pv = merged.get(GEN.velRange); if (pv) pVels = [pv.lo, pv.hi];
    const pAtt  = merged.get(GEN.initialAttenuation)?.amount ?? 0;
    const pPan  = merged.get(GEN.pan)?.amount ?? 0;
    const pCoarse = merged.get(GEN.coarseTune)?.amount ?? 0;
    const pFine   = merged.get(GEN.fineTune)?.amount ?? 0;
    const pRel  = merged.get(GEN.releaseVolEnv)?.amount;

    // ── instrument-zones ──
    const instIdx = instGen.uAmount;
    const instrument = t.inst[instIdx];
    if (!instrument) continue;
    const iBagEnd = t.inst[instIdx + 1]?.bagIndex ?? t.ibag.length;
    let iGlobal = new Map<number, Gen>();
    for (let ib = instrument.bagIndex; ib < iBagEnd; ib++) {
      const iGenEnd = t.ibag[ib + 1]?.genStart ?? t.igen.length;
      const ig = genMap(t.igen, t.ibag[ib]!.genStart, iGenEnd);
      const sampleGen = ig.get(GEN.sampleID);
      if (!sampleGen) { iGlobal = ig; continue; }
      const g = new Map([...iGlobal, ...ig]);

      let keys: [number, number] = [0, 127];
      let vels: [number, number] = [0, 127];
      const ik = g.get(GEN.keyRange); if (ik) keys = [ik.lo, ik.hi];
      const iv = g.get(GEN.velRange); if (iv) vels = [iv.lo, iv.hi];
      keys = intersect(keys, pKeys);
      vels = intersect(vels, pVels);
      if (opts.keyRange) keys = intersect(keys, opts.keyRange);
      if (keys[0] > keys[1] || vels[0] > vels[1]) continue;     // geen overlap

      const sh = t.shdr[sampleGen.uAmount];
      if (!sh || sh.end <= sh.start) { skipped++; continue; }

      // Sample-adressen: de offset-generatoren verschuiven start/eind.
      const off = (fine: number, coarse: number): number =>
        (g.get(fine)?.amount ?? 0) + (g.get(coarse)?.amount ?? 0) * 32768;
      const start = sh.start + off(GEN.startAddrsOffset, GEN.startAddrsCoarseOffset);
      const end   = sh.end   + off(GEN.endAddrsOffset,   GEN.endAddrsCoarseOffset);
      if (end <= start || end > t.smpl.length) { skipped++; continue; }

      // Eén slot per (sample, snijpunt) — meestal deelt een hele reeks zones
      // hetzelfde sample, dus dedupliceren scheelt geheugen.
      const key = start * 0x100000000 + end;
      let slot = slotOfSample.get(key);
      if (slot === undefined) {
        if (slots.length >= maxSlots) { skipped++; continue; }
        slot = slots.length;
        slotOfSample.set(key, slot);
        slots.push({
          data: t.smpl.slice(start, end),
          channels: 1,
          rate: sh.rate || 44100,
          name: sh.name,
        });
      }

      const loopStart = sh.startLoop + off(GEN.startloopAddrsOffset, GEN.startloopAddrsCoarseOffset) - start;
      const loopEnd   = sh.endLoop   + off(GEN.endloopAddrsOffset,   GEN.endloopAddrsCoarseOffset) - start;
      const modes = g.get(GEN.sampleModes)?.uAmount ?? 0;
      const frames = end - start;
      const loopOk = loopEnd > loopStart && loopStart >= 0 && loopEnd <= frames;
      // 1 = doorlopend, 3 = tot note-off (dan de staart), 0/2 = niet loopen.
      const loopMode = !loopOk ? 0 : modes === 1 ? 2 : modes === 3 ? 3 : 0;

      const root = g.get(GEN.overridingRootKey)?.amount;
      const attenuation = (g.get(GEN.initialAttenuation)?.amount ?? 0) + pAtt;   // centibel
      const pan = (g.get(GEN.pan)?.amount ?? 0) + pPan;                          // ±500 = ±100 %
      const coarse = (g.get(GEN.coarseTune)?.amount ?? 0) + pCoarse;
      const fine   = (g.get(GEN.fineTune)?.amount ?? 0) + pFine;
      const relTc  = g.get(GEN.releaseVolEnv)?.amount ?? pRel;

      zones.push({
        slot,
        lowKey: keys[0], highKey: keys[1],
        lowVel: Math.max(1, vels[0]), highVel: vels[1],
        root: root !== undefined && root >= 0 ? root : sh.originalPitch,
        tuneCents: sh.correction + coarse * 100 + fine,
        gain: Math.pow(10, -attenuation / 200),
        pan: Math.max(-1, Math.min(1, pan / 500)),
        loopMode,
        loopStart: loopOk ? loopStart : 0,
        loopEnd: loopOk ? loopEnd : 0,
        decay: 0,                                   // het sample sterft zelf uit
        velTrack: opts.velTrackDb ?? 24,
        release: relTc === undefined ? 0.12 : Math.min(4, Math.max(0.02, timecents(relTc))),
      });
    }
  }
  const thinned = opts.velLayers ? thinVelocityLayers(zones, opts.velLayers) : zones;
  // Lagen weglaten kan sloten wezen maken; opnieuw nummeren scheelt geheugen.
  const used = [...new Set(thinned.map((z) => z.slot))].sort((a, b) => a - b);
  if (used.length < slots.length) {
    const remap = new Map(used.map((old, i) => [old, i]));
    for (const z of thinned) z.slot = remap.get(z.slot)!;
    return {
      name: preset.name || sf2.name,
      slots: used.map((i) => slots[i]!),
      zones: thinned,
      skipped: skipped + (zones.length - thinned.length),
    };
  }
  return { name: preset.name || sf2.name, slots, zones: thinned, skipped };
}

/** Houd hoogstens `max` velocity-lagen over en rek ze uit tot 1..127. */
function thinVelocityLayers(zones: WasmZone[], max: number): WasmZone[] {
  const layers = [...new Set(zones.map((z) => `${z.lowVel}-${z.highVel}`))]
    .map((k) => { const [lo, hi] = k.split('-').map(Number); return { lo: lo!, hi: hi! }; })
    .sort((a, b) => a.lo - b.lo);
  if (layers.length <= max || max < 1) return zones;
  // Gelijkmatig kiezen, met de zachtste en de hardste er altijd bij.
  const keep = Array.from({ length: max }, (_, i) =>
    layers[Math.round((i * (layers.length - 1)) / (max - 1 || 1))]!);
  const bounds = keep.map((_, i) => Math.round(1 + ((i + 1) * 126) / keep.length));
  const out: WasmZone[] = [];
  zones.forEach((z) => {
    const k = keep.findIndex((l) => l.lo === z.lowVel && l.hi === z.highVel);
    if (k < 0) return;
    out.push({ ...z, lowVel: k === 0 ? 1 : bounds[k - 1]! + 1, highVel: k === keep.length - 1 ? 127 : bounds[k]! });
  });
  return out;
}
