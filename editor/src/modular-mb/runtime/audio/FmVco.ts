import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { Vco } from './Vco';
import { registry } from '../Registry';

function asNumber(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

/**
 * FmVco — MMB 2-operator FM-oscillator (firmware tp_mmb_fm_vco, FW-AU-4).
 *
 * Zelfde carrier als de Vco (de engine stuurt de toonhoogte), plus een
 * audio-FM-ingang. De firmware gebruikt AudioSynthWaveformModulated: de
 * modulator (±1) verschuift de carrier exponentieel over `fm_amt` octaven.
 * Hier idem via `osc.detune` (cents): gain = fm_amt × 1200, dus ±1 op de
 * ingang = ±fm_amt octaven. Exponentiële FM, geen lineaire — dat klinkt
 * als de Teensy.
 *
 * Controls: wave (rebuild), coarse/fine (engine), fm_amt (octaven), level.
 * Ports: out (audio), voct (cv), fm (audio → fmIn).
 */
export class FmVco extends Vco {
  static override readonly typeId = 'tp_mmb_fm_vco';

  /** Audio-ingang voor de modulator; sommeert op osc.detune. */
  readonly fmIn: Tone.Gain;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    this.fmIn = new Tone.Gain(asNumber(this.controlValues['fm_amt'], 1) * 1200);
    this.fmIn.connect(this.osc.detune);
    this.setLevel(asNumber(this.controlValues['level'], 0.8));
  }

  setFmDepthOctaves(oct: number): void {
    this.fmIn.gain.rampTo(Math.max(0, oct) * 1200, 0.02);
  }

  setLevel(level: number): void {
    const l = Math.max(0.001, Math.min(1, level));
    this.osc.volume.rampTo(20 * Math.log10(l) - 6, 0.02);
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const n = asNumber(value, NaN);
    if (id === 'fm_amt' && Number.isFinite(n)) { this.setFmDepthOctaves(n); return; }
    if (id === 'level' && Number.isFinite(n)) { this.setLevel(n); return; }
    super.onControlChanged(id, value);
  }

  override dispose(): void {
    this.fmIn.dispose();
    super.dispose();
  }
}

registry.register(FmVco.typeId, (type, instance, initialControlValues) =>
  new FmVco(type, instance, initialControlValues),
);
