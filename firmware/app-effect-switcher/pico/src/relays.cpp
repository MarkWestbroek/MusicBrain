// relays.cpp — 74HC595 implementation for RP2040 (Pico W).
// See relays.h for the design notes.

#include "relays.h"
#include "hal/mcu.h"

#include <Arduino.h>
#include <SPI.h>

namespace mb {

// ─── Wiring (edit if your board is different) ──────────────────────────────
// SPI hardware pins on the Raspberry Pi Pico W (SPI0):
//   SCK  = GP18  ── 74HC595 SRCLK
//   MOSI = GP19  ── 74HC595 SER
//   LATCH (any GPIO) = GP17  ── 74HC595 RCLK
// Optional output-enable (active-low) tied to GND if you don't need blanking.
static constexpr uint8_t kLatchPin = MB_SPI_LATCH;

void Relays::begin() {
  pinMode(kLatchPin, OUTPUT);
  digitalWrite(kLatchPin, LOW);
  
  // RP2040 SPI: set pins before begin()
  SPI.setSCK(MB_SPI_SCK);
  SPI.setTX(MB_SPI_MOSI);
  SPI.begin();
  
  SPI.beginTransaction(SPISettings(2'000'000, MSBFIRST, SPI_MODE0));
  // Shift in zeroes so all relays start off.
  setMask(0, 16);
}

void Relays::setMask(uint32_t mask, uint8_t count) {
  mask_ = mask;
  // We push out in chunks of 8 bits, MOST-significant chip first. With two
  // chained 595s the chip closest to the MCU sees the *last* byte we shift,
  // which then corresponds to relays 1..8.
  const uint8_t bytes = (count + 7) / 8;
  for (int8_t b = bytes - 1; b >= 0; --b) {
    SPI.transfer(static_cast<uint8_t>((mask >> (b * 8)) & 0xFF));
  }
  // Pulse LATCH to copy the shift register into the storage register.
  digitalWrite(kLatchPin, HIGH);
  delayMicroseconds(1);
  digitalWrite(kLatchPin, LOW);
}

}  // namespace mb
