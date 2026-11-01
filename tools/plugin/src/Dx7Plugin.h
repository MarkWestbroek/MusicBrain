#pragma once
// MMB DX7: de DX7 als instrument, met elke stemparameter als DAW-parameter
// (editor/src/modular-mb/dx7PluginParams.ts). Zo kan Logic de operatoren
// automatiseren en kan een control surface (Roto-Control via de Logic-
// koppeling) ze leren.
//
//  - Geluid: de patch "DX7 poly ×8" in de patchmotor (PatchPlugin.h), dus
//    MIDI-IN met acht DX7-stemmen, zoals op de Teensy.
//  - De parameters vormen samen de edit-stem (156 bytes, slot 9 van elke
//    DX7, met `edit` aan): een wijziging zet hem bij het volgende blok.
//  - Programma's: de 256 fabrieksklanken (8 ROM's × 32). Een keuze zet alle
//    parameters, dus de DAW ziet en bewaart de stem.
//  - Bediening: de DX7-editor van de editor (plugin-ui, `?type=dx7_plugin`).
//
// De gegenereerde dx7_plugin.cpp levert de patch (patchJson enz., zoals een
// patch-plugin) en de tabellen hieronder.

#include "PatchPlugin.h"

#include <cmath>
#include <cstdint>
#include <cstring>

namespace mmb_plugin {

/** Uit dx7_plugin.cpp. */
struct Dx7ParamInfo { int offset, max, bias; };
const Dx7ParamInfo* dx7ParamInfo();
int dx7ParamCount();
/** De 256 fabrieksklanken, uitgepakt (156 bytes elk), en hun namen ("1A 01 BRASS 1"). */
const uint8_t* dx7FactoryVoice(int program);
const char* dx7FactoryName(int program);
constexpr int kDx7Programs = 256;
constexpr int kDx7VoiceBytes = 156;

class Dx7Host : public PatchHost {
public:
    Dx7Host() { std::memcpy(voice_, dx7FactoryVoice(0), kDx7VoiceBytes); }

    int controlIndex(const char* id) const { return PatchHost::controlIndex(id); }
    void setControl(int c, float v) {
        if (c < 0 || c >= dx7ParamCount()) return;
        const Dx7ParamInfo& p = dx7ParamInfo()[c];
        const int b = static_cast<int>(std::lround(v)) - p.bias;
        voice_[p.offset] = static_cast<uint8_t>(b < 0 ? 0 : b > p.max ? p.max : b);
        dirty_ = true;
    }
    /** De naam (bytes 145..154) van een fabrieksklank; geen parameter. */
    void setName(const uint8_t* voice) { std::memcpy(voice_ + 145, voice + 145, 10); dirty_ = true; }

    void init() {
        PatchHost::init();
        dirty_ = true;
    }
    bool process(int n) {
        if (!engine_.loaded()) return false;
        if (dirty_) {
            dirty_ = false;
            engine_.setBlob("tp_mmb_dx7", true, 9, voice_, kDx7VoiceBytes);
            if (!editOn_) { engine_.setTypeControl("tp_mmb_dx7", "edit", 1.0f); editOn_ = true; }
        }
        return PatchHost::process(n);
    }
    const char* typeId() const { return "dx7_plugin"; }

private:
    uint8_t voice_[kDx7VoiceBytes] = {};
    bool dirty_ = true, editOn_ = false;
};

class Dx7Processor final : public HostProcessor<Dx7Host> {
public:
    using HostProcessor::HostProcessor;

    int getNumPrograms() override { return kDx7Programs; }
    int getCurrentProgram() override { return program_; }
    const juce::String getProgramName(int i) override { return i >= 0 && i < kDx7Programs ? juce::String(dx7FactoryName(i)) : juce::String(); }
    void changeProgramName(int, const juce::String&) override {}
    /** Een fabrieksklank: alle parameters op zijn waarden (de DAW ziet ze en bewaart ze). */
    void setCurrentProgram(int i) override {
        if (i < 0 || i >= kDx7Programs) return;
        program_ = i;
        const uint8_t* v = dx7FactoryVoice(i);
        const auto& all = getParameters();
        for (int k = 0; k < dx7ParamCount() && k < all.size(); ++k) {
            const Dx7ParamInfo& p = dx7ParamInfo()[k];
            if (auto* r = dynamic_cast<juce::RangedAudioParameter*>(all[k]))
                r->setValueNotifyingHost(r->convertTo0to1(static_cast<float>((v[p.offset] > p.max ? p.max : v[p.offset]) + p.bias)));
        }
        const juce::ScopedLock cl(getCallbackLock());
        host().setName(v);
    }

    /** De bediening haalt de ROM's hier (DX7-editor: "laden uit ROM"). */
    juce::var patchLive(const juce::var& msg) override {
        if (msg["op"].toString() != "dx7roms") return {};
#ifdef MMB_HAVE_DX7_ROMS
        juce::MemoryBlock all;
        for (int b = 0; b < kDx7RomBanks; ++b) all.append(kDx7Roms[b], 4096);
        return juce::Base64::toBase64(all.getData(), all.getSize());
#else
        return {};
#endif
    }

private:
    int program_ = 0;
};

}  // namespace mmb_plugin
