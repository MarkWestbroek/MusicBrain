#pragma once
// Een module als plugin via haar simulator-gastheer: hetzelfde
// <naam>_wasm.cc dat de browser draait, hier native gecompileerd (mmb_abi.h).
// Daarmee is élke module met een wasm-gastheer een plugin, met letterlijk
// dezelfde code als de simulator.
//
//  - Audio: de eerste (twee) audio-ingang(en) ← L/R van de DAW, de eerste
//    (twee) audio-uitgang(en) → L/R. Een mono-module krijgt de som.
//  - Samplerate: vóór mmb_init vraagt de plugin de rate van de DAW
//    (mmb_set_rate). Een module met MMB_RATE_FLEX rekent dan op 48 of 96 kHz;
//    de andere blijven op hun eigen rate (MMB_NATIVE_RATE, blokken van
//    MMB_BLOCK) en een Lagrange-interpolator zet van en naar de DAW om. De
//    eerste prepare beslist (de gastheer is globaal en initialiseert één keer).
//  - CV- en gate-ingangen die geen noten zijn worden parameters ("<poort>
//    (CV)", −1..1; gate aan/uit). Een CV-poort geldt als "aangesloten" zodra
//    de parameter niet 0 is, zodat de knop zonder automation alleen staat.
//  - Noten (instrument): NoteMap.h → voct/gate/vel, mono of per cel.
//    MIDI-gebeurtenissen gelden per DAW-blok (≤ ~10 ms), niet per sample.
//
//  - Bank (MMB_PLUGIN_BANK, door de generator gezet voor gastheren met
//    mmb_zone_set: sampler, TAPE STRIP): een `.mmbs` gaat via dezelfde
//    blob-/zone-exports als de worklet van de simulator gebruikt.
//
// Beperking: de gastheer gebruikt globale toestand (één wasm-instantie per
// geheugen), dus **één exemplaar per plugin per DAW-proces**; een tweede
// exemplaar blijft stil en meldt dat. Modules op de uniforme kern-interface
// (KernelPlugin.h) hebben die beperking niet.

#include "MmbPluginBase.h"
#include "NoteMap.h"
#include "mmb_abi.h"

#include <atomic>
#include <string>
#include <vector>

#if MMB_PLUGIN_BANK
#include "mmb_dsp/sample_bank.h"
// In de gastheer (<naam>_wasm.cc, na deze header ingevoegd).
extern "C" int16_t* mmb_blob_ptr(int slot, int bytes);
extern "C" void mmb_blob_commit(int slot, int frames, float rate, int channels);
extern "C" void mmb_zone_set(int idx, int slot, int lowKey, int highKey, int lowVel, int highVel,
                             float root, float tuneCents, float gain, float pan,
                             int loopMode, int loopStart, int loopEnd, float decay, float release,
                             int velTrack, float attack);
extern "C" void mmb_zone_count(int n);
#endif

namespace mmb_plugin {

inline bool startsWith(const char* s, const char* prefix) { return std::strncmp(s, prefix, std::strlen(prefix)) == 0; }

/** Poorten van de gastheer, gesorteerd op rol. */
struct AbiPorts {
    std::vector<int> audioIn, audioOut, cvIn;      // cvIn: CV/gate-poorten die parameters worden
    int monoVoct = -1, monoGate = -1, monoVel = -1;
    std::vector<int> cellVoct, cellGate, cellVel;  // poly: index per cel (−1 = geen)
    bool notes = false;

    static AbiPorts scan(bool synth) {
        AbiPorts p;
        auto find = [](const char* id) { for (int i = 0; i < MMB_NUM_INPUTS; ++i) if (is(MMB_INPUTS[i].id, id)) return i; return -1; };
        for (int i = 0; i < MMB_NUM_INPUTS; ++i) if (MMB_INPUTS[i].kind == MMB_AUDIO) p.audioIn.push_back(i);
        for (int i = 0; i < MMB_NUM_OUTPUTS; ++i) if (MMB_OUTPUTS[i].kind == MMB_AUDIO) p.audioOut.push_back(i);
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
        for (int i = 0; i < MMB_NUM_INPUTS; ++i) {
            if (MMB_INPUTS[i].kind == MMB_AUDIO) continue;
            bool u = false; for (int j : used) if (j == i) u = true;
            if (!u) p.cvIn.push_back(i);
        }
        return p;
    }

    /** De CV-/gate-poorten als extra parameters. */
    std::vector<ParamSpec> extraParams() const {
        std::vector<ParamSpec> out;
        for (int i : cvIn) {
            const bool gate = MMB_INPUTS[i].kind == MMB_GATE;
            out.push_back(ParamSpec { keep(MMB_INPUTS[i].id), keep(std::string(MMB_INPUTS[i].id) + (gate ? " (gate)" : " (CV)")),
                                      gate ? ParamKind::Bool : ParamKind::Float, gate ? 0.0f : -1.0f, 1.0f, 0.0f, gate ? 1.0f : 0.0f, 0.0f, "", "" });
        }
        return out;
    }
};

class AbiProcessor final : public MmbProcessor {
public:
    AbiProcessor(const ModuleSpec& spec, bool synth)
        : MmbProcessor(spec, synth, portsFor(synth).extraParams()), ports_(portsFor(synth)) {
        cvValue_.assign(static_cast<std::size_t>(MMB_NUM_INPUTS), 0.0f);
        slot_ = instances_++;
    }
    ~AbiProcessor() override { --instances_; }

    void prepare(double sampleRate, int maxBlock) override {
        mmb_set_rate(static_cast<float>(sampleRate)); // alleen vóór de eerste mmb_init, alleen met MMB_RATE_FLEX
        mmb_init();                                   // één keer per proces (de gastheer is globaal)
        dawRate_ = sampleRate;
        ratio_ = mmb_native_rate() / sampleRate;      // native samples per DAW-sample (1 als de module meegaat)
        inFifo_.assign(2, {}); outFifo_.assign(2, {});
        for (auto& f : outFifo_) f.assign(static_cast<std::size_t>(2 * MMB_BLOCK), 0.0f);   // speling voor de interpolator
        for (auto& i : inInterp_) i.reset();
        for (auto& o : outInterp_) o.reset();
        carry_ = 0.0;
        scratch_.setSize(2, maxBlock + 8);
        notes_.reset(ports_.cellVoct.empty() ? 1 : static_cast<int>(ports_.cellVoct.size()));
        setLatencySamples(static_cast<int>(std::lround(2 * MMB_BLOCK / ratio_)));
        if (slot_ != 0) { std::printf("[mmb] %s: tweede exemplaar in dit proces blijft stil (gastheer is globaal)\n", MMB_TYPE_ID); std::fflush(stdout); }
    }

    void applyControl(const char* id, float v) override {
        const int c = mmb_control_index(id);
        if (c >= 0) mmb_set_control(c, v);
    }
#if MMB_PLUGIN_BANK
    bool hasBank() const override { return true; }
    /** `.mmbs` naar de gastheer, zoals parseBank (sampleBank.ts) + de worklet. */
    bool applyBank(const void* data, std::size_t size, juce::String& error) override {
        using namespace mmb_dsp;
        if (slot_ != 0) { error = "tweede exemplaar: de bank zit in het eerste"; return false; }
        const auto* b = static_cast<const uint8_t*>(data);
        if (size < sizeof(BankHeader) || std::memcmp(b, "MMBS", 4) != 0) { error = "geen .mmbs-bank"; return false; }
        BankHeader h; std::memcpy(&h, b, sizeof h);
        if (h.version < kBankVersionMin || h.version > kBankVersion) { error = "bankversie " + juce::String(h.version) + " onbekend"; return false; }
        const std::size_t zoneSize = h.version >= 2 ? sizeof(ZoneRecord) : sizeof(ZoneRecordV1);
        const std::size_t dataAt = sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + h.numZones * zoneSize;
        if (dataAt > size) { error = "bank afgekapt (tabellen)"; return false; }
        mmb_init();          // sampler en TAPE STRIP zijn niet MMB_RATE_FLEX: vóór prepare laden mag
        mmb_zone_count(0);   // eerst de keymap weg: geen stem op een half geladen slot
        const std::size_t samples = (size - dataAt) / 2;
        for (uint32_t i = 0; i < h.numSlots; ++i) {
            SlotHeader sh; std::memcpy(&sh, b + sizeof(BankHeader) + i * sizeof(SlotHeader), sizeof sh);
            const int ch = sh.channels ? sh.channels : 1;
            const std::size_t start = static_cast<std::size_t>(sh.frameOffset) * ch, count = static_cast<std::size_t>(sh.frames) * ch;
            if (start + count > samples) { error = "bank afgekapt (slot " + juce::String(i) + ")"; return false; }
            int16_t* dst = mmb_blob_ptr(static_cast<int>(i), static_cast<int>(count * 2));
            if (!dst) { error = "geen geheugen voor slot " + juce::String(i); return false; }
            std::memcpy(dst, b + dataAt + start * 2, count * 2);
            mmb_blob_commit(static_cast<int>(i), static_cast<int>(sh.frames), sh.rate > 0 ? sh.rate : 44100.0f, ch);
        }
        for (uint32_t i = 0; i < h.numZones; ++i) {
            ZoneRecord z {};
            std::memcpy(&z, b + sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + i * zoneSize, zoneSize);
            mmb_zone_set(static_cast<int>(i), z.slot, z.lowKey, z.highKey, z.lowVel, z.highVel, z.root, z.tuneCents, z.gain, z.pan,
                         z.loopMode, static_cast<int>(z.loopStart), static_cast<int>(z.loopEnd), z.decay, z.release, z.velTrack,
                         h.version >= 2 ? z.attack : 0.0f);
        }
        mmb_zone_count(static_cast<int>(h.numZones));
        return true;
    }
#endif
    void applyCv(const char* port, float v) override {
        for (int i : ports_.cvIn) if (is(MMB_INPUTS[i].id, port)) { cvValue_[static_cast<std::size_t>(i)] = v; return; }
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        const int frames = buffer.getNumSamples();
        if (slot_ != 0) { buffer.clear(); return; }
        for (const auto meta : midi) notes_.handle(meta.getMessage());

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

        // De gastheer draait in blokken van MMB_BLOCK op zijn eigen rate.
        while (inFifo_[0].size() >= static_cast<std::size_t>(MMB_BLOCK)) {
            for (std::size_t a = 0; a < ports_.audioIn.size(); ++a) {
                MmbPort& port = MMB_INPUTS[static_cast<std::size_t>(ports_.audioIn[a])];
                if (a < 2 && inCh > 0 && (a == 0 || inCh > 1 || ports_.audioIn.size() == 1)) {
                    const auto& fifo = inFifo_[a < 2 ? a : 0];
                    if (ports_.audioIn.size() == 1 && inCh > 1)
                        for (int k = 0; k < MMB_BLOCK; ++k) port.buf[k] = 0.5f * (inFifo_[0][static_cast<std::size_t>(k)] + inFifo_[1][static_cast<std::size_t>(k)]);
                    else std::memcpy(port.buf, fifo.data(), sizeof(float) * static_cast<std::size_t>(MMB_BLOCK));
                    port.connected = 1;
                } else { std::memset(port.buf, 0, sizeof(float) * static_cast<std::size_t>(MMB_BLOCK)); port.connected = 0; }
            }
            for (int i : ports_.cvIn) {
                MmbPort& port = MMB_INPUTS[i];
                const float v = cvValue_[static_cast<std::size_t>(i)];
                for (int k = 0; k < MMB_BLOCK; ++k) port.buf[k] = v;
                port.connected = port.kind == MMB_GATE ? 1 : (v != 0.0f ? 1 : 0);
            }
            writeNotes();
            mmb_process(MMB_BLOCK);
            for (int ch = 0; ch < 2; ++ch) {
                const int o = ports_.audioOut.empty() ? -1 : ports_.audioOut[static_cast<std::size_t>(ch < static_cast<int>(ports_.audioOut.size()) ? ch : 0)];
                auto& fifo = outFifo_[static_cast<std::size_t>(ch)];
                if (o < 0) fifo.insert(fifo.end(), static_cast<std::size_t>(MMB_BLOCK), 0.0f);
                else fifo.insert(fifo.end(), MMB_OUTPUTS[o].buf, MMB_OUTPUTS[o].buf + MMB_BLOCK);
            }
            for (auto& f : inFifo_) f.erase(f.begin(), f.begin() + MMB_BLOCK);
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
    static AbiPorts portsFor(bool synth) { static AbiPorts p = AbiPorts::scan(synth); return p; }

    static void fill(int port, float v, int connected = 1) {
        if (port < 0) return;
        for (int k = 0; k < MMB_BLOCK; ++k) MMB_INPUTS[port].buf[k] = v;
        MMB_INPUTS[port].connected = connected;
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

    static inline std::atomic<int> instances_ { 0 };
    int slot_ = 0;
    AbiPorts ports_;
    std::vector<float> cvValue_;
    NoteMap notes_;
    double dawRate_ = 44100.0, ratio_ = 1.0, carry_ = 0.0;
    std::vector<std::vector<float>> inFifo_, outFifo_;
    juce::LagrangeInterpolator inInterp_[2], outInterp_[2];
    juce::AudioBuffer<float> scratch_;
};

}  // namespace mmb_plugin
