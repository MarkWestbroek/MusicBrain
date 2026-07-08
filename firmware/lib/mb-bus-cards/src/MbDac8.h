// DAC8 — 8 CV-uitgangen via 2x AD5754 in daisy-chain + ADR421-referentie.
// Zie Images/schematics/musicbrain-dac8/. Geadapteerd van Nic Newdigate's
// bewezen ad5754.h (register-map + 24-bit woordopbouw) en zijn daisy-voorbeeld
// (02_write_both_ad5754): MOSI->U1->U2->MISO, één CS (= ~SYNC), 48-bit frames.
//
// Coding: BIN/2sCOMP is op de kaart hard naar DVCC (offset binary). Bij ±10V:
// 0x8000 = 0 V, 0xFFFF ~ +FS, 0x0000 ~ -FS. AD5754BREZ heeft GEEN interne
// referentie -> ADR421 (2,5 V) op REFIN. SPI-mode 1 (data op dalende SCLK).
#pragma once
#include "MbBus.h"

namespace mb {

class Dac8 {
 public:
  // Register-adressen (Nick's ad5754.h = datasheet Tabel 18).
  enum : uint8_t { REG_DAC = 0x00, REG_RANGE = 0x01, REG_POWER = 0x02, REG_CONTROL = 0x03 };
  enum : uint8_t { CH_A = 0, CH_B = 1, CH_C = 2, CH_D = 3, CH_ALL = 4 };
  enum : uint8_t { RANGE_UNI5 = 0, RANGE_UNI10 = 1, RANGE_UNI108 = 2,
                   RANGE_BIP5 = 3, RANGE_BIP10 = 4, RANGE_BIP108 = 5 };

  void begin(uint8_t csPin, uint8_t range = RANGE_BIP10) {
    cs_ = csPin;
    pinMode(cs_, OUTPUT);
    digitalWriteFast(cs_, HIGH);
    // Beide chips identiek configureren via 48-bit frames (zelfde cmd links+rechts).
    frame(REG_POWER, 0x00, 0x000F, REG_POWER, 0x00, 0x000F);   // alle 4 kanalen aan
    delayMicroseconds(15);                                     // >=10 us power-up
    frame(REG_RANGE, CH_ALL, range, REG_RANGE, CH_ALL, range); // bereik per chip
  }

  // Zet één CV-kanaal (1..8) in het input-register. Update pas op de bus-LDAC:
  // schrijf alles, roep dan bus.ldacStrobe() aan (sample-synchroon).
  void set(uint8_t cv, uint16_t code) {
    uint8_t chip, ch;
    map(cv, chip, ch);
    if (chip == 0) frame(REG_DAC, ch, code, REG_CONTROL, 0x00, 0x0000);   // U1, U2=NOP
    else           frame(REG_CONTROL, 0x00, 0x0000, REG_DAC, ch, code);   // U2, U1=NOP
  }

  // Schrijf alle 8 kanalen (codes[0]=CV1 .. codes[7]=CV8) in 4 frames; daarna
  // in de aanroeper één bus.ldacStrobe() voor een gelijktijdige update.
  void set8(const uint16_t* codes) {
    // Per DAC-kanaal (A..D) één frame dat dat kanaal op BEIDE chips schrijft.
    frame(REG_DAC, CH_A, codes[1], REG_DAC, CH_A, codes[4]);  // U1.A=CV2, U2.A=CV5
    frame(REG_DAC, CH_B, codes[0], REG_DAC, CH_B, codes[5]);  // U1.B=CV1, U2.B=CV6
    frame(REG_DAC, CH_C, codes[2], REG_DAC, CH_C, codes[6]);  // U1.C=CV3, U2.C=CV7
    frame(REG_DAC, CH_D, codes[3], REG_DAC, CH_D, codes[7]);  // U1.D=CV4, U2.D=CV8
  }

 private:
  // CV 1..8 -> (chip 0=U1/1=U2, DAC-kanaal). Uit de kaart-README.
  static void map(uint8_t cv, uint8_t& chip, uint8_t& ch) {
    static const uint8_t kChip[8] = {0, 0, 0, 0, 1, 1, 1, 1};
    static const uint8_t kCh[8]   = {CH_B, CH_A, CH_C, CH_D, CH_A, CH_B, CH_C, CH_D};
    uint8_t i = (cv - 1) & 7;
    chip = kChip[i];
    ch = kCh[i];
  }

  // 48-bit daisy-frame. Woord voor U1 (dichtbij MOSI) wordt LAATST geklokt,
  // woord voor U2 (diepst) EERST — zo landt elk woord in de juiste chip.
  void frame(uint8_t r1, uint8_t a1, uint16_t v1,
             uint8_t r2, uint8_t a2, uint16_t v2) {
    uint8_t w2c = (uint8_t)((r2 << 3) | a2);   // U2 controle-byte (R/W=0 = write)
    uint8_t w1c = (uint8_t)((r1 << 3) | a1);   // U1 controle-byte
    SPI.beginTransaction(SPISettings(8000000, MSBFIRST, SPI_MODE1));
    digitalWriteFast(cs_, LOW);                // ~SYNC laag
    SPI.transfer(w2c); SPI.transfer(v2 >> 8); SPI.transfer(v2 & 0xFF);  // U2 eerst (diep)
    SPI.transfer(w1c); SPI.transfer(v1 >> 8); SPI.transfer(v1 & 0xFF);  // U1 laatst
    digitalWriteFast(cs_, HIGH);               // ~SYNC omhoog = latch naar input-regs
    SPI.endTransaction();
  }

  uint8_t cs_ = 0xFF;
};

}  // namespace mb
