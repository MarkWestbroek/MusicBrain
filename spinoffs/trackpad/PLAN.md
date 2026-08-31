# Muzikaal trackpad — custom part

> **Status 2026-08-31:** conceptreview uitgevoerd. De oorspronkelijke
> verkenning hieronder bevat nog onbevestigde aannames over Cirque Z-data,
> SPI, report rate, CAN en firmware-integratie. De ontwerpcorrecties en
> aangepaste prototypevolgorde staan in [Aanvulling na haalbaarheidsreview](#aanvulling-na-haalbaarheidsreview).

Tweedimensionale modulatiebron. Bedoeld als tegenhanger van de
bestaande potmeters en encoders, en als tweede custom part naast de
encoder-met-ingebouwd-scherm.

## Waarom een trackpad en niet een joystick of touchscreen

- **Joystick**: springt terug naar nul. Dat is muzikaal iets heel
  anders — goed voor pitchbend-achtige gebaren, minder voor het
  vasthouden van een positie.
- **Touchscreen**: je kunt erop tekenen en visuele feedback geven van
  waar parameters staan. Duurder, en het vraagt dat je **kijkt**.
- **Trackpad**: absolute positie plus druk, zonder te kijken. Voor een
  performer die staat is dat doorslaggevend.

Voor de freestyle-machine is het pad de juiste keuze.

## Sensor: Cirque GlidePoint

Cirque is een Amerikaanse fabrikant van capacitieve trackpads voor
industriële en medische apparatuur — losse modules, geen
consumentenproduct.

- Plat printplaatje, meestal rond, ~2–5 cm diameter
- Controllerchip aan boord doet het rekenwerk; je leest **x, y en z**
  uit, waarbij z een echte drukwaarde is
- SPI of I²C, vier of vijf draadjes
- Tot 300 Hz, één vinger (of twee in gesture-modus)
- ~€20–40, los te koop bij Mouser en Digikey

**Belangrijk voordeel voor podiumgebruik:** het pad meet dwars door een
niet-geleidend oppervlak. Een paneel van kunststof of glas van een paar
millimeter erover werkt gewoon. Geen gat in het front, spatwaterdicht
mogelijk.

### Waarom niet een bestaand USB-trackpad

Kort: in standaard HID-muismodus krijg je alleen **relatieve** delta's,
geen druk, en al toegepaste versnellingscurves. Dan is het een dure
encoder.

In Windows Precision Touchpad-modus krijg je wél absolute x/y,
contact-ID, tip switch, confidence, contactbreedte/-hoogte en een
scan-timestamp — typisch in 0,01 mm-eenheden bij 100–125 Hz. Maar:

- PTP-report-descriptors parsen op de Teensy is echt werk
- geen echte drukmeting; contactoppervlak schaalt wel met druk
  (niet-lineair maar monotoon, bruikbaar als je kalibreert)
- consumentenpads filteren en debouncen intern voor cursorgedrag en
  dat is niet uit te zetten — lekker voor een muispijl, sloom voor een
  filtersweep

| | USB-trackpad (PTP) | Cirque GlidePoint |
|---|---|---|
| Absolute XY | ja | ja |
| Druk | alleen via contactvlak | **echte Z** |
| Rate | 100–125 Hz | tot 300 Hz |
| Latency | USB-polling + interne filtering | direct over SPI |
| Werk | descriptor parsen | register lezen |
| Vingers | tot 5 | 1, of 2 in gesture |

**Aanbeveling:** bouw het kastje met een Cirque, en laat de Teensy
daarnáást PTP-pads accepteren als ze toevallig ingeprikt worden. Twee
bronnen, één modulatiepad in de Router.

## Controller: RP2040-Zero

Boven de originele Pico, om drie redenen:

1. **USB-C** in plaats van micro-USB. Die connector zit na een jaar
   podiumgebruik nog vast.
2. **18 × 23,5 mm** tegenover 21 × 51 mm. Er zijn vijf pinnen nodig
   voor de Cirque; de 20 GPIO's zijn ruim voldoende.
3. Reset-knop náást de boot-knop, plus een WS2812 RGB-LED aan boord —
   kleur als indicatie van de actieve modulatiemodus, zonder display.

Twee kanttekeningen: de Zero is castellated zonder headers (prettig
voor een definitief printje, lastig op breadboard), en heeft geen
blootliggende SWD-pads voor een debugger.

## Transport naar het brein

Bandbreedte is **geen** probleem. Vijf vingers met x, y en druk op
200 Hz bij 16 bits = 15 × 2 × 200 = **6 kB/s**.

| Optie | Snelheid | Oordeel |
|---|---|---|
| Klassiek MIDI | 3,1 kB/s | Bandbreedte krap maar haalbaar; echte bezwaar is 7-bits resolutie en MSB/LSB-paren die onderweg kunnen scheiden |
| CAN classic (`J16`, +12V op pin 1) | 125 kB/s | Ruim genoeg, differentieel, ruisimmuun, tientallen meters, **poort zit er al** |
| USB HID (`J23` USB-host) | 12 Mbit/s | Ruimst, één rapport = één samenhangend tijdmoment |
| SPI | — | Niet geschikt over langere afstand |

**Waarom CAN toch niet ideaal is:**

- **8 bytes per frame.** De volledige vingerstatus past er nooit in,
  dus splitsen over meerdere frames. Geen garantie dat x en y van
  dezelfde vinger uit hetzelfde tijdmoment komen — merkbaar als een
  lichte diagonale wobbel bij filtersweeps.
- **Prioriteitsinversie.** CAN arbitreert op ID; een continu spuitend
  trackpad geeft satellieten op dezelfde bus minder lucht. Oplosbaar
  met ID-toewijzing, maar het is werk.

**Aanbeveling:** USB HID primair, CAN als tweede optie voor lange
afstanden. Beide protocollen uit dezelfde RP2040-firmware is weinig
extra werk; dan beslis je later. USB is minder robuust in een vieze
podiumomgeving en heeft geen hot-plug-garanties tijdens optreden — dat
is het echte argument om CAN erin te houden.

## Signaalbewerking — belangrijker dan de sensorkeuze

Hier wordt het subtiel of niet.

**Vingerlift.** Als het contact wegvalt gaat de waarde naar nul en dat
is een pijnlijke sprong. Per parameter instelbaar maken:
vasthouden op de laatste waarde (cutoff), of geveerd terugvallen met
instelbare glijtijd (vibrato).

**Jitter.** Een capacitieve sensor ruist op de laatste bits. **One-euro
filter** is hier de juiste keuze boven een simpele laagdoorlaat: die
filtert hard bij stilstand en laat snelle gebaren ongeschonden door.
Dat is precies het verschil tussen "subtiel" en "traag".

**Ruimtelijke betekenis.** X en Y als twee losse CV's is de saaie
optie. Interessanter: **radius vanaf het midden = intensiteit, hoek =
karakter**. Dan is "terug naar het midden" een neutrale positie in
plaats van een hoek van het vierkant.

**Snelheid als derde as.** De hand levert gratis een extra dimensie:
bewegingssnelheid → korte modulatie-burst = accenten zonder extra
sensor.

## Integratie in het brein

Landt als generieke modulatiebron in de bestaande `Router` — geen
speciale behandeling, gewoon nieuwe bronnen die aan bestemmingen
gekoppeld worden. Dan werkt het meteen ook op de filterkaart en de
drumkaart.

## Openstaande vraag

**Waar is het pad voor: één parameter tegelijk heel expressief, of
vier dingen tegelijk grof?**

Dat bepaalt of je een grote Cirque met één vinger neemt en veel
investeert in de mapping-laag, of een PTP-pad met vijf contacten en
simpeler bewerking. Beslis dit vóór de sensorkeuze definitief wordt.

## Volgorde

1. Cirque op een RP2040-Zero, x/y/z uitlezen, ruwe waarden over USB
2. One-euro filter erop, kalibratie van z
3. Radius/hoek-mapping naast x/y, uitproberen op de MS-20-filter
4. Vingerlift-gedrag per bestemming
5. CAN-pad in dezelfde firmware
6. Kastje ontwerpen met paneel over de sensor

---

## Aanvulling na haalbaarheidsreview

### Samenvatting

Het instrumentconcept is haalbaar als absolute twee- of meerdimensionale
modulatiebron. De huidige onderdelen- en transportkeuze is nog niet
ontwerpvast. Met name de aanname dat een actuele Cirque-module echte druk
levert, is niet bevestigd. Ook zijn eigenschappen van oudere Pinnacle- en
actuele Gen6-modules in de oorspronkelijke tekst vermengd.

Eerst moet daarom het muzikale contract worden gekozen:

1. **XY of multitouch zonder echte krachtmeting:** een Cirque Gen6-module is
  een goede kandidaat. Contactoppervlak of capacitieve signaalsterkte kan
  eventueel als apparaat-afhankelijke pseudo-druk worden onderzocht.
2. **XY plus echte kracht:** voeg een afzonderlijke krachtsensor en een licht
  bewegende mechanische constructie toe. Een capacitieve Z-waarde mag niet
  zonder metingen als kracht in newton of als lineaire druk worden behandeld.

### Wat is een 6-polige FFC?

**FFC** betekent *Flat Flexible Cable*: een dunne, platte lintkabel waarin
koperen geleiders naast elkaar liggen. **6-polig** betekent dat de kabel zes
afzonderlijke elektrische contacten heeft. De kabel wordt meestal in een
kleine **ZIF-connector** (*Zero Insertion Force*) gestoken; een klepje of
schuifje klemt hem daarna vast.

Voor de actuele ronde Cirque Gen6-modules vermeldt de fabrikant een 6-polige
FFC-aansluiting en I²C als hostinterface. De exacte pinout moet uit de
datasheet van het gekozen onderdeelnummer komen. Waarschijnlijke functies
zijn voeding, massa, I²C-SDA, I²C-SCL en twee besturingssignalen, maar daarop
mag het PCB-ontwerp niet worden gebaseerd zonder die datasheet.

Bij selectie en inkoop ook vastleggen:

- aantal contacten en steek (*pitch*), bijvoorbeeld 0,5 of 1,0 mm;
- contacten aan dezelfde of tegenovergestelde zijde van de kabel;
- toegestane kabelrichting en minimale buigradius;
- vergrendeling en beschikbare trekontlasting;
- voedingsspanning en logicaniveau van alle zes signalen.

Een FFC is compact, maar niet bedoeld als extern podiumsnoer. Gebruik hem
alleen binnen de behuizing en ontlast hem mechanisch.

### Sensorcorrecties

Cirque verkoopt meerdere generaties met verschillende eigenschappen:

| Onderwerp | Oudere Pinnacle-modules | Actuele ronde Gen6-modules |
|---|---|---|
| Hostinterface | varianten met SPI of I²C | officieel I²C via 6-polige FFC |
| Rapportage | onder meer absolute rapporten met een Z-veld | PTP-achtige rapporten met X/Y, contact-ID, tip en confidence |
| Z/pressure | capacitieve maat, geen gekalibreerde kracht | standaard pressure niet aangetoond; voorbeeldcode noemt dit nog als TODO |
| Contacten/rate | afhankelijk van module en firmware | per exact onderdeel en firmwareversie verifiëren |

Daarom mogen `echte Z`, `tot 300 Hz`, `één vinger (of twee)` en `SPI of I²C`
niet als gecombineerde productspecificatie blijven gelden. Selecteer eerst één
exact onderdeelnummer en noteer daarvan:

- controller- en firmwarerevisie;
- aantal gelijktijdige contacten;
- reportvelden en resolutie;
- nominale en gemeten report rate;
- voedingsspanning, stroom en I²C-snelheid;
- actieve diameter en mechanische buitenmaten;
- toegestane overlaymaterialen en -diktes;
- leverbaarheid van module, FFC en connector.

### Overlay en ergonomie

Detectie door kunststof of glas is mogelijk, maar niet zonder meer door
"een paar millimeter" van elk materiaal. Gevoeligheid en jitter hangen af van
dikte, diëlektrische constante, lijmlaag, vocht, aarding, kalibratie en
controllerinstellingen. Een metalen frontpaneel mag het actieve sensorvlak
niet afschermen; gebruik daar een kunststof inzet of een niet-metalen
bovenzijde.

De grootste actuele ronde module is ongeveer 40 mm. Dat kan klein zijn voor
fijne XY-bediening zonder te kijken. Maak vóór het kastontwerp een 1:1 dummy
en test deze staand, met droge en vochtige vingers en eventueel met
handschoenen. Beoordeel ook of de rand goed voelbaar is zonder het actieve
vlak kleiner te maken.

### Controller en USB

De RP2040-Zero is geschikt voor een eerste I²C-naar-USB-prototype. Hij heeft
USB-C, voldoende GPIO en kan als USB-device een compact custom HID-report
versturen. Zijn USB 1.1 full-speed limiet is voor deze datastroom geen
probleem.

USB HID vraagt wel firmware aan beide kanten:

- de RP2040 definieert een stabiel report met versie, sequence number,
  sensortimestamp, contactstatus en samplewaarden;
- de Teensy 4.1 USB-host herkent dit report en zet het om naar CV-signalen;
- reconnect, ontbrekende samples en device reset krijgen expliciet gedrag;
- de USB-C-connector en kabel krijgen mechanische trekontlasting.

Ondersteuning voor willekeurige Windows Precision Touchpads is een apart
werkpakket. Daarvoor zijn descriptor parsing, verschillende reportlayouts,
multitouch-state en apparaatspecifieke tests nodig. Dit hoort niet in de
eerste prototypefase.

### CAN en voeding

De oorspronkelijke CAN-tabel gebruikt verkeerde eenheden: 125 kbit/s is
maximaal 15,625 kB/s vóór protocoloverhead, niet 125 kB/s. Belangrijker is
dat MusicBrain elders CAN-FD specificeert met 1 Mbit/s nominale fase,
5 Mbit/s datafase en maximaal 64 databytes. Een complete trackpadsample past
dan in één frame; de beschreven opsplitsing in 8-byteframes is alleen van
toepassing op Classic CAN.

De bestaande documenten zijn op dit punt nog niet onderling consistent:

- `J16` bestaat en voert CANH, CANL, GND en +12 V;
- de busboard gebruikt een SN65HVD230, formeel een Classic-CAN-transceiver;
- de systeemdocumentatie kiest CAN-FD en noemt daarvoor FD-geschikte
  controllers en transceivers.

Los deze systeemkeuze op voordat het satelliet-PCB wordt ontworpen. De
RP2040 bevat geen hardware-CAN-controller. Voor CAN-FD zijn bijvoorbeeld een
MCP2517FD/MCP2518FD plus FD-transceiver nodig, of een MCU met ingebouwde
FDCAN zoals een STM32G0B0/G0C1. Daarnaast zijn nodig:

- omzetting van J16 +12 V naar de benodigde 5 V en/of 3,3 V;
- beveiliging tegen ompoling, transiënten en foutieve USB-backfeed;
- correcte 120-ohm-terminatie alleen aan de twee fysieke busuiteinden;
- een bericht-ID, sequence number, timestamp en expliciet verliesgedrag.

USB blijft daarom het kortste prototypepad. CAN-FD wordt pas toegevoegd na
een systeemwijde beslissing over J16 en nadat USB end-to-end werkt.

### Integratie in MusicBrain

Continue modulatie hoort niet primair in de bestaande `Router`. Die verwerkt
discrete `InputEvent`s en produceert `OutputCommand`s. De modulatie-runtime
gebruikt `CvModule`, `CvGraph` en `CvBus`. Implementeer het trackpad daarom als
een CV-module met, afhankelijk van de gemeten sensorcapaciteiten, uitgangen
zoals:

- `x`, `y` en `touch`;
- optioneel `pressure` of explicieter `contact_area`/`signal_strength`;
- afgeleid `radius`, `angle` en `speed`.

De dynamische opbouw van de volledige CV-graph vanuit patchdata is nog niet
af. Voor het prototype is een hardcoded rack naar `cv`, `q_cv` en/of
`drive_cv` van de bestaande MS-20-module voldoende. "Werkt meteen op iedere
kaart" is pas waar nadat graph-opbouw, bronregistratie en patchpersistentie
zijn geïmplementeerd.

### Signaalbewerking en randgevallen

Een One Euro-filter is een goede kandidaat, maar moet worden gekozen op basis
van metingen. Vergelijk hem met een eenvoudige low-pass op stilstandsjitter,
staprespons en vertraging tijdens snelle gebaren. Bewaar bij voorkeur ook een
ongefilterde diagnostische stream.

Neem verder expliciet op:

- deadzone en hysterese rond het midden;
- onderdrukking of bevriezing van `angle` als `radius` bijna nul is;
- correcte hoek-wrapping bij de overgang van +π naar -π;
- snelheidsberekening met de sensortimestamp en begrenzing van uitschieters;
- afzonderlijke touch-on- en touch-off-events;
- liftgedrag per routingverbinding, zodat één bron voor de ene bestemming
  vasthoudt en voor een andere terugveert;
- geometrische kalibratie van midden, rand en eventuele X/Y-asymmetrie.

### Herziene prototypevolgorde

1. Kies één contact met echte kracht, of multitouch zonder echte kracht.
2. Selecteer en koop één exact Cirque-onderdeel plus passende FFC/ZIF-adapter.
3. Lees onbewerkte I²C-reports uit en leg velden, rate, latency, jitter,
  liftgedrag en aantal contacten vast.
4. Test minimaal twee overlaymaterialen en -diktes met een 1:1 ergonomische
  dummy.
5. Stuur de onbewerkte data via een geversioneerd custom USB-HID-report van
  RP2040-Zero naar Teensy 4.1.
6. Voeg op de Teensy een trackpad-`CvModule` toe en test X/Y en touch in een
  hardcoded rack op het MS-20-filter.
7. Voeg kalibratie, mapping, liftgedrag en gemeten filtering toe.
8. Beslis op basis van de proef of pseudo-druk voldoet of een afzonderlijke
  krachtsensor nodig is.
9. Beslis systeemwijd over Classic CAN of CAN-FD en ontwerp daarna pas het
  definitieve controller- en voedingsschema.
10. Ontwerp als laatste de podiumvaste behuizing en trekontlasting.

### Go/no-go voor het definitieve ontwerp

Ga pas van prototype naar custom PCB en behuizing als minimaal is aangetoond:

- stabiele detectie over de gekozen overlay en bij vochtige vingers;
- bruikbare resolutie en stilstandsjitter over het hele actieve vlak;
- voldoende lage end-to-end latency voor snelle filtersweeps;
- voorspelbare recovery na vingerlift, USB-reconnect en sensorreset;
- ergonomisch bruikbare diameter zonder visuele controle;
- een reproduceerbare expressieve derde as, of een bewust besluit die weg te
  laten;
- een vastgelegd USB-report en een gekozen, elektrisch kloppende CAN-strategie.
