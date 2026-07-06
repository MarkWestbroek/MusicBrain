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
 * | input     | `l`    | `masterAmpL`, channel 0    |
 * | input     | `r`    | `masterAmpR`, channel 0    |
 *
 * Controls:
 * | controlId | type  | effect                             |
 * |-----------|-------|------------------------------------|
 * | `level`   | float | Master output level (0…1, gain op beide kanalen) |
 *
 * De `level`-control stuurt een echt gain-paar: twee gedeelde
 * `AudioAmplifier`s tussen de patch en `usbOut`.  Gedeeld (statics) omdat
 * er één USB-sink is en retired OutModule-instanties anders permanent de
 * usbOut-ingangen zouden bezetten met hun interne connections.
 *
 * **Setup:** call `OutModule::attachSink(&usbOut)` in `setup()` before
 * activating any patch that contains an Out module.  If the sink was not
 * attached when `inputPort()` is called, an invalid `AudioPort` is returned
 * and `AudioGraph` will skip the connection.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Audio output module — routes L/R inputs to the shared USB audio sink. */
class OutModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_out";

    /**
     * @brief Pointer to the application-global `AudioOutputUSB`.
     * Set via `attachSink()`; kept public for diagnose-doeleinden.
     */
    inline static AudioOutputUSB* sharedOutput = nullptr;

    /** @brief Gedeeld master-gain-paar vóór de USB-sink (level-control). */
    static AudioAmplifier& masterAmpL() { static AudioAmplifier a; return a; }
    static AudioAmplifier& masterAmpR() { static AudioAmplifier a; return a; }

    /** @brief Peak-meters op de master-uitgang (telemetrie: `outPeak`). */
    static AudioAnalyzePeak& masterPeakL() { static AudioAnalyzePeak p; return p; }
    static AudioAnalyzePeak& masterPeakR() { static AudioAnalyzePeak p; return p; }

    /** @brief Hoogste |output| (L/R) sinds de vorige uitlezing, 0…1. */
    static float takeMasterPeak() {
        float l = masterPeakL().available() ? masterPeakL().read() : 0.0f;
        float r = masterPeakR().available() ? masterPeakR().read() : 0.0f;
        return l > r ? l : r;
    }

    /**
     * @brief Koppel de USB-sink éénmalig in `setup()`:
     * @code
     *     OutModule::attachSink(&usbOut);
     * @endcode
     * Maakt de permanente amp→usb-connections en zet de gains op 1.0.
     */
    static void attachSink(AudioOutputUSB* usb) {
        sharedOutput = usb;
        masterAmpL().gain(1.0f);
        masterAmpR().gain(1.0f);
        static AudioConnection l{ masterAmpL(), 0, *usb, 0 };
        static AudioConnection r{ masterAmpR(), 0, *usb, 1 };
        static AudioConnection pl{ masterAmpL(), 0, masterPeakL(), 0 };
        static AudioConnection pr{ masterAmpR(), 0, masterPeakR(), 0 };
    }

    explicit OutModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {}

    AudioPort outputPort(std::string_view /*portId*/) const override {
        return {};  // Out module has no audio outputs
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (!sharedOutput) return {};
        if (portId == "l") return { &masterAmpL(), 0, true };
        if (portId == "r") return { &masterAmpR(), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        if (controlId != "level") return;
        float v = 1.0f;
        if      (auto* f = std::get_if<float>       (&value)) v = *f;
        else if (auto* i = std::get_if<std::int32_t>(&value)) v = static_cast<float>(*i);
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        masterAmpL().gain(v);
        masterAmpR().gain(v);
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
