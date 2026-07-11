# MusicBrain ENC4 — 4× encoder (slotkaart)

**Status**: schema ERC-schoon + netlist geverifieerd; PCB volledig geroute
(DRC 0 fouten, 0 unconnected). **Spec**: `doc/spi-bus-spec.md`.
Bord: 70 mm breed × **80 mm hoog** (H-standaard), 2 lagen.

## Wat het is

4 draai-encoders met drukknop voor de firmware-UI, uitgelezen door een
**MCP23017** (16-bit I2C-GPIO-expander, adres 0x20). De kaart gebruikt
alleen de +3V3- en I2C-buslijnen plus de geografische IRQ.

- **Bourns PEC12R** (12 mm, 24 detents, met schakelaar), **haakse
  uitvoering**: de encoder ligt op het kaartvlak met de as langs het bord
  omhoog door de **bovenplaat** (steek 16,7 mm — begrensd door de brede
  beugels van de haakse behuizing).
- Per encoder: A/B-fase + schakelaar (S); common en S2 aan GND.
- **Ontdenderen**: interne pull-ups van de MCP23017 (GPPU aanzetten) +
  firmware-debounce; INTA/INTB in mirror-mode → **IRQ** (slotpin 16),
  dus de Teensy pollt niets.

## Pintoewijzing

GPA0–7 = E1B, E1S, E1A, E2B, E2S, E2A, E3B, E3S;
GPB0–3 = E4A, E4S, E4B, E3A (routinggedreven; firmware-tabel).
~RESET vast aan +3V3; A0–A2 aan GND (adres 0x20).

## Aansluitingen

- **J1** (haakse male 2×10, onderrand): alleen +3V3, SDA, SCL, IRQ en
  GND in gebruik — geen SPI, geen ±12V.
- Geen J2: de encoders zíjn het paneelcontact (assen + moeren dragen de
  kaart aan de bovenplaat, zoals de pots op POT8).

## PCB-notities

De twaalf encodersignalen dalen als B.Cu-verticalen af (A-fase met een
kleine F-jog om het schakelaarpad heen) naar elf B-lanes (y 115,3–123,3,
strikt genest per de kruisingsregels) en stijgen bij hun GPIO-kolom weer
op; de vier GPB-signalen gaan oostom via B-runs (y 144,5–146,9) naar de
zuidrij. I2C loopt via F-banden (y 152,5/153,3) zuidelijk om de expander
heen; IRQ heeft één B-hop over de RESET-verticaal en duikt onder de
J1-padrij door (B.Cu) het THT-pad in. De +3V3 loopt via een B-band
(y 158,5) naar een westverticaal en een noordrun op y 114,6 — precies
tussen de encoderbeugels en de via-rij door.
