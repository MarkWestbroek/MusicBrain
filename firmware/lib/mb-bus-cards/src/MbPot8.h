// POT8 — 8 potmeters via MCP3208 (12-bit SAR, SPI).
// Zie hardware/schematics/musicbrain-pot8/. Ratiometrisch: VREF = VDD = +3V3,
// dus de uitlezing is direct de deler-stand 0..4095. Mode 0, <=2 MHz.
#pragma once
#include "MbBus.h"

namespace mb {

class Pot8 {
 public:
  void begin(uint8_t csPin) {
    cs_ = csPin;
    pinMode(cs_, OUTPUT);
    digitalWriteFast(cs_, HIGH);
  }

  // 12-bit waarde (0..4095) van kanaal ch (0..7). POT1 = kanaal 0.
  uint16_t read(uint8_t ch) {
    // MCP3208 single-ended: startbit + SGL/~DIFF=1 + D2 in byte 0; D1 D0 in
    // de topbits van byte 1; 12 bits terug in (r1[3:0], r2).
    const uint8_t b0 = 0x06 | ((ch & 0x04) >> 2);
    const uint8_t b1 = (uint8_t)((ch & 0x03) << 6);

    SPI.beginTransaction(SPISettings(1600000, MSBFIRST, SPI_MODE0));
    digitalWriteFast(cs_, LOW);
    SPI.transfer(b0);
    const uint8_t r1 = SPI.transfer(b1);
    const uint8_t r2 = SPI.transfer(0);
    digitalWriteFast(cs_, HIGH);
    SPI.endTransaction();

    return (uint16_t)(((r1 & 0x0F) << 8) | r2);
  }

  // Alle acht kanalen achter elkaar in dst[0..7].
  void readAll(uint16_t* dst) {
    for (uint8_t ch = 0; ch < 8; ch++) dst[ch] = read(ch);
  }

 private:
  uint8_t cs_ = 0xFF;
};

}  // namespace mb
