#pragma once
// Buizenoverdrive in twee standen: een gitaarversterker en een studio-
// buisvoorversterker.
//
// Wat een buis anders doet dan een diode of een opamp, en wat hier is
// nagebouwd:
//
//   - Asymmetrisch clippen. Gaat het rooster boven de kathode, dan gaat er
//     roosterstroom lopen en wordt de top zacht afgerond; aan de andere kant
//     knijpt de buis pas veel later dicht (cutoff), en harder. Dat geeft
//     even boventonen, en hoe harder je stuurt hoe meer de vorm verschuift.
//   - Bias-verschuiving (blocking). De roosterstroom laadt de
//     koppelcondensator op en het werkpunt schuift naar beneden; na een
//     harde aanslag komt de klank even "gesmoord" terug en herstelt in
//     tientallen milliseconden. Daardoor ademt de vervorming mee met je spel.
//   - Tussen de trappen een koppelcondensator (hoogdoorlaat) en een
//     ontkoppelde kathode (de laagvolging per trap).
//
// Amp-stand: twee triodetrappen, dan de toonstack (Fender: diep gat in het
// midden rond 400 Hz; Marshall: ondieper en hoger, rond 650 Hz, meer midden;
// Vox top boost: weinig gat, helder) met Bass/Mid/Treble, dan de eindtrap
// (push-pull: symmetrischer, met sag: bij hard spelen zakt de voeding in, de
// eindtrap comprimeert en de vervorming wordt sponziger) met Presence, en
// een kastsimulatie (4×12-achtig: weinig laag onder 80 Hz, een bult rond
// 110 Hz, weinig boven 5 kHz; uit te zetten voor een eigen kast of IR).
//
// Studio-stand: één triodetrap die je harder aanstuurt (vooral tweede
// harmonische) en een uitgangstrafo die het laag iets verzadigt. Geen
// toonstack, geen kast; Mix maakt het parallel.
//
// De niet-lineaire delen lopen vier keer overbemonsterd. Eigen model op
// gedrag en topologie, geen simulatie per onderdeel. Stereo: twee gelijke
// kanalen. Header-only; gedeeld door Teensy en browser.
#include "biquad.h"
#include "oversample.h"

namespace mmb_dsp {

class Tube {
public:
    enum Control { Mode, Drive, Bias, Bass, Mid, Treble, Stack, Presence, Sag, Cab, Mix, Level, kControls };
    enum CvIn { DriveCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {1, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0, 0.5f, 0.4f, 1, 1, 0.6f};

    void Init(float sampleRate) {
        *this = Tube();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (Channel& c : channel_) { c.os1.Init(); c.os2.Init(); c.osPower.Init(); }
        for (int k = 0; k < kControls; ++k) control_[k] = kDefaults[k];
        prepare();
    }

    void setControl(int control, float value) {
        if (control < 0 || control >= kControls) return;
        static constexpr float kHigh[kControls] = {1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1};
        control_[control] = finiteClamp(value, 0, kHigh[control], kDefaults[control]);
        prepare();
    }
    void setCv(int input, float value) { if (input == DriveCv) driveCv_ = finiteClamp(value, -1, 1, 0); }
    float cvOut(int) const { return 0; }

    /** in[0], in[1] = L, R (R los = mono naar beide); out[0], out[1]. */
    void Process(const float* const* in, float* const* out, int frames) {
        const float drive = finiteClamp(control_[Drive] + driveCv_, 0, 1, 0.5f);
        const bool amp = control_[Mode] >= 0.5f;
        // Voorversterking: amp tot ~60 dB over twee trappen, studio tot ~25 dB.
        const float gain1 = amp ? 1.5f * std::pow(40.0f, drive) : 0.6f * std::pow(18.0f, drive);
        const float gain2 = amp ? 1.0f + 14.0f * drive * drive : 1.0f;
        const float bias = (control_[Bias] - 0.5f) * 0.6f;              // koud (−) tot warm (+)
        // Studio: ongeveer even luid bij elke Drive (de triode loopt naar ~1 vol).
        const float makeup = amp ? 1.0f : 0.87f * (1.0f + 0.25f * gain1) / gain1;
        for (int ch = 0; ch < 2; ++ch) {
            const float* input = in[ch] ? in[ch] : in[0];
            Channel& c = channel_[ch];
            for (int frame = 0; frame < frames; ++frame) {
                const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
                // Eerste trap (beide standen).
                float y = triodeStage(c.os1, c.shift1, c.dc1, x * gain1, bias, amp);
                float dry = c.dry.process(x);
                if (amp) {
                    y = biquadTick(interstage_, c.inter, y);                // koppelcondensator + kathode
                    y = triodeStage(c.os2, c.shift2, c.dc2, y * gain2, bias, true);
                    dry = c.dryB.process(dry);                                // even lang als de tweede trap
                    // Toonstack.
                    y = biquadTick(stackLow_, c.stack[0], y);
                    y = biquadTick(stackMid_, c.stack[1], y);
                    y = biquadTick(stackHigh_, c.stack[2], y);
                    // Eindtrap met sag: de voeding volgt het niveau en zakt in.
                    const float level = std::fabs(y);
                    c.sag += (level > c.sag ? sagAttack_ : sagRelease_) * (level - c.sag);
                    const float supply = 1.0f / (1.0f + control_[Sag] * 1.5f * c.sag);
                    // Een lagere voeding verlaagt het plafond: eerder clippen, zachter.
                    y = c.osPower.process(y, [supply](float s) { return supply * std::tanh(s * 1.6f / supply) / 1.6f * 1.2f; });
                    dry = c.dry2.process(dry);                                // de eindtrap loopt ook overbemonsterd
                    y = biquadTick(presence_, c.presence, y);
                    if (control_[Cab] >= 0.5f) {
                        for (int s = 0; s < 4; ++s) y = biquadTick(cab_[s], c.cab[s], y);
                    }
                    y *= 0.9f;
                } else {
                    // Uitgangstrafo: het laag verzadigt het eerst.
                    const float low = biquadTick(transformerLow_, c.trafo, y);
                    y += 0.25f * (std::tanh(low * 2.0f) * 0.5f - low);
                    y *= makeup;
                }
                const float mixed = (dry + (y - dry) * control_[Mix]) * control_[Level] * 1.6f;
                out[ch][frame] = mixed < -1 ? -1 : mixed > 1 ? 1 : mixed;
            }
        }
    }

    /** De triode als vervormer (los te testen): roosterstroom boven nul,
     *  cutoff onder nul; `u` is de roosterspanning in genormaliseerde eenheden. */
    static float triode(float u) {
        if (u >= 0) return u / (1 + u);                       // roosterstroom: zacht naar 1
        return u / (1 - 0.4f * u);                            // richting cutoff: de versterking neemt geleidelijk af (gekromd, dus ook hier even boventonen), plafond -2,5
    }

    /** De studiotrap: één doorlopend gekromde karakteristiek (versterking
     *  neemt toe naar boven), dus vooral de tweede harmonische; pas bij
     *  verzadiging komt de derde erbij. */
    static float studioTriode(float u) {
        const float t = std::tanh(u);
        return t - 0.3f * t * t;
    }

private:
    static constexpr float kMaxShift = 1.2f;                     // hoe ver het werkpunt kan wegzakken
    struct Channel {
        Oversampler4 os1, os2, osPower;
        DryDelay dry, dryB, dry2;
        BiquadState inter, stack[3], presence, cab[4], trafo;
        float shift1 = 0, shift2 = 0, dc1 = 0, dc2 = 0, sag = 0;
    };

    /** Eén triodetrap: overbemonsterd, met bias-verschuiving en DC-blokker. */
    float triodeStage(Oversampler4& os, float& shift, float& dc, float u, float bias, bool hot) {
        // De verschuiving volgt het deel boven nul (roosterstroom) en lekt weg.
        // Studio: zuiver klasse A, nauwelijks roosterstroom en dus nauwelijks verschuiving.
        const float charge = blockCharge_ * (hot ? 1.0f : 0.1f), leak = blockLeak_;
        float drive = 0;
        const float y = os.process(u, [&](float s) {
            const float grid = s + bias - shift;
            if (grid > 0) drive += grid / (1 + grid);           // roosterstroom loopt via de roosterweerstand: begrensd
            return hot ? triode(grid) : studioTriode(grid);
        });
        shift += charge * drive * 0.25f - leak * shift;
        shift = shift < 0 ? 0 : shift > kMaxShift ? kMaxShift : shift;
        // De asymmetrie maakt een gelijkspanning: de koppelcondensator haalt die weg.
        dc += dcCoefficient_ * (y - dc);
        return y - dc;
    }

    void prepare() {
        const float sr = sampleRate_;
        dcCoefficient_ = 1 - std::exp(-2 * 3.14159265f * 12.0f / sr);
        blockCharge_ = 1 - std::exp(-1 / (0.02f * sr));       // laadt in ~20 ms (volgt het gemiddelde, niet de golf)
        blockLeak_ = 1 - std::exp(-1 / (0.08f * sr));         // herstelt in ~80 ms
        sagAttack_ = 1 - std::exp(-1 / (0.02f * sr));
        sagRelease_ = 1 - std::exp(-1 / (0.25f * sr));
        interstage_ = rbj::lowShelf(250.0f, -4.0f, 0.7f, sr);   // kathode: minder laag in de tweede trap
        const int stack = static_cast<int>(control_[Stack] + 0.5f);
        const float bass = (control_[Bass] - 0.5f) * 2, mid = (control_[Mid] - 0.5f) * 2, treble = (control_[Treble] - 0.5f) * 2;
        // Karakter per stack: middenfrequentie en hoe diep het gat in rust is.
        static constexpr float kMidHz[3] = {400, 650, 1000};
        static constexpr float kScoop[3] = {-9, -4, -2};
        static constexpr float kLowHz[3] = {110, 90, 120};
        static constexpr float kHighHz[3] = {2200, 2800, 3200};
        stackLow_ = rbj::lowShelf(kLowHz[stack], bass * 10.0f, 0.8f, sr);
        stackMid_ = rbj::peak(kMidHz[stack], kScoop[stack] + mid * 9.0f, 0.7f, sr);
        stackHigh_ = rbj::highShelf(kHighHz[stack], treble * 10.0f + (stack == 2 ? 2.0f : 0.0f), 0.8f, sr);
        presence_ = rbj::highShelf(3500.0f, (control_[Presence] - 0.5f) * 12.0f, 0.8f, sr);
        cab_[0] = rbj::highPass(80.0f, 0.7f, sr);
        cab_[1] = rbj::peak(110.0f, 3.0f, 1.2f, sr);
        cab_[2] = rbj::lowPass(4500.0f, 0.8f, sr);
        cab_[3] = rbj::lowPass(5500.0f, 0.6f, sr);
        transformerLow_ = rbj::lowPass(120.0f, 0.7f, sr);
    }

    Channel channel_[2];
    float control_[kControls] = {};
    float sampleRate_ = 44100, driveCv_ = 0;
    float dcCoefficient_ = 0, blockCharge_ = 0, blockLeak_ = 0, sagAttack_ = 0, sagRelease_ = 0;
    BiquadCoef interstage_, stackLow_, stackMid_, stackHigh_, presence_, cab_[4], transformerLow_;
};

}  // namespace mmb_dsp
