// tp_mmb_ladder — Moog-ladder (spiegel van LadderModule.h). Native 44,1 kHz,
// blok 32.
//
// De firmware gebruikt `AudioFilterLadder` uit de Teensy Audio Library, met
// twee `AudioSynthWaveformDc`'s als CV-proxy op zijn cutoff- en
// resonantie-ingang. Die zijn hier overgeschreven: vier ZDF-achtige
// eenpolers met tanh-verzadiging op 4× oversampling, in en uit via een
// polyfase-FIR van 36 taps (CMSIS `arm_fir_interpolate_f32` /
// `arm_fir_decimate_f32`, hier als gewone convolutie uitgeschreven — de taps
// zijn symmetrisch, dus de omgekeerde volgorde van CMSIS maakt niet uit), en
// de DC-proxies met hun lineaire slew van 2 ms in int32.
//
// Rekenkunde:
//   filter_ladder.cpp — Richard van Hoesel (2021), in de Teensy Audio
//   Library, Copyright (c) Paul Stoffregen, PJRC.COM, LLC. MIT-licentie;
//   "please retain this header if you use this code." Zie de bron voor de
//   volledige tekst.
//
// Afwijking van de hardware: alleen afronding. De Teensy kwantiseert de
// in- en uitgang op int16 en telt de FIR-sommen in een andere volgorde op.
#include <cmath>
#include <cstdint>

#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ladder";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_CV, IN_Q, IN_DRIVE };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} },
    { "q_cv", MMB_CV, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_CUTOFF, C_Q, C_DRIVE, C_CV_AMT, C_Q_CV_AMT, C_DRIVE_CV_AMT };
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 2000.0f }, { "q", 0.7f }, { "drive", 1.0f },
    { "cv_amt", 2.0f }, { "q_cv_amt", 0.5f }, { "drive_cv_amt", 0.5f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
// ---- AudioFilterLadder -------------------------------------------------------
constexpr float kPi = 3.14159265358979323846264338327950288f;
constexpr float kMaxResonance = 1.8f;
constexpr float kMaxFrequency = 44100.0f * 0.425f;
constexpr int   kOs = 4, kTaps = 36, kPhase = kTaps / kOs;

const float kCoeffs[kTaps] = {
-14.30851541590154240E-6f,  0.001348560352009071f, 0.004029285548698377f, 0.007644563345368599f,
0.010936856250494802f, 0.011982063548666887f, 0.008882946305001046f, 826.6598116471556070E-6f,
-0.011008071930708746f,-0.023014151355548934f,-0.029736402750934567f,-0.025405787911977455f,
-0.006012006772274640f, 0.028729626071574525f, 0.074466890595619062f, 0.122757573409695370f,
0.163145421379242955f, 0.186152844567746417f, 0.186152844567746417f, 0.163145421379242955f,
0.122757573409695370f, 0.074466890595619062f, 0.028729626071574525f,-0.006012006772274640f,
-0.025405787911977455f,-0.029736402750934567f,-0.023014151355548934f,-0.011008071930708746f,
826.6598116471556070E-6f, 0.008882946305001046f, 0.011982063548666887f, 0.010936856250494802f,
0.007644563345368599f, 0.004029285548698377f, 0.001348560352009071f,-14.30851541590154240E-6f
};

float z0[4], z1[4];
float alpha = 1.0f, K = 1.0f, Fbase = 1000.0f, Qadjust = 1.0f;
float octaveScale = 1.0f / 32768.0f, pbg = 0.5f, overdrive = 0.5f, hostOverdrive = 1.0f;

float g_upHist[kPhase];        // laatste 9 invoersamples (voor de interpolatie)
float g_downHist[kTaps];       // laatste 36 oversampled uitgangen (voor de decimatie)
int   g_downPos = 0;

float LPF(float s, int i) {
    float ft = s * (1.0f/1.3f) + (0.3f/1.3f) * z0[i] - z1[i];
    ft = ft * alpha + z1[i];
    z1[i] = ft;
    z0[i] = s;
    return ft;
}
void resonance(float res) {
    if (res > kMaxResonance) res = kMaxResonance; else if (res < 0.0f) res = 0.0f;
    K = 4.0f * res;
}
void compute_coeffs(float c) {
    if (c > kMaxFrequency) c = kMaxFrequency; else if (c < 5.0f) c = 5.0f;
    const float wc = c * (float)(2.0f * kPi / ((float)kOs * 44100.0f));
    const float wc2 = wc * wc;
    alpha = 0.9892f * wc - 0.4324f * wc2 + 0.1381f * wc * wc2 - 0.0202f * wc2 * wc2;
    Qadjust = 1.006f + 0.0536f * wc - 0.095f * wc2 - 0.05f * wc2 * wc2;
}
void frequency(float c) { Fbase = c; compute_coeffs(c); }
void octaveControl(float oct) {
    if (oct > 7.0f) oct = 7.0f; else if (oct < 0.0f) oct = 0.0f;
    octaveScale = oct / 32768.0f;
}
void inputDrive(float odrv) {
    hostOverdrive = odrv;
    if (hostOverdrive > 1.0f) {
        if (hostOverdrive > 4.0f) hostOverdrive = 4.0f;
        overdrive = 1.0f + (hostOverdrive - 1.0f) * (1.0f - pbg);
    } else {
        overdrive = hostOverdrive;
        if (overdrive < 0.0f) overdrive = 0.0f;
    }
}
float fast_exp2f(float x) {
    float i;
    float f = modff(x, &i);
    f *= 0.693147f / 256.0f;
    f += 1.0f;
    f *= f; f *= f; f *= f; f *= f; f *= f; f *= f; f *= f; f *= f;
    return ldexpf(f, static_cast<int>(i));
}
float fast_tanh(float x) {
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

// ---- AudioSynthWaveformDc (lineaire slew in int32) ---------------------------
struct Dc {
    int32_t magnitude = 0, target = 0, increment = 0;
    bool ramping = false;
    void amplitude(float n, float ms) {
        if (n > 1.0f) n = 1.0f; else if (n < -1.0f) n = -1.0f;
        const int32_t c = static_cast<int32_t>(ms * (44100.0f / 1000.0f));
        const int32_t t = static_cast<int32_t>(n * 2147418112.0f);
        if (c == 0) { magnitude = target = t; ramping = false; return; }
        target = t;
        if (target == magnitude) { ramping = false; return; }
        increment = static_cast<int32_t>((static_cast<int64_t>(target) - magnitude) / c);
        if (increment == 0) increment = (target > magnitude) ? 1 : -1;
        ramping = true;
    }
    /** Eén sample, als int16 zoals het blok dat de ladder ontvangt. */
    int16_t next() {
        if (ramping) {
            const int64_t m = static_cast<int64_t>(magnitude) + increment;
            if ((increment > 0 && m >= target) || (increment < 0 && m <= target)) {
                magnitude = target; ramping = false;
            } else {
                magnitude = static_cast<int32_t>(m);
            }
        }
        return static_cast<int16_t>(magnitude >> 16);
    }
};
Dc g_fcDc, g_qDc;

// ---- LadderModule ------------------------------------------------------------
constexpr float kCvSlewMs = 2.0f;
float g_cvAmt = 2.0f, g_qCvAmt = 0.5f, g_driveBase = 1.0f, g_driveCv = 0.0f, g_driveCvAmt = 0.5f;
float g_last[4] = { -1e9f, -1e9f, -1e9f, -1e9f };

void applyDrive() { inputDrive(g_driveBase * std::exp2f(2.0f * g_driveCvAmt * g_driveCv)); }
}  // namespace

void mmb_setup() {
    frequency(2000.0f);
    resonance(0.7f);
    octaveControl(g_cvAmt);
    inputDrive(1.0f);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_CUTOFF:       frequency(v); break;
        case C_Q:            resonance(v); break;
        case C_DRIVE:        g_driveBase = v; applyDrive(); break;
        case C_CV_AMT:       g_cvAmt = v; octaveControl(v); break;
        case C_Q_CV_AMT:     g_qCvAmt = v; break;
        case C_DRIVE_CV_AMT: g_driveCvAmt = v; break;
    }
}

void mmb_process(int frames) {
    // CV-brug: alleen bij een nieuwe waarde, zoals de CvGraph.
    for (int i = IN_CV; i <= IN_DRIVE; ++i) {
        if (!mmb_connected(i)) { g_last[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_last[i]) continue;
        g_last[i] = v;
        if (i == IN_CV)       g_fcDc.amplitude(v, kCvSlewMs);
        else if (i == IN_Q)   g_qDc.amplitude(v * g_qCvAmt, kCvSlewMs);
        else { g_driveCv = v < -1.0f ? -1.0f : (v > 1.0f ? 1.0f : v); applyDrive(); }
    }
    for (int n = 0; n < frames; ++n) {
        // Interpolatie: nieuwe invoer vooraan, oudste valt eraf.
        for (int m = kPhase - 1; m > 0; --m) g_upHist[m] = g_upHist[m - 1];
        g_upHist[0] = MMB_INPUTS[IN_AUDIO].buf[n] * overdrive * (float)kOs;

        // Beide DC-proxies zijn altijd verbonden: FCmod en Qmod zijn altijd actief.
        const float FCmod = g_fcDc.next() * octaveScale;
        float ftot = Fbase * fast_exp2f(FCmod);
        if (ftot > kMaxFrequency) ftot = kMaxFrequency;
        compute_coeffs(ftot);
        float Ktot = K + 4.0f * (g_qDc.next() * (1.0f / 32768.0f));
        if (Ktot > kMaxResonance * 4.0f) Ktot = kMaxResonance * 4.0f;
        else if (Ktot < 0.0f) Ktot = 0.0f;

        for (int os = 0; os < kOs; ++os) {
            float input = 0.0f;
            for (int m = 0; m < kPhase; ++m) input += g_upHist[m] * kCoeffs[m * kOs + os];
            float u = input - (z1[3] - pbg * input) * Ktot * Qadjust;
            u = fast_tanh(u);
            const float s1 = LPF(u, 0), s2 = LPF(s1, 1), s3 = LPF(s2, 2), s4 = LPF(s3, 3);
            g_downHist[g_downPos] = s4;
            g_downPos = (g_downPos + 1) % kTaps;
        }
        // Decimatie: één uitgang per vier, over de laatste 36.
        float y = 0.0f;
        for (int k = 0; k < kTaps; ++k)
            y += kCoeffs[k] * g_downHist[(g_downPos - 1 - k + kTaps) % kTaps];
        // `blocka->data[i] = blockOut[i] * 32768.0f` zonder klem: op ARM een
        // verzadigende vcvt naar int32, dan een halfword-store — boven ±1
        // vouwt het signaal dus om (de klasse fout die de MS-20 had).
        const float s = y * 32768.0f;
        const int32_t w = s >= 2147483647.0f ? INT32_MAX : (s <= -2147483648.0f ? INT32_MIN : static_cast<int32_t>(s));
        MMB_OUTPUTS[0].buf[n] = static_cast<int16_t>(static_cast<uint16_t>(w & 0xFFFF)) * (1.0f / 32768.0f);
    }
}
