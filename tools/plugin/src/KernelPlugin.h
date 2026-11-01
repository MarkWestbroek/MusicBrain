#pragma once
// Generieke plugin voor een module op de uniforme kern-interface
// (Init / setControl / setCv / cvOut / Process), zoals KernelStream.h op de
// Teensy en kernel_host.h in de wasm. De kernbeschrijving (type, in/uit,
// knopvolgorde, CV-namen) komt uit generated/<typeId>_kernel.h, de
// parameters uit generated/<typeId>_params.h (editor/scripts/pluginParams.ts).
//
// Kanalen: een kern met één audio-ingang draait twee keer (links en
// rechts, echte stereo); een kern met twee ingangen één keer. Alleen de
// eerste (bij stereo: eerste twee) uitgang(en) gaan naar de DAW.
// CV-ingangen die geen noten zijn worden parameters ("<poort> (CV)", −1..1;
// een gate aan/uit). Instrumenten (geen audio-ingang) krijgen hun noten uit
// de DAW via NoteMap.h, op de CV's voct/gate/vel (mono) of voct_k/gate_k/
// vel_k (poly). Elk exemplaar heeft zijn eigen kern: onbeperkt instanties.

#include "MmbPluginBase.h"
#include "NoteMap.h"

#include <cstdint>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

namespace mmb_plugin {

/** Heeft de kern een golftabel (setTable, de CMI)? Dan neemt de plugin er een aan van de bediening. */
template <class X, class = void> struct HasTable : std::false_type {};
template <class X> struct HasTable<X, std::void_t<decltype(std::declval<X&>().setTable(static_cast<const int16_t*>(nullptr), 0))>> : std::true_type {};

template <class K>
class KernelProcessor final : public MmbProcessor {
public:
    using T = typename K::Type;
    static constexpr bool kSynth = K::kAudioIn == 0;
    static constexpr bool kDual = K::kAudioIn == 1;          // mono-kern: L en R apart
    static constexpr int kInstances = kDual ? 2 : 1;
    static constexpr int kOuts = K::kAudioOut > 0 ? K::kAudioOut : 1;
    static constexpr int kIns = K::kAudioIn > 0 ? K::kAudioIn : 1;

    explicit KernelProcessor(const ModuleSpec& spec) : MmbProcessor(spec, kSynth, extraParams()) {
        scanNotes();
        cvValue_.assign(static_cast<std::size_t>(K::kCvIn > 0 ? K::kCvIn : 1), 0.0f);
    }

    void prepare(double sampleRate, int maxBlock) override {
        for (auto& k : kernels_) {
            k.Init(static_cast<float>(sampleRate));
            for (int c = 0; c < K::kCvIn; ++c) k.setCv(c, 0.0f);
            if constexpr (HasTable<T>::value) { if (!table_.empty()) k.setTable(table_.data(), static_cast<int>(table_.size())); }   // Init zet de ingebouwde
        }
        in_.setSize(2, maxBlock);
        spare_.setSize(kOuts, maxBlock);
        notes_.reset(cellVoct_.empty() ? 1 : static_cast<int>(cellVoct_.size()));
    }

    void applyControl(const char* id, float v) override {
        for (int i = 0; i < K::kNumControls; ++i)
            if (is(id, K::kControls[i])) { for (auto& k : kernels_) k.setControl(i, v); return; }
    }
    void applyCv(const char* port, float v) override {
        for (int c = 0; c < K::kCvIn; ++c)
            if (is(port, K::kCvNames[c])) { cvValue_[static_cast<std::size_t>(c)] = v; for (auto& k : kernels_) k.setCv(c, v); return; }
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        const int frames = buffer.getNumSamples();
        if (frames > in_.getNumSamples()) { in_.setSize(2, frames, false, false, true); spare_.setSize(kOuts, frames, false, false, true); }
        float* outL = buffer.getWritePointer(0);
        float* outR = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
        if constexpr (kSynth) {
            for (const auto meta : midi) notes_.handle(meta.getMessage());
            writeNotes();
            const float* ins[1] = { nullptr };
            float* outs[kOuts];
            for (int o = 0; o < kOuts; ++o) outs[o] = spare_.getWritePointer(o);
            outs[0] = outL;
            if constexpr (K::kAudioOut > 1) { if (outR) outs[1] = outR; }
            kernels_[0].Process(ins, outs, frames);
            if constexpr (K::kAudioOut == 1) { if (outR) std::memcpy(outR, outL, sizeof(float) * static_cast<std::size_t>(frames)); }
            return;
        }
        // Ingang kopiëren: niet elke kern mag in-place.
        const int inCh = getTotalNumInputChannels();
        in_.copyFrom(0, 0, buffer, 0, 0, frames);
        if (inCh > 1) in_.copyFrom(1, 0, buffer, 1, 0, frames); else in_.copyFrom(1, 0, buffer, 0, 0, frames);
        const float* inL = in_.getReadPointer(0);
        const float* inR = in_.getReadPointer(1);

        if constexpr (kDual) {
            const float* ins[1] = { inL };
            float* outs[kOuts];
            for (int o = 0; o < kOuts; ++o) outs[o] = spare_.getWritePointer(o);
            outs[0] = outL;
            kernels_[0].Process(ins, outs, frames);
            if (outR) {
                ins[0] = inR; outs[0] = outR;
                kernels_[1].Process(ins, outs, frames);
            }
        } else {
            const float* ins[kIns] = {};
            ins[0] = inL;
            if constexpr (K::kAudioIn > 1) ins[1] = inR;
            float* outs[kOuts];
            for (int o = 0; o < kOuts; ++o) outs[o] = spare_.getWritePointer(o);
            outs[0] = outL;
            if constexpr (K::kAudioOut > 1) { if (outR) outs[1] = outR; }
            kernels_[0].Process(ins, outs, frames);
            if constexpr (K::kAudioOut == 1) { if (outR) std::memcpy(outR, outL, sizeof(float) * static_cast<std::size_t>(frames)); }
        }
    }

    // ── Golftabel (CMI): van de bediening (CmiPage4 via mmbPatchLive), bewaard in het project ──
    juce::var patchLive(const juce::var& msg) override {
        if constexpr (!HasTable<T>::value) return {};
        else {
            const juce::String op = msg["op"].toString();
            if (op == "get") { auto* o = new juce::DynamicObject(); o->setProperty("ui", ui_); return juce::var(o); }
            if (op == "ui") { ui_ = msg["ui"].toString(); return true; }
            if (op != "blob" || static_cast<int>(msg["slot"]) != 0) return {};
            std::vector<int16_t> t;
            if (!decode(msg["b64"].toString(), t)) return false;
            const juce::ScopedLock cl(getCallbackLock());
            table_ = std::move(t);
            for (auto& k : kernels_) k.setTable(table_.data(), static_cast<int>(table_.size()));
            return true;
        }
    }
    void addToState(juce::ValueTree& tree) const override {
        if (table_.empty()) return;
        tree.setProperty("kernelTable", juce::Base64::toBase64(table_.data(), table_.size() * sizeof(int16_t)), nullptr);
        tree.setProperty("kernelUi", ui_, nullptr);
    }
    void restoredState(const juce::ValueTree& tree) override {
        if constexpr (HasTable<T>::value) {
            std::vector<int16_t> t;
            ui_ = tree.getProperty("kernelUi").toString();
            if (!decode(tree.getProperty("kernelTable").toString(), t)) return;
            const juce::ScopedLock cl(getCallbackLock());
            table_ = std::move(t);
            for (auto& k : kernels_) k.setTable(table_.data(), static_cast<int>(table_.size()));
        }
    }

private:
    static bool decode(const juce::String& b64, std::vector<int16_t>& out) {
        juce::MemoryOutputStream os;
        if (b64.isEmpty() || !juce::Base64::convertFromBase64(os, b64) || os.getDataSize() < 4) return false;
        out.assign(os.getDataSize() / 2, 0);
        std::memcpy(out.data(), os.getData(), out.size() * sizeof(int16_t));
        return true;
    }
    static int cvIndex(const std::string& name) {
        for (int c = 0; c < K::kCvIn; ++c) if (name == K::kCvNames[c]) return c;
        return -1;
    }
    static bool isNoteCv(const std::string& n) {
        if (!kSynth) return false;
        return n == "voct" || n == "gate" || n == "vel" || n.rfind("voct_", 0) == 0 || n.rfind("gate_", 0) == 0 || n.rfind("vel_", 0) == 0;
    }
    /** CV-ingangen die geen noten zijn → parameters. */
    static std::vector<ParamSpec> extraParams() {
        std::vector<ParamSpec> out;
        for (int c = 0; c < K::kCvIn; ++c) {
            const std::string n = K::kCvNames[c];
            if (n.empty() || isNoteCv(n)) continue;
            const bool gate = n == "trig" || n.rfind("gate", 0) == 0 || n == "freeze" || n == "accent" || n == "pedal";
            out.push_back(ParamSpec { keep(n), keep(n + (gate ? " (gate)" : " (CV)")), gate ? ParamKind::Bool : ParamKind::Float,
                                      gate ? 0.0f : -1.0f, 1.0f, 0.0f, gate ? 1.0f : 0.0f, 0.0f, "", "" });
        }
        return out;
    }
    void scanNotes() {
        if (!kSynth) return;
        for (int k = 1;; ++k) {
            const int v = cvIndex("voct_" + std::to_string(k));
            if (v < 0) break;
            cellVoct_.push_back(v); cellGate_.push_back(cvIndex("gate_" + std::to_string(k))); cellVel_.push_back(cvIndex("vel_" + std::to_string(k)));
        }
        if (cellVoct_.empty()) { monoVoct_ = cvIndex("voct"); monoGate_ = cvIndex("gate"); monoVel_ = cvIndex("vel"); }
    }
    void setCv(int c, float v) { if (c >= 0) kernels_[0].setCv(c, v); }
    // De gate als laatste: een kern die op de opgaande flank aanslaat (E-PIANO)
    // leest daar toonhoogte en velocity, die moeten er dan al staan.
    void writeNotes() {
        if (cellVoct_.empty()) {
            const auto& c = notes_.cell(0);
            setCv(monoVoct_, c.voct + notes_.bend()); setCv(monoVel_, c.vel); setCv(monoGate_, c.gate ? 1.0f : 0.0f);
            return;
        }
        for (std::size_t k = 0; k < cellVoct_.size(); ++k) {
            const auto& c = notes_.cell(static_cast<int>(k));
            setCv(cellVoct_[k], c.voct + notes_.bend()); setCv(cellVel_[k], c.vel); setCv(cellGate_[k], c.gate ? 1.0f : 0.0f);
        }
    }

    T kernels_[kInstances];
    std::vector<int16_t> table_;   // golftabel (HasTable), leeg = de ingebouwde
    juce::String ui_;              // wat de bediening erbij bewaart (het CMI-profiel)
    juce::AudioBuffer<float> in_, spare_;
    std::vector<float> cvValue_;
    NoteMap notes_;
    int monoVoct_ = -1, monoGate_ = -1, monoVel_ = -1;
    std::vector<int> cellVoct_, cellGate_, cellVel_;
};

}  // namespace mmb_plugin
