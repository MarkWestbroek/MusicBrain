# Project 3 — Polyphonic modular synth controller / router / patch saver

See [doc/Requirements.md §3](../../doc/Requirements.md), [doc/Plan.md §4](../../doc/Plan.md), and ADRs [0004](../../doc/adr/0004-dac-resolution.md), [0006](../../doc/adr/0006-multi-case-transport.md), [0008](../../doc/adr/0008-latency-and-interpolation.md).

## Plan
- Target: Teensy 4.1.
- Inputs: MIDI (DIN + USB-MIDI), keybed, pots/encoders/buttons, optional CV-in via SPI breakouts.
- Outputs: SPI bus to breakouts (CV out, gates, triggers, CV in, envelope engines). Optional CAN-FD bridge for multi-case setups.
- 1 kHz control tick; breakouts interpolate to DAC rate.
- Tuner / oscillator calibration via Teensy ADC + PJRC autocorrelation.

## Patch schema (sketch)
```
SynthPatch {
  voiceAssignment      // MIDI note -> oscillator bank
  cvMatrix: list<Edge> // (srcModule, srcPort) -> (dstModule, dstPort) [amount, offset]
  envelopes[], lfos[]  // brain-generated modulator params
  modWheelMap, velocityMap, aftertouchMap
  audioMatrixHint      // optional pictorial routing for the analog side
  calibration: per-oscillator pitch table
}
```

To be implemented in roadmap stages 5–7.
