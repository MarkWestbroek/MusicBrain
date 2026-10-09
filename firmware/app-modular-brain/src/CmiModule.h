#pragma once
/**
 * @file CmiModule.h
 * @brief Fairlight CMI-stem (typeId `tp_mmb_cmi`): golfvormsynthese, 32
 *        golfvormen van 128 samples (8 bit) na elkaar over de noot; mono uit.
 *
 * mmb_dsp::Cmi, dezelfde header als de browser (`tools/mmb-wasm/cmi_wasm.cc`).
 * De editor rekent het harmonischenprofiel van de patch om naar de 32
 * golfvormen en stuurt ze als `wavetable`-bericht (4096 samples) naar
 * `setWaveformData`. Zonder dat speelt de stem een ingebouwd profiel.
 *
 * | Richting | Poort    | Soort | Betekenis                           |
 * |----------|----------|-------|-------------------------------------|
 * | in       | `voct`   | Cv    | Toonhoogte (1 V/oct)                |
 * | in       | `gate`   | Gate  | Toets                               |
 * | in       | `vel`    | Cv    | Aanslag 0..1                        |
 * | in       | `seg_cv` | Cv    | Positie in de segmenten, ±1 = ±16   |
 * | out      | `out`    | Audio | Stem                                |
 * | out      | `pos`    | Cv    | Positie in de segmenten, 0..1       |
 *
 * Controls: coarse, fine, seg (ms per segment), smooth (0..1), loop (1..32),
 * attack (ms), release (ms), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/cmi.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class CmiModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_cmi";
    using Kernel = mmb_dsp::Cmi;
    explicit CmiModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "pos") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "vel" || portId == "seg_cv") return PortKind::Cv;
        if (portId == "gate") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "pos" ? stream_.cvOut(Kernel::Pos) : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(Kernel::Voct, value);
        else if (portId == "gate") stream_.cv(Kernel::Gate, value);
        else if (portId == "vel") stream_.cv(Kernel::Vel, value);
        else if (portId == "seg_cv") stream_.cv(Kernel::SegCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "coarse") stream_.control(Kernel::Coarse, number);
        else if (controlId == "fine") stream_.control(Kernel::Fine, number);
        else if (controlId == "seg") stream_.control(Kernel::Seg, number);
        else if (controlId == "smooth") stream_.control(Kernel::Smooth, number);
        else if (controlId == "loop") stream_.control(Kernel::Loop, number);
        else if (controlId == "attack") stream_.control(Kernel::Attack, number);
        else if (controlId == "release") stream_.control(Kernel::Release, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    /** De 32 golfvormen van de editor (4096 samples, segment na segment).
     *  Met de audio-interrupt uit: de tabel wisselt nooit half tijdens een blok. */
    bool setWaveformData(const std::int16_t* data, std::size_t count) override {
        if (!data || count < 2) return false;
        AudioNoInterrupts();
        stream_.kernel().setTable(data, static_cast<int>(count));
        AudioInterrupts();
        return true;
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<CmiModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 1> stream_;
};

}  // namespace mmb_link
