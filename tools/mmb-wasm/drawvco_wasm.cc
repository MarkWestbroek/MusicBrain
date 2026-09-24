// tp_mmb_draw_vco — oscillator met een in de editor getekende golfvorm
// (spiegel van DrawVcoModule.h). Native 44,1 kHz, blok 32. De oscillator is
// `AudioSynthWaveform` in arbitrary-modus (teensy_waveform.h).
//
// De tekening komt op de Teensy binnen via een `wavetable`-frame; hier via
// blob-slot 0 (`WasmModule.setInstanceBlob`). Net als de firmware resamplen
// we met nearest-neighbour naar 256 punten, en tot er iets getekend is
// speelt hij een driehoek. De tekening staat niet in de patch: op de Teensy
// is hij na een herstart ook weer weg.
#include <cmath>
#include <cstdint>

#include "mmb_abi.h"
#include "teensy_waveform.h"

const char* const MMB_TYPE_ID     = "tp_mmb_draw_vco";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_TUNE };
MmbPort MMB_INPUTS[] = { { "voct", MMB_CV, 0, {} }, { "tune", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_COARSE, C_FINE, C_LEVEL };
MmbControl MMB_CONTROLS[] = { { "coarse", 0.0f }, { "fine", 0.0f }, { "level", 0.8f } };
const int MMB_NUM_CONTROLS = 3;

namespace {
constexpr int kTableLen = 256, kMaxDraw = 4096;
TeensyWaveform g_osc;
int16_t g_table[kTableLen];
int16_t g_draw[kMaxDraw];
float g_voct = 0.0f, g_tune = 0.0f, g_coarse = 0.0f, g_fine = 0.0f;
float g_last[2] = { -1e9f, -1e9f };

void recomputeHz() {
    g_osc.frequency(261.6256f * powf(2.0f, g_voct + g_tune + g_coarse / 12.0f + g_fine / 1200.0f));
}
}  // namespace

// ── blob-slot 0: de getekende golf (int16, 2..4096 punten) ────────────────
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    return (slot == 0 && bytes <= static_cast<int>(sizeof(g_draw))) ? g_draw : nullptr;
}
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int frames, float, int) {
    // DrawVcoModule::setWaveformData — nearest-neighbour naar 256.
    if (slot != 0 || frames < 2 || frames > kMaxDraw) return;
    for (int i = 0; i < kTableLen; ++i)
        g_table[i] = g_draw[(static_cast<long>(i) * frames) / kTableLen];
}

void mmb_setup() {
    // Standaard-driehoek, zodat de module klinkt voordat er getekend is.
    for (int i = 0; i < kTableLen; ++i) {
        const float ph = static_cast<float>(i) / kTableLen;
        const float tri = (ph < 0.5f) ? (4.0f * ph - 1.0f) : (3.0f - 4.0f * ph);
        g_table[i] = static_cast<int16_t>(tri * 32767.0f);
    }
    g_osc.arbitraryWaveform(g_table);
    g_osc.begin(TW_ARBITRARY);
    g_osc.amplitude(0.8f);
    recomputeHz();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_COARSE: g_coarse = v; recomputeHz(); break;
        case C_FINE:   g_fine = v; recomputeHz(); break;
        case C_LEVEL:  g_osc.amplitude(v); break;
    }
}

void mmb_process(int frames) {
    for (int i = IN_VOCT; i <= IN_TUNE; ++i) {
        if (!mmb_connected(i)) { g_last[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_last[i]) continue;
        g_last[i] = v;
        if (i == IN_VOCT) g_voct = v; else g_tune = v;
        recomputeHz();
    }
    for (int k = 0; k < frames; ++k) MMB_OUTPUTS[0].buf[k] = g_osc.next() * (1.0f / 32768.0f);
}
