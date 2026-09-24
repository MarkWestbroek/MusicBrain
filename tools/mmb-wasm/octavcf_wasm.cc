// tp_mmb_octa_vcf — acht state-variable-filtercellen met één gedeelde
// control-set (spiegel van OctaVcfModule.h). Native 44,1 kHz, blok 32.
//
// De firmware gebruikt per cel `AudioFilterStateVariable` uit de Teensy Audio
// Library, met een `AudioSynthWaveformDc` als CV-proxy op de
// frequentie-ingang. Die zijn hier overgeschreven in hun eigen vaste-komma-
// rekenkunde: de Chamberlin-SVF met twee iteraties per sample, de
// exp2-benadering van de cutoff-modulatie (zonder IMPROVE_* — die staan in
// de bibliotheek uit), en de ARM-instructies (smmulr, ssat) uitgeschreven in
// C. Integer-overflow wikkelt om zoals op ARM, dus de optellingen lopen via
// uint32.
//
// Dit is bewust géén migratie naar `mmb_dsp::Svf`: die klinkt anders, en
// deze simulator hoort te klinken als de hardware die er nu staat.
//
// Rekenkunde: filter_variable.cpp/.h uit de Teensy Audio Library, Copyright
// (c) 2014 Paul Stoffregen, PJRC.COM, LLC. MIT-licentie; zie de bron voor de
// volledige tekst.
#include <cmath>
#include <cstdint>

#include "mmb_abi.h"
#include "teensy_dc.h"

const char* const MMB_TYPE_ID     = "tp_mmb_octa_vcf";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kCells = 8;

// Poorten: in_1..8, cv_1..8, cv (gedeeld), uit: out_1..8 — zoals de catalogus.
MmbPort MMB_INPUTS[] = {
    { "in_1", MMB_AUDIO, 0, {} }, { "in_2", MMB_AUDIO, 0, {} }, { "in_3", MMB_AUDIO, 0, {} }, { "in_4", MMB_AUDIO, 0, {} },
    { "in_5", MMB_AUDIO, 0, {} }, { "in_6", MMB_AUDIO, 0, {} }, { "in_7", MMB_AUDIO, 0, {} }, { "in_8", MMB_AUDIO, 0, {} },
    { "cv_1", MMB_CV, 0, {} }, { "cv_2", MMB_CV, 0, {} }, { "cv_3", MMB_CV, 0, {} }, { "cv_4", MMB_CV, 0, {} },
    { "cv_5", MMB_CV, 0, {} }, { "cv_6", MMB_CV, 0, {} }, { "cv_7", MMB_CV, 0, {} }, { "cv_8", MMB_CV, 0, {} },
    { "cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 17;
constexpr int IN_CV_SHARED = 16;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_AUDIO, 0, {} }, { "out_2", MMB_AUDIO, 0, {} }, { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
    { "out_5", MMB_AUDIO, 0, {} }, { "out_6", MMB_AUDIO, 0, {} }, { "out_7", MMB_AUDIO, 0, {} }, { "out_8", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 8;

enum { C_CUTOFF, C_Q, C_CV_AMT, C_TYPE };
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 800.0f }, { "q", 0.9f }, { "cv_amt", 2.0f }, { "type", 0.0f },
};
const int MMB_NUM_CONTROLS = 4;

namespace {
// ---- ARM-instructies ---------------------------------------------------------
/** smmulr: bovenste 32 bits van a×b, afgerond. */
int32_t smmulr(int32_t a, int32_t b) {
    return static_cast<int32_t>((static_cast<int64_t>(a) * b + 0x80000000LL) >> 32);
}
int32_t wadd(int32_t a, int32_t b) { return static_cast<int32_t>(static_cast<uint32_t>(a) + static_cast<uint32_t>(b)); }
int32_t wsub(int32_t a, int32_t b) { return static_cast<int32_t>(static_cast<uint32_t>(a) - static_cast<uint32_t>(b)); }
int32_t wshl(int32_t a, int s)     { return static_cast<int32_t>(static_cast<uint32_t>(a) << s); }
/** MULT uit filter_variable.cpp. */
int32_t MULT(int32_t a, int32_t b) { return wshl(smmulr(a, b), 2); }
/** ssat #16, asr #13. */
int32_t sat16_rshift13(int32_t v) {
    v >>= 13;
    return v > 32767 ? 32767 : (v < -32768 ? -32768 : v);
}

// ---- AudioFilterStateVariable ------------------------------------------------
struct Svf {
    int32_t fcenter = 0, fmult = 0, octavemult = 0, damp = 0;
    int32_t inputprev = 0, lowpass = 0, bandpass = 0;

    void frequency(float freq) {
        if (freq < 20.0f) freq = 20.0f;
        else if (freq > 44100.0f / 2.5f) freq = 44100.0f / 2.5f;
        fcenter = static_cast<int32_t>((freq * (3.141592654f / (44100.0f * 2.0f))) * 2147483647.0f);
        fmult = static_cast<int32_t>(sinf(freq * (3.141592654f / (44100.0f * 2.0f))) * 2147483647.0f);
    }
    void resonance(float q) {
        if (q < 0.7f) q = 0.7f; else if (q > 5.0f) q = 5.0f;
        damp = static_cast<int32_t>((1.0f / q) * 1073741824.0f);
    }
    void octaveControl(float n) {
        if (n < 0.0f) n = 0.0f; else if (n > 6.9999f) n = 6.9999f;
        octavemult = static_cast<int32_t>(n * 4096.0f);
    }

    /** update_variable() voor één sample; schrijft lp/bp/hp als int16. */
    void tick(int16_t in, int16_t ctl, int16_t out[3]) {
        int32_t control = ctl;
        control *= octavemult;
        int32_t n = control & 0x7FFFFFF;
        n = wshl(n + 134217728, 3);
        n = smmulr(n, n);
        n = wshl(smmulr(n, 715827883), 3);
        n = wadd(n, 715827882);
        n = n >> (6 - (control >> 27));
        int32_t fm = smmulr(fcenter, n);
        if (fm > 5378279) fm = 5378279;
        fm = wshl(fm, 8);

        const int32_t input = static_cast<int32_t>(in) << 12;
        lowpass = wadd(lowpass, MULT(fm, bandpass));
        int32_t highpass = wsub(wsub((input + inputprev) >> 1, lowpass), MULT(damp, bandpass));
        inputprev = input;
        bandpass = wadd(bandpass, MULT(fm, highpass));
        const int32_t lowpasstmp = lowpass, bandpasstmp = bandpass, highpasstmp = highpass;
        lowpass = wadd(lowpass, MULT(fm, bandpass));
        highpass = wsub(wsub(input, lowpass), MULT(damp, bandpass));
        bandpass = wadd(bandpass, MULT(fm, highpass));
        out[0] = static_cast<int16_t>(sat16_rshift13(wadd(lowpass, lowpasstmp)));
        out[1] = static_cast<int16_t>(sat16_rshift13(wadd(bandpass, bandpasstmp)));
        out[2] = static_cast<int16_t>(sat16_rshift13(wadd(highpass, highpasstmp)));
    }
};

// ---- OctaVcfModule -----------------------------------------------------------
constexpr float kCvSlewMs = 2.0f;
Svf      g_svf[kCells];
TeensyDc g_dc[kCells];
float g_cvCell[kCells] = {}, g_cvShared = 0.0f;
float g_last[MMB_NUM_INPUTS];
int   g_type = 0;                 // 0 = LP, 1 = BP, 2 = HP

void applyCv(int i) { g_dc[i].amplitude(g_cvShared + g_cvCell[i], kCvSlewMs); }

/** Audio-ingang als int16, zoals het blok dat de SVF ontvangt. */
int16_t toInt16(float x) {
    const float s = x * 32768.0f;
    return static_cast<int16_t>(s > 32767.0f ? 32767.0f : (s < -32768.0f ? -32768.0f : s));
}
}  // namespace

void mmb_setup() {
    for (int i = 0; i < kCells; ++i) {
        g_svf[i].frequency(800.0f);
        g_svf[i].resonance(0.9f);
        g_svf[i].octaveControl(2.0f);
    }
    for (float& v : g_last) v = -1e9f;
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_CUTOFF: for (Svf& s : g_svf) s.frequency(v); break;
        case C_Q:      for (Svf& s : g_svf) s.resonance(v); break;
        case C_CV_AMT: for (Svf& s : g_svf) s.octaveControl(v); break;
        case C_TYPE: {
            // Op de Teensy pas na een nieuwe graph-build (het paneel zegt
            // "her-push nodig"); hier direct.
            const int t = static_cast<int>(v);
            g_type = t < 0 ? 0 : (t > 2 ? 2 : t);
            break;
        }
    }
}

void mmb_process(int frames) {
    // CV-brug: alleen bij een nieuwe waarde, zoals de CvGraph.
    for (int i = kCells; i < MMB_NUM_INPUTS; ++i) {
        if (!mmb_connected(i)) { g_last[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_last[i]) continue;
        g_last[i] = v;
        if (i == IN_CV_SHARED) { g_cvShared = v; for (int c = 0; c < kCells; ++c) applyCv(c); }
        else { g_cvCell[i - kCells] = v; applyCv(i - kCells); }
    }
    for (int c = 0; c < kCells; ++c) {
        // Zonder audiokabel krijgt de SVF op de Teensy geen blok en zendt hij
        // niets; de DC-proxy loopt wel door.
        const bool live = mmb_connected(c);
        for (int k = 0; k < frames; ++k) {
            const int16_t ctl = g_dc[c].next();
            if (!live) { MMB_OUTPUTS[c].buf[k] = 0.0f; continue; }
            int16_t o[3];
            g_svf[c].tick(toInt16(MMB_INPUTS[c].buf[k]), ctl, o);
            MMB_OUTPUTS[c].buf[k] = o[g_type] * (1.0f / 32768.0f);
        }
    }
}
