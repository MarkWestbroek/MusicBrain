#pragma once
/**
 * @file RotaryModule.h
 * @brief Draaiende luidspreker, Leslie-stijl (`tp_mmb_rotary`).
 *
 * mmb_dsp::Leslie: hoorn + trommel met eigen motor en traagheid, Doppler,
 * richting, kastreflectie, bijgeluiden (lucht, motor, relais) en een
 * buizenvoorversterker. Langzaam én snel instelbaar (ELKA-stijl); mono in
 * (L+R), stereo uit via twee microfoons.
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); gate `fast` (flank
 * omhoog = snel, omlaag = langzaam; de schakelaar werkt ernaast), CV
 * `drive` (ook `drive_cv`). Controls: speed (0 slow / 1 fast / 2 brake),
 * slow_rate, fast_rate (Hz), inertia, drive, balance, spread, noise, level.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/leslie.h"

namespace mmb_link {

class RotaryStream : public AudioStream {
public:
    RotaryStream() : AudioStream(2, inputQueue_) { rot_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::Leslie& rot() { return rot_; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL); if (outR) release(outR);
            if (inL) release(inL);   if (inR) release(inR);
            return;
        }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float l = inL ? inL->data[i] * (1.0f / 32768.0f) : 0.0f;
            const float r = inR ? inR->data[i] * (1.0f / 32768.0f) : l;
            float yl, yr;
            rot_.Process(0.5f * (l + r), &yl, &yr);
            outL->data[i] = static_cast<int16_t>(clamp1(yl) * 32767.0f);
            outR->data[i] = static_cast<int16_t>(clamp1(yr) * 32767.0f);
        }
        transmit(outL, 0); transmit(outR, 1);
        release(outL); release(outR);
        if (inL) release(inL); if (inR) release(inR);
    }

private:
    static float clamp1(float v) { return v != v ? 0.0f : (v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v)); }
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    mmb_dsp::Leslie rot_;
};

class RotaryModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_rotary";
    explicit RotaryModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<RotaryStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<RotaryStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (portId == "fast") return PortKind::Gate;
        if (cvPortIs(portId, "drive")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& r = stream_.rot();
        if (portId == "fast") {
            // Flank, geen niveau: zo blijft de schakelaar op het paneel
            // bruikbaar zolang de gate stil staat (zoals een voetschakelaar
            // naast de knop op het orgel). In de rem-stand doet de gate niets.
            const bool hi = value >= 0.5f;
            if (hi != gate_) {
                gate_ = hi;
                if (speed_ != 2) { speed_ = hi ? 1 : 0; r.set_speed(speed_); }
            }
        } else if (cvPortIs(portId, "drive")) {
            r.set_drive(value);
        }
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& r = stream_.rot();
        if      (controlId == "speed")     { speed_ = static_cast<int>(asFloat(0.0f) + 0.5f); r.set_speed(speed_); }
        else if (controlId == "slow_rate") r.set_slow_rate(asFloat(0.8f));
        else if (controlId == "fast_rate") r.set_fast_rate(asFloat(6.7f));
        else if (controlId == "inertia")   r.set_inertia(asFloat(1.0f));
        else if (controlId == "drive")     r.set_drive(asFloat(0.2f));
        else if (controlId == "balance")   r.set_balance(asFloat(0.5f));
        else if (controlId == "spread")    r.set_spread(asFloat(0.8f));
        else if (controlId == "noise")     r.set_noise(asFloat(0.3f));
        else if (controlId == "level")     r.set_level(asFloat(1.0f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<RotaryModule>(id); });
    }

private:
    mutable RotaryStream stream_;
    int  speed_ = 0;
    bool gate_ = false;
};

}  // namespace mmb_link
