// MusicBrain Teensy firmware — B-phase step 2: 4-voice polyphony via
// the shared `mb::runtime::MidiInModule` allocator.
//
// Audio graph (per voice):
//   AudioSynthWaveform osc -> AudioEffectMultiply vca <- AudioSynthWaveformDc eg
// Voice outputs are summed in one stereo AudioMixer4 then sent to USB-audio.
//
// MIDI handling:
//   usbMIDI callbacks -> midiIn.onNoteOn/Off (delegates to VoiceAllocator).
//   After each event we resync all `kVoices` audio voices from
//   midiIn.voicePitchV / voiceGate / voiceVelocity. Pure read-from-model
//   so the Audio library never sees inconsistent state.

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <new>

#include "mb/runtime/MidiIn.h"
#include "TeensyLink.h"

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

alignas(AudioConnection) char mixToUsbStorageL[sizeof(AudioConnection)];
alignas(AudioConnection) char mixToUsbStorageR[sizeof(AudioConnection)];

constexpr uint8_t kHeartbeatPin = LED_BUILTIN;
constexpr uint32_t kHeartbeatPeriodMs = 1000;
uint32_t lastBlinkMs = 0;
bool ledState = false;

mmb_link::TeensyLink link;

// Editor → Teensy callbacks. B-step 2 just logs; B-step 3 will rebuild
// the audio graph from the project tree.
void onConfigReceived(JsonObjectConst project) {
    const char* name = project["name"] | "(unnamed)";
    mmb_link::TeensyLink::logf("config received: name=%s", name);
}

void onSelectPatch(const char* patchId) {
    mmb_link::TeensyLink::logf("selectPatch: %s", patchId);
}

// V/Oct → Hz: MIDI 60 = 0 V = 261.626 Hz (C4); +1 V = +1 octave.
inline float voltsToHz(float v) {
    return 261.6256f * powf(2.0f, v);
}

void syncVoicesFromModel() {
    // Atomic re-config vs audio ISR.
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
    Serial.println("[boot] MusicBrain Teensy step-2 (4-voice via MidiInModule) online");
    Serial.printf("[boot] CPU @ %lu MHz\n", static_cast<unsigned long>(F_CPU_ACTUAL / 1000000));

    AudioMemory(40);
    for (uint8_t i = 0; i < kVoices; ++i) {
        osc[i].begin(WAVEFORM_SAWTOOTH);
        osc[i].amplitude(0.9f);
        osc[i].frequency(220.0f);
        eg[i].amplitude(0.0f);
        new (voiceWires(i)) VoiceWires(i);
        mixL.gain(i, 0.25f);
        mixR.gain(i, 0.25f);
    }
    new (mixToUsbStorageL) AudioConnection(mixL, 0, usbOut, 0);
    new (mixToUsbStorageR) AudioConnection(mixR, 0, usbOut, 1);

    midiIn.setControl("channel",    static_cast<int32_t>(0));         // omni
    midiIn.setControl("voiceCount", static_cast<int32_t>(kVoices));
    Serial.printf("[boot] MidiInModule: omni, voices=%u\n", midiIn.voiceCount());

    usbMIDI.setHandleNoteOn (handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);

    link.begin(onConfigReceived, onSelectPatch);
}

void loop() {
    while (usbMIDI.read()) { /* drain */ }
    link.poll();

    uint32_t now = millis();
    if (now - lastBlinkMs >= kHeartbeatPeriodMs / 2) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
