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

constexpr std::size_t kAudioBlockSize  = 128;
constexpr std::uint32_t kAudioSampleHz = 44100;

class AudioModule : public Module {
public:
    using Module::Module;
    // Called once per audio block. Must be lock-free and short.
    virtual void update() = 0;
};

}  // namespace mb::runtime
