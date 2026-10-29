#pragma once
/**
 * @file PumpModule.h
 * @brief PUMP, VCA-compressor met sidechain en gate in de geest van de
 *        Alesis 3630 (typeId `tp_mmb_pump`), fw 0.5.115.
 *
 * @details
 * De DSP is mmb_dsp::PumpComp (dezelfde header draait als wasm in de
 * simulator); zie daar en doc/plans/sidechain-comp.md. Stereo; alleen `in_l`
 * aangesloten = mono op beide uitgangen. Met een sleutel op `sc` luistert de
 * detector daarnaar, anders naar de eigen ingang.
 *
 * `sc` aangesloten herkennen: de Teensy-audiograaf zegt niet of er een kabel
 * op een ingang zit, alleen of er een blok binnenkomt. Een bron die bij
 * stilte niets zendt, zou de detector dan tussen twee kicks naar de eigen
 * ingang laten springen. Daarom telt `sc` als aangesloten tot 2 s na het
 * laatste blok; een ontbrekend blok in die tijd is stilte.
 *
 * Port map:
 * | Direction | portId      | Domain | Stream / channel |
 * |-----------|-------------|--------|------------------|
 * | input     | `in_l`      | Audio  | stream_, 0       |
 * | input     | `in_r`      | Audio  | stream_, 1       |
 * | input     | `sc`        | Audio  | stream_, 2 (sidechain-sleutel) |
 * | input     | `thresh_cv` | Cv     | bij de drempel op, ±1 = het hele bereik |
 * | output    | `out_l`     | Audio  | stream_, 0       |
 * | output    | `out_r`     | Audio  | stream_, 1       |
 * | output    | `gr`        | Cv     | gain reduction, 0..1 (1 = 20 dB of meer) |
 * | output    | `gate`      | Gate   | 1 zolang de gate open is |
 *
 * Controls:
 * | controlId | range | effect |
 * |---|---|---|
 * | `threshold` | −40 … +20 dB | drempel (0 dB = −18 dBFS) |
 * | `ratio` | 1 … 21 | 1:1 … 20:1; 21 = ∞ |
 * | `attack` | 0,1 … 200 ms | Peak-stand |
 * | `release` | 50 … 3000 ms | Peak-stand |
 * | `mode` | 0 / 1 | Peak / RMS |
 * | `knee` | 0 / 1 | Hard / Soft |
 * | `output` | −20 … +20 dB | uitgangsversterking |
 * | `gate` | −70 … 0 dBFS | gate-drempel; −70 = uit |
 * | `gate_rate` | 20 … 2000 ms | sluittijd van de gate |
 * | `sc_hp` | 0 … 3 | detector-hoogdoorlaat: uit / 60 / 100 / 150 Hz |
 * | `listen` | 0 / 1 | hoor de sleutel |
 * | `mix` | 0 … 1 | droog/nat |
 * | `bypass` | 0 / 1 | 1 = signaal ongemoeid door (de gate blijft werken) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/pump_comp.h"

namespace mmb_link {

class PumpStream : public AudioStream {
public:
    PumpStream() : AudioStream(3, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::PumpComp& comp() { return comp_; }
    float gr() const { return gr_; }
    bool gateOpen() const { return gateOpen_; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);
        audio_block_t* inS = receiveReadOnly(2);
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            if (inL) release(inL);
            if (inR) release(inR);
            if (inS) release(inS);
            return;
        }
        if (inS) scHold_ = kScHoldBlocks;
        else if (scHold_ > 0) --scHold_;
        const bool scOn = scHold_ > 0;
        // Mono: zonder rechterkabel krijgt R hetzelfde als L.
        const audio_block_t* srcR = inR ? inR : inL;
        float x[2];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            x[0] = inL  ? inL->data[i]  * (1.0f / 32768.0f) : 0.0f;
            x[1] = srcR ? srcR->data[i] * (1.0f / 32768.0f) : 0.0f;
            const float s = inS ? inS->data[i] * (1.0f / 32768.0f) : 0.0f;
            comp_.Process(x, s, scOn);
            outL->data[i] = static_cast<int16_t>(clamp1(x[0]) * 32767.0f);
            outR->data[i] = static_cast<int16_t>(clamp1(x[1]) * 32767.0f);
        }
        gr_ = comp_.gr();
        gateOpen_ = comp_.gate_open();
        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
        if (inL) release(inL);
        if (inR) release(inR);
        if (inS) release(inS);
    }

private:
    static constexpr int kScHoldBlocks = 690;   // ~2 s bij 128 samples op 44,1 kHz
    static float clamp1(float v) { return v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v); }

    audio_block_t* inputQueue_[3] = { nullptr, nullptr, nullptr };
    mmb_dsp::PumpComp comp_;
    int scHold_ = 0;
    volatile float gr_ = 0.0f;
    volatile bool gateOpen_ = true;
};

class PumpModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_pump";

    explicit PumpModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<PumpStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<PumpStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        if (portId == "sc") return { s, 2, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in" || portId == "sc") return PortKind::Audio;
        if (cvPortIs(portId, "thresh")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        if (portId == "gr") return PortKind::Cv;
        if (portId == "gate") return PortKind::Gate;
        return PortKind::None;
    }
    /** `gr`: gain reduction van het laatste blok; `gate`: 1 als de gate open is. */
    float readCvPort(std::string_view portId) const override {
        if (portId == "gr") return stream_.gr();
        if (portId == "gate") return stream_.gateOpen() ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (cvPortIs(portId, "thresh")) { threshKc_.cv = value; applyThreshold(); }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& c = stream_.comp();
        if      (controlId == "threshold") { threshKc_.knob = asFloat(-10.0f); applyThreshold(); }
        else if (controlId == "ratio") c.set_ratio(asFloat(4.0f));
        else if (controlId == "attack") c.set_attack_ms(asFloat(1.0f));
        else if (controlId == "release") c.set_release_ms(asFloat(150.0f));
        else if (controlId == "mode") c.set_rms(asFloat(0.0f) >= 0.5f);
        else if (controlId == "knee") c.set_soft_knee(asFloat(0.0f) >= 0.5f);
        else if (controlId == "output") c.set_output_db(asFloat(0.0f));
        else if (controlId == "gate") c.set_gate_db(asFloat(-70.0f));
        else if (controlId == "gate_rate") c.set_gate_rate_ms(asFloat(200.0f));
        else if (controlId == "sc_hp") c.set_sc_hp(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "listen") c.set_listen(asFloat(0.0f) >= 0.5f);
        else if (controlId == "mix") c.set_mix(asFloat(1.0f));
        else if (controlId == "bypass") c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<PumpModule>(id);
            });
    }

private:
    void applyThreshold() { stream_.comp().set_threshold_db(threshKc_.value(-40.0f, 20.0f)); }

    mutable PumpStream stream_;
    KnobCv threshKc_{-10.0f, 0.0f};   ///< threshold: knop + CV (FW-MOD-1)
};

}  // namespace mmb_link
