// GATE8 — 8 gate/trigger-uitgangen via 74HCT595 (write-only).
// Zie Images/schematics/musicbrain-gate8/. SPI-mode 0; de stijgende CS-flank
// (RCLK) klikt alle 8 bits glitch-vrij en gelijktijdig naar de uitgangen.
#pragma once
#include "MbBus.h"

namespace mb {

class Gate8 {
 public:
  void begin(uint8_t csPin) {
    cs_ = csPin;
    pinMode(cs_, OUTPUT);
    digitalWriteFast(cs_, HIGH);
  }

  // bit0 = GATE1 (QA) … bit7 = GATE8 (QH). 74595 schuift MSB-first binnen,
  // dus met MSBFIRST belandt bit0 op QA en bit7 op QH — precies goed.
  void write(uint8_t gates) {
    SPI.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE0));
    digitalWriteFast(cs_, LOW);
    SPI.transfer(gates);
    digitalWriteFast(cs_, HIGH);   // RCLK stijgende flank = latch
    SPI.endTransaction();
  }

 private:
  uint8_t cs_ = 0xFF;
};

}  // namespace mb
