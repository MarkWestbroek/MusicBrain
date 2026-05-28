// MusicBrain Teensy firmware — B-phase step 3: dynamic audio graph from patch JSON.
//
// Static 4-voice graph (B-step 2) remains active as a fallback.
// When the editor pushes a project and activates a patch, AudioGraph
// wires the project modules (VCO, VCA, AHDSR-DC, VCF, Out) via
// AudioConnection objects derived from the patch's connection list.
//
// CV bridge:
//   syncVoicesFromModel() still drives the static 4-voice chain.
//   syncDynamicModules()  additionally drives any VcoModule / AhdsrAudioModule
//   instances in the live runtime (voice 0 only — mono patch support).
//
// CV tick:
//   loop() calls tickCvModules() every ≥1 ms so AhdsrAudioModule instances
//   advance their envelopes and update their DC proxy outputs.

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <memory>
#include <new>

#include "mb/runtime/MidiIn.h"
#include "TeensyLink.h"
#include "ProjectRuntime.h"
#include "RegisterAllModules.h"
#include "AudioGraph.h"
#include "CvGraph.h"
#include "VcoModule.h"
#include "AhdsrAudioModule.h"
#include "OutModule.h"

namespace {

constexpr uint8_t kVoices = 4;

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

// Static 4-voice graph on/off. Toggled via the editor's "Static graph" switch
// (command {"type":"setStatic","enabled":bool}) so you can isolate the
// dynamic patch.
bool staticEnabled = true;

void applyStaticEnabled() {
    AudioNoInterrupts();
    if (staticEnabled) {
        if (!mixToUsbL) mixToUsbL = std::make_unique<AudioConnection>(mixL, 0, usbOut, 0);
        if (!mixToUsbR) mixToUsbR = std::make_unique<AudioConnection>(mixR, 0, usbOut, 1);
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
// Advances all AhdsrAudioModule envelopes and pushes the new value
// to their AudioSynthWaveformDc proxy outputs.
// ------------------------------------------------------------------
uint32_t lastCvTickMs = 0;

void tickCvModules() {
    for (auto& [id, mod] : runtime.instances()) {
        if (mod->typeId() == mmb_link::AhdsrAudioModule::kTypeId)
            static_cast<mmb_link::AhdsrAudioModule*>(mod.get())->tick();
    }
}

// ------------------------------------------------------------------
// Dynamic CV bridge — drives VcoModule pitch and AhdsrAudioModule gate
// from the live MidiInModule.  The patch graph is single-voice (mono);
// we collapse all allocator voices into one virtual voice:
//   gate  = OR of every voice's gate
//   pitch = pitch of the most recently gated voice; if none is gated
//           we hold the last pitch (so release still has a defined Hz).
// This avoids the "only voice 0 ever updates" stall while we don't yet
// have true polyphony in the firmware graph.
// ------------------------------------------------------------------
void syncDynamicModules() {
    static float lastPitchV = 0.0f;
    bool  anyGate   = false;
    float pitchV    = lastPitchV;
    const std::uint8_t n = midiIn.voiceCount();
    for (std::uint8_t v = 0; v < n; ++v) {
        if (midiIn.voiceGate(v)) {
            if (!anyGate) pitchV = midiIn.voicePitchV(v);
            anyGate = true;
        }
    }
    if (anyGate) lastPitchV = pitchV;

    for (auto& [id, mod] : runtime.instances()) {
        const std::string_view tid = mod->typeId();
        if (tid == mmb_link::VcoModule::kTypeId)
            static_cast<mmb_link::VcoModule*>(mod.get())->updatePitch(pitchV);
        else if (tid == mmb_link::AhdsrAudioModule::kTypeId)
            static_cast<mmb_link::AhdsrAudioModule*>(mod.get())->setGate(anyGate);
    }
}

// ------------------------------------------------------------------
// Editor → Teensy callbacks.
// ------------------------------------------------------------------

void onConfigReceived(JsonObjectConst project) {
    const char* name = project["name"] | "(unnamed)";
    mmb_link::TeensyLink::logf("config received: name=%s", name);
    runtime.applyConfig(project);
}

void onSelectPatch(const char* patchId) {
    mmb_link::TeensyLink::logf("selectPatch: %s", patchId);
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
            audioGraph.build(patch, runtime.instances());
            cvGraph.build(patch, runtime.instances());
        }
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

void handleNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
    Serial.printf("[midi] noteOn  ch=%u note=%u vel=%u\n", channel, note, velocity);
    midiIn.onNoteOn(channel, note, velocity);
    syncVoicesFromModel();
    logVoiceTable("on ");
    uint8_t echoed = static_cast<uint8_t>(note + 12);
    if (echoed <= 127) usbMIDI.sendNoteOn(echoed, velocity, channel);
}

void handleNoteOff(uint8_t channel, uint8_t note, uint8_t velocity) {
    Serial.printf("[midi] noteOff ch=%u note=%u vel=%u\n", channel, note, velocity);
    midiIn.onNoteOff(channel, note);
    syncVoicesFromModel();
    logVoiceTable("off");
    uint8_t echoed = static_cast<uint8_t>(note + 12);
    if (echoed <= 127) usbMIDI.sendNoteOff(echoed, velocity, channel);
}

}  // namespace

void setup() {
    pinMode(kHeartbeatPin, OUTPUT);
    Serial.begin(115200);
    uint32_t t0 = millis();
    while (!Serial && (millis() - t0) < 1500) { /* spin briefly */ }
    Serial.println("[boot] MusicBrain Teensy step-3 (dynamic audio graph) online");
    Serial.printf("[boot] CPU @ %lu MHz\n", static_cast<unsigned long>(F_CPU_ACTUAL / 1000000));

    AudioMemory(40);

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
    mixToUsbL = std::make_unique<AudioConnection>(mixL, 0, usbOut, 0);
    mixToUsbR = std::make_unique<AudioConnection>(mixR, 0, usbOut, 1);

    // Point OutModule instances at the shared USB output
    mmb_link::OutModule::sharedOutput = &usbOut;

    midiIn.setControl("channel",    static_cast<int32_t>(0));         // omni
    midiIn.setControl("voiceCount", static_cast<int32_t>(kVoices));
    Serial.printf("[boot] MidiInModule: omni, voices=%u\n", midiIn.voiceCount());

    usbMIDI.setHandleNoteOn (handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);

    mmb_link::registerAllRuntimeModules();
    link.begin(onConfigReceived, onSelectPatch, onSetStatic);
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

    if (now - lastBlinkMs >= kHeartbeatPeriodMs / 2) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
