// MMB CR-78 Kit: de twaalf CR-78-klanken (mmb_dsp/cr78.h, dezelfde kern als
// de module tp_mmb_cr78) als drumkit, elk op zijn General-MIDI-noot. Zo speelt
// Logic hem met Drummer, de Step Sequencer of een gewone MIDI-regio, en volgt
// hij tempo en transport van de DAW vanzelf (de noten komen van daar).
//
//  - Noten: 36/35 Kick, 38/40 Snare, 37 Rim, 75 Claves, 56 Cowbell,
//    42/44/46 HiHat, 49/51/57 Cymbal, 70 Maracas, 73/74 Guiro, 60/61 Bongo
//    (61 een kwart lager), 62/63/64 Conga (64 een kwart lager), 54 Tamb.
//  - Aanslag = accent (zoals de accent-CV van de module).
//  - Per stem Tone, Decay, Bend, Level en Pan; Master voor het geheel.
//  - Als gastheer in HostProcessor (zoals de patch-plugins): de kern rekent
//    op 44,1 kHz in blokken van 32, MIDI komt sample-precies binnen, de
//    plugin zet om naar de rate van de DAW.

#include "HostProcessor.h"
#include "mmb_dsp/cr78.h"

#include <array>
#include <cstdlib>
#include <cstring>

namespace mmb_plugin {

namespace {

constexpr int kVoices = 12;
const char* const kNames[kVoices] = { "Kick", "Snare", "Rim", "Claves", "Cowbell", "HiHat", "Cymbal", "Maracas", "Guiro", "Bongo", "Conga", "Tamb" };

/** Noot → stem, met een toonhoogteverschuiving in octaven (V/Oct van de kern). */
struct NoteMapEntry { int note, voice; float voct; };
constexpr NoteMapEntry kNoteMap[] = {
    { 36, 0, 0.0f }, { 35, 0, 0.0f },                       // Kick
    { 38, 1, 0.0f }, { 40, 1, 0.0f },                       // Snare
    { 37, 2, 0.0f },                                        // Rim
    { 75, 3, 0.0f },                                        // Claves
    { 56, 4, 0.0f },                                        // Cowbell
    { 42, 5, 0.0f }, { 44, 5, 0.0f }, { 46, 5, 0.0f },      // HiHat
    { 49, 6, 0.0f }, { 51, 6, 0.0f }, { 57, 6, 0.0f },      // Cymbal
    { 70, 7, 0.0f },                                        // Maracas
    { 73, 8, 0.0f }, { 74, 8, 0.0f },                       // Guiro
    { 60, 9, 0.0f }, { 61, 9, -5.0f / 12.0f },              // Bongo hoog/laag
    { 62, 10, 0.0f }, { 63, 10, 0.0f }, { 64, 10, -5.0f / 12.0f },   // Conga hoog/laag
    { 54, 11, 0.0f },                                       // Tamb
};

// Parameters: per stem v<n>_tone/decay/bend/level/pan (n = 1..12), dan master.
constexpr int kPerVoice = 5;
const char* const kCtl[kPerVoice] = { "tone", "decay", "bend", "level", "pan" };
const char* const kCtlName[kPerVoice] = { "Tone", "Decay", "Bend", "Level", "Pan" };

/** De tabel met parameters, één keer opgebouwd (ParamSpec wil vaste strings). */
const std::vector<ParamSpec>& kitParams() {
    static const std::vector<ParamSpec> params = [] {
        std::vector<ParamSpec> p;
        for (int v = 0; v < kVoices; ++v)
            for (int c = 0; c < kPerVoice; ++c) {
                const bool pan = c == 4;
                p.push_back(ParamSpec { keep("v" + std::to_string(v + 1) + "_" + kCtl[c]), keep(std::string(kNames[v]) + " " + kCtlName[c]),
                                        ParamKind::Float, pan ? -1.0f : 0.0f, 1.0f, pan ? 0.0f : c == 3 ? 0.8f : 0.5f, 0.0f, 0.0f, "", "" });
            }
        p.push_back(ParamSpec { "master", "Master", ParamKind::Float, 0.0f, 1.0f, 0.8f, 0.0f, 0.0f, "", "" });
        return p;
    }();
    return params;
}

}  // namespace

class Cr78KitHost {
public:
    static constexpr bool kShared = false;
    static constexpr bool kBank = false;
    static constexpr bool kRawMidi = true;
    static constexpr int kBlock = 32;
    static constexpr double kRate = 44100.0;

    int numInputs() const { return 0; }
    const char* inputId(int) const { return ""; }
    int inputKind(int) const { return kPortAudio; }
    float* inBuf(int) { return nullptr; }
    void setConnected(int, int) {}
    int numOutputs() const { return 2; }
    int outputKind(int) const { return kPortAudio; }
    const float* outBuf(int i) const { return out_[i]; }
    bool hasBank() const { return false; }

    int controlIndex(const char* id) const {
        if (std::strcmp(id, "master") == 0) return kVoices * kPerVoice;
        if (id[0] != 'v') return -1;
        const int v = std::atoi(id + 1) - 1;
        const char* us = std::strchr(id, '_');
        if (v < 0 || v >= kVoices || !us) return -1;
        for (int c = 0; c < kPerVoice; ++c) if (std::strcmp(us + 1, kCtl[c]) == 0) return v * kPerVoice + c;
        return -1;
    }
    void setControl(int c, float x) {
        if (c == kVoices * kPerVoice) { master_ = x; return; }
        if (c < 0 || c > kVoices * kPerVoice) return;
        auto& d = drum_[static_cast<std::size_t>(c / kPerVoice)];
        switch (c % kPerVoice) {
            case 0: d.setTone(x); break;
            case 1: d.setDecay(x); break;
            case 2: d.setBend(x); break;
            case 3: d.setLevel(x); break;
            case 4: pan_[static_cast<std::size_t>(c / kPerVoice)] = x; break;
        }
    }

    float setRate(float) { return static_cast<float>(kRate); }
    void init() {
        if (ready_) return;
        for (int v = 0; v < kVoices; ++v) { drum_[static_cast<std::size_t>(v)].Init(static_cast<float>(kRate)); drum_[static_cast<std::size_t>(v)].setDrum(v); }
        pending_.reserve(256);   // de audiothread vraagt geen geheugen
        ready_ = true;
    }
    float nativeRate() const { return static_cast<float>(kRate); }
    int block() const { return kBlock; }
    const char* typeId() const { return "kit_cr78"; }

    /** Noot op @p nativeOffset samples na het begin van het volgende blok. */
    void midiRaw(const juce::MidiMessage& m, double nativeOffset) {
        if (!m.isNoteOn()) return;
        for (const auto& e : kNoteMap)
            if (e.note == m.getNoteNumber()) {
                if (pending_.size() < 256) pending_.push_back({ clock_ + nativeOffset, e.voice, e.voct, m.getFloatVelocity() });
                return;
            }
    }

    bool process(int) {
        if (!ready_) return false;
        std::fill(out_[0], out_[0] + kBlock, 0.0f);
        std::fill(out_[1], out_[1] + kBlock, 0.0f);
        // Slagen die in dit blok vallen, sample-precies: het blok in stukken tot de volgende slag.
        int at = 0;
        while (at < kBlock) {
            int next = kBlock;
            for (const auto& h : pending_) {
                const int k = static_cast<int>(h.at - clock_);
                if (k <= at) continue;
                next = std::min(next, k);
            }
            fire(at);
            for (int v = 0; v < kVoices; ++v) {
                auto& d = drum_[static_cast<std::size_t>(v)];
                const float th = (pan_[static_cast<std::size_t>(v)] + 1.0f) * 0.25f * 3.14159265f;
                const float gl = master_ * std::cos(th) * 1.41421356f, gr = master_ * std::sin(th) * 1.41421356f;
                for (int k = at; k < next; ++k) {
                    const float y = d.Tick() * kOutScale;
                    out_[0][k] += gl * y;
                    out_[1][k] += gr * y;
                }
            }
            at = next;
        }
        clock_ += kBlock;
        for (int k = 0; k < kBlock; ++k) {
            out_[0][k] = juce::jlimit(-1.0f, 1.0f, out_[0][k]);
            out_[1][k] = juce::jlimit(-1.0f, 1.0f, out_[1][k]);
        }
        return true;
    }

private:
    struct Hit { double at; int voice; float voct, vel; };
    /** Slagen tot en met sample @p at van dit blok. */
    void fire(int at) {
        for (std::size_t i = 0; i < pending_.size();) {
            const Hit& h = pending_[i];
            if (h.at - clock_ <= at) {
                auto& d = drum_[static_cast<std::size_t>(h.voice)];
                if (h.voct != voct_[static_cast<std::size_t>(h.voice)]) { voct_[static_cast<std::size_t>(h.voice)] = h.voct; d.setVoct(h.voct); }
                d.setAccent(h.vel);
                d.trigger();
                pending_.erase(pending_.begin() + static_cast<long>(i));
            } else ++i;
        }
    }

    static constexpr float kOutScale = 28000.0f / 32768.0f;   // zoals cr78_wasm.cc
    std::array<mmb_dsp::Cr78, kVoices> drum_ {};
    std::array<float, kVoices> pan_ {}, voct_ {};
    float master_ = 0.8f;
    bool ready_ = false;
    double clock_ = 0.0;
    std::vector<Hit> pending_;
    float out_[2][kBlock] = {};
};

using Cr78KitProcessor = HostProcessor<Cr78KitHost>;

namespace {
const ModuleSpec& kitSpec() {
    static const ModuleSpec spec { "kit_cr78", "CR-78 Kit", 30, kitParams().data(), static_cast<int>(kitParams().size()), nullptr, 0, 160.0f, 128.0f };
    return spec;
}
}  // namespace

}  // namespace mmb_plugin

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mmb_plugin::Cr78KitProcessor(mmb_plugin::kitSpec(), true); }
