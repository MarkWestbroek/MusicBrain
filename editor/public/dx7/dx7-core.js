// MusicBrain — DX7-kern in JavaScript: regel-voor-regel port van msfa
// (Google music-synthesizer-for-android, Apache-2.0; firmware/lib/msfa),
// dezelfde engine als Dx7Module.h op de Teensy, Dexed en MicroDexed.
//
// Alles is 32-bits integer-DSP zoals het origineel. Waar C int64 gebruikt
// (producten van twee Q24-getallen) past het resultaat in de 53 bits van
// een double, behalve op één plek per blok (pitch-mod), waar BigInt de
// exacte 64-bits shift doet. Tabellen worden met Math.sin/exp2 opgebouwd
// en kunnen daardoor per entry 1 LSB van libm afwijken — onhoorbaar; het
// referentie-harnas (tools/dx7-wasm) meet het verschil.
//
// Rendert op 44 100 Hz (zoals de firmware) in blokken van N = 64.
// Bovenop de kern: dezelfde 16-stemmige allocator als dx7_wasm.cc.

const LG_N = 6;
const N = 1 << LG_N;
const SAMPLE_RATE = 44100;

// ─── Sin ────────────────────────────────────────────────────────────────
const SIN_LG_N = 10;
const SIN_N = 1 << SIN_LG_N;
const sintab = new Int32Array(SIN_N << 1);

function sinInit() {
  const dphase = 2 * Math.PI / SIN_N;
  const c = BigInt(Math.floor(Math.cos(dphase) * (1 << 30) + 0.5));
  const s = BigInt(Math.floor(Math.sin(dphase) * (1 << 30) + 0.5));
  const R = 1n << 29n;
  let u = 1n << 30n, v = 0n;
  for (let i = 0; i < SIN_N / 2; i++) {
    const vi = Number(v);
    sintab[(i << 1) + 1] = (vi + 32) >> 6;
    sintab[((i + SIN_N / 2) << 1) + 1] = -((vi + 32) >> 6);
    const t = BigInt.asIntN(32, (u * s + v * c + R) >> 30n);
    u = BigInt.asIntN(32, (u * c - v * s + R) >> 30n);
    v = t;
  }
  for (let i = 0; i < SIN_N - 1; i++) sintab[i << 1] = sintab[(i << 1) + 3] - sintab[(i << 1) + 1];
  sintab[(SIN_N << 1) - 2] = -sintab[(SIN_N << 1) - 1];
}

function sinLookup(phase) {           // phase: int32, Q24 per periode
  const lowbits = phase & 0x3fff;     // SHIFT = 24 - 10 = 14
  const pi = (phase >> 13) & ((SIN_N - 1) << 1);
  const dy = sintab[pi], y0 = sintab[pi + 1];
  return (y0 + Math.floor(dy * lowbits / 16384)) | 0;
}

// ─── Exp2 ───────────────────────────────────────────────────────────────
const EXP2_N = 1 << 10;
const exp2tab = new Int32Array(EXP2_N << 1);

function exp2Init() {
  const inc = Math.pow(2, 1 / EXP2_N);
  let y = 1 << 30;
  for (let i = 0; i < EXP2_N; i++) {
    exp2tab[(i << 1) + 1] = Math.floor(y + 0.5);
    y *= inc;
  }
  for (let i = 0; i < EXP2_N - 1; i++) exp2tab[i << 1] = exp2tab[(i << 1) + 3] - exp2tab[(i << 1) + 1];
  exp2tab[(EXP2_N << 1) - 2] = (2147483648 - exp2tab[(EXP2_N << 1) - 1]) | 0;
}

function exp2Lookup(x) {              // Q24 in, Q24 uit
  const lowbits = x & 0x3fff;
  const xi = (x >> 13) & ((EXP2_N - 1) << 1);
  const dy = exp2tab[xi], y0 = exp2tab[xi + 1];
  const y = y0 + Math.floor(dy * lowbits / 16384);
  const sh = 6 - (x >> 24);
  if (sh >= 31) return 0;
  return y >> sh;
}

// ─── Freqlut ────────────────────────────────────────────────────────────
const FREQ_N = 1 << 10;
const freqlut = new Int32Array(FREQ_N + 1);

function freqlutInit(sampleRate) {
  let y = 17592186044416 / sampleRate;   // 2^(24+20) / sr
  const inc = Math.pow(2, 1 / FREQ_N);
  for (let i = 0; i < FREQ_N + 1; i++) { freqlut[i] = Math.floor(y + 0.5); y *= inc; }
}

function freqlutLookup(logfreq) {
  const ix = (logfreq & 0xffffff) >> 14;
  const y0 = freqlut[ix], y1 = freqlut[ix + 1];
  const lowbits = logfreq & 0x3fff;
  const y = y0 + Math.floor((y1 - y0) * lowbits / 16384);
  const sh = 20 - (logfreq >> 24);
  if (sh >= 31) return 0;
  if (sh < 0) return 0;
  return y >> sh;
}

// ─── Env (DX7-envelope) ─────────────────────────────────────────────────
const levellut = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 45, 46];
function scaleoutlevel(outlevel) { return outlevel >= 20 ? 28 + outlevel : levellut[outlevel]; }

class Env {
  constructor() {
    this.rates = [0, 0, 0, 0]; this.levels = [0, 0, 0, 0];
    this.outlevel = 0; this.rateScaling = 0;
    this.level = 0; this.targetlevel = 0; this.rising = false;
    this.ix = 0; this.inc = 0; this.down = true;
  }
  init(r, l, ol, rateScaling) {
    for (let i = 0; i < 4; i++) { this.rates[i] = r[i]; this.levels[i] = l[i]; }
    this.outlevel = ol; this.rateScaling = rateScaling;
    this.level = 0; this.down = true;
    this.advance(0);
  }
  getsample() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        const jumptarget = 1716;
        if (this.level < (jumptarget << 16)) this.level = jumptarget << 16;
        this.level = (this.level + Math.imul(((17 << 24) - this.level) >> 24, this.inc)) | 0;
        if (this.level >= this.targetlevel) { this.level = this.targetlevel; this.advance(this.ix + 1); }
      } else {
        this.level = (this.level - this.inc) | 0;
        if (this.level <= this.targetlevel) { this.level = this.targetlevel; this.advance(this.ix + 1); }
      }
    }
    return this.level;
  }
  keydown(d) { if (this.down !== d) { this.down = d; this.advance(d ? 0 : 3); } }
  advance(newix) {
    this.ix = newix;
    if (this.ix < 4) {
      const newlevel = this.levels[this.ix];
      let actuallevel = scaleoutlevel(newlevel) >> 1;
      actuallevel = (actuallevel << 6) + this.outlevel - 4256;
      actuallevel = actuallevel < 16 ? 16 : actuallevel;
      this.targetlevel = actuallevel << 16;
      this.rising = this.targetlevel > this.level;
      let qrate = (this.rates[this.ix] * 41) >> 6;
      qrate += this.rateScaling;
      qrate = Math.min(qrate, 63);
      this.inc = (4 + (qrate & 3)) << (2 + LG_N + (qrate >> 2));
    }
  }
}

// ─── PitchEnv ───────────────────────────────────────────────────────────
const ratetab = [
  1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12,
  12, 13, 13, 14, 14, 15, 16, 16, 17, 18, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 30, 31, 33, 34, 36, 37, 38, 39, 41, 42, 44, 46, 47,
  49, 51, 53, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 79, 82,
  85, 88, 91, 94, 98, 102, 106, 110, 115, 120, 125, 130, 135, 141, 147,
  153, 159, 165, 171, 178, 185, 193, 202, 211, 232, 243, 254, 255];
const pitchtab = [
  -128, -116, -104, -95, -85, -76, -68, -61, -56, -52, -49, -46, -43,
  -41, -39, -37, -35, -33, -32, -31, -30, -29, -28, -27, -26, -25, -24,
  -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10,
  -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
  28, 29, 30, 31, 32, 33, 34, 35, 38, 40, 43, 46, 49, 53, 58, 65, 73,
  82, 92, 103, 115, 127];
let pitchenvUnit = 0;

class PitchEnv {
  static init(sampleRate) { pitchenvUnit = Math.trunc(N * (1 << 24) / (21.3 * sampleRate) + 0.5); }
  constructor() {
    this.rates = [0, 0, 0, 0]; this.levels = [0, 0, 0, 0];
    this.level = 0; this.targetlevel = 0; this.rising = false; this.ix = 0; this.inc = 0; this.down = true;
  }
  set(r, l) {
    for (let i = 0; i < 4; i++) { this.rates[i] = r[i]; this.levels[i] = l[i]; }
    this.level = pitchtab[l[3]] << 19;
    this.down = true;
    this.advance(0);
  }
  getsample() {
    if (this.ix < 3 || (this.ix < 4 && !this.down)) {
      if (this.rising) {
        this.level = (this.level + this.inc) | 0;
        if (this.level >= this.targetlevel) { this.level = this.targetlevel; this.advance(this.ix + 1); }
      } else {
        this.level = (this.level - this.inc) | 0;
        if (this.level <= this.targetlevel) { this.level = this.targetlevel; this.advance(this.ix + 1); }
      }
    }
    return this.level;
  }
  keydown(d) { if (this.down !== d) { this.down = d; this.advance(d ? 0 : 3); } }
  advance(newix) {
    this.ix = newix;
    if (this.ix < 4) {
      this.targetlevel = pitchtab[this.levels[this.ix]] << 19;
      this.rising = this.targetlevel > this.level;
      this.inc = Math.imul(ratetab[this.rates[this.ix]], pitchenvUnit);
    }
  }
}

// ─── Lfo ────────────────────────────────────────────────────────────────
let lfoUnit = 0;

class Lfo {
  static init(sampleRate) { lfoUnit = Math.trunc(N * 25190424 / sampleRate + 0.5); }
  constructor() {
    this.phase = 0; this.delta = 0; this.waveform = 0; this.randstate = 0; this.sync = false;
    this.delaystate = 0; this.delayinc = 0; this.delayinc2 = 0;
  }
  reset(patch, off) {                // params = patch[137..142]
    const rate = patch[off];
    let sr = rate === 0 ? 1 : (165 * rate) >> 6;
    sr *= sr < 160 ? 11 : (11 + ((sr - 160) >> 4));
    this.delta = (lfoUnit * sr) >>> 0;
    let a = 99 - patch[off + 1];
    if (a === 99) {
      this.delayinc = 0xffffffff; this.delayinc2 = 0xffffffff;
    } else {
      a = (16 + (a & 15)) << (1 + (a >> 4));
      this.delayinc = (lfoUnit * a) >>> 0;
      a &= 0xff80;
      a = Math.max(0x80, a);
      this.delayinc2 = (lfoUnit * a) >>> 0;
    }
    this.waveform = patch[off + 5];
    this.sync = patch[off + 4] !== 0;
  }
  getsample() {                      // 0..1 in Q24
    this.phase = (this.phase + this.delta) >>> 0;
    const p = this.phase;
    let x;
    switch (this.waveform) {
      case 0: x = p >>> 7; x ^= -(p >>> 31); x &= (1 << 24) - 1; return x;
      case 1: return ((~p) ^ 0x80000000) >>> 8;
      case 2: return (p ^ 0x80000000) >>> 8;
      case 3: return ((~p) >>> 7) & (1 << 24);
      case 4: return (1 << 23) + (sinLookup(p >>> 8) >> 1);
      case 5:
        if (p < this.delta) this.randstate = (this.randstate * 179 + 17) & 0xff;
        x = this.randstate ^ 0x80;
        return (x + 1) << 16;
    }
    return 1 << 23;
  }
  getdelay() {
    const delta = this.delaystate < 0x80000000 ? this.delayinc : this.delayinc2;
    const d = (this.delaystate + delta) >>> 0;
    if (d < this.delayinc) return 1 << 24;
    this.delaystate = d;
    if (d < 0x80000000) return 0;
    return (d >>> 7) & ((1 << 24) - 1);
  }
  keydown() {
    if (this.sync) this.phase = 0x7fffffff;
    this.delaystate = 0;
  }
}

// ─── FmOpKernel + FmCore ────────────────────────────────────────────────
function kernelCompute(output, input, phase0, freq, gain1, gain2, add) {
  const dgain = (gain2 - gain1 + (N >> 1)) >> LG_N;
  let gain = gain1, phase = phase0;
  for (let i = 0; i < N; i++) {
    gain = (gain + dgain) | 0;
    const y = sinLookup((phase + input[i]) | 0);
    const v = Math.floor(y * gain / 16777216);
    output[i] = add ? output[i] + v : v;
    phase = (phase + freq) | 0;
  }
}
function kernelComputePure(output, phase0, freq, gain1, gain2, add) {
  const dgain = (gain2 - gain1 + (N >> 1)) >> LG_N;
  let gain = gain1, phase = phase0;
  for (let i = 0; i < N; i++) {
    gain = (gain + dgain) | 0;
    const y = sinLookup(phase);
    const v = Math.floor(y * gain / 16777216);
    output[i] = add ? output[i] + v : v;
    phase = (phase + freq) | 0;
  }
}
function kernelComputeFb(output, phase0, freq, gain1, gain2, fbBuf, fbShift, add) {
  const dgain = (gain2 - gain1 + (N >> 1)) >> LG_N;
  let gain = gain1, phase = phase0;
  let y0 = fbBuf[0], y = fbBuf[1];
  for (let i = 0; i < N; i++) {
    gain = (gain + dgain) | 0;
    const scaledFb = (y0 + y) >> (fbShift + 1);
    y0 = y;
    y = sinLookup((phase + scaledFb) | 0);
    y = Math.floor(y * gain / 16777216);
    output[i] = add ? output[i] + y : y;
    phase = (phase + freq) | 0;
  }
  fbBuf[0] = y0; fbBuf[1] = y;
}

const OUT_BUS_ADD = 1 << 2;
const algorithms = [
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

class FmCore {
  constructor() { this.buf = [new Int32Array(N), new Int32Array(N)]; }
  compute(output, params, algorithm, fbBuf, feedbackShift) {
    const kLevelThresh = 1120;
    const alg = algorithms[algorithm];
    const hasContents = [true, false, false];
    for (let op = 0; op < 6; op++) {
      const flags = alg[op];
      let add = (flags & OUT_BUS_ADD) !== 0;
      const param = params[op];
      const inbus = (flags >> 4) & 3;
      const outbus = flags & 3;
      const outptr = outbus === 0 ? output : this.buf[outbus - 1];
      const gain1 = param.gain0, gain2 = param.gain1;
      if (gain1 >= kLevelThresh || gain2 >= kLevelThresh) {
        if (!hasContents[outbus]) add = false;
        if (inbus === 0 || !hasContents[inbus]) {
          if ((flags & 0xc0) === 0xc0 && feedbackShift < 16) {
            kernelComputeFb(outptr, param.phase, param.freq, gain1, gain2, fbBuf, feedbackShift, add);
          } else {
            kernelComputePure(outptr, param.phase, param.freq, gain1, gain2, add);
          }
        } else {
          kernelCompute(outptr, this.buf[inbus - 1], param.phase, param.freq, gain1, gain2, add);
        }
        hasContents[outbus] = true;
      } else if (!add) {
        hasContents[outbus] = false;
      }
      param.phase = (param.phase + (param.freq << LG_N)) | 0;
    }
  }
}

// ─── Dx7Note ────────────────────────────────────────────────────────────
function midinoteToLogfreq(midinote) {
  const base = 50857777;                // (1 << 24) * (log(440) / log(2) - 69/12)
  const step = (1 << 24) / 12 | 0;
  return (base + step * midinote) | 0;
}
const coarsemul = [
  -16777216, 0, 16777216, 26591258, 33554432, 38955489, 43368474, 47099600,
  50331648, 53182516, 55732705, 58039632, 60145690, 62083076, 63876816,
  65546747, 67108864, 68576247, 69959732, 71268397, 72509921, 73690858,
  74816848, 75892776, 76922906, 77910978, 78860292, 79773775, 80654032,
  81503396, 82323963, 83117622];

function oscFreq(midinote, mode, coarse, fine, detune) {
  let logfreq;
  if (mode === 0) {
    logfreq = midinoteToLogfreq(midinote);
    logfreq += coarsemul[coarse & 31];
    if (fine) logfreq += Math.floor(24204406.323123 * Math.log(1 + 0.01 * fine) + 0.5);
    logfreq += 12606 * (detune - 7);
  } else {
    logfreq = (4458616 * ((coarse & 3) * 100 + fine)) >> 3;
    logfreq += detune > 7 ? 13457 * (detune - 7) : 0;
  }
  return logfreq | 0;
}

const velocityData = [
  0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163,
  166, 170, 173, 174, 178, 181, 184, 186, 189, 190, 194, 196, 198, 200, 202,
  205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227, 229, 230, 232,
  233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246, 248, 249, 250, 251,
  252, 253, 254];
function scaleVelocity(velocity, sensitivity) {
  const clamped = Math.max(0, Math.min(127, velocity));
  const velValue = velocityData[clamped >> 1] - 239;
  return ((sensitivity * velValue + 7) >> 3) << 4;
}
function scaleRate(midinote, sensitivity) {
  const x = Math.min(31, Math.max(0, Math.trunc(midinote / 3) - 7));
  return (sensitivity * x) >> 3;
}
const expScaleData = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 16, 19, 23, 27, 33, 39, 47, 56, 66,
  80, 94, 110, 126, 142, 158, 174, 190, 206, 222, 238, 250];
function scaleCurve(group, depth, curve) {
  let scale;
  if (curve === 0 || curve === 3) {
    scale = (group * depth * 329) >> 12;
  } else {
    const rawExp = expScaleData[Math.min(group, expScaleData.length - 1)];
    scale = (rawExp * depth * 329) >> 15;
  }
  if (curve < 2) scale = -scale;
  return scale;
}
function scaleLevel(midinote, breakPt, leftDepth, rightDepth, leftCurve, rightCurve) {
  const offset = midinote - breakPt - 17;
  if (offset >= 0) return scaleCurve(Math.trunc(offset / 3), rightDepth, rightCurve);
  return scaleCurve(Math.trunc(-offset / 3), leftDepth, leftCurve);
}
const pitchmodsenstab = [0, 10, 20, 33, 55, 92, 153, 255];

class Dx7Note {
  constructor() {
    this.core = new FmCore();
    this.env = [new Env(), new Env(), new Env(), new Env(), new Env(), new Env()];
    this.params = [];
    for (let i = 0; i < 6; i++) this.params.push({ gain0: 0, gain1: 0, freq: 0, phase: 0 });
    this.pitchenv = new PitchEnv();
    this.basepitch = new Int32Array(6);
    this.fbBuf = new Int32Array(2);
    this.fbShift = 16;
    this.algorithm = 0;
    this.pitchmoddepth = 0;
    this.pitchmodsens = 0;
  }
  init(patch, midinote, velocity) {
    const rates = [0, 0, 0, 0], levels = [0, 0, 0, 0];
    for (let op = 0; op < 6; op++) {
      const off = op * 21;
      for (let i = 0; i < 4; i++) { rates[i] = patch[off + i]; levels[i] = patch[off + 4 + i]; }
      let outlevel = scaleoutlevel(patch[off + 16]);
      const levelScaling = scaleLevel(midinote, patch[off + 8], patch[off + 9], patch[off + 10], patch[off + 11], patch[off + 12]);
      outlevel += levelScaling;
      outlevel = Math.min(127, outlevel);
      outlevel = outlevel << 5;
      outlevel += scaleVelocity(velocity, patch[off + 15]);
      outlevel = Math.max(0, outlevel);
      const rateScaling = scaleRate(midinote, patch[off + 13]);
      this.env[op].init(rates, levels, outlevel, rateScaling);
      const mode = patch[off + 17], coarse = patch[off + 18], fine = patch[off + 19], detune = patch[off + 20];
      this.basepitch[op] = oscFreq(midinote, mode, coarse, fine, detune);
      this.params[op].phase = 0;
      this.params[op].gain1 = 0;
    }
    for (let i = 0; i < 4; i++) { rates[i] = patch[126 + i]; levels[i] = patch[130 + i]; }
    this.pitchenv.set(rates, levels);
    this.algorithm = patch[134];
    const feedback = patch[135];
    this.fbShift = feedback !== 0 ? 8 - feedback : 16;
    this.pitchmoddepth = (patch[139] * 165) >> 6;
    this.pitchmodsens = pitchmodsenstab[patch[143] & 7];
    this.fbBuf[0] = 0; this.fbBuf[1] = 0;
  }
  compute(buf, lfoVal, lfoDelay, pitchbend) {
    let pitchmod = this.pitchenv.getsample();
    const pmd = this.pitchmoddepth * lfoDelay;                       // Q32, past in uint32
    const senslfo = Math.imul(this.pitchmodsens, lfoVal - (1 << 23)); // int32
    // (int64) pmd * senslfo >> 39 — exact via BigInt, één keer per blok.
    pitchmod = (pitchmod + Number((BigInt(pmd) * BigInt(senslfo)) >> 39n)) | 0;
    const pb = (pitchbend - 0x2000) << 9;
    pitchmod = (pitchmod + pb) | 0;
    for (let op = 0; op < 6; op++) {
      const p = this.params[op];
      p.gain0 = p.gain1;
      const level = this.env[op].getsample();
      const gain = exp2Lookup((level - (14 << 24)) | 0);
      p.freq = freqlutLookup((this.basepitch[op] + pitchmod) | 0);
      p.gain1 = gain;
    }
    this.core.compute(buf, this.params, this.algorithm, this.fbBuf, this.fbShift);
  }
  keyup() {
    for (let op = 0; op < 6; op++) this.env[op].keydown(false);
    this.pitchenv.keydown(false);
  }
}

// ─── Patch ──────────────────────────────────────────────────────────────
export function unpackPatch(bulk, bulkOff, patch) {   // 128 packed → 156
  for (let op = 0; op < 6; op++) {
    for (let i = 0; i < 11; i++) patch[op * 21 + i] = bulk[bulkOff + op * 17 + i];
    const lrc = bulk[bulkOff + op * 17 + 11];
    patch[op * 21 + 11] = lrc & 3;
    patch[op * 21 + 12] = (lrc >> 2) & 3;
    const detuneRs = bulk[bulkOff + op * 17 + 12];
    patch[op * 21 + 13] = detuneRs & 7;
    patch[op * 21 + 20] = detuneRs >> 3;
    const kvsAms = bulk[bulkOff + op * 17 + 13];
    patch[op * 21 + 14] = kvsAms & 3;
    patch[op * 21 + 15] = kvsAms >> 2;
    patch[op * 21 + 16] = bulk[bulkOff + op * 17 + 14];
    const fcm = bulk[bulkOff + op * 17 + 15];
    patch[op * 21 + 17] = fcm & 1;
    patch[op * 21 + 18] = fcm >> 1;
    patch[op * 21 + 19] = bulk[bulkOff + op * 17 + 16];
  }
  for (let i = 0; i < 9; i++) patch[126 + i] = bulk[bulkOff + 102 + i];
  const oksFb = bulk[bulkOff + 111];
  patch[135] = oksFb & 7;
  patch[136] = oksFb >> 3;
  for (let i = 0; i < 4; i++) patch[137 + i] = bulk[bulkOff + 112 + i];
  const lpms = bulk[bulkOff + 116];
  patch[141] = lpms & 1;
  patch[142] = (lpms >> 1) & 7;
  patch[143] = lpms >> 4;
  for (let i = 0; i < 11; i++) patch[144 + i] = bulk[bulkOff + 117 + i];
  patch[155] = 0x3f;
}

// E.PIANO 1 (128 bytes packed, uit msfa) — default zolang er geen bank is.
const EPIANO = Uint8Array.from([
  95, 29, 20, 50, 99, 95, 0, 0, 41, 0, 19, 0, 115, 24, 79, 2, 0,
  95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 3, 0, 99, 2, 0,
  95, 29, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 24, 89, 2, 0,
  95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 8, 99, 2, 0,
  95, 50, 35, 78, 99, 75, 0, 0, 0, 0, 0, 0, 59, 28, 58, 28, 0,
  96, 25, 25, 67, 99, 75, 0, 0, 0, 0, 0, 0, 83, 8, 99, 2, 0,
  94, 67, 95, 60, 50, 50, 50, 50, 4, 6, 34, 33, 0, 0, 56, 24,
  69, 46, 80, 73, 65, 78, 79, 32, 49, 32]);

// ─── Dx7Core: stemmen + allocator (port van dx7_wasm.cc) ────────────────
let tablesDone = false;
function ensureTables() {
  if (tablesDone) return;
  tablesDone = true;
  freqlutInit(SAMPLE_RATE);
  exp2Init();
  sinInit();
  Lfo.init(SAMPLE_RATE);
  PitchEnv.init(SAMPLE_RATE);
}

const K_VOICES = 16, K_BANKS = 9, K_BANK_BYTES = 4096, K_MAX_FRAMES = 1024;

export class Dx7Core {
  constructor() {
    ensureTables();
    this.voices = [];
    for (let i = 0; i < K_VOICES; i++) {
      this.voices.push({
        note: new Dx7Note(), lfo: new Lfo(), pitchbend: 0x2000,
        patch: new Uint8Array(156), midinote: -1, gate: false, age: 0, quiet: 0,
      });
    }
    this.banks = new Uint8Array(K_BANKS * K_BANK_BYTES);
    this.bankLoaded = new Array(K_BANKS).fill(false);
    this.bank = 0; this.program = 0; this.coarse = 0; this.fine = 0; this.level = 0.8;
    this.ageCounter = 0;
    this.out = new Float32Array(K_MAX_FRAMES);
    this.scratch = new Int32Array(N);
    for (const v of this.voices) this.applyPatch(v);
  }

  // ── banken / programma ──
  writeBank(b, bytes) {
    if (b < 0 || b >= K_BANKS || bytes.length !== K_BANK_BYTES) return;
    this.banks.set(bytes, b * K_BANK_BYTES);
    this.bankLoaded[b] = true;
  }
  packedVoiceOffset() { return this.bankLoaded[this.bank] ? this.bank * K_BANK_BYTES + (this.program & 31) * 128 : -1; }
  applyPatch(v) {
    const off = this.packedVoiceOffset();
    if (off < 0) unpackPatch(EPIANO, 0, v.patch); else unpackPatch(this.banks, off, v.patch);
    v.lfo.reset(v.patch, 137);
  }
  voiceName() {
    const off = this.packedVoiceOffset();
    const src = off < 0 ? EPIANO : this.banks;
    const base = off < 0 ? 0 : off;
    let s = '';
    for (let i = 0; i < 10; i++) s += String.fromCharCode(src[base + 118 + i]);
    return s;
  }
  setBank(b) { this.bank = Math.max(0, Math.min(K_BANKS - 1, b | 0)); }
  setProgram(p) { this.program = (p | 0) & 31; }
  setCoarse(s) { this.coarse = Math.round(s); }
  setFine(c) { this.fine = +c; }
  setLevel(l) { this.level = Math.max(0, Math.min(1, +l)); }

  // ── noten ──
  setPitch(v, semis) {
    const base = Math.floor(semis);
    let frac = semis - base;
    let m = base;
    if (m < 0) { m = 0; frac = 0; }
    if (m > 127) { m = 127; frac = 0; }
    v.pitchbend = 0x2000 + Math.trunc(frac * (0x2000 / 3));
    return m;
  }
  noteOn(midinote, velocity) {
    velocity = Math.max(1, Math.min(127, velocity | 0));
    let v = null;
    for (const c of this.voices) if (c.midinote === midinote && c.gate) { v = c; break; }
    if (!v) for (const c of this.voices) if (c.midinote < 0) { v = c; break; }
    if (!v) {
      let best = Infinity;
      for (const c of this.voices) {
        const a = c.age + (c.gate ? 0x40000000 : 0);
        if (a < best) { best = a; v = c; }
      }
    }
    this.applyPatch(v);
    const m = this.setPitch(v, midinote + this.coarse + this.fine * 0.01);
    v.note.init(v.patch, m, velocity);
    v.lfo.keydown();
    v.gate = true;
    v.age = ++this.ageCounter;
    v.quiet = 0;
    v.midinote = midinote;
  }
  noteOff(midinote) {
    for (const v of this.voices) if (v.midinote === midinote && v.gate) { v.note.keyup(); v.gate = false; }
  }
  allOff() {
    for (const v of this.voices) if (v.gate) { v.note.keyup(); v.gate = false; }
  }
  activeVoices() { let n = 0; for (const v of this.voices) if (v.midinote >= 0) n++; return n; }

  // ── render: `frames` (veelvoud van 64) mono floats in this.out ──
  render(frames) {
    if (frames > K_MAX_FRAMES) frames = K_MAX_FRAMES;
    frames -= frames % N;
    const out = this.out;
    out.fill(0, 0, frames);
    const scale = this.level / 32768;
    const scratch = this.scratch;
    for (const v of this.voices) {
      if (v.midinote < 0) continue;
      let peak = 0;
      for (let off = 0; off < frames; off += N) {
        scratch.fill(0);
        const lfoValue = v.lfo.getsample();
        const lfoDelay = v.lfo.getdelay();
        v.note.compute(scratch, lfoValue, lfoDelay, v.pitchbend);
        for (let i = 0; i < N; i++) {
          let val = scratch[i] >> 4;
          if (val < -(1 << 24)) val = -(1 << 24);
          if (val >= (1 << 24)) val = (1 << 24) - 1;
          val >>= 9;
          const a = val < 0 ? -val : val;
          if (a > peak) peak = a;
          out[off + i] += val * scale;
        }
      }
      if (!v.gate) {
        v.quiet = peak < 2 ? v.quiet + frames / N : 0;
        if (v.quiet >= 100) v.midinote = -1;
      }
    }
    return frames;
  }
}
