#pragma once
/**
 * @file CvModule.h
 * @brief Abstract base class for all CV-domain (control-voltage) modules.
 *
 * @details
 * CV modules produce or transform low-frequency control signals: envelopes,
 * LFOs, sequencer rows, CV breakout channels, etc.  They do not touch audio
 * samples directly; instead they run at a much lower "control rate" that is
 * sufficient to track a knob turn or the attack of an envelope without
 * burning CPU on audio-rate computation.
 *
 * **Tick ISR contract:**
 * A hardware timer ISR on the Teensy calls `tick()` at exactly
 * `kCvTickRateHz` (1 kHz = 1 ms period).  Implementations therefore
 * receive 1 000 calls per second and must each complete well within one
 * period.  Concrete rules:
 * - **Lock-free**: no RTOS mutex, no `malloc`/`free`, no blocking I/O.
 * - **Bounded**: every code path must finish in a fixed, short time.
 * - **Concurrency**: `setControl()` can be called from the main thread
 *   between ticks.  Shared scalars that a tick may read must be written
 *   atomically or protected with `__disable_irq()` / `__enable_irq()`.
 *
 * **Concrete subclasses:** `Ahdsr`, `Lfo`, `CvBreakout`, `CvBreakIn`,
 * `ControllerBreakIn`.
 *
 * **ADR reference:** ADR-0008 (CV tick rate), ADR-0009 (module hierarchy).
 */

#include "Module.h"
#include <cstdint>

namespace mb::runtime {

/** @brief Number of `tick()` calls per second for all CV-domain modules.
 *  1 kHz gives 1 ms resolution — sufficient for envelopes, LFOs, and
 *  sequencer steps, with ample CPU budget on Teensy 3.x / 4.x. */
constexpr std::uint32_t kCvTickRateHz = 1000;

/** @brief Abstract base for all CV-domain modules. */
class CvModule : public Module {
public:
    using Module::Module;

    /**
     * @brief Advance the module's internal state by one CV tick (1 ms).
     *
     * Called from the CV-domain timer ISR at `kCvTickRateHz`.  Must be
     * lock-free, bounded in runtime, and written assuming concurrent
     * `setControl()` calls from the main thread may interleave.
     */
    virtual void tick() = 0;

    /** @brief Typed CV-domain view used by the CV tick scheduler.
     *  Every `CvModule` is, by definition, tickable. */
    CvModule* asCvModule() override { return this; }
};

}  // namespace mb::runtime
