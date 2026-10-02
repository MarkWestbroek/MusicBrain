#pragma once
/**
 * @file SampleHoldModule.h
 * @brief Sample & hold, track & hold en slew (typeId `tp_mmb_sh`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Het paneel bestond al in de editor; dit is de
 * firmwarekant, die via cvhost.h ook in de simulator draait.
 *
 * - **S&H**: elke stijgende flank op `trig` neemt de waarde van `in` over.
 * - **T&H**: zolang `trig` hoog is volgt de uitgang `in`; laag = vasthouden.
 * - **Slew**: geen trigger nodig, de uitgang volgt `in` met de slew-tijd.
 *
 * `slew` (ms) werkt in alle standen op de uitgang: S&H met slew geeft
 * glijdende trapjes. Zit er geen kabel in `in`, dan is de bron interne ruis
 * (uniform -1..1): S&H wordt de klassieke random-trap, Slew een traag
 * zwervende random-CV.
 *
 * Port map:
 * | Dir | portId | Kind | Betekenis                          |
 * |-----|--------|------|------------------------------------|
 * | in  | `in`   | Cv   | Te bemonsteren CV (los = ruis)     |
 * | in  | `trig` | Gate | Flank (S&H) of niveau (T&H)        |
 * | out | `out`  | Cv   | Vastgehouden / gladgestreken CV    |
 *
 * Controls: `slew` (0..5000 ms, tijdconstante), `mode` (0 S&H, 1 T&H, 2 Slew).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class SampleHoldModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sh";

    explicit SampleHoldModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const float source = inPatched_ ? in_ : rng_.uniform() * 2.0f - 1.0f;
        const bool trig = trig_ >= 0.5f;
        if (mode_ == 0) { if (edge_.rise(trig)) held_ = source; }
        else if (mode_ == 1) { edge_.rise(trig); if (trig) held_ = source; }
        else held_ = source;
        if (slewMs_ < 0.5f) out_ = held_;
        else out_ += slewCoefficient_ * (held_ - out_);
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Cv;
        if (portId == "trig") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "out" ? out_ : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "in") { in_ = cvutil::clampFinite(value, -10.0f, 10.0f, 0.0f); inPatched_ = true; }
        else if (portId == "trig") trig_ = value;
    }
    void onCvDisconnected(std::string_view portId) override {
        if (portId == "in") { in_ = 0.0f; inPatched_ = false; }
        else writeCvPort(portId, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "slew") {
            slewMs_ = cvutil::clampFinite(cvutil::asFloat(value, 0.0f), 0.0f, 5000.0f, 0.0f);
            slewCoefficient_ = slewMs_ < 0.5f ? 1.0f : 1.0f - std::exp(-1.0f / slewMs_);
        } else if (controlId == "mode") {
            const int mode = static_cast<int>(cvutil::asFloat(value, 0.0f) + 0.5f);
            mode_ = mode < 0 ? 0 : mode > 2 ? 2 : mode;
        }
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SampleHoldModule>(id);
        });
    }

private:
    cvutil::Rng rng_;
    cvutil::Edge edge_;
    float in_ = 0.0f, trig_ = 0.0f, held_ = 0.0f, out_ = 0.0f;
    float slewMs_ = 0.0f, slewCoefficient_ = 1.0f;
    int mode_ = 0;
    bool inPatched_ = false;
};

}  // namespace mmb_link
