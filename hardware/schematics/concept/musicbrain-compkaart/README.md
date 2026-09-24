# musicbrain-compkaart — hybride compressor (concept 0.1c)

**Status: concept.** Schema (ERC 0), geen PCB. Plan:
[`doc/plans/analoge-fx-verkenning.md`](../../../../doc/plans/analoge-fx-verkenning.md) §4, route C.
Digitale tegenhangers: `tp_mmb_{bus,fet,opto,diode}_comp` (`mmb_dsp/*_comp.h`).
Generator: `hardware/kicad-generators/gen_compkaart.py`.

## Idee

Analoog gain-element, digitale detector — en die detector is **dezelfde
`mmb_dsp`-kernel** als in de sim en op de Teensy, maar draait op een
**sub-brain** op de kaart, zodat de lus ADC → rekenen → DAC in microseconden
blijft (nodig voor FET/SSL-attacks). De Brain praat alleen parameters en
status over **CS2 (= IRQ-lijn, B2/B4)**.

```
J2 IN → buffer → [gain-element, dochter J5] → I/V → buffer → J2 UIT
                 ↑ CV (DAC)          ADC ← detector-conditionering ← buffer
              SUB-BRAIN-module (J4): mmb_dsp-detector, 4 pots, GR-meter
```

- **J4 SUB-BRAIN** (2×10 socket): MCU met FPU — **RP2350** (PIO-SPI-slave,
  bus-compatibel met VCF8/VCO8) of **STM32G431** (ADC/DAC aan boord). Keuze
  open; daarom een module-header met benoemde signalen en geen chip-pinout.
  Signalen: SCK/MOSI/MISO/CS2, DAC_CV, DAC_GR, ADC_AUDIO, ADC_P1..P4,
  GPIO_LED, UART (fallback B2), SWD, NRST.
- **Detector-conditionering**: ±5 V → 1,65 − 0,3·Vin (inverterend 10k/33k,
  IN+ op 1,27 V) → 1k + 1n → ADC. 12 bit op 44,1 kHz volstaat voor niveau.
- **Gain-element op J5** (1×8: GND +12 −12 AUD_IN AUD_OUT CV SPARE GND).
  AUD_IN krijgt het gebufferde signaal via 20k (stroomingang voor een VCA);
  AUD_OUT gaat als stroom in de I/V-opamp (20k ∥ 100p). CV = 0..3V3 uit de
  module met RC-slew; de dochter schaalt naar wat het element wil.
  - **A — VCA (getekend, U4)**: THAT2181, CV → 10k/1k → Ec− 0..0,3 V.
  - **B — FET**: 2N5457 als regelbare weerstand in een deler + lokale
    feedback-trim; CV via opamp naar de pinch-off (kalibratietabel in de module).
  - **C — opto**: LED + NSL-32 (of Vactrol); CV via V→I naar de LED.
  - Diodebrug: zelfde socket, zie plan §2.
- **MISO tri-state** via 74LVC1G125 (OE = CS2), als gatein8.
- **Front**: J2 audio (1 GND, 2 IN, 3 UIT, **4 GR-CV uit** = de `gr`-poort,
  10 GND); J3 vier potmeters (wipers 0..3V3 → module-ADC: threshold,
  ratio/peak, attack, release) — touch, gemeld aan de Brain (B9).
- CS en LDAC ongebruikt in deze rev (B2-snelpad is een optie voor later).

## Onderdelen (ruw)

2× TL074, 74LVC1G125, sockets, passieven ≈ €12; + module (RP2350 ~€5 als
Pico-2-achtig bordje, STM32G431-core ~€6); dochter A ≈ €10 (THAT2181).

## Open punten / te verifiëren

- **MCU-keuze**: één breadboard-avond (SPI-slave op CS2 vs. ADC/DAC aan
  boord) — zie plan §5.
- THAT2181-pinout tegen de datasheet; SYM-trim.
- ADC-ingang: 12-bit resolutie geeft ~−72 dB vloer in de detector — voor de
  opto/vari-mu-stijl ruim; voor "knie op −40 dB" checken.
- Bus-protocol op CS2: register-map (parameters in, GR/knopstanden uit) —
  spiegel van de control-ids van de digitale modules.
- Stereo: twee kaarten koppelen (detector-link) of één kaart met twee
  elementen — v2.

## Bestanden

`musicbrain-compkaart.kicad_sch` / `.kicad_pro`, `erc.rpt` (0), `musicbrain-compkaart.pdf`,
`compkaart-preview.png`.
