// ADR 0009 / ADR 0010 — dCV bus receiver (mirror of CvBreakout).
#include "mb/runtime/CvBreakIn.h"

#include <cstring>

namespace mb::runtime {

namespace {

// Decode a big-endian unsigned 16-bit field.
std::uint16_t readU16(const std::uint8_t* p) {
    return static_cast<std::uint16_t>((p[0] << 8) | p[1]);
}

// Decode a big-endian signed 16-bit field.
std::int16_t readI16(const std::uint8_t* p) {
    return static_cast<std::int16_t>((p[0] << 8) | p[1]);
}

// Inverse of CvOut12's encode scaling: i16 wire value → normalised float.
// Positive values divide by 32767, negatives by 32768, so the round-trip
// is exact at the rails (+1.0 ↔ 32767, −1.0 ↔ −32768).
float wireToFloat(std::int16_t wire) {
    return wire >= 0 ? static_cast<float>(wire) / 32767.0f
                     : static_cast<float>(wire) / 32768.0f;
}

}  // namespace

bool CvBreakIn::onFrame(const std::uint8_t* data, std::size_t len) {
    mb::proto::Opcode op;
    const std::uint8_t* payload = nullptr;
    std::size_t payloadLen = 0;
    std::size_t consumed = 0;
    if (!mb::proto::decode(data, len, op, payload, payloadLen, consumed)) {
        return false;  // bad magic/version/CRC or short buffer.
    }

    // Both opcodes carry a u16 channel as the first payload field.
    if (payloadLen < 2) return false;
    const std::uint16_t channel = readU16(payload);
    const std::uint8_t  frameCase = static_cast<std::uint8_t>(channel >> 8);
    const std::uint8_t  frameSlot = static_cast<std::uint8_t>(channel & 0xFF);
    if (frameCase != caseId_)            return false;  // not for this case.
    if (frameSlot < firstSlot_)          return false;  // below our range.
    const std::uint8_t slot = static_cast<std::uint8_t>(frameSlot - firstSlot_);
    if (slot >= slotCount_)              return false;  // above our range.

    switch (op) {
        case mb::proto::Opcode::CvSet: {
            if (payloadLen < 4) return false;
            values_[slot] = wireToFloat(readI16(payload + 2));
            return true;
        }
        case mb::proto::Opcode::GateSet: {
            if (payloadLen < 3) return false;
            values_[slot] = (payload[2] != 0) ? 1.0f : 0.0f;
            return true;
        }
        default:
            return false;  // CvSegment / TriggerPulse not yet handled here.
    }
}

void CvBreakIn::setControl(std::string_view controlId, ControlValue value) {
    if (const auto* iv = std::get_if<std::int32_t>(&value)) {
        if (controlId == "addr_case") {
            caseId_ = static_cast<std::uint8_t>(*iv);
        } else if (controlId == "addr_first_slot") {
            firstSlot_ = static_cast<std::uint8_t>(*iv);
        }
    }
}

void CvBreakIn::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<CvBreakIn>(instanceId);
    });
}

namespace {
const int kCvBreakInAutoRegister = [] { CvBreakIn::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
