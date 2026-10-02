#pragma once
/**
 * @file LogicModule.h
 * @brief CV-gereedschap: min/max, logica, vergelijker en gelijkrichter
 *        (typeId `tp_mmb_logic`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Twee ingangen, acht uitgangen die er elk
 * iets anders mee doen. Het zijn de kleine bewerkingen waarmee twee simpele
 * modulatoren samen een ingewikkelde worden (Mutable Kinks en de Serge-
 * logica deden dit analoog):
 *
 * - `min` / `max`: de laagste / hoogste van A en B. Op gates is dat AND / OR;
 *   op twee LFO's een nieuwe golfvorm met knikken ("analoge logica").
 * - `and` / `or` / `xor`: gate-logica, een ingang telt als hoog boven
 *   `thresh`. Twee klokken door XOR geeft een derde, onregelmatiger ritme.
 * - `gt`: hoog zolang A groter is dan B (vergelijker). Met alleen A
 *   aangesloten vergelijkt hij met `thresh`: van elke CV een gate.
 * - `abs`: A gelijkgericht (|A|): een bipolaire LFO wordt twee keer zo snel
 *   en unipolair.
 * - `inv`: -A.
 *
 * Port map:
 * | Dir | portId            | Kind | Betekenis                    |
 * |-----|-------------------|------|------------------------------|
 * | in  | `a`, `b`          | Cv   | De twee signalen             |
 * | out | `min`, `max`      | Cv   | Laagste / hoogste            |
 * | out | `and`,`or`,`xor`  | Gate | Logica op de drempel         |
 * | out | `gt`              | Gate | A > B (of A > thresh)        |
 * | out | `abs`, `inv`      | Cv   | Gelijkgericht / omgekeerd A  |
 *
 * Controls: `thresh` (-1..1).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class LogicModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_logic";

    explicit LogicModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        const bool a = a_ > thresh_, b = b_ > thresh_;
        min_ = a_ < b_ ? a_ : b_;
        max_ = a_ > b_ ? a_ : b_;
        and_ = a && b;
        or_  = a || b;
        xor_ = a != b;
        // Vergelijker met een kleine hysterese tegen geklapper op ruis.
        const float reference = bPatched_ ? b_ : thresh_;
        if (a_ > reference + 0.01f) gt_ = true;
        else if (a_ < reference - 0.01f) gt_ = false;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "min" || portId == "max" || portId == "abs" || portId == "inv") return PortKind::Cv;
        if (portId == "and" || portId == "or" || portId == "xor" || portId == "gt") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return portId == "a" || portId == "b" ? PortKind::Cv : PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "min") return min_;
        if (portId == "max") return max_;
        if (portId == "and") return and_ ? 1.0f : 0.0f;
        if (portId == "or")  return or_ ? 1.0f : 0.0f;
        if (portId == "xor") return xor_ ? 1.0f : 0.0f;
        if (portId == "gt")  return gt_ ? 1.0f : 0.0f;
        if (portId == "abs") return std::fabs(a_);
        if (portId == "inv") return -a_;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "a") a_ = cvutil::clampFinite(value, -10.0f, 10.0f, 0.0f);
        else if (portId == "b") { b_ = cvutil::clampFinite(value, -10.0f, 10.0f, 0.0f); bPatched_ = true; }
    }
    void onCvDisconnected(std::string_view portId) override {
        if (portId == "b") { b_ = 0.0f; bPatched_ = false; }
        else writeCvPort(portId, 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "thresh") thresh_ = cvutil::clampFinite(cvutil::asFloat(value, 0.5f), -1.0f, 1.0f, 0.5f);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<LogicModule>(id);
        });
    }

private:
    float a_ = 0.0f, b_ = 0.0f, thresh_ = 0.5f, min_ = 0.0f, max_ = 0.0f;
    bool and_ = false, or_ = false, xor_ = false, gt_ = false, bPatched_ = false;
};

}  // namespace mmb_link
