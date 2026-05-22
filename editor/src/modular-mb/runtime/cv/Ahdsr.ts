import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { CvModule } from '../CvModule';
import { registry } from '../Registry';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function asNumber(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function msToSec(v: ControlValue | undefined, fallbackMs: number): number {
  const ms = typeof v === 'number' ? v : fallbackMs;
  return Math.max(0.001, ms / 1000);
}

/**
 * Ahdsr — internal MMB attack/hold/decay/sustain/release envelope.
 *
 * Wraps `Tone.Envelope` by composition. `Tone.Envelope` has no native
 * hold stage; we fold hold into attack (so `effectiveAttack = A + H`).
 *
 * Controls: attack, hold, decay (all ms), sustain (0–1), release (ms).
 * Ports: gate (gate-in), trig (trig-in), cv_out (cv-out), eoc (trig-out).
 *
 * Simulator note: `tick()` is a no-op because Tone schedules the envelope
 * ramps internally. Firmware implementation will compute ramps in tick().
 */
export class Ahdsr extends CvModule {
  static readonly typeId = 'tp_mmb_ahdsr';

  readonly env: Tone.Envelope;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    const A = msToSec(this.getControl('attack'),  10);
    const H = msToSec(this.getControl('hold'),    0);
    const D = msToSec(this.getControl('decay'),   200);
    const S = clamp(asNumber(this.getControl('sustain'), 0.7), 0, 1);
    const R = msToSec(this.getControl('release'), 400);
    this.env = new Tone.Envelope({ attack: A + H, decay: D, sustain: S, release: R });
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const e = this.env;
    if (id === 'attack')  { e.attack  = msToSec(value, 10);  return; }
    if (id === 'hold')    { /* folded into attack on rebuild; live tweak skipped */ return; }
    if (id === 'decay')   { e.decay   = msToSec(value, 200); return; }
    if (id === 'sustain') { e.sustain = clamp(asNumber(value, 0.7), 0, 1); return; }
    if (id === 'release') { e.release = msToSec(value, 400); return; }
  }

  tick(): void { /* Tone schedules envelope ramps automatically. */ }

  dispose(): void {
    this.env.dispose();
  }
}

registry.register(Ahdsr.typeId, (type, instance, initialControlValues) =>
  new Ahdsr(type, instance, initialControlValues),
);
