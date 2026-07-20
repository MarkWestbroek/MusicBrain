TITEL: analoge patch matrix
# inleiding
om analoge signalen (lees: 8xpolyfone audiolijnen van de VCO naar de VCF of eerst naar een 8xwavefolder, daarna ofwel naar de 8xVCA of eerst naar een 8xringmodulator) persisten te kunnen patchen (dwz de patch te kunnen opslaan en weer in te kunnen stellen met de druk van een knop (via de brain)) is een patchmatrix nodig.

Daarvoor had ik al wat vooronderzoek gedaan en de MT8816 kwam er gunstig uit qua prijs en specs. Is alleen niet heel compact.

Ik geef eerst het onderzoek hier weer.

# vooronderzoek met gemini
## vraag 96x96
om audio te schakelen (patchen) zijn er analoge switchboard chips. Wat zou dit apparaat https://www.thomann.nl/flock_audio_patch_xt.htm mogelijk gebruiken?
## antwoord
Een 96 x 96 analoge matrix (wat neerkomt op maar liefst **9.216 unieke kruispunten** of *crosspoints*) die ook nog eens "pro-audio" transparant moet zijn, is inderdaad een bizar knap staaltje engineering. Flock Audio houdt het exacte type chip dat ze gebruiken onder een gepatenteerd geheim ("Patented Flock Audio Matrix Technology"), maar in de high-end audiowereld en broadcasting zijn er eigenlijk maar een paar manieren om dit op te lossen.

Als je zelf zoiets zou willen bouwen (of wilt begrijpen hoe de *Patch XT* dit doet zonder AD/DA-conversie en met behoud van fantoomvoeding), kijken we naar de volgende chips en ontwerpstrategieën.

---

### De "Geheime" Chips: Crosspoint Switch Matrices

In plaats van losse analoge switches (zoals een CD74HC4051) te gebruiken, maken apparaten zoals de Flock Audio Patch gebruik van dedicated **Digitally Controlled Analog Crosspoint Switches**. Dit zijn gigantische matrices op één enkele silicium chip.

De absolute koning op dit gebied is **Analog Devices (ADI)**. De kans is extreem groot dat Flock Audio chips gebruikt uit de **AD750xx**- of **ADG21xx**-serie, of de grotere telecom/video-matrices:

1. **Analog Devices ADG2128 (12 x 8 Matrix):**
Dit is een volledig analoge matrix met een $I^2C$-interface. Hij is ontworpen voor high-fidelity signalen en heeft een zeer lage *On-Resistance* ($R_{\text{on}}$ van ca. 35 Ohm) en minimale vervorming.
2. **Analog Devices ADV3205 (40 x 40 Matrix):**
Hoewel officieel ontworpen voor high-speed video (routing van video-componenten), worden dit soort chips vanwege hun gigantische bandbreedte en extreem lage overspraak (*crosstalk* van <-60dB) ook misbruikt in high-end audio routing.
3. **De "Oude Garde" - Mitel/Zarlink (MT8816 - 8 x 16 Matrix):**
Dit is de absolute klassieker. Veel oudere digitaal gestuurde analoge gitaar-switchers en mengpanelen gebruik die chips. Ze klinken fantastisch transparant, maar hebben één nadeel: ze draaien vaak op een lagere voedingsspanning, waardoor je headroom (clipping-limiet) beperkt is.

---

### Hoe kom je aan 96 x 96? (De Cascadering)

Er bestaat geen commercieel verkrijgbare losse chip die in zijn eentje 96 ingangen naar 96 uitgangen kan schakelen. Flock Audio lost dit op door chips te **cascaderen** (als een grid aan elkaar te knopen).

Als je bijvoorbeeld de **ADG2128** (12x8) als bouwsteen gebruikt:

* Om van 12 ingangen naar 96 uitgangen te gaan, heb je al $12 \times \text{ADG2128} = 12$ chips nodig.
* Om dit uit te breiden naar 96 *ingangen*, moet je die matrix verticaal en horizontaal vermenigvuldigen.
* Voor een volledige non-blocking 96x96 matrix heb je al snel tientallen van deze hoogwaardige IC's op één PCB nodig.

---

### Waarom is dit "Pro Audio" kwaliteit?

Normale goedkope analoge switches (zoals CMOS-switches uit de 4000-serie) hebben een variabele interne weerstand die verandert met de hoogte van de audiospanning. Dit veroorzaakt hoorbare harmonische vervorming (THD). De chips die Flock Audio gebruikt, tackelen dit op drie manieren:

#### 1. Extreem vlakke On-Resistance ($R_{\text{on}}$ flatness)

De interne FET-switches in high-end ADI-chips zijn zo ontworpen dat hun weerstand exact gelijk blijft, of er nu $+10\text{V}$ of $-10\text{V}$ doorheen fietst. Dit houdt de THD (vervorming) ver onder de $0,001\%$.

#### 2. Buffering (Op-Amps overal)

Een analoge switch houdt niet van "load" (belasting). Als je een gitaar of microfoon direct in de switch prikt, stort de impedantie in. De Patch XT zit daarom waarschijnlijk vol met **high-end op-amp buffers** (zoals de OPA2134 of Burr-Brown equivalenten) op *elke* ingang en *elke* uitgang. De switch-matrix zelf zit veilig ingekapseld tussen deze buffers, waardoor het signaal 100% transparant blijft en er geen signaalverlies (impedantie-drop) optreedt bij het splitten (*multing*) van signalen.

#### 3. Fantoomvoeding (+48V) Beveiliging

Dit is de grootste uitdaging. Geen enkele analoge switch-chip overleeft $+48\text{V}$ fantoomvoeding rechtstreeks op zijn pinnen; ze werken intern meestal op $+/-12\text{V}$ of $+/-15\text{V}$. Flock Audio heeft dit gepatenteerd opgelost: de $+48\text{V}$ wordt waarschijnlijk via aparte analoge relais of speciaal ontworpen ontkoppel-circuits vóór de matrix-chip geïnjecteerd of geblokkeerd, aangestuurd door hun software.

### Kan JLCPCB dit assembleren?

Als je zelf een kleinere variant wilt ontwerpen (bijvoorbeeld een 16x16 of 32x32 voor je modulaire synth/studio):

* De **ADG2128BCPZ** (LFCSP-package) of vergelijkbare matrix-chips van Analog Devices zijn **beschikbaar bij JLCPCB** (vaak als Extended Component).
* JLCPCB kan deze probleemloos voor je plaatsen via hun PCBA-service.
* Omdat de routing rondom zo'n matrix extreem compact is om overspraak (storing tussen de kanalen) te voorkomen, is het wel een must om een 4-laags PCB te ontwerpen met fatsoenlijke *ground planes* tussen de audiosporen.

## vraag verschil tussen chips
hoe verhoudt de CD22M3494E zich tot bijv. de ADG2128?

## antwoord
De **CD22M3494E** (oorspronkelijk van Harris/RCA, nu geproduceerd door Renesas/Intersil) en de **ADG2128** van Analog Devices zijn allebei legendarische analoge crosspoint switches, maar ze vertegenwoordigen twee compleet verschillende generaties en ontwerpfilosofieën.

Als je ze naast elkaar legt voor een pro-audio- of synthesizer-applicatie, vallen de verschillen in architectuur, headroom en audiokwaliteit direct op.

Hier is de directe vergelijking op de belangrijkste fronten:

---

### 1. Matrix-Grootte en Voetafdruk

* **CD22M3494E (16 x 8 Matrix):** Biedt in zijn eentje **128 kruispunten**. Dit maakt hem erg aantrekkelijk als je in één klap veel in- en uitgangen wilt routeren. Het nadeel is de behuizing: hij is groot (vaak PLCC-44 of een flinke SOP-44), wat veel PCB-oppervlakte kost.
* **ADG2128 (12 x 8 Matrix):** Biedt **96 kruispunten**. Hij is iets kleiner in opzet, maar de chip zelf is extreem compact uitgevoerd (LFCSP-32 of TSSOP-32). Om een groter grid te maken moet je er sneller meerdere cascaderen.

### 2. Audio Headroom (Voedingsspanning)

Dit is de belangrijkste parameter voor synthesizers en pro-audio (zoals de Flock Audio Patch):

* **CD22M3494E:** Dit is een vintage bakbeest. Hij kan draaien op een **totale voedingsspanning van 14V** (bijvoorbeeld single supply $+12\text{V}$ of dual supply $\pm 7\text{V}$). Dankzij die hogere spanning kan hij moeiteloos grote audiosignalen aan zonder te clippen.
* **ADG2128:** Dit is een modernere chip, ontworpen voor flexibiliteit, en werkt op een **totale spanning van maximaal 12V** (bijvoorbeeld single $+12\text{V}$ of dual $\pm 5\text{V}$ of $+12\text{V}$ / $-2\text{V}$ via een interne bias). Voor Eurorack (waar signalen soms tussen $\pm 5\text{V}$ of zelfs $\pm 10\text{V}$ schieten) vereist de ADG2128 dat je de ingangssignalen eerst iets verzwakt (attenueren) en achteraf weer versterkt om clipping te voorkomen.

### 3. Audiokwaliteit: Vervorming (THD) en Weerstand

* **CD22M3494E:** Heeft een relatief hoge *On-Resistance* ($R_{\text{on}}$ van ca. **65 Ohm**). Belangrijker nog: die weerstand is niet perfect lineair; hij verandert naarmate de spanning van je audiosignaal stijgt of daalt. Dit introduceert harmonische vervorming (THD). Voor een gitaar-looper of vintage synth is dit vaak prima (of zelfs 'karaktervol'), maar voor transparante pro-audio is het minder geschikt.
* **ADG2128:** Is specifiek ontworpen met een uiterst vlakke weerstandscurve (*$R_{\text{on}}$ flatness* van slechts een paar Ohm). De totale weerstand is laag (ca. **35 Ohm**). Dit resulteert in een extreem lage THD en nagenoeg nul kleuring van het geluid. Dit is de chip die het dichtst in de buurt komt van de "transparante kabel"-kwaliteit.

### 4. Digitale Interface (De aansturing)

* **CD22M3494E:** Maakt gebruik van een **parallelle bus**. Je moet met aparte adreslijnen (X0-X3, Y0-Y2), een DATA-lijn en een STROBE-pin handmatig vertellen welk kruispunt open of dicht moet. Dit kost relatief veel GPIO-pinnen op je microcontroller (of je moet schuifregisters zoals de 74HC595 gebruiken).
* **ADG2128:** Werkt volledig via **$\text{I}^2\text{C}$**. Je stuurt simpelweg een digitaal commando over twee draden (SDA/SCL) en de matrix schakelt om. Omdat je het $\text{I}^2\text{C}$-adres van de ADG2128 met pinnen kunt aanpassen, kun je heel eenvoudig meerdere van deze chips op dezelfde bus hangen om je 96x96 matrix te bouwen.

---

### Vergelijkingstabel

| Feature | CD22M3494E | ADG2128 |
| --- | --- | --- |
| **Matrix Maat** | 16 x 8 (128 punten) | 12 x 8 (96 punten) |
| **Interface** | Parallel (Adres + Strobe) | $\text{I}^2\text{C}$ (2-draads) |
| **Max Voeding** | 14V ($\pm 7\text{V}$) | 12V ($\pm 5\text{V}$ of $+12\text{V}$ single) |
| **On-Resistance ($R_{\text{on}}$)** | ~65 $\Omega$ (minder lineair) | ~35 $\Omega$ (zeer vlak / lineair) |
| **Vervorming (THD)** | Matig (vintage karakter) | Ultralaag (transparant / pro-audio) |
| **Behuizing** | Groot (PLCC-44 / SOP-44) | Zeer compact (LFCSP / TSSOP) |

### Welke moet je kiezen voor JLCPCB?

Als je een modern project start via een PCBA-service zoals JLCPCB, heeft de **ADG2128** (of zijn grotere broers uit dezelfde ADI-familie) de sterke voorkeur. De $\text{I}^2\text{C}$-aansturing bespaart je een hoop hoofdpijn in je microcontroller-code en PCB-routing, en de chip is perfect geoptimaliseerd voor moderne, ruisvrije signaalpaden.

De CD22M3494E is prachtig als je een vintage analoge synthesizer-reproductie bouwt of specifiek de extra headroom van een $\pm 7\text{V}$ rail nodig hebt zonder buffers te willen herontwerpen, maar hij is digitaal gezien een stuk omslachtiger om te implementeren op een moderne PCB.

## vraag CD22M3494E
De CD22M3494E is wel heel prijsgunstig. Ik zie ze voor $3 per stuk of zelfs 8 euro voor 5. Als ik de vervorming voor lief neem, hoe zou ik daar dan een analoge matrix van 32 x 32 kunnen maken? Dan heb je er 2 in de breedte en 4 in de lengte nodig, maar nog meer om een volledige matrix te maken. Hoe werkt dat ook weer? Ik had het ooit helder, maar niet meer

## antwoord
De CD22M3494E is inderdaad bizar goedkoop voor het aantal kruispunten dat je krijgt. Voor een modulaire synth of een experimentele studio-matrix is de lichte vervorming vaak juist een charmant analoog randje, in plaats van een probleem.

Het herontwerpen van een matrix-grid (een zogenaamde *crossbar switch*) kan snel verwarrend worden als je het een tijdje niet hebt gedaan. Laten we de logica weer even helder op een rij zetten.

---

### De Wiskunde: Hoeveel chips heb je écht nodig?

De CD22M3494E is een **16 x 8 matrix**. Dit betekent:

* **16 Ingangen** (de X-as)
* **8 Uitgangen** (de Y-as)

Jouw doel is een **32 x 32 matrix** (32 ingangen naar 32 uitgangen).
Om te berekenen hoeveel chips je nodig hebt, deel je de gewenste assen door de capaciteit van één chip:

* **Voor de Ingangen (X-as):** Je hebt $32 \text{ ingangen} / 16 \text{ per chip} = \mathbf{2 \text{ chips breed}}$.
* **Voor de Uitgangen (Y-as):** Je hebt $32 \text{ uitgangen} / 8 \text{ per chip} = \mathbf{4 \text{ chips hoog}}$.

Om het hele grid sluitend te maken zodat *elke* van de 32 ingangen met *elke* van de 32 uitgangen verbonden kan worden (een zogenaamde *non-blocking matrix*), moet je deze breedte en hoogte met elkaar vermenigvuldigen:

$$\text{Totaal aantal chips} = 2 \text{ (breed)} \times 4 \text{ (hoog)} = \mathbf{8 \text{ chips total}}$$

Je vermoeden van "2 in de breedte en 4 in de lengte" klopt dus exact. Je hebt er in totaal **8** nodig.

---

### Hoe verbind je ze fysiek? (Het Grid)

Om dit te visualiseren, leg je de 8 chips in een raster van 2 kolommen en 4 rijen.

Hier is hoe je de analoge sporen op de PCB trekt:

#### 1. De Ingangen (X-as) doorkoppelen:

Je verdeelt je 32 fysieke ingangen in twee groepen van 16:

* Ingang 1 t/m 16 gaan naar de X-pinnen van **Kolom 1** (Rij 1, 2, 3 en 4). Je verbindt dus X0 van chip 1, 2, 3 en 4 allemaal met elkaar.
* Ingang 17 t/m 32 gaan naar de X-pinnen van **Kolom 2** (Rij 1, 2, 3 en 4). Je verbindt X0 van chip 5, 6, 7 en 8 met elkaar.

#### 2. De Uitgangen (Y-as) doorkoppelen:

Je verdeelt je 32 fysieke uitgangen in vier groepen van 8:

* Uitgang 1 t/m 8 worden verbonden met de Y-pinnen van **Rij 1** (dus Chip 1 en Chip 5 parallel).
* Uitgang 9 t/m 16 gaan naar de Y-pinnen van **Rij 2** (Chip 2 en Chip 6 parallel).
* Uitgang 17 t/m 24 gaan naar de Y-pinnen van **Rij 3** (Chip 3 en Chip 7 parallel).
* Uitgang 25 t/m 32 gaan naar de Y-pinnen van **Rij 4** (Chip 4 eyebal en Chip 8 parallel).

> **Waarom dit werkt:** Als je Ingang 1 (Kolom 1) wilt verbinden met Uitgang 32 (Rij 4), zet je simpelweg het kruispunt aan op **Chip 4**. De rest van de chips laat die lijn ongemoeid.

---

### Hoe stuur je dit digitaal aan?

Omdat de CD22M3494E een parallelle interface heeft, heeft elke chip nodig:

* 4 adrespinnen voor de X-as (AX0 - AX3)
* 3 adrespinnen voor de Y-as (AY0 - AY2)
* 1 DATA-pin (om het kruispunt op 1 of 0 te zetten)
* 1 STROBE-pin (om de wijziging te bevestigen)

Als je dit voor alle 8 de chips los moet aansturen, ben je tientallen pinnen op je Teensy kwijt. Gelukkig kun je dit heel slim oplossen:

1. **Deel de Adres- en Datalijnen:**
Verbind de AX0-AX3, AY0-AY2 en DATA-pinnen van **alle 8 de chips** gewoon parallel aan elkaar. Ze luisteren nu allemaal naar hetzelfde "adres".
2. **Gebruik de STROBE-pin als 'Chip Select':**
Een chip reageert pas op het adres als zijn individuele `STROBE`-pin hoog wordt gemaakt.
3. **De Microcontroller oplossing:**
Je hebt nu slechts 4 (X-adres) + 3 (Y-adres) + 1 (Data) = 8 pinnen nodig voor de bus. Met een goedkope 3-naar-8 multiplexer chip (zoals de **74HC138**) kun je met 3 extra pinnen van je Teensy selecteren wélke van de 8 chips de `STROBE` moet ontvangen.

In totaal heb je dus maar **11 GPIO-pinnen** nodig op je microcontroller om een gigantische 32x32 analoge matrix volledig onafhankelijk te beheren.

### Belangrijke PCB-tip voor dit budget-ontwerp

Omdat je de analoge audio-sporen nu over 8 verschillende IC's aan het splitsen en doorkoppelen bent, creëer je relatief lange sporen die parallel aan elkaar lopen. Om te voorkomen dat kanaal 1 overspreekt (*crosstalk*) op kanaal 2, is het ten zeerste aan te raden om een **4-laags PCB** te ontwerpen bij JLCPCB. Gebruik de binnenlagen als Ground Planes (GND) om de X- en Y-sporen fysiek van elkaar te isoleren.

## en de 8816?
Ah ja, ik snap het weer. Er is ook nog de MT8816 die heel goedkoop is (10 voor 6 euro zelfs). Hoe verhoud deze zich dan tot de CD22M349 ?

## antwoord
start_search
glp:search{queries:[MT8816 datasheet Zarlink Microsemi,MT8816 crosstalk isolation thd]}end
De **MT8816** (oorspronkelijk van Mitel, later overgenomen door Zarlink en Microsemi) is inderdaad een legendarische chip in de DIY-synthesizer en gitaarpedaal-wereld. Voor die prijs (6 euro voor 10 stuks) is het een absolute no-brainer om mee te experimenteren.

Als we de MT8816 rechtstreeks vergelijken met de CD22M3494E, zie je dat ze qua architectuur erg op elkaar lijken, maar dat de MT8816 op een aantal cruciale analoge en digitale punten net even wat moderner en handiger is ontworpen.

Hier zijn de belangrijkste verschillen:

---

### 1. Matrix-Grootte: Identiek aantal kruispunten, andere verhouding

Beide chips bevatten exact **128 kruispunten**, maar de indeling is anders:

* **CD22M3494E:** Is een **16 x 8** matrix (16 ingangen, 8 uitgangen).
* **MT8816:** Is een **8 x 16** matrix (8 ingangen, 16 uitgangen).

Voor het bouwen van een **32 x 32 matrix** maakt dit wiskundig gezien niets uit: je hebt nog steeds exact **8 chips** nodig. Alleen draai je het grid om: je krijgt nu een raster van 4 chips breed (4 x 8 = 32 ingangen) en 2 chips hoog (2 x 16 = 32 uitgangen).

### 2. Audiokwaliteit: Vervorming en Ruis (THD + Crosstalk)

Dit is waar de MT8816 de CD22M3494E vaak aftroeft:

* **Lagere On-Resistance ($R_{\text{on}}$):** De MT8816 heeft een typische interne weerstand van ca. **45 Ohm** (tegenover ~65 Ohm bij de CD22). Een lagere weerstand betekent minder signaalverlies en over het algemeen een betere lineariteit (minder vervorming/THD) bij audio-toepassingen.
* **Betere Crosstalk Isolatie:** De MT8816 staat erom bekend dat hij intern heel fatsoenlijk is afgeschermd tegen overspraak. De *crosstalk* tussen kanalen is bij audiofrequenties erg laag (vaak rond de -90dB of beter). Bij de oudere CD22-architectuur kan er bij hogere audiofrequenties (of snelle LFO's/envelopes) sneller wat signaal 'bloeden' naar naastliggende kanalen.

### 3. Voedingsspanning (Headroom)

* **CD22M3494E:** Werkt tot een totale spanning van **14V** (bijv. $\pm 7\text{V}$ of $+12\text{V}$ / $-2\text{V}$ bias).
* **MT8816:** Heeft een vergelijkbaar bereik en draait stabiel op een totale spanning tot **13.2V** (typisch gebruikt op $\pm 5\text{V}$ tot $\pm 6\text{V}$, of een single supply van $+12\text{V}$).

> **Eurorack Let-op:** Omdat beide chips niet de volledige Eurorack $\pm 12\text{V}$ of $\pm 15\text{V}$ rails aankunnen, moet je je audiosignalen voeden binnen hun limiet (bijv. een aparte $\pm 5\text{V}$ regulator voor de analoge spanning van de chip). Dikke modulaire signalen van $10\text{V}_{\text{pp}}$ ($\pm 5\text{V}$) passen hier *net* in zonder te clippen, maar er is weinig ademruimte.

### 4. Digitale Aansturing (De CS-pin zegen!)

Dit is het grootste praktische voordeel van de MT8816 ten opzichte van de CD22 bij het bouwen van een grote matrix:

* **CD22M3494E:** Heeft alleen een `STROBE`-pin. Zoals we eerder bespraken, moet je die misbruiken als een soort Chip Select via een externe demultiplexer (74HC138) om de chips los van elkaar aan te spreken.
* **MT8816:** Heeft een dedicated **`CS` (Chip Select)** pin én een `RESET` pin.
Dit maakt cascadering extreem elegant. Je kunt de adreslijnen (AY0-AY3, AX0-AX2) en de `DATA`/`STROBE` pinnen van alle 8 de chips blindelings aan elkaar knopen. Je activeert simpelweg de `CS` pin van de specifieke chip die je wilt programmeren. Daarnaast kun je met één puls op de gezamenlijke `RESET` lijn de *hele* 32x32 matrix in één klap leeggooien (alle verbindingen verbreken). Dit is een heerlijke feature voor een synthesizer-patchbay.

---

### Vergelijkingstabel

| Feature | CD22M3494E | MT8816 |
| --- | --- | --- |
| **Matrix Verhouding** | 16 In x 8 Uit | 8 In x 16 Uit |
| **On-Resistance ($R_{\text{on}}$)** | ~65 $\Omega$ | **~45 $\Omega$ (Beter)** |
| **Crosstalk / Vervorming** | Matig / Vintage | **Goed / Vrij Transparant** |
| **Chip Select (CS) Pin?** | Nee (Strobe omweg nodig) | **Ja (Slechts 1 pin nodig per chip)** |
| **Master Reset Pin?** | Nee | **Ja (Heel handig voor paniek/clear)** |
| **Behuizingen** | PLCC-44 / SOP-44 | DIP-40 / PLCC-44 / QFP-44 |

### Conclusie: Welke moet je nemen?

Voor 6 euro voor 10 stuks is de **MT8816 de absolute winnaar**. Hij klinkt schoner (minder overspraak en vervorming), heeft een lagere interne weerstand, en de toevoeging van een dedicated `CS` (Chip Select) en `RESET` pin maakt het ontwerpen van je digitale aansturing vanaf de Teensy een stuk makkelijker en eleganter.

Als je ze bestelt, let dan wel even op de behuizing (package). De DIP-40 variant is fantastisch voor op een breadboard, maar als je het door JLCPCB wilt laten assembleren, kun je het beste kijken of ze de **PLCC-44** of **TQFP/QFP-44** variant op voorraad hebben.

## layout
waarom lopen die X en Y pinnen zo 'door elkaar'? Niet gewoon op volgorde maar, in groepjes van 2 of 4, 'all over the place'? Zowel op de DIP als op de vierkant chip.

## antwoord
Dat is een frustratie die elke hardware-engineer deelt bij het kijken naar de pinout van chips als de **MT8816** of **CD22M3494**. Het ziet eruit als een chaos, maar er is een heel specifieke fysieke reden voor: **de interne structuur van het silicium en de "bonding wires".**

Hier is waarom die pinnen zo "door elkaar" staan:

### 1. Interne routing op de Die

De chip is intern een matrix van transistoren. De X- en Y-lijnen lopen als een fysiek raster (grid) over het siliciumoppervlak.

* Stel je een schaakbord voor. De ingangen (X) komen van de linkerkant en de uitgangen (Y) van de bovenkant.
* De "bonding pads" (de plekjes waar het gouden draadje van de chip naar de pin van de behuizing gaat) moeten fysiek rondom het silicium worden geplaatst.
* Om te voorkomen dat die microscopisch dunne gouden draadjes elkaar kruisen of te lang moeten zijn (wat inductie en ruis veroorzaakt), worden de uitgangen simpelweg naar de dichtstbijzijnde pin op de buitenrand geleid.

### 2. Geen "Logische" maar "Fysieke" volgorde

Bij een microcontroller zijn pinnen vaak gegroepeerd per poort (bijv. PA0-PA7) omdat dat logisch is voor software. Maar bij een analoge switch is de **analoge integriteit** belangrijker dan de logische nummering.

* De fabrikant wil de "ruwe" analoge signalen zo ver mogelijk uit elkaar houden om **crosstalk** (overspraak) te minimaliseren.
* Als ze alle X-pinnen aan de linkerkant zouden zetten en alle Y-pinnen aan de rechterkant, zouden alle 128 "crosspoints" aan één kant van de chip opgestapeld worden. Door ze te spreiden, is het magnetische veld van de ene lijn minder invloedrijk op de andere.

### 3. De "DIP-40" erfenis

De MT8816 is ontworpen in een tijd dat alles in een DIP-40 (Dual In-line Package) moest passen.

* Een DIP-40 chip heeft pinnen 1 t/m 20 aan de ene kant en 21 t/m 40 aan de andere kant.
* Omdat de interne matrix een grid is, komen de verbindingen "geel" (kriskras) uit de chip. In plaats van ingewikkelde kruisende paden op het silicium te etsen, heeft men gekozen voor de simpelste weg: de fysieke uitgang van het grid direct naar de dichtstbijzijnde fysieke pin.

---

### Hoe ga je hier in de praktijk mee om?

Als je dit zelf gaat routen in KiCad of EasyEDA, zul je merken dat je PCB-ontwerp ("layout") een enorme puinhoop wordt als je de nummers strikt volgt. Hier zijn twee tips om dit op te lossen:

#### Tip 1: "Pin Swapping" in je schema

In professionele EDA-software (zoals KiCad) kun je gebruikmaken van **Pin Swapping**.

* Je definieert in je schema dat X0 t/m X7 "swappable" zijn.
* In de PCB-editor kun je dan de lijnen die van X0 en X1 komen, fysiek met elkaar wisselen zodat je sporen op de printplaat niet kruisen.
* Dit mag bij een analoge switch omdat de matrix volledig symmetrisch is: het maakt de chip niet uit of "Ingang 1" fysiek op pin 2 of op pin 4 zit, zolang jij in je software maar onthoudt dat je nu pin 4 moet aansturen om Ingang 1 te activeren.

#### Tip 2: De "Fly-over" via-strategie

Bij een 32x32 matrix met 8 van deze chips is het bijna onmogelijk om alles op 2 lagen te routen zonder dat je sporen elkaar kruisen als een bord spaghetti.

* **Gebruik een 4-laags PCB:** Dit is de standaard voor dit soort complexe routing.
* **Gebruik Vias:** Stuur alle X-lijnen over de bovenkant (Top) en alle Y-lijnen over de onderkant (Bottom). Waar ze elkaar moeten ontmoeten, gebruik je een "Via" om van laag te wisselen.

> **Waarschuwing:** Houd de digitale aanstuurlijnen (Adres, Data, Strobe) fysiek gescheiden van de analoge audiolijnen. Als je een audiosignaal parallel laat lopen met een digitale bus, hoor je de "tikjes" van je microcontroller terug in je audio (digitale noise).

**Conclusie:** Laat je niet ontmoedigen door de chaotische pinout. Het is een "erfenis van het silicium". Gebruik de *Pin Swap* functie in je ontwerpsoftware om de routing op je PCB netjes en kort te houden, dan komt het helemaal goed.

## pinout mapping
Ja, Schrijf een overzichtelijke pinout-tabel voor de MT8816 switch, waarbij ik de logische X/Y ingangen kan koppelen aan de fysieke pinnummers.

## antwoord
Om de chaos van de MT8816 te ontcijferen, vind je hieronder de logische pinout-tabellen voor zowel de **44-pins PLCC** als de **40-pins DIP** behuizing. Dit zijn de twee meest voorkomende varianten die je bij JLCPCB of elektronicaboeren tegenkomt.

De tabellen zijn zo gesorteerd dat je in één oogopslag ziet welk logisch X- of Y-kanaal bij welk fysiek pinnummer hoort.

---

### 1. MT8816AP (44-pins PLCC) — *Aanrader voor SMT/JLCPCB*

Bij de vierkante PLCC-behuizing zie je de invloed van de afscherming heel duidelijk: de analoge pinnen zijn omringd door voedings- en NC (Not Connected) pinnen.

#### Analoge Matrix (X en Y)

| Logisch Kanaal | Fysieke Pin |  | Logisch Kanaal | Fysieke Pin |
| --- | --- | --- | --- | --- |
| **X0** | Pin 39 |  | **Y0** | Pin 3 |
| **X1** | Pin 38 |  | **Y1** | Pin 4 |
| **X2** | Pin 37 |  | **Y2** | Pin 5 |
| **X3** | Pin 36 |  | **Y3** | Pin 6 |
| **X4** | Pin 32 |  | **Y4** | Pin 7 |
| **X5** | Pin 31 |  | **Y5** | Pin 8 |
| **X6** | Pin 30 |  | **Y6** | Pin 12 |
| **X7** | Pin 29 |  | **Y7** | Pin 13 |
|  |  |  | **Y8** | Pin 14 |
|  |  |  | **Y9** | Pin 15 |
|  |  |  | **Y10** | Pin 17 |
|  |  |  | **Y11** | Pin 18 |
|  |  |  | **Y12** | Pin 19 |
|  |  |  | **Y13** | Pin 20 |
|  |  |  | **Y14** | Pin 21 |
|  |  |  | **Y15** | Pin 22 |

#### Digitale Besturing & Voeding (PLCC)

| Functie | Fysieke Pin | Omschrijving |
| --- | --- | --- |
| **AY0 - AY3** | 41, 42, 43, 44 | Y-Adres selectie (4 pinnen) |
| **AX0 - AX2** | 25, 26, 27 | X-Adres selectie (3 pinnen) |
| **DATA** | 40 | Data input (1 = verbinden, 0 = verbreken) |
| **STROBE** | 24 | Strobe control (activeert de data/adres wijziging) |
| **CS** | 23 | Chip Select (hoog = chip luistert, laag = negeren) |
| **RESET** | 1 | Master Reset (puls hoog = alle kruispunten open) |
| **VDD** | 28 | Digitale voeding (+5V) |
| **VSS** | 2 | Digitale Ground (0V) |
| **VEE** | 35 | Analoge negatieve voeding (bijv. -5V voor bi-polar audio) |
| **NC** | 9, 10, 11, 16, 33, 34 | Niet verbonden (interne isolatie) |

---

### 2. MT8816AE (40-pins DIP) — *Ideaal voor Breadboarding*

Als je de traditionele langwerpige DIP-chip gebruikt, is de lay-out nog exotischer omdat alle 40 pinnen in twee lange rijen geperst moesten worden.

#### Analoge Matrix (X en Y)

| Logisch Kanaal | Fysieke Pin |  | Logisch Kanaal | Fysieke Pin |
| --- | --- | --- | --- | --- |
| **X0** | Pin 35 |  | **Y0** | Pin 3 |
| **X1** | Pin 34 |  | **Y1** | Pin 4 |
| **X2** | Pin 33 |  | **Y2** | Pin 5 |
| **X3** | Pin 32 |  | **Y3** | Pin 6 |
| **X4** | Pin 29 |  | **Y4** | Pin 7 |
| **X5** | Pin 28 |  | **Y5** | Pin 8 |
| **X6** | Pin 27 |  | **Y6** | Pin 11 |
| **X7** | Pin 26 |  | **Y7** | Pin 12 |
|  |  |  | **Y8** | Pin 13 |
|  |  |  | **Y9** | Pin 14 |
|  |  |  | **Y10** | Pin 15 |
|  |  |  | **Y11** | Pin 16 |
|  |  |  | **Y12** | Pin 17 |
|  |  |  | **Y13** | Pin 18 |
|  |  |  | **Y14** | Pin 19 |
|  |  |  | **Y15** | Pin 20 |

#### Digitale Besturing & Voeding (DIP)

| Functie | Fysieke Pin | Omschrijving |
| --- | --- | --- |
| **AY0 - AY3** | 37, 38, 39, 40 | Y-Adres selectie |
| **AX0 - AX2** | 22, 23, 24 | X-Adres selectie |
| **DATA** | 36 | Data input |
| **STROBE** | 21 | Strobe control |
| **CS** | 10 | Chip Select |
| **RESET** | 1 | Master Reset |
| **VDD** | 25 | Digitale voeding (+5V) |
| **VSS** | 2 | Digitale Ground (0V) |
| **VEE** | 31 | Analoge negatieve voeding |
| **NC** | 9, 30 | Niet verbonden |

---

### Ontwerptip voor je 32x32 matrix bus:

Als je de 8 chips gaat cascaderen op je PCB, kun je pinnen **21 t/m 25** en **36 t/m 40** (bij de DIP-variant) van álle chips direct met dikke banen parallel aan elkaar leggen. Alleen pin **10 (CS)** krijgt van elke chip een eigen lijntje naar je microcontroller of multiplexer (74HC138) om de boel netjes te adresseren!

## relatie musicbrain
Dank. Voor het project op de teensy, waar ik de CV en audio patching van een eurorack rack wil organiseren, heb ik nu een aantal CV modules:
- MIDI-naar CV (mono en polyfoon, legato, voice stealing logica, portamento, pitch bend en mod wheel)
- sequencer
- Envelope (alleen de AHDSR gemaakt, draw-envelope, sample-envelope en multi-facet-envelope in de planning)
- LFO
- Math (2 CVs in 1 uit, met math ertussen)

Deze gebruiken en/of genereren alleen CV signalen (de digitale representatie ervan dan natuurlijk) om uiteindelijk naar het analoge rack gezonden te worden via D/A converters.

Ze worden allemaal met een tick van 1kHz op de teensy uitgevoerd.

Welke andere modules zijn denkbaar voor het bewerken of maken van CV spanningen?

## antwoord
Dat is al een heel volwaardig en krachtig fundament voor een digitaal aangestuurd Eurorack-brein! Een tick-rate van **1 kHz** (1 ms per berekening) is perfect voor het genereren en verwerken van traditionele modulatie-CV. Het is snel genoeg voor loepzuivere envelopes en soepele LFO's, zonder dat het je Teensy overbelast.

Als we kijken naar hoe modulaire systemen (en met name de *West Coast* synthese-filosofie) met CV omgaan, zijn er nog een aantal zeer krachtige en creatieve modules denkbaar die je digitale CV-arsenaal compleet kunnen maken.

Hier is een lijst met modules die je via software op de Teensy kunt implementeren:

### 1. Generatieve & Aleatorische Modules

* **Turing Machine / Random Looping Sequencer:** Gebaseerd op de beroemde Music Thing Modular Turing Machine. Dit is een digitaal schuifregister dat willekeurige bits rondpompt. Je kunt de "waarschijnlijkheid" (*probability*) instellen waarmee een bit flipt. Hierdoor balanceer je continu tussen totale chaos, evoluerende patronen, of een perfect herhalende loop van 8 of 16 stappen.
* **Sample & Hold (S&H) / Track & Hold:**
Hoewel we zojuist hebben besproken dat analoge S&H voor hardware-routing nadelen heeft, is een *digitale* S&H in je software juist fantastisch. Je voert een bron-CV in (bijv. een snelle LFO of ruis) en "sampled" de waarde op de klokslag van een externe trigger. Bij Track & Hold laat je het signaal door zolang de gate hoog is, en "bevries" je het zodra de gate laag wordt.
* **Bernoulli Gate / Probability Trigger Switch:**
Een module die een binnenkomende trigger (bijv. van je sequencer) naar uitgang A of uitgang B stuurt op basis van een instelbaar percentage (bijv. 70% kans op A, 30% op B). Geweldig om drumpatronen of melodische variaties menselijker en minder voorspelbaar te maken.

### 2. CV Modificatie & Performance

* **Quantizer (Toonhoogte-corrector):**
Onmisbaar voor je sequencer en generatieve modules. Een quantizer neemt een vloeiende CV-spanning (0-10V) en trekt deze direct recht naar de dichtstbijzijnde exacte volt-waarde die hoort bij een specifieke muzikale toonladder (bijv. Pentatonisch, Mineur, of custom microtonale schalen). Dit zorgt ervoor dat je generatieve sequenties altijd "in tune" blijven met je analoge VCO's.
* **Slew Limiter (Glide / Lag Processor):**
Je hebt al portamento op je MIDI-module, maar een losse, configureerbare Slew Limiter is goud waard. Hiermee kun je abrupte stappen (zoals een blokgolf-LFO of sequencer-stap) vloeiend maken. Maak de *Rise* (stijgtijd) en *Fall* (daaltijd) onafhankelijk instelbaar voor asymmetrische curves.
* **Symmetry / Curve Shaper:**
Een module die een lineair CV-signaal (zoals een zaagtand-LFO of een simpele envelope) vervormt naar een exponentiële of logaritmische curve. Dit verandert de dynamiek en het "gevoel" van een modulatie-signaal drastisch wanneer je het naar een analoge VCF of VCA stuurt.

### 3. Utiliteit & Routering

* **Sequential Switch:**
Een digitale variant van een analoge stappenschakelaar. Elke keer dat er een trigger binnenkomt, schakelt de module over naar de volgende input (of output). Je kunt hiermee bijvoorbeeld 4 verschillende LFO's inlezen en ze om de beurt naar één analoge filteruitgang sturen op het ritme van je sequencer.
* **Logic Gate Module:**
Een module die digitale triggers en gates met elkaar vergelijkt met behulp van Booleaanse logica (**AND, OR, XOR, NAND, NOR**). Als je de gate van Sequencer 1 én Sequencer 2 combineert met een XOR-poort, krijg je een compleet nieuw, complex ritme dat alleen triggert als één van de twee sequencers actief is, maar niet allebei.
* **Min/Max Selector:**
Je stopt er twee of drie CV-signalen in, en de module geeft continu alleen de *hoogste* (Max) of de *laagste* (Min) waarde door aan de uitgang. Als je hier twee asynchrone LFO's in stopt, krijg je prachtige, organisch golvende patronen die nooit exact hetzelfde lijken te zijn.

### 4. Tijd-gebaseerde CV-effecten

* **CV Delay (Shift Register Delay):**
Omdat je op 1 kHz draait, kun je heel gemakkelijk een array (buffer) maken die je CV-waarden een aantal milliseconden of stappen vasthoudt voordat hij ze uitstuurt. Dit creëert een "modulatie-echo". Als je een pitch-CV vertraagt, krijg je een canon-effect (meerdere stemmen die achter elkaar aan jagen).
* **Burst Generator:**
Wanneer deze module één enkele trigger ontvangt, vuurt hij een instelbare "trein" van opeenvolgende triggers af (bijvoorbeeld 4 snelle triggers achter elkaar met een instelbare versnelling of vertraging). Ideaal voor ratchets in je sequenties of snelle drum-rolls.

### Hoe dit past in jouw 1kHz architectuur

Het mooie van deze softwarematige modules is dat ze wiskundig gezien heel "goedkoop" zijn voor de processor van de Teensy (zeker vergeleken met audio-oscillatoren of effecten). Je kunt tientallen van deze logische, generatieve en quantizer-modules tegelijkertijd laten draaien op de achtergrond van je patch-matrix.

Is er een specifiek type module uit deze lijst (zoals de Turing Machine of de Quantizer) waar je de wiskundige of logische logica achter wilt uitwerken voor je code?

## gaat de andere kant op
einde stuk over matrices.

# relatie met het poly-analog-spoor (2026-07-20)

Zie `doc/poly-analog-spec.md` B12. Kern:

1. **Poly-bussen: 8 parallelle MT8816-vlakken, identiek geadresseerd.**
   Een poly-patchverbinding = bus van 8 draden die altijd samen schakelen.
   Plane k schakelt stem k van alle modules; adres/data/strobe van alle 8
   chips parallel, CS's samen → één kruispunt-schrijf is een broadcast.
   8× MT8816 (~€5) = poly-matrix van 8 bronbussen × 16 bestemmingsbussen —
   zelfde chipaantal als de mono-32×32 hierboven. Opschalen = rijen planes
   bijplaatsen.
2. **Matrix-minimalisatie stuurt moduleontwerp**: alles wat per dCV ín een
   8×-module schakelbaar is (filtermode, 2/4-pole, golfvorm) hoeft nooit
   door de matrix → besluit VCF8 = SSI2140 met dCV-schakelbare tap-mux.
3. **Headroom**: MT8816 totaal ≤ 13,2 V → interne chain/matrix-audio
   ±5 V nominaal, buffers rond de matrix (open punt bij matrixkaart-ontwerp;
   locatie onderin de kast = zelfde plek als de busexpander — combineren).

> ⚠️ **De pinout-tabellen hierboven (Gemini) zijn FOUT** — geverifieerd
> tegen de echte Mitel/Zarlink-datasheet (futurlec.com/Datasheet/Zarlink/
> MT8816AE.pdf, Figure 2): de chip heeft **16 X-lijnen (AX0–AX3) en 8
> Y-lijnen (AY0–AY2)** — Gemini draaide X/Y om én verzon pinnummers
> (CS = pin 36, niet 10; VDD = 40, niet 25; enz.). De juiste DIP-40-pinout
> staat in `gen_matrix.py` (bron van waarheid) en hieronder:
> 1=Y3 2=AY2 3=RESET 4=AX3 5=AX0 6=X14 7=X15 8–13=X6–X11 14=NC 15=Y7
> 16=VSS 17=Y6 18=STROBE 19=Y5 20=VEE 21=Y4 22=AX1 23=AX2 24=AY0 25=AY1
> 26=X13 27=X12 28=X5 29=X4 30=X3 31=X2 32=X1 33=X0 34=NC 35=Y0 36=CS
> 37=Y1 38=DATA 39=Y2 40=VDD.
> Strobe-timing: adres stabiel vóór STROBE↑, data stabiel op STROBE↓.

# maatstudie 8× MT8816 poly-matrix (2026-07-20)

**Architectuur**: 8 planes (plane k = stem k van alle bussen), álle chips
volledig parallel — adres, data, strobe én CS gedeeld: elke schrijfactie is
per definitie een broadcast naar de 8 stemmen. Aansturing = gate8-patroon:
2–3× 74HC595 aan een slot-SPI/CS (of via de busexpander-kabel) leveren de
7 adreslijnen + DATA + STROBE + RESET. De matrixkaart is daarmee elektrisch
een gewone domme buskaart.

## Oppervlak per variant

| Blok | DIP-40 (in huis) | PLCC-44 | QFP-44 |
|---|---|---|---|
| 8× chip | ~900 mm²/st → 7200 | ~450 → 3600 | ~250 → 2000 |
| chipveld (2×4 grid) | ~110×80 | ~55×90 | ~45×80 |
| 24× 1×10-header (8 IN + 16 UIT) | 6 rijen à 4 conn: ~110×72 | idem | idem |
| logic (595's, levelshift) + deco | ~1200 mm² | idem | idem |
| **bordschatting** | **~160×120** | **~120×110** | **~110×105** |

Ter referentie: het busboard is 203×128 — zelfs de DIP-variant past dus
ruim op de kastbodem. **Advies: v0.1 met de DIP-40-voorraad die er al ligt**
(€0, ruim bemeten bord is op de bodem geen bezwaar; sockets = chips
herbruikbaar). PLCC/QFP pas als een kleinere rev nodig blijkt —
beschikbaarheid bij LCSC is voor alle varianten mager, dus het blijft
eigen voorraad/aftermarket.

## Connectoren: bij het 1×10-contract blijven

8 IN- + 16 UIT-bussen × 1×10 (GND, 1–8, GND) = 24 headers ≈ 79 cm²
inclusief kabelruimte — fors, maar:
- **uitwisselbaarheid wint**: elke kaart/module prikt er zonder adapters op;
- de kastbodem is het goedkoopste oppervlak van het hele systeem;
- compacter kán (2×N-headers met meerdere bussen per connector halveren de
  lengte) maar breekt het contract → alleen overwegen als de bodem echt vol
  raakt, en dan met adapterkabels.

## Buffers: v1 géén per-lijn buffers

Flock-stijl buffering overal zou 8×8 in- + 16×8 uitlijnen = ~192
opamp-kanalen kosten. Onnodig in ons gesloten systeem: de bronnen zijn al
opamp-uitgangen (onze eigen kaarten, 220R serie-uit), de bestemmingen zijn
≥10k-ingangen, en Ron ≈ 45Ω is daarop verwaarloosbaar. Multen (1 bron → n
bestemmingen) blijft prima. Crosstalk op rev 0.1 méten; pas buffers
toevoegen waar het aantoonbaar knelt.

## Voeding & logic-niveau (beslissen bij ontwerp)

Totaal ≤ 13,2 V. Twee routes:
- (a) VDD +5,5 V / VEE −6,5 V: ±5V-audio past (krap aan de top);
  3V3-logica haalt de CMOS-drempel (0,7×VDD ≈ 3,85 V) níet → levelshift
  met 74AHCT-buffers (TTL-drempel) op adres/data/strobe.
- (b) interne chain-standaard verlagen naar ±4 V nominaal → meer marge,
  zelfde levelshift-vraag.

## Meetbus (besluit 2026-07-20)

**Reserveer UIT-bus 16 als meetbus naar de adc8.** Daarmee kan de Brain
elke bronbus per stem naar de ADC routeren en niveaus/gains/mixdiepten
meten (DC- of LF-testsignaal; de VCA's zijn DC-gekoppeld). Dit sluit het
"niet meetbaar → niet ijkbaar"-gat voor alles behalve frequentie (dat de
tune-mux al dekt) en maakt per-stem instelpots overbodig (poly-spec B10).

## Status

`gen_matrix.py` gebouwd 2026-07-20 (musicbrain-matrix rev 0.1, 115×140,
ERC 0/netcheck OK/plaatsing 0 overlappen) — freerouting + DRC + fab in een
routingsessie; 2 lagen proberen (THT), anders 4.

