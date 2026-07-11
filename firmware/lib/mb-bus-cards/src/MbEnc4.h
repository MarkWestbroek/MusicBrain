// ENC4 — 4 draai-encoders + drukknoppen via MCP23017 (I2C).
// Zie hardware/schematics/musicbrain-enc4/. Adres 0x20. Interne pull-ups (GPPU)
// aan, INTA/INTB gespiegeld -> IRQ. Standaard MCP23017-registers (BANK=0).
//
// GPIO-map (kaart-README): GPA0-7 = E1B E1S E1A E2B E2S E2A E3B E3S;
//                          GPB0-3 = E4A E4S E4B E3A.
// Quadratuur: PEC12R geeft 4 kwart-stappen per detent -> position()/4 = detents.
#pragma once
#include "MbBus.h"

namespace mb {

class Enc4 {
 public:
  // MCP23017-registers (BANK=0).
  enum : uint8_t { IODIRA = 0x00, IODIRB = 0x01, GPINTENA = 0x04, GPINTENB = 0x05,
                   IOCON = 0x0A, GPPUA = 0x0C, GPPUB = 0x0D, GPIOA = 0x12 };

  void begin(uint8_t addr = 0x20) {
    addr_ = addr;
    wr(IODIRA, 0xFF); wr(IODIRB, 0xFF);   // alle pinnen input
    wr(GPPUA, 0xFF);  wr(GPPUB, 0xFF);    // interne pull-ups aan
    wr(IOCON, 0x40);                      // MIRROR (INTA=INTB) -> één IRQ
    wr(GPINTENA, 0xFF); wr(GPINTENB, 0xFF); // interrupt-on-change (voor de IRQ)
    uint16_t raw = readGpio();
    for (uint8_t e = 0; e < 4; e++) lastAB_[e] = ab(raw, e);
  }

  // Roep periodiek (of op de IRQ) aan: werkt de 4 posities + knopstatus bij.
  void poll() {
    static const int8_t kStep[16] = {0, -1, 1, 0, 1, 0, 0, -1,
                                     -1, 0, 0, 1, 0, 1, -1, 0};
    uint16_t raw = readGpio();
    for (uint8_t e = 0; e < 4; e++) {
      uint8_t cur = ab(raw, e);
      pos_[e] += kStep[(lastAB_[e] << 2) | cur];
      lastAB_[e] = cur;
    }
    // Drukknoppen actief-laag (pull-up): ingedrukt = bit 0.
    static const uint8_t kSw[4] = {1, 4, 7, 9};   // E1S..E4S bitposities
    btn_ = 0;
    for (uint8_t e = 0; e < 4; e++)
      if (!((raw >> kSw[e]) & 1)) btn_ |= (1u << e);
  }

  // Positie in kwart-stappen (deel door 4 voor detents). enc = 0..3.
  int32_t position(uint8_t enc) const { return pos_[enc]; }
  // True zolang de knop van encoder enc (0..3) ingedrukt is.
  bool pressed(uint8_t enc) const { return (btn_ >> enc) & 1; }

 private:
  // A/B-bits per encoder uit het gecombineerde woord (GPB<<8 | GPA).
  static uint8_t ab(uint16_t raw, uint8_t e) {
    static const uint8_t kA[4] = {2, 5, 11, 8};   // E1A E2A E3A E4A
    static const uint8_t kB[4] = {0, 3, 6, 10};   // E1B E2B E3B E4B
    uint8_t a = (raw >> kA[e]) & 1;
    uint8_t b = (raw >> kB[e]) & 1;
    return (uint8_t)((a << 1) | b);
  }

  void wr(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(addr_);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
  }

  uint16_t readGpio() {
    Wire.beginTransmission(addr_);
    Wire.write(GPIOA);                    // auto-increment -> GPIOA dan GPIOB
    Wire.endTransmission(false);
    Wire.requestFrom((int)addr_, 2);
    uint8_t a = Wire.read();
    uint8_t b = Wire.read();
    return (uint16_t)((b << 8) | a);
  }

  uint8_t addr_ = 0x20;
  int32_t pos_[4] = {0, 0, 0, 0};
  uint8_t lastAB_[4] = {0, 0, 0, 0};
  uint8_t btn_ = 0;
};

}  // namespace mb
