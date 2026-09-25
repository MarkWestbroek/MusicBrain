#pragma once
// Stereo phaser: twee Phaser-cascades (dezelfde kern als de mono phaser) met
// de LFO van het rechterkanaal een `spread`-deel verschoven — 0 = mono, 0,5
// = een kwartslag (breed, draaiend), 1 = tegenfase (de notches van L zitten
// waar R open is). Mono in geeft stereo uit.
//
// Header-only, geen allocatie.
#include "phaser.h"

namespace mmb_dsp {

class StereoPhaser {
public:
    void Init(float sr) { ph_[0].Init(sr); ph_[1].Init(sr); set_spread(0.5f); }

    void set_rate(float hz)    { ph_[0].rate(hz); ph_[1].rate(hz); }
    void set_depth(float d)    { ph_[0].depth(d); ph_[1].depth(d); }
    void set_feedback(float f) { ph_[0].feedback(f); ph_[1].feedback(f); }
    void set_mix(float m)      { ph_[0].mix(m); ph_[1].mix(m); }
    void set_spread(float s)   { spread_ = s < 0.0f ? 0.0f : (s > 1.0f ? 1.0f : s); }

    /** In-place op x[0]/x[1]; `stereoIn` false = R krijgt L. */
    inline void Process(float* x, bool stereoIn) {
        // R volgt L's LFO met een vaste afstand (de LFO's lopen gelijk op,
        // dus elke stap volstaat één keer bijzetten).
        ph_[1].set_phase(ph_[0].phase() + spread_ * 0.5f);
        const float in1 = stereoIn ? x[1] : x[0];
        x[0] = ph_[0].Tick(x[0]);
        x[1] = ph_[1].Tick(in1);
    }

private:
    Phaser ph_[2];
    float  spread_ = 0.5f;
};

}  // namespace mmb_dsp
