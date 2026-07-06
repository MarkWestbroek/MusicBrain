import { Vcf } from './Vcf';
import { registry, type ControlValue } from '../index';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Ladder — internal MMB Moog-style ladder VCF (firmware `tp_mmb_ladder`,
 * Teensy `AudioFilterLadder`, Huovilainen model).
 *
 * Sim-approximation: Tone.Filter lowpass with -24 dB/oct rolloff. Controls:
 * - `cutoff`   : 20–18000 Hz, default 2000
 * - `q`        : resonance 0–1.8 (hardware self-oscillates above ~1.1;
 *                mapped linearly onto the biquad Q — self-oscillation and
 *                the tanh feedback character are NOT simulated)
 * - `drive`    : 0–4 — hardware tanh input drive, no-op in the sim
 * - `cv_amt`   : cutoff-CV depth in octaves (0–7)
 * - `q_cv_amt` : Q-CV depth in resonance units (0–1)
 *
 * Ports: `in` (audio), `cv` (cv → cutoff), `q_cv` (cv → resonance),
 * `out` (audio). Reuses the Vcf runtime/engine path — AudioEngine treats it
 * as a `vcf` node; only `resonanceToQ` and the rolloff differ.
 */
export class Ladder extends Vcf {
  static override readonly typeId: string = 'tp_mmb_ladder';

  constructor(...args: ConstructorParameters<typeof Vcf>) {
    super(...args);
    this.filter.rolloff = -24;
  }

  /** Hardware resonance 0–1.8 → biquad Q (rough perceptual match). */
  override resonanceToQ(q: number): number {
    return 0.7 + clamp(q, 0, 1.8) * 6.5;
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    if (id === 'drive') return; // hardware-only (tanh input drive)
    super.onControlChanged(id, value);
  }
}

// Self-registration: the registry maps typeId → factory.
registry.register(Ladder.typeId, (type, instance, initialControlValues) =>
  new Ladder(type, instance, initialControlValues),
);
