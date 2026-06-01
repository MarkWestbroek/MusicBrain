#pragma once
/**
 * @file AudioModule.h
 * @brief Interface for modules that expose named Teensy Audio stream ports.
 *
 * Local copy for the `app-elements` spike target, mirroring the same-named
 * file in `app-modular-brain/src`.  Kept here so this target builds without a
 * cross-app include path; when `tp_mmb_elements` graduates into
 * app-modular-brain, delete this copy and use that app's AudioModule.h.
 */

#include "mb/runtime/Module.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief Describes one endpoint of a dynamic audio cable. */
struct AudioPort {
    AudioStream* stream  = nullptr; ///< Backing Teensy AudioStream object.
    uint8_t      channel = 0;       ///< Channel index (input or output) on that stream.
    bool         valid   = false;   ///< False when portId is not recognised.
    explicit operator bool() const { return valid; }
};

/** @brief Mixin for modules that expose Teensy Audio ports by name. */
class AudioModule : public mb::runtime::Module {
public:
    using Module::Module;

    bool supportsAudioPorts() const override { return true; }

    static AudioModule* from(mb::runtime::Module* m) {
        return (m && m->supportsAudioPorts())
            ? static_cast<AudioModule*>(m)
            : nullptr;
    }

    virtual AudioPort outputPort(std::string_view portId) const = 0;
    virtual AudioPort inputPort(std::string_view portId) const = 0;
};

}  // namespace mmb_link
