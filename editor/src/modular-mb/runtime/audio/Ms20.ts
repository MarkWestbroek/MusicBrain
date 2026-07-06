import { Vcf } from './Vcf';
import { registry, type ControlValue } from '../index';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Ms20 — internal MMB Korg35/MS-20 Sallen-Key VCF (firmware `tp_mmb_ms20`,
 * custom AudioStream: ZDF model after Pirkle, tanh loop, 2x oversampling).
 *
 * Sim-approximation: Tone.Filter (-12 dB/oct biquad). Controls:
 * - `cutoff`   : 20–18000 Hz, default 2000
 * - `q`        : resonance 0–1 (hardware self-oscillates at 1; mapped onto
 *                the biquad Q — self-oscillation and the tanh scream are
 *                NOT simulated)
 * - `drive`    : 0.1–10 — hardware tanh loop drive, no-op in the sim
 * - `cv_amt`   : cutoff-CV depth in octaves (0–7)
 * - `q_cv_amt` : Q-CV depth in resonance units (0–1)
 * - `type`     : 0=LP (12 dB), 1=HP (hardware 6 dB, sim 12 dB) — live switch
 *
 * Ports: `in` (audio), `cv` (cv → cutoff), `q_cv` (cv → resonance),
 * `out` (audio). Reuses the Vcf runtime/engine path.
 */
export class Ms20 extends Vcf {
  static override readonly typeId: string = 'tp_mmb_ms20';

  /** Hardware resonance 0–1 → biquad Q (self-osc at 1 approximated by high Q). */
  override resonanceToQ(q: number): number {
    return 0.7 + clamp(q, 0, 1) * 14;
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    if (id === 'drive') return; // hardware-only (tanh loop drive)
    if (id === 'type') {
      // Unlike the SVF, the hardware switches LP/HP live — mirror that here
      // instead of requiring an engine rebuild.
      this.filter.type = value === 1 ? 'highpass' : 'lowpass';
      return;
    }
    super.onControlChanged(id, value);
  }
}

// Self-registration: the registry maps typeId → factory.
registry.register(Ms20.typeId, (type, instance, initialControlValues) =>
  new Ms20(type, instance, initialControlValues),
);
