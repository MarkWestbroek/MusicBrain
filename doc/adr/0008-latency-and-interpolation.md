# ADR 0008 – Latency budget and breakout-side interpolation

## Status
Accepted (2026-05-17)

## Context
The user is unsure of an exact latency target but proposed **≤ 5 ms** as reasonable for project 3 and accepts up to ~½ s for projects 1 & 2 (switching happens between songs).

He also noted a critical lesson from 1980s digital-controlled analog polys: low update rates and shallow bit depths produced *audible "stairs"* on slow modulation (filter envelopes, sweeps). This must be avoided unless used deliberately as an effect.

## Decision
### Latency targets
- **Project 3 (modular synth):** end-to-end (MIDI / key press → CV at jack) ≤ **5 ms** typical, **< 10 ms** worst case.
- **Projects 1 & 2 (switchers):** patch-change ≤ **20 ms** audible cut, **< 100 ms** total relay settling acceptable; well within the user's ½ s tolerance.
- The brain runs a 1 kHz control tick (1 ms) for the routing/voice-allocation loop in project 3.

### Update rates (project 3)
- Pitch CV: per-event (on note / pitch-bend) plus a 1 kHz refresh.
- Envelope / LFO / filter CV: **≥ 1 kHz** at the brain; the breakout interpolates upward (see below).

### Interpolation on the breakout
Per the user's observation, anti-stair behaviour is delegated to the **breakout MCU**, not the brain:
- The brain sends *setpoints* at 1 kHz (or *segment descriptors*: start value, end value, duration, curve).
- The breakout MCU (RP2040 / STM32) runs a higher-rate interpolator (e.g. 20–50 kHz) that linearly or cubically interpolates between setpoints and writes the DAC every tick.
- For envelope sources the brain may send *segments* (attack/decay/sustain/release piece-wise) so the breakout autonomously generates the curve at high rate — even fewer bus updates.
- This makes the SPI/CAN-FD bandwidth requirement tractable and is the right place to spend MCU cycles.

### Consequence for the protocol
The SPI frame carries two CV opcodes:
- `CV_SET`: immediate setpoint (12 or 16 bit).
- `CV_SEGMENT`: `(target, duration_ms, curve_id)` for breakout-side interpolation.

## Consequences
- Breakout firmware is non-trivial: it owns a small realtime engine. This is by design — it's the right boundary.
- The brain stays free to do high-level routing/voice work without DAC-rate jitter concerns.
- "Stair-step as effect" is achievable simply by sending `CV_SET` at a low rate and asking the breakout to skip interpolation (`curve_id = HOLD`).
- Tuning, calibration, and tests must include slow envelope sweeps to verify smoothness.
