#pragma once
/**
 * @file OutModule.h
 * @brief Audio output module (typeId `tp_mmb_out`): routes to USB audio.
 *
 * @details
 * There is exactly one `AudioOutputUSB` object in the system (declared as a
 * global in `main.cpp`).  `OutModule` does not own one; instead a shared
 * pointer to the global sink is set once during `setup()` via
 * `OutModule::sharedOutput = &usbOut`.  All `OutModule` instances reference
 * that single sink.
 *
 * Port map:
 * | Direction | portId | AudioStream / channel      |
 * |-----------|--------|----------------------------|
 * | input     | `l`    | `*sharedOutput`, channel 0 |
 * | input     | `r`    | `*sharedOutput`, channel 1 |
 *
 * Controls:
 * | controlId | type  | effect                             |
 * |-----------|-------|------------------------------------|
 * | `level`   | float | Master output level (future gain stage) |
 *
 * **Setup:** call `OutModule::sharedOutput = &usbOut` in `setup()` before
 * activating any patch that contains an Out module.  If `sharedOutput` is
 * null when `inputPort()` is called, an invalid `AudioPort` is returned and
 * `AudioGraph` will skip the connection.
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief Audio output module — routes L/R inputs to the shared USB audio sink. */
class OutModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_out";

    /**
     * @brief Pointer to the application-global `AudioOutputUSB`.
     * Must be set once in `setup()` before any patch is activated:
     * @code
     *     OutModule::sharedOutput = &usbOut;
     * @endcode
     */
    inline static AudioOutputUSB* sharedOutput = nullptr;

    explicit OutModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {}

    AudioPort outputPort(std::string_view /*portId*/) const override {
        return {};  // Out module has no audio outputs
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (!sharedOutput) return {};
        if (portId == "l") return { sharedOutput, 0, true };
        if (portId == "r") return { sharedOutput, 1, true };
        return {};
    }

    void setControl(std::string_view /*controlId*/,
                    mb::runtime::ControlValue /*value*/) override {
        // level: future pre-output gain stage
    }

    /** @brief Register the Out factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<OutModule>(id);
            });
    }
};

}  // namespace mmb_link
