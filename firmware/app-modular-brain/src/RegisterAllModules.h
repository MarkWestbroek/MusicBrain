/**
 * @file RegisterAllModules.h
 * @brief Linker bootstrap — ensures every module factory survives dead-code
 *        elimination at link time.
 *
 * @details
 * PlatformIO builds firmware libraries as static archives (`.a` files).
 * The linker only pulls in an object file from an archive if at least one
 * symbol from that file is referenced elsewhere in the program.  Because
 * each module registers itself via a **static initialiser** inside its own
 * translation unit, the linker discards the entire object when nothing
 * directly calls a symbol from it — and the factory silently disappears
 * from the global Registry.
 *
 * This header works around the issue by providing a single function,
 * `registerAllRuntimeModules()`, that calls `registerFactory()` on each
 * module class.  Calling it from `main.cpp::setup()` before any
 * `ProjectRuntime::applyConfig()` is called gives the linker enough
 * references to retain every required object file.
 *
 * **`tp_mmb_ahdsr` is a pure-CV module:**
 * `mb::runtime::Ahdsr` auto-registers itself via a static initialiser in
 * `Ahdsr.cpp`, but that object file may be dropped by the linker if nothing
 * else references it.  Calling `mb::runtime::Ahdsr::registerFactory()`
 * explicitly here keeps the translation unit alive.  There is no longer an
 * audio wrapper for the envelope — it is routed entirely by `CvGraph`.
 *
 * **Adding a new module:**
 * 1. Include its header below.
 * 2. Add one `MyNewModule::registerFactory();` line inside the function.
 * That's all — no other file needs to change.
 */
#pragma once

#include "mb/runtime/MidiIn.h"
#include "mb/runtime/Lfo.h"
#include "mb/runtime/Seq16.h"
#include "mb/runtime/Ahdsr.h"

// Audio-domain module wrappers (app-modular-brain specific)
#include "VcoModule.h"
#include "OctaVcoModule.h"
#include "FmVcoModule.h"
#include "WtVcoModule.h"
#include "DrawVcoModule.h"
#include "StringModule.h"
#include "ElementsModule.h"
#include "ElementsReverbModule.h"
#include "RingsModule.h"
#include "PlaitsModule.h"
#include "CloudsModule.h"
#include "TidesModule.h"
#include "MarblesModule.h"
#include "Dx7Module.h"
#include "WarpsModule.h"
#include "OctaVcfModule.h"
#include "OctaVcaModule.h"
#include "MorphWtModule.h"
#include "StagesModule.h"
#include "PeaksModule.h"
#include "ResonatorModule.h"
#include "Cr78Module.h"
#include "QuantModule.h"
#include "ChordModule.h"
#include "EnvFollowerModule.h"
#include "GridsModule.h"
#include "CompDriveModule.h"
#include "EchoModule.h"
#include "TapeEchoModule.h"
#include "FetCompModule.h"
#include "OptoCompModule.h"
#include "BusCompModule.h"
#include "VariMuCompModule.h"
#include "ProgramEqModule.h"
#include "DiodeCompModule.h"
#include "ConsoleEqModule.h"
#include "StereoTapeEchoModule.h"
#include "DigitalEchoModule.h"
#include "BbdChorusModule.h"
#include "RingModModule.h"
#include "OctaverModule.h"
#include "HarmonizerModule.h"
#include "ReverbModule.h"
#include "TremoloModule.h"
#include "StereoPhaserModule.h"
#include "ParamEqModule.h"
#include "SamplerModule.h"
#include "CombModule.h"
#include "PhaserModule.h"
#include "NoiseModule.h"
#include "VcaModule.h"
#include "StereoVcaModule.h"
#include "VcfModule.h"
#include "LadderModule.h"
#include "Ms20Module.h"
#include "MixerModule.h"
#include "Mixer8Module.h"
#include "Mixer16Module.h"
#include "OutModule.h"
#include "mb/runtime/CvMath.h"
#include "StkSoundModule.h"    // FW-AU-10: multi-sound STK physical modelling

namespace mmb_link {

/** @brief Register every known module type with the global Registry.
 *  Must be called once from `setup()`, before any `ProjectRuntime::applyConfig()`. */
inline void registerAllRuntimeModules() {
    mb::runtime::MidiInModule::registerFactory();
    mb::runtime::Lfo::registerFactory();
    mb::runtime::Seq16::registerFactory();   // FW-SQ-1: 16-step CV/Gate sequencer
    mb::runtime::Ahdsr::registerFactory();   // pure CV-domain envelope
    mb::runtime::CvMath::registerFactory();

    // Audio-domain module wrappers.
    VcoModule::registerFactory();
    OctaVcoModule::registerFactory();   // FW-PM-1: 8-cell shared-control osc
    FmVcoModule::registerFactory();     // FW-AU-4: FM oscillator
    WtVcoModule::registerFactory();     // FW-AU-5: wavetable oscillator (banks)
    DrawVcoModule::registerFactory();   // FW-AU-6: draw-waveshape oscillator
    StringModule::registerFactory();    // FW-AU-8: Karplus-Strong string
    StkSoundModule::registerFactory();  // FW-AU-10: multi-sound STK physical modelling
    ElementsModule::registerFactory();  // FW-AU-9: Mutable Instruments Elements voice
    ElementsReverbModule::registerFactory(); // FW-FX-3: Elements Dattorro reverb
    RingsModule::registerFactory();     // FW-AU-11: Mutable Rings resonator
    PlaitsModule::registerFactory();    // FW-AU-12: Mutable Plaits macro-oscillator
    CloudsModule::registerFactory();    // FW-FX-4: Mutable Clouds granular
    TidesModule::registerFactory();     // FW-CV-1: Mutable Tides slope-gen (CV-domein)
    MarblesModule::registerFactory();   // FW-CV-2: Mutable Marbles random-seq (CV-domein)
    Dx7Module::registerFactory();       // FW-AU-13: DX7-stem (msfa/Dexed-kern)
    WarpsModule::registerFactory();     // FW-FX-5: Mutable Warps meta-modulator
    OctaVcfModule::registerFactory();   // FW-PM-2: 8-cel SVF met gedeelde controllers
    OctaVcaModule::registerFactory();   // FW-PM-3: 8-cel VCA met gedeelde level
    MorphWtModule::registerFactory();   // FW-AU-14: morphing-wavetable-VCO
    StagesModule::registerFactory();    // FW-CV-3: Mutable Stages segment-generator
    PeaksModule::registerFactory();     // FW-AU-15: Mutable Peaks drums (808)
    ResonatorModule::registerFactory(); // FW-FX-6: sympathetic-resonator-bank
    Cr78Module::registerFactory();      // FW-AU-16: CR-78 drums (berekend)
    QuantModule::registerFactory();     // FW-CV-4: V/Oct-quantizer naar schaal
    ChordModule::registerFactory();     // FW-CV-5: chord-generator (4 stemmen)
    EnvFollowerModule::registerFactory();     // FW-CV-6: 8-cel envelope follower (mmb-dsp), ook als wasm
    EnvFollowerMonoModule::registerFactory(); // idem, enkelvoudig
    GridsModule::registerFactory();     // FW-SQ-2: topologische drum-sequencer
    CompDriveModule::registerFactory(); // FW-FX-2: compressor + overdrive
    EchoModule::registerFactory();      // FW-AU-2: feedback delay
    TapeEchoModule::registerFactory();  // bandecho (mmb-dsp), ook als wasm in de simulator
    FetCompModule::registerFactory();   // FET-compressor, 1176-stijl (mmb-dsp), ook als wasm
    OptoCompModule::registerFactory();  // opto-compressor, LA-2A-stijl (mmb-dsp), ook als wasm
    BusCompModule::registerFactory();   // VCA-buscompressor, SSL-stijl (mmb-dsp), ook als wasm
    VariMuCompModule::registerFactory(); // variable-mu, Fairchild-stijl (mmb-dsp), ook als wasm
    ProgramEqModule::registerFactory(); // program-EQ, Pultec-stijl (mmb-dsp), ook als wasm
    DiodeCompModule::registerFactory(); // diodebrug, Neve-33609-stijl (mmb-dsp), ook als wasm
    ConsoleEqModule::registerFactory(); // console-EQ, 1073-stijl (mmb-dsp), ook als wasm
    StereoTapeEchoModule::registerFactory(); // stereo bandecho met cross-feedback (mmb-dsp), ook als wasm
    DigitalEchoModule::registerFactory();    // vintage digitale echo, 12-bit + modulatie (mmb-dsp), ook als wasm
    BbdChorusModule::registerFactory();      // BBD-chorus/flanger, mono → stereo (mmb-dsp), ook als wasm
    RingModModule::registerFactory();        // ringmodulator, clean/diode (mmb-dsp), ook als wasm
    OctaverModule::registerFactory();        // analoge octaver, OC-2-stijl (mmb-dsp), ook als wasm
    HarmonizerModule::registerFactory();     // pitch-shifter/harmonizer, twee stemmen (mmb-dsp), ook als wasm
    ReverbModule::registerFactory();         // plaat-/veergalm (mmb-dsp), ook als wasm
    TremoloModule::registerFactory();        // tremolo-pedaal amp/opto/harmonic/pan (mmb-dsp), ook als wasm
    StereoPhaserModule::registerFactory();   // stereo phaser (mmb-dsp), ook als wasm
    ParamEqModule::registerFactory();   // parametrische EQ, SSL/API-stijl (mmb-dsp), ook als wasm
    SamplerModule::registerFactory();   // sample-speler (mmb-dsp), PSRAM + SD; ook als wasm
    CombModule::registerFactory();      // FW-AU-3: tuned comb resonator
    PhaserModule::registerFactory();    // FW-AU-2: all-pass phaser
    NoiseModule::registerFactory();     // wit/roze/bruin (mmb-dsp), ook als wasm in de simulator
    VcaModule::registerFactory();
    StereoVcaModule::registerFactory(); // FW-AU-1: stereo VCA / panner
    VcfModule::registerFactory();
    LadderModule::registerFactory();    // Moog-style ladder VCF (audio-rate F+Q CV)
    Ms20Module::registerFactory();      // Korg35/MS-20 Sallen-Key ZDF VCF (tanh loop)
    MixerModule::registerFactory();
    Mixer8Module::registerFactory();
    Mixer16Module::registerFactory();
    OutModule::registerFactory();
}

}  // namespace mmb_link
