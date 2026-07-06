#pragma once
/**
 * @file ElementsReverbModule.h
 * @brief Standalone Mutable Instruments Elements Reverb as a MusicBrain
 *        AudioModule (typeId `tp_mmb_elements_reverb`).
 *
 * The upstream `elements::Reverb` (stereo Dattorro topology) is vendored in
 * `lib/mi-elements/`.  It runs at the host sample rate (44.1 kHz).  The LFO
 * frequencies in `Reverb::Init()` are scaled from the original 32 kHz.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstring>
#include <memory>
#include <new>

#include "elements/dsp/fx/reverb.h"

namespace mmb_link {

// ---------------------------------------------------------------------------
// ElementsReverbStream — Teensy AudioStream wrapper around elements::Reverb.
// ---------------------------------------------------------------------------

class ElementsReverbStream : public AudioStream {
public:
    ElementsReverbStream()
        : AudioStream(2, inputQueue_)
    {
        // Delaybuffer (64 KB) op de heap en direct binden: de Registry-
        // factory roept begin() nooit aan, en een ongebonden buffer gaf een
        // nullptr-deref in Reverb::Process() (zelfde valkuil als
        // ElementsVoice zonder Part::Init()). Bij heap-OOM blijft ready_
        // false → update() blijft stil in plaats van te crashen. Apps met
        // een eigen buffer (app-elements, DTCM) re-binden via begin().
        heapBuf_.reset(new (std::nothrow) uint16_t[32768]);
        if (heapBuf_) {
            begin(heapBuf_.get());
            ready_ = true;
        }
    }

    void begin(uint16_t* buffer) {
        std::memset(buffer, 0, 32768 * sizeof(uint16_t));
        reverb_.Init(buffer);
    }

    void setAmount(float v)    { reverb_.set_amount(v); }
    void setTime(float v)      { reverb_.set_time(v); }
    void setDiffusion(float v) { reverb_.set_diffusion(v); }
    void setLp(float v)        { reverb_.set_lp(v); }

    void update() override {
        // Niet renderen vóór de ctor de buffer heeft gebonden (AudioStream
        // linkt zich al in de update-lijst tijdens de basisconstructor).
        if (!ready_) return;
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);

        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            if (inL) release(inL);
            if (inR) release(inR);
            return;
        }

        float bufL[AUDIO_BLOCK_SAMPLES];
        float bufR[AUDIO_BLOCK_SAMPLES];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            bufL[i] = inL ? (inL->data[i] / 32768.0f) : 0.0f;
            bufR[i] = inR ? (inR->data[i] / 32768.0f) : 0.0f;
        }

        reverb_.Process(bufL, bufR, AUDIO_BLOCK_SAMPLES);

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float l = bufL[i];
            float r = bufR[i];
            if (l > 1.0f) l = 1.0f; else if (l < -1.0f) l = -1.0f;
            if (r > 1.0f) r = 1.0f; else if (r < -1.0f) r = -1.0f;
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
    volatile bool  ready_ = false;   ///< true zodra de buffer gebonden is.
    std::unique_ptr<uint16_t[]> heapBuf_;  ///< Eigen delaybuffer (ctor-gebonden).
    elements::Reverb reverb_;
};

// ---------------------------------------------------------------------------
// ElementsReverbModule — AudioModule wrapper (tp_mmb_elements_reverb).
// ---------------------------------------------------------------------------
class ElementsReverbModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_elements_reverb";

    explicit ElementsReverbModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    void begin(uint16_t* buffer) { stream_.begin(buffer); }
    ElementsReverbStream& stream() { return stream_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l")
            return { const_cast<ElementsReverbStream*>(&stream_), 0, true };
        if (portId == "out_r")
            return { const_cast<ElementsReverbStream*>(&stream_), 1, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in_l")
            return { const_cast<ElementsReverbStream*>(&stream_), 0, true };
        if (portId == "in_r")
            return { const_cast<ElementsReverbStream*>(&stream_), 1, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "in_l" || portId == "in_r")
                   ? PortKind::Audio : PortKind::None;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "amount")     stream_.setAmount(asFloat(0.5f));
        else if (controlId == "time")  stream_.setTime(asFloat(0.5f));
        else if (controlId == "diffusion") stream_.setDiffusion(asFloat(0.625f));
        else if (controlId == "lp")    stream_.setLp(asFloat(0.7f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ElementsReverbModule>(id);
            });
    }

private:
    mutable ElementsReverbStream stream_;
};

}  // namespace mmb_link
