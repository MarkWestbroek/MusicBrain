#pragma once
/**
 * @file sample_player.h
 * @brief Sample-speler: één mono int16-sample, V/Oct-toonhoogte via
 *        fractionele interpolatie, start/end/loop, one-shot of gate-modus,
 *        lineaire attack/release.
 * @details
 * Header-only, float, samplerate-onafhankelijk; geen Arduino-afhankelijkheden.
 * Dezelfde code draait in `SamplerModule.h` (Teensy, sample in PSRAM) en in
 * de browser-simulator (`tools/mmb-wasm/sampler_wasm.cc`, sample in wasm-
 * geheugen). Het sample zelf blijft eigendom van de aanroeper; `setSample`
 * wisselt alleen de pointer (en stopt een lopende weergave).
 *
 * Toonhoogte: `voct` 0 = MIDI 60 (MMB-conventie). `root` is de MIDI-noot
 * waarop het sample oorspronkelijk staat; bij voct = (root−60)/12 speelt
 * het op de originele snelheid (gecorrigeerd voor de samplerate-ratio).
 */

#include <cmath>
#include <cstdint>

namespace mmb_dsp {

class SamplePlayer {
public:
    void Init(float sr) {
        sr_ = sr;
        setSample(nullptr, 0, sr);
        set_attack_ms(2.0f);
        set_release_ms(30.0f);
        recompute();
    }

    void setSample(const int16_t* data, int len, float rate) {
        data_ = data; len_ = len; rate_ = rate > 0.0f ? rate : sr_;
        playing_ = false; env_ = 0.0f; envState_ = ENV_IDLE;
        recompute();
    }
    bool hasSample() const { return data_ != nullptr && len_ > 1; }

    void set_voct(float v)      { voct_ = v; recompute(); }
    void set_root(float midi)   { root_ = midi; recompute(); }
    void set_coarse(float semi) { coarse_ = semi; recompute(); }
    void set_fine(float cents)  { fine_ = cents; recompute(); }
    void set_start(float s)     { start_ = clamp01(s); }
    void set_end(float e)       { end_ = clamp01(e); }
    void set_loop(bool l)       { loop_ = l; }
    /** false = one-shot (speelt tot end/loop), true = gate (stopt bij loslaten). */
    void set_gate_mode(bool g)  { gateMode_ = g; }
    void set_attack_ms(float ms)  { attackInc_  = 1.0f / (sr_ * (ms < 0.5f ? 0.5f : ms) * 0.001f); }
    void set_release_ms(float ms) { releaseInc_ = 1.0f / (sr_ * (ms < 0.5f ? 0.5f : ms) * 0.001f); }
    void set_level(float l)     { level_ = clamp01(l); }

    /** Gate-flank: stijgend = (her)start vanaf `start`; dalend = release in gate-modus. */
    void gate(bool high) {
        if (high && !gate_) trigger();
        else if (!high && gate_ && gateMode_) envState_ = ENV_RELEASE;
        gate_ = high;
    }
    void trigger() {
        if (!hasSample()) return;
        const float a = start_ < end_ ? start_ : end_;
        pos_ = a * static_cast<float>(len_ - 1);
        playing_ = true;
        envState_ = ENV_ATTACK;
    }

    inline float Process() {
        if (!playing_ || !data_) return 0.0f;
        // Envelope
        if (envState_ == ENV_ATTACK) {
            env_ += attackInc_;
            if (env_ >= 1.0f) { env_ = 1.0f; envState_ = ENV_SUSTAIN; }
        } else if (envState_ == ENV_RELEASE) {
            env_ -= releaseInc_;
            if (env_ <= 0.0f) { env_ = 0.0f; playing_ = false; envState_ = ENV_IDLE; return 0.0f; }
        }
        // Lees met lineaire interpolatie.
        const int   i0 = static_cast<int>(pos_);
        const float fr = pos_ - static_cast<float>(i0);
        const int   i1 = i0 + 1 < len_ ? i0 + 1 : i0;
        const float y = (data_[i0] + (data_[i1] - data_[i0]) * fr) * (1.0f / 32768.0f);
        // Voortbewegen; einde → loop of uitfaden.
        pos_ += inc_;
        const float a = start_ < end_ ? start_ : end_;
        const float b = start_ < end_ ? end_ : start_;
        const float endPos = b * static_cast<float>(len_ - 1);
        if (pos_ >= endPos) {
            if (loop_ && gate_ && b > a) {
                pos_ = a * static_cast<float>(len_ - 1) + (pos_ - endPos);
                if (pos_ >= endPos) pos_ = a * static_cast<float>(len_ - 1);
            } else if (loop_ && !gateMode_ && b > a) {
                pos_ = a * static_cast<float>(len_ - 1) + (pos_ - endPos);
            } else {
                pos_ = endPos;
                if (envState_ != ENV_RELEASE) envState_ = ENV_RELEASE;
            }
        }
        return y * env_ * level_;
    }

private:
    enum EnvState { ENV_IDLE, ENV_ATTACK, ENV_SUSTAIN, ENV_RELEASE };
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void recompute() {
        const float semis = 12.0f * voct_ + (60.0f - root_) + coarse_ + fine_ * 0.01f;
        inc_ = (rate_ / sr_) * std::exp2(semis / 12.0f);
    }

    float sr_ = 44100.0f, rate_ = 44100.0f;
    const int16_t* data_ = nullptr;
    int   len_ = 0;
    float pos_ = 0.0f, inc_ = 1.0f;
    float voct_ = 0.0f, root_ = 60.0f, coarse_ = 0.0f, fine_ = 0.0f;
    float start_ = 0.0f, end_ = 1.0f;
    bool  loop_ = false, gateMode_ = false, gate_ = false, playing_ = false;
    float env_ = 0.0f, attackInc_ = 0.01f, releaseInc_ = 0.001f, level_ = 0.8f;
    EnvState envState_ = ENV_IDLE;
};

}  // namespace mmb_dsp
