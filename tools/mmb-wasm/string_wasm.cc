// tp_mmb_string — Karplus-Strong-snaar (spiegel van StringModule.h). Native
// 44,1 kHz, blok 32.
//
// De firmware gebruikt `AudioSynthKarplusStrong` uit de Teensy Audio Library
// met een `AudioAmplifier` erachter. Die twee zijn hier overgeschreven, in
// dezelfde int16-rekenkunde: de Park-Miller-ruis waarmee de snaar wordt
// aangeslagen, de middelende lus met factor 32686/65536, de lengte-grens van
// 536 samples (lager dan ~82 Hz gaat hij niet) en de verzadigende versterker.
// ARM-instructies (smulbt, smulwb, ssat) zijn uitgeschreven in C.
//
// De rekenkunde is die van PJRC:
//   Audio Library for Teensy 3.X — Copyright (c) 2016, Paul Stoffregen,
//   paul@pjrc.com. MIT-licentie; zie synth_karplusstrong.cpp en mixer.cpp
//   in de Teensy Audio Library voor de volledige tekst.
//
// Er wordt gerekend in hele Teensy-blokken van 128 samples, zoals `update()`
// dat doet: een aanslag wacht op het volgende blok, en het uitgangsblok loopt
// daardoor tot 128 samples achter — net als op de hardware.
#include <cmath>
#include <cstdint>

#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_string";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_GATE, IN_PLUCK, IN_LEVEL };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "pluck_cv", MMB_CV, 0, {} }, { "level_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_PLUCK, C_LEVEL };
MmbControl MMB_CONTROLS[] = { { "pluck", 0.8f }, { "level", 0.8f } };
const int MMB_NUM_CONTROLS = 2;

namespace {
constexpr int kTeensyBlock = 128;   // AUDIO_BLOCK_SAMPLES
constexpr int kMaxLen      = 536;

// --- AudioSynthKarplusStrong ------------------------------------------------
uint8_t  g_state = 0;               // 0 = stil, 1 = aanslaan bij volgend blok, 2 = speelt
uint16_t g_len = 0, g_idx = 0;
int32_t  g_magnitude = 0;
uint32_t g_seed = 1;                // "must start at 1"
int16_t  g_buf[kMaxLen];

// --- AudioAmplifier ---------------------------------------------------------
int32_t g_mult = static_cast<int32_t>(0.8f * 65536.0f);

// --- StringModule -------------------------------------------------------------
float g_voct = 0.0f, g_pluck = 0.8f;
bool  g_lastGate = false;
float g_lastPluckCv = -1e9f, g_lastLevelCv = -1e9f;   // CvGraph: schrijf bij verandering

int16_t g_out[kTeensyBlock];
int     g_outPos = kTeensyBlock;    // leeg: eerste sample draait meteen update()

/** smulbt: onderste 16 bits van a × bovenste 16 bits van b, beide signed. */
int32_t smulbt(uint32_t a, uint32_t b) {
    return static_cast<int32_t>(static_cast<int16_t>(a & 0xFFFF))
         * static_cast<int32_t>(static_cast<int16_t>(b >> 16));
}
/** smulwb: (a × onderste 16 bits van b, signed) >> 16. */
int32_t smulwb(int32_t a, uint32_t b) {
    return static_cast<int32_t>((static_cast<int64_t>(a) * static_cast<int16_t>(b & 0xFFFF)) >> 16);
}
int32_t ssat16(int32_t v) { return v > 32767 ? 32767 : (v < -32768 ? -32768 : v); }

uint32_t pseudorand(uint32_t lo) {
    const uint32_t hi = static_cast<uint32_t>(smulbt(16807, lo));
    lo = 16807 * (lo & 0xFFFF);
    lo += (hi & 0x7FFF) << 16;
    lo += hi >> 15;
    lo = (lo & 0x7FFFFFFF) + (lo >> 31);
    return lo;
}

void noteOn(float frequency, float velocity) {
    g_magnitude = static_cast<int32_t>(velocity * 65535.0f);
    int len = static_cast<int>((MMB_NATIVE_RATE / frequency) + 0.5f);
    if (len > kMaxLen) len = kMaxLen;
    g_len = static_cast<uint16_t>(len);
    g_idx = 0;
    g_state = 1;
}

void gain(float n) {
    if (n > 32767.0f) n = 32767.0f; else if (n < -32767.0f) n = -32767.0f;
    g_mult = static_cast<int32_t>(n * 65536.0f);
}

/** Eén Teensy-`update()` van de snaar én de versterker → g_out. */
void update() {
    if (g_state == 0 || g_len == 0) { for (int16_t& s : g_out) s = 0; return; }
    if (g_state == 1) {
        uint32_t lo = g_seed;
        for (int i = 0; i < g_len; i++) {
            lo = pseudorand(lo);
            g_buf[i] = static_cast<int16_t>(smulwb(g_magnitude, lo));
        }
        g_seed = lo;
        g_state = 2;
    }
    int16_t prior = g_idx > 0 ? g_buf[g_idx - 1] : g_buf[g_len - 1];
    for (int i = 0; i < kTeensyBlock; i++) {
        const int16_t in = g_buf[g_idx];
        const int16_t out = static_cast<int16_t>((in * 32686 + prior * 32686) >> 16);
        g_out[i] = out;
        g_buf[g_idx] = out;
        prior = in;
        if (++g_idx >= g_len) g_idx = 0;
    }
    // AudioAmplifier: 0 = niets, 65536 = doorgeven, anders smulwb + ssat.
    if (g_mult == 0) { for (int16_t& s : g_out) s = 0; return; }
    if (g_mult != 65536)
        for (int16_t& s : g_out)
            s = static_cast<int16_t>(ssat16(smulwb(g_mult, static_cast<uint16_t>(s))));
}

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
}  // namespace

void mmb_setup() {}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_PLUCK: g_pluck = clampf(v, 0.01f, 1.0f); break;
        case C_LEVEL: gain(v); break;
    }
}

void mmb_process(int frames) {
    // De CV-kant, zoals StringModule::writeCvPort.
    if (mmb_connected(IN_VOCT)) g_voct = mmb_in0(IN_VOCT);
    if (mmb_connected(IN_PLUCK) && mmb_in0(IN_PLUCK) != g_lastPluckCv) {
        g_lastPluckCv = mmb_in0(IN_PLUCK);
        g_pluck = clampf(g_lastPluckCv, 0.01f, 1.0f);
    }
    if (mmb_connected(IN_LEVEL) && mmb_in0(IN_LEVEL) != g_lastLevelCv) {
        g_lastLevelCv = mmb_in0(IN_LEVEL);
        gain(clampf(g_lastLevelCv, 0.0f, 1.0f));
    }
    if (mmb_connected(IN_GATE)) {
        const bool high = mmb_gate_in(IN_GATE);
        if (high && !g_lastGate) noteOn(261.6256f * std::pow(2.0f, g_voct), g_pluck);
        g_lastGate = high;
    }
    for (int k = 0; k < frames; ++k) {
        if (g_outPos >= kTeensyBlock) { update(); g_outPos = 0; }
        MMB_OUTPUTS[0].buf[k] = g_out[g_outPos++] * (1.0f / 32768.0f);
    }
}
