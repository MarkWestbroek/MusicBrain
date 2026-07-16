# Systeem v3 — mechanica + bus-herziening (ontwerpbesluiten)

**Datum:** 2026-07-16 · **Status:** besloten door Mark, nog niet uitgevoerd.
**Aanleiding:** bij het publiceren van de borden bleek dat de slots niet
gecentreerd op het busboard staan. Bij het narekenen kwamen er meer
structurele dingen boven. **Er is nog niets besteld** — daarom is dit hét
moment voor een systeembrede breaking change.

Leidend na uitvoering: `doc/spi-bus-spec.md` (moet naar v2.0) en dit document.

## De aanleiding: het uitlijnprobleem (gemeten)

| | y-bereik | hart |
|---|---|---|
| busboard v2 | 10 … 125 | **67,50** |
| slots J1–J6 (connectorvlak) | 40,00 … 62,86 | **51,43** |

De kaarten/risers zijn correct gecentreerd op hun eigen busconnector, dus die
keten geeft de centrering netjes door — naar y=51,43. Een pot8front (110 mm)
landt daardoor op −3,57 … 106,43 terwijl het bord 10 … 125 loopt: **16,07 mm
scheef**. Oorzaak: y=40 was een rond getal uit de begintijd; het bord groeide
later naar 115 mm diep en de slots zijn nooit meegecentreerd.

## Besluiten

| # | Besluit | Rationale |
|---|---|---|
| 1 | **Slots centreren** op het bordhart | het uitlijnprobleem hierboven |
| 2 | **Slotsteek 20,00 → 20,32 mm (4 HP)** | 1 HP = 5,08; aansluiten op de standaard gatenrij |
| 3 | **Busboard 40 HP breed (203,2 mm) × 128,5 mm diep** | 3U-paneelvlak; paneel, fronts en grondbord delen één footprint → zelfstandige unit |
| 4 | **U2 (R-78E5.0) verplaatsen** | blokkeert het zuidwaarts schuiven van de slots |
| 5 | **H 80 → 45 mm** (kaarten **80 mm breed** × 45 hoog) | kaarten zijn nu 87–92% lucht; connectorzones kosten 14,16 mm, dus band = 30,84 mm → adc8 op ~17% = bewezen gen-1-dichtheid. Box wordt 35 mm lager. (Eerst 50; 45 na de inzet-fix — besluit Mark) |
| 6 | **Slot 2×10 → 2×12** (+MCLK/BCLK/LRCLK/DATA) | zonder deze lijnen is een gedelegeerde slave-module met **gemixte** audio structureel onmogelijk |
| 7 | **Voeding: 10-pins houden + R-78E5.0-0.5 → -1.0 (1A)** | de 10-pins eurorack-standaard voert géén +5V (alleen 16-pins doet dat); een jumper tussen bus-5V en eigen regelaar is een risicovol faalpad. 1A is nodig voor USB-host (500 mA) |
| 8 | **MIDI 2×IN / 2×UIT** | symmetrisch; **pin 29 (TX7) stond al vrij** en hoort bij pin 28 (RX7 = MIDI IN2). Kosten: 1× 74LVC1G17 + 3-pins header |
| 9 | **USB-host toevoegen** | Teensy 4.1 heeft aparte USB-host-pads (nog niet in onze footprint) |
| 10 | **jack8 → 110 mm, 8 jacks @ 13,75 mm, socket gecentreerd; jack4 → alleen steek 13,75** | jack8 was 125 mm terwijl de bruikbare hoogte tussen de rails 110 mm is (`front-board-constraints.md`); socket stond 7,5 mm uit het midden. jack4 hangt via een kabel aan de hub-DAC — centrering is daar irrelevant |
| 11 | **ADAT: bus-lijnen reserveren, geen slot** | met 2×12 kan élk slot een FPGA-/codec-/slave-kaart worden |

### Wat NIET verandert

- **Front-hartlijn = 8,0 mm vanaf de westrand** blijft (besluit Mark): de
  middens van pots/encoders/jacks liggen daarmee overal op dezelfde afstand.
  De enc5front is aan één kant breder — dat blijft zo.
- **Front-koppel-standaard**: 1×10 socket op x = 16,5 mm van de westrand.
- pot8front en enc5front (110 mm, socket al gecentreerd) blijven ongewijzigd.

### Nieuwe regel (vervangt de oude)

> De front-socket zit **gecentreerd op de lengte** van het front — niet op een
> vaste absolute y. Voor 110 mm-borden is dat hetzelfde; voor afwijkende
> lengtes (jack8/jack4) niet, en dáár ging het mis.

## Voorstel slot-pinout 2×12

Pinnen **1–18 blijven identiek** aan v2 (de spec-kern verschuift niet):

| pin | v3 | | pin | v3 |
|---|---|---|---|---|
| 1 | GND | | 13 | /CS |
| 2 | +12V | | 14 | GND |
| 3 | GND | | 15 | /LDAC |
| 4 | −12V | | 16 | /IRQ |
| 5 | GND | | 17 | /SDA |
| 6 | +3V3 | | 18 | /SCL |
| 7 | /SCLK | | 19 | /SPARE1 |
| 8 | GND | | 20 | **GND** (was SPARE2 — guard) |
| 9 | /MOSI | | 21 | **/MCLK** |
| 10 | GND | | 22 | **/BCLK** |
| 11 | /MISO | | 23 | **/LRCLK** |
| 12 | GND | | 24 | **/I2S_DATA** (per slot, slave → master) |

- BCLK + LRCLK zijn **gedeeld** (van de klokmaster); **DATA is per slot**, want
  twee Teensy's kunnen niet één datalijn delen.
- ⚠️ **Te reviewen**: pin 20 als GND-guard vóór het audioblok; MCLK/BCLK lopen
  op ~12 MHz. Signaalintegriteit van 21–24 nog narekenen.

## De mooie samenloop: MCLK = ADAT-bitklok

Bij 256×fs is **MCLK exact de ADAT-bitrate** (48 kHz → 12,288 MHz; 44,1 kHz →
11,2896 MHz). Een FPGA-kaart pakt MCLK van de bus en gebruikt 'm **direct** als
ADAT-bitklok: geen PLL, geen extra oscillator. Dat rechtvaardigt MCLK op de
2×12 op zichzelf al. (De Tang Nano's 27 MHz-kristal kan 12,288 MHz níét netjes
maken — 512/1125 is geen PLL-verhouding. Dus: MCLK van de bus.)

## FPGA-keuze (ADAT)

Een ADAT-zender is minuscule logica (serializer + wat FIFO in block-RAM) —
**geen extern geheugen nodig**. Alle drie de opties zijn ruim overgedimensioneerd;
de doorslag geven toolchain, IO en montage:

| bord | FPGA | LUT4 | oordeel |
|---|---|---|---|
| **Tang Nano 9K** | GW1NR-9 | 8640 | **aanbevolen**: 0,1"-headers (prikt als een Teensy op onze kaart), GW1N heeft de beste open-source toolchain (Yosys + nextpnr), 3V3-IO, goedkoop |
| Tang Nano 4K | GW1NSR-4C | 4608 | kan ook; minder IO, de Cortex-M3 is voor ons irrelevant |
| Tang Primer 25K | GW5A-25 | 23040 | overkill; GW5A heeft zwakkere open-source-ondersteuning en vraagt een Dock voor normale IO → lastig monteren |

Front heeft een **TOSLINK TOTX/TORX-module** nodig. Nog narekenen: 3V3-budget
(AMS1117) met een FPGA-kaart erbij (~100–200 mA).

## Gevolgen per bord

| bord | actie |
|---|---|
| busboard | herbouw: slots centreren + 4 HP + 203,2×128,5 + 2×12-slots + U2 verplaatsen + MIDI-UIT2 + USB-host + 1A-regelaar → volledige re-route |
| adc8, dac8, gate8, gatein8 | H 80→50, 80 mm breed, J1 → 2×12, componenten herschikken → re-route |
| riser, potriser, i2criser | H 80→50, J1 → 2×12 (dom; triviaal) |
| jack8 | 110 mm, 8 jacks @ 13,75, socket gecentreerd |
| jack4 | 4 jacks @ 13,75, socket gecentreerd |
| pot8front, enc5front | ongewijzigd (110 mm, socket al gecentreerd) |
| ad5754r-breakout | ongewijzigd (geen slotkaart) |

## Actielijst (volgorde)

1. **`doc/spi-bus-spec.md` → v2.0**: slot 2×12 + nieuwe pinout + H=45 vastleggen. ✔
2. **`bus.py`**: H=45-parametrisering + 2×12-slotfootprint + de nieuwe
   `j1_map()`. ✔
3. **Risers** eerst (dom, snel = vroege validatie van de 2×12-keten). ✔
4. **Slotkaarten** (adc8/dac8/gate8/gatein8): herindelen 80×45 → freerouting.
5. **jack8/jack4** herindelen.
6. **Busboard v3**: floorplan + placement, dan freerouting (grootste klus).
7. Fab + README's + MODULES.md + herpubliceren naar de site.

Poortwachters ongewijzigd: ERC 0 + netcheck OK + DRC 0/0 vóór commit.

## Open punten

- Signaalintegriteit pinnen 21–24 (MCLK/BCLK op 12 MHz) — pinvolgorde reviewen.
- 3V3-budget (AMS1117) met FPGA-kaart erbij.
- Website: belooft nu 4×MIDI in/uit → moet 2/2 worden.
- Klokmaster-keuze: master-Teensy, codec of FPGA (er mag er exact één zijn).
