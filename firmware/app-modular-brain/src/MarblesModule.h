#pragma once
/**
 * @file MarblesModule.h
 * @brief Mutable Instruments *Marbles* als CV-domein-module
 *        (typeId `tp_mmb_marbles`).
 *
 * @details
 * Wrapper rond de gevendorde Marbles-generatoren (`firmware/lib/mi-marbles`,
 * MIT, (c) Emilie Gillet): `TGenerator` (generatieve gates met déjà-vu-loop)
 * + `XYGenerator` (gekwantiseerde random-CV's). Net als Tides een
 * **CvModule op de 1 kHz-tick** (sr = 1000, size = 1 per tick): gates hebben
 * dan 1 ms-resolutie — zat voor muzikale klokken tot honderden BPM.
 *
 * De X-uitgangen zijn in **volts** (VoltageRange FULL = ±5 V) en dus direct
 * patchbaar op `voct`-ingangen (1 V/oct-conventie van MidiIn/pitch).
 *
 * Port map:
 * | Dir | portId  | Kind | Betekenis                                        |
 * |-----|---------|------|--------------------------------------------------|
 * | in  | `clock` | Gate | Externe klok (vervangt de interne zodra gepatcht — control `extclock`) |
 * | in  | `rate_cv`   | Cv | Exponentiële tempo-mod (±1 = ±2 octaaf)        |
 * | in  | `dejavu_cv` | Cv | Déjà-vu-mod (0..1, optelt bij de knop)         |
 * | in  | `spread_cv` | Cv | X-spread-mod (0..1, optelt bij de knop)        |
 * | out | `t1` `t2`   | Cv (gate-waardig) | De twee random gate-kanalen     |
 * | out | `tclk`      | Cv (gate-waardig) | Master-klok (50% puls)          |
 * | out | `x1` `x2` `x3` | Cv | Gekwantiseerde random-CV's (volts, V/Oct)   |
 * | out | `y`         | Cv | Langzame random-CV (gedeelde klok ÷16, volts)   |
 *
 * Controls: `tempo` (BPM 10–480, 120 = hardware-midden), `bias` (t: kans-
 * verdeling t1/t2), `jitter` (t: timing-humanize), `model` (0=Bernoulli,
 * 1=clusters, 2=drums), `dejavu` (0..1 — rond 0.5 lockt de loop), `length`
 * (loop-lengte 1..16), `spread`/`xbias`/`steps` (X-verdeling), `scale`
 * (0=C-groot, 1=C-klein, 2=pentatonisch, 3=pelog, 4=bhairav, 5=shri),
 * `range` (X: 0=+2V, 1=+5V, 2=±5V), `extclock` (0/1).
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

// Gevendorde upstream Marbles-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-marbles.
#include "marbles/preset_scales.h"
#include "marbles/random/random_generator.h"
#include "marbles/random/random_stream.h"
#include "marbles/random/t_generator.h"
#include "marbles/random/x_y_generator.h"
#include "stmlib/utils/gate_flags.h"

namespace mmb_link {

/** @brief Marbles T+X/Y-generatoren op de 1 kHz CV-tick. */
class MarblesModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_marbles";

    /// Genulde allocatie — MI-DSP rekent op BSS-genulde staat (zie Elements).
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit MarblesModule(std::string_view id)
        : CvModule(kTypeId, id)
    {
        randomGenerator_.Init(0x8D5A61A4u);
        randomStream_.Init(&randomGenerator_);
        t_.Init(&randomStream_, kTickRateHz);
        xy_.Init(&randomStream_, kTickRateHz);
        for (int i = 0; i < 6; ++i) {
            xy_.LoadScale(i, marbles::preset_scales[i]);
        }
        t_.set_model(marbles::T_GENERATOR_MODEL_COMPLEMENTARY_BERNOULLI);
        t_.set_range(marbles::T_GENERATOR_RANGE_1X);
        applyTempo();
        lastClk_ = stmlib::GATE_FLAG_LOW;
    }

    // --- CvModule -------------------------------------------------------

    void tick() override {
        stmlib::GateFlags clk = stmlib::ExtractGateFlags(lastClk_, clkHigh_);
        lastClk_ = clk;

        float ext = 0.0f, master = 0.0f, slave0 = 0.0f, slave1 = 0.0f;
        marbles::Ramps ramps;
        ramps.external = &ext;
        ramps.master   = &master;
        ramps.slave[0] = &slave0;
        ramps.slave[1] = &slave1;

        bool gates[marbles::kNumTChannels] = { false, false };
        t_.Process(useExtClock_, &clk, ramps, gates, 1);
        t1_   = gates[0] ? 1.0f : 0.0f;
        t2_   = gates[1] ? 1.0f : 0.0f;
        tclk_ = master < 0.5f ? 1.0f : 0.0f;   // 50%-puls op de master-ramp

        marbles::GroupSettings x;
        x.control_mode   = marbles::CONTROL_MODE_IDENTICAL;
        x.voltage_range  = xRange_;
        x.register_mode  = false;
        x.register_value = 0.0f;
        x.spread  = clamp01(spread_ + spreadCv_);
        x.bias    = xBias_;
        x.steps   = steps_;
        x.deja_vu = clamp01(dejaVu_ + dejaVuCv_);
        x.length  = length_;
        x.scale_index = scaleIndex_;
        x.ratio.p = 1;
        x.ratio.q = 1;

        marbles::GroupSettings y = x;
        y.voltage_range = marbles::VOLTAGE_RANGE_FULL;
        y.spread = 0.5f;
        y.bias   = 0.5f;
        y.steps  = 0.5f;
        y.deja_vu = 0.0f;
        y.length  = 1;
        y.ratio.p = 1;
        y.ratio.q = 16;   // trage random-CV: master-klok gedeeld door 16

        float voltages[marbles::kNumChannels] = { 0.0f, 0.0f, 0.0f, 0.0f };
        xy_.Process(
            useExtClock_ ? marbles::CLOCK_SOURCE_EXTERNAL
                         : marbles::CLOCK_SOURCE_INTERNAL_T1_T2_T3,
            x, y, &clk, ramps, voltages, 1);
        x1_ = voltages[0];
        x2_ = voltages[1];
        x3_ = voltages[2];
        y_  = voltages[3];
    }

    // --- Ports ------------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "t1" || portId == "t2" || portId == "tclk" ||
                portId == "x1" || portId == "x2" || portId == "x3" ||
                portId == "y")
                   ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock") return PortKind::Gate;
        if (portId == "rate_cv" || portId == "dejavu_cv" ||
            portId == "spread_cv")
            return PortKind::Cv;
        return PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId == "t1")   return t1_;
        if (portId == "t2")   return t2_;
        if (portId == "tclk") return tclk_;
        if (portId == "x1")   return x1_;
        if (portId == "x2")   return x2_;
        if (portId == "x3")   return x3_;
        if (portId == "y")    return y_;
        return 0.0f;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "clock") {
            clkHigh_ = value >= 0.5f;
        } else if (portId == "rate_cv") {
            // ±1 = ±2 octaaf op het tempo (24 semitonen), zoals Tides/LFO.
            rateCvSemitones_ = 24.0f * (value < -1.0f ? -1.0f
                                       : (value > 1.0f ? 1.0f : value));
            applyTempo();
        }
        else if (portId == "dejavu_cv") dejaVuCv_ = value;
        else if (portId == "spread_cv") spreadCv_ = value;
    }

    // --- Controls -----------------------------------------------------------

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fallback;
        };
        auto asInt = [&](int fallback) -> int {
            return static_cast<int>(asFloat(static_cast<float>(fallback)));
        };
        if (controlId == "tempo") {
            tempoBpm_ = asFloat(120.0f);
            if (tempoBpm_ < 10.0f)  tempoBpm_ = 10.0f;
            if (tempoBpm_ > 480.0f) tempoBpm_ = 480.0f;
            applyTempo();
        }
        else if (controlId == "bias")   t_.set_bias(clamp01(asFloat(0.5f)));
        else if (controlId == "jitter") t_.set_jitter(clamp01(asFloat(0.0f)));
        else if (controlId == "model") {
            int m = asInt(0);
            if (m < 0) m = 0;
            if (m > 2) m = 2;
            // De drie hardware-modellen (Bernoulli / clusters / drums).
            t_.set_model(static_cast<marbles::TGeneratorModel>(m));
        }
        else if (controlId == "dejavu") {
            dejaVu_ = clamp01(asFloat(0.0f));
            t_.set_deja_vu(dejaVu_);
        }
        else if (controlId == "length") {
            length_ = asInt(8);
            if (length_ < 1)  length_ = 1;
            if (length_ > 16) length_ = 16;
            t_.set_length(length_);
        }
        else if (controlId == "spread") spread_ = clamp01(asFloat(0.5f));
        else if (controlId == "xbias")  xBias_  = clamp01(asFloat(0.5f));
        else if (controlId == "steps")  steps_  = clamp01(asFloat(0.5f));
        else if (controlId == "scale") {
            int s = asInt(0);
            if (s < 0) s = 0;
            if (s > 5) s = 5;
            scaleIndex_ = s;
        }
        else if (controlId == "range") {
            int r = asInt(2);
            if (r < 0) r = 0;
            if (r > 2) r = 2;
            xRange_ = static_cast<marbles::VoltageRange>(r);
        }
        else if (controlId == "extclock") useExtClock_ = asFloat(0.0f) >= 0.5f;
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<MarblesModule>(id);
            });
    }

private:
    static constexpr float kTickRateHz = 1000.0f;

    static float clamp01(float v) {
        return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v;
    }
    /** TGenerator-rate is in semitonen rond 2 Hz (= 120 BPM op range 1X). */
    void applyTempo() {
        const float semis = 12.0f * std::log2f(tempoBpm_ / 120.0f)
                          + rateCvSemitones_;
        t_.set_rate(semis);
    }

    marbles::RandomGenerator randomGenerator_;
    marbles::RandomStream    randomStream_;
    marbles::TGenerator      t_;
    marbles::XYGenerator     xy_;

    stmlib::GateFlags lastClk_ = stmlib::GATE_FLAG_LOW;
    bool  clkHigh_     = false;
    bool  useExtClock_ = false;

    float tempoBpm_        = 120.0f;
    float rateCvSemitones_ = 0.0f;
    float dejaVu_   = 0.0f, dejaVuCv_ = 0.0f;
    float spread_   = 0.5f, spreadCv_ = 0.0f;
    float xBias_    = 0.5f;
    float steps_    = 0.5f;
    int   length_   = 8;
    int   scaleIndex_ = 0;
    marbles::VoltageRange xRange_ = marbles::VOLTAGE_RANGE_FULL;

    float t1_ = 0.0f, t2_ = 0.0f, tclk_ = 0.0f;
    float x1_ = 0.0f, x2_ = 0.0f, x3_ = 0.0f, y_ = 0.0f;
};

}  // namespace mmb_link
