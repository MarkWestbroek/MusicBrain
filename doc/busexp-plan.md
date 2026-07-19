# Expansiebusboard ("busexp") — voorlopig plan v0.1

*2026-07-17 — het "busboard-x" uit busboard-v2-plan.md, nu met vorm.
Leidend blijven doc/spi-bus-spec.md v2.0 en doc/busboard-v3-plan.md.*

## Doel

Zes extra slots aan een Cortex-systeem, zonder tweede Teensy: het
hoofd-busboard bestuurt ze via **twee lintkabels** — J21↔J21 voor
SPI/besturing, J24↔mixer voor audio. Eén expander-segment maximaal; de
begrenzing is de besturing (16 CS-lijnen op de 74HC154), niet de audio.

## De nummering — géén foutje, wel opletten

CS en IRQ lopen bewust uit elkaar, omdat de **hubs wel een CS maar geen
IRQ** hebben:

| decoder | CS | IRQ | wat |
|---|---|---|---|
| Y0–Y5 | CS1–6 | IRQ1–6 | eigen slots 1–6 |
| Y6–Y7 | CS7–8 | — | hubs J7/J8 (2×5-pinout heeft geen IRQ-pin) |
| Y8–Y13 | **CS9–14** | **IRQ7–12** | expander-slots 1–6 |
| Y14 | (IRQSTAT) | — | uitlezen 165-keten |

Op het expansiebord geldt dus per slot n (1..6): **CS = 8+n, IRQ = 6+n**.
Die mapping komt als tabel op het schema én in silk bij de slots
(bijv. "SLOT 1 · CS9 · IRQ7"), zodat het verschil nooit meer verwart.

## Wat er op zit

- **6 slots 2×12**, zelfde pinout, steek (20,32 mm) en posities als het
  hoofdbord → kaarten en panelen zijn uitwisselbaar. Slot-pin 13 (CS*) komt
  van J21-CS9..14, pin 16 (IRQ*) gaat naar J21-IRQ7..12.
- **J21 (2×13)** — spiegel van het hoofdbord (pinout uit gen_bus3_sch.py):
  L = CS9..14, MISO, XSCLK, XMOSI, XLDAC, XCONVST, XRST, GND;
  R = IRQ7..12, 5×GND, SDA, SCL, GND. XSCLK/XMOSI/XLDAC/XCONVST voeden de
  slot-bussen (SCLK/MOSI/LDAC/CONVST); XRST blijft reserve (reset is sinds
  gen 2 lokaal per kaart); MISO multi-drop zoals lokaal.
- **J24 audiohub (2×7)** — richting vanuit de expander gezien: klokken
  (MCLK/BCLK/LRCLK) komen **binnen** via de kabel en gaan naar de
  slot-klokrails; I2SD1–6 van de eigen slots gaan **uit** naar de mixer.
- **Eigen voeding** (geen voeding over de lintkabel, v2-besluit): J9
  Eurorack 2×5 (±12V) → R-78E5.0-1.0 → +5V; AMS1117 → +3V3;
  ontkoppelbank per slot zoals het hoofdbord.
- **Qwiic-aansluiting** op de SDA/SCL uit J21 (pull-ups zitten op het
  hoofdbord — hier niet nogmaals).

## Wat er bewust NIET op zit

Teensy, CS-decoder, 165-IRQ-keten (uitlezen gebeurt op het hoofdbord),
hubs (CS7/8 zijn al vergeven aan de hoofdbord-hubs), MIDI, USB, CAN,
display, codec-poort, TUNE, DLG-UART's.

## Mechanica

Zelfde bordframe als het hoofdbord: 203,2 × 128,5 mm, zelfde M3-raster,
slots op dezelfde coördinaten. De westzone (waar op het hoofdbord de
Teensy zit) is hier vrijwel leeg: daar landen J21, J24 en de voedingshoek.
J21 aan de **westrand** zodat de lintkabel naar het hoofdbord kort blijft
als de segmenten naast elkaar hangen; totale buslengte ≤ 20 cm blijft de
regel.

## Open punten (voor de definitieve versie)

1. **Herbufferen?** De X-lijnen zijn op het hoofdbord al gebufferd
   (74LVC245 + 33R) en drijven hier 6 slots — vermoedelijk direct
   aansluitbaar, maar bij twijfel één 74LVC245 achter J21 (plek reserveren
   in de westzone).
2. **Kabellengtes**: J21-kabel + expanderbus samen binnen de 20 cm-regel
   houden; anders terminatie herzien.
3. **J24-verkabeling**: expander-J24 praat met de mixer(kaart), niet 1:1
   met hoofdbord-J24 — definitieve bedrading volgt het FPGA-mixerontwerp.

## Volgende stap

`gen_busexp_sch.py` + `gen_busexp_pcb.py` afleiden van gen_bus3 (slots,
frame en voedingshoek hergebruiken; ~⅓ van de complexiteit van het
hoofdbord) en door de vaste pijplijn: ERC 0 → netcheck → freerouting
(`--route-gnd`) → DRC 0/0.
