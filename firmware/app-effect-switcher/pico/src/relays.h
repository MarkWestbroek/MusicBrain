// relays.h — bare-bones relay-board driver.
//
// Hardware assumption (default): two 74HC595 shift registers daisy-chained on
// the hardware SPI bus, producing 16 relay outputs. Bit i of `mask` maps to
// relay R{i+1} in the editor UI.
//
// If you wire a different relay board (e.g. direct GPIO, ULN2803, I2C MCP23017)
// just rewrite this file. The rest of the firmware only touches `Relays::setMask`
// and `Relays::begin`.

#pragma once
#include <stdint.h>

namespace mb {

class Relays {
 public:
  /// Initialise SPI and the latch pin. Safe to call once from setup().
  void begin();

  /// Drive all relays from a 32-bit bitmask. Only the low `count` bits are used.
  void setMask(uint32_t mask, uint8_t count);

  /// Currently driven bitmask (after the last `setMask` call).
  uint32_t mask() const { return mask_; }

 private:
  uint32_t mask_ = 0;
};

}  // namespace mb
