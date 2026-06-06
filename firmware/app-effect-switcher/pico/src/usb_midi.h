// usb_midi.h — USB MIDI device support for RP2040.
//
// The Raspberry Pi Pico W has native USB device support. This module exposes
// the Pico as a USB MIDI device to the host PC, allowing Program Change and
// other MIDI messages to be sent from a DAW or MIDI editor.
//
// This is a Pico W-specific feature not available on the ESP32 build.

#pragma once
#include <Arduino.h>
#include <functional>
#include "midi_types.h"

namespace mb {

class UsbMidi {
 public:
  using MessageCallback = std::function<void(const MidiMessage&)>;

  /// Initialise USB MIDI. Call once from setup().
  void begin();

  /// Register callback for incoming USB MIDI messages.
  void onMessage(MessageCallback cb) { _cb = std::move(cb); }

  /// Poll USB MIDI input and dispatch messages. Call from loop().
  void loop();

  /// Send a Control Change message over USB MIDI.
  void sendCC(uint8_t channel, uint8_t cc, uint8_t value);

  /// Send a Program Change message over USB MIDI.
  void sendProgramChange(uint8_t channel, uint8_t program);

  /// Send a Note On message over USB MIDI.
  void sendNoteOn(uint8_t channel, uint8_t note, uint8_t velocity);

  /// Send a Note Off message over USB MIDI.
  void sendNoteOff(uint8_t channel, uint8_t note, uint8_t velocity = 0);

 private:
  MessageCallback _cb;
};

}  // namespace mb
