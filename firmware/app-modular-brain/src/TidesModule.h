#pragma once
/**
 * @file TidesModule.h
 * @brief Mutable Instruments *Tides* (tides2) als CV-domein-module
 *        (typeId `tp_mmb_tides`).
 *
 * @details
 * Wrapper rond de gevendorde tides2 `PolySlopeGenerator`
 * (`firmware/lib/mi-tides`, MIT, (c) Emilie Gillet). Anders dan de andere
 * MI-ports is dit **geen AudioStream maar een `CvModule`**: de generator
 * rendert één sample per 1 kHz CV-tick, precies genoeg voor LFO's,
 * envelopes en modulatie tot ~100 Hz (Nyquist 500 Hz). Audio-rate Tides
 * kan later als aparte audio-wrapper.
 *
 * Vier uitgangen wier betekenis van de `output`-mode afhangt (zoals de
 * hardware): GATES (slope+EOA+EOR), AMPLITUDE (4 niveaus), SLOPE_PHASE
 * (4 fasen), FREQUENCY (4 gerelateerde snelheden). Waarden zijn
 * genormaliseerd naar de MMB-CV-conventie (fullscale 8 "volt" → 1.0).
 *
 * Port map:
 * | Dir | portId    | Kind | Betekenis                                     |
 * |-----|-----------|------|-----------------------------------------------|
 * | in  | `gate`    | Gate | Trigger/gate (AD: trigger, AR: gate, loop: sync) |
 * | in  | `rate_cv` | Cv   | Exponentiële rate-modulatie (V/Oct: ±1 = ±1 octaaf) |
 * | in  | `shape`   | Cv   | (ook `shape_cv`) + slope/smooth/shift — zelfde patroon |
 * | out | `out1`…`out4` | Cv | De vier generator-uitgangen                 |
 *
 * Controls: `rate` (Hz, 0.01–100), `mode` (0=AD, 1=loop, 2=AR),
 * `output` (0=gates, 1=amplitude, 2=phase, 3=frequency),
 * `shape` `slope` `smooth` `shift` (0..1).
 */

#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
#include <string_view>

// Gevendorde upstream tides2-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-tides.
#include "tides2/poly_slope_generator.h"
#include "stmlib/utils/gate_flags.h"

namespace mmb_link {

/** @brief tides2 PolySlopeGenerator op de 1 kHz CV-tick. */
class TidesModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_tides";

    /// Genulde allocatie — zie ElementsModule: de MI-DSP rekent op genulde
    /// (BSS-)staat; de render-functietabel en filters bevatten pointers.
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit TidesModule(std::string_view id)
        : CvModule(kTypeId, id)
    {
        gen_.Init();
        lastFlags_ = stmlib::GATE_FLAG_LOW;
    }

    // --- CvModule -------------------------------------------------------

    /** @brief Eén generator-sample per 1 ms tick.  De genormaliseerde
     *  frequentie is `hz / 1000` omdat onze "sample rate" de tick-rate is. */
    void tick() override {
        const float hz = rateHz_ * std::exp2f(rateCv_);
        float f = hz * 0.001f;                     // genormaliseerd op 1 kHz
        if (f > 0.4f) f = 0.4f;                    // stabiliteitsgrens
        if (f < 0.0000001f) f = 0.0000001f;

        stmlib::GateFlags flags =
            stmlib::ExtractGateFlags(lastFlags_, gateHigh_);
        lastFlags_ = flags;

        tides::PolySlopeGenerator::OutputSample out;
        gen_.Render(rampMode_, outputMode_, tides::RANGE_CONTROL,
                    f, slope_, shape_, smooth_, shift_,
                    &flags, /*ramp=*/nullptr, &out, 1);
        // Fullscale ≈ 8.0 ("volt") → MMB-CV-conventie 0..1 (bipolaire modes
        // leveren dan ±1-achtige waarden — CvMath kan schalen).
        constexpr float kInv = 1.0f / 8.0f;
        for (int i = 0; i < 4; ++i) out_[i] = out.channel[i] * kInv;
    }

    // --- Ports ------------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out1" || portId == "out2" ||
                portId == "out3" || portId == "out4")
                   ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        if (portId == "rate_cv")                  return PortKind::Cv;
        if (cvPortIsTides(portId, "shape") || cvPortIsTides(portId, "slope") ||
            cvPortIsTides(portId, "smooth") || cvPortIsTides(portId, "shift"))
            return PortKind::Cv;
        return PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId == "out1") return out_[0];
        if (portId == "out2") return out_[1];
        if (portId == "out3") return out_[2];
        if (portId == "out4") return out_[3];
        return 0.0f;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") gateHigh_ = value >= 0.5f;
        else if (portId == "rate_cv")             rateCv_ = value;
        else if (cvPortIsTides(portId, "shape"))  shape_  = clamp01(value);
        else if (cvPortIsTides(portId, "slope"))  slope_  = clamp01(value);
        else if (cvPortIsTides(portId, "smooth")) smooth_ = clamp01(value);
        else if (cvPortIsTides(portId, "shift"))  shift_  = clamp01(value);
    }

    // --- Controls -----------------------------------------------------------

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "rate")   rateHz_ = asFloat(2.0f);
        else if (controlId == "shape")  shape_  = clamp01(asFloat(0.5f));
        else if (controlId == "slope")  slope_  = clamp01(asFloat(0.5f));
        else if (controlId == "smooth") smooth_ = clamp01(asFloat(0.5f));
        else if (controlId == "shift")  shift_  = clamp01(asFloat(0.5f));
        else if (controlId == "mode") {
            int m = static_cast<int>(asFloat(1.0f));
            if (m < 0) m = 0;
            if (m >= tides::RAMP_MODE_LAST) m = tides::RAMP_MODE_LAST - 1;
            rampMode_ = static_cast<tides::RampMode>(m);
        }
        else if (controlId == "output") {
            int m = static_cast<int>(asFloat(1.0f));
            if (m < 0) m = 0;
            if (m >= tides::OUTPUT_MODE_LAST) m = tides::OUTPUT_MODE_LAST - 1;
            const auto next = static_cast<tides::OutputMode>(m);
            if (next != outputMode_) {
                outputMode_ = next;
                gen_.Reset();   // zoals tides.cc bij een output-mode-wissel
            }
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<TidesModule>(id);
            });
    }

private:
    // Lokale kopie van AudioModule's cvPortIs (deze module is een CvModule
    // en include't AudioModule.h bewust niet).
    static bool cvPortIsTides(std::string_view portId, std::string_view name) {
        if (portId == name) return true;
        constexpr std::string_view kSuffix = "_cv";
        return portId.size() == name.size() + kSuffix.size()
            && portId.substr(0, name.size()) == name
            && portId.substr(name.size()) == kSuffix;
    }
    static float clamp01(float v) {
        return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v;
    }

    tides::PolySlopeGenerator gen_;
    tides::RampMode   rampMode_   = tides::RAMP_MODE_LOOPING;
    tides::OutputMode outputMode_ = tides::OUTPUT_MODE_AMPLITUDE;
    stmlib::GateFlags lastFlags_  = stmlib::GATE_FLAG_LOW;

    float rateHz_ = 2.0f;   ///< Basis-rate in Hz (control `rate`).
    float rateCv_ = 0.0f;   ///< Exponentiële rate-CV (±1 = ±1 octaaf).
    bool  gateHigh_ = false;
    float shape_  = 0.5f;
    float slope_  = 0.5f;
    float smooth_ = 0.5f;
    float shift_  = 0.5f;
    float out_[4] = {};
};

}  // namespace mmb_link
