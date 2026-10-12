#pragma once
// De CV-ingangen van Elements met hun attenuverters, zoals op het origineel
// (fw 0.5.111). Gedeeld door ElementsModule.h (Teensy) en elements_wasm.cc
// (simulator), zodat beide dezelfde tabel en dezelfde som hebben.
//
// Het origineel (elements/cv_scaler.cc, `BIND`): waarde = knop + attenuverter
// × CV, begrensd tot [0, 0.9995] (Space tot 2). De attenuverters zijn daar
// kwadratisch/quartisch; hier lineair, −1 … +1, middenstand 0 = CV uit.
//
// Volgorde = de tien jacks onderaan het paneel, links naar rechts: links de
// exciter (Bow timbre, Flow, Blow timbre, Mallet, Strike timbre), rechts de
// resonator (Damping, Geometry, Position, Brightness, Space).

namespace mmb_dsp {
namespace elements_cv {

struct Param {
    const char* knob;   ///< control-id van de knop, ook de naam van de CV-ingang (`<knob>_cv`)
    const char* amt;    ///< control-id van de attenuverter
    float def;          ///< standaardstand van de knop
    float hi;           ///< bovengrens van knop + CV
};

constexpr int kNum = 10;
constexpr Param kParams[kNum] = {
    { "bow_timbre",    "bow_timbre_amt",    0.5f,  0.9995f },
    { "blow_meta",     "blow_meta_amt",     0.5f,  0.9995f },   // Flow
    { "blow_timbre",   "blow_timbre_amt",   0.5f,  0.9995f },
    { "strike_meta",   "strike_meta_amt",   0.5f,  0.9995f },   // Mallet
    { "strike_timbre", "strike_timbre_amt", 0.5f,  0.995f  },
    { "damping",       "damping_amt",       0.25f, 0.9995f },
    { "geometry",      "geometry_amt",      0.2f,  0.9995f },
    { "position",      "position_amt",      0.3f,  0.9995f },
    { "brightness",    "brightness_amt",    0.5f,  0.9995f },
    { "space",         "space_amt",         0.5f,  2.0f    },
};

/** FM: attenuverter (de FM-knop, 0 … 1, midden = uit) × CV, in halve tonen;
 *  bij de knop helemaal open is 1 eenheid CV één octaaf. */
inline float fmSemitones(float knob, float cv) {
    const float m = (knob * 2.0f - 1.0f) * 12.0f * cv;
    return m < -60.0f ? -60.0f : (m > 60.0f ? 60.0f : m);
}

struct State {
    float knob[kNum];
    float cv[kNum] = {};
    float amt[kNum] = {};
    State() { for (int i = 0; i < kNum; ++i) knob[i] = kParams[i].def; }
    float value(int i) const {
        const float v = knob[i] + amt[i] * cv[i];
        return v < 0.0f ? 0.0f : (v > kParams[i].hi ? kParams[i].hi : v);
    }
};

/** Schrijf parameter i naar een elements::Patch (template: geen include nodig). */
template <class Patch> void write(Patch* p, int i, float v) {
    switch (i) {
        case 0: p->exciter_bow_timbre    = v; break;
        case 1: p->exciter_blow_meta     = v; break;
        case 2: p->exciter_blow_timbre   = v; break;
        case 3: p->exciter_strike_meta   = v; break;
        case 4: p->exciter_strike_timbre = v; break;
        case 5: p->resonator_damping     = v; break;
        case 6: p->resonator_geometry    = v; break;
        case 7: p->resonator_position    = v; break;
        case 8: p->resonator_brightness  = v; break;
        case 9: p->space                 = v; break;
        default: break;
    }
}

}  // namespace elements_cv
}  // namespace mmb_dsp
