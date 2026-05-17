#include "mb_sim/VirtualSpiBus.h"
#include <cstring>

namespace mb::sim {

void VirtualSpiBus::traceFrame(mb::proto::Opcode op, std::size_t len) {
    trace_.begin(clock_.now(), "spi")
        .field("op", static_cast<int>(op))
        .field("bytes", len)
        .end();
}

bool VirtualSpiBus::sendCvSet(uint16_t channel, int16_t value) {
    uint8_t payload[4];
    payload[0] = static_cast<uint8_t>(channel >> 8);
    payload[1] = static_cast<uint8_t>(channel & 0xFF);
    payload[2] = static_cast<uint8_t>(static_cast<uint16_t>(value) >> 8);
    payload[3] = static_cast<uint8_t>(static_cast<uint16_t>(value) & 0xFF);

    uint8_t frame[mb::proto::kMaxFrame];
    const std::size_t n = mb::proto::encode(
        mb::proto::Opcode::CvSet, payload, sizeof(payload), frame, sizeof(frame));
    if (n == 0) return false;
    return sendRaw(frame, n);
}

bool VirtualSpiBus::sendGateSet(uint16_t channel, bool on) {
    uint8_t payload[3];
    payload[0] = static_cast<uint8_t>(channel >> 8);
    payload[1] = static_cast<uint8_t>(channel & 0xFF);
    payload[2] = on ? 1 : 0;

    uint8_t frame[mb::proto::kMaxFrame];
    const std::size_t n = mb::proto::encode(
        mb::proto::Opcode::GateSet, payload, sizeof(payload), frame, sizeof(frame));
    if (n == 0) return false;
    return sendRaw(frame, n);
}

bool VirtualSpiBus::sendRaw(const uint8_t* frame, std::size_t len) {
    mb::proto::Opcode op;
    const uint8_t*    payload    = nullptr;
    std::size_t       payloadLen = 0;
    std::size_t       consumed   = 0;
    if (!mb::proto::decode(frame, len, op, payload, payloadLen, consumed)) {
        return false;
    }
    ++framesSent_;
    traceFrame(op, consumed);
    for (auto& l : listeners_) {
        l(op, payload, payloadLen);
    }
    return true;
}

}  // namespace mb::sim
