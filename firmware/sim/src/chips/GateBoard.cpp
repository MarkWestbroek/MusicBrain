#include "mb_sim/chips/GateBoard.h"
#include "mb/Protocol/SpiFrame.h"
#include <sstream>
#include <iomanip>

namespace mb::sim {

GateBoard::GateBoard(Clock& clock, Trace& trace, VirtualSpiBus& bus,
                     uint16_t channelBase)
    : clock_(clock), trace_(trace), channelBase_(channelBase) {
    bus.attach([this](mb::proto::Opcode op, const uint8_t* p, std::size_t n) {
        this->onSpi(op, p, n);
    });
}

void GateBoard::onSpi(mb::proto::Opcode op, const uint8_t* payload, std::size_t len) {
    if (op != mb::proto::Opcode::GateSet || len < 3) return;
    const uint16_t channel =
        static_cast<uint16_t>(payload[0]) << 8 | payload[1];
    if (channel < channelBase_) return;
    const uint16_t offset = channel - channelBase_;
    // Gate slots are odd in our convention; even slots belong to the DAC.
    if ((offset & 0x1) == 0) return;
    const uint16_t slot = offset >> 1;
    if (slot >= kChannels) return;

    const bool on = payload[2] != 0;
    if (seen_[slot] && states_[slot] == on) return;
    states_[slot] = on;
    seen_[slot]   = true;

    std::ostringstream chHex;
    chHex << "0x" << std::hex << std::uppercase << std::setw(4)
          << std::setfill('0') << channel;

    trace_.begin(clock_.now(), "gate")
        .fieldStr("ch", chHex.str())
        .fieldBool("on", on)
        .end();
}

bool GateBoard::state(uint16_t channel) const {
    if (channel < channelBase_) return false;
    const uint16_t offset = channel - channelBase_;
    if ((offset & 0x1) == 0) return false;
    const uint16_t slot = offset >> 1;
    if (slot >= kChannels) return false;
    return states_[slot];
}

}  // namespace mb::sim
