#pragma once
/**
 * @file TuringModule.h
 * @brief Schuifregister-sequencer in de geest van de Turing Machine
 *        (typeId `tp_mmb_turing`): een lus die langzaam van gedachten
 *        verandert.
 *
 * @details
 * CV-domein-module (1 kHz tick). Een 16-bits schuifregister schuift elke
 * klokstap één plek op; het bit dat op positie `length` uit de lus valt gaat
 * terug naar voren. `change` is de kans dat dat bit daarbij omklapt:
 *
 * - 0   = de lus zit op slot en herhaalt elke `length` stappen;
 * - 0,5 = elke stap een verse muntworp: geen herhaling;
 * - 1   = het bit klapt altijd om: de lus herhaalt na 2 x `length` stappen,
 *         de tweede helft is het spiegelbeeld van de eerste.
 *
 * Daartussen verandert de melodie af en toe een noot: draai `change` open tot
 * je iets hoort wat je bevalt en draai hem dicht om het vast te houden. De
 * onderste acht bits vormen een 8-bits DAC (`cv`, 0..`range` octaven,
 * ongekwantiseerd: zet er de Quantizer achter); `cv2` leest de bovenste acht
 * bits, dezelfde lijn een aantal stappen later (een canon). `pulse` en
 * `pulse2` volgen twee bits van het register als ritme.
 *
 * Het register begint vanaf een vast patroon: na Reset klinkt dezelfde lus.
 *
 * Port map:
 * | Dir | portId      | Kind | Betekenis                           |
 * |-----|-------------|------|-------------------------------------|
 * | in  | `clock`     | Gate | Stapklok (met `extclock`)           |
 * | in  | `reset`     | Gate | Register terug naar het beginpatroon|
 * | in  | `change_cv` | Cv   | Telt op bij `change`                |
 * | out | `cv`        | Cv   | 8-bits DAC, 0..range (V/Oct)        |
 * | out | `cv2`       | Cv   | Zelfde lijn, acht stappen later     |
 * | out | `pulse`     | Gate | Bit 0 maal de klok                  |
 * | out | `pulse2`    | Gate | Bit 3 maal de klok                  |
 *
 * Controls: `change` (0..1), `length` (2..16), `range` (0..5 oct),
 * `tempo` (bpm, zestienden), `extclock` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class TuringModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_turing";
    static constexpr std::uint16_t kStartPattern = 0xACE1;

    explicit TuringModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const bool clockIn = clock_ >= 0.5f;
        bool advance;
        if (extClock_) { advance = clockEdge_.rise(clockIn); clockHigh_ = clockIn; }
        else { advance = internal_.tick(); clockHigh_ = internal_.high(); }
        if (resetEdge_.rise(reset_ >= 0.5f)) {
            register_ = kStartPattern; rng_ = cvutil::Rng(); internal_.reset(); primed_ = false;
            if (!extClock_) advance = false;   // de interne klok begint de volgende tick opnieuw
        }
        if (advance) {
            if (primed_) {             // de eerste klokpuls speelt het beginpatroon
                std::uint16_t bit = (register_ >> (length_ - 1)) & 1u;
                const float change = cvutil::clampFinite(change_ + changeCv_, 0.0f, 1.0f, 0.0f);
                if (rng_.uniform() < change) bit ^= 1u;
                register_ = static_cast<std::uint16_t>((register_ << 1) | bit);
            }
            primed_ = true;
        }
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "cv" || portId == "cv2") return PortKind::Cv;
        if (portId == "pulse" || portId == "pulse2") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset") return PortKind::Gate;
        if (portId == "change_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "cv")  return static_cast<float>(register_ & 0xFFu) * (range_ / 255.0f);
        if (portId == "cv2") return static_cast<float>(register_ >> 8) * (range_ / 255.0f);
        if (portId == "pulse")  return primed_ && clockHigh_ && (register_ & 1u) ? 1.0f : 0.0f;
        if (portId == "pulse2") return primed_ && clockHigh_ && (register_ & 8u) ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "clock") clock_ = value;
        else if (portId == "reset") reset_ = value;
        else if (portId == "change_cv") changeCv_ = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "change") change_ = cvutil::clampFinite(cvutil::asFloat(value, 0.0f), 0.0f, 1.0f, 0.0f);
        else if (controlId == "length") {
            const int length = static_cast<int>(cvutil::asFloat(value, 8.0f) + 0.5f);
            length_ = length < 2 ? 2 : length > 16 ? 16 : length;
        }
        else if (controlId == "range") range_ = cvutil::clampFinite(cvutil::asFloat(value, 2.0f), 0.0f, 5.0f, 2.0f);
        else if (controlId == "tempo") internal_.setBpm(cvutil::asFloat(value, 120.0f));
        else if (controlId == "extclock") extClock_ = cvutil::asBool(value, false);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<TuringModule>(id);
        });
    }

private:
    cvutil::StepClock internal_;
    cvutil::Edge clockEdge_, resetEdge_;
    cvutil::Rng rng_;
    float clock_ = 0.0f, reset_ = 0.0f, change_ = 0.1f, changeCv_ = 0.0f, range_ = 2.0f;
    int length_ = 8;
    std::uint16_t register_ = kStartPattern;
    bool extClock_ = false, clockHigh_ = false, primed_ = false;
};

}  // namespace mmb_link
