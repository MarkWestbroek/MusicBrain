#pragma once
// Generieke plugin voor een module op de uniforme kern-interface
// (Init / setControl / setCv / cvOut / Process), zoals KernelStream.h op de
// Teensy en kernel_host.h in de wasm. De kernbeschrijving (type, in/uit,
// knopvolgorde) komt uit generated/<typeId>_kernel.h, de parameters uit
// generated/<typeId>_params.h (editor/scripts/pluginParams.ts).
//
// Kanalen: een kern met één audio-ingang draait twee keer (links en
// rechts, echte stereo); een kern met twee ingangen één keer. Alleen de
// eerste (bij stereo: eerste twee) uitgang(en) gaan naar de DAW; CV-ingangen
// staan op 0 (modulatie komt in een DAW uit automation).

#include "MmbPluginBase.h"

namespace mmb_plugin {

template <class K>
class KernelProcessor final : public MmbProcessor {
public:
    using T = typename K::Type;
    static constexpr bool kDual = K::kAudioIn == 1;          // mono-kern: L en R apart
    static constexpr int kInstances = kDual ? 2 : 1;
    static constexpr int kOuts = K::kAudioOut > 0 ? K::kAudioOut : 1;
    static constexpr int kIns = K::kAudioIn > 0 ? K::kAudioIn : 1;

    explicit KernelProcessor(const ModuleSpec& spec) : MmbProcessor(spec, K::kAudioIn == 0) {}

    void prepare(double sampleRate, int maxBlock) override {
        for (auto& k : kernels_) {
            k.Init(static_cast<float>(sampleRate));
            for (int c = 0; c < K::kCvIn; ++c) k.setCv(c, 0.0f);
        }
        in_.setSize(2, maxBlock);
        spare_.setSize(kOuts, maxBlock);
    }

    void applyControl(const char* id, float v) override {
        for (int i = 0; i < K::kNumControls; ++i)
            if (is(id, K::kControls[i])) { for (auto& k : kernels_) k.setControl(i, v); return; }
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
        const int frames = buffer.getNumSamples();
        if (frames > in_.getNumSamples()) { in_.setSize(2, frames, false, false, true); spare_.setSize(kOuts, frames, false, false, true); }
        float* outL = buffer.getWritePointer(0);
        float* outR = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
        if constexpr (K::kAudioIn == 0) {
            // Instrument zonder notenvertaling: nog stil (zie doc/plans/plugin.md).
            buffer.clear();
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

private:
    T kernels_[kInstances];
    juce::AudioBuffer<float> in_, spare_;
};

}  // namespace mmb_plugin
