#pragma once
// The Router is the heart of the brain: it turns input events + active patch
// into output commands. It is a pure function (no I/O, no time) so it can be
// unit-tested on the host. Application code calls Router::handle() from the
// realtime loop and forwards the produced commands to its concrete drivers.

#include "Patch.h"
#include "Types.h"
#include <array>
#include <cstddef>
#include <cstdint>

namespace mb {

// --- Input events ---------------------------------------------------------

enum class InputKind : uint8_t {
    None = 0,
    MidiNoteOn,
    MidiNoteOff,
    MidiCc,
    MidiProgramChange,
    Footswitch,    // payload = button id; data = pressed (1/0)
    Encoder,       // payload = encoder id; data = signed delta
    PotChange,     // payload = pot id; data = 0..4095
    CvInSample,    // payload = channel id; data = signed 16-bit
};

struct InputEvent {
    InputKind kind{InputKind::None};
    uint16_t  channel{0};
    uint16_t  payload{0};
    int32_t   data{0};
};

// --- Output commands ------------------------------------------------------

enum class OutputKind : uint8_t {
    None = 0,
    RelaySet,     // payload = relay id; data = on/off
    CvSet,        // payload = channel id; data = CvValue bit-cast to int32
    CvSegment,    // not yet emitted by Router; placeholder
    GateSet,      // payload = gate id; data = on/off
    TriggerPulse, // payload = trigger id; data = duration in ms
    MidiOut,      // payload = status byte; data = (data1 << 8) | data2
    DisplayDirty, // tells UI layer to redraw
};

struct OutputCommand {
    OutputKind kind{OutputKind::None};
    uint16_t   channel{0};
    uint16_t   payload{0};
    int32_t    data{0};
};

// --- Router ---------------------------------------------------------------

inline constexpr std::size_t kMaxOutputsPerEvent = 16;

struct RouterResult {
    std::array<OutputCommand, kMaxOutputsPerEvent> commands{};
    std::size_t count{0};
};

class Router {
public:
    // Stateless for now; per-application subclasses or strategies will be
    // injected later (project 1 vs. 2 vs. 3 have different mapping logic).
    virtual ~Router() = default;
    virtual RouterResult handle(const InputEvent& ev, const Patch* active) = 0;
};

// Trivial pass-through router used by tests and the simulator: turns
// MidiProgramChange into a DisplayDirty, drops everything else.
class NullRouter : public Router {
public:
    RouterResult handle(const InputEvent& ev, const Patch* active) override;
};

}  // namespace mb
