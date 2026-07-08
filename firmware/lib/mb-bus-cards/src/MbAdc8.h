// ADC8 — 8 CV-ingangen via AD7606 (16-bit, 8-ch simultaan, serieel).
// Zie Images/schematics/musicbrain-adc8/. Geadapteerd van Nic Newdigate's
// input_output_spi.cpp: CONVST idle-hoog, puls laag->hoog start de conversie
// (op de stijgende flank); BUSY hoog tijdens ~4 us conversie; op BUSY-laag
// klok je 8x16 bit uit DOUTA. RANGE staat via JP1 op de kaart (geen firmware).
//
// Busbreed samplen: roep bus.convstStrobe() aan (alle ADC-kaarten tegelijk),
// wacht op de IRQ (BUSY-neerflank) van je slot, en lees.
#pragma once
#include "MbBus.h"

namespace mb {

class Adc8 {
 public:
  // busyPin = de IRQ-pin van het slot (BUSY van de AD7606).
  void begin(uint8_t csPin, uint8_t busyPin) {
    cs_ = csPin;
    busy_ = busyPin;
    pinMode(cs_, OUTPUT);
    digitalWriteFast(cs_, HIGH);
    pinMode(busy_, INPUT);
  }

  // Lees 8 kanalen (out[0..7]) als signed 16-bit (two's complement, ±full-scale
  // afhankelijk van de RANGE-jumper). Roep dit ná bus.convstStrobe() aan.
  // Retourneert false bij time-out (conversie duurde te lang / geen kaart).
  bool read(int16_t* out, uint32_t timeout_us = 20) {
    uint32_t t0 = micros();
    while (digitalReadFast(busy_)) {            // BUSY hoog tijdens conversie
      if (micros() - t0 > timeout_us) return false;
    }
    // TODO bring-up: verifieer de SPI-mode van de AD7606 tegen de datasheet.
    // Meest genoemde is MODE2 (CPOL=1, CPHA=0); pas aan als de data verschoven is.
    SPI.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE2));
    digitalWriteFast(cs_, LOW);
    for (uint8_t i = 0; i < 8; i++) out[i] = (int16_t)SPI.transfer16(0);
    digitalWriteFast(cs_, HIGH);
    SPI.endTransaction();
    return true;
  }

 private:
  uint8_t cs_ = 0xFF;
  uint8_t busy_ = 0xFF;
};

}  // namespace mb
