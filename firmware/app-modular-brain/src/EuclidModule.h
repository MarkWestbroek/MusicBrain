#pragma once
/**
 * @file EuclidModule.h
 * @brief Euclidische ritmegenerator, drie kanalen (typeId `tp_mmb_euclid`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Per kanaal verdeelt het Euclidische
 * algoritme (Bjorklund/Toussaint) `fill` slagen zo gelijk mogelijk over
 * `steps` stappen; `rot` draait het patroon. E(3,8) is de tresillo, E(5,8)
 * (met `rot` 6) de cinquillo, E(7,16) een samba-achtig patroon. Drie kanalen met
 * verschillende lengtes schuiven tegen elkaar: polymetriek zonder moeite.
 *
 * Klok zoals Grids: intern (`tempo`, zestienden) of extern (`extclock` aan +
 * `clock`-jack, bijvoorbeeld Clock `x4`). De uitgang is hoog zolang de
 * klokpuls van een raak-stap hoog is. `fill_k_cv` telt op bij de fill-knop
 * (0..1 = 0..steps), zodat een LFO of Chaos het ritme dichter en ijler maakt.
 *
 * Port map:
 * | Dir | portId        | Kind | Betekenis                        |
 * |-----|---------------|------|----------------------------------|
 * | in  | `clock`       | Gate | Stapklok (met `extclock`)        |
 * | in  | `reset`       | Gate | Terug naar stap 0                |
 * | in  | `fill_1_cv`.. | Cv   | Extra fill per kanaal (0..1)     |
 * | out | `out_1..3`    | Gate | Slagen per kanaal                |
 * | out | `any`         | Gate | Een van de drie slaat            |
 *
 * Controls: `steps_k` (1..32), `fill_k` (0..32), `rot_k` (0..31) voor
 * k = 1..3, `tempo` (bpm), `extclock` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class EuclidModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_euclid";
    static constexpr int kChannels = 3;

    explicit EuclidModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const bool clockIn = clock_ >= 0.5f;
        bool advance, clockHigh;
        if (extClock_) { advance = clockEdge_.rise(clockIn); clockHigh = clockIn; }
        else { advance = internal_.tick(); clockHigh = internal_.high(); }
        if (resetEdge_.rise(reset_ >= 0.5f)) {
            step_ = 0; internal_.reset(); primed_ = false;
            if (!extClock_) advance = false;   // de interne klok begint de volgende tick opnieuw
        }
        if (advance) {
            if (primed_) ++step_;      // de eerste klokpuls speelt stap 0
            primed_ = true;
            for (int channel = 0; channel < kChannels; ++channel) hit_[channel] = isHit(channel);
        }
        for (int channel = 0; channel < kChannels; ++channel)
            out_[channel] = primed_ && hit_[channel] && clockHigh;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_1" || portId == "out_2" || portId == "out_3" || portId == "any")
            return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset") return PortKind::Gate;
        if (portId == "fill_1_cv" || portId == "fill_2_cv" || portId == "fill_3_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "out_1") return out_[0] ? 1.0f : 0.0f;
        if (portId == "out_2") return out_[1] ? 1.0f : 0.0f;
        if (portId == "out_3") return out_[2] ? 1.0f : 0.0f;
        if (portId == "any")   return out_[0] || out_[1] || out_[2] ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "clock") clock_ = value;
        else if (portId == "reset") reset_ = value;
        else if (portId == "fill_1_cv") fillCv_[0] = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
        else if (portId == "fill_2_cv") fillCv_[1] = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
        else if (portId == "fill_3_cv") fillCv_[2] = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        const int number = static_cast<int>(std::floor(cvutil::asFloat(value, 0.0f) + 0.5f));
        if      (controlId == "steps_1") steps_[0] = limit(number, 1, 32);
        else if (controlId == "steps_2") steps_[1] = limit(number, 1, 32);
        else if (controlId == "steps_3") steps_[2] = limit(number, 1, 32);
        else if (controlId == "fill_1")  fill_[0] = limit(number, 0, 32);
        else if (controlId == "fill_2")  fill_[1] = limit(number, 0, 32);
        else if (controlId == "fill_3")  fill_[2] = limit(number, 0, 32);
        else if (controlId == "rot_1")   rot_[0] = limit(number, 0, 31);
        else if (controlId == "rot_2")   rot_[1] = limit(number, 0, 31);
        else if (controlId == "rot_3")   rot_[2] = limit(number, 0, 31);
        else if (controlId == "tempo")   internal_.setBpm(cvutil::asFloat(value, 120.0f));
        else if (controlId == "extclock") extClock_ = cvutil::asBool(value, false);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<EuclidModule>(id);
        });
    }

private:
    static int limit(int value, int low, int high) { return value < low ? low : value > high ? high : value; }

    bool isHit(int channel) const {
        const int steps = steps_[channel];
        int fill = fill_[channel] + static_cast<int>(std::floor(fillCv_[channel] * steps + 0.5f));
        fill = limit(fill, 0, steps);
        if (fill == 0) return false;
        const int index = static_cast<int>((step_ + steps - rot_[channel] % steps) % steps);
        return (index * fill) % steps < fill;
    }

    cvutil::StepClock internal_;
    cvutil::Edge clockEdge_, resetEdge_;
    float clock_ = 0.0f, reset_ = 0.0f;
    float fillCv_[kChannels] = {};
    int steps_[kChannels] = {16, 16, 16};
    int fill_[kChannels] = {4, 3, 5};
    int rot_[kChannels] = {0, 4, 2};
    std::uint32_t step_ = 0;
    bool extClock_ = false, primed_ = false;
    bool hit_[kChannels] = {}, out_[kChannels] = {};
};

}  // namespace mmb_link
