#pragma once
// Stereo bandecho: twee TapeEcho-sporen (L/R) met eigen bandsnelheid
// (`ratio` = R-tijd / L-tijd) en cross-feedback: de natte waarde van het
// ene spoor gaat mee de schrijfkop van het andere in. Cross 1 + feedback 0
// = klassiek ping-pong; cross en feedback samen = een wolk die van links
// naar rechts kruipt. De wow/flutter van R loopt een kwartslag achter op L,
// zodat de twee sporen niet in de maat zweven (breedte).
//
// Header-only, zelfde regels als tape_echo.h: geen allocatie, de band
// (int16, per spoor bufferLength() samples) komt van buiten.
#include "tape_echo.h"

namespace mmb_dsp {

class StereoTapeEcho {
public:
    static int bufferLength(float sr) { return TapeEcho::bufferLength(sr); }

    void Init(float sr, int16_t* bufL, int16_t* bufR, int bufferLen) {
        ch_[0].Init(sr, bufL, bufferLen);
        ch_[1].Init(sr, bufR, bufferLen);
        ch_[1].set_mod_phase(1.5707963f, 3.3f);
        time_ = 0.35f; ratio_ = 1.0f; applyTime();
    }

    void set_time(float seconds) { time_ = seconds; applyTime(); }
    /** R-tijd als factor van L (0,5..2): 0,75 of 1,5 geeft dotted patronen. */
    void set_ratio(float r)      { ratio_ = r < 0.25f ? 0.25f : (r > 4.0f ? 4.0f : r); applyTime(); }
    void set_feedback(float f)   { ch_[0].set_feedback(f); ch_[1].set_feedback(f); }
    void set_cross(float c)      { cross_ = c < 0.0f ? 0.0f : (c > 1.1f ? 1.1f : c); }
    void set_mix(float m)        { ch_[0].set_mix(m); ch_[1].set_mix(m); }
    void set_tone(float t)       { ch_[0].set_tone(t); ch_[1].set_tone(t); }
    void set_wow(float w)        { ch_[0].set_wow(w); ch_[1].set_wow(w); }
    void set_flutter(float f)    { ch_[0].set_flutter(f); ch_[1].set_flutter(f); }
    void set_drive(float d)      { ch_[0].set_drive(d); ch_[1].set_drive(d); }

    bool ready() const { return ch_[0].ready() && ch_[1].ready(); }

    /** In-place op x[0] (L) en x[1] (R). */
    inline void Process(float* x) {
        // Beide sporen lezen eerst de natte waarde van de vorige stap van
        // de ander: één sample vertraging in de kruising, onhoorbaar.
        const float wl = ch_[0].wet(), wr = ch_[1].wet();
        x[0] = ch_[0].Process(x[0], cross_ * wr);
        x[1] = ch_[1].Process(x[1], cross_ * wl);
    }

private:
    void applyTime() { ch_[0].set_time(time_); ch_[1].set_time(time_ * ratio_); }

    TapeEcho ch_[2];
    float    time_ = 0.35f, ratio_ = 1.0f, cross_ = 0.0f;
};

}  // namespace mmb_dsp
