#pragma once
#include "../Router.h"
#include <cstddef>

namespace mb {

// Abstract source of input events (buttons, encoders, pots, footswitches,
// MIDI, CV-in). Drain by repeatedly calling poll() until it returns false.
class IInputs {
public:
    virtual ~IInputs() = default;
    virtual bool poll(InputEvent& out) = 0;
};

}  // namespace mb
