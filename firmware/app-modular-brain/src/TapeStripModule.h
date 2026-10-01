#pragma once
/**
 * @file TapeStripModule.h
 * @brief Mellotron-mechanica om een gewone samplebank (typeId `tp_mmb_tapestrip`).
 *
 * @details
 * Acht stemmen op dezelfde @ref mmb_dsp::SamplePlayer en dezelfde
 * `SampleBank` (PSRAM/SD) als de sampler, door @ref mmb_dsp::TapeStrip:
 * per toets een bandje van `length` seconden dat na loslaten met een veer
 * terugloopt (`return`), kopcontact bij het indrukken (`contact`),
 * motorbelasting door het aantal spelende stemmen (`motor`), wow/flutter en
 * slijtage (`wear`: ruis, bandbreedte, verzadiging). De `bank`-control laadt
 * dezelfde bank als de sampler; de firmware houdt één bank tegelijk, dus een
 * sampler en een tape-strip met een ander banknummer wisselen elkaar af.
 *
 * Port map (k = 1..8; kale `voct`/`gate`/`vel` = cel 1):
 * | Dir | portId   | Kind  | Betekenis                                  |
 * |-----|----------|-------|--------------------------------------------|
 * | in  | `voct_k` | Cv    | Toonhoogte cel k                            |
 * | in  | `gate_k` | Gate  | Toets in/uit cel k                          |
 * | in  | `vel_k`  | Cv    | Velocity cel k (laagkeuze in de bank)       |
 * | in  | `press`  | Cv    | Gedeelde kussendruk 0..1: lichte vertraging |
 * | in  | `bend`   | Cv    | Gedeelde V/Oct bovenop alle cellen          |
 * | out | `out_l` `out_r` | Audio | Stereo-som                           |
 * | out | `tape`   | Cv    | Positie van het laatst aangeslagen bandje 0..1 |
 * | out | `load`   | Cv    | Motorbelasting 0..1                          |
 *
 * Controls: `bank`, `length`, `return`, `contact`, `motor`, `wow`, `flutter`,
 * `wear`, `level`.
 */
#include "SamplerModule.h"   // SampleBank en SamplerModule::cellOf
#include "mmb_dsp/tape_strip.h"

namespace mmb_link {

class TapeStripStream : public AudioStream {
public:
    static constexpr int kVoices = 8;
    static constexpr int kSubBlock = 32;

    TapeStripStream() : AudioStream(0, nullptr) {
        for (int i = 0; i < kVoices; ++i) { voice_[i].Init(AUDIO_SAMPLE_RATE_EXACT); voice_[i].set_level(1.0f); }
        SampleBank::instance().attachVoices(voice_, kVoices);
        strip_.Init(AUDIO_SAMPLE_RATE_EXACT);
        limiter_.Init(AUDIO_SAMPLE_RATE_EXACT);
        rebind();
    }

    void setBank(int b) {
        if (b < 0) b = 0;
        if (b > 15) b = 15;
        if (b == bank_) return;
        bank_ = b;
        SampleBank::instance().load(bank_);
        rebind();
    }
    void control(int index, float value) { controls_[index] = value; }
    void setVoct(int k, float v) { if (k >= 0 && k < kVoices) voct_[k] = v; }
    void setVelocity(int k, float v) { if (k >= 0 && k < kVoices) vel_[k] = v; }
    void setBend(float v) { bend_ = v; }
    void setPress(float v) { press_ = v; }
    void gate(int k, bool high) { if (k >= 0 && k < kVoices) pendingGate_[k] = high; }
    float tape() const { return tape_; }
    float load() const { return load_; }
    void active(bool value) { active_ = value; }

    void update() override {
        if (boundVersion_ != SampleBank::instance().version()) rebind();
        audio_block_t* out[2];
        for (int c = 0; c < 2; ++c) {
            out[c] = allocate();
            if (!out[c]) { for (int k = 0; k < c; ++k) release(out[k]); return; }
        }
        for (int index = 0; index < 8; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) { strip_.setControl(index, value); applied_[index] = value; }
        }
        strip_.setPress(press_);
        // Gate-flanken: eenmaal per blok, zoals de CV-brug ze aanlevert.
        for (int k = 0; k < kVoices; ++k) {
            const bool high = pendingGate_[k];
            const float voct = voct_[k] + bend_;
            if (high && !gate_[k]) {
                const int velocity = static_cast<int>(vel_[k] * 127.0f);
                const int midi = static_cast<int>(lroundf(60.0f + 12.0f * voct_[k]));
                const float startSeconds = strip_.noteOn(k, midi);
                const float playSeconds = voice_[k].playSeconds(midi, velocity);
                if (active_ && playSeconds > 0.0f && startSeconds < playSeconds) {
                    voice_[k].set_startOffset(startSeconds / playSeconds);
                    voice_[k].set_voct(voct + strip_.voctOffset(k));
                    voice_[k].noteOn(midi, velocity);
                } else {
                    voice_[k].kill();
                    strip_.noteOff(k);
                }
            } else if (!high && gate_[k]) {
                strip_.noteOff(k);
                voice_[k].noteOff(-1);
            }
            gate_[k] = high;
        }
        float mix[mmb_dsp::kMaxChannels], one[mmb_dsp::kMaxChannels];
        for (int s0 = 0; s0 < AUDIO_BLOCK_SAMPLES; s0 += kSubBlock) {
            strip_.PrepareBlock(kSubBlock);
            for (int k = 0; k < kVoices; ++k) {
                if (!voice_[k].active()) continue;
                if (strip_.stopped(k)) { voice_[k].kill(); continue; }
                voice_[k].set_voct(voct_[k] + bend_ + strip_.voctOffset(k));
                voice_[k].PrepareBlock();
            }
            for (int i = s0; i < s0 + kSubBlock; ++i) {
                for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.0f;
                for (int k = 0; k < kVoices; ++k) {
                    if (!voice_[k].active()) continue;
                    for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) one[c] = 0.0f;
                    voice_[k].Process(one, 2);
                    strip_.Process(k, one, 2);
                    mix[0] += one[0]; mix[1] += one[1];
                }
                const float hiss = strip_.hiss();
                mix[0] += hiss; mix[1] += hiss;
                limiter_.Process(mix, 2);
                for (int c = 0; c < 2; ++c) out[c]->data[i] = static_cast<int16_t>(mix[c] * 32767.0f);
            }
        }
        tape_ = strip_.tapePosition();
        load_ = strip_.load();
        for (int c = 0; c < 2; ++c) { transmit(out[c], c); release(out[c]); }
    }

private:
    void rebind() {
        SampleBank& b = SampleBank::instance();
        boundVersion_ = b.version();
        for (auto& v : voice_) v.bind(b.slots(), b.numSlots(), b.zones(), b.numZones());
    }

    mmb_dsp::SamplePlayer voice_[kVoices];
    mmb_dsp::TapeStrip strip_;
    mmb_dsp::OutputLimiter limiter_;
    uint32_t boundVersion_ = 0xffffffffu;
    int bank_ = -1;
    volatile float controls_[8] = {8, 1, 0.5f, 0.4f, 0.3f, 0.3f, 0.3f, 0.8f};
    float applied_[8] = {8, 1, 0.5f, 0.4f, 0.3f, 0.3f, 0.3f, 0.8f};
    volatile float voct_[kVoices] = {};
    volatile float vel_[kVoices] = {0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f};
    volatile float bend_ = 0, press_ = 0;
    volatile bool pendingGate_[kVoices] = {};
    bool gate_[kVoices] = {};
    volatile float tape_ = 0, load_ = 0;
    volatile bool active_ = true;
};

class TapeStripModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_tapestrip";
    explicit TapeStripModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<TapeStripStream*>(&stream_);
        if (portId == "out" || portId == "out_l") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "tape" || portId == "load") return PortKind::Cv;
        return (portId == "out" || portId == "out_l" || portId == "out_r") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (SamplerModule::cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (SamplerModule::cellOf(portId, "gate") >= 0) return PortKind::Gate;
        if (SamplerModule::cellOf(portId, "vel") >= 0) return PortKind::Cv;
        if (portId == "bend" || portId == "press") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        int k;
        if (portId == "bend") stream_.setBend(value);
        else if (portId == "press") stream_.setPress(value);
        else if ((k = SamplerModule::cellOf(portId, "voct")) >= 0) stream_.setVoct(k, value);
        else if ((k = SamplerModule::cellOf(portId, "gate")) >= 0) stream_.gate(k, value >= 0.5f);
        else if ((k = SamplerModule::cellOf(portId, "vel")) >= 0) stream_.setVelocity(k, value);
    }
    void onCvDisconnected(std::string_view portId) override {
        writeCvPort(portId, SamplerModule::cellOf(portId, "vel") >= 0 ? 0.8f : 0.0f);
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "tape") return stream_.tape();
        if (portId == "load") return stream_.load();
        return 0.0f;
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::TapeStrip;
        if (controlId == "bank") stream_.setBank(static_cast<int>(number));
        else if (controlId == "length") stream_.control(Kernel::Length, number);
        else if (controlId == "return") stream_.control(Kernel::Return, number);
        else if (controlId == "contact") stream_.control(Kernel::Contact, number);
        else if (controlId == "motor") stream_.control(Kernel::Motor, number);
        else if (controlId == "wow") stream_.control(Kernel::Wow, number);
        else if (controlId == "flutter") stream_.control(Kernel::Flutter, number);
        else if (controlId == "wear") stream_.control(Kernel::Wear, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<TapeStripModule>(id);
        });
    }

private:
    mutable TapeStripStream stream_;
};

}  // namespace mmb_link
