#pragma once
/**
 * @file Cr78Module.h
 * @brief Roland CR-78 drumstem, berekend (typeId `tp_mmb_cr78`, FW-AU-16).
 *
 * @details
 * Zelf-gemodelleerd (geen upstream): de CompuRhythm CR-78 (1978) maakte zijn
 * drums analoog — bridged-T-oscillatoren (gedempte sinussen) voor de vellen,
 * gefilterde ruis met envelope-VCA's voor snare/hat/cymbal/maracas/guiro.
 * Berekend i.p.v. gesampeld geeft precies wat een sample mist: de
 * accent-dynamiek (accent → harder én een grotere pitch-buiging op de
 * aanslag, zoals het accent-circuit van het origineel).
 *
 * Eén drum per instantie (kies met `drum`, zoals Peaks) — plaats er
 * meerdere en klok ze met Marbles/Seq. Rendert native op 44.1 kHz;
 * een stille stem kost ~0% CPU (early-out zodra de envelopes uitgeklonken
 * zijn).
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                            |
 * |-----|--------|-------|---------------------------------------|
 * | in  | `gate`/`trig` | Gate | Stijgende flank slaat de drum  |
 * | in  | `voct` | Cv    | Toonhoogte-offset (vellen)            |
 * | in  | `accent`/`accent_cv` | Cv | Accent → luider + meer bend |
 * | out | `out`  | Audio | Mono drum-uitgang                     |
 *
 * Controls: `drum` (0=Kick 1=Snare 2=Rim 3=Claves 4=Cowbell 5=HiHat
 * 6=Cymbal 7=Maracas 8=Guiro 9=Bongo 10=Conga 11=Tamb), `tone` (0..1,
 * kleur/pitch per stem), `decay` (0..1), `bend` (0..1 aanslag-pitchbuiging),
 * `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string_view>

#include "mmb_dsp/cr78.h"

namespace mmb_link {

/** @brief AudioStream-schil rond de kernel @ref mmb_dsp::Cr78. De DSP staat in
 *  firmware/lib/mmb-dsp/mmb_dsp/cr78.h, dezelfde code als de
 *  browser-simulator draait (bit-identiek geverifieerd tegen de oude inline
 *  versie, 2026-09-24, tools/mmb-wasm/bitcheck/cr78_check.cc). */
class Cr78Voice : public AudioStream {
public:
    Cr78Voice() : AudioStream(0, nullptr) { drum_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void setDrum(int d)    { drum_.setDrum(d); }
    void setTone(float v)  { drum_.setTone(v); }
    void setDecay(float v) { drum_.setDecay(v); }
    void setBend(float v)  { drum_.setBend(v); }
    void setVoct(float v)  { drum_.setVoct(v); }
    void setAccent(float v){ drum_.setAccent(v); }
    void setLevel(float v) { drum_.setLevel(v); }

    void trigger() { drum_.trigger(); }

    float takePeak() { const float p = peak_; peak_ = 0.0f; return p * (1.0f / 32768.0f); }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = drum_.Tick();
            y *= 28000.0f;
            if (y >  32767.0f) y =  32767.0f; else if (y < -32768.0f) y = -32768.0f;
            const float a = y < 0 ? -y : y;
            if (a > peak_) peak_ = a;
            out->data[i] = static_cast<int16_t>(y);
        }
        transmit(out, 0);
        release(out);
    }

private:
    mmb_dsp::Cr78 drum_;
    volatile float peak_ = 0.0f;
};

/** @brief Module-wrapper rond @ref Cr78Voice. */
class Cr78Module final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_cr78";

    explicit Cr78Module(std::string_view id)
        : AudioModule(kTypeId, id) {}

    Cr78Voice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<Cr78Voice*>(&voice_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        if (portId == "voct") return PortKind::Cv;
        if (cvPortIs(portId, "accent")) return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") {
            const bool high = value >= 0.5f;
            if (high && !gatePrev_) voice_.trigger();
            gatePrev_ = high;
        } else if (portId == "voct") {
            voice_.setVoct(value);
        } else if (cvPortIs(portId, "accent")) {
            voice_.setAccent(value);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        if      (controlId == "drum")  voice_.setDrum(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "tone")  voice_.setTone(asFloat(0.5f));
        else if (controlId == "decay") voice_.setDecay(asFloat(0.5f));
        else if (controlId == "bend")  voice_.setBend(asFloat(0.5f));
        else if (controlId == "level") voice_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<Cr78Module>(id);
            });
    }

private:
    mutable Cr78Voice voice_;
    bool gatePrev_ = false;
};

}  // namespace mmb_link
