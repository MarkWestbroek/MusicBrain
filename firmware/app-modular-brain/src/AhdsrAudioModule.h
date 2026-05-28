#pragma once
/**
 * @file AhdsrAudioModule.h
 * @brief AHDSR envelope with audio DC proxy output (typeId `tp_mmb_ahdsr`).
 *
 * @details
 * Combines the tick-based AHDSR envelope logic from `mb::runtime::Ahdsr`
 * (via composition) with an `AudioSynthWaveformDc` object that mirrors the
 * current envelope value as an audio-rate DC signal.  The DC stream is
 * exposed as port `cv_out` so `AudioGraph` can wire it directly to an audio
 * input — typically the `cv` input of a `VcaModule`.
 *
 * This class registers as `"tp_mmb_ahdsr"` in the app's `Registry`,
 * replacing the pure-CV `mb::runtime::Ahdsr` for audio-domain patches.
 *
 * Port map:
 * | Direction | portId   | AudioStream / channel  |
 * |-----------|----------|------------------------|
 * | output    | `cv_out` | `dc_`, channel 0       |
 *
 * (Inputs `gate` and `trig` are CV-domain; driven via `setGate()`.)
 *
 * Controls (same ids as `mb::runtime::Ahdsr`):
 * `attack`, `hold`, `decay`, `sustain`, `release`, `loop`, `curve` —
 * all forwarded to the embedded `Ahdsr`.
 *
 * **Tick:** call `tick()` once per millisecond from the main loop or a
 * 1 kHz soft-timer.  Each call advances the envelope and pushes the new
 * value to `dc_.amplitude()`.  The DC update is ISR-safe (AudioSynthWaveformDc
 * uses `__disable_irq` / `__enable_irq` internally).
 *
 * **Gate:** call `setGate(true)` on note-on and `setGate(false)` on note-off.
 *
 * **Registry overwrite:** `AhdsrAudioModule::registerFactory()` must be
 * called *after* any `Ahdsr::registerFactory()` call (including the static
 * auto-registration in `Ahdsr.cpp`) so the audio-capable factory wins.
 * `Registry::register_()` uses insert-or-assign semantics (last writer wins).
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include "mb/runtime/Ahdsr.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief AHDSR envelope generator with an audio DC output proxy. */
class AhdsrAudioModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ahdsr";

    explicit AhdsrAudioModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
        , env_(id)           // embedded Ahdsr shares the same instance id
    {
        dc_.amplitude(0.0f);
    }

    /**
     * @brief Advance the envelope by one millisecond and update the DC proxy.
     *
     * Drives the AHDSR state machine forward by one tick (1 ms at 1 kHz),
     * then writes the new envelope value to `dc_.amplitude()` so the audio
     * graph sees it immediately on the next audio block.
     *
     * Safe to call from `loop()` or a soft-timer; `AudioSynthWaveformDc`
     * handles its own interrupt protection internally.
     */
    void tick() {
        env_.tick();
        dc_.amplitude(env_.value());
    }

    /**
     * @brief Set the gate input (note-on = true, note-off = false).
     *
     * Rising edge starts or retriggers the Attack phase.
     * Falling edge transitions to Release from the current level.
     */
    void setGate(bool open) { env_.setGate(open); }

    /** @brief Current envelope output value in [0, 1]. */
    float value() const { return env_.value(); }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "cv_out")
            return { const_cast<AudioSynthWaveformDc*>(&dc_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // gate/trig are CV-domain, driven via setGate()
    }

    /** @brief Forward all controls to the embedded Ahdsr (attack/hold/decay/etc.). */
    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        env_.setControl(controlId, value);
    }

    /**
     * @brief Register the audio AHDSR factory, overwriting any existing
     *        `"tp_mmb_ahdsr"` entry (e.g. from `Ahdsr`'s static auto-init).
     *
     * Call this from `registerAllRuntimeModules()` **after** any other
     * AHDSR registration to ensure this factory wins.
     */
    static void registerFactory() {
        // Unconditional overwrite — no `has()` guard — so this factory
        // replaces the pure-CV Ahdsr factory even if it was registered first
        // by the static initialiser in Ahdsr.cpp.
        mb::runtime::Registry::global().register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<AhdsrAudioModule>(id);
            });
    }

private:
    mutable AudioSynthWaveformDc dc_;  ///< Audio proxy for the envelope value.
    mb::runtime::Ahdsr           env_; ///< Tick-based envelope logic (composition).
};

}  // namespace mmb_link
