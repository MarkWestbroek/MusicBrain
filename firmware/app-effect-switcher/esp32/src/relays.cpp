// relays.cpp — 74HC595 implementation. See relays.h for the design notes.

#include "relays.h"

#include <Arduino.h>
#include <SPI.h>

namespace mb {

// ─── Wiring (edit if your board is different) ──────────────────────────────
// SPI hardware pins on the classic ESP32 DevKitC (VSPI):
//   SCK  = GPIO 18   ── 74HC595 SRCLK
//   MOSI = GPIO 23   ── 74HC595 SER
//   LATCH (any GPIO) = GPIO  5  ── 74HC595 RCLK
// Optional output-enable (active-low) tied to GND if you don't need blanking.
static constexpr uint8_t kLatchPin = 5;

void Relays::begin() {
  pinMode(kLatchPin, OUTPUT);
  digitalWrite(kLatchPin, LOW);
  SPI.begin();                       // uses default VSPI pins on ESP32 classic
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
