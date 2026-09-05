// Rooktest voor dx7.wasm onder node: init, ROM-bank laden, E.PIANO 1 spelen,
// 1 s renderen en piek/RMS rapporteren. Schrijft ook een .wav naar /tmp.
//   node tools/dx7-wasm/test.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wasmBytes = readFileSync(join(root, 'editor/public/dx7/dx7.wasm'));
const roms = readFileSync(join(root, 'editor/public/dx7/roms.bin'));

// WASI-stubs: de kern doet geen I/O, maar libc kan symbolen importeren.
const wasi = new Proxy({}, { get: (_, name) => (...a) => { if (name === 'proc_exit') throw new Error('proc_exit ' + a[0]); return 0; } });
const { instance } = await WebAssembly.instantiate(wasmBytes, { wasi_snapshot_preview1: wasi, env: {} });
const ex = instance.exports;
console.log('exports:', Object.keys(ex).join(' '));
const mem = () => new Uint8Array(ex.memory.buffer);

ex.dx7_init();
for (let b = 0; b < 8; b++) {
  const p = ex.dx7_bank_ptr(b);
  mem().set(roms.subarray(b * 4096, (b + 1) * 4096), p);
  ex.dx7_bank_loaded(b, 1);
}
const nameBuf = ex.dx7_bank_ptr(8); // tijdelijk als scratch voor de naam
function voiceName() { ex.dx7_voice_name(nameBuf); return Buffer.from(mem().subarray(nameBuf, nameBuf + 10)).toString('latin1'); }

function render(bank, prog, note, vel, secs, holdSecs) {
  ex.dx7_set_bank(bank); ex.dx7_set_program(prog);
  const name = voiceName();
  ex.dx7_note_on(note, vel);
  const total = Math.round(44100 * secs / 64) * 64;
  const out = new Float32Array(total);
  let pos = 0, pk = 0, sq = 0;
  while (pos < total) {
    if (holdSecs !== undefined && pos >= holdSecs * 44100 && pos < holdSecs * 44100 + 512) ex.dx7_note_off(note);
    const n = Math.min(512, total - pos);
    ex.dx7_render(n);
    const buf = new Float32Array(ex.memory.buffer, ex.dx7_out_ptr(), n);
    for (let i = 0; i < n; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; sq += buf[i] * buf[i]; }
    out.set(buf, pos); pos += n;
  }
  ex.dx7_all_off();
  return { name, pk, rms: Math.sqrt(sq / total), out };
}

const r = render(0, 10, 60, 100, 2.0, 1.0);
console.log(`bank 1A prog 11 "${r.name}"  C4 vel100: peak ${r.pk.toFixed(3)} rms ${r.rms.toFixed(4)} voices-after ${ex.dx7_active_voices()}`);
const r2 = render(0, 0, 48, 127, 1.0);
console.log(`bank 1A prog 1 "${r2.name}"  C3 vel127: peak ${r2.pk.toFixed(3)} rms ${r2.rms.toFixed(4)}`);

// Akkoord + CPU-meting
ex.dx7_set_bank(0); ex.dx7_set_program(10);
for (const n of [60, 64, 67, 72, 76, 79, 84, 88]) ex.dx7_note_on(n, 100);
const t0 = process.hrtime.bigint();
for (let i = 0; i < 44100 / 512; i++) ex.dx7_render(512);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`8 stemmen: ${ms.toFixed(1)} ms per 1 s audio = ${(ms / 10).toFixed(1)}% CPU`);
ex.dx7_all_off();

// WAV van de eerste render, om te beluisteren.
const pcm = new Int16Array(r.out.length);
for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(r.out[i] * 32767)));
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length * 2, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(44100, 24);
hdr.writeUInt32LE(88200, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length * 2, 40);
const wavPath = process.env.DX7_WAV ?? '/tmp/dx7-epiano.wav';
writeFileSync(wavPath, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
console.log('wav:', wavPath);
