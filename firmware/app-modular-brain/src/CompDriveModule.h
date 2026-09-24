#pragma once
/**
 * @file CompDriveModule.h
 * @brief Compressor + light overdrive (typeId `tp_mmb_comp`): a custom
 *        `AudioStream` dynamics processor (FW-FX-2).
 *
 * @details
 * The stock Teensy Audio library has **no** compressor object, so this builds
 * one from scratch — a deliberate "outside the audio-lib" experiment.  The
 * embedded @ref AudioEffectCompDrive is a peak-sensing feed-forward
 * compressor: it follows the signal envelope with an attack/release one-pole,
 * computes gain reduction in the dB domain above a threshold, applies make-up
 * gain, then runs the result through a `tanh` soft-clip for a gentle
 * tube-style overdrive.
 *
 * Signal path is entirely inside the single `AudioEffectCompDrive` object:
 * `in -> [envelope follow → gain → soft-clip] -> out`.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel        |
 * |-----------|--------|--------|-------------------------|
 * | input     | `in`   | Audio  | `comp_`, channel 0      |
 * | output    | `out`  | Audio  | `comp_`, channel 0      |
 *
 * Controls:
 * | controlId   | type  | range      | default | effect                     |
 * |-------------|-------|------------|---------|----------------------------|
 * | `threshold` | float | -60 … 0 dB | -18     | Compression threshold      |
 * | `ratio`     | float | 1 … 20     | 4       | Compression ratio (n:1)    |
 * | `attack`    | float | 1 … 200 ms | 10      | Envelope attack time       |
 * | `release`   | float | 10 … 1000  | 120     | Envelope release time (ms) |
 * | `makeup`    | float | 0 … 24 dB  | 0       | Output make-up gain        |
 * | `drive`     | float | 0 … 1      | 0.2     | Overdrive / saturation     |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

#include "mmb_dsp/comp_drive.h"

namespace mmb_link {

/**
 * @brief AudioStream-schil rond de kernel @ref mmb_dsp::CompDrive
 *        (firmware/lib/mmb-dsp/mmb_dsp/comp_drive.h), gedeeld met de browser;
 *        bit-identiek geverifieerd, 2026-09-24.
 *
 * Feed-forward peak compressor with a soft-clip overdrive stage.
 *
 * Runs at audio rate in its own `update()`.  All parameters are plain members
 * updated from the control thread; reads/writes of `float` are atomic enough
 * on the M7 for this non-critical use (a torn parameter just means one block
 * uses a slightly stale coefficient).
 */
class AudioEffectCompDrive : public AudioStream {
public:
    AudioEffectCompDrive() : AudioStream(1, inputQueueArray_) { k_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void threshold(float db)  { k_.threshold(db); }
    void ratio(float r)       { k_.ratio(r); }
    void attack(float ms)     { k_.attack(ms); }
    void releaseTime(float ms){ k_.releaseTime(ms); }
    void makeup(float db)     { k_.makeup(db); }
    void drive(float d)       { k_.drive(d); }

    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float y = k_.Tick(block->data[i] * (1.0f / 32768.0f));
            block->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
        transmit(block, 0);
        release(block);
    }

private:
    audio_block_t* inputQueueArray_[1] = { nullptr };
    mmb_dsp::CompDrive k_;
};

/** @brief Module wrapper around @ref AudioEffectCompDrive. */
class CompDriveModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_comp";

    explicit CompDriveModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        comp_.attack(10.0f);
        comp_.releaseTime(120.0f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioEffectCompDrive*>(&comp_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioEffectCompDrive*>(&comp_), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "threshold") comp_.threshold(asFloat(-18.0f));
        else if (controlId == "ratio")     comp_.ratio(asFloat(4.0f));
        else if (controlId == "attack")    comp_.attack(asFloat(10.0f));
        else if (controlId == "release")   comp_.releaseTime(asFloat(120.0f));
        else if (controlId == "makeup")    comp_.makeup(asFloat(0.0f));
        else if (controlId == "drive")     comp_.drive(asFloat(0.2f));
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `threshold` and `drive` are CV-domain inputs (sidechain-style
     *  dynamic compression / envelope-driven saturation). */
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in")                            return PortKind::Audio;
        // Editor-jacks heten thr_cv/drive_cv; cvPortIs dekt drive_cv,
        // thr_cv is een verkorte alias die we expliciet accepteren.
        if (portId == "thr_cv" || cvPortIs(portId, "threshold") ||
            cvPortIs(portId, "drive"))                 return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "thr_cv" || cvPortIs(portId, "threshold")) comp_.threshold(value);
        else if (cvPortIs(portId, "drive"))                           comp_.drive(value);
    }

    /** @brief Register the compressor factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<CompDriveModule>(id);
            });
    }

private:
    mutable AudioEffectCompDrive comp_;
};

}  // namespace mmb_link
