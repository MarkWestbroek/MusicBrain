#pragma once
// Gedeelde romp voor de MMB-plugins: parameters uit de gegenereerde
// ModuleSpec (MmbParamSpec.h), toestand, en de bediening = het editorpaneel
// in een webview (editor/src/plugin-ui, als binary data MmbWebUi). Een
// module levert alleen nog: applyControl (id → kern), prepare en render.
//
// De waarden die applyControl krijgt zijn die van het paneel: knop in zijn
// eenheid, schakelaar als index, toggle 0/1 — dezelfde afspraak als
// mmb_on_control in de wasm-gastheren.

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <optional>
#include <vector>

#include "MmbParamSpec.h"
#include "MmbWebUi.h"

namespace mmb_plugin {

class MmbProcessor : public juce::AudioProcessor {
public:
    MmbProcessor(const ModuleSpec& spec, bool synth)
        : AudioProcessor(synth
              ? BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)
              : BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                 .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
          spec_(spec), synth_(synth),
          state_(*this, nullptr, juce::Identifier(juce::String(spec.typeId).toUpperCase()), layout(spec)) {
        raw_.resize(static_cast<std::size_t>(spec.count));
        applied_.assign(static_cast<std::size_t>(spec.count), std::nanf(""));
        for (int i = 0; i < spec.count; ++i) raw_[static_cast<std::size_t>(i)] = state_.getRawParameterValue(spec.params[i].id);
    }

    // ── Door de module in te vullen ──────────────────────────────────────
    virtual void applyControl(const char* id, float value) = 0;
    virtual void prepare(double sampleRate, int maxBlock) = 0;
    virtual void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) = 0;

    // ── AudioProcessor ───────────────────────────────────────────────────
    void prepareToPlay(double sampleRate, int maxBlock) override {
        prepare(sampleRate, maxBlock);
        for (auto& a : applied_) a = std::nanf("");
    }
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo()) return false;
        if (synth_) return true;
        const auto in = layouts.getMainInputChannelSet();
        return in == juce::AudioChannelSet::stereo() || in == juce::AudioChannelSet::mono();
    }
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        juce::ScopedNoDenormals noDenormals;
        pushParameters();
        render(buffer, midi);
    }
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    void getStateInformation(juce::MemoryBlock& dest) override {
        if (auto xml = state_.copyState().createXml()) copyXmlToBinary(*xml, dest);
    }
    void setStateInformation(const void* data, int size) override {
        if (auto xml = getXmlFromBinary(data, size))
            if (xml->hasTagName(state_.state.getType())) state_.replaceState(juce::ValueTree::fromXml(*xml));
    }
    const juce::String getName() const override { return juce::String("MMB ") + spec_.name; }
    bool acceptsMidi() const override { return synth_; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return synth_ ? 10.0 : 30.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    const ModuleSpec& spec() const { return spec_; }
    juce::AudioProcessorValueTreeState& apvts() { return state_; }

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout layout(const ModuleSpec& spec) {
        juce::AudioProcessorValueTreeState::ParameterLayout l;
        for (int i = 0; i < spec.count; ++i) {
            const ParamSpec& p = spec.params[i];
            const juce::ParameterID pid { p.id, 1 };
            switch (p.kind) {
                case ParamKind::Float: {
                    juce::NormalisableRange<float> range(p.min, p.max, p.interval);
                    if (p.skewMid > 0.0f) range.setSkewForCentre(p.skewMid);
                    l.add(std::make_unique<juce::AudioParameterFloat>(pid, p.name, range, p.def,
                        juce::AudioParameterFloatAttributes().withLabel(p.unit)));
                    break;
                }
                case ParamKind::Choice: {
                    juce::StringArray choices;
                    choices.addTokens(juce::String(p.choices), "|", "");
                    l.add(std::make_unique<juce::AudioParameterChoice>(pid, p.name, choices, static_cast<int>(p.def + 0.5f)));
                    break;
                }
                case ParamKind::Bool:
                    l.add(std::make_unique<juce::AudioParameterBool>(pid, p.name, p.def >= 0.5f));
                    break;
            }
        }
        return l;
    }

    // Alleen doorgeven wat veranderd is: een kern rekent bij setControl vaak
    // tabellen opnieuw uit.
    void pushParameters() {
        for (int i = 0; i < spec_.count; ++i) {
            const float v = raw_[static_cast<std::size_t>(i)]->load();
            float& a = applied_[static_cast<std::size_t>(i)];
            if (v != a) { applyControl(spec_.params[i].id, v); a = v; }
        }
    }

    const ModuleSpec& spec_;
    const bool synth_;
    juce::AudioProcessorValueTreeState state_;
    std::vector<std::atomic<float>*> raw_;
    std::vector<float> applied_;
};

// ── De bediening: het editorpaneel in een webview ────────────────────────
inline const char* mimeFor(const juce::String& name) {
    if (name.endsWith(".html")) return "text/html";
    if (name.endsWith(".js")) return "text/javascript";
    if (name.endsWith(".css")) return "text/css";
    if (name.endsWith(".svg")) return "image/svg+xml";
    if (name.endsWith(".json")) return "application/json";
    if (name.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
}

/** Serveert de gebundelde pagina (MmbWebUi) aan de webview. */
inline std::optional<juce::WebBrowserComponent::Resource> webResource(const juce::String& url) {
    juce::String name = url.fromFirstOccurrenceOf("/", false, false).upToFirstOccurrenceOf("?", false, false);
    if (name.isEmpty()) name = "index.html";
    for (int i = 0; i < MmbWebUi::namedResourceListSize; ++i) {
        if (juce::String(MmbWebUi::originalFilenames[i]) != name) continue;
        int size = 0;
        const char* data = MmbWebUi::getNamedResource(MmbWebUi::namedResourceList[i], size);
        if (!data) break;
        std::vector<std::byte> bytes(static_cast<std::size_t>(size));
        std::memcpy(bytes.data(), data, static_cast<std::size_t>(size));
        return juce::WebBrowserComponent::Resource { std::move(bytes), mimeFor(name) };
    }
    return std::nullopt;
}

class MmbWebEditor final : public juce::AudioProcessorEditor {
public:
    static constexpr double kPxPerMm = 4.0;       // PX_PER_MM in plugin-ui/main.tsx
    static constexpr double kMmPerHp = 5.08, kPanelHeightMm = 128.5;

    explicit MmbWebEditor(MmbProcessor& p) : AudioProcessorEditor(p) {
        const ModuleSpec& spec = p.spec();
        for (int i = 0; i < spec.count; ++i) {
            const ParamSpec& ps = spec.params[i];
            switch (ps.kind) {
                case ParamKind::Float:  sliders_.push_back(std::make_unique<juce::WebSliderRelay>(ps.id)); break;
                case ParamKind::Choice: combos_.push_back(std::make_unique<juce::WebComboBoxRelay>(ps.id)); break;
                case ParamKind::Bool:   toggles_.push_back(std::make_unique<juce::WebToggleButtonRelay>(ps.id)); break;
            }
        }
        auto options = juce::WebBrowserComponent::Options {}
            .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
            .withWinWebView2Options(juce::WebBrowserComponent::Options::WinWebView2 {}
                .withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("MusicBrain-webview"))
                .withBackgroundColour(juce::Colour(0xff0b0d12)))
            .withNativeIntegrationEnabled()
            // De pagina meldt wat hij ontvangt (stdout van de gastheer; mmb-plugin-check laat het zien).
            .withNativeFunction("mmbLog", [](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                std::printf("[ui] %s\n", args.size() > 0 ? args[0].toString().toRawUTF8() : "");
                std::fflush(stdout);
                complete({});
            })
            .withResourceProvider(webResource);
        for (auto& r : sliders_) options = options.withOptionsFrom(*r);
        for (auto& r : combos_) options = options.withOptionsFrom(*r);
        for (auto& r : toggles_) options = options.withOptionsFrom(*r);
        browser_ = std::make_unique<juce::WebBrowserComponent>(options);
        addAndMakeVisible(*browser_);

        auto& state = p.apvts();
        std::size_t s = 0, c = 0, t = 0;
        for (int i = 0; i < spec.count; ++i) {
            const ParamSpec& ps = spec.params[i];
            auto* param = state.getParameter(ps.id);
            switch (ps.kind) {
                case ParamKind::Float:  sliderAtt_.push_back(std::make_unique<juce::WebSliderParameterAttachment>(*param, *sliders_[s++], nullptr)); break;
                case ParamKind::Choice: comboAtt_.push_back(std::make_unique<juce::WebComboBoxParameterAttachment>(*param, *combos_[c++], nullptr)); break;
                case ParamKind::Bool:   toggleAtt_.push_back(std::make_unique<juce::WebToggleButtonParameterAttachment>(*param, *toggles_[t++], nullptr)); break;
            }
        }
        setSize(static_cast<int>(std::lround(spec.hp * kMmPerHp * kPxPerMm)), static_cast<int>(std::lround(kPanelHeightMm * kPxPerMm)));
        browser_->goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "index.html?type=" + spec.typeId);
    }
    void resized() override { if (browser_) browser_->setBounds(getLocalBounds()); }

private:
    // Volgorde telt: relays vóór de browser, attachments erna.
    std::vector<std::unique_ptr<juce::WebSliderRelay>> sliders_;
    std::vector<std::unique_ptr<juce::WebComboBoxRelay>> combos_;
    std::vector<std::unique_ptr<juce::WebToggleButtonRelay>> toggles_;
    std::unique_ptr<juce::WebBrowserComponent> browser_;
    std::vector<std::unique_ptr<juce::WebSliderParameterAttachment>> sliderAtt_;
    std::vector<std::unique_ptr<juce::WebComboBoxParameterAttachment>> comboAtt_;
    std::vector<std::unique_ptr<juce::WebToggleButtonParameterAttachment>> toggleAtt_;
};

inline juce::AudioProcessorEditor* MmbProcessor::createEditor() { return new MmbWebEditor(*this); }

inline bool is(const char* id, const char* name) { return std::strcmp(id, name) == 0; }

}  // namespace mmb_plugin
