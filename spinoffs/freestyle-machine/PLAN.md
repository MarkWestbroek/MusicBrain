# Freestyle-rap-begeleidingsautomaat

Compacte, draagbare MusicBrain-variant. Genereert zelf geluid, wordt
met voetpedalen bediend, en is bedoeld voor iemand die stáát en zijn
handen niet vrij heeft.

## Het ontwerpprincipe

**Niets gebeurt op het moment dat de pedaal wordt ingedrukt.**

Een rapper trapt midden in een regel, want hij denkt vooruit. Elke
pedaaldruk *bewapent* een verandering die pas landt op de eerstvolgende
maat — of beter, op de "1" van de volgende vierbarige frase.

Wie dat niet doet bouwt een machine die de flow breekt in plaats van
draagt. Dit is de belangrijkste ontwerpkeuze in het hele project.

Implementatie zit in de bestaande `Transport`-module in
`firmware/core`; er moet alleen een arm/fire-laag omheen.

## Pedalen

Drie, en de eerste is verreweg de belangrijkste.

| # | Functie | Kwantisering |
|---|---|---|
| 1 | **DROP** — momentary; ingedrukt houden cut de beat | uit: direct. terug: op de tel |
| 2 | **NEXT** — volgende sectie/loop | volgende frase; LED knippert terwijl gewapend |
| 3 | **Expressie** — MS-20-filter over de hele mix | continu |

DROP is bewust **asymmetrisch**: het uitvallen mag direct (daar valt de
punchline droog), het terugkomen moet strak.

### Jacks

TRS met auto-detectie. Een schakelaar is open of kortgesloten; een
expressiepedaal presenteert een variabele weerstand op de ring. Eén
jacktype, firmware zoekt zelf uit wat erin zit.

Drie dingen om in te ontwerpen:

- **Polariteitsdetectie.** Expressiepedalen zijn 10k, 25k of 50k, en
  Roland en Yamaha bedraden tip en ring omgekeerd. Meet bij boot en
  laat de firmware omdraaien. Idem normally-open vs normally-closed
  voetschakelaars.
- **Geen RC-debounce.** Dat kost latency op precies de flank die
  muzikaal telt. Reageer direct op de eerste flank, blokkeer daarna
  10 ms in software.
- **Hot-plug bescherming.** Een TRS-plug sluit tijdens insteken ring
  kort tegen sleeve. Serieweerstand plus clampdiodes.

## Front

Valkuil: een scherm ontwerpen voor iemand die zit. Deze gebruiker
staat, kijkt zelden, en heeft slecht licht.

- Eén groot getal: **BPM**. Verder de maat in de frase (1-2-3-4) en de
  sectienaam. Geen menu's in performance-modus.
- Belangrijker dan het scherm: **een felle LED die op de "1" van elke
  frase pulseert.** Perifeer zichtbaar. Dat is de echte UI.
- Knoppen: tempo (met tap), volume, twee macro's. Meer niet.

## De functie die als eerste gebouwd moet worden

**Een ringbuffer die altijd opneemt.** Twee minuten, doorlopend. Eén
knop: bewaren.

Het probleem met freestylen is niet opnemen — het is dat je pas
achteraf weet dat het goed was. Een machine waarbij je na afloop "die"
kunt zeggen is fundamenteel bruikbaarder dan een machine met een
record-knop.

Technisch triviaal: circulaire buffer, bij indrukken de laatste N
seconden wegschrijven. **De Teensy 4.1 heeft een microSD-slot onboard**,
dus geen busboard-wijziging nodig — alleen een uitsparing in de
behuizing.

## Kaartindeling

Drie slots volstaan:

| Slot | Kaart |
|---|---|
| 1 | FPGA-voice — bestaande kaart: bas en stabs via Karplus-Strong + MS-20-filter |
| 2 | Analoge drums — zie `doc/spinoffs/drum-808/PLAN.md` |
| 3 | Pedaal-I/O — fusie van pot8 + gate-in-8, geen front, breakoutkabel naar jacks achterop |

Teensy, display en codec zitten al op het busboard zelf.

### Pedaalkaart past zonder busboard-aanpassing

`CONVST` (pin 19) plus `IRQn` (pin 16) is precies de combinatie voor
gelijktijdig bemonsterende ADC's met interrupt terug — daar zijn die
pinnen voor bedoeld. Expressiepedalen op een 8-kanaals ADC,
voetschakelaars op digitale ingangen.

Omdat alles toch naar de volgende maat gekwantiseerd wordt, mag de
timing hier een paar milliseconden slordig zijn. Pollen kan ook. Dat
maakt deze kaart bijna triviaal.

## Formaat

Het huidige busboard is 203,2 × 128,5 mm (40 HP × 3U) met zes slots op
20,32 mm steek. Deze machine heeft er drie nodig.

**Een 20 HP-variant met hetzelfde gatenraster en dezelfde slot-pinout
halveert het bord zonder dat één kaart hoeft te veranderen.**

### Hoogte

Huidige stack: connector + 45 mm + connector + frontmodule + front
≈ 70–80 mm. Zowel de pedaalkaart als de drumkaart hebben **geen front
nodig** — die laatste juist omdat alle parameters digitaal instelbaar
zijn. Dan blijf je op connector + 45 mm + connector.

Voor kalibratie van de analoge kaart: testpunten en digitale trim, geen
mechanische trimmers. Anders sluipt het front alsnog terug.

## Batterijvoeding — open ontwerpvraag

Het busboard verwacht ±12V binnen op `J9` (10-pins Eurorack, alleen
±12V/GND) en maakt daar zelf 5V (R-78E5.0-1.0, 1 A) en 3V3 (AMS1117)
van.

Ruwe schatting van het verbruik:

| Blok | Schatting |
|---|---|
| Teensy 4.1 @ 600 MHz | ~100 mA @ 5V |
| FPGA-kaart (Tang Primer 20K) | 200–400 mA |
| Analoge drumkaart | 50–100 mA op ±12V |
| Codec + display + LEDs | ~100 mA |
| **Totaal** | **grofweg 5–8 W** |

Een USB-C PD-pack op 20V met een buck naar +12V en een inverterende
trap naar −12V is de meest praktische route: PD-packs zijn goedkoop,
vervangbaar en mag je meenemen in het vliegtuig.

Bij 37 Wh (een 10 000 mAh pack) en 6 W: **ruwweg 5–6 uur**. Ruim
genoeg voor een optreden.

**Aandachtspunt:** een schakelende voeding naast analoge
drumresonatoren die vlak onder zelfoscillatie hangen is precies waar
fluittonen vandaan komen. Vaste schakelfrequentie ruim boven audio,
LC-filtering, en dit als eerste meten op een prototype.

Te onderzoeken: kan de FPGA-kaart omlaag in kloksnelheid als de
machine op batterij loopt? Dat is de grootste post.

## Architectuurnotitie

Deze machine **breekt de bestaande MusicBrain-pitch**. "Your audio
stays 100% analog; the brain speaks only relays, CV and gate" gaat niet
op voor iets dat zelf het geluid maakt.

Dat is geen bezwaar — het Gen 2-busboard loopt daar met de
I2S-lijnen per slot toch al op vooruit — maar het is een **vierde
productlijn met een ander verhaal**, geen variant op Cortex.

Waard om te beslissen vóór de kaarten getekend worden, niet erna.
Naamgeving en positionering horen bij deze beslissing.

## Volgorde van aanpakken

1. Arm/fire-laag op `Transport`, getest met knoppen op een breadboard
2. Ringbuffer + save op de onboard microSD
3. Pedaalkaart (eenvoudigste hardware, meteen bruikbaar)
4. 20 HP busboard-variant
5. Analoge drumkaart
6. Batterijvoeding
