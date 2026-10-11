#pragma once
// Anti-aliasing voor vervormers: de "antiderivative"-methode (ADAA, eerste
// orde; Parker, Zavalishin & Le Bihan, DAFx 2016).
//
// Een vervormer f(u) per sample maakt boventonen die boven Nyquist
// terugvouwen; een harde knik maakt er zoveel dat zelfs 4× overbemonsteren
// niet genoeg is (doc/dsp-check-2026-10.md: een brom op 108 Hz in Drive en
// Tube). ADAA rekent niet f(u[n]) maar het gemiddelde van f over het stukje
// tussen u[n−1] en u[n]:
//
//     y[n] = (A(u[n]) − A(u[n−1])) / (u[n] − u[n−1]),   A' = f  (A = anti)
//
// Dat is een kleine laagdoorlaat op precies de plekken waar f knikt, en het
// dempt de teruggevouwen boventonen sterk, voor een paar bewerkingen per
// sample. Bij een heel klein verschil (bijna stilstaand signaal) valt hij
// terug op f van het midden. Er komt een halve sample vertraging bij.
//
// Werkt zowel binnen Oversampler4 (dubbele bescherming) als op de gewone
// samplefrequentie. Header-only; gedeeld door Teensy en browser.
#include <cmath>

namespace mmb_dsp {

/** log(cosh(u)), numeriek stabiel ook voor grote |u|: de primitieve van tanh. */
inline float logCosh(float u) {
    const float a = std::fabs(u);
    return a + std::log1p(std::exp(-2 * a)) - 0.69314718f;
}

/** Eén ADAA-trap rond een vervormer `f` met primitieve `F`. Per kanaal of
 *  per trap een eigen exemplaar (hij onthoudt de vorige ingang). */
struct Adaa1 {
    float prevU = 0, prevF = 0;
    void reset() { prevU = 0; prevF = 0; }
    template <class Fn, class AntiFn>
    float process(float u, Fn f, AntiFn anti) {
        const float Fu = anti(u);
        const float du = u - prevU;
        // De drempel schaalt mee: bij |u| ≫ 1 (veel gain) is F groot en geeft
        // een klein verschil anders afrondingsruis in float.
        const float tol = 1e-3f * (1 + std::fabs(u));
        const float y = std::fabs(du) > tol ? (Fu - prevF) / du : f(0.5f * (u + prevU));
        prevU = u; prevF = Fu;
        return y;
    }
    /** Zoals process, maar F van de vorige ingang wordt opnieuw berekend:
     *  voor een vervormer waarvan een parameter per sample verschuift (de
     *  voeding van een eindtrap met sag). */
    template <class Fn, class AntiFn>
    float processVarying(float u, Fn f, AntiFn anti) {
        prevF = anti(prevU);
        return process(u, f, anti);
    }
};

// ── vaak gebruikte vormen met hun primitieve ──────────────────────────────

/** tanh(u). */
struct TanhShape {
    static float f(float u) { return std::tanh(u); }
    static float anti(float u) { return logCosh(u); }
};

/** Lineair tot de knie `k`, daarboven een tanh-bocht naar ±1 (zoals
 *  limiter.h). Klinkt schoon tot de knie: voor een uitgangsbegrenzer die
 *  alleen ingrijpt als het te heet wordt. */
struct KneeShape {
    float k = 0.8f;
    float f(float u) const {
        const float a = std::fabs(u);
        if (a <= k) return u;
        const float y = k + (1 - k) * std::tanh((a - k) / (1 - k));
        return u < 0 ? -y : y;
    }
    float anti(float u) const {
        const float a = std::fabs(u);
        if (a <= k) return 0.5f * a * a;
        const float w = 1 - k;
        return 0.5f * k * k + k * (a - k) + w * w * logCosh((a - k) / w);
    }
};

/** Uitgangsbegrenzer met ADAA: schoon tot de knie, daarboven zacht naar ±1.
 *  Vervangt de harde `y > 1 ? 1 : y` aan het eind van een kern.
 *
 *  Op de gewone samplefrequentie zou ADAA in het lineaire stuk twee samples
 *  middelen (een laagdoorlaat: −2,5 dB op 10 kHz). Daarom gaat het signaal
 *  onveranderd door zolang het en zijn voorganger onder de knie blijven; ADAA
 *  werkt alleen waar de begrenzer echt ingrijpt. */
struct SoftLimit {
    KneeShape shape;
    Adaa1 adaa;
    explicit SoftLimit(float knee = 0.8f) { shape.k = knee; }
    float process(float u) {
        const bool clean = std::fabs(u) <= shape.k && std::fabs(adaa.prevU) <= shape.k;
        if (clean) { adaa.prevU = u; adaa.prevF = shape.anti(u); return u; }
        return adaa.process(u, [this](float v) { return shape.f(v); }, [this](float v) { return shape.anti(v); });
    }
    void reset() { adaa.reset(); }
};

}  // namespace mmb_dsp
