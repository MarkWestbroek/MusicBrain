// compare — zet een opname van een échte DX7 naast onze msfa-render en meet
// waar ze verschillen. Bedoeld voor de side-by-side met een hardware-DX7.
//
//   node tools/dx7-wasm/compare.mjs <opname.wav> [bank] [program] [midinote] [velocity]
//   node tools/dx7-wasm/compare.mjs --selftest
//
// Wat het doet:
//   1. rendert dezelfde voice/noot met onze DX7-kern (roms.bin);
//   2. lijnt beide uit op de aanslag (kruiscorrelatie) en trekt het niveau gelijk;
//   3. meet per partiaal de amplitude over de tijd → envelope-tijden en
//      spectrale balans los van elkaar;
//   4. meet de ruisvloer als functie van het signaalniveau — dat onderscheidt
//      lineaire PCM van de companding-DAC van de DX7 ("grunge").
//
// Twee verschillen zijn vooraf te verwachten:
//   • Envelope-tempo. msfa's `Env` telt per blok van 64 samples en kent geen
//     samplerate (anders dan Lfo/PitchEnv, die die wél krijgen). Wij draaien
//     op 44,1 kHz, het origineel op ~49 kHz, dus onze amplitude-envelopes
//     lopen ~11 % trager in echte tijd. Meetbaar en repareerbaar.
//   • Uitgangstrap. De DX7 heeft een companding-DAC: de kwantisatiestap
//     schaalt mee met het signaalniveau, dus de ruis blijft relatief gelijk
//     in plaats van weg te zakken. Zie `--selftest` voor de detector.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── wav inlezen (16/24/32-bit PCM en float) ───────────────────────────
function readWav(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: geen RIFF/WAVE`);
  }
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2),
        rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = { off: body, size: Math.min(size, b.length - body) };
    }
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${path}: fmt/data ontbreekt`);
  const bytes = fmt.bits >> 3;
  const frames = Math.floor(data.size / (bytes * fmt.channels));
  const out = new Float32Array(frames);          // kanaal 0 (of gemengd)
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = data.off + (i * fmt.channels + c) * bytes;
      let v = 0;
      if (fmt.format === 3 && fmt.bits === 32) v = b.readFloatLE(p);
      else if (fmt.bits === 16) v = b.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) v = ((b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) << 8 >> 8) << 8 >> 8) / 8388608;
      else if (fmt.bits === 32) v = b.readInt32LE(p) / 2147483648;
      else if (fmt.bits === 8) v = (b[p] - 128) / 128;
      acc += v;
    }
    out[i] = acc / fmt.channels;
  }
  return { data: out, rate: fmt.rate, channels: fmt.channels, bits: fmt.bits };
}

// ── onze DX7-kern ─────────────────────────────────────────────────────
async function renderReference(bank, program, midi, velocity, seconds, rate, holdSeconds = Infinity) {
  const src = readFileSync(join(root, 'editor/public/dx7/dx7-core.js'), 'utf8')
    .replace(/^export /gm, '');
  const mk = new Function(`${src}\nreturn { Dx7Core, SAMPLE_RATE };`)();
  const core = new mk.Dx7Core();
  const roms = readFileSync(join(root, 'editor/public/dx7/roms.bin'));
  for (let b = 0; b < 8; b++) core.writeBank(b, roms.subarray(b * 4096, (b + 1) * 4096));
  core.setBank(bank); core.setProgram(program);
  const name = core.voiceName();
  const total = Math.round(seconds * mk.SAMPLE_RATE);
  const out = new Float32Array(total);
  core.noteOn(midi, velocity);
  const releaseAt = Math.round(holdSeconds * mk.SAMPLE_RATE);
  let p = 0, released = false;
  while (p < total) {
    if (!released && p >= releaseAt) { core.noteOff(midi); released = true; }
    // render() rondt af op blokken van 64; bij een kleinere rest levert hij 0
    // en zijn we klaar (anders draait deze lus eeuwig).
    const n = core.render(Math.min(512, total - p));
    if (n <= 0) break;
    out.set(core.out.subarray(0, Math.min(n, total - p)), p);
    p += n;
  }
  return { data: out, rate: mk.SAMPLE_RATE, name, sourceRate: rate };
}

// ── hulpjes ───────────────────────────────────────────────────────────
/** Eerste frame waar het signaal boven `frac` van zijn piek komt. */
function onset(x, frac = 0.02) {
  let pk = 0;
  for (const v of x) { const a = Math.abs(v); if (a > pk) pk = a; }
  const thr = pk * frac;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) return i;
  return 0;
}
function peak(x, from = 0, to = x.length) {
  let pk = 0;
  for (let i = from; i < to; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
  return pk;
}
/** RMS-envelope in dB t.o.v. de eigen piek, met tijdstempels. */
function envelopeDb(x, rate, hop = 64, win = 512) {
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const db = new Float32Array(n), t = new Float32Array(n);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < win; j++) { const v = x[i * hop + j]; s += v * v; }
    const r = Math.sqrt(s / win);
    db[i] = r; t[i] = (i * hop) / rate;
    if (r > pk) pk = r;
  }
  for (let i = 0; i < n; i++) db[i] = 20 * Math.log10(Math.max(db[i], pk * 1e-7) / pk);
  return { db, t };
}
/** Tijd (s) waarop de envelope voor het eerst onder `target` dB zakt. */
function timeToDb({ db, t }, target) {
  let peakIdx = 0;
  for (let i = 1; i < db.length; i++) if (db[i] > db[peakIdx]) peakIdx = i;
  for (let i = peakIdx; i < db.length; i++) if (db[i] <= target) return t[i] - t[peakIdx];
  return NaN;
}
/** Goertzel: amplitude van één frequentie in een venster. */
function goertzel(x, from, len, hz, rate) {
  const k = (2 * Math.PI * hz) / rate;
  const coeff = 2 * Math.cos(k);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));   // hann
    s0 = (x[from + i] ?? 0) * w + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2)) / len;
}

/**
 * Ruisvloer als functie van het signaalniveau — de meting die lineaire PCM
 * van een companding-DAC onderscheidt.
 *
 * De truc is *waar* je de ruis meet: niet in een hoge band (daar zit bij FM
 * gewoon signaal), maar **tussen de partialen in**. Op f0·(h+½) hoort niets
 * te staan, dus wat daar overblijft is kwantisatie- en analoge ruis. Meet je
 * dat langs de uitsterving, dan geldt:
 *
 *   ruis blijft vlak terwijl het signaal zakt  → helling ≈ 0 → vaste
 *     kwantisatiestap, dus lineaire PCM;
 *   ruis zakt mee met het signaal              → helling ≈ 1 → de stap
 *     schaalt met het niveau, zoals de floating-point DAC van de DX7.
 */
function noiseVsLevel(x, rate, f0, win = 8192, hop = 8192) {
  const pts = [];
  if (!(f0 > 0)) return pts;
  for (let p = 0; p + win <= x.length; p += hop) {
    let sig = 0;
    for (let i = 0; i < win; i++) sig += x[p + i] * x[p + i];
    sig = Math.sqrt(sig / win);
    if (sig < 1e-7) continue;
    // Gemiddelde amplitude in de dalen tussen de eerste twaalf partialen.
    let noise = 0, n = 0;
    for (let h = 1; h <= 12; h++) {
      const hz = f0 * (h + 0.5);
      if (hz > rate / 2.4) break;
      noise += goertzel(x, p, win, hz, rate); n++;
    }
    if (!n) continue;
    noise /= n;
    pts.push({ t: p / rate, sigDb: 20 * Math.log10(sig), noiseDb: 20 * Math.log10(Math.max(noise, 1e-12)) });
  }
  return pts;
}

/** Helling van ruisniveau tegen signaalniveau (dB per dB).
 *  ≈ 0 → vaste kwantisatiestap (lineaire PCM).
 *  ≈ 1 → stap schaalt mee met het signaal (companding, zoals de DX7). */
function nsrSlope(pts) {
  const use = pts.filter((p) => p.sigDb > -70 && p.sigDb < -1);
  if (use.length < 4) return NaN;
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of use) { n++; sx += p.sigDb; sy += p.noiseDb; sxx += p.sigDb * p.sigDb; sxy += p.sigDb * p.noiseDb; }
  const d = n * sxx - sx * sx;
  return Math.abs(d) < 1e-9 ? NaN : (n * sxy - sx * sy) / d;
}

/** Companding-kwantisator: 10-bits mantisse met een schaal per octaaf —
 *  het gedrag van een floating-point DAC zoals in de DX7. */
export function compand(x, mantissaBits = 10) {
  const out = new Float32Array(x.length);
  const levels = 1 << (mantissaBits - 1);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v);
    if (a < 1e-9) { out[i] = 0; continue; }
    const exp = Math.max(-7, Math.ceil(Math.log2(a)));      // octaafband
    const scale = Math.pow(2, exp);
    out[i] = (Math.round((v / scale) * levels) / levels) * scale;
  }
  return out;
}

// ── vergelijking ──────────────────────────────────────────────────────
function compare(refSig, refRate, testSig, testRate, f0, label) {
  const r0 = onset(refSig), t0 = onset(testSig);
  const refPk = peak(refSig, r0), testPk = peak(testSig, t0);
  const g = refPk > 0 ? testPk / refPk : 1;

  console.log(`\n── ${label} ──`);
  console.log(`  aanslag op ${(r0 / refRate * 1000).toFixed(0)} ms (referentie) / ` +
    `${(t0 / testRate * 1000).toFixed(0)} ms (opname); niveauverschil ${(20 * Math.log10(g || 1)).toFixed(1)} dB`);

  // Envelope-tijden.
  const refEnv = envelopeDb(refSig.subarray(r0), refRate);
  const testEnv = envelopeDb(testSig.subarray(t0), testRate);
  console.log('  envelope        −6 dB     −20 dB    −40 dB');
  const rows = [['referentie', refEnv], ['opname', testEnv]];
  const times = {};
  for (const [name, env] of rows) {
    const a = timeToDb(env, -6), b = timeToDb(env, -20), c = timeToDb(env, -40);
    times[name] = [a, b, c];
    console.log(`    ${name.padEnd(12)} ${fmtS(a)}  ${fmtS(b)}  ${fmtS(c)}`);
  }
  const ratios = [0, 1, 2].map((i) => times['opname'][i] / times['referentie'][i]).filter((v) => isFinite(v) && v > 0);
  if (ratios.length) {
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    console.log(`    verhouding opname/referentie: ×${mean.toFixed(3)} ` +
      `(voorspelling bij 44,1 k vs 49,1 k: ×${(44100 / 49096).toFixed(3)} — onze envelopes zijn dan trager)`);
  }

  // Partialen: amplitude van de eerste harmonischen, 100 ms na de aanslag.
  if (f0 > 0) {
    console.log('  partiaal   referentie   opname    verschil');
    for (let h = 1; h <= 8; h++) {
      const hz = f0 * h;
      if (hz > Math.min(refRate, testRate) / 2.2) break;
      const win = 4096;
      const ra = goertzel(refSig, r0 + Math.round(0.1 * refRate), win, hz, refRate);
      const ta = goertzel(testSig, t0 + Math.round(0.1 * testRate), win, hz, testRate) / (g || 1);
      const rd = 20 * Math.log10(Math.max(ra, 1e-9)), td = 20 * Math.log10(Math.max(ta, 1e-9));
      console.log(`    ${String(h).padStart(2)} (${hz.toFixed(0).padStart(5)} Hz)  ` +
        `${rd.toFixed(1).padStart(7)}  ${td.toFixed(1).padStart(8)}  ${(td - rd >= 0 ? '+' : '')}${(td - rd).toFixed(1)} dB`);
    }
  }

  // Ruisgedrag → lineair of companding? Het absolute getal wordt gedrukt
  // doordat er ook echt signaal tussen de partialen staat (FM-zijbanden
  // liggen dicht); het *verschil* tussen beide kolommen is de meting.
  if (f0 > 0) {
    const slopes = {};
    for (const [name, sig, rate, on] of [['referentie', refSig, refRate, r0], ['opname', testSig, testRate, t0]]) {
      const slope = nsrSlope(noiseVsLevel(sig.subarray(on), rate, f0));
      slopes[name] = slope;
      console.log(`  ruis vs. niveau ${name.padEnd(12)} helling ${isFinite(slope) ? slope.toFixed(2) : ' n/a'} dB/dB`);
    }
    const d = slopes['opname'] - slopes['referentie'];
    if (isFinite(d)) {
      console.log(`    verschil ${(d >= 0 ? '+' : '')}${d.toFixed(2)} dB/dB → ` + (d > 0.2
        ? 'de ruis in de opname zakt mee met het niveau: niveau-afhankelijke kwantisatiestap (companding-DAC)'
        : d < -0.2
          ? 'de ruis in de opname blijft juist vlakker dan bij ons — vaste stap of analoge ruisvloer'
          : 'geen duidelijk verschil in ruisgedrag'));
    }
  }
}
const fmtS = (v) => (isFinite(v) ? `${v.toFixed(3)} s` : '   —   ').padStart(9);

// ── zelftest: valideer de tool zonder hardware ────────────────────────
async function selftest() {
  console.log('zelftest — de tool moet twee kunstmatige verschillen terugvinden.\n');
  // E.PIANO 1 met note-off na 0,4 s: een échte uitsterving om tijden op te meten.
  const ref = await renderReference(0, 10, 60, 100, 3.0, 44100, 0.4);
  console.log(`referentie: bank 1A, "${ref.name.trim()}", C4 vel 100, ${ref.rate} Hz, note-off na 0,4 s`);

  // (a) envelope 11 % sneller: nabootsen door sneller uit te lezen (dat
  //     verandert ook de toonhoogte — hier gaat het om de envelope-meting).
  const speed = 49096 / 44100;
  const fast = new Float32Array(Math.floor(ref.data.length / speed));
  for (let i = 0; i < fast.length; i++) {
    const p = i * speed, i0 = Math.floor(p), f = p - i0;
    fast[i] = (ref.data[i0] ?? 0) * (1 - f) + (ref.data[i0 + 1] ?? 0) * f;
  }
  compare(ref.data, ref.rate, fast, ref.rate, 0, 'test A: envelopes 11,3 % sneller');

  // (b) companding-kwantisatie op een uitstervende toon.
  const lin = Float32Array.from(ref.data, (v) => Math.round(v * 2048) / 2048);   // 12-bits lineair
  const comp = compand(ref.data, 10);
  compare(lin, ref.rate, comp, ref.rate, 261.63, 'test B: lineair 12-bits vs companding 10+3');
}

// ── main ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv[0] === '--selftest' || argv.length === 0) {
  await selftest();
} else {
  const [file, bank = '0', program = '0', midi = '60', vel = '100'] = argv;
  const rec = readWav(file);
  const seconds = rec.data.length / rec.rate;
  const ref = await renderReference(+bank, +program, +midi, +vel, Math.min(seconds, 8), rec.rate);
  const f0 = 440 * Math.pow(2, (+midi - 69) / 12);
  console.log(`opname:     ${file} — ${rec.rate} Hz, ${rec.channels} kanaal(en), ${rec.bits} bits, ${seconds.toFixed(2)} s`);
  console.log(`referentie: bank ${bank} program ${program} "${ref.name.trim()}", MIDI ${midi} vel ${vel}, ${ref.rate} Hz`);
  compare(ref.data, ref.rate, rec.data, rec.rate, f0, `${file} vs onze DX7`);
}
