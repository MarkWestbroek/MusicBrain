// tp_mmb_tides — Mutable Instruments Tides (tides2; spiegel van TidesModule.h).
// CV-module op de 1 kHz-tick: native rate 1000, blok 1.
#include "mmb_abi.h"
#include <cmath>
#include "tides2/poly_slope_generator.h"
#include "stmlib/utils/gate_flags.h"

const char* const MMB_TYPE_ID     = "tp_mmb_tides";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

enum { IN_GATE, IN_RATE, IN_SHAPE, IN_SLOPE, IN_SMOOTH, IN_SHIFT };
MmbPort MMB_INPUTS[] = {
    { "gate", MMB_GATE, 0, {} }, { "rate_cv", MMB_CV, 0, {} },
    { "shape_cv", MMB_CV, 0, {} }, { "slope_cv", MMB_CV, 0, {} },
    { "smooth_cv", MMB_CV, 0, {} }, { "shift_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = {
    { "out1", MMB_CV, 0, {} }, { "out2", MMB_CV, 0, {} }, { "out3", MMB_CV, 0, {} }, { "out4", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;

enum { C_RATE, C_MODE, C_OUTPUT, C_SHAPE, C_SLOPE, C_SMOOTH, C_SHIFT };
MmbControl MMB_CONTROLS[] = {
    { "rate", 2.f }, { "mode", 1.f }, { "output", 2.f },
    { "shape", 0.5f }, { "slope", 0.5f }, { "smooth", 0.5f }, { "shift", 0.5f },
};
const int MMB_NUM_CONTROLS = 7;

namespace {
tides::PolySlopeGenerator g_gen;
tides::RampMode   g_ramp = tides::RAMP_MODE_LOOPING;
tides::OutputMode g_out  = tides::OUTPUT_MODE_SLOPE_PHASE;
stmlib::GateFlags g_last = stmlib::GATE_FLAG_LOW;
float g_rateHz = 2.f;
float g_knob[4] = { 0.5f, 0.5f, 0.5f, 0.5f };   // shape, slope, smooth, shift
}

void mmb_setup() { g_gen.Init(); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_RATE:  g_rateHz = v; break;
        case C_MODE: {
            int m = static_cast<int>(v); if (m < 0) m = 0;
            if (m >= tides::RAMP_MODE_LAST) m = tides::RAMP_MODE_LAST - 1;
            g_ramp = static_cast<tides::RampMode>(m); break;
        }
        case C_OUTPUT: {
            int m = static_cast<int>(v); if (m < 0) m = 0;
            if (m >= tides::OUTPUT_MODE_LAST) m = tides::OUTPUT_MODE_LAST - 1;
            const auto next = static_cast<tides::OutputMode>(m);
            if (next != g_out) { g_out = next; g_gen.Reset(); }
            break;
        }
        case C_SHAPE: case C_SLOPE: case C_SMOOTH: case C_SHIFT:
            g_knob[idx - C_SHAPE] = mmb_clamp01(v); break;
    }
}

void mmb_process(int frames) {
    const float rateCv = mmb_connected(IN_RATE) ? mmb_in0(IN_RATE) : 0.f;
    const float shape  = mmb_connected(IN_SHAPE)  ? mmb_clamp01(mmb_in0(IN_SHAPE))  : g_knob[0];
    const float slope  = mmb_connected(IN_SLOPE)  ? mmb_clamp01(mmb_in0(IN_SLOPE))  : g_knob[1];
    const float smooth = mmb_connected(IN_SMOOTH) ? mmb_clamp01(mmb_in0(IN_SMOOTH)) : g_knob[2];
    const float shift  = mmb_connected(IN_SHIFT)  ? mmb_clamp01(mmb_in0(IN_SHIFT))  : g_knob[3];
    float f = g_rateHz * std::exp2(rateCv) * 0.001f;
    if (f > 0.4f) f = 0.4f;
    if (f < 0.0000001f) f = 0.0000001f;
    for (int k = 0; k < frames; ++k) {
        stmlib::GateFlags flags = stmlib::ExtractGateFlags(g_last, MMB_INPUTS[IN_GATE].buf[k] >= 0.5f);
        g_last = flags;
        tides::PolySlopeGenerator::OutputSample out;
        g_gen.Render(g_ramp, g_out, tides::RANGE_CONTROL, f, slope, shape, smooth, shift, &flags, nullptr, &out, 1);
        for (int i = 0; i < 4; ++i) MMB_OUTPUTS[i].buf[k] = out.channel[i] * (1.f / 8.f);
    }
}
