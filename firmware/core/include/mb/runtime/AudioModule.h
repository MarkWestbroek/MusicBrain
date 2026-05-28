#pragma once
/**
 * @file AudioModule.h
 * @brief Abstract base class for all audio-domain modules.
 *
 * @details
 * Audio modules process streams of audio samples at 44.1 kHz.  Examples
 * include VCOs (oscillators), VCFs (filters), VCAs (amplifiers), and the
 * USB audio output stage.  Each module is an `AudioStream`-compatible
 * node in the Teensy Audio library's DMA-driven graph.
 *
 * **Update ISR contract:**
 * The Teensy Audio library calls `update()` once per audio block from a
 * high-priority DMA / I²S ISR.  At 44.1 kHz and a block size of 128
 * samples, the deadline is approximately **2.9 ms**.  Implementations must:
 * - Be **lock-free**: no RTOS mutex, no `malloc`/`free`, no blocking I/O.
 * - Be **bounded**: no unbounded loops or recursive calls.
 * - Handle **concurrent `setControl()`** calls from the main thread by
 *   using atomic parameter swaps or similar strategies.
 *
 * **Concrete subclasses:** `VcoModule`, `VcfModule`, `VcaModule`,
 * `OutModule`.
 *
 * **Constants** `kAudioBlockSize` and `kAudioSampleHz` match the Teensy
 * Audio library defaults so buffer arithmetic and AudioStream integration
 * are consistent without magic numbers.
 *
 * **ADR reference:** ADR-0009 (module hierarchy).
 */

#include "Module.h"
#include <cstddef>
#include <cstdint>

namespace mb::runtime {

/** @brief Number of samples in one audio block, matching the Teensy Audio library. */
constexpr std::size_t kAudioBlockSize  = 128;

/** @brief Audio sample rate in Hz, matching the Teensy Audio library default. */
constexpr std::uint32_t kAudioSampleHz = 44100;

/** @brief Abstract base for all audio-domain modules. */
class AudioModule : public Module {
public:
    using Module::Module;

    /**
     * @brief Process one audio block.
     *
     * Called from the Teensy Audio DMA / I²S ISR approximately 344 times
     * per second (44100 / 128).  Must be lock-free, bounded, and safe
     * against concurrent `setControl()` calls from the main thread.
     */
    virtual void update() = 0;
};

}  // namespace mb::runtime
