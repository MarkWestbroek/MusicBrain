// tp_mmb_vca — de VCA (spiegel van VcaModule.h). Native 44,1 kHz, blok 32.
//
// In de firmware is het `AudioEffectMultiply`: ingang × een
// `AudioSynthWaveformDc` die de CV (1 kHz) met een slew van 2 ms volgt. De
// DC begint op 0, dus **zonder CV-kabel is de VCA dicht**, en `gain` en
// `resp` doen niets. Dat doen we na. Vermenigvuldigen gaat zoals de
// bibliotheek: (a × b) >> 15, verzadigd op int16.
#include <cstdint>

#include "mmb_abi.h"
#include "teensy_dc.h"

const char* const MMB_TYPE_ID     = "tp_mmb_vca";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_CV };
MmbPort MMB_INPUTS[] = { { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

MmbControl MMB_CONTROLS[] = { { "gain", 1.0f }, { "resp", 0.0f } };
const int MMB_NUM_CONTROLS = 2;

namespace {
constexpr float kCvSlewMs = 2.0f;
TeensyDc g_dc;
float g_last = -1e9f;

int16_t toInt16(float x) {
    const float s = x * 32768.0f;
    return static_cast<int16_t>(s > 32767.0f ? 32767.0f : (s < -32768.0f ? -32768.0f : s));
}
}  // namespace

void mmb_setup() {}
void mmb_on_control(int, float) {}   // gain / resp: "stored for future use"

void mmb_process(int frames) {
    if (!mmb_connected(IN_CV)) g_last = -1e9f;
    else if (mmb_in0(IN_CV) != g_last) g_dc.amplitude(g_last = mmb_in0(IN_CV), kCvSlewMs);
    // Zonder audiokabel krijgt de multiply geen blok en zendt hij niets.
    const bool live = mmb_connected(IN_AUDIO);
    for (int k = 0; k < frames; ++k) {
        const int32_t b = g_dc.next();
        if (!live) { MMB_OUTPUTS[0].buf[k] = 0.0f; continue; }
        int32_t y = (static_cast<int32_t>(toInt16(MMB_INPUTS[IN_AUDIO].buf[k])) * b) >> 15;
        y = y > 32767 ? 32767 : (y < -32768 ? -32768 : y);
        MMB_OUTPUTS[0].buf[k] = y * (1.0f / 32768.0f);
    }
}
