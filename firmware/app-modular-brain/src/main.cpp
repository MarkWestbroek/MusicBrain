// MusicBrain Teensy firmware — B-phase step 3: dynamic audio graph from patch JSON.
//
// Static 4-voice graph (B-step 2) remains active as a fallback.
// When the editor pushes a project and activates a patch, AudioGraph
// wires the project modules (VCO, VCA, AHDSR-DC, VCF, Out) via
// AudioConnection objects derived from the patch's connection list.
//
// CV bridge:
//   syncVoicesFromModel() still drives the static 4-voice chain.
//   syncDynamicModules()  additionally drives any VcoModule instances in the
//   live runtime (voice 0 only — mono patch support).
//
// CV tick:
//   loop() calls tickCvModules() every ≥1 ms so every CvModule (Ahdsr, Lfo,
//   …) advances its state machine independent of the audio block callback.

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <memory>
#include <new>

#include "mb/runtime/MidiIn.h"
#include "TeensyLink.h"
#include "MidiMap.h"
#include "ProjectRuntime.h"
#include "RegisterAllModules.h"
#include "AudioGraph.h"
#include "CvGraph.h"
#include "VcoModule.h"
#include "OutModule.h"
#include "Dx7Module.h"
#include "WarpsModule.h"

namespace {

constexpr uint8_t kVoices = 4;

// Audio block pool size — single source for AudioMemory() in setup() and the
// "audio blocks: peak/budget" diagnostic log after each graph rebuild.
// 800 blocks ≈ 208 KB RAM2: een 4-stemmige patch piekte al op 271, dus een
// 16-stemmige heeft ruim de dubbele headroom nodig.
constexpr unsigned kAudioPoolBlocks = 800;

// Loop-rate meter: iteraties/seconde van loop(). Een dalende loopHz betekent
// dat de main-thread (CV-tick, serial) verzadigd raakt — de audio-ISR zie je
// apart via AudioProcessorUsage(). Gerapporteerd in het "status"-bericht.
uint32_t loopCounter   = 0;
uint32_t loopsPerSec   = 0;
uint32_t lastLoopMarkMs = 0;

// Vrije heap (RAM2) in bytes — het budget waar module-instanties, STK-delay-
// lines en MI-buffers uit komen. Gerapporteerd in het status-bericht zodat
// een naderende OOM (zoals de STK Bowed×8-crash) vooraf zichtbaar is.
extern "C" char* __brkval;
extern "C" char _heap_end;
inline int freeHeapBytes() {
    return static_cast<int>(&_heap_end - __brkval);
}

// One MidiInModule owns the allocator + per-voice state. It is the OO
// entry point: the audio graph just mirrors its state.
mb::runtime::MidiInModule midiIn{"midi1"};

// Per-voice audio chain.
AudioSynthWaveform     osc[kVoices];
AudioEffectMultiply    vca[kVoices];
AudioSynthWaveformDc   eg [kVoices];

// Stereo sum. AudioMixer4 has exactly 4 inputs, conveniently == kVoices.
AudioMixer4            mixL;
AudioMixer4            mixR;
AudioOutputUSB         usbOut;

// AudioConnection has no default ctor, so we construct wires in setup()
// via placement-new into raw storage. Lifetime = program lifetime.
struct VoiceWires {
    AudioConnection oscToVca;
    AudioConnection egToVca;
    AudioConnection vcaToMixL;
    AudioConnection vcaToMixR;
    VoiceWires(uint8_t i)
      : oscToVca (osc[i], 0, vca[i], 0)
      , egToVca  (eg [i], 0, vca[i], 1)
      , vcaToMixL(vca[i], 0, mixL,   i)
      , vcaToMixR(vca[i], 0, mixR,   i)
    {}
};
alignas(VoiceWires) char voiceWiresStorage[sizeof(VoiceWires) * kVoices];
VoiceWires* voiceWires(uint8_t i) {
    return reinterpret_cast<VoiceWires*>(voiceWiresStorage + sizeof(VoiceWires) * i);
}

// Static-graph → USB connections. Heap-allocated so they can be destroyed
// when the user mutes the static graph (otherwise they'd keep overwriting
// the dynamic graph's blocks in usbOut's input slots).
std::unique_ptr<AudioConnection> mixToUsbL;
std::unique_ptr<AudioConnection> mixToUsbR;

constexpr uint8_t kHeartbeatPin = LED_BUILTIN;
constexpr uint32_t kHeartbeatPeriodMs = 1000;
uint32_t lastBlinkMs = 0;
bool ledState = false;

mmb_link::TeensyLink    link;
mmb_link::ProjectRuntime runtime;
mmb_link::AudioGraph    audioGraph;
mmb_link::CvGraph       cvGraph;
// FW-CS-1: CC→control-bindings voor een control surface (Roto-Control),
// meegeleverd in de projectconfig. Zie doc/plans/control-surface.md.
mmb_link::MidiMap       midiMap;

// Static 4-voice graph on/off. Toggled via the editor's "Static graph" switch
// (command {"type":"setStatic","enabled":bool}) so you can isolate the
// dynamic patch.
bool staticEnabled = true;

void applyStaticEnabled() {
    AudioNoInterrupts();
    if (staticEnabled) {
        // Via het master-gain-paar (OutModule::level); usbOut zelf wordt
        // exclusief door die amps gevoed.
        if (!mixToUsbL) mixToUsbL = std::make_unique<AudioConnection>(
            mixL, 0, mmb_link::OutModule::masterAmpL(), 0);
        if (!mixToUsbR) mixToUsbR = std::make_unique<AudioConnection>(
            mixR, 0, mmb_link::OutModule::masterAmpR(), 0);
        for (uint8_t i = 0; i < kVoices; ++i) {
            mixL.gain(i, 0.25f);
            mixR.gain(i, 0.25f);
        }
    } else {
        // Destroy the connections so they stop writing into usbOut's input
        // slots (otherwise they'd overwrite the dynamic graph's blocks).
        mixToUsbL.reset();
        mixToUsbR.reset();
        for (uint8_t i = 0; i < kVoices; ++i) {
            mixL.gain(i, 0.0f);
            mixR.gain(i, 0.0f);
        }
    }
    AudioInterrupts();
}

// ------------------------------------------------------------------
// CV tick — called from loop() every ≥1 ms.
// Advances every CV-domain module (Ahdsr, Lfo, …).  Dispatch is
// polymorphic via Module::asCvModule(); no per-type switch is needed,
// so new CvModule types tick automatically without touching this loop.
// ------------------------------------------------------------------
uint32_t lastCvTickMs = 0;

void tickCvModules() {
    for (auto& [id, mod] : runtime.instances()) {
        if (auto* cv = mod->asCvModule()) cv->tick();
    }
}

// ------------------------------------------------------------------
// Dynamic CV bridge — drives VcoModule pitch and Ahdsr gate
// from the live MidiInModule.  The patch graph is single-voice (mono);
// we collapse all allocator voices into one virtual voice:
//   gate  = OR of every voice's gate
//   pitch = pitch of the most recently gated voice; if none is gated
//           we hold the last pitch (so release still has a defined Hz).
// This avoids the "only voice 0 ever updates" stall while we don't yet
// have true polyphony in the firmware graph.
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Editor → Teensy callbacks.
// ------------------------------------------------------------------

void activatePatchAndBuild(const char* patchId);  // defined below

void onConfigReceived(JsonObjectConst project) {
    const char* name = project["name"] | "(unnamed)";
    mmb_link::TeensyLink::logf("config received: name=%s", name);
    runtime.applyConfig(project);
    // FW-CS-1: control-surface-bindings reizen mee in de config.
    const int nBindings = midiMap.load(project);
    if (nBindings > 0 || midiMap.skipped() > 0) {
        mmb_link::TeensyLink::logf("midiMap: %d binding(s), %d skipped",
                                   nBindings, static_cast<int>(midiMap.skipped()));
    }
    // Een config die een activePatchId meelevert is meteen speelbaar: bouw de
    // graphs direct, zonder een aparte selectPatch te vereisen. Dat voorkomt
    // de volgorde-valkuil "selectPatch vóór config → unknown id".
    if (!runtime.activePatchId().empty()) {
        // Kopie: activatePatch() schrijft activePatchId_ opnieuw, dus een
        // pointer het veld in zou zichzelf aliassen.
        const std::string id = runtime.activePatchId();
        activatePatchAndBuild(id.c_str());
    }
}

// ------------------------------------------------------------------
// Poly scaling — make the runtime voice count follow the active patch.
//
// The patch carries a top-level `voiceCount` (1 = mono, 2 = duo, N = poly).
// Each runtime MidiInModule owns a VoiceAllocator; we push the patch value
// so per-voice ports (pitchK/gateK/velK) fan out to exactly N voices and
// CvGraph routes them to the editor-expanded per-voice modules.
//
// This is the lever for the "how many voices can the Teensy sustain" test:
// raise voiceCount in the editor, push, and watch the audio-block peak.
// The static 4-voice fallback chain (osc/vca/eg arrays + AudioMixer4) is
// hard-capped at kVoices=4 by fixed Teensy Audio objects and is unaffected.
// ------------------------------------------------------------------
void applyPatchVoiceCount(JsonObjectConst patch) {
    const int vc = patch["voiceCount"] | 0;
    if (vc < 1) return;  // absent/invalid: leave the module's own default.
    int configured = 0;
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != mb::runtime::MidiInModule::kTypeId) continue;
        mod->setControl("voiceCount", static_cast<int32_t>(vc));
        ++configured;
    }
    mmb_link::TeensyLink::logf("patch voiceCount=%d applied to %d MidiIn module(s)",
                               vc, configured);
}

// Activeer @p patchId en (her)bouw de audio- + CV-graphs. Gedeeld door de
// selectPatch-handler en de config-handler (zie onConfigReceived).
void activatePatchAndBuild(const char* patchId) {
    if (runtime.activatePatch(patchId)) {
        // Teensy AudioConnection::connect() is first-source-wins: if the
        // static mix is still attached to usbOut.ch0/1, the dynamic patch's
        // out-module connections will be silently dropped. Force-mute the
        // static path before (re)building the dynamic graph.
        if (staticEnabled) {
            staticEnabled = false;
            applyStaticEnabled();
            mmb_link::TeensyLink::logf("static auto-muted for dynamic patch");
        }
        JsonObjectConst patch = runtime.activePatchJson();
        if (!patch.isNull()) {
            applyPatchVoiceCount(patch);
            audioGraph.build(patch, runtime.instances());
            cvGraph.build(patch, runtime.instances());
            // Peak audio-block usage after (re)building. If this approaches the
            // AudioMemory() budget the pool is too small for the patch.
            mmb_link::TeensyLink::logf("audio blocks: peak=%u / budget=%u",
                                       (unsigned)AudioMemoryUsageMax(),
                                       kAudioPoolBlocks);
            AudioMemoryUsageMaxReset();
        }
    }
}

void onSelectPatch(const char* patchId) {
    mmb_link::TeensyLink::logf("selectPatch: %s", patchId);
    activatePatchAndBuild(patchId);
}

// Telemetrie voor de editor ({"type":"getStatus"} → {"type":"status",...}).
// cpu/cpuMax = audio-ISR-belasting in %, mem/memMax = audio-blocks in gebruik
// t.o.v. de pool, loopHz = main-loop-iteraties per seconde (CV-tick-headroom).
void onGetStatus(JsonObject s) {
    s["cpu"]      = AudioProcessorUsage();
    s["cpuMax"]   = AudioProcessorUsageMax();
    s["mem"]      = AudioMemoryUsage();
    s["memMax"]   = AudioMemoryUsageMax();
    s["memPool"]  = kAudioPoolBlocks;
    s["modules"]  = static_cast<int>(runtime.instanceCount());
    s["retired"]  = static_cast<int>(runtime.retiredCount());
    s["patch"]    = runtime.activePatchId();
    s["loopHz"]   = loopsPerSec;
    s["uptimeMs"] = millis();
    s["heapFree"] = freeHeapBytes();
    // Generieke output-meter: hoogste |sample| op de master-uitgang (L/R)
    // sinds de vorige poll — hét "hoor ik iets?"-signaal voor tests/strip.
    s["outPeak"]  = mmb_link::OutModule::takeMasterPeak();
#if HAVE_STK
    s["stkOom"]   = stk::Stk::memoryFailure();
#endif
    // Ad-hoc Elements-diagnose (tot er per-module telemetrie is): rendert de
    // eerste Elements-instantie echt, en wat kost hij in de audio-ISR?
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::ElementsModule::kTypeId}) continue;
        auto* em = static_cast<mmb_link::ElementsModule*>(mod.get());
        s["elementsReady"] = em->voice().dspReady();
        s["elementsCpu"]   = em->voice().processorUsage();
        s["elementsPeak"]  = em->voice().takePeak();
        // Ketendiagnose: gate → exciter → resonator (meters van Part zelf).
        s["elementsGate"]  = em->voice().part().gate();
        s["elementsExc"]   = em->voice().part().exciter_level();
        s["elementsRes"]   = em->voice().part().resonator_level();
        break;
    }
    // Zelfde ad-hoc diagnose voor de eerste Rings-instantie.
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::RingsModule::kTypeId}) continue;
        auto* rm = static_cast<mmb_link::RingsModule*>(mod.get());
        s["ringsReady"] = rm->voice().dspReady();
        s["ringsCpu"]   = rm->voice().processorUsage();
        s["ringsPeak"]  = rm->voice().takePeak();
        break;
    }
    // ... en voor de eerste Plaits-instantie.
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::PlaitsModule::kTypeId}) continue;
        auto* pm = static_cast<mmb_link::PlaitsModule*>(mod.get());
        s["plaitsReady"] = pm->voice().dspReady();
        s["plaitsCpu"]   = pm->voice().processorUsage();
        s["plaitsPeak"]  = pm->voice().takePeak();
        break;
    }
    // ... Clouds (granular FX).
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::CloudsModule::kTypeId}) continue;
        auto* cm = static_cast<mmb_link::CloudsModule*>(mod.get());
        s["cloudsReady"] = cm->voice().dspReady();
        s["cloudsCpu"]   = cm->voice().processorUsage();
        s["cloudsPeak"]  = cm->voice().takePeak();
        break;
    }
    // ... Tides (CV-domein): live waarde van out1 als teken van leven.
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::TidesModule::kTypeId}) continue;
        s["tidesOut1"] = mod->readCvPort("out1");
        break;
    }
    // ... Warps: ready + output-peak.
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::WarpsModule::kTypeId}) continue;
        auto* wm = static_cast<mmb_link::WarpsModule*>(mod.get());
        s["warpsReady"] = wm->voice().ready();
        s["warpsPeak"]  = wm->voice().takePeak();
        break;
    }
    // ... Marbles (CV-domein): x1 + master-klok als teken van leven.
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != std::string_view{mmb_link::MarblesModule::kTypeId}) continue;
        s["marblesX1"]   = mod->readCvPort("x1");
        s["marblesTclk"] = mod->readCvPort("tclk");
        break;
    }
}

void onSetStatic(bool enabled) {
    staticEnabled = enabled;
    applyStaticEnabled();
    mmb_link::TeensyLink::logf("static graph %s", enabled ? "enabled" : "muted");
}

// ------------------------------------------------------------------
// V/Oct → Hz: MIDI 60 = 0 V = 261.626 Hz (C4); +1 V = +1 octave.
// ------------------------------------------------------------------
inline float voltsToHz(float v) {
    return 261.6256f * powf(2.0f, v);
}

// ------------------------------------------------------------------
// Static 4-voice sync (B-step 2 fallback, always active).
// ------------------------------------------------------------------
void syncVoicesFromModel() {
    AudioNoInterrupts();
    for (uint8_t i = 0; i < kVoices; ++i) {
        const bool  gate = midiIn.voiceGate(i);
        const float hz   = voltsToHz(midiIn.voicePitchV(i));
        const float vel  = midiIn.voiceVelocity(i);
        osc[i].frequency(hz);
        if (gate) {
            eg[i].amplitude(vel * 0.7f, 5);   // 5 ms attack
        } else {
            eg[i].amplitude(0.0f, 60);        // 60 ms release
        }
    }
    // Drive dynamic CV routes (replaces the old voice-0 monosync).
    cvGraph.tickBridge();
    AudioInterrupts();
}

void logVoiceTable(const char* tag) {
    Serial.printf("[voices %s] ", tag);
    for (uint8_t i = 0; i < kVoices; ++i) {
        const float v = midiIn.voicePitchV(i);
        const int   midi = static_cast<int>(60 + v * 12.0f + (v >= 0 ? 0.5f : -0.5f));
        Serial.printf("%u:%s%d ", i, midiIn.voiceGate(i) ? "*" : " ", midi);
    }
    Serial.println();
}

void forwardMidiToRuntime(bool noteOn, uint8_t channel, uint8_t note, uint8_t velocity) {
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != mb::runtime::MidiInModule::kTypeId) continue;
        auto* m = static_cast<mb::runtime::MidiInModule*>(mod.get());
        if (noteOn) m->onNoteOn(channel, note, velocity);
        else        m->onNoteOff(channel, note);
    }
}

/*
 * Note: we deliberately do NOT echo notes back over usbMIDI.  An earlier
 * step transposed every note +12 and re-sent it for the host-side
 * `pipeline_test.py` round-trip check.  That echo is harmful in normal use:
 * if the editor's MIDI bridge is subscribed to the Teensy's own MIDI port
 * (or any DAW loops it back), each note re-enters handleNoteOn() one octave
 * higher, producing a runaway 60->72->84->... cascade that sounds like a
 * hoarse ring-modulator.  Real-instrument behaviour = one key, one voice.
 */
void handleNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
    Serial.printf("[midi] noteOn  ch=%u note=%u vel=%u\n", channel, note, velocity);
    midiIn.onNoteOn(channel, note, velocity);
    forwardMidiToRuntime(true, channel, note, velocity);
    syncVoicesFromModel();
    logVoiceTable("on ");
}

void handleNoteOff(uint8_t channel, uint8_t note, uint8_t velocity) {
    Serial.printf("[midi] noteOff ch=%u note=%u vel=%u\n", channel, note, velocity);
    midiIn.onNoteOff(channel, note);
    forwardMidiToRuntime(false, channel, note, velocity);
    syncVoicesFromModel();
    logVoiceTable("off");
}

// Continuous controllers (mod-wheel + configurable CCs) and pitch-bend are
// forwarded to every runtime MidiInModule so their cv_mod/cv_bend/cv_cc*
// outputs track the controller. These do not retrigger voices, so there's no
// need to re-sync the static voice table here.
void handleControlChange(uint8_t channel, uint8_t cc, uint8_t value) {
    Serial.printf("[midi] cc      ch=%u cc=%u val=%u\n", channel, cc, value);
    // FW-CS-1: een CC met een binding in de midiMap stuurt één module-control
    // aan (zelfde pad als controlPoke: toepassen + persisteren) en wordt hier
    // geconsumeerd — hij mag de MidiInModules niet óók bereiken, anders krijgt
    // dezelfde knopdraai een tweede betekenis via het cv_cc*-pad.
    if (const auto* b = midiMap.match(channel, cc)) {
        runtime.pokeControl(b->moduleId.c_str(), b->controlId.c_str(),
                            mmb_link::MidiMap::scale(*b, value));
        return;
    }
    midiIn.onControlChange(channel, cc, value);
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != mb::runtime::MidiInModule::kTypeId) continue;
        static_cast<mb::runtime::MidiInModule*>(mod.get())->onControlChange(channel, cc, value);
    }
}

void handlePitchChange(uint8_t channel, int pitch) {
    // Teensy reports bend as a signed -8192..8191 offset; MidiInModule wants
    // the raw 14-bit value (8192 = centre).
    const int value14 = pitch + 8192;
    Serial.printf("[midi] bend    ch=%u pitch=%d (14b=%d)\n", channel, pitch, value14);
    midiIn.onPitchBend(channel, value14);
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() != mb::runtime::MidiInModule::kTypeId) continue;
        static_cast<mb::runtime::MidiInModule*>(mod.get())->onPitchBend(channel, value14);
    }
}

// Editor MIDI bridge: notes sent over the serial link ({"type":"midi",...})
// are dispatched through the same path as hardware USB-MIDI so the editor can
// drive the runtime patch without a separate MIDI connection.
void onMidiNote(bool on, uint8_t channel, uint8_t note, uint8_t velocity) {
    if (on) handleNoteOn(channel, note, velocity);
    else    handleNoteOff(channel, note, velocity);
}

// Editor MIDI bridge: pitch-bend forwarded via the serial link.
// The JSON protocol sends a 14-bit unsigned value (0-16383, 8192=centre);
// TeensyLink converts that back to the signed -8192..8191 offset that
// handlePitchChange() expects (same convention as usbMIDI).
void onMidiBend(uint8_t channel, int pitch) {
    handlePitchChange(channel, pitch);
}

// Editor MIDI bridge: control-change (incl. mod-wheel CC1) forwarded via the
// serial link, dispatched through the same path as hardware USB-MIDI.
void onMidiCc(uint8_t channel, uint8_t controller, uint8_t value) {
    handleControlChange(channel, controller, value);
}

// Live control-sync (FW-LIVE-1): apply one control value to one module
// instantly and persist it into the active patch. No graph rebuild.
void onControlPoke(const char* moduleId, const char* controlId,
                   JsonVariantConst value) {
    runtime.pokeControl(moduleId, controlId, value);
}

// Draw-waveshape push (FW-AU-6): copy the JSON int array into an int16 buffer
// and hand it to the target oscillator via the RTTI-free setWaveformData hook.
// DX7-bank push: 4096 bytes (32 voices packed) naar de gedeelde bank van
// alle Dx7Voice-instanties. Instanties herladen hun program bij de volgende
// note-on (bankVersion-check), dus geen ISR-fence nodig.
void onDx7Bank(JsonArrayConst data) {
    static uint8_t bank[4096];
    if (data.size() != sizeof(bank)) {
        mmb_link::TeensyLink::logf("dx7bank: verwacht 4096 bytes, kreeg %u",
                                   (unsigned)data.size());
        return;
    }
    size_t i = 0;
    for (JsonVariantConst v : data) bank[i++] = static_cast<uint8_t>(v.as<int>());
    mmb_link::Dx7Voice::setBank(bank, sizeof(bank));
    char name[11];
    mmb_link::Dx7Voice::bankVoiceName(0, name);
    mmb_link::TeensyLink::logf("dx7bank geladen; voice 0 = \"%s\"", name);
}

void onWaveform(const char* moduleId, JsonArrayConst data) {
    static int16_t buf[256];
    std::size_t n = 0;
    for (JsonVariantConst v : data) {
        if (n >= 256) break;
        int s = v.as<int>();
        if (s >  32767) s =  32767;
        if (s < -32768) s = -32768;
        buf[n++] = static_cast<int16_t>(s);
    }
    if (n >= 2) runtime.setWaveform(moduleId, buf, n);
}

}  // namespace

void setup() {
    pinMode(kHeartbeatPin, OUTPUT);
    Serial.begin(115200);
    uint32_t t0 = millis();
    while (!Serial && (millis() - t0) < 1500) { /* spin briefly */ }
    Serial.println("[boot] MusicBrain Teensy step-3 (dynamic audio graph) online");
    Serial.printf("[boot] CPU @ %lu MHz\n", static_cast<unsigned long>(F_CPU_ACTUAL / 1000000));

    // If the previous run hard-faulted (null deref, stack overflow, etc.) the
    // Teensy reboots and re-enumerates over USB — which the editor sees as
    // "device has been lost". CrashReport survives the reboot and tells us the
    // fault address/type, so dump it once on boot for diagnosis. (No-op on a
    // clean power-up.)
    if (CrashReport) {
        Serial.println("[boot] *** previous run crashed — CrashReport follows ***");
        Serial.print(CrashReport);
        Serial.println("[boot] *** end CrashReport ***");
    }

    // Audio block pool. 40 was too tight once the dynamic patch adds a second
    // voice chain (2× VCO/VCF/VCA + envelopes + mixer): exhausting the pool
    // starves the audio ISR and can hard-fault → USB drop. Teensy 4.1 has
    // ample RAM, so budget generously and report the high-water mark. The
    // echo/comb delay lines (FW-AU-2/3) each grab ~1 block per 2.9 ms of
    // delay, so the pool is sized to host a couple of long delays at once.
    AudioMemory(kAudioPoolBlocks);

    // Static 4-voice graph (B-step 2)
    for (uint8_t i = 0; i < kVoices; ++i) {
        osc[i].begin(WAVEFORM_SAWTOOTH);
        osc[i].amplitude(0.9f);
        osc[i].frequency(220.0f);
        eg[i].amplitude(0.0f);
        new (voiceWires(i)) VoiceWires(i);
        mixL.gain(i, 0.25f);
        mixR.gain(i, 0.25f);
    }
    // Master-gain-paar (OutModule::level) tussen alles en de USB-sink.
    mmb_link::OutModule::attachSink(&usbOut);
    mixToUsbL = std::make_unique<AudioConnection>(
        mixL, 0, mmb_link::OutModule::masterAmpL(), 0);
    mixToUsbR = std::make_unique<AudioConnection>(
        mixR, 0, mmb_link::OutModule::masterAmpR(), 0);

    midiIn.setControl("channel",    static_cast<int32_t>(0));         // omni
    midiIn.setControl("voiceCount", static_cast<int32_t>(kVoices));
    Serial.printf("[boot] MidiInModule: omni, voices=%u\n", midiIn.voiceCount());

    usbMIDI.setHandleNoteOn (handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);
    usbMIDI.setHandleControlChange(handleControlChange);
    usbMIDI.setHandlePitchChange  (handlePitchChange);

    mmb_link::registerAllRuntimeModules();
    link.begin(onConfigReceived, onSelectPatch, onSetStatic, onMidiNote, onMidiBend, onMidiCc);
    link.onControlPoke(onControlPoke);   // FW-LIVE-1: live control-sync
    link.onWaveform(onWaveform);         // FW-AU-6: draw-waveshape push
    link.onDx7Bank(onDx7Bank);           // FW-AU-13: DX7-bank push
    link.onGetStatus(onGetStatus);       // telemetrie voor de editor
}

void loop() {
    while (usbMIDI.read()) { /* drain */ }
    link.poll();

    // CV tick — advance envelopes approximately every 1 ms
    const uint32_t now = millis();
    if (now - lastCvTickMs >= 1) {
        lastCvTickMs = now;
        tickCvModules();
        cvGraph.tickBridge();
    }

    // Loop-rate meter (zie declaratie boven): eens per seconde snapshotten.
    ++loopCounter;
    if (now - lastLoopMarkMs >= 1000) {
        loopsPerSec   = loopCounter;
        loopCounter   = 0;
        lastLoopMarkMs = now;
    }

    if (now - lastBlinkMs >= kHeartbeatPeriodMs / 2) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
