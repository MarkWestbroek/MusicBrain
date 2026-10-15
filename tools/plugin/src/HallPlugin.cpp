// MMB HALL als plugin: mmb_dsp::Hall (dezelfde header als HallModule.h en
// hall_wasm.cc) in de MMB-romp (MmbPluginBase.h). Parameters en bediening
// komen uit het paneel (generated/tp_mmb_hall_params.h).

#include "MmbPluginBase.h"
#include "tp_mmb_hall_params.h"
#include "mmb_dsp/hall.h"

namespace {

using mmb_plugin::is;

class HallProcessor final : public mmb_plugin::MmbProcessor {
public:
    using Kernel = mmb_dsp::Hall;
    HallProcessor() : MmbProcessor(mmb_plugin::kModule_tp_mmb_hall, false) {}

    void prepare(double sampleRate, int) override { kernel_.Init(static_cast<float>(sampleRate)); }

    void applyControl(const char* id, float v) override {
        static constexpr struct { const char* id; int control; } kMap[] = {
            { "algo", Kernel::Algo }, { "size", Kernel::Size }, { "decay", Kernel::Decay }, { "predelay", Kernel::Predelay },
            { "early", Kernel::Early }, { "diffusion", Kernel::Diffusion }, { "hidamp", Kernel::HiDamp }, { "lomult", Kernel::LoMult },
            { "mod", Kernel::Mod }, { "width", Kernel::Width }, { "mix", Kernel::Mix }, { "freeze_btn", Kernel::Freeze },
        };
        for (const auto& m : kMap) if (is(id, m.id)) { kernel_.setControl(m.control, v); return; }
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
        const int inChannels = getTotalNumInputChannels();
        // De kern leest in[n] vóór hij out[n] schrijft, dus in-place is veilig.
        const float* in[2] = { buffer.getReadPointer(0), inChannels > 1 ? buffer.getReadPointer(1) : nullptr };
        float* out[2] = { buffer.getWritePointer(0), buffer.getWritePointer(1) };
        kernel_.Process(in, out, buffer.getNumSamples());
    }

private:
    Kernel kernel_;
};

}  // namespace

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new HallProcessor(); }
