// Maakt een testopname én de bank die eruit volgt, zodat de multisample-
// import zonder microfoon te proberen is:
//
//   editor/public/samples/elements-take.wav   "opname": Elements, 3 noten ×
//                                             3 aanslagen, stereo, stiltes
//   editor/public/banks/elements.mmbs         de resulterende samplebank
//
// De take komt uit de Elements-wasm zelf — inharmonisch materiaal met een
// echte aanslag en uitsterving, dus een eerlijker proef dan een sinus. Let op:
// bij geometry 0,42 ligt de waargenomen toon 60–95 cent boven de nominale
// noot (uitgerekte partialen; bij geometry 0,25 klopt Elements exact). Dat is
// echt gedrag van het model, geen stemfout — en meteen een goede oefening in
// "geef de noten van tevoren op" bij inharmonisch materiaal.
//
// De .mmbs wordt hier alleen ter controle geschreven en staat niet in git:
// het maken van de bank ís de oefening in de importer.
//   node tools/mmb-wasm/make-test-bank.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'mmb-bank-'));
execFileSync(join(root, 'editor/node_modules/.bin/esbuild'), [
  join(root, 'editor/src/modular-mb/sampleAnalysis.ts'),
  join(root, 'editor/src/modular-mb/sampleBank.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outdir=${tmp}`,
], { stdio: 'pipe' });
const A = await import(join(tmp, 'sampleAnalysis.js'));
const B = await import(join(tmp, 'sampleBank.js'));

// ── 1. Elements-take renderen ─────────────────────────────────────────
async function loadModule(typeId) {
  const mod = await WebAssembly.compile(readFileSync(join(root, 'editor/public/wasm', typeId + '.wasm')));
  const imports = {};
  for (const imp of WebAssembly.Module.imports(mod)) { imports[imp.module] ??= {}; imports[imp.module][imp.name] = () => 0; }
  const ex = (await WebAssembly.instantiate(mod, imports)).exports;
  const cstr = (p) => { const m = new Uint8Array(ex.memory.buffer); let s = ''; for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]); return s; };
  ex.mmb_init();
  const ins = new Map(), ctls = new Map(), outs = [];
  for (let i = 0; i < ex.mmb_num_inputs(); i++) ins.set(cstr(ex.mmb_input_id(i)), i);
  for (let i = 0; i < ex.mmb_num_controls(); i++) ctls.set(cstr(ex.mmb_control_id(i)), i);
  for (let i = 0; i < ex.mmb_num_outputs(); i++) outs.push(i);
  return {
    ex, rate: ex.mmb_native_rate(), block: ex.mmb_block(), outs,
    setIn: (id, v) => { const i = ins.get(id); if (i === undefined) return; new Float32Array(ex.memory.buffer, ex.mmb_input_ptr(i), 256).fill(v); ex.mmb_input_connected(i, 1); },
    ctl: (id, v) => { const i = ctls.get(id); if (i !== undefined) ex.mmb_set_control(i, v); },
    out: (i) => new Float32Array(ex.memory.buffer, ex.mmb_output_ptr(i), ex.mmb_block()),
  };
}

const el = await loadModule('tp_mmb_elements');
// Mallet op een licht inharmonische resonator: aanslag, klank, lange staart.
el.ctl('strike', 0.85); el.ctl('bow', 0); el.ctl('blow', 0);
el.ctl('geometry', 0.42); el.ctl('brightness', 0.55); el.ctl('damping', 0.72);
el.ctl('position', 0.28); el.ctl('strike_meta', 0.45); el.ctl('strike_timbre', 0.5);
el.ctl('space', 0.15); el.ctl('level', 0.9);

const NOTES = [48, 55, 60];               // C3, G3, C4
const STRENGTH = [0.22, 0.5, 0.95];       // zacht / midden / hard
const NOTE_SECONDS = 2.0, GAP_SECONDS = 1.2;
const RATE = el.rate;                     // Elements rendert op 32 kHz
const CH = 2;

// Zet de CV's en laat ze *eerst* inregelen. Zonder deze pauze gebruikt de
// eerste aanslag na een wissel nog de vorige `strength` — Elements smoothet
// zijn ingangen, en de mallet vuurt op t=0 voordat de nieuwe waarde er is.
// Gemeten: zonder settle kwamen de drie lagen van G3 uit op 0,86 / 0,28 / 0,78
// (zacht harder dan hard), met settle op 0,19 / 0,47 / 0,90. Voor een échte
// opname is het dezelfde regel: laat het instrument tot rust komen.
const SETTLE_SECONDS = 0.25;

function renderNote(midi, strength) {
  el.setIn('voct', (midi - 60) / 12);
  el.setIn('strength', strength);
  el.setIn('gate', 0);
  for (let t = 0; t < SETTLE_SECONDS * RATE; t += el.block) el.ex.mmb_render(el.block);
  const frames = Math.round(NOTE_SECONDS * RATE);
  const gapFrames = Math.round(GAP_SECONDS * RATE);
  const out = new Float32Array((frames + gapFrames) * CH);
  const gateFrames = Math.round(0.06 * RATE);
  for (let t = 0; t < frames + gapFrames; t += el.block) {
    el.setIn('gate', t < gateFrames ? 1 : 0);
    el.ex.mmb_render(el.block);
    const l = el.out(0), r = el.out(1);
    for (let k = 0; k < el.block && t + k < frames + gapFrames; k++) {
      out[(t + k) * CH] = l[k];
      out[(t + k) * CH + 1] = r[k];
    }
  }
  return out;
}

const parts = [];
for (const midi of NOTES) {
  const peaks = [];
  for (const s of STRENGTH) {
    const part = renderNote(midi, s);
    let pk = 0;
    for (const v of part) { const a = Math.abs(v); if (a > pk) pk = a; }
    peaks.push(pk);
    parts.push(part);
  }
  // De lagen moeten oplopen — anders kiest de importer straks wel de goede
  // zone, maar hoor je geen verschil tussen zacht en hard.
  const db = peaks.map((p) => (20 * Math.log10(p / Math.max(...peaks))).toFixed(1));
  const mono = peaks.every((p, i) => i === 0 || p > peaks[i - 1]);
  console.log(`  noot ${midi}: pieken ${peaks.map((p) => p.toFixed(3)).join(' ')} (${db.join(' / ')} dB)${mono ? '' : '  ⚠ niet oplopend'}`);
}
const totalFrames = parts.reduce((n, p) => n + p.length / CH, 0);
const take = new Float32Array(totalFrames * CH);
let off = 0;
for (const p of parts) { take.set(p, off); off += p.length; }

// Eén globale gain (piek ≈ −1 dBFS) — precies de opnamepraktijk.
let peak = 0;
for (const v of take) { const a = Math.abs(v); if (a > peak) peak = a; }
if (peak > 0) { const g = 0.89 / peak; for (let i = 0; i < take.length; i++) take[i] *= g; }
console.log(`take: ${(totalFrames / RATE).toFixed(1)} s stereo @ ${RATE} Hz, ${parts.length} aanslagen`);

// ── 2. als wav wegschrijven ───────────────────────────────────────────
function wav(interleaved, channels, rate) {
  const pcm = new Int16Array(interleaved.length);
  for (let i = 0; i < interleaved.length; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(interleaved[i] * 32767)));
  }
  const h = Buffer.alloc(44), byteRate = rate * channels * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer)]);
}
mkdirSync(join(root, 'editor/public/samples'), { recursive: true });
mkdirSync(join(root, 'editor/public/banks'), { recursive: true });
const wavPath = join(root, 'editor/public/samples/elements-take.wav');
writeFileSync(wavPath, wav(take, CH, RATE));
console.log(`wav: ${wavPath} (${(take.length * 2 / 1048576).toFixed(2)} MB)`);

// ── 3. analyseren zoals de importer dat doet ──────────────────────────
const mono = A.toMono(take, CH);
const segs = A.segmentRecording(mono, RATE, { minGap: 0.4, minLength: 0.3 });
const items = segs.map((s) => ({ segment: s, pitch: A.detectPitch(mono, RATE, s.start, s.end) }));
console.log(`\nsegmenten: ${segs.length} (verwacht ${parts.length})`);
console.log('gedetecteerd vs. werkelijk:');
items.forEach((it, i) => {
  const want = NOTES[Math.floor(i / STRENGTH.length)];
  console.log(`  ${String(i).padStart(2)}  ${it.pitch.hz.toFixed(1).padStart(7)} Hz → MIDI ` +
    `${String(it.pitch.midi).padStart(3)}  conf ${it.pitch.confidence.toFixed(2)}  ` +
    `werkelijk ${want}  ${it.pitch.midi === want ? '✓' : '✗'}`);
});

// Noten van tevoren opgeven — de betrouwbare route bij inharmonisch materiaal.
const expected = A.parseNoteList('C3 G3 C4');
const midis = A.applyExpectedNotes(items.map((i) => i.pitch), expected, STRENGTH.length);
// Hermeten rond de opgegeven noot: bij inharmonisch materiaal is vrije YIN
// onbetrouwbaar, maar met de zoekruimte dichtgeknepen klopt de afwijking wel.
const withMidi = items.map((it, i) => ({
  segment: it.segment,
  pitch: A.refinePitchNear(mono, RATE, it.segment.start, it.segment.end, midis[i]),
}));
const layered = A.assignVelocityLayers(withMidi, STRENGTH.length);
const ranges = A.spreadKeyRanges(layered.map((l) => l.pitch.midi));
console.log(`\nkeymap met opgegeven noten (${expected.join(' ')}):`);

// ── 4. bank bouwen ────────────────────────────────────────────────────
const slots = [], zones = [];
layered.forEach((l, i) => {
  const cut = Float32Array.from(take.subarray(l.segment.start * CH, l.segment.end * CH));
  const pcm = new Int16Array(cut.length);
  for (let k = 0; k < cut.length; k++) pcm[k] = Math.max(-32768, Math.min(32767, Math.round(cut[k] * 32767)));
  slots.push({ data: pcm, channels: CH, rate: RATE });
  const r = ranges.get(l.pitch.midi);
  const dec = A.measureDecay(mono, RATE, l.segment.start, l.segment.end);
  zones.push({
    slot: i, lowKey: r.low, highKey: r.high, lowVel: l.lowVel, highVel: l.highVel,
    root: l.pitch.midi, tuneCents: A.safeTuneCents(l.pitch.cents, l.pitch.confidence), gain: 1, pan: 0,
    loopMode: 0, loopStart: 0, loopEnd: 0, decay: 0, release: 0.12,
  });
  console.log(`  slot ${String(i).padStart(2)}  MIDI ${l.pitch.midi} (${(l.segment.end - l.segment.start) / RATE < 10 ? ((l.segment.end - l.segment.start) / RATE).toFixed(2) : '?'} s)  ` +
    `keys ${String(r.low).padStart(3)}–${String(r.high).padStart(3)}  vel ${String(l.lowVel).padStart(3)}–${String(l.highVel).padStart(3)}  ` +
    `${l.pitch.cents >= 0 ? '+' : ''}${l.pitch.cents} ct  T60 ${dec.slowT60.toFixed(1)} s`);
});
const bank = B.buildBank('elements-test', slots, zones);
const bankPath = join(root, 'editor/public/banks/elements.mmbs');
writeFileSync(bankPath, Buffer.from(bank));
console.log(`\nbank: ${bankPath} — ${B.bankSummary(slots, zones)}`);

// ── 5. bank teruglezen: magic, tabellen, en de eerste zone ───────────
{
  const buf = readFileSync(bankPath);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  const version = dv.getUint32(4, true), nSlots = dv.getUint32(8, true), nZones = dv.getUint32(12, true);
  let name = ''; for (let i = 16; i < 48 && buf[i]; i++) name += String.fromCharCode(buf[i]);
  const z0 = 44 + 16 * nSlots;
  console.log(`teruglezen: magic "${magic}" v${version} · ${nSlots} slots · ${nZones} zones · naam "${name}"`);
  console.log(`  slot 0: ${dv.getUint32(48, true)} frames, ${dv.getUint16(52, true)} kanalen, ${dv.getFloat32(56, true)} Hz`);
  console.log(`  zone 0: slot ${dv.getUint16(z0, true)}, keys ${buf[z0 + 2]}–${buf[z0 + 3]}, ` +
    `vel ${buf[z0 + 4]}–${buf[z0 + 5]}, root ${dv.getFloat32(z0 + 8, true)}`);
  const ok = magic === 'MMBS' && version === 1 && nSlots === slots.length && nZones === zones.length;
  console.log(`  ${ok ? '✓ bank leest correct terug' : '✗ bank klopt niet'}`);
}

// ── 6. door de sampler-wasm spelen ────────────────────────────────────
{
  const src = readFileSync(join(root, 'editor/public/wasm/mmb-worklet.js'), 'utf8');
  const reg = {};
  const AWP = class { constructor() { this.port = { onmessage: null, postMessage: () => {} }; } };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', src)(AWP, (n, c) => { reg[n] = c; }, 48000);
  const wasm = new Uint8Array(readFileSync(join(root, 'editor/public/wasm/tp_mmb_sampler.wasm')));
  const P = new reg['mmb-wasm']({ processorOptions: { wasm, inputs: ['voct', 'gate', 'vel'], outputs: ['out_l', 'out_r', 'out_3', 'out_4'] } });
  slots.forEach((s, i) => P.port.onmessage({ data: { t: 'blob', slot: i, rate: s.rate, channels: CH, data: s.data } }));
  P.port.onmessage({ data: { t: 'zones', zones } });
  const ins = [0, 1, 2].map(() => [new Float32Array(128)]);
  const outs = [0, 1, 2, 3].map(() => [new Float32Array(128)]);
  console.log('\nafspelen uit de bank:');
  // Verwachting: de zone speelt zijn *gemeten* grondtoon, getransponeerd —
  // niet de nominale gelijkzwevende toon (dit materiaal ligt daarboven).
  const rootHz = new Map();
  layered.forEach((l) => { if (!rootHz.has(l.pitch.midi)) rootHz.set(l.pitch.midi, l.pitch.hz); });
  for (const [midi, vel] of [[48, 30], [48, 100], [55, 100], [60, 100], [52, 100]]) {
    P.port.onmessage({ data: { t: 'in', id: 'voct', v: (midi - 60) / 12 } });
    P.port.onmessage({ data: { t: 'in', id: 'vel', v: vel / 127 } });
    P.port.onmessage({ data: { t: 'in', id: 'gate', v: 0 } });
    for (let b = 0; b < 4; b++) P.process(ins, outs);
    P.port.onmessage({ data: { t: 'in', id: 'gate', v: 1 } });
    const cap = new Float32Array(48000);
    let pk = 0;
    for (let b = 0; b < 375; b++) {
      P.process(ins, outs);
      for (let i = 0; i < 128; i++) { const v = outs[0][0][i]; cap[b * 128 + i] = v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    }
    P.port.onmessage({ data: { t: 'in', id: 'gate', v: 0 } });
    for (let b = 0; b < 20; b++) P.process(ins, outs);
    const zone = zones.find((z) => midi >= z.lowKey && midi <= z.highKey && vel >= z.lowVel && vel <= z.highVel);
    const want = (rootHz.get(zone.root) ?? A.midiToHz(zone.root)) * Math.pow(2, (midi - zone.root) / 12);
    const p = A.refinePitchNear(cap, 48000, 0, cap.length, Math.round(A.hzToMidi(want)), 440, 7);
    const off = 1200 * Math.log2(p.hz / want);
    console.log(`  MIDI ${midi} vel ${String(vel).padStart(3)}  piek ${pk.toFixed(3)}  ` +
      `${p.hz.toFixed(1).padStart(7)} Hz (verwacht ${want.toFixed(1)}, zone root ${zone.root})  ` +
      `${(off >= 0 ? '+' : '')}${off.toFixed(0)} ct  ${Math.abs(off) < 25 ? '✓' : '✗'}`);
  }
}
