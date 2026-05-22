import * as Tone from 'tone';
import type { ModuleInstance, ModuleType } from '../../types';
import { Filter } from './Filter';
import { registry, type ControlValue } from '../index';

type VcfFilterType = 'lowpass' | 'highpass' | 'bandpass';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function asNumber(v: ControlValue | undefined, fallback: number): number {
  if (typeof v === 'number') return v;
  return fallback;
}

/**
 * Vcf — internal MMB voltage-controlled filter.
 *
 * Tone.js wrapper around `Tone.Filter`. Controls:
 * - `cutoff`  : 20–18000 Hz, default 2000
 * - `q`       : 0.1–12, default 0.7
 * - `cv_amt`  : 0–1, default 1 (depth of CV-cutoff modulation)
 * - `type`    : 0=LP, 1=HP, 2=BP
 *
 * Ports:
 * - `in`  (audio, input)
 * - `cv`  (cv, input)  → modulates cutoff
 * - `out` (audio, output)
 *
 * This class wraps Tone.Filter by composition. It is not yet wired into
 * `AudioEngine` — the engine still has its `case 'vcf'` branch. The proof
 * here is that the class hierarchy (Module → AudioModule → Filter → Vcf)
 * and the registry pattern work end-to-end. AudioEngine will be refactored
 * to dispatch via the registry in a follow-up step.
 */
export class Vcf extends Filter {
  static readonly typeId = 'tp_mmb_vcf';

  readonly filter: Tone.Filter;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    const baseCutoff = clamp(asNumber(this.getControl('cutoff'), 2000), 20, 18000);
    const q          = clamp(asNumber(this.getControl('q'),       0.7), 0.1, 12);
    const tIdx       = asNumber(this.getControl('type'), 0);
    const ftype: VcfFilterType = tIdx === 1 ? 'highpass' : tIdx === 2 ? 'bandpass' : 'lowpass';
    this.filter = new Tone.Filter({ frequency: baseCutoff, Q: q, type: ftype });
  }

  setCutoff(hz: number): void {
    this.filter.frequency.rampTo(clamp(hz, 20, 18000), 0.02);
  }

  setResonance(q: number): void {
    this.filter.Q.rampTo(clamp(q, 0.1, 12), 0.02);
  }

  /** Audio input node (for connection). */
  get input(): Tone.ToneAudioNode { return this.filter; }
  /** Audio output node (for connection). */
  get output(): Tone.ToneAudioNode { return this.filter; }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const num = asNumber(value, NaN);
    if (id === 'cutoff' && Number.isFinite(num))     this.setCutoff(num);
    else if (id === 'q' && Number.isFinite(num))     this.setResonance(num);
    // `type` switch requires a rebuild — leave to engine for now.
  }

  update(): void {
    // Tone.js drives audio via WebAudio scheduling; nothing to do per block.
  }

  dispose(): void {
    this.filter.dispose();
  }
}

// Self-registration: the registry maps typeId → factory.
registry.register(Vcf.typeId, (type, instance, initialControlValues) =>
  new Vcf(type, instance, initialControlValues),
);
