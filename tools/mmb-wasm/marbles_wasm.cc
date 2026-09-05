// tp_mmb_marbles — Mutable Instruments Marbles (spiegel van MarblesModule.h).
// CV-module op de 1 kHz-tick: native rate 1000, blok 1. X-uitgangen in volts.
#include "mmb_abi.h"
#include <cmath>
#include "marbles/preset_scales.h"
#include "marbles/random/random_generator.h"
#include "marbles/random/random_stream.h"
#include "marbles/random/t_generator.h"
#include "marbles/random/x_y_generator.h"
#include "stmlib/utils/gate_flags.h"

const char* const MMB_TYPE_ID     = "tp_mmb_marbles";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

enum { IN_CLOCK, IN_RATE, IN_DEJAVU, IN_SPREAD };
MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "rate_cv", MMB_CV, 0, {} },
    { "dejavu_cv", MMB_CV, 0, {} }, { "spread_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_T1, OUT_T2, OUT_TCLK, OUT_X1, OUT_X2, OUT_X3, OUT_Y };
MmbPort MMB_OUTPUTS[] = {
    { "t1", MMB_GATE, 0, {} }, { "t2", MMB_GATE, 0, {} }, { "tclk", MMB_GATE, 0, {} },
    { "x1", MMB_CV, 0, {} }, { "x2", MMB_CV, 0, {} }, { "x3", MMB_CV, 0, {} }, { "y", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 7;

enum { C_TEMPO, C_BIAS, C_JITTER, C_MODEL, C_DEJAVU, C_LENGTH, C_SPREAD, C_XBIAS, C_STEPS, C_SCALE, C_RANGE, C_EXTCLOCK };
MmbControl MMB_CONTROLS[] = {
    { "tempo", 120.0f }, { "bias", 0.5f }, { "jitter", 0.0f }, { "model", 0.0f }, { "dejavu", 0.0f },
    { "length", 8.0f }, { "spread", 0.5f }, { "xbias", 0.5f }, { "steps", 0.5f }, { "scale", 0.0f },
    { "range", 2.0f }, { "extclock", 0.0f },
};
const int MMB_NUM_CONTROLS = 12;

namespace {
marbles::RandomGenerator g_rng;
marbles::RandomStream    g_stream;
marbles::TGenerator      g_t;
marbles::XYGenerator     g_xy;
stmlib::GateFlags g_lastClk = stmlib::GATE_FLAG_LOW;
bool  g_useExt = false;
float g_tempo = 120.f, g_rateCvSemis = 0.f;
float g_dejavu = 0.f, g_spread = 0.5f, g_xbias = 0.5f, g_steps = 0.5f;
int   g_length = 8, g_scale = 0;
marbles::VoltageRange g_xrange = marbles::VOLTAGE_RANGE_FULL;

void applyTempo() { g_t.set_rate(12.0f * std::log2(g_tempo / 120.0f) + g_rateCvSemis); }
}

void mmb_setup() {
    g_rng.Init(0x8D5A61A4u);
    g_stream.Init(&g_rng);
    g_t.Init(&g_stream, MMB_NATIVE_RATE);
    g_xy.Init(&g_stream, MMB_NATIVE_RATE);
    for (int i = 0; i < 6; ++i) g_xy.LoadScale(i, marbles::preset_scales[i]);
    g_t.set_model(marbles::T_GENERATOR_MODEL_COMPLEMENTARY_BERNOULLI);
    g_t.set_range(marbles::T_GENERATOR_RANGE_1X);
    applyTempo();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_TEMPO:  g_tempo = v < 10.f ? 10.f : (v > 480.f ? 480.f : v); applyTempo(); break;
        case C_BIAS:   g_t.set_bias(mmb_clamp01(v)); break;
        case C_JITTER: g_t.set_jitter(mmb_clamp01(v)); break;
        case C_MODEL: {
            int m = static_cast<int>(v); if (m < 0) m = 0; if (m > 2) m = 2;
            g_t.set_model(static_cast<marbles::TGeneratorModel>(m));
            break;
        }
        case C_DEJAVU: g_dejavu = mmb_clamp01(v); g_t.set_deja_vu(g_dejavu); break;
        case C_LENGTH: {
            int l = static_cast<int>(v); if (l < 1) l = 1; if (l > 16) l = 16;
            g_length = l; g_t.set_length(l);
            break;
        }
        case C_SPREAD: g_spread = mmb_clamp01(v); break;
        case C_XBIAS:  g_xbias = mmb_clamp01(v); break;
        case C_STEPS:  g_steps = mmb_clamp01(v); break;
        case C_SCALE:  { int s = static_cast<int>(v); if (s < 0) s = 0; if (s > 5) s = 5; g_scale = s; break; }
        case C_RANGE:  { int r = static_cast<int>(v); if (r < 0) r = 0; if (r > 2) r = 2; g_xrange = static_cast<marbles::VoltageRange>(r); break; }
        case C_EXTCLOCK: g_useExt = v >= 0.5f; break;
    }
}

void mmb_process(int frames) {
    // rate_cv: ±1 = ±2 octaaf op het tempo.
    if (mmb_connected(IN_RATE)) {
        float r = mmb_in0(IN_RATE); if (r < -1.f) r = -1.f; if (r > 1.f) r = 1.f;
        g_rateCvSemis = 24.0f * r; applyTempo();
    }
    const float dejavuCv = mmb_connected(IN_DEJAVU) ? mmb_in0(IN_DEJAVU) : 0.f;
    const float spreadCv = mmb_connected(IN_SPREAD) ? mmb_in0(IN_SPREAD) : 0.f;

    for (int k = 0; k < frames; ++k) {
        const bool clkHigh = MMB_INPUTS[IN_CLOCK].buf[k] >= 0.5f;
        stmlib::GateFlags clk = stmlib::ExtractGateFlags(g_lastClk, clkHigh);
        g_lastClk = clk;

        float ext = 0.f, master = 0.f, slave0 = 0.f, slave1 = 0.f;
        marbles::Ramps ramps;
        ramps.external = &ext; ramps.master = &master; ramps.slave[0] = &slave0; ramps.slave[1] = &slave1;

        bool gates[marbles::kNumTChannels] = { false, false };
        g_t.Process(g_useExt, &clk, ramps, gates, 1);
        MMB_OUTPUTS[OUT_T1].buf[k]   = gates[0] ? 1.f : 0.f;
        MMB_OUTPUTS[OUT_T2].buf[k]   = gates[1] ? 1.f : 0.f;
        MMB_OUTPUTS[OUT_TCLK].buf[k] = master < 0.5f ? 1.f : 0.f;

        marbles::GroupSettings x;
        x.control_mode = marbles::CONTROL_MODE_IDENTICAL;
        x.voltage_range = g_xrange;
        x.register_mode = false; x.register_value = 0.f;
        x.spread = mmb_clamp01(g_spread + spreadCv);
        x.bias = g_xbias; x.steps = g_steps;
        x.deja_vu = mmb_clamp01(g_dejavu + dejavuCv);
        x.length = g_length; x.scale_index = g_scale;
        x.ratio.p = 1; x.ratio.q = 1;

        marbles::GroupSettings y = x;
        y.voltage_range = marbles::VOLTAGE_RANGE_FULL;
        y.spread = 0.5f; y.bias = 0.5f; y.steps = 0.5f; y.deja_vu = 0.f; y.length = 1;
        y.ratio.p = 1; y.ratio.q = 16;

        float volts[marbles::kNumChannels] = { 0.f, 0.f, 0.f, 0.f };
        g_xy.Process(g_useExt ? marbles::CLOCK_SOURCE_EXTERNAL : marbles::CLOCK_SOURCE_INTERNAL_T1_T2_T3,
                     x, y, &clk, ramps, volts, 1);
        MMB_OUTPUTS[OUT_X1].buf[k] = volts[0];
        MMB_OUTPUTS[OUT_X2].buf[k] = volts[1];
        MMB_OUTPUTS[OUT_X3].buf[k] = volts[2];
        MMB_OUTPUTS[OUT_Y].buf[k]  = volts[3];
    }
}
