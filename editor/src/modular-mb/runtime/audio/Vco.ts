import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { AudioModule } from '../AudioModule';
import { registry } from '../Registry';

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

function asNumber(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function pickWaveform(controls: Record<string, ControlValue>): Wave {
  const wIdx = asNumber(controls['wave'], 0);
  return wIdx === 1 ? 'triangle' : wIdx === 2 ? 'sawtooth' : wIdx === 3 ? 'square' : 'sine';
}

/**
 * Vco — internal MMB voltage-controlled oscillator.
 *
 * Wraps `Tone.Oscillator` by composition. The engine drives base pitch
 * (from keyboard / sequencer / V/Oct cable); this runtime owns the
 * oscillator lifecycle and live detune/wave updates.
 *
 * Controls: wave (rebuild), coarse, fine, detune.
 * Ports: out (audio), voct (cv 1V/oct), fm (cv).
 */
export class Vco extends AudioModule {
  static readonly typeId: string = 'tp_mmb_vco';  // string: subklassen (FmVco) overriden hem

  readonly osc: Tone.Oscillator;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    const wave = pickWaveform(this.controlValues);
    this.osc = new Tone.Oscillator({ frequency: 220, type: wave, volume: -6 });
  }

  get input(): Tone.ToneAudioNode { return this.osc; }
  get output(): Tone.ToneAudioNode { return this.osc; }

  setDetune(cents: number): void {
    this.osc.detune.rampTo(cents, 0.02);
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    if (id === 'detune') {
      const n = asNumber(value, NaN);
      if (Number.isFinite(n)) this.setDetune(n);
    }
    // `wave` requires a rebuild — engine handles.
    // `coarse`/`fine` need engine baseMidi context — engine handles.
  }

  update(): void { /* Tone schedules audio automatically. */ }

  dispose(): void {
    this.osc.dispose();
  }
}

registry.register(Vco.typeId, (type, instance, initialControlValues) =>
  new Vco(type, instance, initialControlValues),
);
