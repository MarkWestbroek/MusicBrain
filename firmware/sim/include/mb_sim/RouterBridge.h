#pragma once
// Forwards Router output commands onto a VirtualSpiBus. This is the seam
// where the (host-portable) core meets the (sim-side) bus model. On the
// real device this same role is played by a HAL implementation that talks
// to actual SPI peripherals.

#include "VirtualSpiBus.h"
#include "mb/Router.h"
#include <cstring>

namespace mb::sim {

class RouterBridge {
public:
    explicit RouterBridge(VirtualSpiBus& bus) : bus_(bus) {}

    void dispatch(const mb::RouterResult& r) {
        for (std::size_t i = 0; i < r.count; ++i) {
            const auto& c = r.commands[i];
            switch (c.kind) {
                case mb::OutputKind::CvSet: {
                    int16_t v;
                    std::memcpy(&v, &c.data, sizeof(v));
                    bus_.sendCvSet(c.channel, v);
                    break;
                }
                case mb::OutputKind::GateSet:
                    bus_.sendGateSet(c.channel, c.data != 0);
                    break;
                default:
                    // RelaySet / DisplayDirty / etc. — not on the SPI bus.
                    break;
            }
        }
    }

private:
    VirtualSpiBus& bus_;
};

}  // namespace mb::sim
