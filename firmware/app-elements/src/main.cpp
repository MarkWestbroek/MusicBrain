// MusicBrain — app-elements SPIKE.
//
// Goal: measure the audio-block CPU cost of one ported Mutable Instruments
// *Elements* voice on a Teensy 4.1 before integrating `tp_mmb_elements` into
// app-modular-brain.
//
// Signal path: ElementsVoice (AudioStream) -> USB audio (L+R).
// Control:     USB-MIDI noteOn/off -> voice.noteOn(hz, strength).
//
// Every second the loop prints AudioProcessorUsageMax() (the headline number
// for "how many voices fit") and AudioMemoryUsageMax(). Play notes, watch the
// peak settle, then divide the budget to estimate the voice count.

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <cmath>

#include "FwVersion.h"
#include "ElementsModule.h"

namespace {

mmb_link::ElementsModule elements{"elements1"};
AudioOutputUSB           usbOut;

// Mono voice -> both USB channels.
AudioConnection outL{ elements.voice(), 0, usbOut, 0 };
AudioConnection outR{ elements.voice(), 0, usbOut, 1 };

constexpr uint8_t kHeartbeatPin = LED_BUILTIN;
uint32_t lastBlinkMs = 0;
uint32_t lastReportMs = 0;
bool ledState = false;

inline float noteToHz(uint8_t note) {
    return 440.0f * powf(2.0f, (static_cast<int>(note) - 69) / 12.0f);
}

void handleNoteOn(uint8_t /*ch*/, uint8_t note, uint8_t velocity) {
    if (velocity == 0) return;  // running-status note-off
    const float strength = velocity / 127.0f;
    elements.voice().noteOn(noteToHz(note), strength);
    Serial.printf("[midi] strike note=%u hz=%.1f strength=%.2f\n",
                  note, noteToHz(note), strength);
}

void handleNoteOff(uint8_t /*ch*/, uint8_t /*note*/, uint8_t /*velocity*/) {
    // Modal voice rings out on its own decay; nothing to gate off in the spike.
}

}  // namespace

void setup() {
    pinMode(kHeartbeatPin, OUTPUT);
    Serial.begin(115200);
    uint32_t t0 = millis();
    while (!Serial && (millis() - t0) < 1500) { /* spin briefly */ }
    Serial.printf("[boot] app-elements spike %s online\n", FW_VERSION);
    Serial.printf("[boot] CPU @ %lu MHz\n",
                  static_cast<unsigned long>(F_CPU_ACTUAL / 1000000));
    if (CrashReport) {
        Serial.println("[boot] *** previous run crashed — CrashReport follows ***");
        Serial.print(CrashReport);
        Serial.println("[boot] *** end CrashReport ***");
    }

    AudioMemory(60);

    usbMIDI.setHandleNoteOn(handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);

    // Register the factory so the module is ready for app-modular-brain reuse.
    mmb_link::ElementsModule::registerFactory();

    Serial.println("[boot] play MIDI notes to strike the resonator");
}

void loop() {
    while (usbMIDI.read()) { /* drain */ }

    const uint32_t now = millis();

    if (now - lastReportMs >= 1000) {
        lastReportMs = now;
        Serial.printf("[cpu] audio peak=%.1f%%  mem peak=%u/60 blocks\n",
                      AudioProcessorUsageMax(),
                      static_cast<unsigned>(AudioMemoryUsageMax()));
        AudioProcessorUsageMaxReset();
        AudioMemoryUsageMaxReset();
    }

    if (now - lastBlinkMs >= 500) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
