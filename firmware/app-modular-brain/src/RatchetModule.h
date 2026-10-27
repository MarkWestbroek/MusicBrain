#pragma once
/**
 * @file RatchetModule.h
 * @brief Stapsequencer voor roffels (typeId `tp_mmb_ratchet`), fw 0.5.114.
 *
 * @details
 * CV-domein-module (1 kHz tick). Zestien stappen op een stapklok (Clock
 * `x4`); per stap een ratchet-stand: uit, 1, 2, 3, 4, 6 of 8 slagen gelijk
 * verdeeld over de stap, of 3:2 / 3:4 (drie slagen over twee of vier
 * stappen: de zestiendentriool en de achtstetriool). Geen eigen tempo: de
 * module meet de klokperiode en deelt die op. Plan: doc/plans/ratchet.md.
 *
 * Swing: Clock `x4` swingt, de stappen zijn om en om lang en kort. Een stap
 * wordt opgedeeld met de periode van dezelfde pariteit (twee stappen terug);
 * een overspanning telt een lange en een korte op.
 *
 * Over een roll (twee of meer slagen) lopen `accent` (van `base` naar
 * `base + ramp`) en `pitch` (van 0 naar `sweep` halve tonen, V/oct) mee. Ze
 * worden op de opgaande flank gezet en blijven staan tot de volgende slag.
 * `thru` wordt met de eigen slagen ge-or'd (Grids-hat erdoor, rolls erbij).
 *
 * Port map:
 * | Dir | portId       | Kind | Betekenis                                   |
 * |-----|--------------|------|---------------------------------------------|
 * | in  | `clock`      | Gate | Stapklok (Clock `x4`)                       |
 * | in  | `reset`      | Gate | Terug naar stap 0                           |
 * | in  | `ab`         | Gate | Hoog = patroon B                            |
 * | in  | `roll`       | Gate | Zolang hoog speelt elke stap de `rollstand` |
 * | in  | `ratchet_cv` | Cv   | −1..1 schuift de standen 1…8 (±5 standen)   |
 * | in  | `thru`       | Gate | Ge-or'd met de eigen slagen                 |
 * | out | `gate`       | Gate | Slagen                                      |
 * | out | `accent`     | Cv   | 0..1 per slag                               |
 * | out | `pitch`      | Cv   | V/oct-offset per slag                       |
 * | out | `step`       | Gate | Volgt de klok: één puls per stap            |
 *
 * Controls: `a_1`..`a_16`, `b_1`..`b_16` (stand 0..8: uit, 1, 2, 3, 4, 6, 8,
 * 3:2, 3:4), `length` (1..16), `base` (0..1), `ramp` (−1..1), `sweep`
 * (−12..12 halve tonen), `rollstand` (0..5: 2, 3, 4, 6, 8, 3:2), `width` (10..90 %).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cmath>
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

class RatchetModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ratchet";
    static constexpr int kSteps = 16;
    static constexpr int kStands = 9;

    explicit RatchetModule(std::string_view id) : CvModule(kTypeId, id) {
        // Standaard: hats op de achtsten, een zestiendentriool op 13–14 en een dubbele op 16.
        for (int s = 0; s < kSteps; s += 2) pattern_[0][s] = 1;
        pattern_[0][12] = 7;
        pattern_[0][15] = 2;
    }

    void tick() override {
        const bool clockIn = clock_ >= 0.5f;
        if (resetEdge_.rise(reset_ >= 0.5f)) {
            step_ = 0; primed_ = false; parity_ = 0; spanLeft_ = 0; hits_ = 0;
        }
        if (clockEdge_.rise(clockIn)) onClock();
        else if (sinceEdge_ < kMaxPeriod) ++sinceEdge_;

        if (hits_ > 0) {
            if (fired_ < hits_ && eventT_ >= static_cast<float>(fired_) * sub_) fire();
            own_ = eventT_ < offAt_;
            eventT_ += 1.0f;
        } else {
            own_ = false;
        }
        if (relow_) { own_ = false; relow_ = false; }   // één tick laag, zodat de nieuwe flank telt

        const bool thru = thru_ >= 0.5f;
        if (thruEdge_.rise(thru) && !own_) { accent_ = clamp01(base_); pitch_ = 0.0f; }
        gate_ = own_ || thru;
        stepOut_ = clockIn;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "gate" || portId == "step") return PortKind::Gate;
        if (portId == "accent" || portId == "pitch") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset" || portId == "ab" || portId == "roll" || portId == "thru")
            return PortKind::Gate;
        if (portId == "ratchet_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "gate")   return gate_ ? 1.0f : 0.0f;
        if (portId == "accent") return accent_;
        if (portId == "pitch")  return pitch_;
        if (portId == "step")   return stepOut_ ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "clock") clock_ = value;
        else if (portId == "reset") reset_ = value;
        else if (portId == "ab") ab_ = value;
        else if (portId == "roll") roll_ = value;
        else if (portId == "thru") thru_ = value;
        else if (portId == "ratchet_cv") ratchetCv_ = cvutil::clampFinite(value, -1.0f, 1.0f, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        const float v = cvutil::asFloat(value, 0.0f);
        const int number = static_cast<int>(std::floor(v + 0.5f));
        // a_1..a_16 / b_1..b_16 (het contract kent ze via OVERRIDES in contract_dump.py)
        if (controlId.size() >= 3 && controlId.size() <= 4 && controlId[1] == '_' &&
            (controlId[0] == 'a' || controlId[0] == 'b')) {
            int index = 0;
            for (std::size_t i = 2; i < controlId.size(); ++i) {
                if (controlId[i] < '0' || controlId[i] > '9') return;
                index = index * 10 + (controlId[i] - '0');
            }
            if (index >= 1 && index <= kSteps) pattern_[controlId[0] == 'b' ? 1 : 0][index - 1] = limit(number, 0, kStands - 1);
            return;
        }
        if      (controlId == "length") length_ = limit(number, 1, kSteps);
        else if (controlId == "base")   base_ = cvutil::clampFinite(v, 0.0f, 1.0f, 0.6f);
        else if (controlId == "ramp")   ramp_ = cvutil::clampFinite(v, -1.0f, 1.0f, 0.4f);
        else if (controlId == "sweep")  sweep_ = cvutil::clampFinite(v, -12.0f, 12.0f, 0.0f);
        else if (controlId == "rollstand") rollStand_ = kRollStands[limit(number, 0, 5)];
        else if (controlId == "width")  width_ = cvutil::clampFinite(v, 10.0f, 90.0f, 50.0f) * 0.01f;
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<RatchetModule>(id);
        });
    }

private:
    // Stand → slagen en overspanning (in stappen).
    static constexpr int kHits[kStands] = { 0, 1, 2, 3, 4, 6, 8, 3, 3 };
    static constexpr int kSpan[kStands] = { 0, 1, 1, 1, 1, 1, 1, 2, 4 };
    static constexpr int kRollStands[6] = { 2, 3, 4, 5, 6, 7 };
    static constexpr int kMaxPeriod = 2000;   // langzamer dan 2 s per stap telt niet als meting
    static constexpr float kMinSub = 3.0f;    // ms per slag: 2 hoog + 1 laag

    static int limit(int value, int low, int high) { return value < low ? low : value > high ? high : value; }
    static float clamp01(float v) { return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v; }

    /** Verwachte duur van `steps` stappen vanaf pariteit `p`; 0 als er nog niets gemeten is. */
    float predict(int p, int steps) const {
        float sum = 0.0f;
        for (int j = 0; j < steps; ++j) {
            const int q = (p + j) & 1;
            const int period = have_[q] ? period_[q] : have_[q ^ 1] ? period_[q ^ 1] : 0;
            if (period == 0) return 0.0f;
            sum += static_cast<float>(period);
        }
        return sum;
    }

    void onClock() {
        // De stap die nu eindigt had pariteit parity_ ^ 1 (die is bij zijn flank omgezet).
        if (primed_ && sinceEdge_ > 0 && sinceEdge_ < kMaxPeriod) {
            period_[parity_ ^ 1] = sinceEdge_;
            have_[parity_ ^ 1] = true;
        }
        sinceEdge_ = 0;
        if (primed_) step_ = (step_ + 1) % length_;
        primed_ = true;
        const int p = parity_;
        parity_ ^= 1;

        if (spanLeft_ > 0) {
            // Binnen een overspanning: niet opnieuw beginnen, wel de resterende slagen bijstellen.
            --spanLeft_;
            const float rest = predict(p, spanLeft_ + 1);
            if (rest > 0.0f && hits_ > 0) {
                const float total = eventT_ + rest;
                sub_ = total / static_cast<float>(hits_);
            }
            return;
        }

        int stand = roll_ >= 0.5f ? rollStand_ : pattern_[ab_ >= 0.5f ? 1 : 0][step_];
        if (stand >= 1 && stand <= 6 && ratchetCv_ != 0.0f)
            stand = limit(stand + static_cast<int>(std::floor(ratchetCv_ * 5.0f + 0.5f)), 1, 6);
        startEvent(stand, p);
    }

    void startEvent(int stand, int p) {
        int hits = kHits[stand];
        int span = kSpan[stand];
        if (hits == 0) { hits_ = 0; return; }
        float duration = predict(p, span);
        if (duration <= 0.0f) { hits = 1; span = 1; duration = 1.0f; }   // nog geen meting: één slag
        while (hits > 1 && duration / static_cast<float>(hits) < kMinSub) {
            // Te snel voor 1 kHz: terug naar de grootste stand die past.
            hits = hits == 8 ? 6 : hits == 6 ? 4 : hits - 1;
        }
        relow_ = own_;
        hits_ = hits;
        fired_ = 0;
        eventT_ = 0.0f;
        sub_ = duration / static_cast<float>(hits);
        spanLeft_ = span - 1;
        offAt_ = 0.0f;
    }

    void fire() {
        const float t = hits_ > 1 ? static_cast<float>(fired_) / static_cast<float>(hits_ - 1) : 0.0f;
        accent_ = clamp01(base_ + ramp_ * t);
        pitch_ = hits_ > 1 ? sweep_ * t / 12.0f : 0.0f;
        float on = width_ * sub_;
        if (on < 2.0f) on = 2.0f;
        if (on > sub_ - 1.0f && sub_ >= kMinSub) on = sub_ - 1.0f;
        if (own_) relow_ = true;
        offAt_ = eventT_ + on;
        ++fired_;
    }

    cvutil::Edge clockEdge_, resetEdge_, thruEdge_;
    float clock_ = 0.0f, reset_ = 0.0f, ab_ = 0.0f, roll_ = 0.0f, thru_ = 0.0f, ratchetCv_ = 0.0f;
    std::uint8_t pattern_[2][kSteps] = {};
    int length_ = kSteps, rollStand_ = 7;
    float base_ = 0.6f, ramp_ = 0.4f, sweep_ = 0.0f, width_ = 0.5f;

    int period_[2] = {}, sinceEdge_ = 0, parity_ = 0;
    bool have_[2] = {};
    int step_ = 0, spanLeft_ = 0;
    bool primed_ = false;

    int hits_ = 0, fired_ = 0;
    float eventT_ = 0.0f, sub_ = 0.0f, offAt_ = 0.0f;
    bool own_ = false, relow_ = false, gate_ = false, stepOut_ = false;
    float accent_ = 0.6f, pitch_ = 0.0f;
};

}  // namespace mmb_link
