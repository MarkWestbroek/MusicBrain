#pragma once
/**
 * @file AhdsrAudioModule.h
 * @brief AHDSR envelope, CV-domain output (typeId `tp_mmb_ahdsr`).
 *
 * @details
 * Wraps the tick-based AHDSR envelope logic from `mb::runtime::Ahdsr`
 * (via composition) and exposes its value on the CV-domain port `cv_out`.
 *
 * **Signal domains (clean separation).**
 * This module lives entirely in the *CV domain*: its value is produced by a
 * 1 kHz software tick and published through the CV bridge (`readCvPort`), not
 * as a Teensy Audio-library 44.1 kHz stream.  Consumers (`VcaModule`,
 * `VcfModule`) receive the scalar via their own `writeCvPort` and turn it
 * into the audio-rate signal their DSP object needs.  There is no audio
 * DC-proxy here any more — audio->audio routing belongs to `AudioGraph`,
 * cv->cv routing belongs to `CvGraph`, and the two never overlap.
 *
 * This class registers as `"tp_mmb_ahdsr"` in the app's `Registry`,
 * replacing the pure-CV `mb::runtime::Ahdsr` so the richer controls apply.
 *
 * Port map:
 * | Direction | portId   | Domain | Notes                          |
 * |-----------|----------|--------|--------------------------------|
 * | input     | `gate`   | Gate   | note-on/off, driven via bridge |
 * | input     | `trig`   | Gate   | retrigger, driven via bridge   |
 * | output    | `cv_out` | Cv     | envelope value 0..1            |
 *
 * Controls (same ids as `mb::runtime::Ahdsr`):
 * `attack`, `hold`, `decay`, `sustain`, `release`, `loop`, `curve` —
 * all forwarded to the embedded `Ahdsr`.
 *
 * **Tick:** call `tick()` once per millisecond from the main loop or a
 * 1 kHz soft-timer.  Each call advances the envelope state machine.
 *
 * **Gate:** call `setGate(true)` on note-on and `setGate(false)` on note-off.
 *
 * **Registry overwrite:** `AhdsrAudioModule::registerFactory()` must be
 * called *after* any `Ahdsr::registerFactory()` call (including the static
 * auto-registration in `Ahdsr.cpp`) so this factory wins.
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
    }

    /**
     * @brief Advance the envelope by one millisecond.
     *
     * Drives the AHDSR state machine forward by one tick (1 ms at 1 kHz).
     * The new value is read out through the CV bridge (`readCvPort`), so the
     * audio graph never touches this module directly.
     *
     * Safe to call from `loop()` or a soft-timer.
     */
    void tick() {
        env_.tick();
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

    /* No audio ports: this module is pure CV-domain (see file header).
     * Returning invalid ports makes AudioGraph skip every connection that
     * touches this module, so cv_out is routed exclusively by CvGraph. */
    AudioPort outputPort(std::string_view /*portId*/) const override {
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

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `cv_out` is a CV-domain output carrying the envelope value. */
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "cv_out") ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "gate" || portId == "trig") ? PortKind::Gate
                                                      : PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return (portId == "cv_out") ? env_.value() : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") env_.setGate(value >= 0.5f);
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
    mb::runtime::Ahdsr           env_; ///< Tick-based envelope logic (composition).
};

}  // namespace mmb_link
