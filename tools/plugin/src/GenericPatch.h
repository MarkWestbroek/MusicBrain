#pragma once
// MMB Patch (doc/plans/plugin-patches.md §5, stap 4): één plugin voor elke
// patch. Alle wasm-modules zitten erin (genericModule, gegenereerd door
// editor/scripts/pluginPatches.ts); welke patch klinkt, kiest de bediening
// (plugin-ui) en geeft ze door als configuratie:
//
//   { "json": <motor-JSON, zoals een vaste patch-plugin hem inbakt>,
//     "slots": [ { "label", "targets": [[module, knop], ...],
//                  "spec": { kind, min, max, def, interval, skewMid, choices, unit } } ] }
//
// (patchPluginConfig in editor/src/modular-mb/patchPluginConfig.ts.)
//
// Parameters: PATCH_SLOTS vaste slots van 0 tot 1 (s001..). Slot i is de
// i-de knop van de patch (fronts eerst); naam en tekst in de DAW komen van
// die knop, de omrekening is juce::NormalisableRange zoals toSlot/fromSlot
// in de bediening. De configuratie en de bediening-JSON (de patch zelf)
// gaan mee in de projecttoestand, zodat een project zonder venster weer
// dezelfde patch speelt.
//
// Een nieuwe patch bouwt de motor op de message-thread en wisselt hem onder
// de callback-lock; het audioblok wacht alleen op het verwisselen.

#include "HostProcessor.h"
#include "PatchEngine.h"

#include <cctype>
#include <cstdlib>
#include <memory>
#include <utility>

namespace mmb_plugin {

/** Uit de gegenereerde patchgeneric_plugin.cpp: elke wasm-module. */
const W2cVtable* genericModule(const std::string& typeId);

/** Eén slot: welke knoppen hij zet en hoe 0..1 een knopwaarde wordt. */
struct PatchSlot {
    enum Kind { Float, Choice, Bool };
    Kind kind = Float;
    juce::String label, unit;
    juce::NormalisableRange<float> range { 0.0f, 1.0f };
    juce::StringArray choices;
    float def = 0.0f;   // in de eenheid van de knop
    std::vector<std::pair<std::string, std::string>> targets;

    float value(float p) const {
        p = juce::jlimit(0.0f, 1.0f, p);
        switch (kind) {
            case Bool:   return p >= 0.5f ? 1.0f : 0.0f;
            case Choice: return std::round(p * range.end);
            default:     return range.snapToLegalValue(range.convertFrom0to1(p));
        }
    }
    float norm(float v) const {
        switch (kind) {
            case Bool:   return v >= 0.5f ? 1.0f : 0.0f;
            case Choice: return range.end > 0 ? juce::jlimit(0.0f, 1.0f, std::round(v) / range.end) : 0.0f;
            default:     return range.convertTo0to1(juce::jlimit(range.start, range.end, v));
        }
    }
    /** Tekst zoals een DAW hem laat intikken ("1500", "Saw", "aan") → 0..1; < 0 = onbekend. */
    float fromText(const juce::String& t) const {
        const juce::String x = t.trim();
        switch (kind) {
            case Bool:   return x.equalsIgnoreCase("aan") || x.equalsIgnoreCase("on") || x.getFloatValue() >= 0.5f ? 1.0f : 0.0f;
            case Choice: {
                const int i = choices.indexOf(x, true);
                return norm(i >= 0 ? static_cast<float>(i) : x.getFloatValue());
            }
            default:     return x.containsAnyOf("0123456789") ? norm(x.getFloatValue()) : -1.0f;
        }
    }
    juce::String text(float p) const {
        const float v = value(p);
        switch (kind) {
            case Bool:   return v >= 0.5f ? "aan" : "uit";
            case Choice: return choices[static_cast<int>(v)];
            default: {
                const int dec = range.interval >= 1.0f ? 0 : std::abs(v) >= 100.0f ? 0 : std::abs(v) >= 10.0f ? 1 : 2;
                return juce::String(v, dec) + (unit.isNotEmpty() ? " " + unit : juce::String());
            }
        }
    }
};

class GenericPatchHost {
public:
    static constexpr bool kShared = false;
    static constexpr bool kBank = false;
    static constexpr bool kRawMidi = true;

    // Poorten: niets in, L/R uit (zoals PatchHost).
    int numInputs() const { return 0; }
    const char* inputId(int) const { return ""; }
    int inputKind(int) const { return kPortAudio; }
    float* inBuf(int) { return nullptr; }
    void setConnected(int, int) {}
    int numOutputs() const { return 2; }
    int outputKind(int) const { return kPortAudio; }
    const float* outBuf(int i) const { return out_[i]; }
    bool hasBank() const { return false; }

    /** "s001" → 0. */
    int controlIndex(const char* id) const {
        return id[0] == 's' && std::isdigit(static_cast<unsigned char>(id[1])) ? std::atoi(id + 1) - 1 : -1;
    }
    void setControl(int c, float p) {
        if (!engine_ || c < 0 || static_cast<std::size_t>(c) >= slots_.size()) return;
        const PatchSlot& s = slots_[static_cast<std::size_t>(c)];
        const float v = s.value(p);
        for (const auto& [mod, ctl] : s.targets) engine_->setControl(mod, ctl, v);
    }

    float setRate(float) { return static_cast<float>(PatchEngine::kRate); }
    void init() {}   // de patch komt via swap()
    float nativeRate() const { return static_cast<float>(PatchEngine::kRate); }
    int block() const { return PatchEngine::kBlock; }
    bool process(int) {
        if (!engine_) return false;
        engine_->process(out_[0], out_[1]);
        return true;
    }
    const char* typeId() const { return "patch_generic"; }
    void midiRaw(const juce::MidiMessage& m, double nativeOffset) { if (engine_) engine_->midi(m, engine_->now() + nativeOffset); }

    /** Andere motor en slots (onder de callback-lock). De oude komen terug in de argumenten. */
    void swap(std::unique_ptr<PatchEngine>& engine, std::vector<PatchSlot>& slots) {
        std::swap(engine_, engine);
        std::swap(slots_, slots);
    }

private:
    std::unique_ptr<PatchEngine> engine_;
    std::vector<PatchSlot> slots_;
    float out_[2][PatchEngine::kBlock] = {};
};

class GenericPatchProcessor final : public HostProcessor<GenericPatchHost> {
public:
    explicit GenericPatchProcessor(const ModuleSpec& spec) : HostProcessor(spec, true) {}

    juce::String slotName(int i) const override {
        const juce::ScopedLock sl(lock_);
        return i >= 0 && i < static_cast<int>(slots_.size()) ? slots_[static_cast<std::size_t>(i)].label : juce::String("-");
    }
    juce::String slotText(int i, float v) const override {
        const juce::ScopedLock sl(lock_);
        return i >= 0 && i < static_cast<int>(slots_.size()) ? slots_[static_cast<std::size_t>(i)].text(v) : juce::String("-");
    }

    float slotValueFromText(int i, const juce::String& t) const override {
        const juce::ScopedLock sl(lock_);
        return i >= 0 && i < static_cast<int>(slots_.size()) ? slots_[static_cast<std::size_t>(i)].fromText(t) : -1.0f;
    }

    juce::var patchGet() const override {
        const juce::ScopedLock sl(lock_);
        auto* o = new juce::DynamicObject();
        o->setProperty("name", name_);
        o->setProperty("ui", ui_);
        o->setProperty("error", error_);
        return juce::var(o);
    }
    juce::var patchLoad(const juce::String& config, const juce::String& ui, const juce::String& name) override {
        juce::String error;
        const bool ok = load(config, ui, name, true, error);
        auto* o = new juce::DynamicObject();
        o->setProperty("ok", ok);
        o->setProperty("error", error);
        return juce::var(o);
    }

    void addToState(juce::ValueTree& t) const override {
        const juce::ScopedLock sl(lock_);
        if (config_.isEmpty()) return;
        t.setProperty("patchConfig", config_, nullptr);
        t.setProperty("patchUi", ui_, nullptr);
        t.setProperty("patchName", name_, nullptr);
    }
    void restoredState(const juce::ValueTree& t) override {
        const juce::String config = t.getProperty("patchConfig").toString();
        if (config.isEmpty()) return;
        juce::String error;
        // De parameters staan al goed (uit de toestand): niet op de beginstand
        // zetten, behalve als de toestand daarom vraagt (MmbPluginCheck patchstate=).
        load(config, t.getProperty("patchUi").toString(), t.getProperty("patchName").toString(), static_cast<bool>(t.getProperty("patchDefaults", false)), error);
    }

private:
    /** Configuratie → motor en slots; @p defaults: de slots op de stand van de patch zetten. */
    bool load(const juce::String& config, const juce::String& ui, const juce::String& name, bool defaults, juce::String& error) {
        const juce::var root = juce::JSON::parse(config);
        if (!root.isObject()) { error = "geen geldige patchconfiguratie"; return fail(error); }
        std::vector<PatchSlot> slots;
        if (auto* arr = root["slots"].getArray()) {
            for (const auto& s : *arr) {
                if (static_cast<int>(slots.size()) >= static_cast<int>(params().size())) break;
                PatchSlot ps;
                const juce::var sp = s["spec"];
                const juce::String kind = sp["kind"].toString();
                ps.kind = kind == "choice" ? PatchSlot::Choice : kind == "bool" ? PatchSlot::Bool : PatchSlot::Float;
                ps.label = s["label"].toString();
                ps.unit = sp["unit"].toString();
                const float mn = static_cast<float>(static_cast<double>(sp["min"])), mx = static_cast<float>(static_cast<double>(sp["max"]));
                ps.range = juce::NormalisableRange<float>(mn, mx > mn ? mx : mn + 1.0f, static_cast<float>(static_cast<double>(sp["interval"])));
                const float mid = static_cast<float>(static_cast<double>(sp["skewMid"]));
                if (ps.kind == PatchSlot::Float && mid > mn && mid < mx) ps.range.setSkewForCentre(mid);
                if (auto* ch = sp["choices"].getArray()) for (const auto& c : *ch) ps.choices.add(c.toString());
                ps.def = static_cast<float>(static_cast<double>(sp["def"]));
                if (auto* tg = s["targets"].getArray())
                    for (const auto& t : *tg) ps.targets.emplace_back(t[0].toString().toStdString(), t[1].toString().toStdString());
                slots.push_back(std::move(ps));
            }
        }
        auto engine = std::make_unique<PatchEngine>();
        if (!engine->load(root["json"].toString(), [](const std::string& t) { return genericModule(t); }, error)) return fail(error);
        std::vector<PatchSlot> forHost = slots;
        {
            const juce::ScopedLock cl(getCallbackLock());
            host().swap(engine, forHost);
        }
        {
            const juce::ScopedLock sl(lock_);
            slots_ = std::move(slots);
            config_ = config; ui_ = ui; name_ = name; error_.clear();
        }
        // engine en forHost houden nu de oude motor; die gaat hier weg, buiten de lock.
        if (defaults) {
            const auto& all = getParameters();
            for (int i = 0; i < all.size(); ++i) {
                const float p = i < static_cast<int>(slots_.size()) ? slots_[static_cast<std::size_t>(i)].norm(slots_[static_cast<std::size_t>(i)].def) : 0.0f;
                all[i]->setValueNotifyingHost(p);
            }
        }
        requestRepush();
        updateHostDisplay(ChangeDetails().withParameterInfoChanged(true));
        std::printf("[mmb] patch %s: %d knoppen\n", name.toRawUTF8(), static_cast<int>(slots_.size()));
        std::fflush(stdout);
        return true;
    }
    bool fail(const juce::String& e) {
        const juce::ScopedLock sl(lock_);
        error_ = e;
        std::printf("[mmb] patch laadt niet: %s\n", e.toRawUTF8());
        std::fflush(stdout);
        return false;
    }

    juce::CriticalSection lock_;
    std::vector<PatchSlot> slots_;   // voor namen en tekst in de DAW (de gastheer heeft een eigen kopie)
    juce::String config_, ui_, name_, error_;
};

}  // namespace mmb_plugin
