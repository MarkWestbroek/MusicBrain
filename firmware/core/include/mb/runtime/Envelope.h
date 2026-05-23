#pragma once
// ADR 0009 — abstract Envelope (intermediate base between CvModule and
// concrete envelope generators such as Ahdsr, MultiphaseEnvelope,
// SampledEnvelope). Mirrors the UML hierarchy:
//
//   CvModule
//     ├── Envelope                 (abstract)
//     │     ├── Ahdsr
//     │     ├── MultiphaseEnvelope
//     │     └── SampledEnvelope
//     ├── Lfo
//     ├── Sequencer
//     ├── CvTransformer
//     └── ...
//
// All envelopes share the same external interface: a gate input and a
// single 0..1 CV output. Internal phase model is subclass-specific.

#include "CvModule.h"

namespace mb::runtime {

class Envelope : public CvModule {
public:
    using CvModule::CvModule;

    // Gate input. Rising edge starts the attack (or retriggers); falling
    // edge starts the release. Implementations decide retrigger policy.
    virtual void setGate(bool open) = 0;

    // Current envelope value, normalised 0.0 .. 1.0.
    virtual float value() const = 0;

    // True while the envelope is producing a non-zero / non-idle value.
    // Used by voice allocators to decide when a voice is free.
    virtual bool active() const = 0;
};

}  // namespace mb::runtime
