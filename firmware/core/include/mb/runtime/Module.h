#pragma once
/**
 * @file Module.h
 * @brief Abstract base class for all MusicBrain runtime modules.
 *
 * @details
 * Every buildable block in the modular system — whether a VCO, an AHDSR,
 * an LFO, or a MIDI input — is represented at runtime by a `Module`
 * subclass.  The hierarchy mirrors the TypeScript runtime in the editor
 * (`editor/src/modular-mb/runtime/Module.ts`) so that module behaviour can
 * be described once and tested independently of the Teensy target.
 *
 * Two sub-hierarchies extend this base:
 * - `AudioModule` — for signal-generating / signal-processing modules that
 *   interact directly with the Teensy Audio library.
 * - `CvModule` — for modules that produce CV values at the 1 kHz CV tick
 *   rate (envelopes, LFOs, sequencers).
 *
 * **Layer-2 control protocol:**
 * The editor can send real-time control changes to a live module via the
 * TeensyLink.  Changes arrive as `{"controlId":"...","value":...}` inside a
 * patch connection or control-state object and are dispatched to the
 * relevant module via `setControl()`.  Subclasses are expected to handle any
 * control id they know and silently ignore anything unfamiliar, so older
 * patches remain compatible with newer firmware builds.
 *
 * **ADR reference:** ADR-0009 (firmware/doc/adr/).
 */

#include "../Types.h"
#include <cstdint>
#include <string>
#include <string_view>
#include <variant>

namespace mb::runtime {

/**
 * @brief A variant holding any scalar control value that can be sent from the editor.
 *
 * `float` — continuous knob / CV (e.g. frequency ratio, time in ms).\n
 * `bool`  — toggle / gate.\n
 * `int32_t` — discrete selector (waveform, curve, voice count).
 */
using ControlValue = std::variant<float, bool, int32_t>;

/**
 * @brief Abstract base for all runtime module objects.
 *
 * Holds the module's immutable identity (typeId + instance id) and declares
 * the one virtual method that every concrete module must implement.
 */
class Module {
public:
    /** Stores both ids by value so they outlive temporary factory lambdas. */
    Module(std::string_view typeId, std::string_view id)
        : typeId_(typeId), id_(id) {}
    virtual ~Module() = default;

    /** @brief Instance id assigned by the project (e.g. `"vco1"`).  Unique
     *  within a project; used as the map key in ProjectRuntime. */
    std::string_view id()     const { return id_; }

    /** @brief Module-type id from the catalog (e.g. `"tp_mmb_ahdsr"`).  Set
     *  at construction time and immutable for the lifetime of the instance. */
    std::string_view typeId() const { return typeId_; }

    /**
     * @brief Apply a layer-2 control change from the editor.
     *
     * Called on the main thread when a knob, switch, or CV input changes
     * value in the browser editor.  Implementations must be cheap and
     * non-blocking.  **Unknown @p controlId values must be silently
     * ignored** so that older patches remain loadable on newer firmware.
     *
     * @param controlId  Identifier matching the control definition in the
     *                   module-type catalog (e.g. `"attackMs"`).
     * @param value      New value; the active alternative in the variant
     *                   matches the declared type of the control.
     */
    virtual void setControl(std::string_view controlId, ControlValue value) = 0;

    /**
     * @brief Returns true if this module exposes Teensy Audio stream ports.
     *
     * Used in place of `dynamic_cast` (which requires RTTI, disabled on
     * Teensy builds) to identify `AudioPortModule` subclasses.  The default
     * implementation returns false; `AudioPortModule` overrides it to true.
     * Callers may then safely `static_cast<AudioPortModule*>` the pointer.
     */
    virtual bool supportsAudioPorts() const { return false; }

    /** @brief Logical kind of a module port — drives graph routing.
     *
     *  `Audio` ports are wired by `AudioGraph` (Teensy `AudioConnection`).
     *  `Cv` / `Gate` ports are routed by `CvGraph` via the `CvBus` and
     *  `readCvPort()` / `writeCvPort()`.  `None` means the port id is
     *  unknown to this module.  A single port id has exactly one kind. */
    enum class PortKind : std::uint8_t { None, Audio, Cv, Gate };

    /** @brief Declared kind of an output port.  Default: `None`. */
    virtual PortKind outputPortKind(std::string_view /*portId*/) const {
        return PortKind::None;
    }

    /** @brief Declared kind of an input port.  Default: `None`. */
    virtual PortKind inputPortKind(std::string_view /*portId*/) const {
        return PortKind::None;
    }

    /** @brief Sample the current value of a CV/gate output port.
     *
     *  Called by the CV bridge once per CV tick (1 kHz).  The default
     *  returns `0.0f` so modules without CV outputs need no override.
     *  Implementations must be O(1) and safe to call from the CV-tick
     *  context (currently the main loop's 1 ms poll; promoted to
     *  `IntervalTimer` ISR in a later step). */
    virtual float readCvPort(std::string_view /*portId*/) const {
        return 0.0f;
    }

    /** @brief Deliver a new value to a CV/gate input port.
     *
     *  Called by the CV bridge whenever a publisher's value has changed.
     *  The wrapper module is responsible for translating the value to
     *  whatever its internal implementation needs (e.g. a Teensy Audio
     *  parameter setter, a DC waveform amplitude, an SPI DAC code).
     *  The patch and the bus never see those implementation details. */
    virtual void writeCvPort(std::string_view /*portId*/, float /*value*/) {}

protected:
    std::string typeId_;
    std::string id_;
};

}  // namespace mb::runtime
