#pragma once
// Een hele patch als plugin (doc/plans/plugin-patches.md §5): PatchEngine als
// Host van HostProcessor, zodat samplerate-omzetting, toestand en
// parameters gelijk zijn aan die van de losse modules.
//
//  - Geen audio-ingangen, twee uitgangen (de OUT-module van de patch).
//  - MIDI gaat onbewerkt naar MIDI-IN (`mmb_midi`): stemtoewijzing,
//    aftertouch, modwheel, pitchbend en CC's doet de firmwarecode van
//    MIDI-IN zelf, zoals op de Teensy.
//  - Parameters zijn alle knoppen van de patch, per poly-groep één keer
//    (de fronts eerst); een knop op een stem gaat naar alle stemmen van zijn
//    poly-groep (zoals setPatchControl in de editor). De generator (editor/scripts/pluginPatches.ts) zet de
//    doelen per parameter in patchParamTargets().
//
// De gegenereerde <naam>_patch_plugin.cpp levert patchJson(),
// patchModule(), patchParamIndex() en patchParamTargets().

#include "HostProcessor.h"
#include "PatchEngine.h"

#include <cstring>
#include <utility>

namespace mmb_plugin {

/** Uit de gegenereerde plugin.cpp. */
const char* patchJson();
const W2cVtable* patchModule(const std::string& typeId);
/** Parameter-id → index in de ModuleSpec (−1 = onbekend). */
int patchParamIndex(const char* id);
/** Per parameter (in de volgorde van de ModuleSpec) de (module, knop)-paren. */
const std::vector<std::vector<std::pair<std::string, std::string>>>& patchParamTargets();

class PatchHost {
public:
    static constexpr bool kShared = false;
    static constexpr bool kBank = false;
    static constexpr bool kRawMidi = true;

    // Poorten: niets in, L/R uit.
    int numInputs() const { return 0; }
    const char* inputId(int) const { return ""; }
    int inputKind(int) const { return kPortAudio; }
    float* inBuf(int) { return nullptr; }
    void setConnected(int, int) {}
    int numOutputs() const { return 2; }
    int outputKind(int) const { return kPortAudio; }
    const float* outBuf(int i) const { return out_[i]; }
    bool hasBank() const { return false; }

    /** Parameter-id (`ladder1_cutoff`, patchPlugins.ts) → index. */
    int controlIndex(const char* id) const { return patchParamIndex(id); }
    void setControl(int c, float v) {
        if (c < 0) return;
        if (!engine_.loaded()) { pending_.emplace_back(c, v); return; }   // vóór prepare: onthouden
        const auto& targets = patchParamTargets();
        if (static_cast<std::size_t>(c) >= targets.size()) return;
        for (const auto& [mod, ctl] : targets[static_cast<std::size_t>(c)]) engine_.setControl(mod, ctl, v);
    }

    float setRate(float) { return static_cast<float>(PatchEngine::kRate); }
    /** Bouwt de patch bij de eerste prepare (niet in de constructor: de
     *  poortscan van HostProcessor maakt ook een Host). */
    void init() {
        if (engine_.loaded() || failed_) return;
        juce::String error;
        if (!engine_.load(juce::String::fromUTF8(patchJson()), [](const std::string& t) { return patchModule(t); }, error)) {
            failed_ = true;
            std::printf("[mmb] patch laadt niet: %s\n", error.toRawUTF8());
            std::fflush(stdout);
            return;
        }
        for (const auto& [c, v] : pending_) setControl(c, v);
        pending_.clear();
    }
    float nativeRate() const { return static_cast<float>(PatchEngine::kRate); }
    int block() const { return PatchEngine::kBlock; }
    bool process(int) {
        if (!engine_.loaded()) return false;
        engine_.process(out_[0], out_[1]);
        return true;
    }
    const char* typeId() const { return "patch"; }

    /** MIDI op @p nativeOffset samples na het eerstvolgende blok van de motor. */
    void midiRaw(const juce::MidiMessage& m, double nativeOffset) { if (engine_.loaded()) engine_.midi(m, engine_.now() + nativeOffset); }

private:
    PatchEngine engine_;
    std::vector<std::pair<int, float>> pending_;
    bool failed_ = false;
    float out_[2][PatchEngine::kBlock] = {};
};

using PatchProcessor = HostProcessor<PatchHost>;

}  // namespace mmb_plugin
