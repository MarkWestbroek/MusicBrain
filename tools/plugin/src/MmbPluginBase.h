#pragma once
// Gedeelde romp voor de MMB-plugins: parameters uit de gegenereerde
// ModuleSpec (MmbParamSpec.h) plus eventuele extra parameters (CV-ingangen),
// toestand, en de bediening = het editorpaneel in een webview
// (editor/src/plugin-ui, als binary data MmbWebUi). Een module levert alleen
// nog: applyControl (id → kern), prepare en render.
//
// De waarden die applyControl krijgt zijn die van het paneel: knop in zijn
// eenheid, schakelaar als index, toggle 0/1 — dezelfde afspraak als
// mmb_on_control in de wasm-gastheren.
//
// Banken (sampler, TAPE STRIP): een module die `hasBank()` meldt, krijgt een
// `.mmbs` op twee manieren. De Bank-knop kiest zoals op de Teensy een bestand
// uit de bankmap (bankDir(): index.json `defaults`, dezelfde als
// editor/public/banks); een eigen bank (bestandskiezer in het paneel) gaat
// mee in de projecttoestand en gaat voor de knop. Laden gebeurt op de
// message-thread onder de callback-lock: het audioblok wacht zolang.

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "MmbParamSpec.h"
#include "MmbWebUi.h"

namespace mmb_plugin {

inline const char* keep(const std::string& s);

/** Map met de standaardbanken (zoals de SD-kaart van de Teensy). */
inline juce::File bankDir() {
    auto base = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory);
#if JUCE_MAC
    base = base.getChildFile("Application Support");
#endif
    return base.getChildFile("MusicBrain").getChildFile("banks");
}

/** Banknaam uit de kop van een `.mmbs` (bytes 16..44), leeg als het geen bank is. */
inline juce::String mmbsName(const void* data, std::size_t size) {
    const char* b = static_cast<const char*>(data);
    if (size < 44 || std::memcmp(b, "MMBS", 4) != 0) return {};
    return juce::String::fromUTF8(b + 16, static_cast<int>(strnlen(b + 16, 28)));
}

/** Naam van de bank op Bank-knop @p n ("" = geen): index.json `files[].name`,
 *  anders de kop van het bestand. Onthouden tot index.json verandert. */
inline juce::String bankKnobName(int n) {
    static juce::CriticalSection lock;
    static juce::Time stamp;
    static std::map<int, juce::String> names;
    const juce::ScopedLock sl(lock);
    const juce::File dir = bankDir(), indexFile = dir.getChildFile("index.json");
    const juce::Time t = indexFile.getLastModificationTime();
    if (t != stamp) { names.clear(); stamp = t; }
    if (auto it = names.find(n); it != names.end()) return it->second;
    const juce::var index = juce::JSON::parse(indexFile);
    const juce::String file = index["defaults"][juce::Identifier(juce::String(n))].toString();
    juce::String name;
    if (file.isNotEmpty()) {
        if (const auto* files = index["files"].getArray())
            for (const auto& f : *files) if (f["file"].toString() == file) name = f["name"].toString();
        if (name.isEmpty()) {
            juce::MemoryBlock head;
            if (auto in = dir.getChildFile(file).createInputStream()) in->readIntoMemoryBlock(head, 44);
            name = mmbsName(head.getData(), head.getSize());
        }
        if (name.isEmpty()) name = juce::File(file).getFileNameWithoutExtension();
    }
    names[n] = name;
    return name;
}

class MmbProcessor : public juce::AudioProcessor, public juce::ChangeBroadcaster, private juce::AsyncUpdater {
public:
    /** @p extra: parameters bovenop het paneel (bijv. CV-ingangen); hun
     *  id/name/choices-teksten moeten de plugin overleven (statische opslag). */
    MmbProcessor(const ModuleSpec& spec, bool synth, const std::vector<ParamSpec>& extra = {})
        : AudioProcessor(synth
              ? BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)
              : BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true)
                                 .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
          spec_(spec), synth_(synth), params_(merge(spec, extra)),
          state_(*this, nullptr, juce::Identifier(juce::String(spec.typeId).toUpperCase()), layout(params_, this)) {
        raw_.resize(params_.size());
        applied_.assign(params_.size(), std::nanf(""));
        for (std::size_t i = 0; i < params_.size(); ++i) raw_[i] = state_.getRawParameterValue(params_[i].id);
        for (const ParamSpec& e : extra) cvPorts_.push_back(e.id);
    }

    // ── Door de module in te vullen ──────────────────────────────────────
    virtual void applyControl(const char* id, float value) = 0;
    /** Een CV-/gate-ingang (de extra parameters), op poortnaam. */
    virtual void applyCv(const char* /*port*/, float /*value*/) {}
    virtual void prepare(double sampleRate, int maxBlock) = 0;
    virtual void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) = 0;
    /** Kan deze module een `.mmbs` laden? */
    virtual bool hasBank() const { return false; }
    /** Zet een `.mmbs` in de module (onder de callback-lock); false + @p error bij een fout. */
    virtual bool applyBank(const void* /*data*/, std::size_t /*size*/, juce::String& error) { error = "geen bank"; return false; }

    // ── Bank: toestand voor het paneel ───────────────────────────────────
    struct BankInfo { juce::String name, error; bool own = false; int knob = -1; };
    BankInfo bankInfo() const { const juce::ScopedLock sl(bankLock_); return bankInfo_; }
    /** Tekst van de Bank-knop voor de DAW: "03 · Harp", met een eigen bank "Eigen · <naam>". */
    juce::String bankText(int knob) const {
        const juce::String dot = juce::String::fromUTF8(" \xc2\xb7 ");   // " · "
        {
            const juce::ScopedLock sl(bankLock_);
            if (ownBank_.getSize() > 0) return "Eigen" + dot + (bankInfo_.own && bankInfo_.name.isNotEmpty() ? bankInfo_.name : ownName_);
        }
        const juce::String name = bankKnobName(knob);
        return juce::String(knob).paddedLeft('0', 2) + dot + (name.isEmpty() ? juce::String("(leeg)") : name);
    }
    /** Eigen bank uit een bestand; blijft in het project. */
    void loadOwnBank(const juce::File& file) {
        juce::MemoryBlock data;
        if (!file.loadFileAsData(data)) { setBankError("kan " + file.getFileName() + " niet lezen"); return; }
        if (data.getSize() < 44 || std::memcmp(data.getData(), "MMBS", 4) != 0) {
            setBankError(file.getFileName() + " is geen .mmbs-bank"); return;
        }
        { const juce::ScopedLock sl(bankLock_); ownBank_ = std::move(data); ownName_ = file.getFileNameWithoutExtension(); ownApplied_ = false; }
        applyCurrentBank();
    }
    /** Terug naar de bank van de knop. */
    void clearOwnBank() {
        { const juce::ScopedLock sl(bankLock_); ownBank_.reset(); ownName_.clear(); ownApplied_ = false; loadedKnob_ = -1; }
        applyCurrentBank();
    }

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
    // Zonder eigen bank: het gewone JUCE-formaat (XML). Met eigen bank:
    // "MMBP", lengte + XML-blok, naam, lengte + de .mmbs zelf.
    void getStateInformation(juce::MemoryBlock& dest) override {
        juce::MemoryBlock xmlBlock;
        if (auto xml = state_.copyState().createXml()) copyXmlToBinary(*xml, xmlBlock);
        const juce::ScopedLock sl(bankLock_);
        if (ownBank_.getSize() == 0) { dest = xmlBlock; return; }
        juce::MemoryOutputStream out(dest, false);
        out.write("MMBP", 4);
        out.writeInt(static_cast<int>(xmlBlock.getSize()));
        out << xmlBlock;
        out.writeString(ownName_);
        out.writeInt64(static_cast<juce::int64>(ownBank_.getSize()));
        out << ownBank_;
    }
    void setStateInformation(const void* data, int size) override {
        juce::MemoryBlock bank;
        juce::String bankName;
        if (size > 8 && std::memcmp(data, "MMBP", 4) == 0) {
            juce::MemoryInputStream in(data, static_cast<std::size_t>(size), false);
            in.skipNextBytes(4);
            juce::MemoryBlock xmlBlock;
            in.readIntoMemoryBlock(xmlBlock, in.readInt());
            restoreXml(xmlBlock.getData(), static_cast<int>(xmlBlock.getSize()));
            bankName = in.readString();
            in.readIntoMemoryBlock(bank, static_cast<size_t>(in.readInt64()));
        } else restoreXml(data, size);
        if (!hasBank()) return;
        { const juce::ScopedLock sl(bankLock_); ownBank_ = std::move(bank); ownName_ = bankName; ownApplied_ = false; loadedKnob_ = -1; }
        applyCurrentBank();
    }
    const juce::String getName() const override { return juce::String("MMB ") + spec_.name; }
    bool acceptsMidi() const override { return synth_; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return synth_ ? 10.0 : 30.0; }
    // Programma 0 is de beginstand van het paneel, daarna de fabriekspresets.
    int getNumPrograms() override { return 1 + spec_.presetCount; }
    int getCurrentProgram() override { return program_; }
    void setCurrentProgram(int index) override {
        if (index < 0 || index > spec_.presetCount) return;
        program_ = index;
        const PresetSpec* preset = index > 0 ? &spec_.presets[index - 1] : nullptr;
        for (const ParamSpec& ps : params_) {
            float v = ps.def;
            if (preset)
                for (int i = 0; i < preset->count; ++i)
                    if (std::strcmp(preset->values[i].id, ps.id) == 0) v = preset->values[i].value;
            if (auto* param = state_.getParameter(ps.id))
                param->setValueNotifyingHost(param->convertTo0to1(v));
        }
    }
    const juce::String getProgramName(int index) override {
        if (index == 0) return "Standaard";
        return index <= spec_.presetCount ? juce::String::fromUTF8(spec_.presets[index - 1].name) : juce::String();
    }
    void changeProgramName(int, const juce::String&) override {}

    const ModuleSpec& spec() const { return spec_; }
    const std::vector<ParamSpec>& params() const { return params_; }
    bool isSynth() const { return synth_; }
    juce::AudioProcessorValueTreeState& apvts() { return state_; }

private:
    static std::vector<ParamSpec> merge(const ModuleSpec& spec, const std::vector<ParamSpec>& extra) {
        std::vector<ParamSpec> all(spec.params, spec.params + spec.count);
        for (ParamSpec e : extra) {
            // Een ingang die heet als een knop (ACID accent, CLOUDS freeze)
            // krijgt een eigen id: twee parameters met één id botsen (auval).
            for (int i = 0; i < spec.count; ++i)
                if (std::strcmp(spec.params[i].id, e.id) == 0) { e.id = keep(std::string(e.id) + "_in"); break; }
            all.push_back(e);
        }
        return all;
    }

    static juce::AudioProcessorValueTreeState::ParameterLayout layout(const std::vector<ParamSpec>& params, MmbProcessor* self) {
        juce::AudioProcessorValueTreeState::ParameterLayout l;
        for (const ParamSpec& p : params) {
            const juce::ParameterID pid { p.id, 1 };
            switch (p.kind) {
                case ParamKind::Float: {
                    juce::NormalisableRange<float> range(p.min, p.max, p.interval);
                    if (p.skewMid > 0.0f) range.setSkewForCentre(p.skewMid);
                    auto attr = juce::AudioParameterFloatAttributes().withLabel(p.unit);
                    // Bank-knop (sampler, TAPE STRIP): de DAW toont "03 · Harp", of de eigen bank.
                    if (std::strcmp(p.id, "bank") == 0)
                        attr = attr.withLabel("")
                            .withStringFromValueFunction([self](float v, int) { return self->bankText(static_cast<int>(std::lround(v))); })
                            .withValueFromStringFunction([](const juce::String& t) { return t.trimStart().getFloatValue(); });
                    l.add(std::make_unique<juce::AudioParameterFloat>(pid, p.name, range, p.def, attr));
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
        for (std::size_t i = 0; i < params_.size(); ++i) {
            const float v = raw_[i]->load();
            if (v == applied_[i]) continue;
            const std::size_t panel = static_cast<std::size_t>(spec_.count);
            if (i < panel) applyControl(params_[i].id, v);
            else applyCv(cvPorts_[i - panel], v);
            applied_[i] = v;
            // De Bank-knop laadt een bestand: niet op de audiothread.
            if (i < panel && std::strcmp(params_[i].id, "bank") == 0 && hasBank()) {
                bankKnob_.store(static_cast<int>(std::lround(v)));
                triggerAsyncUpdate();
            }
        }
    }

    void restoreXml(const void* data, int size) {
        if (auto xml = getXmlFromBinary(data, size))
            if (xml->hasTagName(state_.state.getType())) state_.replaceState(juce::ValueTree::fromXml(*xml));
    }

    void handleAsyncUpdate() override { applyCurrentBank(); }

    void setBankError(const juce::String& e) {
        { const juce::ScopedLock sl(bankLock_); bankInfo_.error = e; }
        sendChangeMessage();
    }

    /** Eigen bank als die er is, anders het bestand van de Bank-knop. Message-thread. */
    void applyCurrentBank() {
        juce::MemoryBlock fromFile;
        const void* data = nullptr;
        std::size_t size = 0;
        juce::String name;
        bool own = false;
        const int knob = bankKnob_.load() < 0 ? 0 : bankKnob_.load();
        {
            const juce::ScopedLock sl(bankLock_);
            own = ownBank_.getSize() > 0;
            if (own ? ownApplied_ : knob == loadedKnob_) return;   // zit er al in
        }
        juce::MemoryBlock ownCopy;
        if (own) {
            const juce::ScopedLock sl(bankLock_);
            ownCopy = ownBank_;
            name = ownName_;
            data = ownCopy.getData(); size = ownCopy.getSize();
        } else {
            const juce::File file = knobFile(knob);
            if (!file.existsAsFile()) {
                const juce::ScopedLock sl(bankLock_);
                bankInfo_ = { {}, "geen bank " + juce::String(knob) + " in " + bankDir().getFullPathName(), false, knob };
                loadedKnob_ = knob;
                sendChangeMessage();
                return;
            }
            if (!file.loadFileAsData(fromFile)) { setBankError("kan " + file.getFileName() + " niet lezen"); return; }
            data = fromFile.getData(); size = fromFile.getSize();
            name = file.getFileNameWithoutExtension();
        }
        const juce::String header = mmbsName(data, size);
        if (header.isNotEmpty()) name = header;
        juce::String error;
        bool ok;
        { const juce::ScopedLock cl(getCallbackLock()); ok = applyBank(data, size, error); }
        {
            const juce::ScopedLock sl(bankLock_);
            bankInfo_ = { ok ? name : juce::String(), ok ? juce::String() : error, own, knob };
            if (own) ownApplied_ = ok; else loadedKnob_ = knob;
        }
        std::printf("[mmb] bank %s: %s\n", own ? "eigen" : juce::String(knob).toRawUTF8(), ok ? name.toRawUTF8() : error.toRawUTF8());
        std::fflush(stdout);
        sendChangeMessage();
    }

    /** Bestand bij Bank-knop @p n: index.json `defaults` in de bankmap. */
    static juce::File knobFile(int n) {
        const juce::File dir = bankDir();
        const juce::var index = juce::JSON::parse(dir.getChildFile("index.json"));
        const juce::String file = index["defaults"][juce::Identifier(juce::String(n))].toString();
        return file.isEmpty() ? juce::File() : dir.getChildFile(file);
    }

    const ModuleSpec& spec_;
    const bool synth_;
    std::vector<ParamSpec> params_;
    int program_ = 0;
    juce::AudioProcessorValueTreeState state_;
    std::vector<std::atomic<float>*> raw_;
    std::vector<float> applied_;
    std::vector<const char*> cvPorts_;   // poortnaam per extra parameter

    juce::CriticalSection bankLock_;
    juce::MemoryBlock ownBank_;          // eigen bank (in het project), leeg = de knop
    juce::String ownName_;
    BankInfo bankInfo_;
    bool ownApplied_ = false;            // de eigen bank zit in de module
    int loadedKnob_ = -1;                // welke knopstand er nu in zit
    std::atomic<int> bankKnob_ { -1 };   // gevraagd door de audiothread
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

class MmbWebEditor final : public juce::AudioProcessorEditor, private juce::ChangeListener {
public:
    static constexpr double kPxPerMm = 4.0;       // kleinste schaal; de pagina rekent zelf uit de hoogte
    static constexpr double kStartScale = 1.5, kMaxScale = 4.0;
    static constexpr double kMmPerHp = 5.08, kPanelHeightMm = 128.5;

    explicit MmbWebEditor(MmbProcessor& p) : AudioProcessorEditor(p), mmb_(p) {
        const ModuleSpec& spec = p.spec();
        for (const ParamSpec& ps : p.params()) {
            switch (ps.kind) {
                case ParamKind::Float:  sliders_.push_back(std::make_unique<juce::WebSliderRelay>(ps.id)); break;
                case ParamKind::Choice: combos_.push_back(std::make_unique<juce::WebComboBoxRelay>(ps.id)); break;
                case ParamKind::Bool:   toggles_.push_back(std::make_unique<juce::WebToggleButtonRelay>(ps.id)); break;
            }
        }
        auto options = juce::WebBrowserComponent::Options {}
#if JUCE_WINDOWS
            // Windows: WebView2 (statisch gelinkt, NuGet). Mac: de standaard (WebKit).
            .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
            .withWinWebView2Options(juce::WebBrowserComponent::Options::WinWebView2 {}
                .withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("MusicBrain-webview"))
                .withBackgroundColour(juce::Colour(0xff0b0d12)))
#endif
            .withNativeIntegrationEnabled()
            // De pagina meldt wat hij ontvangt (stdout van de gastheer; mmb-plugin-check laat het zien).
            .withNativeFunction("mmbLog", [](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                std::printf("[ui] %s\n", args.size() > 0 ? args[0].toString().toRawUTF8() : "");
                std::fflush(stdout);
                complete({});
            })
            // Sleephoek in de pagina (de native webview ligt over JUCE's eigen hoek heen).
            .withNativeFunction("mmbResize", [this](const juce::Array<juce::var>& args, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                if (args.size() > 0) setScale(static_cast<double>(args[0]) / (panelH_ * kPxPerMm));
                complete({});
            })
            // Bank (sampler, TAPE STRIP): stand opvragen, eigen bank kiezen of loslaten.
            .withNativeFunction("mmbBankInfo", [this](const juce::Array<juce::var>&, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                complete(bankVar());
            })
            .withNativeFunction("mmbBankChoose", [this](const juce::Array<juce::var>&, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                chooser_ = std::make_unique<juce::FileChooser>("Bank kiezen", bankDir().exists() ? bankDir() : juce::File(), "*.mmbs");
                chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                    [this](const juce::FileChooser& fc) { if (fc.getResult().existsAsFile()) mmb_.loadOwnBank(fc.getResult()); });
                complete({});
            })
            .withNativeFunction("mmbBankClear", [this](const juce::Array<juce::var>&, juce::WebBrowserComponent::NativeFunctionCompletion complete) {
                mmb_.clearOwnBank();
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
        for (const ParamSpec& ps : p.params()) {
            auto* param = state.getParameter(ps.id);
            switch (ps.kind) {
                case ParamKind::Float:  sliderAtt_.push_back(std::make_unique<juce::WebSliderParameterAttachment>(*param, *sliders_[s++], nullptr)); break;
                case ParamKind::Choice: comboAtt_.push_back(std::make_unique<juce::WebComboBoxParameterAttachment>(*param, *combos_[c++], nullptr)); break;
                case ParamKind::Bool:   toggleAtt_.push_back(std::make_unique<juce::WebToggleButtonParameterAttachment>(*param, *toggles_[t++], nullptr)); break;
            }
        }
        // Vergrootbaar met vaste verhouding (gastheer-rand of de hoek in de
        // pagina); de pagina schaalt mee op de hoogte. De schaal staat in de
        // toestand, dus een project heropent op dezelfde grootte.
        // Beginschaal: hooguit ~780 px hoog (een front is hoger dan een module).
        const double start = juce::jmin(kStartScale, 780.0 / ((spec.heightMm > 0 ? spec.heightMm : kPanelHeightMm) * kPxPerMm));
        const double scale = static_cast<double>(p.apvts().state.getProperty("uiScale", start));
        // Patch-plugins geven hun eigen maat (het front); modules zijn hp × 128,5 mm.
        panelH_ = spec.heightMm > 0 ? spec.heightMm : kPanelHeightMm;
        baseW_ = (spec.widthMm > 0 ? spec.widthMm : spec.hp * kMmPerHp) * kPxPerMm;
        setResizable(true, false);
        setResizeLimits(static_cast<int>(std::lround(baseW_)), static_cast<int>(std::lround(panelH_ * kPxPerMm)),
                        static_cast<int>(std::lround(baseW_ * kMaxScale)), static_cast<int>(std::lround(panelH_ * kPxPerMm * kMaxScale)));
        getConstrainer()->setFixedAspectRatio(baseW_ / (panelH_ * kPxPerMm));
        ready_ = true;
        setScale(scale);
        browser_->goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "index.html?type=" + spec.typeId);
        mmb_.addChangeListener(this);
    }
    ~MmbWebEditor() override { mmb_.removeChangeListener(this); }
    void resized() override {
        if (browser_) browser_->setBounds(getLocalBounds());
        if (ready_) static_cast<MmbProcessor&>(processor).apvts().state.setProperty("uiScale", getHeight() / (panelH_ * kPxPerMm), nullptr);
    }

private:
    juce::var bankVar() const {
        auto* o = new juce::DynamicObject();
        const auto info = mmb_.bankInfo();
        o->setProperty("has", mmb_.hasBank());
        o->setProperty("name", info.name);
        o->setProperty("error", info.error);
        o->setProperty("own", info.own);
        o->setProperty("knob", info.knob);
        return juce::var(o);
    }
    void changeListenerCallback(juce::ChangeBroadcaster*) override {
        if (browser_) browser_->emitEventIfBrowserIsVisible("mmbBank", bankVar());
    }

    void setScale(double s) {
        s = juce::jlimit(1.0, kMaxScale, s);
        setSize(static_cast<int>(std::lround(baseW_ * s)), static_cast<int>(std::lround(panelH_ * kPxPerMm * s)));
    }

    MmbProcessor& mmb_;
    std::unique_ptr<juce::FileChooser> chooser_;
    double baseW_ = 0, panelH_ = kPanelHeightMm;
    bool ready_ = false;  // pas na de opbouw de grootte bewaren
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

/** Teksten voor extra parameters: één keer per plugin-DLL, blijven bestaan. */
inline const char* keep(const std::string& s) {
    static std::vector<std::unique_ptr<std::string>> store;
    for (auto& p : store) if (*p == s) return p->c_str();
    store.push_back(std::make_unique<std::string>(s));
    return store.back()->c_str();
}

}  // namespace mmb_plugin
