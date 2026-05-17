#include "mb_sim/chips/Dac8568.h"
#include "mb/Protocol/SpiFrame.h"
#include <cmath>
#include <sstream>
#include <iomanip>

namespace mb::sim {

Dac8568::Dac8568(Clock& clock, Trace& trace, VirtualSpiBus& bus,
                 uint16_t channelBase, float vrefVolts)
    : clock_(clock), trace_(trace), channelBase_(channelBase), vref_(vrefVolts) {
    bus.attach([this](mb::proto::Opcode op, const uint8_t* p, std::size_t n) {
        this->onSpi(op, p, n);
    });
}

void Dac8568::onSpi(mb::proto::Opcode op, const uint8_t* payload, std::size_t len) {
    if (op != mb::proto::Opcode::CvSet || len < 4) return;
    const uint16_t channel =
        static_cast<uint16_t>(payload[0]) << 8 | payload[1];
    if (channel < channelBase_) return;
    const uint16_t offset = channel - channelBase_;
    // Pitch slots are even (0, 2, 4, ...); odd slots are gates → not us.
    if (offset & 0x1) return;
    const uint16_t slot = offset >> 1;
    if (slot >= kChannels) return;

    const int16_t code = static_cast<int16_t>(
        (static_cast<uint16_t>(payload[2]) << 8) | payload[3]);

    if (seen_[slot] && codes_[slot] == code) return;
    codes_[slot] = code;
    seen_[slot]  = true;

    const float volts = (static_cast<float>(code) / 32767.0f) * vref_;

    std::ostringstream chHex;
    chHex << "0x" << std::hex << std::uppercase << std::setw(4)
          << std::setfill('0') << channel;

    trace_.begin(clock_.now(), "cv")
        .fieldStr("ch", chHex.str())
        .field("code", code)
        .field("volts", volts)
        .end();
}

float Dac8568::voltage(uint16_t channel) const {
    if (channel < channelBase_) return std::nanf("");
    const uint16_t offset = channel - channelBase_;
    if (offset & 0x1) return std::nanf("");
    const uint16_t slot = offset >> 1;
    if (slot >= kChannels || !seen_[slot]) return std::nanf("");
    return (static_cast<float>(codes_[slot]) / 32767.0f) * vref_;
}

int16_t Dac8568::code(uint16_t channel) const {
    if (channel < channelBase_) return 0;
    const uint16_t offset = channel - channelBase_;
    if (offset & 0x1) return 0;
    const uint16_t slot = offset >> 1;
    if (slot >= kChannels) return 0;
    return codes_[slot];
}

}  // namespace mb::sim
