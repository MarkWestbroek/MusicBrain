#pragma once
/**
 * @file LadderModule.h
 * @brief Ladder VCF module (typeId `tp_mmb_ladder`): Moog-style 4-pole lowpass.
 * @details
 * Since fw 0.5.103 our own kernel `mmb_dsp::Ladder` (mmb_dsp/ladder.h), shared
 * with the browser. Same algorithm as `AudioFilterLadder` from the Teensy
 * Audio Library (Huovilainen New Moog model, CMJ jun 2006; Teensy object by
 * Richard van Hoesel, MIT), but with our 4× oversampler (65 taps instead of
 * 36) and a soft output limiter instead of an unclamped int16 conversion that
 * wrapped above ±1 (doc/dsp-check-2026-10.md §5).
 *
 * Port map:
 * | Direction | portId     | Domain | Kernel                                |
 * |-----------|------------|--------|---------------------------------------|
 * | input     | `in`       | Audio  | channel 0                             |
 * | input     | `cv`       | Cv     | `Ladder::Cv`: cutoff ± `cv_amt` oct   |
 * | input     | `q_cv`     | Cv     | `Ladder::QCv`: + `q_cv_amt` resonance |
 * | input     | `drive_cv` | Cv     | `Ladder::DriveCv`: drive × 2^(2·amt·cv)|
 * | output    | `out`      | Audio  | channel 0 (LP 24 dB/oct)              |
 *
 * CV scaling unchanged: `cv` and `q_cv·q_cv_amt` behave like DC levels capped
 * at ±1 with a 2 ms linear glide (as the former `AudioSynthWaveformDc`
 * proxies did).
 *
 * Controls:
 * | controlId      | effect                                           |
 * |----------------|--------------------------------------------------|
 * | `cutoff`       | Base cutoff frequency in Hz (max 0.425·fs)       |
 * | `q`            | Base resonance 0 … 1.8 (self-osc above ~1.1)     |
 * | `drive`        | Input drive 0 … 4 (>1 overdrives the tanh)       |
 * | `cv_amt`       | Cutoff-CV depth in octaves (0 … 7)               |
 * | `q_cv_amt`     | Q-CV depth in resonance units (0 … 1)            |
 * | `drive_cv_amt` | Drive-CV depth: ±1 CV ⇒ drive ×4…÷4 at amt 1     |
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/ladder.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class LadderModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ladder";
    using Kernel = mmb_dsp::Ladder;
    explicit LadderModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "cv" || portId == "q_cv" || portId == "drive_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cv") stream_.cv(Kernel::Cv, value);
        else if (portId == "q_cv") stream_.cv(Kernel::QCv, value);
        else if (portId == "drive_cv") stream_.cv(Kernel::DriveCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "cutoff") stream_.control(Kernel::Cutoff, number);
        else if (controlId == "q") stream_.control(Kernel::Q, number);
        else if (controlId == "drive") stream_.control(Kernel::Drive, number);
        else if (controlId == "cv_amt") stream_.control(Kernel::CvAmt, number);
        else if (controlId == "q_cv_amt") stream_.control(Kernel::QCvAmt, number);
        else if (controlId == "drive_cv_amt") stream_.control(Kernel::DriveCvAmt, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<LadderModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
