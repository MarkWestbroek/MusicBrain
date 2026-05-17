# ADR 0006 – Multi-case transport via SPI ↔ CAN-FD / RS-485 bridge

## Status
Accepted (2026-05-17)

## Context
Project 3 may span several Eurorack cases potentially meters apart. SPI is excellent inside a case but does not survive multi-meter runs reliably. The user asked: *"How would this CAN or RS-485 function? As a bridge? So send the signals for that case separately to another SPI port, that translates it to CAN/RS and at the case another adapter re-translates it back to SPI to internally distribute it?"* — yes, exactly that.

Audio routing across cases is a separate concern; running many long audio cables between cases is undesirable, especially for polyphony.

## Decision
### Control / CV transport
- **In-case bus:** SPI master on the brain, multiple SPI-slave breakouts. Frame format documented in `docs/protocols/spi-frame.md`.
- **Inter-case bus:** **CAN-FD** (preferred — deterministic, robust, 5–8 Mbit/s payload, cheap transceivers, multi-drop). RS-485 is the fallback if a CAN-FD transceiver is not available.
- **Bridging:** dedicated *bridge nodes*, one per case:
  - one **"head bridge"** in the master case: SPI slave on the brain's bus, CAN-FD master on the inter-case bus.
  - one **"satellite bridge"** in each remote case: CAN-FD slave on the inter-case bus, SPI master on that case's local breakouts.
  - the bridge re-frames messages: SPI frame in → CAN-FD frame(s) out (chunked to ≤ 64-byte CAN-FD payload) → SPI frame at the satellite side.
- **Addressing:** every breakout has a `(caseId, slotId)` address. The brain routes by that pair; bridges are transparent to higher layers.
- **Topology:** linear daisy-chain of cases with proper 120 Ω termination on the CAN-FD trunk; star topology discouraged.

### Audio across cases
- **Default:** keep audio within a case where possible (group voices and their VCAs/VCFs into the same case so only mix-buses cross cases).
- **When crossing is unavoidable:** balanced line-level over a short multicore (e.g. DB25 TASCAM, EtherCON-carried analog snakes). Audio is *not* digitised for routing — see `Plan.md` section 4.4.
- **Polyphony hint:** the editor warns when a patch routes per-voice audio across cases (high cable count).

## Consequences
- The brain firmware never sees CAN-FD directly; it only knows "SPI" and addresses. This keeps the routing core portable.
- A new firmware artefact appears in `firmware/breakouts/bridge/` (head + satellite variants share most code).
- The MCU choice for bridges should have a hardware CAN-FD peripheral: STM32G0/G4 or Teensy 4.x (with external transceiver). RP2040 does not have CAN-FD hardware (PIO can do classic CAN at ~500 kbit but not CAN-FD reliably) — so bridges are not RP2040.
- The protocol must include sequence numbers / CRCs end-to-end so the brain can detect bridge-induced loss.
