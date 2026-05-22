import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { CvModule } from '../CvModule';
import { registry } from '../Registry';

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function asNumber(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function pickWaveform(idx: number): Wave {
  return idx === 1 ? 'triangle' : idx === 2 ? 'sawtooth' : idx === 3 ? 'square' : 'sine';
}

/**
 * Lfo — internal MMB low-frequency oscillator.
 *
 * Wraps `Tone.LFO` by composition. Produces bipolar CV symmetric around 0
 * (`max = +depth`, `min = -depth`).
 *
 * Controls: wave (rebuild), rate/freq (Hz), depth/amount (0–1).
 * Ports: out (cv), out_inv (cv), rate_cv (cv-in), reset (trig).
 *
 * Simulator note: `tick()` is a no-op; Tone.LFO drives itself.
 */
export class Lfo extends CvModule {
  static readonly typeId = 'tp_mmb_lfo';

  readonly lfo: Tone.LFO;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    const rate  = clamp(asNumber(this.getControl('rate'),  1), 0.01, 50);
    const depth = clamp(asNumber(this.getControl('depth'), 1), 0, 1);
    const wIdx  = asNumber(this.getControl('wave'), 0);
    this.lfo = new Tone.LFO({ frequency: rate, min: -depth, max: depth, type: pickWaveform(wIdx) });
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const n = asNumber(value, NaN);
    if (!Number.isFinite(n)) return;
    if (id === 'rate' || id === 'freq')         { this.lfo.frequency.rampTo(n, 0.02); return; }
    if (id === 'depth' || id === 'amount')      { this.lfo.max = n; this.lfo.min = -n; return; }
    // `wave`/`shape` requires a rebuild — engine handles.
  }

  tick(): void { /* Tone.LFO self-schedules. */ }

  dispose(): void {
    this.lfo.dispose();
  }
}

registry.register(Lfo.typeId, (type, instance, initialControlValues) =>
  new Lfo(type, instance, initialControlValues),
);
