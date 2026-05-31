#pragma once
/**
 * @file Mixer8Module.h
 * @brief 8-channel stereo mixer module (typeId `tp_mmb_mixer8`).
 *
 * @details
 * The 8-input sibling of @ref mmb_link::MixerModule.  Teensy's `AudioMixer4`
 * only sums four inputs, so each stereo bus is built from **two** mixers whose
 * outputs are summed by a third:
 *
 *     in_[0..3]  -> mixLa_ ┐
 *                          ├─ mixLsum_ -> out_l
 *     in_[4..7]  -> mixLb_ ┘
 *
 * (and the mirror for the right bus).  Per channel the volume and an
 * equal-power pan law decide how much lands in each bus:
 *
 *     left[i]  = vol[i] * cos(theta)
 *     right[i] = vol[i] * sin(theta)      with  theta = (pan + 1) * pi/4
 *
 * This is the polyphony summing node for racks with up to 8 voices: N voice
 * chains feed their audio into separate mixer channels and the stereo
 * `out_l` / `out_r` pair carries the summed result to VCF / VCA / OUT.
 *
 * Port map:
 * | Direction | portId  | AudioStream / channel        |
 * |-----------|---------|------------------------------|
 * | input     | `in1`…`in4` | `in_[0..3]`, channel 0   |
 * | input     | `in5`…`in8` | `in_[4..7]`, channel 0   |
 * | output    | `out_l` | `mixLsum_`, channel 0        |
 * | output    | `out_r` | `mixRsum_`, channel 0        |
 *
 * Controls (N = 1 … 8):
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

/** @brief 8-channel stereo mixer with per-channel volume + pan. */
class Mixer8Module final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_mixer8";

    explicit Mixer8Module(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        // Sum the two 4-channel banks into the final bus at unity gain.
        mixLsum_.gain(0, 1.0f); mixLsum_.gain(1, 1.0f);
        mixRsum_.gain(0, 1.0f); mixRsum_.gain(1, 1.0f);
        for (uint8_t i = 0; i < 8; ++i) {
            in_[i].gain(1.0f);   // fan-out node runs at unity; level is in the mix gains
            vol_[i] = 0.8f;
            pan_[i] = 0.0f;
            updateChannel(i);
        }
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return { const_cast<AudioMixer4*>(&mixLsum_), 0, true };
        if (portId == "out_r") return { const_cast<AudioMixer4*>(&mixRsum_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        // portId is "inN" with N in 1..8.
        if (portId.size() == 3 && portId[0] == 'i' && portId[1] == 'n') {
            const char idx = portId[2];
            if (idx >= '1' && idx <= '8') {
                const uint8_t i = static_cast<uint8_t>(idx - '1');
                return { const_cast<AudioAmplifier*>(&in_[i]), 0, true };
            }
        }
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        // controlId is "volN" / "panN" with N in 1..8.
        if (controlId.size() == 4) {
            const char idx = controlId[3];
            if (idx >= '1' && idx <= '8') {
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
                return std::make_unique<Mixer8Module>(id);
            });
    }

private:
    /** @brief Recompute the left/right mix gains for channel @p i from its
     *  current volume + pan, using an equal-power pan law.  Channels 0..3 live
     *  on the first bank (mixLa_/mixRa_) at their own index, channels 4..7 on
     *  the second bank (mixLb_/mixRb_) at index i-4. */
    void updateChannel(uint8_t i) {
        constexpr float kHalfPi = 1.57079632679489661923f;
        const float theta = (pan_[i] + 1.0f) * 0.5f * kHalfPi;  // -1..+1 -> 0..pi/2
        const float l = vol_[i] * std::cos(theta);
        const float r = vol_[i] * std::sin(theta);
        if (i < 4) { mixLa_.gain(i, l);     mixRa_.gain(i, r); }
        else       { mixLb_.gain(i - 4, l); mixRb_.gain(i - 4, r); }
    }

    mutable AudioAmplifier in_[8];   ///< Per-channel unity fan-out into L+R buses.
    mutable AudioMixer4    mixLa_;   ///< Left bank A (channels 0..3).
    mutable AudioMixer4    mixLb_;   ///< Left bank B (channels 4..7).
    mutable AudioMixer4    mixRa_;   ///< Right bank A (channels 0..3).
    mutable AudioMixer4    mixRb_;   ///< Right bank B (channels 4..7).
    mutable AudioMixer4    mixLsum_; ///< Left final sum (bank A + bank B).
    mutable AudioMixer4    mixRsum_; ///< Right final sum (bank A + bank B).
    // Internal wiring: each input fans out to its bank channel on both buses.
    AudioConnection la0_{ in_[0], 0, mixLa_, 0 };
    AudioConnection la1_{ in_[1], 0, mixLa_, 1 };
    AudioConnection la2_{ in_[2], 0, mixLa_, 2 };
    AudioConnection la3_{ in_[3], 0, mixLa_, 3 };
    AudioConnection lb0_{ in_[4], 0, mixLb_, 0 };
    AudioConnection lb1_{ in_[5], 0, mixLb_, 1 };
    AudioConnection lb2_{ in_[6], 0, mixLb_, 2 };
    AudioConnection lb3_{ in_[7], 0, mixLb_, 3 };
    AudioConnection ra0_{ in_[0], 0, mixRa_, 0 };
    AudioConnection ra1_{ in_[1], 0, mixRa_, 1 };
    AudioConnection ra2_{ in_[2], 0, mixRa_, 2 };
    AudioConnection ra3_{ in_[3], 0, mixRa_, 3 };
    AudioConnection rb0_{ in_[4], 0, mixRb_, 0 };
    AudioConnection rb1_{ in_[5], 0, mixRb_, 1 };
    AudioConnection rb2_{ in_[6], 0, mixRb_, 2 };
    AudioConnection rb3_{ in_[7], 0, mixRb_, 3 };
    // Bank sums into the final stereo buses.
    AudioConnection lsa_{ mixLa_, 0, mixLsum_, 0 };
    AudioConnection lsb_{ mixLb_, 0, mixLsum_, 1 };
    AudioConnection rsa_{ mixRa_, 0, mixRsum_, 0 };
    AudioConnection rsb_{ mixRb_, 0, mixRsum_, 1 };
    float vol_[8];   ///< Per-channel volume 0..1.
    float pan_[8];   ///< Per-channel pan -1..+1.
};

}  // namespace mmb_link
