#pragma once
// ADR 0009 — audio-processing module base class (firmware skeleton).
//
// Concrete subclasses include `Vco`, `Vcf`, `Svf`, `Vca`.
//
// On the audio Teensy (optional, possibly panel-less; see ADR 0009):
// a DMA/I2S ISR drives `update()` once per audio block (44100 / 128
// ≈ 344 Hz). The main brain Teensy does NOT run audio code — that
// separation keeps each processor inside its performance envelope.
//
// Block size and sample rate match the Teensy Audio library defaults.

#include "Module.h"
#include <cstddef>
#include <cstdint>

namespace mb::runtime {

// Block size (samples) and sample rate (Hz) match the Teensy Audio library
// defaults so we can drop in standard `AudioStream` plumbing later without
// changing buffer math elsewhere.
constexpr std::size_t kAudioBlockSize  = 128;
constexpr std::uint32_t kAudioSampleHz = 44100;

class AudioModule : public Module {
public:
    using Module::Module;

    // Called once per audio block from the audio-DMA / I²S ISR. Must be:
    //   - lock-free, no malloc, no blocking calls
    //   - bounded — the deadline is ~2.9 ms (128 / 44100 s)
    //   - reentrant-safe vs. `setControl` from the main thread (use
    //     atomic loads or coarse "swap when safe" semantics on parameters).
    // The implementation reads its input block(s) from the audio routing
    // layer (TBD), processes them, and writes the output block(s).
    virtual void update() = 0;
};

}  // namespace mb::runtime
