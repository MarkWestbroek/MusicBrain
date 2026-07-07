# ADR 0015 – Poly-instrument slot addressing and the FPGA voice contract

## Status
Proposed (2026-07-07)

## Context

ADR 0013 attached the FPGA synth voice as a standard SPI-slave instrument on
the CV/gate bus, and left two open questions: the final slot map, and the
pitch-CV scaling. Since then the FPGA
([FPGA_MS20_synth_voice](https://github.com/MarkWestbroek/FPGA_MS20_synth_voice),
tags `0.2-poly8` / `0.3-wavetable`) has become an **8-voice polyphonic
instrument**: per voice a Karplus-Strong pluck *or* a mipmapped wavetable
oscillator (with gate-driven amp envelope), each through its own MS-20-style
filter, time-multiplexed on one shared core, mixed to the on-board DAC.

Two existing decisions frame the answer:

- **ADR 0010 §5** already defines poly addressing on the wire:
  `channel = (caseId << 8) | (firstSlot + i)`, and the editor's voice-stamp
  expansion writes voice *v* of a port to `firstSlot + v`. A port on a poly
  module is therefore a **contiguous run of N slots**, one per voice.
- **ADR 0009** distinguishes ports from controls, and forwards physical
  controls as CV over the bus (`ControllerBreakIn`). The editor's `Port`
  model already carries `eventKind: voice | global`.

Conceptually the FPGA is a **delegated internal module**: like an internal
module, it exposes *ports and controls that the brain can all reach* (the
brain "turns its knobs" over the bus), unlike an external Eurorack module
which only receives patched CV. On the wire both arrive as ordinary `CvSet`
frames; the internal/delegated distinction lives in the catalog (which slots
exist and what they mean), not in the protocol.

## Decision

1. **A (logical) module is a contiguous slot range.** Its address is
   *(chip-select, first slot)*. The MS20 poly voice is one 8-voice module
   starting at slot 0. A second module hosted on the same FPGA (e.g. a modal
   resonator bank) would start at slot 128. No module-id field is added to
   the wire protocol.

2. **Per-voice ports occupy blocks of 8 consecutive slots** (port base +
   voice index), so the editor's one-cable-per-port fan-out from ADR 0010 §5
   applies unchanged.

3. **The MS20 poly-voice slot contract** (canonical, maintained copy:
   `doc/SPI_SLOTMAP.md` in the FPGA repo):

   | Slots | Port (voice 0..7) | eventKind |
   |---|---|---|
   | 0–7   | pitch | voice |
   | 8–15  | filter cutoff | voice |
   | 16–23 | filter resonance | voice |
   | 24–31 | filter drive | voice |
   | 32–39 | exciter / morph | voice |
   | 40–47 | *reserved:* per-voice expression (pressure — MPE/Osmose) | voice |
   | 48    | string damping (pluck decay time) | global |
   | 49+   | *free for future global controls* | global |

   `GateSet` slot = voice number (0..7).

4. **Exciter selection is a CV, not a mode opcode.** Slot 32+v carries one
   dCV: below `0x4000` the voice is a Karplus-Strong pluck; from `0x4000`
   upward it is a wavetable voice, and the position within that range is the
   (future) wavetable-morph position — currently two waves (saw below
   `0xA000`, square above). This keeps the protocol at v1: no new opcodes,
   no version bump, and it composes with the brain-side Morph-WT work.

5. **Global controls are single slots from 48 upward** — the module's
   "panel knobs", written by the brain exactly like any forwarded control
   (`ControllerBreakIn`, ADR 0009). First one: string damping.

6. **Pitch scaling** (closes ADR 0013 open question 2): pitch is a dCV per
   ADR 0014 / spi-frame.md (u16 offset-binary). Default range 0–10 V at
   1 V/oct with 0 V = MIDI note 0, so `note = (code · 120) >> 16`
   (≈ 546 LSB per semitone). This supersedes the earlier "reference note 69,
   256 LSB per semitone" wording in ADR 0013. Per-note pitch bend needs no
   extra port: pitch is a continuous per-voice CV.

7. **Gate semantics:** a 0→1 edge (re)triggers the voice; the wavetable amp
   envelope follows the gate level. The voice allocator must therefore send
   gate-off before reusing a sounding voice (per ADR 0011 lifecycle).

## Consequences

- **Pro:** the editor needs no FPGA-specific concepts. Per-voice ports fan
  out by ADR 0010 §5 as-is; global controls are ordinary CV destinations;
  the whole contract is one catalog entry.
- **Pro:** morph-per-voice arrives "for free" as a CV, aligned with the
  brain's Morph-WT direction.
- **Con / breaking:** the FPGA's earlier v1 layout (slot = voice·4 + param,
  voice-major) is superseded by this port-major layout. Accepted while
  nothing integrates against v1 yet.
- **Open:** author the catalog `ModuleDefinition` (ports with
  `eventKind`, `voiceCount: 8`, controls) and wire it into the editor;
  `CvSegment` interpolation on the FPGA for high-rate expression stays
  deferred (ADR 0008/0013); status/display traffic from the module to the
  brain awaits the management-message layer (ADR 0009).

## References
- FPGA repo `doc/SPI_SLOTMAP.md` — canonical, implementation-tested contract
  (simulated end-to-end: KS voice + wavetable voice driven over SPI).
- ADR 0009 — ports/controls model, ControllerBreakIn, management messages.
- ADR 0010 §5 — `(caseId, firstSlot)` addressing and voice-indexed fan-out.
- ADR 0013 — FPGA as SPI-slave instrument (its two open questions close here).
- ADR 0014 — dCV encoding and pitch formats.
