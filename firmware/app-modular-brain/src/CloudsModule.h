#pragma once
/**
 * @file CloudsModule.h
 * @brief Mutable Instruments *Clouds* granular processor als MusicBrain-module
 *        (typeId `tp_mmb_clouds`).
 *
 * @details
 * Wrapper rond de gevendorde Clouds-DSP (`firmware/lib/mi-clouds`, MIT,
 * (c) Emilie Gillet). Clouds is een stereo granular-effect: audio wordt in
 * een buffer gevangen en als korrels teruggespeeld (of gestretcht, gelust,
 * of spectraal versmeerd — 4 playback-modes).
 *
 * Eerste MI-module met **audio-ingangen**: de wrapper resamplet de stereo
 * input 44.1 kHz → 32 kHz (lineair) én de output 32 kHz → 44.1 kHz, met een
 * klein 32 kHz-tussenblok van `clouds::kMaxBlockSize` (32) frames.
 *
 * `GranularProcessor::Prepare()` (buffer-onderhoud; upstream in de main
 * loop) draait hier één keer per `update()` vóór het renderen. Bij een
 * playback-mode-wissel doet Prepare zwaarder werk — een korte glitch bij
 * het omschakelen is normaal.
 *
 * Zelfde lessen als Elements/Rings/Plaits: genulde allocatie, heap-buffers
 * met OOM-stilte, NaN-vangnet, peak-meter. Werkgeheugen: 118784 + 65408
 * bytes via twee heap-blokken.
 *
 * Port map:
 * | Dir | portId     | Kind  | Betekenis                                |
 * |-----|------------|-------|-------------------------------------------|
 * | in  | `in_l`     | Audio | Stereo input L                            |
 * | in  | `in_r`     | Audio | Stereo input R (onverbonden = mono L)     |
 * | in  | `freeze`   | Gate  | Buffer bevriezen (hoog = freeze)          |
 * | in  | `trig`     | Gate  | Trigger één korrel (stijgende flank)      |
 * | in  | `position` | Cv    | (ook `position_cv`) + size/pitch/density/ |
 * |     |            |       | texture/mix — zelfde patroon              |
 * | out | `out_l`    | Audio | Stereo output L                           |
 * | out | `out_r`    | Audio | Stereo output R                           |
 *
 * Controls: `position` `size` `density` `texture` `mix` `spread` `feedback`
 * `reverb` (0..1), `pitch` (semitonen −24..24), `mode` (0..3: granular /
 * stretch / looping delay / spectral), `freeze` (bool), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
#include <string_view>

// Gevendorde upstream Clouds-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-clouds.
#include "clouds/dsp/granular_processor.h"

namespace mmb_link {

// ---------------------------------------------------------------------------
// CloudsVoice — Teensy AudioStream wrapper rond clouds::GranularProcessor.
// ---------------------------------------------------------------------------
class CloudsVoice : public AudioStream {
public:
    static constexpr float kCloudsRate = 32000.0f;
    /// Output-resampler: bron-samples per uitgangssample (32k → 44.1k).
    static constexpr float kOutStep = 32000.0f / AUDIO_SAMPLE_RATE_EXACT;
    /// Input-resampler: input-samples per 32 kHz-doelsample (44.1k → 32k).
    static constexpr float kInStep = AUDIO_SAMPLE_RATE_EXACT / 32000.0f;

    static constexpr size_t kLargeBufferSize = 118784;
    static constexpr size_t kSmallBufferSize = 65536 - 128;

    CloudsVoice()
        : AudioStream(2, inputQueue_)
    {
        largeBuf_.reset(new (std::nothrow) uint8_t[kLargeBufferSize]());
        smallBuf_.reset(new (std::nothrow) uint8_t[kSmallBufferSize]());
        if (largeBuf_ && smallBuf_) {
            processor_.Init(largeBuf_.get(), kLargeBufferSize,
                            smallBuf_.get(), kSmallBufferSize);
            processor_.set_num_channels(2);
            processor_.set_low_fidelity(false);
            processor_.set_playback_mode(clouds::PLAYBACK_MODE_GRANULAR);
            clouds::Parameters* p = processor_.mutable_parameters();
            p->position = 0.5f;  p->size = 0.5f;    p->pitch = 0.0f;
            p->density = 0.5f;   p->texture = 0.5f; p->dry_wet = 0.5f;
            p->stereo_spread = 0.3f; p->feedback = 0.3f; p->reverb = 0.3f;
            p->freeze = false;   p->trigger = false; p->gate = false;
            ready_ = true;
            Serial.printf("[clouds] init ok (buffers %u+%u KB)\n",
                          static_cast<unsigned>(kLargeBufferSize / 1024),
                          static_cast<unsigned>(kSmallBufferSize / 1024));
        } else {
            Serial.println("[clouds] buffer alloc FAILED — module blijft stil");
        }
    }

    clouds::Parameters* params() { return processor_.mutable_parameters(); }
    clouds::GranularProcessor& processor() { return processor_; }

    bool  dspReady() const { return ready_; }
    float takePeak() { const float p = peak_; peak_ = 0.0f; return p; }
    void  setLevel(float l) { level_ = l; }
    /// Trigger één korrel bij de volgende render (stijgende flank op `trig`).
    void  pulseTrigger() { triggerPending_ = true; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);

        if (!ready_) {
            if (inL) release(inL);
            if (inR) release(inR);
            return;
        }

        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            if (inL) release(inL);
            if (inR) release(inR);
            return;
        }

        // Buffer-onderhoud (upstream: main loop). Eén keer per update volstaat
        // ruim; bij een mode-wissel mag dit even glitchen.
        processor_.Prepare();

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            // ── input 44.1 kHz → 32 kHz (lineair, phase-accumulator) ──
            const float xl = inL ? static_cast<float>(inL->data[i]) : 0.0f;
            const float xr = inR ? static_cast<float>(inR->data[i])
                                 : (inL ? xl : 0.0f);   // mono → beide kanalen
            inPhase_ += 1.0f;
            while (inPhase_ >= kInStep) {
                inPhase_ -= kInStep;
                const float t = 1.0f - inPhase_ / kInStep;   // 0..1 tussen prev en nu
                clouds::ShortFrame f;
                f.l = static_cast<int16_t>(prevL_ + (xl - prevL_) * t);
                f.r = static_cast<int16_t>(prevR_ + (xr - prevR_) * t);
                pushInput(f);
            }
            prevL_ = xl;
            prevR_ = xr;

            // ── output 32 kHz → 44.1 kHz ──
            float yL = s0L_ + (s1L_ - s0L_) * outPhase_;
            float yR = s0R_ + (s1R_ - s0R_) * outPhase_;
            outPhase_ += kOutStep;
            while (outPhase_ >= 1.0f) {
                outPhase_ -= 1.0f;
                s0L_ = s1L_;
                s0R_ = s1R_;
                nextOutputSample(s1L_, s1R_);
            }
            if (!(yL == yL)) yL = 0.0f;
            if (!(yR == yR)) yR = 0.0f;
            const float aL = yL < 0.0f ? -yL : yL;
            if (aL > peak_) peak_ = aL;
            yL *= level_;
            yR *= level_;
            if (yL >  32767.0f) yL =  32767.0f; else if (yL < -32768.0f) yL = -32768.0f;
            if (yR >  32767.0f) yR =  32767.0f; else if (yR < -32768.0f) yR = -32768.0f;
            outL->data[i] = static_cast<int16_t>(yL);
            outR->data[i] = static_cast<int16_t>(yR);
        }

        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
        if (inL) release(inL);
        if (inR) release(inR);
    }

private:
    inline void pushInput(const clouds::ShortFrame& f) {
        inBuf_[inCount_] = f;
        if (++inCount_ >= clouds::kMaxBlockSize) {
            // Vol 32-frames-blok: render door de granular processor.
            clouds::Parameters* p = processor_.mutable_parameters();
            p->trigger = triggerPending_;
            triggerPending_ = false;
            processor_.Process(inBuf_, outBuf_, clouds::kMaxBlockSize);
            outAvail_ = static_cast<int>(clouds::kMaxBlockSize);
            outRead_  = 0;
            inCount_  = 0;
        }
    }
    inline void nextOutputSample(float& l, float& r) {
        if (outRead_ < outAvail_) {
            l = static_cast<float>(outBuf_[outRead_].l);
            r = static_cast<float>(outBuf_[outRead_].r);
            ++outRead_;
        }
        // Under-run (input/output-fase nog niet in balans): herhaal de vorige
        // waarde — hoorbaar niets bij de eerste paar blokken na activatie.
    }

    audio_block_t*  inputQueue_[2] = { nullptr, nullptr };
    volatile bool   ready_ = false;
    volatile bool   triggerPending_ = false;
    float           level_ = 1.0f;
    volatile float  peak_  = 0.0f;
    std::unique_ptr<uint8_t[]> largeBuf_;
    std::unique_ptr<uint8_t[]> smallBuf_;

    clouds::GranularProcessor processor_;

    // 44.1k → 32k input-accumulator.
    clouds::ShortFrame inBuf_[clouds::kMaxBlockSize] = {};
    size_t inCount_  = 0;
    float  inPhase_  = 0.0f;
    float  prevL_ = 0.0f, prevR_ = 0.0f;

    // 32k → 44.1k output-resampler.
    clouds::ShortFrame outBuf_[clouds::kMaxBlockSize] = {};
    int   outRead_  = 0;
    int   outAvail_ = 0;
    float outPhase_ = 0.0f;
    float s0L_ = 0.0f, s1L_ = 0.0f, s0R_ = 0.0f, s1R_ = 0.0f;
};

// ---------------------------------------------------------------------------
// CloudsModule — AudioModule wrapper (tp_mmb_clouds).
// ---------------------------------------------------------------------------
class CloudsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_clouds";

    /// Genulde allocatie — zie ElementsModule: MI-DSP rekent op genulde
    /// (BSS-)staat; heap-garbage gaf NaN-ketens en wilde pointers.
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit CloudsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    CloudsVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<CloudsVoice*>(&voice_), 0, true };
        if (portId == "out_r")
            return { const_cast<CloudsVoice*>(&voice_), 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l")
            return { const_cast<CloudsVoice*>(&voice_), 0, true };
        if (portId == "in_r")
            return { const_cast<CloudsVoice*>(&voice_), 1, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l" || portId == "in_r")
            return PortKind::Audio;
        if (portId == "freeze" || portId == "trig") return PortKind::Gate;
        if (cvPortIs(portId, "position") || cvPortIs(portId, "size") ||
            cvPortIs(portId, "pitch")    || cvPortIs(portId, "density") ||
            cvPortIs(portId, "texture")  || cvPortIs(portId, "mix"))
            return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        clouds::Parameters* p = voice_.params();
        if (portId == "freeze") {
            p->freeze = value >= 0.5f;
        } else if (portId == "trig") {
            const bool high = value >= 0.5f;
            if (high && !lastTrigHigh_) voice_.pulseTrigger();
            lastTrigHigh_ = high;
        }
        else if (cvPortIs(portId, "position")) p->position = clamp01(value);
        else if (cvPortIs(portId, "size"))     p->size     = clamp01(value);
        else if (cvPortIs(portId, "pitch"))    p->pitch    = value * 12.0f;  // V/Oct → semitonen
        else if (cvPortIs(portId, "density"))  p->density  = clamp01(value);
        else if (cvPortIs(portId, "texture"))  p->texture  = clamp01(value);
        else if (cvPortIs(portId, "mix"))      p->dry_wet  = clamp01(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto asBool = [&](bool fallback) -> bool {
            if (auto* b = std::get_if<bool>   (&value)) return *b;
            if (auto* f = std::get_if<float>  (&value)) return *f >= 0.5f;
            if (auto* i = std::get_if<int32_t>(&value)) return *i != 0;
            return fallback;
        };
        clouds::Parameters* p = voice_.params();
        if      (controlId == "position") p->position      = clamp01(asFloat(0.5f));
        else if (controlId == "size")     p->size          = clamp01(asFloat(0.5f));
        else if (controlId == "pitch")    p->pitch         = asFloat(0.0f);
        else if (controlId == "density")  p->density       = clamp01(asFloat(0.5f));
        else if (controlId == "texture")  p->texture       = clamp01(asFloat(0.5f));
        else if (controlId == "mix")      p->dry_wet       = clamp01(asFloat(0.5f));
        else if (controlId == "spread")   p->stereo_spread = clamp01(asFloat(0.3f));
        else if (controlId == "feedback") p->feedback      = clamp01(asFloat(0.3f));
        else if (controlId == "reverb")   p->reverb        = clamp01(asFloat(0.3f));
        else if (controlId == "freeze")   p->freeze        = asBool(false);
        else if (controlId == "mode") {
            int m = static_cast<int>(asFloat(0.0f));
            if (m < 0) m = 0;
            if (m >= clouds::PLAYBACK_MODE_LAST) m = clouds::PLAYBACK_MODE_LAST - 1;
            voice_.processor().set_playback_mode(
                static_cast<clouds::PlaybackMode>(m));
        }
        else if (controlId == "level")    voice_.setLevel(clamp01(asFloat(1.0f)));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<CloudsModule>(id);
            });
    }

private:
    static float clamp01(float v) {
        return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v;
    }

    mutable CloudsVoice voice_;
    bool lastTrigHigh_ = false;
};

}  // namespace mmb_link
