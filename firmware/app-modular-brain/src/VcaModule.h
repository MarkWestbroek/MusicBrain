#pragma once
/**
 * @file VcaModule.h
 * @brief VCA module (typeId `tp_mmb_vca`): wraps `AudioEffectMultiply`.
 *
 * @details
 * `AudioEffectMultiply` computes `output = input0 × input1`, which gives a
 * linear VCA when input0 carries the audio signal and input1 carries a 0 … 1
 * control voltage (typically the output of an `AhdsrAudioModule`'s DC proxy).
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel              |
 * |-----------|--------|--------|-------------------------------|
 * | input     | `in`   | Audio  | `mult_`, channel 0            |
 * | input     | `cv`   | Cv     | internal `cvDc_` -> channel 1 |
 * | output    | `out`  | Audio  | `mult_`, channel 0            |
 *
 * **Clean domain separation.**
 * The audio signal flows `in -> mult_ ch0 -> out` at 44.1 kHz through
 * `AudioGraph`.  The gain control comes in through the *CV domain*: `cv` is
 * declared `PortKind::Cv`, so `CvGraph` writes the modulator scalar via
 * `writeCvPort("cv", v)` at the 1 kHz control tick.  `AudioEffectMultiply`
 * needs an audio-rate signal on channel 1, so internally we keep a private
 * `AudioSynthWaveformDc cvDc_` whose amplitude mirrors the CV scalar.  That
 * DC object is an *implementation detail* — it is **not** exposed as an audio
 * port, so `AudioGraph` never wires `cv` and the two graphs stay disjoint.
 *
 * Controls:
 * | controlId | type    | effect                                 |
 * |-----------|---------|----------------------------------------|
 * | `gain`    | float   | Base gain — stored, not yet used       |
 * | `resp`    | int32_t | 0=Lin, 1=Exp — stored, not yet used    |
 *
 * In the current implementation the gain and response-curve controls are
 * captured for future use but not applied (the CV signal fully controls
 * the VCA amplitude via the multiply operation).
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief Linear VCA backed by `AudioEffectMultiply`. */
class VcaModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vca";

    explicit VcaModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        // The CV proxy is permanently wired to multiply channel 1.  `cv` is a
        // CV-only port now, so there is no competing audio source to clash
        // with.  Start at amplitude 0 = VCA closed until an envelope drives it.
        cvDc_.amplitude(0.0f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioEffectMultiply*>(&mult_), 0, true };
        return {};
    }

    /* Only `in` is an audio port.  `cv` is CV-domain (see file header) and is
     * intentionally not resolvable here, so AudioGraph never wires it. */
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioEffectMultiply*>(&mult_), 0, true };
        return {};
    }

    void setControl(std::string_view /*controlId*/,
                    mb::runtime::ControlValue /*value*/) override {
        // gain / resp stored for future use; multiply handles amplitude via CV
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `cv` is a CV-domain input; CvGraph routes to `writeCvPort`. */
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "cv") ? PortKind::Cv : PortKind::None;
    }

    /** @brief CV bridge entry point: mirror the scalar onto multiply channel 1
     *  through the always-connected internal DC proxy.
     *
     *  The CV bridge updates this at the ~1 kHz control tick, so writing the
     *  amplitude *instantly* would create a 1 ms staircase on the multiply
     *  gain — an audible zipper/click whose loudness depends on the audio
     *  level at each step (hence "inconsistent" clicks).  We instead slew the
     *  DC over `kCvSlewMs`, slightly longer than the tick interval, so
     *  consecutive updates join into a continuous piecewise-linear curve. */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId != "cv") return;
        cvDc_.amplitude(value, kCvSlewMs);
    }

    /** @brief Register the VCA factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VcaModule>(id);
            });
    }

private:
    mutable AudioEffectMultiply mult_;
    mutable AudioSynthWaveformDc cvDc_;  ///< DC proxy for CV-bridge-driven `cv`.
    /// Internal patch: CV-bridge DC proxy -> multiply channel 1 (always on).
    AudioConnection cvPatch_{ cvDc_, 0, mult_, 1 };

    /// DC slew time (ms) per CV update — de-zippers the ~1 kHz control tick.
    static constexpr float kCvSlewMs = 2.0f;
};

}  // namespace mmb_link
