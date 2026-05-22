import { Module } from './Module';

/**
 * CvModule — produces or routes CV/gate values.
 *
 * On firmware (main brain Teensy): a timer ISR calls `tick()` at ~1–2 kHz.
 * In the simulator: a setInterval-driven loop calls `tick()` at the same rate.
 *
 * Subclasses include EnvelopeGenerator, Lfo, Sequencer, CvMapper, CvBreakout,
 * CvBreakIn, ControllerBreakIn.
 */
export abstract class CvModule extends Module {
  /** Called once per control-tick (~1–2 kHz). */
  abstract tick(): void;
}
