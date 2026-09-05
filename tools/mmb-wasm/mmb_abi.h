// MusicBrain — mmb-wasm ABI: één C-interface waarmee de editor-simulator
// elke Teensy-module als WebAssembly kan draaien.
//
// Een module-wrapper (bv. rings_wasm.cc) definieert:
//   • MMB_INPUTS / MMB_OUTPUTS: poorten (id, soort) — ids gelijk aan de
//     firmware-portmap en de editor-moduledefinitie.
//   • MMB_CONTROLS: control-ids zoals in <X>Module::setControl().
//   • mmb_setup(), mmb_on_control(idx, v), mmb_process(frames).
// mmb_abi.h levert daar de exports omheen (zie onderaan). De host
// (editor/public/wasm/mmb-worklet.js) leest poorten en controls uit de
// wasm zelf, schrijft ingangen op de native samplerate in de poortbuffers
// en leest de uitgangen terug; hij resamplet van/naar de contextrate.
//
// Conventies (gelijk aan de firmware-CvGraph):
//   • cv in volts: voct = 1 V/oct rond C4 (MIDI 60 = 0 V); Marbles' X in
//     ±5 V; parameter-CV's 0..1.
//   • gate: >= 0.5 = hoog. De wrapper doet zelf flankdetectie.
//   • audio: float ±1.
//   • `connected` per ingang: waar zodra er een kabel of een handmatige
//     (klavier-)waarde op staat. Parameter-CV's overschrijven de knop
//     alleen als de poort connected is (zoals de firmware: de CV-graph
//     schrijft dan elke tick).
// Elk render-blok is precies mmb_block() frames op mmb_native_rate().
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>

#define MMB_MAX_BLOCK 256

#ifdef __wasm__
#define MMB_EXPORT(name) extern "C" __attribute__((export_name(#name)))
#else
#define MMB_EXPORT(name) extern "C"
#endif

enum MmbKind { MMB_AUDIO = 0, MMB_CV = 1, MMB_GATE = 2 };

struct MmbPort {
    const char* id;
    int         kind;
    int         connected;
    float       buf[MMB_MAX_BLOCK];
};

struct MmbControl {
    const char* id;
    float       value;
};

// ── door de module te leveren ─────────────────────────────────────────
extern const char* const MMB_TYPE_ID;
extern const float       MMB_NATIVE_RATE;
extern const int         MMB_BLOCK;
extern MmbPort           MMB_INPUTS[];
extern const int         MMB_NUM_INPUTS;
extern MmbPort           MMB_OUTPUTS[];
extern const int         MMB_NUM_OUTPUTS;
extern MmbControl        MMB_CONTROLS[];
extern const int         MMB_NUM_CONTROLS;

void mmb_setup();                          // tabellen, DSP-init (één keer)
void mmb_on_control(int idx, float v);     // control gewijzigd
void mmb_process(int frames);              // frames == MMB_BLOCK

// ── hulpjes voor wrappers ─────────────────────────────────────────────
static inline float mmb_clamp01(float v) { return v < 0.f ? 0.f : (v > 1.f ? 1.f : v); }
static inline float mmb_in0(int i)       { return MMB_INPUTS[i].buf[0]; }
static inline bool  mmb_gate_in(int i)   { return MMB_INPUTS[i].buf[0] >= 0.5f; }
static inline bool  mmb_connected(int i) { return MMB_INPUTS[i].connected != 0; }
static inline void  mmb_fill_out(int o, float v, int frames) {
    for (int k = 0; k < frames; ++k) MMB_OUTPUTS[o].buf[k] = v;
}
static inline int mmb_control_index(const char* id) {
    for (int i = 0; i < MMB_NUM_CONTROLS; ++i)
        if (std::strcmp(MMB_CONTROLS[i].id, id) == 0) return i;
    return -1;
}

// ── exports (identiek voor elke module) ──────────────────────────────
MMB_EXPORT(mmb_type_id)        const char* mmb_type_id()        { return MMB_TYPE_ID; }
MMB_EXPORT(mmb_native_rate)    float mmb_native_rate()          { return MMB_NATIVE_RATE; }
MMB_EXPORT(mmb_block)          int mmb_block()                  { return MMB_BLOCK; }
MMB_EXPORT(mmb_num_inputs)     int mmb_num_inputs()             { return MMB_NUM_INPUTS; }
MMB_EXPORT(mmb_input_id)       const char* mmb_input_id(int i)  { return (i >= 0 && i < MMB_NUM_INPUTS) ? MMB_INPUTS[i].id : ""; }
MMB_EXPORT(mmb_input_kind)     int mmb_input_kind(int i)        { return (i >= 0 && i < MMB_NUM_INPUTS) ? MMB_INPUTS[i].kind : 0; }
MMB_EXPORT(mmb_input_ptr)      float* mmb_input_ptr(int i)      { return (i >= 0 && i < MMB_NUM_INPUTS) ? MMB_INPUTS[i].buf : nullptr; }
MMB_EXPORT(mmb_input_connected) void mmb_input_connected(int i, int c) { if (i >= 0 && i < MMB_NUM_INPUTS) MMB_INPUTS[i].connected = c; }
MMB_EXPORT(mmb_num_outputs)    int mmb_num_outputs()            { return MMB_NUM_OUTPUTS; }
MMB_EXPORT(mmb_output_id)      const char* mmb_output_id(int i) { return (i >= 0 && i < MMB_NUM_OUTPUTS) ? MMB_OUTPUTS[i].id : ""; }
MMB_EXPORT(mmb_output_kind)    int mmb_output_kind(int i)       { return (i >= 0 && i < MMB_NUM_OUTPUTS) ? MMB_OUTPUTS[i].kind : 0; }
MMB_EXPORT(mmb_output_ptr)     float* mmb_output_ptr(int i)     { return (i >= 0 && i < MMB_NUM_OUTPUTS) ? MMB_OUTPUTS[i].buf : nullptr; }
MMB_EXPORT(mmb_num_controls)   int mmb_num_controls()           { return MMB_NUM_CONTROLS; }
MMB_EXPORT(mmb_control_id)     const char* mmb_control_id(int i){ return (i >= 0 && i < MMB_NUM_CONTROLS) ? MMB_CONTROLS[i].id : ""; }
MMB_EXPORT(mmb_control_value)  float mmb_control_value(int i)   { return (i >= 0 && i < MMB_NUM_CONTROLS) ? MMB_CONTROLS[i].value : 0.f; }
MMB_EXPORT(mmb_set_control)    void mmb_set_control(int i, float v) {
    if (i < 0 || i >= MMB_NUM_CONTROLS) return;
    MMB_CONTROLS[i].value = v;
    mmb_on_control(i, v);
}
static bool g_mmb_inited = false;
MMB_EXPORT(mmb_init)           void mmb_init() {
    if (g_mmb_inited) return;
    g_mmb_inited = true;
    mmb_setup();
    // Beginstand van alle controls doorzetten naar de DSP.
    for (int i = 0; i < MMB_NUM_CONTROLS; ++i) mmb_on_control(i, MMB_CONTROLS[i].value);
}
MMB_EXPORT(mmb_render)         void mmb_render(int frames) {
    if (frames > MMB_MAX_BLOCK) frames = MMB_MAX_BLOCK;
    if (frames < 1) return;
    mmb_process(frames);
    // NaN-vangnet zoals in de firmware-wrappers.
    for (int o = 0; o < MMB_NUM_OUTPUTS; ++o) {
        float* b = MMB_OUTPUTS[o].buf;
        for (int k = 0; k < frames; ++k) if (!(b[k] == b[k])) b[k] = 0.f;
    }
}
