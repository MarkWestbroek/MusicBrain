# mb-bus-cards — host-drivers voor de SPI-bus-kaarten

Teensy 4.1-drivers voor de MusicBrain-slotkaarten uit **`doc/spi-bus-spec.md`**:
domme peripherals (schuifregisters, DAC's, ADC, I2C-expanders) op één gedeelde
SPI-bus met **geografische CS**. Header-only, `namespace mb`.

> **Status:** alle zes de kaart-drivers zijn er (compileert schoon met
> clang++ tegen Arduino-stubs), maar **nog niet op hardware getest** — dit is de
> bring-up-basis. De IC-register-drivers zijn geadapteerd van Nick's bewezen code,
> niet uit het geheugen (zie de AD5754-pinout-les).

## Verhouding tot `firmware/breakouts/`

Let op: dit is een **ander concept** dan `firmware/breakouts/`. Die map beschrijft
*slimme SPI-slave breakouts* met eigen MCU, een `(caseId, slotId)`-adres en een
frame-protocol (ADR 0004/0006/0008, multi-case, CAN-FD/RS-485-bridge) — nog niet
gebouwd. De kaarten van deze sessie zijn juist *dom*: geen MCU, direct op de
Teensy-SPI. Beide kunnen naast elkaar bestaan, maar het zijn verschillende
transport-modellen. **Als de smart-breakout-route de bedoeling is, heroverweeg
dan of deze kaarten daar een tussenstap of een alternatief van zijn.**

## Gebruik

```cpp
#include <MbBus.h>
#include <MbGate8.h>
#include <MbPot8.h>
using namespace mb;

Bus bus;
Gate8 gates;   // in slot 1
Pot8  pots;    // in slot 2

void setup() {
  bus.begin();
  gates.begin(slotCs(1));
  pots.begin(slotCs(2));
}

void loop() {
  gates.write(0b00000101);          // GATE1 + GATE3 hoog
  uint16_t p0 = pots.read(0);       // 0..4095
}
```

Voor DAC-kaarten: schrijf alle kanalen weg en roep dan **`bus.ldacStrobe()`** aan
voor een sample-synchrone update over álle DAC-kaarten tegelijk. Voor ADC-kaarten:
`bus.convstStrobe()` (busbreed samplen), wacht op de IRQ (`slotIrq(n)`), lees uit.

## Alle zes de drivers (compileert schoon, nog niet op hardware getest)

| Header | Kaart | Kern |
|---|---|---|
| `MbBus.h` | — | pin-map, CS/IRQ-helpers, LDAC/CONVST/RESET-strobes |
| `MbGate8.h` | GATE8 | 74HCT595, `write(bits)`, bit0=GATE1, latch op CS↑ |
| `MbGateIn8.h` | GATEIN8 | 74HC165, `read()` → bit0=IN1; ~PL-wacht ≥5 µs; bit-ontwarring |
| `MbPot8.h` | POT8 | MCP3208, `read(ch)` 12-bit, ratiometrisch |
| `MbDac8.h` | DAC8 | 2× AD5754 daisy, `set8(codes)`/`set(cv,code)` + `bus.ldacStrobe()` |
| `MbAdc8.h` | ADC8 | AD7606, `read(out)` na `bus.convstStrobe()`, signed 16-bit |
| `MbEnc4.h` | ENC4 | MCP23017 @0x20, `poll()` → `position()`/`pressed()` |

`MbDac8`/`MbAdc8` zijn geadapteerd van **Nic Newdigate's bewezen firmware**
(`teensy-eurorack/software/src/ad5754.h` + `input_output_spi.cpp`), niet uit het
geheugen. `MbEnc4` gebruikt de standaard MCP23017-registers (BANK=0).

### Bring-up-aandachtspunten (vóór je op hardware vertrouwt)

- **DAC8**: coding = offset binary (BIN→DVCC op de kaart): `0x8000` = 0 V bij
  ±10V. `set8()` schrijft 4 daisy-frames; daarna `bus.ldacStrobe()` voor de
  gelijktijdige update. SDO blijft aan (nodig voor de daisy). Kanaal→DAC-map zit
  in `MbDac8::map()`.
- **ADC8**: de **SPI-mode staat als MODE2 met een TODO** — verifieer tegen de
  AD7606-datasheet en corrigeer als de uitlezing verschoven is. Data is two's
  complement; het bereik hangt van de RANGE-jumper (JP1) af.
- **ENC4**: `position()` is in **kwart-stappen**; deel door 4 voor detents
  (PEC12R = 4/detent). `poll()` periodiek of op de IRQ aanroepen.
