#pragma once
/**
 * @file ConvModule.h
 * @brief CONV, convolutiegalm (typeId `tp_mmb_conv`), stereo, fw 0.5.114.
 *
 * mmb_dsp::Conv (doc/plans/conv-reverb.md): niet-uniform opgedeelde
 * convolutie met een stereo-IR uit een bank van gegenereerde ruimtes.
 * Dezelfde header als de browser (`tools/mmb-wasm/conv_wasm.cc`).
 *
 * Geheugen: de spectra (tot ~4 MB bij 4 s) in PSRAM; de toegang is op
 * volgorde, dus de cache van de PSRAM vangt het op (FxMem.h). Past het niet,
 * dan wordt de IR korter. Zonder PSRAM: de heap, en dus een korte IR.
 *
 * Een nieuwe IR (IR, Size, Length) rekent de hoofdlus uit (`serviceAll()` in
 * loop()), niet de audio-interrupt: oude IR weg en nieuwe erin gebeuren met
 * de audio even uit, het zware werk ertussen. Intussen klinkt alleen droog.
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); CV mix (ook `mix_cv`).
 * Controls: ir (0–5), mix, predelay (ms), length (s), size, locut, hicut (Hz),
 * width.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "FxMem.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/conv.h"
#include <memory>
#include <string_view>

namespace mmb_link {

/** Groot geheugen voor CONV: PSRAM als die er is (dan alleen daar, zodat de
 *  heap niet volloopt), anders de heap. */
inline void* convAlloc(std::size_t bytes) {
#if defined(ARDUINO_TEENSY41)
    if (external_psram_size > 0) return extmem_malloc(bytes);
#endif
    return std::malloc(bytes);
}
inline void convFree(void* p) { FxFree{}(p); }

class ConvModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_conv";
    using Kernel = mmb_dsp::Conv;
    explicit ConvModule(std::string_view id) : AudioModule(kTypeId, id) {
        next_ = head(); head() = this;
    }
    ~ConvModule() override {
        for (ConvModule** p = &head(); *p; p = &(*p)->next_) if (*p == this) { *p = next_; break; }
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in") return {&stream_, 0, true};
        if (portId == "in_r") return {&stream_, 1, true};
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "mix")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (cvPortIs(portId, "mix")) stream_.cv(Kernel::MixCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if      (controlId == "ir")       stream_.control(Kernel::Ir, number);
        else if (controlId == "mix")      stream_.control(Kernel::Mix, number);
        else if (controlId == "predelay") stream_.control(Kernel::Predelay, number);
        else if (controlId == "length")   stream_.control(Kernel::Length, number);
        else if (controlId == "size")     stream_.control(Kernel::Size, number);
        else if (controlId == "locut")    stream_.control(Kernel::LoCut, number);
        else if (controlId == "hicut")    stream_.control(Kernel::HiCut, number);
        else if (controlId == "width")    stream_.control(Kernel::Width, number);
    }
    // FW-13: geparkeerd de PSRAM teruggeven; bij hergebruik opnieuw opbouwen.
    void onRetire() override {
        stream_.active(false);
        AudioNoInterrupts(); stream_.kernel().releaseIr(); AudioInterrupts();
        retired_ = true;
    }
    void onReuse() override {
        retired_ = false;
        stream_.kernel().requestRebuild();
        stream_.active(true);
    }

    /** Vanuit loop(): een gevraagde nieuwe IR uitrekenen. */
    void service() {
        auto& k = stream_.kernel();
        if (retired_ || !k.rebuildPending()) return;
        AudioNoInterrupts(); k.releaseIr(); AudioInterrupts();
        const uint32_t t0 = millis();
        const bool ok = k.prepare();
        AudioNoInterrupts(); k.commit(); AudioInterrupts();
        Serial.printf("[conv] IR %s: %d samples (%.2f s), %lu ms\n", ok ? "ok" : "FAILED", k.irLength(),
                      k.irLength() / AUDIO_SAMPLE_RATE_EXACT, static_cast<unsigned long>(millis() - t0));
    }
    static void serviceAll() { for (ConvModule* m = head(); m; m = m->next_) m->service(); }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ConvModule>(id);
        });
    }

private:
    static ConvModule*& head() { static ConvModule* h = nullptr; return h; }
    // Vóór de stream: de allocator moet staan voordat de kern zijn ring pakt.
    struct AllocSetup {
        AllocSetup() { auto& a = mmb_dsp::convAllocator(); a.alloc = convAlloc; a.free = convFree; }
    } allocSetup_;
    mutable KernelStream<Kernel, 2, 2> stream_;
    ConvModule* next_ = nullptr;
    bool retired_ = false;
};

}  // namespace mmb_link
