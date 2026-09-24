import { Module } from './Module';

/**
 * AudioModule — produces or processes digital audio.
 *
 * On firmware (audio Teensy): a DMA/I2S ISR drives `update()` at block rate
 * (44100/128 ≈ 344 Hz). In the simulator: subclasses wrap Tone.js nodes by
 * composition and rely on the WebAudio scheduler; `update()` is a no-op for
 * pure Tone.js wrappers but is the integration point if/when block-based DSP
 * runs in the browser.
 *
 * Subclass: WasmModule (de Teensy-DSP als WebAssembly in een AudioWorklet).
 */
export abstract class AudioModule extends Module {
  /** Called once per audio block. */
  abstract update(): void;
}
