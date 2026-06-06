// hal/mcu.h — Platform-specific definitions for RP2040 (Raspberry Pi Pico W)
//
// This header abstracts hardware differences between ESP32 and RP2040.
// Include this in all platform-dependent code.

#pragma once

#if defined(ARDUINO_ARCH_RP2040)

#include <Arduino.h>

// ─── Heap info ─────────────────────────────────────────────────────────────
// RP2040 doesn't have ESP.getFreeHeap(), but we can use rp2040.getFreeHeap().
#define MB_FREE_HEAP() rp2040.getFreeHeap()

// ─── Chip info ─────────────────────────────────────────────────────────────
#define MB_CHIP_MODEL "RP2040"
#define MB_CHIP_REVISION "1.0"

// ─── File system ───────────────────────────────────────────────────────────
// LittleFS is available via the arduino-pico core.
// The Pico W has 2MB external flash, we reserve ~1MB for LittleFS.
#define MB_FS_SIZE (1 * 1024 * 1024)
#define MB_FS_START (1 * 1024 * 1024)

// ─── WiFi ──────────────────────────────────────────────────────────────────
// Pico W uses CYW43439 chip via SPI. WiFi is available but slower than ESP32.
// The WiFi library is included in the arduino-pico core.

// ─── mDNS ──────────────────────────────────────────────────────────────────
// LEAmDNS is available for RP2040 via PlatformIO lib_deps.

// ─── USB ───────────────────────────────────────────────────────────────────
// RP2040 has native USB device support. USB MIDI is available via MIDIUSB library.
// The Pico will appear as a USB MIDI device when connected to a PC.

// ─── GPIO ──────────────────────────────────────────────────────────────────
// Default pin assignments for Pico W (can be overridden in platformio.ini)
#ifndef MB_SPI_SCK
  #define MB_SPI_SCK 18  // GP18 = SPI0 SCK
#endif
#ifndef MB_SPI_MOSI
  #define MB_SPI_MOSI 19  // GP19 = SPI0 MOSI
#endif
#ifndef MB_SPI_LATCH
  #define MB_SPI_LATCH 17  // GP17 = any GPIO for latch
#endif

#ifndef MB_MIDI_RX
  #define MB_MIDI_RX 1  // GP1 = UART0 RX (default MIDI IN)
#endif
#ifndef MB_MIDI_TX
  #define MB_MIDI_TX 0  // GP0 = UART0 TX (default MIDI OUT)
#endif

#endif // ARDUINO_ARCH_RP2040
