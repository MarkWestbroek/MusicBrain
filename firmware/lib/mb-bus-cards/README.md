# mb-bus-cards — host-drivers voor de SPI-bus-kaarten

Teensy 4.1-drivers voor de MusicBrain-slotkaarten uit **`doc/spi-bus-spec.md`**:
domme peripherals (schuifregisters, DAC's, ADC, I2C-expanders) op één gedeelde
SPI-bus met **geografische CS**. Header-only, `namespace mb`.

> **Status:** nog **niet op hardware getest** — dit is de bring-up-basis. De drie
> geïmplementeerde drivers volgen rechtstreeks uit de spec + kaart-README's; de
> IC-register-drivers (Dac8/Adc8/Enc4) staan hieronder als to-do, bewust nog niet
> uit het geheugen geschreven (zie de AD5754-pinout-les).

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

## Geïmplementeerd (verifieerbaar uit de spec)

| Header | Kaart | Kern |
|---|---|---|
| `MbBus.h` | — | pin-map, CS/IRQ-helpers, LDAC/CONVST/RESET-strobes |
| `MbGate8.h` | GATE8 | 74HCT595, `write(bits)`, bit0=GATE1, latch op CS↑ |
| `MbGateIn8.h` | GATEIN8 | 74HC165, `read()` → bit0=IN1; ~PL-wacht ≥5 µs; bit-ontwarring |
| `MbPot8.h` | POT8 | MCP3208, `read(ch)` 12-bit, ratiometrisch |

## Nog te doen (IC-register-drivers — adapteer Nick's bewezen code, niet uit geheugen)

De AD5754/AD7606-register-sequences **overnemen van Nic Newdigate's bewezen
firmware**, net zoals we de pinout daar verifieerden:

- **DAC8** (`MbDac8.h`) — 2× AD5754 in daisy-chain (MOSI→U1→U2→MISO, één CS,
  48-bit frames), update via `bus.ldacStrobe()`. Basis:
  `D:/Git/Muziek/Nick/teensy-eurorack/software/src/ad5754.h` en het voorbeeld
  `software/examples/ad5754/02_write_both_ad5754/` (registerdefs
  `AD5754R_REG_DAC`, `AD5754R_REG_POWER_CONTROL`, `AD5754R_RangeSelect`,
  `AD5754R_LoadDac` + de daisy-variant `AD5754R_SetRegisterValue2`).
  Setup: power-control (alle kanalen aan), output-range ±10V, offset binary.
  **Kanaal → DAC** (uit de kaart-README): CV1=U1·B, CV2=U1·A, CV3=U1·C,
  CV4=U1·D, CV5=U2·A, CV6=U2·B, CV7=U2·C, CV8=U2·D.
- **ADC8** (`MbAdc8.h`) — AD7606 serieel. `bus.convstStrobe()` → wacht op IRQ
  (BUSY↓) → 8×16 bit klokken via MISO. RANGE via JP1 op de kaart; verifieer de
  CONVST/RESET-polariteit tegen de datasheet. Basis: Nick's
  `teensy-eurorack-breakout` (AD7606-deel).
- **ENC4** (`MbEnc4.h`) — MCP23017 @ I2C-adres 0x20 (`Wire`). Zet GPPU-pull-ups
  aan, INTA/INTB-mirror → IRQ. Lees GPIOA+GPIOB, decodeer 4 encoders
  (quadratuur-toestandsmachine) + drukknoppen. **GPIO-map** (uit de README):
  GPA0–7 = E1B E1S E1A E2B E2S E2A E3B E3S; GPB0–3 = E4A E4S E4B E3A.

Wanneer die er zijn: de mapping-tabellen zitten al in de kaart-README's en
hierboven, dus de drivers hoeven alleen de register-/decode-logica toe te voegen.
