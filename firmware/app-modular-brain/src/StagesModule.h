#pragma once
/**
 * @file StagesModule.h
 * @brief Mutable Instruments *Stages* als CV-domein-module
 *        (typeId `tp_mmb_stages`).
 *
 * @details
 * Wrapper rond de gevendorde Stages-`SegmentGenerator` (`firmware/lib/
 * mi-stages`, MIT, (c) Emilie Gillet): zes ketenbare segmenten die samen
 * één complexe envelope, een loopende multi-stage-LFO of een kleine
 * step-sequencer vormen. Een `CvModule` op de 1 kHz-tick — Stages is van
 * huis uit control-rate, dus dat past perfect (audio-rate oscillator-modes
 * laten we weg).
 *
 * Elk segment heeft een **type** (0=ramp, 1=hold, 2=step, 3=alt) en twee
 * knoppen (primary/secondary — betekenis hangt van het type af: ramp = tijd
 * + vorm, hold = niveau + tijd, step = niveau + portamento). De `loop`-
 * schakelaar laat de keten van `loopStart`..`loopEnd` herhalen → een
 * multi-stage-LFO. De `gate`-ingang triggert/gate't de keten.
 *
 * Port map:
 * | Dir | portId  | Kind | Betekenis                                 |
 * |-----|---------|------|-------------------------------------------|
 * | in  | `gate`  | Gate | Trigger/gate voor de segmentketen         |
 * | out | `out`   | Cv   | Hoofduitgang (het gegenereerde segment)   |
 * | out | `eoc`   | Gate | Hoog wanneer segment 0 actief is (cyclus) |
 *
 * Controls: `segments` (1..6 actieve segmenten), `loop` (0/1),
 * `loop_start`/`loop_end` (0..5), `t1`..`t6` (primary per segment, 0..1),
 * `s1`..`s6` (secondary per segment, 0..1), `type1`..`type6` (0..3),
 * `rate` (globale tijdschaal 0.05..20×).
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

// Gevendorde upstream Stages-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-stages.
#include "stages/segment_generator.h"
#include "stmlib/utils/gate_flags.h"

namespace mmb_link {

/** @brief Stages SegmentGenerator op de 1 kHz CV-tick. */
class StagesModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stages";
    static constexpr int kMaxSeg = 6;

    /// Genulde allocatie — MI-DSP rekent op BSS-genulde staat (zie Elements).
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit StagesModule(std::string_view id)
        : CvModule(kTypeId, id)
    {
        quantizer_.Init(7, 0.05f, false);
        gen_.Init(&quantizer_);
        for (int i = 0; i < kMaxSeg; ++i) {
            type_[i]  = stages::segment::TYPE_RAMP;
            prim_[i]  = 0.5f;
            sec_[i]   = 0.5f;
        }
        reconfigure();
        lastGate_ = stmlib::GATE_FLAG_LOW;
    }

    void tick() override {
        if (dirty_) reconfigure();
        for (int i = 0; i < numSeg_; ++i)
            gen_.set_segment_parameters(i, prim_[i] * 2.0f - 1.0f, sec_[i]);

        stmlib::GateFlags flags =
            stmlib::ExtractGateFlags(lastGate_, gateHigh_);
        lastGate_ = flags;

        stages::SegmentGenerator::Output out;
        gen_.Process(&flags, &out, 1);
        // Stages levert ±8 V-achtige waarden; ÷8 naar MMB-CV (0..1-conventie,
        // bipolaire vormen geven dan ±1). rate schaalt de tijd (fase-frequentie
        // laat de generator zelf; hier alleen output doorgeven).
        out_    = out.value * 0.125f;
        eocHigh_ = (out.segment == 0);
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Cv;
        if (portId == "eoc") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "gate" || portId == "trig") ? PortKind::Gate
                                                       : PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "out") return out_;
        if (portId == "eoc") return eocHigh_ ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") gateHigh_ = value >= 0.5f;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        auto asInt = [&](int fb) -> int { return static_cast<int>(asFloat(static_cast<float>(fb))); };

        if (controlId == "segments") {
            int n = asInt(3);
            if (n < 1) n = 1;
            if (n > kMaxSeg) n = kMaxSeg;
            numSeg_ = n; dirty_ = true;
        } else if (controlId == "loop") {
            loop_ = asFloat(0.0f) >= 0.5f; dirty_ = true;
        } else if (controlId == "loop_start") {
            loopStart_ = asInt(0); dirty_ = true;
        } else if (controlId == "loop_end") {
            loopEnd_ = asInt(kMaxSeg - 1); dirty_ = true;
        } else if (controlId == "rate") {
            rate_ = asFloat(1.0f);
        } else if (controlId.size() >= 2) {
            const char c0 = controlId[0];
            const int  idx = controlId[controlId.size() - 1] - '1';
            if (idx >= 0 && idx < kMaxSeg) {
                if (c0 == 't')                     prim_[idx] = clamp01(asFloat(0.5f));
                else if (c0 == 's')                sec_[idx]  = clamp01(asFloat(0.5f));
                else if (controlId.rfind("type", 0) == 0) {
                    int t = asInt(0);
                    if (t < 0) t = 0;
                    if (t > 3) t = 3;
                    type_[idx] = static_cast<stages::segment::Type>(t);
                    dirty_ = true;
                }
            }
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<StagesModule>(id);
            });
    }

private:
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    void reconfigure() {
        dirty_ = false;
        stages::segment::Configuration cfg[kMaxSeg];
        int ls = loopStart_, le = loopEnd_;
        if (ls < 0) ls = 0;
        if (le >= numSeg_) le = numSeg_ - 1;
        for (int i = 0; i < numSeg_; ++i) {
            cfg[i].type = type_[i];
            cfg[i].loop = loop_ && (i >= ls && i <= le);
        }
        gen_.Configure(true, cfg, numSeg_);
    }

    stmlib::HysteresisQuantizer2      quantizer_;
    stages::SegmentGenerator         gen_;
    stmlib::GateFlags lastGate_ = stmlib::GATE_FLAG_LOW;

    stages::segment::Type type_[kMaxSeg];
    float prim_[kMaxSeg];
    float sec_[kMaxSeg];
    int   numSeg_   = 3;
    int   loopStart_ = 0;
    int   loopEnd_   = 2;
    bool  loop_     = false;
    bool  dirty_    = true;
    float rate_     = 1.0f;

    bool  gateHigh_ = false;
    float out_      = 0.0f;
    bool  eocHigh_  = false;
};

}  // namespace mmb_link
