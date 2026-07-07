#pragma once
/**
 * @file QuantModule.h
 * @brief CV-quantizer naar schaal (typeId `tp_mmb_quant`, FW-CV-4).
 *
 * @details
 * CV-domein-module (1 kHz tick): klikt een binnenkomende V/Oct-CV vast op
 * de dichtstbijzijnde noot van een schaal. Het klassieke maatje van
 * Marbles/S&H/LFO: ruwe random-CV erin, muzikale noten eruit.
 *
 * De schaal is een 12-bits masker per octaaf; `root` verschuift het masker
 * (quantiseren gebeurt relatief aan de grondtoon en wordt daarna
 * teruggeschoven). `glide` maakt een one-pole portamento tussen de
 * gekwantiseerde noten. Bij elke nootwissel vuurt `trig` een 10 ms-puls —
 * handig om een envelope of pluk mee te triggeren.
 *
 * Port map:
 * | Dir | portId | Kind | Betekenis                              |
 * |-----|--------|------|-----------------------------------------|
 * | in  | `in`   | Cv   | Ruwe CV (V/Oct, 1.0 = 1 octaaf)         |
 * | out | `out`  | Cv   | Gekwantiseerde V/Oct (met glide)        |
 * | out | `trig` | Gate | 10 ms-puls bij elke nootwissel           |
 *
 * Controls: `scale` (0=Chrom 1=Maj 2=Min 3=PentMaj 4=PentMin 5=Dorian
 * 6=Kwint 7=Heletoon), `root` (0..11 semitonen), `glide` (0..1 → 0..500 ms).
 */

#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cmath>
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

/** @brief V/Oct-quantizer op de 1 kHz CV-tick. */
class QuantModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_quant";

    explicit QuantModule(std::string_view id)
        : CvModule(kTypeId, id) {}

    // --- CvModule -------------------------------------------------------

    void tick() override {
        // Kwantiseer relatief aan de grondtoon, in semitonen.
        const float semis = in_ * 12.0f - root_;
        const int   base  = static_cast<int>(floorf(semis + 0.5f));
        int best = base;
        float bestDist = 1e9f;
        for (int d = -6; d <= 6; ++d) {          // dichtstbijzijnde schaalnoot
            const int n = base + d;
            const int pc = ((n % 12) + 12) % 12;
            if (!(mask_ & (1u << pc))) continue;
            const float dist = fabsf(semis - static_cast<float>(n));
            if (dist < bestDist) { bestDist = dist; best = n; }
        }
        const float target = (static_cast<float>(best) + root_) * (1.0f / 12.0f);

        if (best != lastNote_) {                 // nootwissel → trig-puls
            lastNote_ = best;
            trigTicks_ = 10;                     // 10 ms
        }
        if (trigTicks_ > 0) --trigTicks_;

        // Glide: one-pole slew (glide 0 = direct).
        if (glide_ <= 0.001f) out_ = target;
        else                  out_ += slewA_ * (target - out_);
    }

    // --- Ports ------------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out")  return PortKind::Cv;
        if (portId == "trig") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return portId == "in" ? PortKind::Cv : PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId == "out")  return out_;
        if (portId == "trig") return trigTicks_ > 0 ? 1.0f : 0.0f;
        return 0.0f;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "in") in_ = value;
    }

    // --- Controls -----------------------------------------------------------

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        if (controlId == "scale") {
            // 12-bits pitch-class-maskers, bit 0 = grondtoon.
            static const uint16_t kMasks[8] = {
                0xFFF,   // chromatisch
                0xAB5,   // majeur        {0,2,4,5,7,9,11}
                0x5AD,   // mineur (nat.) {0,2,3,5,7,8,10}
                0x295,   // pent. majeur  {0,2,4,7,9}
                0x4A9,   // pent. mineur  {0,3,5,7,10}
                0x6AD,   // dorisch       {0,2,3,5,7,9,10}
                0x081,   // kwint         {0,7}
                0x555,   // heletoons     {0,2,4,6,8,10}
            };
            int s = static_cast<int>(asFloat(1.0f));
            if (s < 0) s = 0;
            if (s > 7) s = 7;
            mask_ = kMasks[s];
        }
        else if (controlId == "root") {
            int r = static_cast<int>(asFloat(0.0f));
            root_ = static_cast<float>(((r % 12) + 12) % 12);
        }
        else if (controlId == "glide") {
            glide_ = asFloat(0.0f);
            if (glide_ < 0.0f) glide_ = 0.0f;
            if (glide_ > 1.0f) glide_ = 1.0f;
            // tau 0..0.5 s → one-pole-coëfficiënt op de 1 kHz-tick.
            const float tau = glide_ * 0.5f;
            slewA_ = tau < 0.001f ? 1.0f : 1.0f - expf(-0.001f / tau);
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<QuantModule>(id);
            });
    }

private:
    uint16_t mask_ = 0xAB5;   ///< default majeur
    float root_ = 0.0f, glide_ = 0.0f, slewA_ = 1.0f;
    float in_ = 0.0f, out_ = 0.0f;
    int   lastNote_ = -9999, trigTicks_ = 0;
};

}  // namespace mmb_link
