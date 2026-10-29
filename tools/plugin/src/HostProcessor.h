#pragma once
// Een module als plugin via haar simulator-gastheer (<naam>_wasm.cc, de
// mmb_abi.h-interface). Hoe de gastheer draait, beslist de Host:
//
//  - NativeHost (AbiPlugin.h): de .cc native gecompileerd, globale toestand,
//    dus één exemplaar per DAW-proces (een tweede blijft stil en meldt dat).
//  - W2cHost (W2cPlugin.h): de .wasm uit editor/public/wasm via wasm2c als
//    C, met per exemplaar een eigen instantie (eigen geheugen en globals).
//
// Gedrag, voor beide gelijk:
//  - Audio: de eerste (twee) audio-ingang(en) ← L/R van de DAW, de eerste
//    (twee) audio-uitgang(en) → L/R. Een mono-module krijgt de som.
//  - Samplerate: vóór de init vraagt de plugin de rate van de DAW
//    (mmb_set_rate). Een module met MMB_RATE_FLEX rekent dan op 48 of 96 kHz;
//    de andere blijven op hun eigen rate (blokken van mmb_block) en een
//    Lagrange-interpolator zet van en naar de DAW om. De eerste prepare
//    beslist: een gastheer initialiseert één keer.
//  - CV- en gate-ingangen die geen noten zijn worden parameters ("<poort>
//    (CV)", −1..1; gate aan/uit). Een CV-poort geldt als "aangesloten" zodra
//    de parameter niet 0 is, zodat de knop zonder automation alleen staat.
//  - Noten (instrument): NoteMap.h → voct/gate/vel, mono of per cel.
//    MIDI-gebeurtenissen gelden per DAW-blok (≤ ~10 ms), niet per sample.
//  - Bank (Host::kBank: gastheren met mmb_zone_set, zoals sampler en TAPE
//    STRIP): een `.mmbs` gaat via dezelfde blob-/zone-exports als de worklet
//    van de simulator gebruikt.
//
// Een Host levert: numInputs/inputId/inputKind/inBuf/setConnected,
// numOutputs/outputKind/outBuf, controlIndex/setControl, setRate/init/
// nativeRate/block/process/typeId, en met kBank blobPtr/blobCommit/zoneSet/
// zoneCount (als hasBank()). kShared zegt of alle exemplaren één gastheer
// delen.

#include "MmbPluginBase.h"
#include "NoteMap.h"
#include "mmb_dsp/sample_bank.h"

#include <atomic>
#include <string>
#include <vector>

namespace mmb_plugin {

// Poortsoorten zoals MmbKind in mmb_abi.h.
constexpr int kPortAudio = 0, kPortCv = 1, kPortGate = 2;

/** Poorten van de gastheer, gesorteerd op rol. */
struct AbiPorts {
    std::vector<int> audioIn, audioOut, cvIn;      // cvIn: CV/gate-poorten die parameters worden
    int monoVoct = -1, monoGate = -1, monoVel = -1;
    std::vector<int> cellVoct, cellGate, cellVel;  // poly: index per cel (−1 = geen)
    bool notes = false;

    template <class Host>
    static AbiPorts scan(Host& h, bool synth) {
        AbiPorts p;
        auto find = [&](const char* id) { for (int i = 0; i < h.numInputs(); ++i) if (is(h.inputId(i), id)) return i; return -1; };
        for (int i = 0; i < h.numInputs(); ++i) if (h.inputKind(i) == kPortAudio) p.audioIn.push_back(i);
        for (int i = 0; i < h.numOutputs(); ++i) if (h.outputKind(i) == kPortAudio) p.audioOut.push_back(i);
        std::vector<int> used;
        if (synth) {
            // Poly-cellen voct_1..N; anders mono voct/gate/vel.
            for (int k = 1;; ++k) {
                const int v = find(("voct_" + std::to_string(k)).c_str());
                if (v < 0) break;
                p.cellVoct.push_back(v); used.push_back(v);
                const int g = find(("gate_" + std::to_string(k)).c_str()); p.cellGate.push_back(g); if (g >= 0) used.push_back(g);
                const int vel = find(("vel_" + std::to_string(k)).c_str()); p.cellVel.push_back(vel); if (vel >= 0) used.push_back(vel);
            }
            if (p.cellVoct.empty()) {
                p.monoVoct = find("voct"); p.monoGate = find("gate"); p.monoVel = find("vel");
                for (int i : { p.monoVoct, p.monoGate, p.monoVel }) if (i >= 0) used.push_back(i);
            }
            p.notes = !p.cellVoct.empty() || p.monoVoct >= 0;
        }
        for (int i = 0; i < h.numInputs(); ++i) {
            if (h.inputKind(i) == kPortAudio) continue;
            bool u = false; for (int j : used) if (j == i) u = true;
            if (!u) p.cvIn.push_back(i);
        }
        return p;
    }

    /** De CV-/gate-poorten als extra parameters. */
    template <class Host>
    std::vector<ParamSpec> extraParams(Host& h) const {
        std::vector<ParamSpec> out;
        for (int i : cvIn) {
            const bool gate = h.inputKind(i) == kPortGate;
            const std::string id = h.inputId(i);
            out.push_back(ParamSpec { keep(id), keep(id + (gate ? " (gate)" : " (CV)")),
                                      gate ? ParamKind::Bool : ParamKind::Float, gate ? 0.0f : -1.0f, 1.0f, 0.0f, gate ? 1.0f : 0.0f, 0.0f, "", "" });
        }
        return out;
    }
};

template <class Host>
class HostProcessor final : public MmbProcessor {
public:
    HostProcessor(const ModuleSpec& spec, bool synth)
        : MmbProcessor(spec, synth, probe().extraParamsFor(synth)), ports_(probe().portsFor(synth)) {
        cvValue_.assign(static_cast<std::size_t>(host_.numInputs()), 0.0f);
        if (Host::kShared) slot_ = instances_++;
    }
    ~HostProcessor() override { if (Host::kShared) --instances_; }

    void prepare(double sampleRate, int maxBlock) override {
        host_.setRate(static_cast<float>(sampleRate));   // alleen vóór de eerste init, alleen met MMB_RATE_FLEX
        host_.init();                                    // één keer per gastheer
        block_ = host_.block();
        dawRate_ = sampleRate;
        ratio_ = host_.nativeRate() / sampleRate;         // native samples per DAW-sample (1 als de module meegaat)
        inFifo_.assign(2, {}); outFifo_.assign(2, {});
        for (auto& f : outFifo_) f.assign(static_cast<std::size_t>(2 * block_), 0.0f);   // speling voor de interpolator
        for (auto& i : inInterp_) i.reset();
        for (auto& o : outInterp_) o.reset();
        carry_ = 0.0;
        scratch_.setSize(2, maxBlock + 8);
        notes_.reset(ports_.cellVoct.empty() ? 1 : static_cast<int>(ports_.cellVoct.size()));
        setLatencySamples(static_cast<int>(std::lround(2 * block_ / ratio_)));
        if (slot_ != 0) { std::printf("[mmb] %s: tweede exemplaar in dit proces blijft stil (gastheer is globaal)\n", host_.typeId()); std::fflush(stdout); }
    }

    void applyControl(const char* id, float v) override {
        const int c = host_.controlIndex(id);
        if (c >= 0) host_.setControl(c, v);
    }

    bool hasBank() const override { return Host::kBank && host_.hasBank(); }
    /** `.mmbs` naar de gastheer, zoals parseBank (sampleBank.ts) + de worklet. */
    bool applyBank(const void* data, std::size_t size, juce::String& error) override {
        if constexpr (!Host::kBank) { error = "geen bank"; return false; }
        else {
            using namespace mmb_dsp;
            if (!host_.hasBank()) { error = "geen bank"; return false; }
            if (slot_ != 0) { error = "tweede exemplaar: de bank zit in het eerste"; return false; }
            const auto* b = static_cast<const uint8_t*>(data);
            if (size < sizeof(BankHeader) || std::memcmp(b, "MMBS", 4) != 0) { error = "geen .mmbs-bank"; return false; }
            BankHeader h; std::memcpy(&h, b, sizeof h);
            if (h.version < kBankVersionMin || h.version > kBankVersion) { error = "bankversie " + juce::String(h.version) + " onbekend"; return false; }
            const std::size_t zoneSize = h.version >= 2 ? sizeof(ZoneRecord) : sizeof(ZoneRecordV1);
            const std::size_t dataAt = sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + h.numZones * zoneSize;
            if (dataAt > size) { error = "bank afgekapt (tabellen)"; return false; }
            host_.init();           // sampler en TAPE STRIP zijn niet MMB_RATE_FLEX: vóór prepare laden mag
            host_.zoneCount(0);     // eerst de keymap weg: geen stem op een half geladen slot
            const std::size_t samples = (size - dataAt) / 2;
            for (uint32_t i = 0; i < h.numSlots; ++i) {
                SlotHeader sh; std::memcpy(&sh, b + sizeof(BankHeader) + i * sizeof(SlotHeader), sizeof sh);
                const int ch = sh.channels ? sh.channels : 1;
                const std::size_t start = static_cast<std::size_t>(sh.frameOffset) * ch, count = static_cast<std::size_t>(sh.frames) * ch;
                if (start + count > samples) { error = "bank afgekapt (slot " + juce::String(i) + ")"; return false; }
                int16_t* dst = host_.blobPtr(static_cast<int>(i), static_cast<int>(count * 2));
                if (!dst) { error = "geen geheugen voor slot " + juce::String(i); return false; }
                std::memcpy(dst, b + dataAt + start * 2, count * 2);
                host_.blobCommit(static_cast<int>(i), static_cast<int>(sh.frames), sh.rate > 0 ? sh.rate : 44100.0f, ch);
            }
            for (uint32_t i = 0; i < h.numZones; ++i) {
                ZoneRecord z {};
                std::memcpy(&z, b + sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + i * zoneSize, zoneSize);
                host_.zoneSet(static_cast<int>(i), z.slot, z.lowKey, z.highKey, z.lowVel, z.highVel, z.root, z.tuneCents, z.gain, z.pan,
                              z.loopMode, static_cast<int>(z.loopStart), static_cast<int>(z.loopEnd), z.decay, z.release, z.velTrack,
                              h.version >= 2 ? z.attack : 0.0f);
            }
            host_.zoneCount(static_cast<int>(h.numZones));
            return true;
        }
    }

    juce::AudioProcessorEditor* createEditor() override {
        // Patch: voorlopig de generieke JUCE-bediening (het front volgt).
        if constexpr (Host::kRawMidi) return new juce::GenericAudioProcessorEditor(*this);
        else return MmbProcessor::createEditor();
    }

    void applyCv(const char* port, float v) override {
        for (int i : ports_.cvIn) if (is(host_.inputId(i), port)) { cvValue_[static_cast<std::size_t>(i)] = v; return; }
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        const int frames = buffer.getNumSamples();
        if (slot_ != 0) { buffer.clear(); return; }
        if constexpr (Host::kRawMidi) {
            // Onbewerkt naar de host (patch: MIDI-IN), op zijn plek in de tijd:
            // na wat er nog in de fifo staat, plus de offset in dit blok.
            const double queued = static_cast<double>(inFifo_[0].size());
            for (const auto meta : midi) host_.midiRaw(meta.getMessage(), queued + meta.samplePosition * ratio_);
        } else {
            for (const auto meta : midi) notes_.handle(meta.getMessage());
        }

        // DAW → native: hoeveel native samples horen bij dit blok?
        const double want = frames * ratio_ + carry_;
        const int nativeFrames = static_cast<int>(want);
        carry_ = want - nativeFrames;
        const int inCh = isSynth() ? 0 : getTotalNumInputChannels();
        for (int ch = 0; ch < 2; ++ch) {
            auto& fifo = inFifo_[static_cast<std::size_t>(ch)];
            const std::size_t at = fifo.size();
            fifo.resize(at + static_cast<std::size_t>(nativeFrames));
            if (inCh == 0) { std::fill(fifo.begin() + static_cast<long>(at), fifo.end(), 0.0f); continue; }
            const float* src = buffer.getReadPointer(ch < inCh ? ch : 0);
            if (ratio_ == 1.0) std::memcpy(fifo.data() + at, src, sizeof(float) * static_cast<std::size_t>(nativeFrames));
            else inInterp_[ch].process(1.0 / ratio_, src, fifo.data() + at, nativeFrames, frames, 0);
        }

        // De gastheer draait in blokken van block_ op zijn eigen rate.
        const std::size_t B = static_cast<std::size_t>(block_);
        while (inFifo_[0].size() >= B) {
            for (std::size_t a = 0; a < ports_.audioIn.size(); ++a) {
                const int port = ports_.audioIn[a];
                float* buf = host_.inBuf(port);
                if (a < 2 && inCh > 0 && (a == 0 || inCh > 1 || ports_.audioIn.size() == 1)) {
                    const auto& fifo = inFifo_[a < 2 ? a : 0];
                    if (ports_.audioIn.size() == 1 && inCh > 1)
                        for (std::size_t k = 0; k < B; ++k) buf[k] = 0.5f * (inFifo_[0][k] + inFifo_[1][k]);
                    else std::memcpy(buf, fifo.data(), sizeof(float) * B);
                    host_.setConnected(port, 1);
                } else { std::memset(buf, 0, sizeof(float) * B); host_.setConnected(port, 0); }
            }
            for (int i : ports_.cvIn) {
                const float v = cvValue_[static_cast<std::size_t>(i)];
                fill(i, v, host_.inputKind(i) == kPortGate ? 1 : (v != 0.0f ? 1 : 0));
            }
            writeNotes();
            const bool ok = host_.process(block_);
            for (int ch = 0; ch < 2; ++ch) {
                const int o = ports_.audioOut.empty() ? -1 : ports_.audioOut[static_cast<std::size_t>(ch < static_cast<int>(ports_.audioOut.size()) ? ch : 0)];
                auto& fifo = outFifo_[static_cast<std::size_t>(ch)];
                if (o < 0 || !ok) fifo.insert(fifo.end(), B, 0.0f);
                else { const float* src = host_.outBuf(o); fifo.insert(fifo.end(), src, src + B); }
            }
            for (auto& f : inFifo_) f.erase(f.begin(), f.begin() + static_cast<long>(B));
        }

        // Native → DAW.
        for (int ch = 0; ch < 2; ++ch) {
            auto& fifo = outFifo_[static_cast<std::size_t>(ch)];
            float* dst = buffer.getWritePointer(ch < buffer.getNumChannels() ? ch : 0);
            const int need = static_cast<int>(std::ceil(frames * ratio_)) + 4;
            if (static_cast<int>(fifo.size()) < need) fifo.insert(fifo.begin(), static_cast<std::size_t>(need) - fifo.size(), 0.0f);   // nooit genoeg: stilte vooraan
            int used;
            if (ratio_ == 1.0) { std::memcpy(dst, fifo.data(), sizeof(float) * static_cast<std::size_t>(frames)); used = frames; }
            else used = outInterp_[ch].process(ratio_, fifo.data(), dst, frames, static_cast<int>(fifo.size()), 0);
            fifo.erase(fifo.begin(), fifo.begin() + used);
        }
    }

private:
    /** Eén gastheer om de poorten te lezen vóór er een exemplaar is (de
     *  basisklasse wil de extra parameters in zijn constructor). */
    struct Probe {
        Host host;
        AbiPorts portsFor(bool synth) { return AbiPorts::scan(host, synth); }
        std::vector<ParamSpec> extraParamsFor(bool synth) { return portsFor(synth).extraParams(host); }
    };
    static Probe& probe() { static Probe p; return p; }

    void fill(int port, float v, int connected = 1) {
        if (port < 0) return;
        float* buf = host_.inBuf(port);
        for (int k = 0; k < block_; ++k) buf[k] = v;
        host_.setConnected(port, connected);
    }
    void writeNotes() {
        if (!ports_.notes) return;
        if (ports_.cellVoct.empty()) {
            const auto& c = notes_.cell(0);
            fill(ports_.monoVoct, c.voct + notes_.bend());
            fill(ports_.monoGate, c.gate ? 1.0f : 0.0f);
            fill(ports_.monoVel, c.vel);
            return;
        }
        for (std::size_t k = 0; k < ports_.cellVoct.size(); ++k) {
            const auto& c = notes_.cell(static_cast<int>(k));
            fill(ports_.cellVoct[k], c.voct + notes_.bend());
            fill(ports_.cellGate[k], c.gate ? 1.0f : 0.0f);
            fill(ports_.cellVel[k], c.vel);
        }
    }

    Host host_;
    static inline std::atomic<int> instances_ { 0 };
    int slot_ = 0;
    int block_ = 32;
    AbiPorts ports_;
    std::vector<float> cvValue_;
    NoteMap notes_;
    double dawRate_ = 44100.0, ratio_ = 1.0, carry_ = 0.0;
    std::vector<std::vector<float>> inFifo_, outFifo_;
    juce::LagrangeInterpolator inInterp_[2], outInterp_[2];
    juce::AudioBuffer<float> scratch_;
};

}  // namespace mmb_plugin
