// Stub for the Teensy 4.1 port of Mutable Instruments Elements.
//
// The upstream `elements/drivers/debug_pin.h` toggles a physical GPIO for
// oscilloscope timing measurements on the original STM32F4 hardware. That
// hardware driver is not vendored; this stub provides no-op TIC/TOC macros so
// the DSP sources compile unchanged.
#ifndef ELEMENTS_DRIVERS_DEBUG_PIN_H_
#define ELEMENTS_DRIVERS_DEBUG_PIN_H_

#define TIC
#define TOC

#endif  // ELEMENTS_DRIVERS_DEBUG_PIN_H_
