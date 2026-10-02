#pragma once
/**
 * @file SlopeModule.h
 * @brief Functiegenerator: stijg- en daaltijd apart, met kromming en cycle
 *        (typeId `tp_mmb_slope`).
 *
 * @details
 * CV-domein-module (1 kHz tick), naar het bekende West Coast-bouwblok
 * (Serge DUSG, later Maths): één schakeling die, afhankelijk van wat je erin
 * steekt, envelope, LFO, lag of envelope-volger is.
 *
 * - **Trig**: een flank laat de uitgang naar 1 stijgen (Rise) en daarna naar
 *   0 dalen (Fall): een AD-envelope. Tijdens het stijgen wordt een nieuwe
 *   trigger genegeerd, dus een snelle klok wordt gedeeld: een klokdeler
 *   waarvan de deling van de tijden afhangt.
 * - **In**: de uitgang volgt de ingang, omhoog met Rise en omlaag met Fall.
 *   Een gate erin geeft een ASR-envelope, een V/Oct-lijn portamento met
 *   apart omhoog en omlaag, een gelijkgericht signaal een envelope-volger.
 * - **Cycle**: aan het eind van de daling start hij zichzelf opnieuw: een
 *   LFO waarvan Rise en Fall de vorm bepalen (zaag, driehoek, ramp).
 *
 * `shape` buigt de lijnen: -1 = logaritmisch (snel begin, trage nadering,
 * zoals een condensator), 0 = recht, +1 = exponentieel (trage start, snel
 * eind). `eor` is hoog zolang de uitgang daalt (end of rise), `eoc` geeft een
 * puls van 10 ms aan het eind van de daling (end of cycle): keten er een
 * tweede Slope of een envelope aan.
 *
 * Port map:
 * | Dir | portId    | Kind | Betekenis                                   |
 * |-----|-----------|------|---------------------------------------------|
 * | in  | `in`      | Cv   | Te volgen signaal                           |
 * | in  | `trig`    | Gate | Start een stijging naar 1                   |
 * | in  | `time_cv` | Cv   | Beide tijden: +1 = acht keer zo lang        |
 * | out | `out`     | Cv   | De helling                                  |
 * | out | `inv`     | Cv   | 1 - out                                     |
 * | out | `eor`     | Gate | Hoog tijdens de daling                      |
 * | out | `eoc`     | Gate | Puls aan het eind van de daling             |
 *
 * Controls: `rise`, `fall` (0,001..20 s voor een volle slag), `shape`
 * (-1..1), `cycle` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class SlopeModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_slope";

    explicit SlopeModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const float rest = inPatched_ ? in_ : 0.0f;
        if (trigEdge_.rise(trig_ >= 0.5f)) rising_ = true;
        if (cycle_ && !rising_ && out_ <= rest) rising_ = true;   // onderaan: opnieuw

        const float target = rising_ ? 1.0f : rest;
        const float stretch = std::exp2(3.0f * timeCv_);
        const float level = out_ < 0.0f ? 0.0f : out_ > 1.0f ? 1.0f : out_;
        if (eocTicks_ > 0) --eocTicks_;
        if (out_ < target) {
            out_ += bent(shape_ < 0.0f ? 1.0f - level : level) * 0.001f / (rise_ * stretch);
            if (out_ >= target) out_ = target;
            falling_ = false;
        } else if (out_ > target) {
            out_ -= bent(shape_ < 0.0f ? level : 1.0f - level) * 0.001f / (fall_ * stretch);
            falling_ = true;
            if (out_ <= target) { out_ = target; falling_ = false; eocTicks_ = 10; }
        } else falling_ = false;
        if (rising_ && out_ >= 1.0f) rising_ = false;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out" || portId == "inv") return PortKind::Cv;
        if (portId == "eor" || portId == "eoc") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in" || portId == "time_cv") return PortKind::Cv;
        if (portId == "trig") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "out") return out_;
        if (portId == "inv") return 1.0f - out_;
        if (portId == "eor") return falling_ ? 1.0f : 0.0f;
        if (portId == "eoc") return eocTicks_ > 0 ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "in") { in_ = cvutil::clampFinite(value, -10.0f, 10.0f, 0.0f); inPatched_ = true; }
        else if (portId == "trig") trig_ = value;
        else if (portId == "time_cv") timeCv_ = cvutil::clampFinite(value, -2.0f, 2.0f, 0.0f);
    }
    void onCvDisconnected(std::string_view portId) override {
        if (portId == "in") { in_ = 0.0f; inPatched_ = false; }
        else writeCvPort(portId, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "rise") rise_ = cvutil::clampFinite(cvutil::asFloat(value, 0.05f), 0.001f, 20.0f, 0.05f);
        else if (controlId == "fall") fall_ = cvutil::clampFinite(cvutil::asFloat(value, 0.5f), 0.001f, 20.0f, 0.5f);
        else if (controlId == "shape") shape_ = cvutil::clampFinite(cvutil::asFloat(value, 0.0f), -1.0f, 1.0f, 0.0f);
        else if (controlId == "cycle") cycle_ = cvutil::asBool(value, false);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SlopeModule>(id);
        });
    }

private:
    /** Snelheidsfactor bij kromming: `drive` is 1 waar de lijn snel moet gaan
     *  en 0 waar hij traag nadert. De 1,73 houdt de tijd voor een volle slag
     *  bij shape ±1 gelijk aan de rechte lijn. */
    float bent(float drive) const {
        const float curved = 1.73f * (2.2f * drive + 0.05f);
        return 1.0f + (curved - 1.0f) * std::fabs(shape_);
    }

    cvutil::Edge trigEdge_;
    float in_ = 0.0f, trig_ = 0.0f, timeCv_ = 0.0f, out_ = 0.0f;
    float rise_ = 0.05f, fall_ = 0.5f, shape_ = 0.0f;
    int eocTicks_ = 0;
    bool cycle_ = false, rising_ = false, falling_ = false, inPatched_ = false;
};

}  // namespace mmb_link
