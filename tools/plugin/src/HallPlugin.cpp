// MMB HALL als plugin: mmb_dsp::Hall (dezelfde header als HallModule.h en
// hall_wasm.cc) achter een juce::AudioProcessor. Proef: kale knoppen via de
// GenericAudioProcessorEditor; de echte bediening komt later (plan).

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include "mmb_dsp/hall.h"

namespace {

using Kernel = mmb_dsp::Hall;

struct ParamSpec {
    const char* id; const char* name; int control;
    float min, max, def, skewMid;   // skewMid 0 = lineair, anders de waarde in het midden van de knop
    const char* unit;
};
// Zelfde bereiken en standen als het paneel mmbHall in seedModules.ts.
constexpr ParamSpec kParams[] = {
    { "size",      "Size",      Kernel::Size,      0.0f,  1.0f,     0.6f,  0.0f, "" },
    { "decay",     "Decay",     Kernel::Decay,     0.2f,  30.0f,    2.5f,  2.5f, "s" },
    { "predelay",  "Pre-delay", Kernel::Predelay,  0.0f,  250.0f,   20.0f, 0.0f, "ms" },
    { "early",     "Early",     Kernel::Early,     0.0f,  1.0f,     0.5f,  0.0f, "" },
    { "diffusion", "Diffusion", Kernel::Diffusion, 0.0f,  1.0f,     0.85f, 0.0f, "" },
    { "hidamp",    "Hi damp",   Kernel::HiDamp,    0.0f,  1.0f,     0.4f,  0.0f, "" },
    { "lomult",    "Lo mult",   Kernel::LoMult,    0.25f, 4.0f,     1.2f,  1.0f, "x" },
    { "mod",       "Mod",       Kernel::Mod,       0.0f,  1.0f,     0.4f,  0.0f, "" },
    { "width",     "Width",     Kernel::Width,     0.0f,  1.0f,     1.0f,  0.0f, "" },
    { "mix",       "Mix",       Kernel::Mix,       0.0f,  1.0f,     0.3f,  0.0f, "" },
};
constexpr int kNumFloatParams = static_cast<int>(sizeof(kParams) / sizeof(kParams[0]));

class HallProcessor final : public juce::AudioProcessor {
public:
    HallProcessor()
        : AudioProcessor(BusesProperties()
                             .withInput("Input", juce::AudioChannelSet::stereo(), true)
                             .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
          state_(*this, nullptr, "MMB_HALL", layout()) {
        for (int i = 0; i < kNumFloatParams; ++i) floats_[i] = state_.getRawParameterValue(kParams[i].id);
        algo_ = state_.getRawParameterValue("algo");
        freeze_ = state_.getRawParameterValue("freeze");
    }

    // ── Audio ────────────────────────────────────────────────────────────
    void prepareToPlay(double sampleRate, int) override {
        kernel_.Init(static_cast<float>(sampleRate));
        for (int i = 0; i < kNumFloatParams; ++i) applied_[i] = -1.0e9f;
        appliedAlgo_ = -1; appliedFreeze_ = -1;
    }
    void releaseResources() override {}

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        const auto out = layouts.getMainOutputChannelSet();
        const auto in = layouts.getMainInputChannelSet();
        if (out != juce::AudioChannelSet::stereo()) return false;
        return in == juce::AudioChannelSet::stereo() || in == juce::AudioChannelSet::mono();
    }

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
        juce::ScopedNoDenormals noDenormals;
        pushParameters();
        const int frames = buffer.getNumSamples();
        const int inChannels = getTotalNumInputChannels();
        // De kern leest in[n] vóór hij out[n] schrijft, dus in-place is veilig.
        const float* in[2] = { buffer.getReadPointer(0), inChannels > 1 ? buffer.getReadPointer(1) : nullptr };
        float* out[2] = { buffer.getWritePointer(0), buffer.getWritePointer(1) };
        kernel_.Process(in, out, frames);
    }

    // ── Bediening ────────────────────────────────────────────────────────
    juce::AudioProcessorEditor* createEditor() override { return new juce::GenericAudioProcessorEditor(*this); }
    bool hasEditor() const override { return true; }

    // ── Toestand ─────────────────────────────────────────────────────────
    void getStateInformation(juce::MemoryBlock& dest) override {
        if (auto xml = state_.copyState().createXml()) copyXmlToBinary(*xml, dest);
    }
    void setStateInformation(const void* data, int size) override {
        if (auto xml = getXmlFromBinary(data, size))
            if (xml->hasTagName(state_.state.getType())) state_.replaceState(juce::ValueTree::fromXml(*xml));
    }

    // ── Naam en zo ───────────────────────────────────────────────────────
    const juce::String getName() const override { return "MMB HALL"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 30.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout layout() {
        juce::AudioProcessorValueTreeState::ParameterLayout l;
        l.add(std::make_unique<juce::AudioParameterChoice>(
            juce::ParameterID { "algo", 1 }, "Algorithm",
            juce::StringArray { "Hall", "Room", "Chamber", "Random Hall" }, 0));
        for (const auto& p : kParams) {
            juce::NormalisableRange<float> range(p.min, p.max);
            if (p.skewMid > 0.0f) range.setSkewForCentre(p.skewMid);
            l.add(std::make_unique<juce::AudioParameterFloat>(
                juce::ParameterID { p.id, 1 }, p.name, range, p.def,
                juce::AudioParameterFloatAttributes().withLabel(p.unit)));
        }
        l.add(std::make_unique<juce::AudioParameterBool>(juce::ParameterID { "freeze", 1 }, "Freeze", false));
        return l;
    }

    // Alleen doorgeven wat veranderd is: setControl rekent de demping opnieuw uit.
    void pushParameters() {
        for (int i = 0; i < kNumFloatParams; ++i) {
            const float v = floats_[i]->load();
            if (v != applied_[i]) { kernel_.setControl(kParams[i].control, v); applied_[i] = v; }
        }
        const int algo = static_cast<int>(algo_->load() + 0.5f);
        if (algo != appliedAlgo_) { kernel_.setControl(Kernel::Algo, static_cast<float>(algo)); appliedAlgo_ = algo; }
        const int freeze = freeze_->load() >= 0.5f ? 1 : 0;
        if (freeze != appliedFreeze_) { kernel_.setControl(Kernel::Freeze, static_cast<float>(freeze)); appliedFreeze_ = freeze; }
    }

    juce::AudioProcessorValueTreeState state_;
    std::atomic<float>* floats_[kNumFloatParams] = {};
    std::atomic<float>* algo_ = nullptr;
    std::atomic<float>* freeze_ = nullptr;
    float applied_[kNumFloatParams] = {};
    int appliedAlgo_ = -1, appliedFreeze_ = -1;
    Kernel kernel_;
};

}  // namespace

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new HallProcessor(); }
