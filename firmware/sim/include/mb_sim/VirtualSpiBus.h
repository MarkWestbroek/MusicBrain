#pragma once
// VirtualSpiBus: in-memory analog of the brain→breakout SPI link.
// The brain calls send(frame); attached devices receive(frame) via dispatch.
// No async, no buffering — strictly synchronous for deterministic tests.

#include "Clock.h"
#include "Trace.h"
#include "mb/Protocol/SpiFrame.h"
#include <cstdint>
#include <functional>
#include <vector>

namespace mb::sim {

// Listener callback: invoked with the decoded opcode + payload of every frame.
// Multiple listeners may be attached; all see every frame (true to a single-
// case SPI bus where the brain talks to N CS-selected breakouts).
using SpiListener = std::function<void(mb::proto::Opcode op,
                                       const uint8_t* payload,
                                       std::size_t   payloadLen)>;

class VirtualSpiBus {
public:
    VirtualSpiBus(Clock& clock, Trace& trace) : clock_(clock), trace_(trace) {}

    void attach(SpiListener listener) { listeners_.push_back(std::move(listener)); }

    // Brain side: encode an output command into a SPI frame and dispatch.
    // Returns true if encoded successfully.
    bool sendCvSet(uint16_t channel, int16_t value);
    bool sendGateSet(uint16_t channel, bool on);

    // Lower-level: dispatch an already-encoded frame.
    // Used by tests and by future opcodes.
    bool sendRaw(const uint8_t* frame, std::size_t len);

    // Stats for tests.
    std::size_t framesSent() const { return framesSent_; }

private:
    void traceFrame(mb::proto::Opcode op, std::size_t len);

    Clock&                    clock_;
    Trace&                    trace_;
    std::vector<SpiListener>  listeners_;
    std::size_t               framesSent_ = 0;
};

}  // namespace mb::sim
