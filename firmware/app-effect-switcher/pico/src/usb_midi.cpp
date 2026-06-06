// usb_midi.cpp — USB MIDI device implementation for RP2040.

#include "usb_midi.h"

#include <Adafruit_TinyUSB.h>

namespace mb {

static Adafruit_USBD_MIDI usb_midi;

void UsbMidi::begin() {
  // The arduino-pico core with USE_TINYUSB=1 handles TinyUSB device init.
  // We just need to start the MIDI interface.
  usb_midi.begin(31250);
  Serial.println(F("[usb-midi] ready — Pico W appears as USB MIDI device to host"));
}

void UsbMidi::loop() {
  // Read incoming USB MIDI messages
  while (usb_midi.available()) {
    uint8_t status = usb_midi.read();
    uint8_t data1 = usb_midi.read();
    uint8_t data2 = usb_midi.read();
    
    MidiMessage msg{};
    msg.channel = (status & 0x0F) + 1;
    msg.data1   = data1;
    msg.data2   = data2;
    
    const uint8_t type = status >> 4;
    switch (type) {
      case 0x8:
        msg.type = MidiType::NoteOff;
        break;
      case 0x9:
        msg.type = MidiType::NoteOn;
        break;
      case 0xB:
        msg.type = MidiType::ControlChange;
        break;
      case 0xC:
        msg.type = MidiType::ProgramChange;
        break;
      default:
        // Unsupported message type, skip
        continue;
    }
    
    if (_cb) {
      _cb(msg);
    }
  }
}

void UsbMidi::sendCC(uint8_t channel, uint8_t cc, uint8_t value) {
  usb_midi.write(0xB0 | ((channel - 1) & 0x0F));
  usb_midi.write(cc);
  usb_midi.write(value);
}

void UsbMidi::sendProgramChange(uint8_t channel, uint8_t program) {
  usb_midi.write(0xC0 | ((channel - 1) & 0x0F));
  usb_midi.write(program);
}

void UsbMidi::sendNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
  usb_midi.write(0x90 | ((channel - 1) & 0x0F));
  usb_midi.write(note);
  usb_midi.write(velocity);
}

void UsbMidi::sendNoteOff(uint8_t channel, uint8_t note, uint8_t velocity) {
  usb_midi.write(0x80 | ((channel - 1) & 0x0F));
  usb_midi.write(note);
  usb_midi.write(velocity);
}

}  // namespace mb
