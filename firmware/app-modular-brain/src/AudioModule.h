#pragma once
/**
 * @file AudioModule.h
 * @brief Interface for modules that expose named Teensy Audio stream ports.
 *
 * Modules that wrap AudioStream objects (VCO, VCA, AHDSR-DC, Out, etc.)
 * inherit from AudioModule and implement outputPort() / inputPort().
 * AudioGraph queries these at patch-activation time to create the dynamic
 * AudioConnection objects that wire the signal path together.
 *
 * **Port descriptor:**
 * `AudioPort` carries a raw `AudioStream*` pointer plus the channel index
 * on that stream.  Both are needed because many Teensy Audio objects have
 * multiple inputs/outputs (e.g. AudioEffectMultiply has two inputs).
 *
 * **const semantics:**
 * The audio stream members are declared `mutable` in subclasses because
 * the Teensy Audio ISR modifies them independently of the module's logical
 * state.  `outputPort()` / `inputPort()` are therefore `const` from the
 * module's perspective even though they return non-const stream pointers.
 */

#include "mb/runtime/Module.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/**
 * @brief Match a CV-port id tegen zijn canonieke naam, inclusief de
 *        `_cv`-gesuffixte alias die de editor-panelen gebruiken.
 *
 * De editor noemt CV-jacks op effect-/bron-panelen `fbk_cv`, `rate_cv`, …
 * terwijl de firmware de kale naam hanteert. Beide zijn geldig:
 * `cvPortIs("fbk_cv", "fbk")` en `cvPortIs("fbk", "fbk")` → true.
 */
inline bool cvPortIs(std::string_view portId, std::string_view name) {
    if (portId == name) return true;
    constexpr std::string_view kSuffix = "_cv";
    return portId.size() == name.size() + kSuffix.size()
        && portId.substr(0, name.size()) == name
        && portId.substr(name.size()) == kSuffix;
}

/** @brief Describes one endpoint of a dynamic audio cable. */
struct AudioPort {
    AudioStream* stream  = nullptr; ///< Backing Teensy AudioStream object.
    uint8_t      channel = 0;       ///< Channel index (input or output) on that stream.
    bool         valid   = false;   ///< False when portId is not recognised.

    /** @brief Implicit bool conversion — true when the port is usable. */
    explicit operator bool() const { return valid; }
};

/**
 * @brief Mixin for modules that expose Teensy Audio ports by name.
 *
 * Inherit from this class to participate in the dynamic audio graph.
 * AudioGraph calls `outputPort()` on the source module and `inputPort()`
 * on the destination module, then creates one `AudioConnection` per
 * matched pair.
 *
 * `supportsAudioPorts()` is overridden to return `true` so that
 * `AudioModule::from()` can safely `static_cast` without RTTI.
 */
class AudioModule : public mb::runtime::Module {
public:
    using Module::Module;

    bool supportsAudioPorts() const override { return true; }

    /**
     * @brief Safely cast a `Module*` to `AudioModule*` without RTTI.
     * @return Non-null pointer iff @p m supports audio ports; nullptr otherwise.
     */
    static AudioModule* from(mb::runtime::Module* m) {
        return (m && m->supportsAudioPorts())
            ? static_cast<AudioModule*>(m)
            : nullptr;
    }

    /**
     * @brief Return the named output audio port.
     * @param portId  Port identifier as it appears in the project JSON
     *                (e.g. `"out"`, `"cv_out"`).
     * @return Valid `AudioPort` when the id is recognised; invalid otherwise.
     */
    virtual AudioPort outputPort(std::string_view portId) const = 0;

    /**
     * @brief Return the named input audio port.
     * @param portId  Port identifier (e.g. `"in"`, `"cv"`, `"l"`, `"r"`).
     * @return Valid `AudioPort` when the id is recognised; invalid otherwise.
     */
    virtual AudioPort inputPort(std::string_view portId) const = 0;
};

}  // namespace mmb_link
