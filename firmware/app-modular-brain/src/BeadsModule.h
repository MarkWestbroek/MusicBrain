#pragma once
/**
 * @file BeadsModule.h
 * @brief Mutable Instruments Beads (typeId `tp_mmb_beads`), fw 0.5.112.
 *
 * Broncode vrijgegeven door Émilie Gillet op 2026-10-11 (MIT, gevendord in
 * lib/mi-beads, commit d8f4739). Alle DSP en de omrekening van knoppen en CV
 * zitten in `mi-beads/beads_host.h`, gedeeld met de simulator; dit is alleen
 * de AudioStream-wrapper. Plan: doc/plans/beads.md.
 *
 * Geheugen: de opnamebuffer (768 KB) in PSRAM via FxMem (korrels lezen
 * lokaal rond een paar posities; de 32 KB-cache vangt dat op), de reverb
 * (64 KB, veel verspreide taps) op de heap. Zonder geheugen blijft de module
 * stil. Het object zelf genuld (MI-code rekent op genulde statics).
 *
 * Poorten: in_l/in_r (audio; niets aangesloten = wavetable-klankbron, alleen
 * In L = mono), freeze (gate), seed (trigger), time/size/shape/pitch/density
 * (CV, `_cv`-alias), out_l/out_r.
 */

#include <Audio.h>
#include <cstring>
#include <new>
#include <string_view>

#include "AudioModule.h"
#include "FxMem.h"
#include "mb/runtime/Registry.h"
#include "beads_host.h"

namespace mmb_link {

class BeadsVoice : public AudioStream {
public:
    BeadsVoice() : AudioStream(2, inputQueue_) {
        delay_ = fxAlloc<uint8_t>(mmb_beads::kDelayBytes);
        reverb_.reset(new (std::nothrow) uint16_t[mmb_beads::kReverbWords]());
        if (delay_ && reverb_) {
            std::memset(delay_.get(), 0, mmb_beads::kDelayBytes);
            host_.Init(delay_.get(), reverb_.get());
            ready_ = true;
            Serial.printf("[beads] init ok (delay %s, reverb heap)\n", fxInPsram(delay_.get()) ? "PSRAM" : "heap");
        } else {
            Serial.println("[beads] buffer alloc FAILED — module blijft stil");
        }
    }

    mmb_beads::Controls& controls() { return c_; }
    mmb_beads::Cv& cv() { return cv_; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);
        if (!ready_) { if (inL) release(inL); if (inR) release(inR); return; }
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            if (inL) release(inL);
            if (inR) release(inR);
            return;
        }
        float fl[AUDIO_BLOCK_SAMPLES], fr[AUDIO_BLOCK_SAMPLES], ol[AUDIO_BLOCK_SAMPLES], orr[AUDIO_BLOCK_SAMPLES];
        constexpr float kIn = 1.0f / 32768.0f;
        if (inL) for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) fl[i] = inL->data[i] * kIn;
        if (inR) for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) fr[i] = inR->data[i] * kIn;
        host_.Process(c_, cv_, inL ? fl : nullptr, inR ? fr : nullptr, ol, orr, AUDIO_BLOCK_SAMPLES);
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float l = ol[i], r = orr[i];
            if (l != l) l = 0.0f;   // NaN-vangnet
            if (r != r) r = 0.0f;
            outL->data[i] = static_cast<int16_t>(l * 32767.0f);
            outR->data[i] = static_cast<int16_t>(r * 32767.0f);
        }
        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
        if (inL) release(inL);
        if (inR) release(inR);
    }

private:
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    FxBuf<uint8_t> delay_;
    std::unique_ptr<uint16_t[]> reverb_;
    mmb_beads::BeadsHost host_;
    mmb_beads::Controls c_;
    mmb_beads::Cv cv_;
    volatile bool ready_ = false;
};

class BeadsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_beads";

    /// Genulde allocatie (zie ElementsModule/CloudsModule).
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit BeadsModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l") return { const_cast<BeadsVoice*>(&voice_), 0, true };
        if (portId == "out_r") return { const_cast<BeadsVoice*>(&voice_), 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l") return { const_cast<BeadsVoice*>(&voice_), 0, true };
        if (portId == "in_r") return { const_cast<BeadsVoice*>(&voice_), 1, true };
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" || portId == "out_r") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l" || portId == "in_r") return PortKind::Audio;
        if (portId == "freeze" || portId == "seed") return PortKind::Gate;
        if (cvPortIs(portId, "time") || cvPortIs(portId, "size") || cvPortIs(portId, "shape") ||
            cvPortIs(portId, "pitch") || cvPortIs(portId, "density"))
            return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        mmb_beads::Cv& cv = voice_.cv();
        // Een kabel weg zet de ingang op 0 (CvGraph, fw 0.5.93); 'has_' blijft
        // dan staan tot de volgende config. Een CV van precies 0 doet bij
        // Beads hetzelfde als geen kabel, op het toeval na: zie beads_host.h.
        if (portId == "freeze") cv.freeze = value >= 0.5f;
        else if (portId == "seed") { cv.has_seed = true; cv.seed = value >= 0.5f; }
        else if (cvPortIs(portId, "time"))    { cv.has_time = true;    cv.time = value; }
        else if (cvPortIs(portId, "size"))    { cv.has_size = true;    cv.size = value; }
        else if (cvPortIs(portId, "shape"))   { cv.has_shape = true;   cv.shape = value; }
        else if (cvPortIs(portId, "pitch"))   { cv.has_pitch = true;   cv.pitch = value; }
        else if (cvPortIs(portId, "density")) { cv.has_density = true; cv.density = value; }
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float v = 0.0f;
        if (const auto* f = std::get_if<float>(&value)) v = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) v = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) v = *b ? 1.0f : 0.0f;
        mmb_beads::Controls& c = voice_.controls();
        if      (controlId == "time")       c.time = v;
        else if (controlId == "size")       c.size = v;
        else if (controlId == "shape")      c.shape = v;
        else if (controlId == "pitch")      c.pitch = v;
        else if (controlId == "density")    c.density = v;
        else if (controlId == "time_amt")   c.time_amt = v;
        else if (controlId == "size_amt")   c.size_amt = v;
        else if (controlId == "shape_amt")  c.shape_amt = v;
        else if (controlId == "pitch_amt")  c.pitch_amt = v;
        else if (controlId == "feedback")   c.feedback = v;
        else if (controlId == "mix")        c.mix = v;
        else if (controlId == "reverb")     c.reverb = v;
        else if (controlId == "quality")    c.quality = static_cast<int>(v + 0.5f);
        else if (controlId == "freeze_btn") c.freeze = v >= 0.5f;
        else if (controlId == "seed_btn")   c.seed = v >= 0.5f;
        else if (controlId == "seed_lock")  c.seed_lock = v >= 0.5f;
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<BeadsModule>(id);
        });
    }

private:
    BeadsVoice voice_;
};

}  // namespace mmb_link
