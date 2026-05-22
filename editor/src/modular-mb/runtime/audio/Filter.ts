import { AudioModule } from '../AudioModule';

/**
 * Filter — abstract base for audio filter modules.
 *
 * A filter has audio in, audio out, and (optionally) a cutoff CV input.
 * Concrete subclasses choose the topology (Vcf = simple state-variable,
 * Svf = multimode state-variable, ladder, etc.).
 */
export abstract class Filter extends AudioModule {
  /** Set the base cutoff frequency in Hz. */
  abstract setCutoff(hz: number): void;

  /** Set the resonance (Q) value. */
  abstract setResonance(q: number): void;
}
