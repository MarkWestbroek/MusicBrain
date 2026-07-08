// GATEIN8 — 8 gate/trigger-ingangen via 74HC165 (read-only) + 74LVC1G125.
// Zie Images/schematics/musicbrain-gatein8/. De CS-neerflank maakt via een
// RC (220p/10k) een korte ~PL-latchpuls; daarna klokken we 8 bits. De
// bitvolgorde op de draad is routinggedreven en wordt hier ontward naar
// IN1..IN8 (README-tabel: Q7-first = IN6 IN5 IN4 IN3 IN1 IN2 IN7 IN8).
#pragma once
#include "MbBus.h"

namespace mb {

class GateIn8 {
 public:
  void begin(uint8_t csPin) {
    cs_ = csPin;
    pinMode(cs_, OUTPUT);
    digitalWriteFast(cs_, HIGH);
  }

  // Retourneert bit0 = IN1 … bit7 = IN8 (1 = hoog/gepatcht).
  uint8_t read() {
    // out-bit k (=IN(k+1)) komt van raw-bit kSrc[k]. raw-bit7 = Q7 = eerste
    // bit op de draad = IN6, enz.
    static const uint8_t kSrc[8] = {3, 2, 4, 5, 6, 7, 1, 0};

    digitalWriteFast(cs_, LOW);
    delayMicroseconds(5);          // wacht op de ~PL-latchpuls (spec: >=5 us)
    SPI.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE0));
    uint8_t raw = SPI.transfer(0); // MSB-first: bit7 = Q7 (eerste bit uit)
    SPI.endTransaction();
    digitalWriteFast(cs_, HIGH);

    uint8_t out = 0;
    for (uint8_t k = 0; k < 8; k++)
      if (raw & (1u << kSrc[k])) out |= (1u << k);
    return out;
  }

 private:
  uint8_t cs_ = 0xFF;
};

}  // namespace mb
