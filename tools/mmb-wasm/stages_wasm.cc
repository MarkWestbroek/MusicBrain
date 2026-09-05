// tp_mmb_stages — Mutable Instruments Stages (spiegel van StagesModule.h).
// CV-module op de 1 kHz-tick: native rate 1000, blok 1.
#include "mmb_abi.h"
#include "stages/segment_generator.h"
#include "stmlib/utils/gate_flags.h"

const char* const MMB_TYPE_ID     = "tp_mmb_stages";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

enum { IN_GATE };
MmbPort MMB_INPUTS[] = { { "gate", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 1;
enum { OUT_OUT, OUT_EOC };
MmbPort MMB_OUTPUTS[] = { { "out", MMB_CV, 0, {} }, { "eoc", MMB_GATE, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

constexpr int kMaxSeg = 6;
enum { C_SEGMENTS, C_LOOP, C_LOOP_START, C_LOOP_END, C_RATE,
       C_T1, C_T2, C_T3, C_T4, C_T5, C_T6, C_S1, C_S2, C_S3, C_S4, C_S5, C_S6,
       C_TYPE1, C_TYPE2, C_TYPE3, C_TYPE4, C_TYPE5, C_TYPE6 };
MmbControl MMB_CONTROLS[] = {
    { "segments", 3.f }, { "loop", 0.f }, { "loop_start", 0.f }, { "loop_end", 5.f }, { "rate", 1.f },
    { "t1", 0.5f }, { "t2", 0.5f }, { "t3", 0.5f }, { "t4", 0.5f }, { "t5", 0.5f }, { "t6", 0.5f },
    { "s1", 0.5f }, { "s2", 0.5f }, { "s3", 0.5f }, { "s4", 0.5f }, { "s5", 0.5f }, { "s6", 0.5f },
    { "type1", 0.f }, { "type2", 0.f }, { "type3", 0.f }, { "type4", 0.f }, { "type5", 0.f }, { "type6", 0.f },
};
const int MMB_NUM_CONTROLS = 23;

namespace {
stmlib::HysteresisQuantizer2 g_quant;
stages::SegmentGenerator     g_gen;
stmlib::GateFlags g_lastGate = stmlib::GATE_FLAG_LOW;
stages::segment::Type g_type[kMaxSeg];
float g_prim[kMaxSeg], g_sec[kMaxSeg];
int   g_numSeg = 3, g_loopStart = 0, g_loopEnd = 5;
bool  g_loop = false, g_dirty = true;

void reconfigure() {
    g_dirty = false;
    stages::segment::Configuration cfg[kMaxSeg];
    int ls = g_loopStart, le = g_loopEnd;
    if (ls < 0) ls = 0;
    if (le >= g_numSeg) le = g_numSeg - 1;
    for (int i = 0; i < g_numSeg; ++i) {
        cfg[i].type = g_type[i];
        cfg[i].loop = g_loop && (i >= ls && i <= le);
    }
    g_gen.Configure(true, cfg, g_numSeg);
}
}

void mmb_setup() {
    g_quant.Init(7, 0.05f, false);
    g_gen.Init(&g_quant);
    for (int i = 0; i < kMaxSeg; ++i) { g_type[i] = stages::segment::TYPE_RAMP; g_prim[i] = 0.5f; g_sec[i] = 0.5f; }
    reconfigure();
}

void mmb_on_control(int idx, float v) {
    if (idx == C_SEGMENTS) { int n = static_cast<int>(v); if (n < 1) n = 1; if (n > kMaxSeg) n = kMaxSeg; g_numSeg = n; g_dirty = true; }
    else if (idx == C_LOOP) { g_loop = v >= 0.5f; g_dirty = true; }
    else if (idx == C_LOOP_START) { g_loopStart = static_cast<int>(v); g_dirty = true; }
    else if (idx == C_LOOP_END) { g_loopEnd = static_cast<int>(v); g_dirty = true; }
    else if (idx == C_RATE) { /* firmware: alleen bewaard */ }
    else if (idx >= C_T1 && idx <= C_T6) g_prim[idx - C_T1] = mmb_clamp01(v);
    else if (idx >= C_S1 && idx <= C_S6) g_sec[idx - C_S1] = mmb_clamp01(v);
    else if (idx >= C_TYPE1 && idx <= C_TYPE6) {
        int t = static_cast<int>(v); if (t < 0) t = 0; if (t > 3) t = 3;
        g_type[idx - C_TYPE1] = static_cast<stages::segment::Type>(t);
        g_dirty = true;
    }
}

void mmb_process(int frames) {
    if (g_dirty) reconfigure();
    for (int i = 0; i < g_numSeg; ++i) g_gen.set_segment_parameters(i, g_prim[i] * 2.0f - 1.0f, g_sec[i]);
    for (int k = 0; k < frames; ++k) {
        stmlib::GateFlags flags = stmlib::ExtractGateFlags(g_lastGate, MMB_INPUTS[IN_GATE].buf[k] >= 0.5f);
        g_lastGate = flags;
        stages::SegmentGenerator::Output out;
        g_gen.Process(&flags, &out, 1);
        MMB_OUTPUTS[OUT_OUT].buf[k] = out.value;               // al 0..1 (zie StagesModule.h)
        MMB_OUTPUTS[OUT_EOC].buf[k] = out.segment == 0 ? 1.f : 0.f;
    }
}
