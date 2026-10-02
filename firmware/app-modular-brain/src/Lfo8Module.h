#pragma once
/**
 * @file Lfo8Module.h
 * @brief Acht vrijlopende, verwante LFO's op één knop (typeId `tp_mmb_lfo8`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Eén Rate-knop zet acht LFO's tegelijk:
 * uitgang 1 is de snelste, elke volgende is een factor `spread` trager, met
 * een kleine vaste afwijking per uitgang zodat ze nooit in de maat gaan
 * lopen. Het idee is bekend van de "acht organische LFO's"-modules: prik
 * overal een uitgang in en de hele patch beweegt samenhangend, van trilling
 * tot getij. `shape` loopt van driehoek (0) naar sinus (1).
 *
 * Port map:
 * | Dir | portId     | Kind | Betekenis                                  |
 * |-----|------------|------|--------------------------------------------|
 * | in  | `rate_cv`  | Cv   | Exponentieel: ±1 = ±4 octaven, alle acht   |
 * | in  | `reset`    | Gate | Alle fasen terug naar nul                  |
 * | out | `out_1..8` | Cv   | Acht LFO's, snel naar traag                |
 *
 * Controls: `rate` (0,02..50 Hz, de snelste), `spread` (1,1..3), `shape`
 * (0..1), `depth` (0..1), `bipolar` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class Lfo8Module final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_lfo8";
    static constexpr int kCount = 8;

    explicit Lfo8Module(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        if (resetEdge_.rise(reset_ >= 0.5f))
            for (double& phase : phase_) phase = 0.0;
        // Vaste kleine afwijkingen: de verhoudingen worden nooit geheel.
        static constexpr float kDrift[kCount] = {1.0f, 0.971f, 1.043f, 0.937f, 1.061f, 0.983f, 1.019f, 0.953f};
        float hz = cvutil::clampFinite(rate_ * std::exp2(4.0f * rateCv_), 0.0001f, 200.0f, 1.0f);
        for (int index = 0; index < kCount; ++index) {
            phase_[index] += static_cast<double>(hz * kDrift[index]) * 0.001;
            if (phase_[index] >= 1.0) phase_[index] -= std::floor(phase_[index]);
            const float phase = static_cast<float>(phase_[index]);
            // Driehoek die op nul begint en eerst stijgt, zoals de sinus.
            const float triangle = phase < 0.25f ? 4.0f * phase
                                 : phase < 0.75f ? 2.0f - 4.0f * phase
                                 : 4.0f * phase - 4.0f;
            const float sine = std::sin(6.2831853f * phase);
            const float wave = triangle + (sine - triangle) * shape_;
            out_[index] = depth_ * (bipolar_ ? wave : 0.5f + 0.5f * wave);
            hz /= spread_;
        }
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_1" || portId == "out_2" || portId == "out_3" || portId == "out_4" ||
            portId == "out_5" || portId == "out_6" || portId == "out_7" || portId == "out_8")
            return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "rate_cv") return PortKind::Cv;
        if (portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId.size() == 5 && portId.substr(0, 4) == "out_") {
            const int index = portId[4] - '1';
            if (index >= 0 && index < kCount) return out_[index];
        }
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "rate_cv") rateCv_ = cvutil::clampFinite(value, -2.0f, 2.0f, 0.0f);
        else if (portId == "reset") reset_ = value;
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "rate") rate_ = cvutil::clampFinite(cvutil::asFloat(value, 1.0f), 0.02f, 50.0f, 1.0f);
        else if (controlId == "spread") spread_ = cvutil::clampFinite(cvutil::asFloat(value, 1.6f), 1.1f, 3.0f, 1.6f);
        else if (controlId == "shape") shape_ = cvutil::clampFinite(cvutil::asFloat(value, 0.0f), 0.0f, 1.0f, 0.0f);
        else if (controlId == "depth") depth_ = cvutil::clampFinite(cvutil::asFloat(value, 1.0f), 0.0f, 1.0f, 1.0f);
        else if (controlId == "bipolar") bipolar_ = cvutil::asBool(value, true);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<Lfo8Module>(id);
        });
    }

private:
    cvutil::Edge resetEdge_;
    double phase_[kCount] = {};
    float out_[kCount] = {};
    float rate_ = 1.0f, spread_ = 1.6f, shape_ = 0.0f, depth_ = 1.0f, rateCv_ = 0.0f, reset_ = 0.0f;
    bool bipolar_ = true;
};

}  // namespace mmb_link
