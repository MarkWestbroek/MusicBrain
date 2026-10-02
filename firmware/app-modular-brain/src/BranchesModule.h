#pragma once
/**
 * @file BranchesModule.h
 * @brief Bernoulli-gate: een muntworp per trigger (typeId `tp_mmb_branches`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Elke stijgende flank op `in` gaat naar
 * uitgang A of naar uitgang B; `p` is de kans op B. Het idee komt van
 * Mutable Instruments Branches; de code is eigen (upstream is GPL-3.0).
 *
 * - **Toggle** uit: elke trigger een verse worp.
 * - **Toggle** aan: `p` is de kans dat de kant *wisselt*. p = 1 geeft strak
 *   om-en-om (een klokdeler door twee), p klein houdt lang dezelfde kant aan.
 * - **Latch** uit: de gekozen uitgang volgt de ingangsgate. **Latch** aan: de
 *   gekozen uitgang blijft hoog tot de worp de andere kant kiest, een
 *   willekeurige schakelaar tussen twee toestanden.
 *
 * Typisch: klok erin, A naar de hihat en B naar een fill; of een gate uit de
 * sequencer erin en met `p` bepalen hoe vaak het accent of de slide meedoet.
 *
 * Port map:
 * | Dir | portId | Kind | Betekenis                    |
 * |-----|--------|------|------------------------------|
 * | in  | `in`   | Gate | Trigger / gate               |
 * | in  | `p_cv` | Cv   | Telt op bij `p`              |
 * | out | `a`    | Gate | Kant A (kans 1 - p)          |
 * | out | `b`    | Gate | Kant B (kans p)              |
 *
 * Controls: `p` (0..1), `toggle` (toggle), `latch` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class BranchesModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_branches";

    explicit BranchesModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const bool gate = in_ >= 0.5f;
        if (edge_.rise(gate)) {
            const float p = cvutil::clampFinite(p_ + pCv_, 0.0f, 1.0f, 0.5f);
            const bool heads = rng_.uniform() < p;
            if (toggle_) { if (heads) sideB_ = !sideB_; }
            else sideB_ = heads;
            chosen_ = true;
        }
        const bool high = chosen_ && (latch_ || gate);
        a_ = high && !sideB_;
        b_ = high && sideB_;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "a" || portId == "b" ? PortKind::Gate : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Gate;
        if (portId == "p_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "a") return a_ ? 1.0f : 0.0f;
        if (portId == "b") return b_ ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "in") in_ = value;
        else if (portId == "p_cv") pCv_ = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "p") p_ = cvutil::clampFinite(cvutil::asFloat(value, 0.5f), 0.0f, 1.0f, 0.5f);
        else if (controlId == "toggle") toggle_ = cvutil::asBool(value, false);
        else if (controlId == "latch") latch_ = cvutil::asBool(value, false);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<BranchesModule>(id);
        });
    }

private:
    cvutil::Rng rng_;
    cvutil::Edge edge_;
    float in_ = 0.0f, p_ = 0.5f, pCv_ = 0.0f;
    bool toggle_ = false, latch_ = false, sideB_ = false, chosen_ = false, a_ = false, b_ = false;
};

}  // namespace mmb_link
