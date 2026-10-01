#pragma once
/**
 * @file ReservoirModule.h
 * @brief Resource-coupled synthesis (typeId `tp_mmb_reservoir`): één eindige,
 *        langzaam herstellende bron waar tot vier stemmen uit putten.
 *
 * @details
 * CV-domein-module (1 kHz tick). Iedere belasting op `in_a..in_d` (envelope,
 * gate, 0..1) trekt de bron leeg; de bron vult exponentieel bij met
 * tijdconstante `recover`. `out_N` is de eigen belasting maal het aanbod,
 * dus een harde noot laat tijdelijk minder over voor de volgende stem en het
 * herstel is hoorbaar. `level` is de bron zelf (0..1), `starve` het tekort,
 * `empty` een gate zodra de bron onder `thresh` zakt (hysterese 0,1).
 *
 * De DSP is @ref mmb_dsp::Reservoir, dezelfde header als de browser
 * (`tools/mmb-wasm/reservoir_wasm.cc` draait deze klasse via cvhost.h).
 *
 * Port map:
 * | Dir | portId   | Kind | Betekenis                                   |
 * |-----|----------|------|---------------------------------------------|
 * | in  | `in_a..d`| Cv   | Belasting per stem 0..1                     |
 * | in  | `refill` | Cv   | Extra bijvulling 0..1 (2 per seconde bij 1) |
 * | in  | `reset`  | Gate | Bron direct vol                             |
 * | out | `out_a..d`| Cv  | Belasting maal aanbod                       |
 * | out | `level`  | Cv   | Bron 0..1                                   |
 * | out | `starve` | Cv   | 1 - level                                   |
 * | out | `empty`  | Gate | Bron onder de drempel                       |
 *
 * Controls: `drain` (0..1; bij 1 en één volle stem leeg in 1 s), `recover`
 * (0,1..20 s), `floor` (minimaal aanbod 0..1), `curve` (0,25..4, aanbod =
 * floor + (1-floor) * level^curve), `thresh` (0..1).
 */

#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/reservoir.h"
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

class ReservoirModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_reservoir";

    explicit ReservoirModule(std::string_view id) : CvModule(kTypeId, id) {
        reservoir_.Init(static_cast<float>(mb::runtime::kCvTickRateHz));
    }

    void tick() override {
        const bool reset = reset_ >= 0.5f;
        reservoir_.tick(reset && !resetHigh_);
        resetHigh_ = reset;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_a" || portId == "out_b" || portId == "out_c" || portId == "out_d") return PortKind::Cv;
        if (portId == "level" || portId == "starve") return PortKind::Cv;
        if (portId == "empty") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_a" || portId == "in_b" || portId == "in_c" || portId == "in_d" || portId == "refill") return PortKind::Cv;
        if (portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "out_a") return reservoir_.output(0);
        if (portId == "out_b") return reservoir_.output(1);
        if (portId == "out_c") return reservoir_.output(2);
        if (portId == "out_d") return reservoir_.output(3);
        if (portId == "level") return reservoir_.level();
        if (portId == "starve") return reservoir_.starve();
        if (portId == "empty") return reservoir_.empty() ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "in_a") reservoir_.setLoad(0, value);
        else if (portId == "in_b") reservoir_.setLoad(1, value);
        else if (portId == "in_c") reservoir_.setLoad(2, value);
        else if (portId == "in_d") reservoir_.setLoad(3, value);
        else if (portId == "refill") reservoir_.setRefill(value);
        else if (portId == "reset") reset_ = value;
    }
    void onCvDisconnected(std::string_view portId) override { writeCvPort(portId, 0); }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::Reservoir;
        if (controlId == "drain") reservoir_.setControl(Kernel::Drain, number);
        else if (controlId == "recover") reservoir_.setControl(Kernel::Recover, number);
        else if (controlId == "floor") reservoir_.setControl(Kernel::Floor, number);
        else if (controlId == "curve") reservoir_.setControl(Kernel::Curve, number);
        else if (controlId == "thresh") reservoir_.setControl(Kernel::Thresh, number);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ReservoirModule>(id);
        });
    }

private:
    mmb_dsp::Reservoir reservoir_;
    float reset_ = 0;
    bool resetHigh_ = false;
};

}
