// MusicBrain SPI-bus — host-abstractie (Teensy 4.1).
//
// Pin-toewijzing en gedrag volgen doc/spi-bus-spec.md. Dit is de "domme
// peripheral"-bus: alle kaarten hangen als slaves aan één gedeelde SPI0
// (SCK/MOSI/MISO) en worden geografisch geselecteerd via hun slot-CS. Twee
// busbrede strobes: LDAC (DAC-kaarten updaten synchroon) en CONVST=SPARE1
// (ADC-kaarten samplen synchroon). SPARE2 = busbrede ADC-reset.
//
// NB: dit is een ander concept dan firmware/breakouts/ (slimme SPI-slave
// breakouts met eigen MCU + frame-protocol, ADR 0004/0006/0008).
#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>

namespace mb {

// Teensy 4.1 pinnen (doc/spi-bus-spec.md §"Teensy 4.1 pintoewijzing").
struct Pins {
  static constexpr uint8_t SCK = 13, MOSI = 11, MISO = 12;
  static constexpr uint8_t LDAC = 2;        // sample-sync DAC-update
  static constexpr uint8_t CONVST = 40;     // SPARE1: sample-sync ADC-strobe
  static constexpr uint8_t ADC_RESET = 41;  // SPARE2: busbrede ADC-reset
  static constexpr uint8_t SDA = 18, SCL = 19;
  // CS1..CS8: slot 1..6 dan hub 1..2.
  static constexpr uint8_t CS[8]  = {10, 9, 8, 7, 6, 5, 4, 3};
  // IRQ1..IRQ6: slot 1..6.
  static constexpr uint8_t IRQ[6] = {28, 29, 30, 31, 32, 33};
};

// slot: 1..6, hub: 1..2.
inline uint8_t slotCs(uint8_t slot)  { return Pins::CS[slot - 1]; }
inline uint8_t slotIrq(uint8_t slot) { return Pins::IRQ[slot - 1]; }
inline uint8_t hubCs(uint8_t hub)    { return Pins::CS[6 + (hub - 1)]; }

// Roep begin() éénmaal aan (na SPI-hardware-init hoeft niets extra's).
class Bus {
 public:
  void begin() {
    SPI.begin();
    Wire.begin();
    for (uint8_t i = 0; i < 8; i++) {
      pinMode(Pins::CS[i], OUTPUT);
      digitalWriteFast(Pins::CS[i], HIGH);   // idle hoog (gedeselecteerd)
    }
    for (uint8_t i = 0; i < 6; i++) pinMode(Pins::IRQ[i], INPUT);
    pinMode(Pins::LDAC, OUTPUT);      digitalWriteFast(Pins::LDAC, HIGH);
    pinMode(Pins::CONVST, OUTPUT);    digitalWriteFast(Pins::CONVST, HIGH);
    pinMode(Pins::ADC_RESET, OUTPUT); digitalWriteFast(Pins::ADC_RESET, LOW);
  }

  // DAC-kaarten laden hun uitgangsregisters tegelijk op de LDAC-neerflank.
  // Roep dit ná het wegschrijven van alle DAC-data aan (sample-synchroon).
  void ldacStrobe() {
    digitalWriteFast(Pins::LDAC, LOW);
    delayMicroseconds(1);
    digitalWriteFast(Pins::LDAC, HIGH);
  }

  // Alle ADC-kaarten samplen tegelijk. LET OP: verifieer de CONVST-polariteit
  // van de AD7606 bij bring-up tegen de datasheet / Nick's teensy-eurorack
  // (conversie start op de CONVST-flank; hier: hoog->laag->hoog).
  void convstStrobe() {
    digitalWriteFast(Pins::CONVST, LOW);
    delayMicroseconds(1);
    digitalWriteFast(Pins::CONVST, HIGH);
  }

  // Busbrede reset-puls voor de AD7606-kaarten (na power-up). RESET is
  // actief-hoog op de AD7606; de kaart heeft een 100k pulldown.
  void adcResetPulse() {
    digitalWriteFast(Pins::ADC_RESET, HIGH);
    delayMicroseconds(1);
    digitalWriteFast(Pins::ADC_RESET, LOW);
  }
};

}  // namespace mb
