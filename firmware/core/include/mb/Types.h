#pragma once
// Small value types shared across the MusicBrain core library.

#include <cstdint>

namespace mb {

using ProgramId = uint16_t;
using ChannelId = uint16_t;  // (caseId << 8) | slotId; see ADR 0006
using Millis    = uint32_t;

// Normalised CV value, -1.0 .. +1.0. Converted to bits at the breakout
// according to that channel's resolution (12 or 16 bit, see ADR 0004).
struct CvValue {
    float v;  // -1.0f .. +1.0f
};

enum class CurveId : uint8_t {
    Hold   = 0,  // step, no interpolation (deliberate stair-step effect)
    Linear = 1,
    ExpUp  = 2,
    ExpDn  = 3,
};

// A piece-wise segment for breakout-side interpolation (see ADR 0008).
struct CvSegment {
    CvValue target;
    Millis  duration;
    CurveId curve;
};

}  // namespace mb
