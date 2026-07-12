# Guitar Effect Switcher — ontwerp-spec (BRAIN + LOOP8-keten)

**Status**: voorstel v0.1 — 2026-07-11
**KiCad-referentie**: nog te bouwen (`hardware/schematics/gswitch-brain/`, `hardware/schematics/gswitch-loop8/`)

Dit document is de leidende definitie voor de gitaar-effect-switcher: één
"brain"-kastje (ESP32-S3) dat een keten van relais-kastjes aanstuurt die
verspreid over het pedalboard staan. Zelfde principe als `doc/spi-bus-spec.md`:
dit document is de bron van waarheid, de borden valideren ertegen.

## Architectuur

```
12V DC (pedaal-PSU) ──► BRAIN (ESP32-S3 + OLED + knoppen + WiFi/BLE/MIDI)
                           │
                           │ CHAIN-bus (afgeschermde RJ45/Cat5, 12V + stuursignalen)
                           ▼
        ┌────────────┐  RJ45  ┌────────────┐  RJ45  ┌────────────┐
        │ LOOP8 #1   │───────►│ LOOP8 #2   │───────►│ LOOP8 #3…  │
        │ loops 1-8  │        │ loops 9-16 │        │ loops 17+  │
        └────────────┘        └────────────┘        └────────────┘

gitaar ─jack─► [IN] LOOP8#1 [THRU] ─jackkabel─► [IN] LOOP8#2 [THRU] ─► versterker
```

Kernbeslissingen (onderbouwing verderop):

1. **Eén LOOP8-ontwerp, geen variant I/II.** Elk bord heeft een CHAIN-IN- en
   CHAIN-THRU-connector; de "ontvanger" is twee goedkope buffer-IC's (< €0,50).
   Eén ontwerp = één generator = één fab-order. Bord #1 in de keten is
   gewoon hetzelfde bord.
2. **Audio tussen kastjes over gewone jackkabels** (IN/THRU-jack per bord),
   níét door de RJ45. Het audiopad blijft dan volledig passief metaal: als de
   digitale keten uitvalt of een RJ45 losraakt, blijft er geluid. Ook nul
   risico op digitale overspraak in de kabel. (Optie om audio tóch over het
   vrije RJ45-paar te jumperen is beschreven bij "Open punten".)
3. **Non-latching relais, bypass op het NC-contact.** Stroom weg (kabel eruit,
   brain dood, PSU uit) ⇒ alle relais vallen af ⇒ álles bypass ⇒ gitaar → amp
   werkt altijd. Dit is precies waarom non-latching hier de juiste keuze is;
   het spoelvermogen (≈ 95 mA per bord bij alles aan) is verwaarloosbaar.
4. **Relais-spoelen direct aan de busspanning, relaisborden volledig
   lineair.** Geen schakelende regelaar in de audio-kastjes; alleen een 78L05
   voor de logica (enkele mA). Alle bucks en RF zitten in het brain-kastje,
   waar geen audio loopt. De busspanning is **9V óf 12V, per bestukking**
   (spoelvariant), default 12V (zie "Voeding").
5. **Geografische adressering door ketenpositie** — zelfde filosofie als de
   CS-per-slot op het busboard: een LOOP8-bord heeft geen adresjumpers, zijn
   plek in de daisy-chain bepaalt welke bits het krijgt.

## De loop-cel (8× per LOOP8-bord)

Per loop één **DPDT-signaalrelais** (2× wisselcontact) plus SEND- en
RETURN-jack:

```
                       K_n (12V, non-latching, 2 Form C)
                 ┌──────────────────────────────────┐
 node_in ────────┤ COM1        NO1 ├──── SEND-jack tip
 (vorige loop    │              NC1 ├──┐
  of IN-jack)    │                  │  │ bypass-node
                 │              NC2 ├──┘
 node_out ───────┤ COM2        NO2 ├──── RETURN-jack tip-contact
 (volgende loop  └──────────────────────────────────┘        │
  of THRU-jack)         RETURN-jack schakelcontact ───────────┘
                        (genormaliseerd naar SEND-tip)
```

- **Relais af (bypass)**: `node_in → NC1 → NC2 → node_out`, en de SEND-jack is
  losgekoppeld — een effect met lage ingangsimpedantie of een ruisende
  high-gain-ingang belast het signaal dan óók niet ("tone sucking" voorkomen).
  NB: één DPDT-relais = "echt overschakelen": beide draden (naar effect-in én
  van effect-uit) zijn in bypass volledig los. De enige meerwaarde van een
  twééde relais per loop zou zijn om de losgekoppelde SEND-tip actief aan
  audio-GND te leggen tegen capacitieve lek over de open contacten (~1 pF)
  bij extreme high-gain-effecten; v1 vangt dat af met de 1 MΩ-bleeders en
  layout (aardvlak tussen send- en return-sporen). Bewuste afweging.
- **Relais aan (loop actief)**: `node_in → SEND → effect → RETURN → node_out`.
- **RETURN-jack mét schakelcontact**, genormaliseerd naar de SEND-tip: geen
  kabel in de loop ⇒ signaal loopt tóch door, ook als de relais per ongeluk
  aan staat. (De SEND-jack heeft geen schakelcontact nodig.)
- **1 MΩ bleed-weerstanden** van SEND-tip en RETURN-tip naar audio-GND: lekt
  DC-offset van effecten weg vóór het schakelmoment ⇒ minder plop.
- Alle sleeves aan **AUDIO-GND** (apart net, zie EMC-plan).

Schakelen gebeurt zelden (tussen nummers, soms erin); een relaisklikje plus
eventuele rest-plop van DC-houdende effecten is geaccepteerd. Een mute-relais
op de THRU-uitgang is een mogelijke v2-optie, geen v1-scope.

### Relais-keuze

| Type | Spoel | Opmerking |
|---|---|---|
| Panasonic TQ2SA-xx | 12V of 9V / 140 mW | Japanse referentieklasse; SMD-variant (TQ2SA) i.v.m. JLC-SMT |
| Kemet EC2-xxSNU | 12V of 9V / 140 mW | ex-NEC/Tokin, zelfde klasse en footprint-familie als TQ2 |
| **Hongfa HFD4/xx-S** (voorkeur voor PCBA) | 12V of 9V / 140 mW | degelijke Chinese tegenhanger, goed op voorraad bij JLC (Extended) |

Kwalitatief: Panasonic/Kemet hebben de strakste specs en het langste
trackrecord in audio-switchers; Hongfa heeft dezelfde constructie (verguld,
hermetisch dicht, bifurcated contacten) met ruimere toleranties — voor dit
gebruiksprofiel (zelden schakelen, droog laag-niveau signaal) volwaardig.
Vergulde contacten zijn juist bedoeld voor droge, laag-niveau signalen zoals
gitaar (geen inbrand nodig zoals bij vermogensrelais); dát is de eigenschap
die telt en alle drie hebben hem.

Assemblage: **SMD-variant kiezen** (HFD4-S / TQ2SA), dan soldeert JLC ze mee
in de gewone SMT-run; THT-relais zouden een handsoldeer-fee kosten. HFD4 zou
TQ2-footprint-compatibel zijn — bij de footprintkeuze verifiëren, footprint
zo tekenen dat alle drie passen. LCSC-nummers matchen via `jlc_fix.py` —
de lokale JLCPCB-database was leeg bij het schrijven; **false matches
checken** zoals in het order-recept.

## CHAIN-bus (RJ45, daisy-chain)

### Waarom een domme schuifregister-keten (en geen RS-485 + MCU per bord)

- Schakelen is zeldzaam en traag ⇒ we kunnen de klok extreem langzaam maken
  (~10 kHz). Robuustheid komt van afgeschermde kabel, Schmitt-triggers per
  bord, RC-filtering en **her-buffering per hop** (elke verbinding is
  point-to-point, nooit een lange multidrop-lijn).
- Geen firmware op de relaisborden ⇒ niets te flashen, niets dat uit sync
  raakt, bord is een passief "verlengstuk" van de brain.
- De keten geeft **gratis verificatie en auto-detectie**: DATA komt aan het
  eind terug (DATA_RET). De brain schuift een testpatroon door de hele keten
  en telt hoeveel klokken het duurt voor het terugkomt ⇒ aantal borden bekend,
  en bit-voor-bit-integriteit gecontroleerd.
- Upgrade-pad als het in de praktijk tóch stoort: RS-485-transceivers per lijn
  zijn pin-compatibel in te passen in een v2; de RJ45-bekabeling blijft gelijk.

### RJ45-pinout (T568B-paren, S/FTP-kabel verplicht)

| Pin | Paar | Functie | | Pin | Paar | Functie |
|----:|---|---|---|----:|---|---|
| 1 | oranje | **CLK** | | 5 | blauw | GND |
| 2 | oranje | GND | | 6 | groen | **DATA_RET** (upstream) |
| 3 | groen | **DATA** (downstream) | | 7 | bruin | **LATCH** |
| 4 | blauw | **+12V** | | 8 | bruin | **EN** |

- CLK krijgt zijn eigen GND in het paar (kritiekste lijn); DATA en DATA_RET
  delen een paar (zelfde bus, lage snelheid); +12V/GND als voedingspaar;
  LATCH en EN zijn traag en zwaar RC-gefilterd.
- **Kabelscherm → chassis** aan beide kanten (direct), chassis ↔ CTRL-GND
  hybride (zie EMC-plan).
- Alle signaallijnen: 100 Ω serie + TVS (PESD5V-klasse) bij elke connector;
  hot-pluggen mag.
- Signaalniveau **5V-logica** op de kabel (betere ruismarge dan 3V3); de brain
  vertaalt met 74HCT14 (12V→5V-buck zit tóch al op de brain).

### Logica per LOOP8-bord

```
RJ45-IN ─► 74HC14 (2× inverterend = herstelde flanken)
   CLK  ──► 595 SHCP ─────────────► gebufferd naar RJ45-THRU
   LATCH ─► 595 STCP (RC ~1 µs)───► gebufferd naar THRU
   EN   ──► 595 /OE (geïnverteerd + pull-up naar 5V) ─► gebufferd naar THRU
   DATA ──► 595 DS;  595 QH′ ────► DATA op THRU  (bitvolgorde klopt vanzelf)
   DATA_RET (van THRU) ─► buffer ─► DATA_RET op IN
                                    └ jumper "TERM": op het láátste bord
                                      verbindt QH′ → DATA_RET (keten-lus dicht)

74HC595 (5V) ──► ULN2803A ──► 8 relaisspoelen naar +12V
                  └ COM-pin aan +12V = ingebouwde vrijloopdiodes
78L05 (van +12V) voedt 74HC14 + 74HC595 — géén SMPS op dit bord
```

- **EN als hardware-veiligheid**: pull-up houdt /OE hoog (uitgangen tri-state,
  relais af = alles bypass) tot de brain EN actief maakt. Brain-reset, kabel
  eruit of brain-crash ⇒ keten valt terug op bypass.
- ULN2803-uitgangen hebben 10 kΩ pulldown op de 595-lijnen zodat een
  zwevende 595 (75L05 traag op) nooit spoelen bekrachtigt.

### Protocol (firmware-kant, samenvatting)

- Toestand = bitmap van N×8 bits; MSB-first, het verste bord eerst. Shift
  alles, dan één LATCH-puls ⇒ alle relais in de hele keten schakelen op
  hetzelfde moment (analoog aan LDAC op de CV-bus).
- **Stil op de kabel buiten schakelmomenten** — geen continue refresh, dus ook
  geen periodiek digitaal signaal naast het audio. Verificatie-shift (met
  DATA_RET-vergelijking) op momenten dat het mag klikken: bij boot, na elke
  preset-wissel, en op verzoek.
- Auto-detect bij boot: patroon rondpompen via DATA_RET ⇒ aantal borden.

### Hoeveel kastjes in één keten?

Elektrisch is de keten praktisch onbegrensd: elke hop wordt op het bord
opnieuw gebufferd (point-to-point, geen multidrop), dus signaalkwaliteit
stapelt niet op, en het protocol schaalt gewoon mee (32 borden × 8 bits op
10 kHz = < 30 ms per update). De echte grens is de **voedingsstroom**:

| PSU-uitgang (12V) | Kastjes worst-case (álle relais aan) | Loops |
|---|---|---|
| 500 mA | 3 (brain ~130 mA + 3 × 95 mA ≈ 415 mA) | 24 |
| 1 A | 8 (≈ 890 mA) | 64 |

- Worst-case = alle relais tegelijk bekrachtigd; in de praktijk staat maar
  een deel van de loops aan, dus dit is conservatief.
- Kabelval: het eerste segment draagt de som van alles erachter. Cat5-ader ≈
  0,084 Ω/m; zelfs 4 kastjes × 95 mA over 3 m ≈ 0,2 V — verwaarloosbaar op
  12V-spoelen. Bij de **9V-spoelvariant** is de marge kleiner: keten kort
  houden (≤ 3 kastjes) of dikkere voedingsaders nemen.
- Realistisch pedalboard: 2–3 kastjes (16–24 loops). Ontwerp-envelope: 8.

## Voeding

- **DC-in 2,1 mm barrel, center-negatief** (pedaalvoeding-conventie). Eis:
  een **geïsoleerde 12V-uitgang ≥ 1 A** op de pedalboard-PSU (klantbesluit
  2026-07-12; rig groeit voorbij 32 loops).
- Budget: 16 relais aan = ~190 mA; ESP32-S3 met WiFi ≈ 100 mA (op 12V
  gerekend); display + logica ≈ 30 mA ⇒ **< 350 mA totaal**.
- **9V of 12V: allebei mogelijk, per bestukkingsvariant.** De relaisspoelen
  hangen direct aan de buslijn; je kiest de spoelvariant (TQ2/HFD4 bestaan in
  9V én 12V) passend bij de voeding. 12V geeft geen storingsvoordeel, wel
  méér marge: na de ULN-drop (~1V) en kabelverlies houdt een 12V-spoel ruim
  spanning over, een 9V-spoel zit op ~8V bij must-operate ~6,8V — werkt, maar
  krapper. **Default = 12V**; brain-buck en 78L05 slikken beide. Niet mixen
  binnen één rig (één busspanning voor de hele keten).
- Beveiliging op de brain: serie-P-FET (omgekeerde polariteit), polyfuse,
  TVS-diode. De relaisborden krijgen 12V via de RJ45 en hebben alleen de
  78L05 + bulk-elco (100 µF) per bord.

## EMC- en aarding-plan (buizenbakken naast digitaal)

Het buitenboord-scenario: analoge (buizen)effecten met strooivelden érnaast,
en omgekeerd mag onze digitale kant niet in het gitaarsignaal lekken.

1. **AUDIO-GND en CTRL-GND zijn op het LOOP8-bord volledig gescheiden
   netten.** Dit kan omdat relaiscontacten galvanisch gescheiden zijn van de
   spoel — het audiopad heeft de stuurlogica-referentie helemaal niet nodig.
   Gevolg: de RJ45-GND vormt géén aardlus met de audio-jackkabels tussen de
   kastjes.
2. Per kastje: **AUDIO-GND → chassis op één punt** (ster, bij de IN-jack);
   **CTRL-GND → chassis hybride** (100 nF ∥ 1 MΩ); **RJ45-scherm → chassis
   direct**. Voetprint met jumperopties zodat dit in de praktijk bij te
   stellen is zonder respin.
3. **Geen SMPS en geen RF in de audio-kastjes** (beslissing 4 hierboven);
   alles wat schakelt of zendt zit in de brain, die geen audio bevat.
4. **Kabel stil buiten schakelmomenten** (protocol hierboven): op het moment
   dat er wél geschakeld wordt, klikt de relais toch al hoorbaar.
5. Tegen 50 Hz-strooivelden van buizentrafo's: klein lusoppervlak — doorlopend
   AUDIO-GND-vlak onder de signaalsporen, bypass-node kort houden, relais in
   één rij tussen de send- en return-jackrijen; en de kastjes zijn staal
   (afscherming zit in de eis "ijzeren kastje" al ingebakken).
6. Jacks geïsoleerd van het frontpaneel monteren is níét nodig zolang punt 1/2
   gerespecteerd worden (sleeves = AUDIO-GND = chassis-sterpunt).

## Bord 1: `gswitch-loop8` (relais-kastje)

- **8× gestapelde dubbele jack Amphenol ACJS-MHD** op de **lange rand**: per
  loop SEND boven / RETURN onder naast elkaar in de rij — logisch voor de
  gebruiker, want de effectkastjes staan náást de relaisbox.
- **AUDIO-IN en AUDIO-OUT als enkele jacks op de korte randen** (IN links,
  OUT rechts): de uitgang zit ná de laatste relais toch al aan de andere
  kant van het bord, en de keten (audio én RJ45) loopt zo links→rechts.
- EMC-noot bij stapelen: send en return van dezelfde loop zitten ~12 mm boven
  elkaar; audio-GND-vlak/spoor tussen de twee tip-sporen op de print houdt
  terugkoppel-lek rond een high-gain-pedaal weg.

### Jack: Amphenol ACJS-MHD (gekozen 2026-07-11)

Datasheet + SamacSys-library staan in `doc/data-sheets/double jack/`
(KiCad-symbol en -footprint `ACJSMHD.kicad_mod`, legacy-formaat — bij import
naar de projectlib converteren). Footprint is **geverifieerd tegen de
maattekening**: pinnenraster 6,35 mm, rijafstand 11,4 mm,
schakelpin-offset 3,25/0,55 mm, boringen Ø1,4 mm, M2-montagegat als pad 13 —
klopt allemaal.

- **Stereo (TRS), álle drie de contacten hebben een verbreek-schakelcontact.**
  Pintoewijzing (afgeleid uit het 600 dpi-gerenderde schema op de tekening +
  de Amphenol-catalogusconventie: gebogen veerlijn = plugcontact, recht
  stompje = verbreekcontact "N"; contacten liggen in de pinrij aan de
  paneelkant, verbreekcontacten in de achterste rij):

  | Jack | T | TN | R | RN | S | SN |
  |---|---|---|---|---|---|---|
  | BOTTOM | 6 | 3 | 5 | 2 | 4 | 1 |
  | TOP | 12 | 9 | 11 | 8 | 10 | 7 |

  Verificatie op het echte onderdeel (doorpiepen: zonder plug is T–TN
  gesloten) blijft goedkope verzekering vóór de fab-order, maar blokkeert
  het PCB-ontwerp niet.
- Gebruik per loop (SEND = TOP, RETURN = BOTTOM): RETURN-TN (pin 3) →
  SEND-T (pin 12): normalisering "geen kabel = doorgeven". SEND-TN (pin 9)
  **niet aansluiten** (aan GND leggen zou het signaal kortsluiten zodra de
  send-kabel ontbreekt terwijl de loop actief is). **R en S van beide jacks
  aan audio-GND** (RN/SN mogen mee): TS-pluggen maken dan dubbel
  massacontact; een per ongeluk gebruikte TRS-kabel wordt gewoon mono —
  prima.
- Mechanisch: courtyard 18,6 mm breed ⇒ **19 mm pitch** past; body 24 mm diep
  op de print, schroefdraad steekt ~9,5 mm buiten de bordrand door het paneel
  (moeren + fiber rings meegeleverd), paneel-cutout 2× Ø11,4 mm, 16,55 mm
  h.o.h. verticaal; optioneel M2-zelftapper via het montagegat.
- Inkoop via Mouser (ACJS-MHD); zit niet bij LCSC — jacks soldeer je toch
  zelf, net als bij de andere borden.

### Alternatief overwogen: Neutrik NSJ12HC (footprint is NIET gelijk)

Vergelijking op basis van de officiële tekening (ST-NSJ12HC, in scratchpad
bekeken 2026-07-12):

| | Amphenol ACJS-MHD | Neutrik NSJ12HC |
|---|---|---|
| Prijs | ~€2,50 @ 25+ | ~€5 |
| Mating cycles | 1.000 | 10.000 |
| PCB-gaten | 12× Ø1,4 op 6,35mm-raster | 13× Ø1,5, eigen patroon (o.a. 1,73/7,78/14,13/20,48 vanaf paneel) + aparte **G-pin** (chassis) |
| Paneel | 2× Ø11,4 @ 16,55, moeren | 2× Ø9,3 @ 16,5 + Ø3,2 middengat (M3-schroef, meegeleverd) |
| Pinnamen | T/TN/R/RN/S/SN (afgeleid) | expliciet op tekening: TT/TB, RT/RB, ST/SB + TNT/TNB, RNT/RNB, SNT/SNB |
| Diepte op print | 24 mm body | 24,3 mm |

Zelfde nozzle-afstand (16,5 mm) en vergelijkbare diepte, maar **pin- en
paneelpatroon zijn onverenigbaar** — een wissel is dus een andere PCB én een
ander frontpaneel. Een combi-footprint (beide gatenpatronen over elkaar,
zelfde netten) kan technisch, maar geeft ~25 gaten per positie en per variant
alsnog een eigen paneel; alleen doen als de verkoop-optie het echt vraagt.

**Advies: ACJS-MHD.** Effect-loops zijn semi-permanente bekabeling; 1.000
cycles is bij wekelijks ompatchen ~20 jaar. De Neutrik wint pas bij dagelijks
herpluggen of als merknaam/G-pin/schroefmontage zwaar wegen voor een
verkoopproduct — dat is een klantbeslissing, geen technische.
- 8× DPDT-relais in één rij achter de jacks, spoelzijde van de jacks af.
- Korte randen: links AUDIO-IN + RJ45 CHAIN-IN, rechts AUDIO-OUT + RJ45
  CHAIN-THRU; verder 74HC14, 74HC595, ULN2803A, 78L05, TERM-jumper,
  chassis-jumpers.
- Geschat formaat: **~165 × 50 mm** bij ~19 mm pitch per stapelpaar — exacte
  maat volgt uit het jack-datasheet (zie "Open punten").
- Kastje: gezette staalplaat of ruim 1590-achtig; Hammond kan maar hoeft niet.
  Alle jacks steken door één wand, de RJ45's door de zijwanden.

### Standaardkastje = 16 loops (2× loop8-print)

De print blijft de 8-loops-eenheid; een 16-loops-kastje bevat er twee naast
elkaar (klantwens: liever grote dan kleine kastjes; hij zit nu al boven de
24 loops). Daarvoor krijgt de print twee interne koppelopties, beide als
bestukkingskeuze naast de gewone connectoren:

- **Audio-doorlink**: soldeerpads/JST parallel aan de AUDIO-OUT- en
  AUDIO-IN-jack, zodat bord 1 → bord 2 intern met een kort afgeschermd
  draadje gaat en die twee jackposities onbestukt kunnen blijven (of juist
  bestukt als extra patchpunt).
- **Chain-doorlink**: 2×4-headerpads parallel aan de RJ45 (CLK, DATA,
  DATA_RET, LATCH, EN, +12V, 2×GND) voor een korte interne verbinding;
  de tweede print heeft dan alleen zijn RJ45-THRU naar buiten.

Zo bestaat elk kastje (8, 16 of desnoods 24 loops) uit dezelfde print, en
blijft de keten-logica identiek: de brain ziet gewoon N×8 bits.

## Bord 2: `gswitch-brain` (stuur-kastje)

- **ESP32-S3-WROOM-1U** (de **-1U**-variant heeft U.FL i.p.v. printantenne —
  verplicht, want ijzeren kast) → pigtail naar **SMA-bulkhead** op de kast.
- 12V-in met beveiliging (zie Voeding); buck 12→5V; LDO 5→3,3V.
- **2× CHAIN-poort** (CHAIN A/B, elk eigen 74HCT14-buffers): linker- en
  rechterhelft van het pedalboard hoeven dan niet met één lange kabel rond.
  B onbestukt laten kan altijd.
- Headers (draadjes naar de kastwand mogen): **2,42″ OLED 128×64 (SSD1309,
  I²C)** — zelfde driverfamilie als de kleine SSD1306 maar groot genoeg om
  het programmanummer op het podium af te lezen; header blijft
  pin-compatibel met de kleine 0,96″-modules. Verder 4 drukknoppen + rotary
  encoder en status-LED. Bediening is bewust rudimentair: mode kiezen
  (WiFi/USB/handmatig door programma's klikken); programmeren gaat via de
  webinterface.
- **USB-C** op de S3 native poort: eerste flash + debug. Daarna updates via
  **WiFi-OTA** (`esp_https_ota`/ArduinoOTA) — standaard S3-functionaliteit,
  inplannen in de firmware vanaf dag één (OTA-partitietabel).
- **MIDI IN én OUT, standaard bestukt** (IN: H11L1-opto; OUT: buffertje +
  220 Ω; **DIN**, klantbesluit): aansturing vanaf een MIDI-floorboard, en de brain
  stuurt parallel aan het relais-schakelen zelf PC/CC-messages naar de
  MIDI-effecten op het board. BLE-MIDI kan daarnaast gratis via de S3.
- Geschat formaat: ~80 × 60 mm.

## Bediening (firmware-schets, buiten scope van de borden)

- Presets = bitmaps (loops aan/uit), bankjes per song; knoppen + OLED voor
  rudimentaire bediening; WiFi/BLE voor een editor; MIDI PC → preset.
- Schakelvolgorde: alles in één LATCH ⇒ geen tussentoestanden.

## Besloten (klant-overleg 2026-07-12)

- **Audio tussen kastjes via jackkabels** — bevestigd.
- **Standaardkastje = 16 loops** (2× loop8-print intern gekoppeld, zie
  loop8-sectie); klant heeft er nu 24 en dat is te weinig ⇒ **PSU-eis: 12V
  geïsoleerd ≥ 1 A** (dekt tot 64 loops).
- **12V definitief** (beter tegen spanningsval over afstand).
- **MIDI via DIN** (IN + OUT).
- **Display groter**: 2,42″ OLED — programmanummer moet op het podium
  afleesbaar zijn; programmeren gaat via de webinterface.
- **Stroomuitval/kabel los = alles bypass** — bevestigd ("liever alles door
  dan alles stil; elk pedaal heeft nog z'n eigen bypass-knop").
- **Geen mute-schakeling** — bevestigd ("liever een klik dan een gat in je
  geluid").

## Besloten (overleg 2026-07-11)

- **Jacks gestapeld: Amphenol ACJS-MHD** (stereo dual, alle contacten
  geschakeld; library in `doc/data-sheets/double jack/`), send/return per
  loop naast elkaar op één rand — geen send-voor/return-achter. IN/OUT als
  enkele jacks op de korte randen.
- **9V of 12V per bestukkingsvariant**, default 12V; geen storingsverschil,
  wel meer marge op 12V.
- **MIDI IN + OUT standaard bestukt** (naast schakelen ook PC/CC versturen).
- **Eén relais per loop** (DPDT = echt overschakelen, beide draden los in
  bypass); send-aarding via extra relais bewust niet in v1.
- **USB-C voor eerste flash; daarna WiFi-OTA.**

## Open punten (beslissen vóór KiCad-bouw)

1. **Jack-merk definitief: ACJS-MHD of Neutrik NSJ12HC** — klantbeslissing
   (kosten vs. mating cycles/verkoopproduct, zie jack-sectie). Footprints
   zijn onverenigbaar, dus dit moet vóór het PCB-ontwerp vaststaan.
   Advies: ACJS-MHD.
2. **Enkele 6,35 mm-jack kiezen** voor AUDIO-IN/OUT (laag risico; logisch is
   dezelfde familie als de dubbele: Amphenol ACJS-MH-klasse resp. Neutrik
   NSJ-serie). ACJS-MHD-pintoewijzing is uit de tekening opgelost;
   doorpiepen op het echte onderdeel vóór de fab-order blijft goedkope
   verzekering.
3. **Relais-merk definitief** na `jlc_fix.py`-check op voorraad/prijs
   (HFD4-S verwacht als winnaar voor PCBA); footprint zo tekenen dat
   TQ2SA/EC2/HFD4-S alle drie passen.

## Volgende stappen

1. Open punten 1–4 beslissen (jack-footprint is de enige harde blokkeerder).
2. `gen_gswitch_loop8.py` en `gen_gswitch_brain.py` in de bestaande
   generator-stijl (`schlib.py`/`seslib.py`), met de bekende validatieloop:
   ERC 0 → netcheck → DRC 0/0 → fab-pakket + JLC-BOM via `jlc_fix.py`.
3. Bestelstrategie zoals het order-recept: eerst kale PCB's + 1× bestukt
   proto-paar (1 brain + 1 loop8), relais pas in volume na audio-validatie
   (klik/plop/overspraak-test naast een buizenamp).
