#pragma once
/**
 * @file CvMath.h
 * @brief CV utility module: weighted sum and multiplication of CV signals.
 *
 * @details
 * A stateless, combinatorial CV processor with up to three inputs.
 *
 * Two modes (selectable via the `mode` control):
 *
 * **0 — sum (default)**
 * ```
 * out = clamp(a * gain_a + b * gain_b + c * gain_c + offset, -10, 10)
 * ```
 * Covers: scaling, inverting (negative gain), mixing, adding a fixed bias.
 *
 * **1 — mult**
 * ```
 * out = a * b
 * ```
 * Multiplies input `a` by input `b` (ring-mod / VCA-of-CV style).
 * Typical use: `envelope × velocity → VCA CV`.
 *
 * Port map:
 * | Dir   | portId | Kind | Description                   |
 * |-------|--------|------|-------------------------------|
 * | input | `a`    | Cv   | First operand                 |
 * | input | `b`    | Cv   | Second operand / multiplier   |
 * | input | `c`    | Cv   | Third operand (sum mode only) |
 * | output| `out`  | Cv   | Result                        |
 *
 * Controls:
 * | controlId | type  | default | Description                  |
 * |-----------|-------|---------|------------------------------|
 * | `gain_a`  | float | 1.0     | Scale applied to input `a`   |
 * | `gain_b`  | float | 1.0     | Scale applied to input `b`   |
 * | `gain_c`  | float | 1.0     | Scale applied to input `c`   |
 * | `offset`  | float | 0.0     | Additive bias (sum mode)     |
 * | `mode`    | int   | 0       | 0=sum, 1=mult(a×b)           |
 *
 * No tick needed — output is computed on demand in `readCvPort("out")`.
 */

#include "Module.h"
#include "Registry.h"
#include <algorithm>
#include <cstdint>

namespace mb::runtime {

/** @brief Combinatorial CV math utility. */
class CvMath final : public Module {
public:
    static constexpr const char* kTypeId = "tp_mmb_cvmath";

    explicit CvMath(std::string_view id)
        : Module(kTypeId, id) {}

    // ---- Port kinds -------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Cv : PortKind::None;
    }

    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "a" || portId == "b" || portId == "c")
            return PortKind::Cv;
        return PortKind::None;
    }

    // ---- CV bridge --------------------------------------------------------

    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "a") a_ = value;
        else if (portId == "b") b_ = value;
        else if (portId == "c") c_ = value;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId != "out") return 0.0f;
        if (mode_ == 1) return a_ * b_;
        // Sum mode
        float v = a_ * gainA_ + b_ * gainB_ + c_ * gainC_ + offset_;
        return std::max(-10.0f, std::min(10.0f, v));
    }

    // ---- Controls ---------------------------------------------------------

    void setControl(std::string_view controlId, ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto asInt = [&](int32_t fallback) -> int32_t {
            if (auto* i = std::get_if<int32_t>(&value)) return *i;
            if (auto* f = std::get_if<float>  (&value)) return static_cast<int32_t>(*f);
            return fallback;
        };

        if      (controlId == "gain_a") gainA_  = asFloat(1.0f);
        else if (controlId == "gain_b") gainB_  = asFloat(1.0f);
        else if (controlId == "gain_c") gainC_  = asFloat(1.0f);
        else if (controlId == "offset") offset_ = asFloat(0.0f);
        else if (controlId == "mode")   mode_   = asInt(0);
    }

    // ---- Factory ----------------------------------------------------------

    static void registerFactory() {
        auto& reg = Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<Module> {
            return std::make_unique<CvMath>(id);
        });
    }

private:
    float   a_     = 0.0f;
    float   b_     = 0.0f;
    float   c_     = 0.0f;
    float   gainA_ = 1.0f;
    float   gainB_ = 1.0f;
    float   gainC_ = 1.0f;
    float   offset_= 0.0f;
    int32_t mode_  = 0;      ///< 0=sum, 1=mult(a×b)
};

}  // namespace mb::runtime
