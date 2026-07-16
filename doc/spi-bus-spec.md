# MusicBrain SPI-bus specificatie (busboard + expansiekaarten)

**Documentversie**: **v2.0** — 2026-07-16 · beschrijft **bus-generatie 2 (2×12)**
**KiCad-referentie**: `hardware/schematics/musicbrain-busboard-v2/` (wordt v3)

> **Let op — versienummers lopen onafhankelijk.** Dit versienummer is dat van
> *dit document*. Een bord heeft zijn eigen rev (busboard rev 3.0, gate8 rev
> 2.0, …) die kan opschuiven zonder dat de spec verandert. Om verwarring te
> voorkomen noemt de spec expliciet welke **bus-generatie** hij definieert:
> - **gen 1** = slot 2×10 (v1.x van dit doc) — busboard v1.1 en v2.0
> - **gen 2** = slot 2×12, +MCLK/BCLK/LRCLK/I2S_DATA, H=45 — vanaf busboard v3
>
> Besluiten en rationale: `doc/systeem-v3-plan.md`.

Dit document is de leidende definitie voor de backplane ("busboard") en alle
expansiekaarten. Elke nieuwe kaart wordt tegen deze pinout en designregels
ontworpen — zelfde principe als de firmware-contract-keten: één bron van
waarheid, alles valideert daartegen.

## Architectuur

```
Eurorack PSU ──► busboard (Teensy 4.1 + 3V3/5V regeling)
                    │ 6 verticale slots (2x12)  +  2 hub-headers (2x5, IDC-kabel)
                    ├── slot 1..6: expansiekaarten (CV-out, gate, ADC-in,
                    │              gedelegeerde Teensy/FPGA met gemixte audio)
                    └── hub 1..2: bestaande breakouts (o.a. AD5754 rev 2.0)
```

- **Eén gedeelde SPI-bus** (SCLK/MOSI/MISO), CS per slot ("geografische
  adressering": elke kaart ziet zijn CS op dezelfde connectorpin; het slot
  bepaalt wélke CS dat is). Kaarten zijn dus slot-onafhankelijk en jumpervrij.
- **MISO is gedeeld**: SPI-slaves laten MISO los (tri-state) als hun CS hoog
  is. Er is géén aparte "in-bus" nodig; input- en outputkaarten delen dezelfde
  drie lijnen.
- **LDAC als buslijn**: alle DAC-kaarten laden hun registers, één LDAC-puls
  zet alle CV-uitgangen tegelijk om (sample-synchroon over kaarten heen).
- **I2C (3V3)** voor traag spul: potmeters, encoders, displays.
- **IRQ per slot** (zelfde geografische truc) voor data-ready/encoder-events.

## Slot-pinout (2×12, 2.54 mm — J1..J6 op busboard) — gen 2

Pinnen **1–18 zijn identiek aan gen 1**; 19–24 zijn nieuw of gewijzigd.

| Pin | Functie | Pin | Functie |
|----:|---------|----:|---------|
|  1  | GND     |  2  | +12V    |
|  3  | GND     |  4  | −12V    |
|  5  | GND     |  6  | +3V3    |
|  7  | SCLK    |  8  | GND     |
|  9  | MOSI    | 10  | GND     |
| 11  | MISO    | 12  | GND     |
| 13  | **CS** (geografisch) | 14 | GND |
| 15  | LDAC    | 16  | **IRQ** (geografisch) |
| 17  | SDA     | 18  | SCL     |
| 19  | SPARE1 (= CONVST) | 20  | **GND** (guard, was SPARE2) |
| 21  | **MCLK** (gedeeld) | 22  | **BCLK** (gedeeld) |
| 23  | **LRCLK** (gedeeld) | 24  | **I2S_DATA** (per slot, slave → master) |

SPARE1 is gereserveerd als **CONVST**: busbrede "sample nu"-strobe voor
ADC-kaarten — het spiegelbeeld van LDAC. Alle DAC's updaten synchroon op
LDAC, alle ADC's samplen synchroon op CONVST.

> **Gewijzigd t.o.v. gen 1**: SPARE2 (was ADC_RESET) vervalt als buslijn en
> wordt GND-guard vóór het audioblok. De AD7606-resetpuls wordt lokaal op de
> ADC-kaart opgelost (RC-reset op power-up + 100k pulldown), niet meer busbreed.

### Audio-lijnen (21–24)

Hiermee kan **elk slot** een gedelegeerde module met **gemixte** audio dragen
(2e Teensy, codec, FPGA):

- **BCLK/LRCLK/MCLK zijn gedeeld** en komen van de **klokmaster**. Er mag er
  exact één zijn (master-Teensy, codec óf FPGA — te kiezen); twee klokbronnen
  geven drift en klikken.
- **I2S_DATA is per slot** (slave → master). Twee Teensy's kunnen niet één
  datalijn delen; TDM-slots tri-staten kan de Teensy-SAI niet betrouwbaar.
- **MCLK = 256×fs = exact de ADAT-bitklok** (48 kHz → 12,288 MHz). Een
  FPGA-kaart gebruikt MCLK dus rechtstreeks als ADAT-bitklok: geen PLL, geen
  extra oscillator.
- ⚠️ **Nog te reviewen**: signaalintegriteit van 21–24 (MCLK/BCLK ~12 MHz);
  pin 20 als GND-guard is een voorstel, geen bewezen keuze.

Connector op busboard: **PinSocket 2×12** (female); op de kaart: haakse male
pin header 2×12 aan de onderrand.

## Hub-headers (2×5 IDC — J7..J8, compatibel met AD5754-breakout J1)

| Pin | Functie | Pin | Functie |
|----:|---------|----:|---------|
| 1 | GND  | 2  | SYNC (= CS7/CS8) |
| 3 | SDO (MISO) | 4 | SDIN (MOSI) |
| 5 | SCLK | 6  | GND  |
| 7 | +3V3 | 8  | GND  |
| 9 | −12V | 10 | +12V |

## Teensy 4.1 pintoewijzing

| Functie | Teensy-pin | | Functie | Teensy-pin |
|---|---|---|---|---|
| SCLK (SPI0 SCK) | 13 | | CS1..CS6 (slots) | 10, 9, 8, 7, 6, 5 |
| MOSI (SPI0) | 11 | | CS7..CS8 (hubs) | 4, 3 |
| MISO (SPI0) | 12 | | LDAC | 2 |
| SDA (Wire) | 18 | | IRQ1..IRQ6 | 28, 29, 30, 31, 32, 33 |
| SCL (Wire) | 19 | | SPARE1, SPARE2 | 40, 41 |

## Voeding

- Bus draagt **+12V, −12V, GND** (Eurorack, 10-pens entry: 1-2 = −12V met
  rode streep, 3-8 = GND, 9-10 = +12V) plus **+3V3** voor logica.
- **De 10-pens eurorack-standaard voert géén +5V** — alleen de 16-pens versie
  heeft +5V/CV/Gate. Bus-5V is dus geen optie bij een 10-pens entry; het
  busboard maakt zijn eigen 5V. (Geverifieerd bij Doepfer, 2026-07-16.)
- **+3V3 komt van een eigen regelaar op het busboard** (**R-78E5.0-1.0**, buck
  12→5 V **@ 1 A** — gen 2; was 0,5 A — daarna LDO 5→3.3 V) — níet van de
  Teensy-regulator (te weinig reserve) en níet parallel daaraan (twee
  regelaars op één net = verboden). 1 A is nodig omdat de **USB-host** tot
  500 mA @ 5 V mag trekken.
- Teensy VIN hangt aan de +5V-rail. **Let op**: als USB tegelijk met
  busvoeding gebruikt wordt, de VUSB/VIN-brug op de Teensy doorsnijden
  (standaard PJRC-advies) of een diode plaatsen.
- Elke kaart ontkoppelt lokaal (100 nF per IC + 10 µF per rail).

## Designregels (bus-integriteit)

1. Backplane ≤ 20 cm, GND-vlak onder de buslijnen, GND naast elke snelle lijn.
2. 33 Ω serieweerstand in SCLK en MOSI **bij de Teensy** (zit op busboard).
3. SPI-klok: start op 2–4 MHz; pas opvoeren als alles werkt. (8×16-bit CV op
   1 kHz ≈ 1,5 Mbit/s — snelheid is geen bottleneck.)
4. Eén SPI-transactie per CS; SPI-mode mag per kaart verschillen
   (`SPISettings` per device in firmware). AD5754 = mode 1 (via SYNC↑),
   74HC(T)595 = mode 0 (latch op CS↑).
5. Kaarten die MISO niet gebruiken laten pin 11 onaangesloten (nooit hard aan
   GND/3V3 knopen).
6. Hot-pluggen van kaarten: niet doen (geen buffered backplane in v1).

## Geplande kaarten

| Kaart | Interface | Kernonderdelen | Status |
|---|---|---|---|
| 4× CV out (breakout) | SPI via hub | AD5754BREZ + ADR421 | **klaar**: `hardware/schematics/ad5754r-breakout/` (sch + geroute PCB) |
| 8× gate out | SPI (write-only) | 74HCT595 @ +5V (lokale 78L05/AMS1117-5.0), 1 k serie-uit | **klaar (v1.1)**: `hardware/schematics/musicbrain-gate8/` — 35×80 mm, haakse connectoren, volledig geroute; latch = CS↑, mode 0 |
| 8× ADC in | SPI + IRQ + CONVST | **AD7606** (16-bit, 8-ch, simultaan, ±10V direct, 1 MΩ) | **klaar (v1.1)**: `hardware/schematics/musicbrain-adc8/` — 40×80 mm, haakse connectoren, volledig geroute; CS→CS, BUSY→IRQ, CONVST→SPARE1, RESET→SPARE2 (+100k pulldown), RANGE via JP1 (3V3=±10V / GND=±5V), OS0-2=GND, seriële mode (DOUTA→MISO, DB's→GND), VDRIVE=3V3, AVCC=5V lokaal, interne 2.5V-referentie; J2-contract identiek aan GATE8 (1=GND, 2-9=kanaal, 10=GND) |
| 8× CV out ("DAC8", 2× AD5754) | SPI + LDAC | 2× AD5754 (daisy-chain, 1 CS) + ADR421 | **klaar**: `hardware/schematics/musicbrain-dac8/` — 50×80 mm, volledig geroute; LDAC = buslijn, offset binary, J2-contract identiek |
| 8× pot | SPI | MCP3208 + **RK097N** (9 mm, haaks) | **klaar**: `hardware/schematics/musicbrain-pot8/` — 110×80 mm, potten op 13,5 mm steek met de assen door de bovenplaat; alleen +3V3; volledig geroute |
| 4× encoder/knop | I2C + IRQ | MCP23017 (0x20) + **Bourns PEC12R** haaks (met drukknop) | **klaar**: `hardware/schematics/musicbrain-enc4/` — 70×80 mm, 4 encoders op 16,7 mm steek (beugels begrenzen; 8 paste niet), INT→IRQ; volledig geroute |
| 8× gate **in** | SPI (read-only) | 74HC165 + 74LVC1G125 (CS-gated tri-state MISO) + per kanaal 100k serie / 100k pulldown / BAT54S-clamp | **klaar**: `hardware/schematics/musicbrain-gatein8/` — 40×80 mm; ~PL-latchpuls uit CS↓ via 220p/10k (fw wacht ≥5 µs); volledig geroute |
| jack8-printje | passief | 8× Thonkiconn (PJ398SM) + female socket onderzijde | **klaar**: `hardware/schematics/musicbrain-jack8/` — prikt op J2 van GATE8/ADC8 (contract: 1=GND, 2-9=kanaal, 10=GND) |
| jack4-printje | passief | 4× Thonkiconn + female socket onderzijde | **klaar**: `hardware/schematics/musicbrain-jack4/` — voor de oude AD5754-breakout via kabel (1=GND, 2-5=A-D) |

## Display

Twee sporen, beide **gerealiseerd op busboard v1.1**:

1. **I2C (traag, klein)** — **J12 "QWIIC"** (1×4, 2,54 mm): GND, 3V3, SDA,
   SCL — de Qwiic/StemmaQT-pinvolgorde. Soldeer er een JST-SH-pigtail of
   los 4-pins kabeltje aan; SSD1306/SH1106-OLED's en alle Qwiic-modules
   werken direct (pull-ups 2k2 zitten al op de bus).
2. **SPI (snel, groot TFT)** — **J11 "DISPLAY"** (1×9) op eigen SPI1, níet
   op de CV-bus (displayframes zouden het CV-verkeer blokkeren). Pinvolgorde
   = de standaard ILI9341-module (dupontkabel 1-op-1): 1 VCC(3V3), 2 GND,
   3 CS (Teensy 0), 4 RESET (25), 5 DC (24), 6 SDI/MOSI1 (26), 7 SCK1 (27),
   8 LED (3V3), 9 SDO (nc — readback ongebruikt). Nic's teensy-eurorack
   doet het ook zo (aparte TFT-lijnen).

De AD7606-keuze scheelt een compleet opamp-frontend per kanaal: ±10V mag
rechtstreeks de chip in (interne clamps, 1 MΩ). Serieel uitlezen: na CONVST↓↑
gaat BUSY hoog (~4 µs), op BUSY↓ (IRQ) 8×16 bit klokken via MISO.

## Delegated modules (2e Teensy / FPGA's)

Besluit 2026-07-08:
- **FPGA-kaarten mogen op de hoofdbus**: een FPGA is een gedisciplineerde
  SPI-slave (snel, deterministisch, tri-state MISO). Voorwaarde: korte
  transacties (≤ ~10 µs), anders blokkeren ze de CV-timing.
- **Teensy-delegates (bijv. 5×Elements) NIET op de SPI-bus**: Teensy als
  SPI-slave is onbetrouwbaar/vertragend. Besturing loopt per delegate over
  een **eigen UART-link** (point-to-point, DMA-vriendelijk, tot 6 Mbaud).
  Beschikbare Serial-poorten: Serial3 (14/15), Serial4 (16/17), Serial5
  (20/21) — alle drie op de EXP-header — plus Serial8 (34/35, vrije pads).
  Serial1 (0/1) en Serial6 (24/25) zijn in v1.1 aan het display vergeven
  (CS/DC/RST); pin 1 is nog vrij.
- **Audio van delegates** gaat níet over SPI of UART maar via I2S/TDM naar
  het audiosysteem van de hoofd-Teensy, of analoog (som/mixer).

## Vrije Teensy-pinnen → EXP-header (busboard v1.1, gerealiseerd)

Bus gebruikt 2–13, 18, 19, 28–33, 40, 41; display (J11) gebruikt 0, 24–27.
**J10 "EXP"** (2×7) voert de acht overige DIP-pinnen uit + voeding:

| pad | net | pad | net |
|---|---|---|---|
| 1 | +3V3 | 2 | GND |
| 3 | +5V | 4 | GND |
| 5 | D15 | 6 | D14 |
| 7 | D17 | 8 | D16 |
| 9 | D21 | 10 | D20 |
| 11 | GND | 12 | D22 |
| 13 | D23 | 14 | GND |

D14–D17/D20–D23 zijn analoog-capabel (A0/A1/A6/A7/A3…) en dragen Serial3/4/5.
Daarnaast blijven **pin 1 (MISO1) en pins 34–39** (o.a. Serial8) vrij op de
Teensy zelf.

## Mechanica-standaard kaarten (besluit 2026-07-08/09, Alt-3-review)

**Assenstelsel** (definitief): **L** (lengte) = lange as van het busboard,
de richting waarin de kaarten naast elkaar staan (**slotsteek 20,32 mm = 4 HP**).
**B** (breedte) = diepte van het busboard; de slots en de kaartvlakken
lopen in deze richting. **H** (hoogte) = hoe hoog een kaart boven het
busboard uitsteekt.

Model: busboard ligt plat (L x B), kaarten staan verticaal, en boven alle
kaarten komt **een vlakke bovenplaat** waar jacks, potmeters en encoders
doorheen steken.

1. **H = 45 mm voor alle kaarten** (gen 2; was 80 in gen 1) — dit maakt de
   gedeelde bovenplaat mogelijk én houdt de box laag. De kaarten waren op
   80 mm voor 87–92% lucht. De hoogte wordt bepaald door de mechanische
   stapel (J1 onder → J2 boven), niet door de componenten: de connectorzones
   (padrij + courtyard) kosten samen 14,16 mm, dus bij H=45 blijft een
   **componentband van 30,84 mm** over — de drukste kaart (adc8: 416 mm²
   componenten, AD7606 13,4×13,4) komt daarmee op ~17% dichtheid, gelijk
   aan de bewezen gen-1-dichtheid. Een Teensy 4.1 (61×18) past liggend op
   een 80×45-kaart.
2. **Slotsteek = 20,32 mm (4 HP)**, 1 HP = 5,08 mm — zodat de fronts op de
   standaard gatenrij van een rack vallen. Fronts blijven 20 mm breed
   (0,32 mm lucht ertussen).
3. **Slots staan gecentreerd op het bordhart** (B-richting). Dit was in gen 1
   fout: de slots stonden 16,07 mm uit het hart, waardoor de fronts scheef
   boven het busboard hingen.
4. **Busconnector = haakse (horizontal) male 2×12** aan de onderrand,
   pennen langs het kaartvlak omlaag het slot in.
5. **Paneelconnector = haakse male** aan de **bovenrand** (tegenover de
   busrand), pennen langs het kaartvlak omhoog; hart **recht boven het
   midden van de slot-pinrij** - zodat alle jack-printjes op alle kaarten
   passen en de strips op de bovenplaat netjes uitlijnen.
6. **Front-borden** liggen horizontaal (parallel aan de bovenplaat) en dragen
   een **rechte female socket aan de onderzijde**. Twee harde regels:
   - **Socket gecentreerd op de lengte van het front** (niet op een vaste
     absolute y!). Het front hangt aan zijn socket, en die zit recht boven het
     slot; alleen bij centrering hangt het front symmetrisch. In gen 1 stond de
     socket op een vaste y — voor 110 mm-borden is dat hetzelfde, maar jack8
     (125 mm) hing daardoor 7,5 mm scheef en jack4 (65 mm) zelfs 17,4 mm.
   - **Hartlijn componenten = 8,0 mm vanaf de westrand**, socketkolom op
     16,5 mm. Zo liggen de middens van pots, encoders en jacks overal op
     dezelfde afstand — ook bij een breder front (enc5front is 30 mm en aan
     één kant breder; de hartlijn blijft 8,0).
   - Bruikbare frontlengte = **110 mm** (`doc/mechanics/front-board-constraints.md`:
     de rails eten boven+onder ~9 mm van de 128,5 mm paneelhoogte).
   TN-normalling via soldeerjumper (dicht = inputs, open = outputs!).

   Vuistregel: **per koppeling precies een haakse connector, altijd aan de
   kaartzijde (male)**; busboard-slots en jack-printjes hebben rechte
   female sockets. Elke kaart draagt dus twee haakse males (onder + boven).
7. **Silkscreen-link**: `musicbrain.nl/hw/<bord>` + rev. Kort, drukbaar en
   stabiel: het domein redirect naar de actuele documentatie. Richt op
   musicbrain.nl een redirect in per bord.

## Mechanica: dragen en geleiden

Hoe een kaart vastzit (drie niveaus, van onder naar boven):

1. **Het slot zelf**: de female 2×12-socket klemt de haakse pennen — dat
   geeft prima elektrisch contact en houdt de kaart op zijn plek, maar
   biedt weinig zijdelingse stijfheid (de kaart kan wiebelen).
2. **De bovenplaat**: elke kaart steekt zijn haakse paneelconnector in de
   female socket van een jack-strip, en die strip hangt met de
   Thonkiconn-moeren aan de bovenplaat. Zodra de plaat er op zit, is elke
   kaart dus **boven én onder vastgepakt** — dit is de primaire fixatie.
3. **Standoffs**: het busboard heeft 5× M3 (Ø3,2): drie aan de noordrand,
   twee aan de zuidrand — daarmee staat het geheel op afstandsbussen in
   een kast; de bovenplaat krijgt eigen standoffs naar het busboard op
   dezelfde gaten (lange bussen door alles heen, of aparte kolommen).

Aparte printgeleiders (rails zoals in 19"-racks) zijn daarmee **niet
nodig**; wie extra stijfheid wil bij zware kaarten (potmeterkaart) kan een
steunlat over de kaartenrij leggen die in de bovenhoeken van de kaarten
grijpt (kaart-v1.2: 2× M3-gat in de bovenhoeken reserveren).

## Front-standaard (besluit 2026-07-11)

Bediening en jacks liggen op **front-borden**: platte printjes in het vlak van
het paneel, per 20 mm-kolom, gedragen door de M7-moeren (pots/encoders) of
Thonkiconn-moeren (jacks).

1. **As-hartlijn = 8,0 mm van de westrand** van de kolom - voor jacks, pots
   en encoders, zodat het paneel overal hetzelfde ritme heeft.
2. **Koppeling zit op de achterzijde** van het front-bord (female socket,
   opening omlaag), in-lijn (jacks) of in de ooststrook (pots).
3. **Pot-keten**: `musicbrain-pot8front` (dom: 8x RK097N verticaal) op
   `musicbrain-potriser` (MCP3208 + 100n/loper) - frontcontract 1x10:
   **1 = GND, 2..9 = W1..W8, 10 = +3V3**.
4. **Enc-keten** (in ontwerp): slim front (MCP23017) op de generieke
   `musicbrain-riser` (volledige bus, 2x12, x-gematcht - zie riser-README).
   De enc-keten gebruikt inmiddels de smalle `musicbrain-i2criser`.
5. Pin-1-orientatie van elke koppeling bij de eerste fysieke passing
   verifieren; bij spiegeling de J2-map in de generator omdraaien.

**Vervangen door dit model** (in `deprecated/` zodra de mapstructuur is
omgezet): pot8-slotkaart (haakse pots), enc4-slotkaart (haakse encoders).

## Open punten (v2-kandidaten)

- +5V ook naar de slots (nu alleen intern voor Teensy/LDO; gates gebruiken
  eigen 5V? → beslissen bij gate-kaartontwerp: optie is SPARE1 herbestemmen).
- Gebufferde bus (74LVC244/245 per segment) als er >6 kaarten of langere
  backplane nodig blijkt.
- Encoderkeuze voor het encoderbord: op specs kiezen — advies **Bourns
  PEC11R** (12 mm, 24 det., drukknop) of het 9 mm-zusje PEC09: degelijk,
  overal leverbaar, met datasheet; alternatief Alps EC11. Sluit aan op
  MCP23017 met 10k pull-ups + 100n ontdender per fase.
