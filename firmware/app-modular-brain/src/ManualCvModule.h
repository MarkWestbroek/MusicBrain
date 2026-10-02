#pragma once
/**
 * @file ManualCvModule.h
 * @brief Handbediende CV-bronnen: vier schuiven (`tp_mmb_faders`) of vier
 *        draaiknoppen (`tp_mmb_knobs`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Om een CV-ingang met de hand te proberen:
 * de cutoff van een filter, Fold van de FOLDER, Pedal van de WAH, Mode van
 * het SEM-filter. Elke uitgang volgt zijn bedieningselement, gladgestreken
 * met `slew` (zodat een sprong in de knop geen tik geeft).
 *
 * De schuiven lopen van 0 tot 1, de knoppen van -1 tot 1 (midden = 0).
 * `range` vermenigvuldigt: x1, x2 of x5 (x5 op een V/Oct-ingang is vijf
 * octaven per volle slag).
 *
 * Twee typeIds in één bestand (dezelfde romp, een andere bereikgrens); de
 * paneelnamen zijn gelijk, dus het gescrapete contract klopt voor beide.
 *
 * Port map:
 * | Dir | portId     | Kind | Betekenis              |
 * |-----|------------|------|------------------------|
 * | out | `out_1..4` | Cv   | Waarde maal `range`    |
 *
 * Controls: `v1..v4` (0..1 of -1..1), `range` (0 = x1, 1 = x2, 2 = x5),
 * `slew` (0..2000 ms).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

template <bool Bipolar>
class ManualCvModule final : public mb::runtime::CvModule {
public:
    static constexpr int kCount = 4;

    explicit ManualCvModule(std::string_view id) : CvModule(typeId(), id) {}

    static const char* typeId() { return Bipolar ? "tp_mmb_knobs" : "tp_mmb_faders"; }

    void tick() override {
        static constexpr float kRanges[3] = {1.0f, 2.0f, 5.0f};
        for (int index = 0; index < kCount; ++index) {
            const float target = value_[index] * kRanges[range_];
            out_[index] += slewCoefficient_ * (target - out_[index]);
        }
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_1" || portId == "out_2" || portId == "out_3" || portId == "out_4") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view) const override { return PortKind::None; }
    float readCvPort(std::string_view portId) const override {
        if (portId.size() == 5 && portId.substr(0, 4) == "out_") {
            const int index = portId[4] - '1';
            if (index >= 0 && index < kCount) return out_[index];
        }
        return 0.0f;
    }
    void writeCvPort(std::string_view, float) override {}

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        const float number = cvutil::asFloat(value, 0.0f);
        const float low = Bipolar ? -1.0f : 0.0f;
        if      (controlId == "v1") value_[0] = cvutil::clampFinite(number, low, 1.0f, 0.0f);
        else if (controlId == "v2") value_[1] = cvutil::clampFinite(number, low, 1.0f, 0.0f);
        else if (controlId == "v3") value_[2] = cvutil::clampFinite(number, low, 1.0f, 0.0f);
        else if (controlId == "v4") value_[3] = cvutil::clampFinite(number, low, 1.0f, 0.0f);
        else if (controlId == "range") {
            const int range = static_cast<int>(number + 0.5f);
            range_ = range < 0 ? 0 : range > 2 ? 2 : range;
        }
        else if (controlId == "slew") {
            const float ms = cvutil::clampFinite(number, 0.0f, 2000.0f, 10.0f);
            slewCoefficient_ = ms < 0.5f ? 1.0f : 1.0f - std::exp(-1.0f / ms);
        }
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(typeId())) return;
        registry.register_(typeId(), [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ManualCvModule<Bipolar>>(id);
        });
    }

private:
    float value_[kCount] = {}, out_[kCount] = {};
    float slewCoefficient_ = 1.0f - 0.904837f;    // 10 ms
    int range_ = 0;
};

/** Typenamen voor het contract (contract_dump leest `kTypeId = "..."`). */
struct ManualCvTypes {
    static constexpr const char* kTypeId = "tp_mmb_faders";
};
struct ManualCvKnobTypes {
    static constexpr const char* kTypeId = "tp_mmb_knobs";
};

using FadersModule = ManualCvModule<false>;
using KnobsModule = ManualCvModule<true>;

}  // namespace mmb_link
