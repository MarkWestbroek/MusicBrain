#pragma once
/**
 * @file NoiseModule.h
 * @brief Ruisgenerator (typeId `tp_mmb_noise`): wit, roze of bruin.
 *
 * @details
 * Een `AudioStream` zonder ingangen rond de kernel `mmb_dsp::Noise`
 * (firmware/lib/mmb-dsp), gedeeld met de browser-simulator. De Teensy Audio
 * Library heeft wel wit en roze, maar geen bruin, en de simulator moet
 * dezelfde reeks geven — vandaar een eigen kernel.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel |
 * |-----------|--------|--------|------------------|
 * | output    | `out`  | Audio  | `gen_`, kanaal 0 |
 *
 * Controls:
 * | controlId | type  | range | default | effect               |
 * |-----------|-------|-------|---------|----------------------|
 * | `color`   | int   | 0 … 2 | 0       | wit / roze / bruin   |
 * | `level`   | float | 0 … 1 | 0.6     | uitgangsniveau       |
 */
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/noise.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief AudioStream-schil rond @ref mmb_dsp::Noise: float → int16. */
class AudioSynthMmbNoise : public AudioStream {
public:
    AudioSynthMmbNoise() : AudioStream(0, nullptr) { k_.Init(); }

    void color(int c)   { k_.color(c); }
    void level(float l) { k_.level(l); }

    void update() override {
        audio_block_t* block = allocate();
        if (!block) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i)
            block->data[i] = static_cast<int16_t>(k_.Tick() * 32767.0f);
        transmit(block, 0);
        release(block);
    }

private:
    mmb_dsp::Noise k_;
};

/** @brief Module wrapper around @ref AudioSynthMmbNoise. */
class NoiseModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_noise";

    explicit NoiseModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioSynthMmbNoise*>(&gen_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "color") gen_.color(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "level") gen_.level(asFloat(0.6f));
    }

    /** @brief Register the noise factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<NoiseModule>(id);
            });
    }

private:
    mutable AudioSynthMmbNoise gen_;
};

}  // namespace mmb_link
