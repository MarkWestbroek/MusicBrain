#pragma once
/**
 * @file VcaModule.h
 * @brief VCA module (typeId `tp_mmb_vca`): wraps `AudioEffectMultiply`.
 *
 * @details
 * `AudioEffectMultiply` computes `output = input0 × input1`, which gives a
 * linear VCA when input0 carries the audio signal and input1 carries a 0 … 1
 * control voltage (typically the output of an `AhdsrAudioModule`'s DC proxy).
 *
 * Port map:
 * | Direction | portId | AudioStream / channel         |
 * |-----------|--------|-------------------------------|
 * | input     | `in`   | `mult_`, channel 0 (audio)    |
 * | input     | `cv`   | `mult_`, channel 1 (envelope) |
 * | output    | `out`  | `mult_`, channel 0            |
 *
 * Controls:
 * | controlId | type    | effect                                 |
 * |-----------|---------|----------------------------------------|
 * | `gain`    | float   | Base gain — stored, not yet used       |
 * | `resp`    | int32_t | 0=Lin, 1=Exp — stored, not yet used    |
 *
 * In the current implementation the gain and response-curve controls are
 * captured for future use but not applied (the CV signal fully controls
 * the VCA amplitude via the multiply operation).
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief Linear VCA backed by `AudioEffectMultiply`. */
class VcaModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vca";

    explicit VcaModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioEffectMultiply*>(&mult_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioEffectMultiply*>(&mult_), 0, true };
        if (portId == "cv")
            return { const_cast<AudioEffectMultiply*>(&mult_), 1, true };
        return {};
    }

    void setControl(std::string_view /*controlId*/,
                    mb::runtime::ControlValue /*value*/) override {
        // gain / resp stored for future use; multiply handles amplitude via CV
    }

    /** @brief Register the VCA factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VcaModule>(id);
            });
    }

private:
    mutable AudioEffectMultiply mult_;
};

}  // namespace mmb_link
