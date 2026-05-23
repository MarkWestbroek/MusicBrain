// ADR 0009 / ADR 0010 / ADR 0004 — 8-channel 12-bit breakout impl.
#include "mb/runtime/CvOut12.h"

#include <algorithm>
#include <cstring>

namespace mb::runtime {

namespace {

// Pack a normalised float into the i16 SpiFrame value and write the
// CvSet payload (u16 channel BE + i16 value BE) into `out`.
std::size_t encodeCvSet(std::uint16_t channel, float value,
                        std::uint8_t* outFrame, std::size_t outCap) {
    const float clamped = std::clamp(value, -1.0f, 1.0f);
    const std::int16_t wire = static_cast<std::int16_t>(
        clamped >= 0.0f ? clamped * 32767.0f : clamped * 32768.0f);

    std::uint8_t payload[4];
    payload[0] = static_cast<std::uint8_t>((channel >> 8) & 0xFF);
    payload[1] = static_cast<std::uint8_t>(channel & 0xFF);
    payload[2] = static_cast<std::uint8_t>((static_cast<std::uint16_t>(wire) >> 8) & 0xFF);
    payload[3] = static_cast<std::uint8_t>(static_cast<std::uint16_t>(wire) & 0xFF);

    return mb::proto::encode(mb::proto::Opcode::CvSet,
                              payload, sizeof(payload),
                              outFrame, outCap);
}

}  // namespace

void CvOut12::tick() {
    if (!sink_) return;
    for (std::uint8_t i = 0; i < slotCount_; ++i) {
        if (!dirty_[i]) continue;
        std::uint8_t frame[mb::proto::kMaxFrame];
        const std::size_t n = encodeCvSet(channelFor(i), values_[i],
                                          frame, sizeof(frame));
        if (n > 0) sink_->send(frame, n);
        dirty_[i] = false;
    }
}

void CvOut12::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<CvOut12>(instanceId);
    });
}

namespace {
const int kCvOut12AutoRegister = [] { CvOut12::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
