#pragma once
/**
 * @file ClockModule.h
 * @brief Masterklok met delers, vermenigvuldigers, swing en een maatzaag
 *        (typeId `tp_mmb_clock`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Eén fase in tellen (kwartnoten) waar alle
 * uitgangen van worden afgeleid, zodat ze onderling nooit verschuiven:
 * `beat` (kwart), `x2` (achtsten), `x3` (triolen), `x4` (zestienden, met
 * swing), `bar` (elke vier tellen), `div` (elke `div` zestienden) en `ramp`,
 * een zaag 0..1 per maat om modulatie aan de maat te hangen.
 *
 * `x4` is de stapklok voor de sequencers: Seq16 `clock`, Grids/Euclid/Turing
 * `clock` met ExtClk aan. Swing verschuift elke tweede zestiende (0 = recht,
 * 1 = triolen-swing). Reset zet de fase op nul; de eerste tick daarna zijn
 * alle uitgangen hoog (de één).
 *
 * Port map:
 * | Dir | portId     | Kind | Betekenis                              |
 * |-----|------------|------|----------------------------------------|
 * | in  | `reset`    | Gate | Stijgende flank: terug naar de één     |
 * | in  | `tempo_cv` | Cv   | Tempo exponentieel: +1 = dubbel tempo  |
 * | out | `bar`      | Gate | Eén puls per maat (4 tellen)           |
 * | out | `beat`     | Gate | Kwartnoten                             |
 * | out | `x2`       | Gate | Achtsten                               |
 * | out | `x3`       | Gate | Achtste triolen                        |
 * | out | `x4`       | Gate | Zestienden, met swing                  |
 * | out | `div`      | Gate | Elke `div` zestienden                  |
 * | out | `ramp`     | Cv   | Zaag 0..1 per maat                     |
 *
 * Controls: `tempo` (20..300 bpm), `swing` (0..1), `width` (pulsbreedte
 * 0,05..0,95), `div` (1..64 zestienden), `run` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class ClockModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_clock";

    explicit ClockModule(std::string_view id) : CvModule(kTypeId, id) { evaluate(); }

    void tick() override {
        if (resetEdge_.rise(reset_ >= 0.5f)) { beats_ = 0.0; fresh_ = true; }
        if (!run_) { for (bool& gate : gates_) gate = false; return; }
        if (fresh_) fresh_ = false;        // de één klinkt op fase nul
        else {
            const float bpm = cvutil::clampFinite(bpm_ * std::exp2(tempoCv_), 5.0f, 1200.0f, 120.0f);
            beats_ += static_cast<double>(bpm) / 60000.0;
            if (beats_ >= 4.0 * 64.0) beats_ -= 4.0 * 64.0;   // 64 maten: deelbaar door elke div
        }
        evaluate();
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "bar" || portId == "beat" || portId == "x2" || portId == "x3" ||
            portId == "x4" || portId == "div")
            return PortKind::Gate;
        if (portId == "ramp") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "reset") return PortKind::Gate;
        if (portId == "tempo_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "bar")  return gates_[0] ? 1.0f : 0.0f;
        if (portId == "beat") return gates_[1] ? 1.0f : 0.0f;
        if (portId == "x2")   return gates_[2] ? 1.0f : 0.0f;
        if (portId == "x3")   return gates_[3] ? 1.0f : 0.0f;
        if (portId == "x4")   return gates_[4] ? 1.0f : 0.0f;
        if (portId == "div")  return gates_[5] ? 1.0f : 0.0f;
        if (portId == "ramp") return ramp_;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "reset") reset_ = value;
        else if (portId == "tempo_cv") tempoCv_ = cvutil::clampFinite(value, -4.0f, 4.0f, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "tempo") bpm_ = cvutil::clampFinite(cvutil::asFloat(value, 120.0f), 20.0f, 300.0f, 120.0f);
        else if (controlId == "swing") swing_ = cvutil::clampFinite(cvutil::asFloat(value, 0.0f), 0.0f, 1.0f, 0.0f);
        else if (controlId == "width") width_ = cvutil::clampFinite(cvutil::asFloat(value, 0.5f), 0.05f, 0.95f, 0.5f);
        else if (controlId == "div") {
            const int div = static_cast<int>(cvutil::asFloat(value, 6.0f) + 0.5f);
            div_ = div < 1 ? 1 : div > 64 ? 64 : div;
        }
        else if (controlId == "run") { run_ = cvutil::asBool(value, true); if (!run_) fresh_ = true; }
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ClockModule>(id);
        });
    }

private:
    static double fraction(double value) { return value - std::floor(value); }
    bool pulse(double pulsesPerBeat) const {
        return fraction(beats_ * pulsesPerBeat + 1e-9) < width_;
    }
    void evaluate() {
        gates_[0] = pulse(0.25);
        gates_[1] = pulse(1.0);
        gates_[2] = pulse(2.0);
        gates_[3] = pulse(3.0);
        // Zestienden per paar (een achtste): de tweede schuift met swing op
        // van de helft naar twee derde van het paar.
        const double pair = fraction(beats_ * 2.0 + 1e-9);
        const double second = 0.5 + swing_ / 6.0;
        const double high = 0.5 * width_ * (1.0 - swing_ / 3.0);
        gates_[4] = pair < high || (pair >= second && pair < second + high);
        gates_[5] = fraction(beats_ * 4.0 / div_ + 1e-9) < width_;
        ramp_ = static_cast<float>(fraction(beats_ * 0.25));
    }

    double beats_ = 0.0;
    float bpm_ = 120.0f, swing_ = 0.0f, width_ = 0.5f, tempoCv_ = 0.0f, reset_ = 0.0f, ramp_ = 0.0f;
    int div_ = 6;
    bool run_ = true, fresh_ = true;
    bool gates_[6] = {};
    cvutil::Edge resetEdge_;
};

}  // namespace mmb_link
