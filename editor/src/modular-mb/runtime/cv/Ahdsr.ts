import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { CvModule } from '../CvModule';
import { registry } from '../Registry';
import { AhdsrModel, type AhdsrCurve, type AhdsrParams } from './ahdsrModel';

function num(v: ControlValue | undefined, fallback: number): number {
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : fallback;
}
function flag(v: ControlValue | undefined): boolean {
  return v === true || (typeof v === 'number' && v >= 0.5);
}

/**
 * De envelope als Tone-node, met het rekenwerk van de firmware (zie
 * `ahdsrModel.ts` voor waarom niet Tone.Envelope). Zelfde oppervlak als
 * Tone.Envelope voor zover de engine het gebruikt: triggerAttack,
 * triggerRelease, triggerAttackRelease en aansluiten als CV-bron.
 *
 * Bij elke flank vraagt hij het model waar de envelope heen gaat en tekent
 * dat als automation op één Signal: vasthouden waar hij nu is, dan de punten
 * van het plan als lineaire stukjes (Exp/Log komen daar met 32 punten per stuk
 * uit). Na het laatste punt blijft de waarde staan — sustain of nul.
 */
export class FirmwareEnvelope extends Tone.ToneAudioNode {
  readonly name = 'FirmwareEnvelope';
  readonly input = undefined;
  readonly output: Tone.Signal<'number'>;
  readonly model: AhdsrModel;

  constructor(params: AhdsrParams) {
    super();
    this.output = new Tone.Signal({ context: this.context, value: 0, units: 'number' });
    this.model = new AhdsrModel(params);
  }

  triggerAttack(time?: Tone.Unit.Time): this {
    const t = this.toSeconds(time);
    if (this.model.gate(true, t * 1000)) this.draw(t);
    return this;
  }

  triggerRelease(time?: Tone.Unit.Time): this {
    const t = this.toSeconds(time);
    if (this.model.gate(false, t * 1000)) this.draw(t);
    return this;
  }

  triggerAttackRelease(duration: Tone.Unit.Time, time?: Tone.Unit.Time): this {
    const t = this.toSeconds(time);
    this.triggerAttack(t);
    this.triggerRelease(t + this.toSeconds(duration));
    return this;
  }

  /** Sustain live bijstellen: in de firmware volgt de sustainfase meteen. */
  retune(t: number): void {
    const { phase } = this.model.stateAt(t * 1000);
    if (phase === 'sustain') {
      this.output.cancelAndHoldAtTime(t);
      this.output.linearRampToValueAtTime(this.model.params.sustain, t + 0.005);
    }
  }

  private draw(t: number): void {
    const sig = this.output;
    sig.cancelAndHoldAtTime(t);
    for (const [ms, v] of this.model.points()) {
      const at = ms / 1000;
      if (at <= t) sig.setValueAtTime(v, t);
      else sig.linearRampToValueAtTime(v, at);
    }
  }

  override dispose(): this {
    super.dispose();
    this.output.dispose();
    return this;
  }
}

/**
 * Ahdsr — interne MMB-envelope (attack/hold/decay/sustain/release) in de
 * simulator, met dezelfde tijden en curves als `mb::runtime::Ahdsr` op de
 * Teensy. Controls: attack, hold, decay, release (ms), sustain (0–1), curve
 * (0 Lin / 1 Exp / 2 Log), loop, retrig (Reset).
 *
 * Standaarden bij een control die niet in de patch staat: die van de
 * firmware (release 300 ms, curve Lin) — de Teensy krijgt ontbrekende
 * waardes niet mee en valt terug op zijn eigen beginstand.
 */
export class Ahdsr extends CvModule {
  static readonly typeId = 'tp_mmb_ahdsr';

  readonly env: FirmwareEnvelope;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    this.env = new FirmwareEnvelope(this.params());
  }

  private params(): AhdsrParams {
    const g = (id: string): ControlValue | undefined => this.getControl(id);
    const curve = Math.max(0, Math.min(2, Math.round(num(g('curve'), 0)))) as AhdsrCurve;
    return {
      attack:  Math.max(0, num(g('attack'),  10)),
      hold:    Math.max(0, num(g('hold'),    0)),
      decay:   Math.max(0, num(g('decay'),   200)),
      sustain: Math.max(0, Math.min(1, num(g('sustain'), 0.7))),
      release: Math.max(0, num(g('release'), 300)),
      curve,
      loop:   flag(g('loop')),
      retrig: flag(g('retrig') ?? g('reset')),
    };
  }

  protected override onControlChanged(id: string, _value: ControlValue): void {
    // Zoals de firmware: nieuwe tijden gelden vanaf de volgende flank, een
    // nieuwe sustain meteen.
    this.env.model.params = this.params();
    if (id === 'sustain') this.env.retune(Tone.now());
  }

  tick(): void { /* de automation loopt in de audiothread */ }

  dispose(): void {
    this.env.dispose();
  }
}

registry.register(Ahdsr.typeId, (type, instance, initialControlValues) =>
  new Ahdsr(type, instance, initialControlValues),
);
