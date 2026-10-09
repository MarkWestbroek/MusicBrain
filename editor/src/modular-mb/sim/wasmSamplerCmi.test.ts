// Era CMI op de sampler (doc/plans/fairlight.md): de leeskop op het raster
// van de klok, zero-order hold zonder interpolatie, kwantiseren op Bits en
// een klokvolgend filter. Gemeten met een bank van één sinus van 3 kHz op
// 48 kHz, gespeeld op de grondtoon.

import { describe, expect, it } from 'vitest';

import { type Mod, load, peak, rms, toneLevel } from './wasmTestHost';

const BANK_RATE = 48000;
const HZ = 3000;

/** Sampler met één zone: een lus van één seconde 3 kHz, grondtoon C4. */
async function sampler(ctl: Record<string, number>, amp = 0.5, hz = HZ): Promise<Mod> {
  const m = await load('tp_mmb_sampler');
  const frames = BANK_RATE;
  const ptr = m.ex.mmb_blob_ptr(0, frames * 2) as number;
  const data = new Int16Array(m.ex.memory.buffer, ptr, frames);
  for (let i = 0; i < frames; i++) data[i] = Math.round(amp * 32767 * Math.sin(2 * Math.PI * hz * i / BANK_RATE));
  m.ex.mmb_blob_commit(0, frames, BANK_RATE, 1);
  // idx, slot, lowKey, highKey, lowVel, highVel, root, tune, gain, pan,
  // loopMode (2 = continu), loopStart, loopEnd, decay, release, velTrack, attack
  m.ex.mmb_zone_set(0, 0, 0, 127, 0, 127, 60, 0, 1, 0, 2, 0, frames, 0, 0.05, 0, 0);
  m.ex.mmb_zone_count(1);
  for (const [k, v] of Object.entries({ filter: 0, limit: 0, level: 1, ...ctl })) m.setCtl(k, v);
  m.setIn('voct_1', 0); m.setIn('vel_1', 1); m.setIn('gate_1', 1);
  return m;
}
const outOf = (m: Mod, s = 0.6): Float32Array => m.render(s).out_l!;

describe('sampler Era CMI', () => {
  it('Clean blijft schoon; CMI op 12 kHz geeft de spiegeling op 9 kHz', async () => {
    const clean = await sampler({ era: 0 });
    const c = outOf(clean);
    const cmi = await sampler({ era: 1, clock: 12000, bits: 12 });
    const x = outOf(cmi);
    const from = Math.round(0.1 * clean.rate);
    expect(toneLevel(c, HZ, clean.rate, from)).toBeGreaterThan(0.2);
    expect(toneLevel(x, HZ, cmi.rate, from)).toBeGreaterThan(0.1);
    const imgClean = toneLevel(c, 12000 - HZ, clean.rate, from);
    const imgCmi = toneLevel(x, 12000 - HZ, cmi.rate, from);
    expect(imgClean).toBeLessThan(0.002);
    expect(imgCmi).toBeGreaterThan(10 * imgClean + 0.005);
  });

  it('minder bits = meer vervorming naast de toon', async () => {
    // Een zachte toon (−26 dB) van 500 Hz: daar hoor je 8 bit op de CMI.
    // Klok 24 kHz op 48 kHz: het raster is precies 2 frames. Vervorming =
    // wat er overblijft van het vermogen na de grondtoon.
    const residual = async (bits: number): Promise<number> => {
      const m = await sampler({ era: 1, clock: 24000, bits }, 0.05, 500);
      const x = outOf(m);
      const from = Math.round(0.1 * m.rate);
      const a = toneLevel(x, 500, m.rate, from);
      const total = rms(x, from) ** 2;
      return Math.sqrt(Math.max(0, total - (a * a) / 2)) / a;
    };
    const r6 = await residual(6), r12 = await residual(12);
    expect(r6).toBeGreaterThan(3 * r12);
  });

  it('het filter volgt de toon: een octaaf lager is doffer (minder spiegeling)', async () => {
    const img = async (voct: number): Promise<number> => {
      const m = await sampler({ era: 1, clock: 12000, bits: 12 });
      m.setIn('voct_1', voct);
      const x = outOf(m);
      const from = Math.round(0.1 * m.rate);
      const f0 = HZ * 2 ** voct, clock = 12000 * 2 ** voct;
      return toneLevel(x, clock - f0, m.rate, from) / Math.max(1e-6, toneLevel(x, f0, m.rate, from));
    };
    // Relatief aan de grondtoon: hoog (0) houdt meer spiegeling dan laag (−1).
    expect(await img(0)).toBeGreaterThan(await img(-1));
  });

  it('blijft binnen de perken', async () => {
    const m = await sampler({ era: 1, clock: 8000, bits: 6 });
    const x = outOf(m, 0.4);
    expect(Number.isFinite(rms(x))).toBe(true);
    expect(peak(x)).toBeLessThan(1.2);
  });
});
