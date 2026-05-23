#pragma once
// ADR 0009 / ADR 0010 — abstract CV-breakout base.
//
// A CvBreakout is the brain-side runtime instance of a physical breakout
// board. It sits at the *output* boundary of the brain: each of its input
// slots receives a normalised float (the layer-3 CV signal), and on every
// `tick()` it ships the current values out as `SpiFrame`s over the bus
// (see `doc/protocols/spi-frame.md`).
//
// The class is intentionally agnostic of *how* frames leave the brain.
// A `BreakoutSink` interface decouples the runtime from the SPI driver:
//   - production firmware injects an SPI-backed sink
//   - host CTest injects a capturing sink and asserts on what was sent
//   - the web simulator can inject a null sink (it never reaches a board)
//
// Voltage scaling, DAC bit-depth and mux timing all live in concrete
// subclasses (`CvOut12`, `CvOut16`, `GateOut`); this base only handles
// addressing, the input slot table and the per-tick dispatch.

#include "CvModule.h"
#include "../Protocol/SpiFrame.h"
#include <array>
#include <cstddef>
#include <cstdint>

namespace mb::runtime {

// Abstract sink that consumes encoded SpiFrames as raw bytes (the same
// buffer that `mb::proto::encode` writes). Implementations:
//   - `SpiBreakoutSink`        (firmware)   — writes to the SPI master.
//   - `CapturingBreakoutSink`  (tests)      — appends frames to a vector.
//   - `NullBreakoutSink`       (simulator)  — drops on the floor.
class BreakoutSink {
public:
    virtual ~BreakoutSink() = default;

    // Send one encoded frame. `data` points to the first byte of the
    // frame (magic), `len` is the total frame length (header + payload
    // + CRC). Implementations must be non-blocking (firmware enqueues
    // into a DMA ring; tests just push to a buffer). Called from
    // `CvBreakout::tick()` on the CV-tick clock.
    virtual void send(const std::uint8_t* data, std::size_t len) = 0;
};

// Pin maximum input slot count to keep the class trivially fixed-size.
// Real boards never exceed 16 channels per breakout PCB; raise if a
// future board does.
inline constexpr std::uint8_t kMaxBreakoutSlots = 16;

class CvBreakout : public CvModule {
public:
    // `caseId`/`firstSlot` form the wire-level channel base address; see
    // `spi-frame.md` for the `channel = (caseId << 8) | slotId` packing.
    // `slotCount` is how many input slots this breakout exposes (≤ kMaxBreakoutSlots).
    CvBreakout(std::string_view typeId, std::string_view id,
               std::uint8_t caseId, std::uint8_t firstSlot, std::uint8_t slotCount)
        : CvModule(typeId, id),
          caseId_(caseId), firstSlot_(firstSlot), slotCount_(slotCount) {}

    // Inject the bus sink. Lifetime: caller owns; the sink must outlive
    // this breakout. Pass nullptr to silence the breakout (used by the
    // simulator and during construction before the bus is up).
    void setSink(BreakoutSink* sink) { sink_ = sink; }

    // Slot count exposed on the panel + patch wiring. Constant for the
    // lifetime of the instance.
    std::uint8_t slotCount() const { return slotCount_; }

    // Write a normalised float value to one input slot. Called by the
    // connection layer when an upstream module produces a new CV value.
    // Range: -1.0 .. +1.0 (matches the SpiFrame i16 wire encoding).
    // Slot indices >= slotCount() are silently ignored so a misrouted
    // patch never corrupts memory.
    void setInputValue(std::uint8_t slot, float value) {
        if (slot >= slotCount_) return;
        values_[slot] = value;
        dirty_[slot] = true;
    }

    // Wire-level channel for slot `i`. Useful for diagnostics and for
    // the connection layer when it needs to address a specific voice.
    std::uint16_t channelFor(std::uint8_t slot) const {
        return static_cast<std::uint16_t>(caseId_) << 8
             | static_cast<std::uint16_t>(firstSlot_ + slot);
    }

    // Layer-2 controls. Concrete subclasses extend; the base handles the
    // common ones (`addr_case`, `addr_first_slot`) so a patch can rebind
    // a breakout to a different physical board without a code change.
    void setControl(std::string_view controlId, ControlValue value) override;

    // Drains dirty input slots to the sink. Concrete subclasses override
    // to pick the opcode (CvSet for analog out, GateSet for digital out)
    // and to apply DAC bit-depth quantisation before encoding the frame.
    void tick() override = 0;

protected:
    std::uint8_t caseId_;
    std::uint8_t firstSlot_;
    std::uint8_t slotCount_;
    BreakoutSink* sink_ = nullptr;
    std::array<float, kMaxBreakoutSlots> values_{};
    std::array<bool,  kMaxBreakoutSlots> dirty_{};
};

}  // namespace mb::runtime
