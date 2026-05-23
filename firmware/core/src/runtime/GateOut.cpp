// ADR 0009 / ADR 0010 \u2014 digital gate breakout impl.
#include "mb/runtime/GateOut.h"

namespace mb::runtime {

namespace {

std::size_t encodeGateSet(std::uint16_t channel, bool on,
                          std::uint8_t* outFrame, std::size_t outCap) {
    std::uint8_t payload[3];
    payload[0] = static_cast<std::uint8_t>((channel >> 8) & 0xFF);
    payload[1] = static_cast<std::uint8_t>(channel & 0xFF);
    payload[2] = on ? 1 : 0;
    return mb::proto::encode(mb::proto::Opcode::GateSet,
                              payload, sizeof(payload),
                              outFrame, outCap);
}

}  // namespace

void GateOut::tick() {
    if (!sink_) return;
    for (std::uint8_t i = 0; i < slotCount_; ++i) {
        if (!dirty_[i]) continue;                       // never sent / unchanged
        const bool desired = values_[i] > 0.5f;
        // Dedup: a repeated identical write does not need to hit the bus.
        if (hasSent_[i] && desired == lastSent_[i]) {
            dirty_[i] = false;
            continue;
        }
        std::uint8_t frame[mb::proto::kMaxFrame];
        const std::size_t n = encodeGateSet(channelFor(i), desired,
                                            frame, sizeof(frame));
        if (n > 0) sink_->send(frame, n);
        dirty_[i]    = false;
        lastSent_[i] = desired;
        hasSent_[i]  = true;
    }
}

void GateOut::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<GateOut>(instanceId);
    });
}

namespace {
const int kGateOutAutoRegister = [] { GateOut::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
