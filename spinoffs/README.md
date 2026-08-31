# MusicBrain — spinoff-plannen

Vijf subprojecten, elk met een eigen `PLAN.md`. Ontstaan uit één
ontwerpgesprek; hier uitgesplitst zodat elk project zelfstandig
opgepakt kan worden binnen de MusicBrain-repo.

Elk plan is geschreven om **zonder de oorspronkelijke chat leesbaar te
zijn**. Aannames, berekeningen en open vragen staan er expliciet in.

| Map | Onderwerp | Status |
|---|---|---|
| `vocoder/` | Kanaalvocoder als MusicBrain-kaart, FPGA vs Teensy | concept |
| `freestyle-machine/` | Compacte draagbare rap-begeleidingsautomaat | concept |
| `drum-808/` | Analoge drumkaart, 808-lijn, generiek | concept |
| `drum-cr78/` | CR-78 stemmen als kaart(en) | concept, wacht op schematic-overtrek |
| `trackpad/` | Muzikaal trackpad als custom part | concept |

## Voorstel voor plaatsing in de repo

De bestaande conventie op het busboard is `doc/<naam>-plan.md`. Deze
plannen zijn groter dan één bestand aankan, dus:

```
doc/
  spinoffs/
    vocoder/PLAN.md
    freestyle-machine/PLAN.md
    drum-808/PLAN.md
    drum-cr78/PLAN.md
    trackpad/PLAN.md
```

Alternatief, als je ze als echte subprojecten met eigen hardware wilt:
elk als map naast `firmware/` en `breakouts/`, met `PLAN.md`,
`hw/` en `fw/` erin.

## Gedeelde aannames

Alle plannen gaan uit van **busboard v3.1** zoals gedocumenteerd op
`musicbrain.nl/components/busboard`. De relevante slot-pinout (J1–J6,
2×12):

```
 1 GND      2 +12V     3 GND      4 -12V
 5 GND      6 +3V3     7 SCLK     8 GND
 9 MOSI    10 GND     11 MISO    12 GND
13 CSn     14 GND     15 LDAC    16 IRQn
17 SDA     18 SCL     19 CONVST  20 GND (guard)
21 MCLK    22 BCLK    23 LRCLK   24 I2SDn
```

Vier eigenschappen die in meerdere plannen terugkomen:

1. **±12V staat op elk slot.** Analoge kaarten hebben geen lokale
   boost of inverter nodig.
2. **Geen +5V op de slots**, alleen +3V3, en die komt via een AMS1117
   achter een R-78E5.0-1.0 (1 A) die ook USB-host-VBUS voedt. Analoge
   hulpspanningen lokaal uit ±12V halen.
3. **LDAC en CONVST zijn broadcast-lijnen** — dezelfde netnaam op elk
   slot, geen slotsuffix. Dat is een systeembrede sync-strobe, en de
   sleutel tot sample-accurate timing over kaarten heen.
4. **Er is geen analoog audiopad tussen slots.** Alleen I2SDn per slot
   plus gedeelde klokken. Een analoge kaart die zijn geluid naar de
   master wil sturen, moet aan boord digitaliseren — of het busboard
   moet gereviseerd.

Punt 4 is de belangrijkste openstaande architectuurvraag en raakt zowel
`drum-808/` als `drum-cr78/` als `vocoder/`.

## dCV over SPI

De bus draagt digitale CV op **1 kHz**, met gate/trigger, 12 of 16 bits
per waarde. Consequenties die in de plannen worden uitgewerkt:

- 1 ms kwantisering ligt ver onder de waarneembaarheidsdrempel voor
  ritme (~10–20 ms), dus voor drumtiming ruim voldoende.
- De werkelijke timingfout is de **jitter op de LDAC-flank**, niet het
  1 kHz-raster. LDAC hoort aan een hardware-timer output-compare pin
  van de IMXRT, niet aan een software-interrupt.
- Twee ticks geven gratis een 1 ms triggerpuls: bit zetten op tick n,
  wissen op tick n+1.
- Continue CV (filtersweeps) moet op de ontvangende kaart geïnterpoleerd
  worden over de 48 samples tussen updates, anders zipper.
- Filterfrequentie is 16 bits **exponentieel** (log-lineair, V/oct-achtig).
  Lineair in Hz zou de resolutie onderin verspillen.
