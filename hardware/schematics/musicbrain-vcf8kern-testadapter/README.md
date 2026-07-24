# musicbrain-vcf8kern-testadapter (rev 0.1)

Passief kaartje om een losse **musicbrain-vcf8kern** direct op de hoofd-SPI-bus
te bench-testen, **zonder** de VCF8-backbone/RP2040. 68×58.

**Status: in ontwerp** — ERC 0, netcheck OK, 0 courtyard-overlappen. Routing is
triviaal (draadbruggen) en volgt met de kern-routingsessie.

## Wat het doet

`J1` (bus 2×12, gen-2-slotpinout) → `J2` (kernslot-socket 2×12, contract v1.1),
met de mapping die de backbone normaal maakt:

| Bus | → kernslot | reden |
|---|---|---|
| MOSI | SDIN **+** SDIN2 | AD5754-daisy én DAC128S085 delen de MOSI-lijn |
| SCLK | SCLK **+** SCLK2 | idem voor de klok |
| CS | CS (SYNC) | AD5754-latch |
| LDAC | LDAC | sample-synchrone update |
| IRQ | CS2 | poly-spec B4: CS2 via de IRQ-lijn |
| MISO | ← SDO | AD5754-daisy readback |

- **MODE0..2, TSEL0..2, TEN** = 1×3-jumpers (**+3V3 / signaal / GND**): kies met
  de hand de filtermode en de tune-stem, en zet TEN hoog om de tune-uitgang aan
  te zetten.
- **FMCV** = 1×3-jumper naar GND (shunt = geen FM; los = zelf injecteren).
- **TOUT** = open-drain → **4k7-pullup naar +3V3** (de backbone doet dat
  normaal) + **testpad** (scope de tune-comparator). **SDO2** = testpad (de
  tweede daisy-readback).
- Bus-audio/I2C/I2S-pinnen blijven onaangesloten (de kern gebruikt ze niet).

## Gebruik

1. Bus-ribbon (2×12) van een busslot → `J1`.
2. vcf8kern-kaart met de kernslot-header → `J2`.
3. Jumpers zetten (mode/tune/TEN), FMCV shunten.
4. Teensy drijft SPI + IRQ(=CS2); scope op TOUT/SDO2 voor de tune- en
   readback-checks.
