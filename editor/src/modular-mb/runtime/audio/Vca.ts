import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { AudioModule } from '../AudioModule';
import { registry } from '../Registry';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function asNumber(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

/**
 * Vca — internal MMB voltage-controlled amplifier.
 *
 * Wraps `Tone.Gain` by composition. CV summing for the `cv` input is
 * still managed by the engine (wire-time state), but the gain primitive
 * and its base-level update live here.
 *
 * Controls: gain / level (0–1).
 * Ports: in, out (audio), cv (cv).
 */
export class Vca extends AudioModule {
  static readonly typeId = 'tp_mmb_vca';

  readonly gain: Tone.Gain;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    const base = clamp(asNumber(this.getControl('gain'), 0), 0, 1);
    this.gain = new Tone.Gain(base);
  }

  get input(): Tone.ToneAudioNode { return this.gain; }
  get output(): Tone.ToneAudioNode { return this.gain; }

  setGain(v: number): void {
    this.gain.gain.rampTo(clamp(v, 0, 1), 0.02);
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    if (id === 'gain' || id === 'level') {
      const n = asNumber(value, NaN);
      if (Number.isFinite(n)) this.setGain(n);
    }
  }

  update(): void { /* Tone schedules audio automatically. */ }

  dispose(): void {
    this.gain.dispose();
  }
}

registry.register(Vca.typeId, (type, instance, initialControlValues) =>
  new Vca(type, instance, initialControlValues),
);
