#pragma once
/**
 * @file MixerModule.h
 * @brief 4-channel stereo mixer module (typeId `tp_mmb_mixer`).
 *
 * @details
 * A 4-input mixer with a per-channel **volume** and **pan** control and a
 * **stereo** output bus.  Each input is fanned out (via a unity-gain
 * `AudioAmplifier`) into a left and a right `AudioMixer4`; the channel's
 * volume and an equal-power pan law decide how much of it lands in each bus:
 *
 *     left[i]  = vol[i] * cos(theta)
 *     right[i] = vol[i] * sin(theta)      with  theta = (pan + 1) * pi/4
 *
 * So `pan = -1` is hard-left, `pan = +1` is hard-right, and `pan = 0` sends
 * an equal-power -3 dB to both sides.
 *
 * This is the building block for polyphony: N voice chains feed their audio
 * into separate mixer channels and the stereo `out_l` / `out_r` pair carries
 * the summed result to a VCF / VCA / OUT.
 *
 * Port map:
 * | Direction | portId  | AudioStream / channel   |
 * |-----------|---------|-------------------------|
 * | input     | `in1`   | `in_[0]`, channel 0     |
 * | input     | `in2`   | `in_[1]`, channel 0     |
 * | input     | `in3`   | `in_[2]`, channel 0     |
 * | input     | `in4`   | `in_[3]`, channel 0     |
 * | output    | `out_l` | `mixL_`, channel 0      |
 * | output    | `out_r` | `mixR_`, channel 0      |
 *
 * Controls (N = 1 … 4):
 * | controlId | type  | range    | default | effect                  |
 * |-----------|-------|----------|---------|-------------------------|
 * | `volN`    | float | 0 … 1    | 0.8     | Channel N level         |
 * | `panN`    | float | -1 … +1  | 0       | Channel N stereo pan    |
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief 4-channel stereo mixer with per-channel volume + pan. */
class MixerModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_mixer";

    explicit MixerModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        for (uint8_t i = 0; i < 4; ++i) {
            in_[i].gain(1.0f);   // fan-out node runs at unity; level is in the mix gains
            vol_[i] = 0.8f;
            pan_[i] = 0.0f;
            updateChannel(i);
        }
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return { const_cast<AudioMixer4*>(&mixL_), 0, true };
        if (portId == "out_r") return { const_cast<AudioMixer4*>(&mixR_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in1") return { const_cast<AudioAmplifier*>(&in_[0]), 0, true };
        if (portId == "in2") return { const_cast<AudioAmplifier*>(&in_[1]), 0, true };
        if (portId == "in3") return { const_cast<AudioAmplifier*>(&in_[2]), 0, true };
        if (portId == "in4") return { const_cast<AudioAmplifier*>(&in_[3]), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        // controlId is "volN" / "panN" with N in 1..4.
        if (controlId.size() == 4) {
            const char idx = controlId[3];
            if (idx >= '1' && idx <= '4') {
                const uint8_t i = static_cast<uint8_t>(idx - '1');
                if      (controlId.compare(0, 3, "vol") == 0) { vol_[i] = asFloat(0.8f); updateChannel(i); }
                else if (controlId.compare(0, 3, "pan") == 0) { pan_[i] = asFloat(0.0f); updateChannel(i); }
            }
        }
    }

    /** @brief Register the mixer factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<MixerModule>(id);
            });
    }

private:
    /** @brief Recompute the left/right mix gains for channel @p i from its
     *  current volume + pan, using an equal-power pan law. */
    void updateChannel(uint8_t i) {
        constexpr float kHalfPi = 1.57079632679489661923f;
        const float theta = (pan_[i] + 1.0f) * 0.5f * kHalfPi;  // -1..+1 -> 0..pi/2
        mixL_.gain(i, vol_[i] * std::cos(theta));
        mixR_.gain(i, vol_[i] * std::sin(theta));
    }

    mutable AudioAmplifier in_[4];   ///< Per-channel unity fan-out into L+R buses.
    mutable AudioMixer4    mixL_;    ///< Left summing bus.
    mutable AudioMixer4    mixR_;    ///< Right summing bus.
    // Internal wiring: each input fans out to the same channel index on both buses.
    AudioConnection l0_{ in_[0], 0, mixL_, 0 };
    AudioConnection l1_{ in_[1], 0, mixL_, 1 };
    AudioConnection l2_{ in_[2], 0, mixL_, 2 };
    AudioConnection l3_{ in_[3], 0, mixL_, 3 };
    AudioConnection r0_{ in_[0], 0, mixR_, 0 };
    AudioConnection r1_{ in_[1], 0, mixR_, 1 };
    AudioConnection r2_{ in_[2], 0, mixR_, 2 };
    AudioConnection r3_{ in_[3], 0, mixR_, 3 };
    float vol_[4];   ///< Per-channel volume 0..1.
    float pan_[4];   ///< Per-channel pan -1..+1.
};

}  // namespace mmb_link
