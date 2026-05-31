#pragma once
/**
 * @file Mixer16Module.h
 * @brief 16-channel stereo mixer module (typeId `tp_mmb_mixer16`).
 *
 * @details
 * The 16-input sibling of @ref mmb_link::Mixer8Module.  Teensy's `AudioMixer4`
 * only sums four inputs, so each stereo bus is built from **four** banks whose
 * outputs are summed by a fifth mixer:
 *
 *     in_[ 0.. 3]  -> mixLa_ ┐
 *     in_[ 4.. 7]  -> mixLb_ ├─ mixLsum_ -> out_l
 *     in_[ 8..11]  -> mixLc_ ┤
 *     in_[12..15]  -> mixLd_ ┘
 *
 * (and the mirror for the right bus).  Per channel equal-power pan law:
 *
 *     left[i]  = vol[i] * cos(theta)
 *     right[i] = vol[i] * sin(theta)      with  theta = (pan + 1) * pi/4
 *
 * Port map:
 * | Direction | portId      | AudioStream                  |
 * |-----------|-------------|------------------------------|
 * | input     | `in1`…`in9` | `in_[0..8]`                 |
 * | input     | `in10`…`in16` | `in_[9..15]`              |
 * | output    | `out_l`     | `mixLsum_`, channel 0        |
 * | output    | `out_r`     | `mixRsum_`, channel 0        |
 *
 * Controls (N = 1 … 16):
 * | controlId | type  | range    | default | effect                  |
 * |-----------|-------|----------|---------|-------------------------|
 * | `volN`    | float | 0 … 1    | 0.8     | Channel N level         |
 * | `panN`    | float | -1 … +1  | 0       | Channel N stereo pan    |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief 16-channel stereo mixer with per-channel volume + pan. */
class Mixer16Module final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_mixer16";

    explicit Mixer16Module(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        // Four 4-channel banks per side, all summed by a final mixer at unity gain.
        mixLsum_.gain(0, 1.0f); mixLsum_.gain(1, 1.0f);
        mixLsum_.gain(2, 1.0f); mixLsum_.gain(3, 1.0f);
        mixRsum_.gain(0, 1.0f); mixRsum_.gain(1, 1.0f);
        mixRsum_.gain(2, 1.0f); mixRsum_.gain(3, 1.0f);
        for (uint8_t i = 0; i < 16; ++i) {
            in_[i].gain(1.0f);   // fan-out at unity; actual level is in the bank mix gains
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
        // portId is "inN" with N in 1..16.
        if (portId.size() >= 3 && portId[0] == 'i' && portId[1] == 'n') {
            const auto num = portId.substr(2);
            int idx = -1;
            if (num.size() == 1 && num[0] >= '1' && num[0] <= '9')
                idx = static_cast<int>(num[0] - '1');
            else if (num.size() == 2 && num[0] == '1' && num[1] >= '0' && num[1] <= '6')
                idx = 9 + static_cast<int>(num[1] - '0');  // "in10"→9 … "in16"→15
            if (idx >= 0 && idx < 16)
                return { const_cast<AudioAmplifier*>(&in_[idx]), 0, true };
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
        if (controlId.size() < 4) return;
        const bool isVol = controlId.compare(0, 3, "vol") == 0;
        const bool isPan = !isVol && controlId.compare(0, 3, "pan") == 0;
        if (!isVol && !isPan) return;
        const auto num = controlId.substr(3);
        int ch = -1;
        if (num.size() == 1 && num[0] >= '1' && num[0] <= '9')
            ch = static_cast<int>(num[0] - '1');
        else if (num.size() == 2 && num[0] == '1' && num[1] >= '0' && num[1] <= '6')
            ch = 9 + static_cast<int>(num[1] - '0');
        if (ch < 0 || ch >= 16) return;
        if (isVol) { vol_[ch] = asFloat(0.8f); updateChannel(static_cast<uint8_t>(ch)); }
        else       { pan_[ch] = asFloat(0.0f); updateChannel(static_cast<uint8_t>(ch)); }
    }

    /** @brief Register the mixer factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<Mixer16Module>(id);
            });
    }

private:
    /** @brief Apply equal-power pan + volume to channel @p i, distributing to
     *  the appropriate 4-channel bank (A=0-3, B=4-7, C=8-11, D=12-15). */
    void updateChannel(uint8_t i) {
        constexpr float kHalfPi = 1.57079632679489661923f;
        const float theta = (pan_[i] + 1.0f) * 0.5f * kHalfPi;
        const float l = vol_[i] * std::cos(theta);
        const float r = vol_[i] * std::sin(theta);
        if      (i <  4) { mixLa_.gain(i,      l); mixRa_.gain(i,      r); }
        else if (i <  8) { mixLb_.gain(i -  4, l); mixRb_.gain(i -  4, r); }
        else if (i < 12) { mixLc_.gain(i -  8, l); mixRc_.gain(i -  8, r); }
        else             { mixLd_.gain(i - 12, l); mixRd_.gain(i - 12, r); }
    }

    mutable AudioAmplifier in_[16];                   ///< Per-channel unity fan-out into L+R buses.
    mutable AudioMixer4    mixLa_, mixLb_, mixLc_, mixLd_;  ///< Left banks A-D (ch 0-3, 4-7, 8-11, 12-15).
    mutable AudioMixer4    mixRa_, mixRb_, mixRc_, mixRd_;  ///< Right banks A-D.
    mutable AudioMixer4    mixLsum_;                  ///< Left final sum (banks A+B+C+D).
    mutable AudioMixer4    mixRsum_;                  ///< Right final sum.

    // ── L bank connections ──────────────────────────────────────────────
    AudioConnection la0_{ in_[ 0], 0, mixLa_, 0 }; AudioConnection la1_{ in_[ 1], 0, mixLa_, 1 };
    AudioConnection la2_{ in_[ 2], 0, mixLa_, 2 }; AudioConnection la3_{ in_[ 3], 0, mixLa_, 3 };
    AudioConnection lb0_{ in_[ 4], 0, mixLb_, 0 }; AudioConnection lb1_{ in_[ 5], 0, mixLb_, 1 };
    AudioConnection lb2_{ in_[ 6], 0, mixLb_, 2 }; AudioConnection lb3_{ in_[ 7], 0, mixLb_, 3 };
    AudioConnection lc0_{ in_[ 8], 0, mixLc_, 0 }; AudioConnection lc1_{ in_[ 9], 0, mixLc_, 1 };
    AudioConnection lc2_{ in_[10], 0, mixLc_, 2 }; AudioConnection lc3_{ in_[11], 0, mixLc_, 3 };
    AudioConnection ld0_{ in_[12], 0, mixLd_, 0 }; AudioConnection ld1_{ in_[13], 0, mixLd_, 1 };
    AudioConnection ld2_{ in_[14], 0, mixLd_, 2 }; AudioConnection ld3_{ in_[15], 0, mixLd_, 3 };
    // ── R bank connections ──────────────────────────────────────────────
    AudioConnection ra0_{ in_[ 0], 0, mixRa_, 0 }; AudioConnection ra1_{ in_[ 1], 0, mixRa_, 1 };
    AudioConnection ra2_{ in_[ 2], 0, mixRa_, 2 }; AudioConnection ra3_{ in_[ 3], 0, mixRa_, 3 };
    AudioConnection rb0_{ in_[ 4], 0, mixRb_, 0 }; AudioConnection rb1_{ in_[ 5], 0, mixRb_, 1 };
    AudioConnection rb2_{ in_[ 6], 0, mixRb_, 2 }; AudioConnection rb3_{ in_[ 7], 0, mixRb_, 3 };
    AudioConnection rc0_{ in_[ 8], 0, mixRc_, 0 }; AudioConnection rc1_{ in_[ 9], 0, mixRc_, 1 };
    AudioConnection rc2_{ in_[10], 0, mixRc_, 2 }; AudioConnection rc3_{ in_[11], 0, mixRc_, 3 };
    AudioConnection rd0_{ in_[12], 0, mixRd_, 0 }; AudioConnection rd1_{ in_[13], 0, mixRd_, 1 };
    AudioConnection rd2_{ in_[14], 0, mixRd_, 2 }; AudioConnection rd3_{ in_[15], 0, mixRd_, 3 };
    // ── Bank-to-sum connections ──────────────────────────────────────────
    AudioConnection lsa_{ mixLa_, 0, mixLsum_, 0 }; AudioConnection lsb_{ mixLb_, 0, mixLsum_, 1 };
    AudioConnection lsc_{ mixLc_, 0, mixLsum_, 2 }; AudioConnection lsd_{ mixLd_, 0, mixLsum_, 3 };
    AudioConnection rsa_{ mixRa_, 0, mixRsum_, 0 }; AudioConnection rsb_{ mixRb_, 0, mixRsum_, 1 };
    AudioConnection rsc_{ mixRc_, 0, mixRsum_, 2 }; AudioConnection rsd_{ mixRd_, 0, mixRsum_, 3 };

    float vol_[16];  ///< Per-channel volume (0..1).
    float pan_[16];  ///< Per-channel pan (-1..+1).
};

}  // namespace mmb_link
