# Ontwerpreview MusicBrain VCF8-kern rev 0.1

**Datum:** 2026-09-01  
**Scope:** hiërarchisch schema, vierlaags PCB, generator, fab-output, SSI2140- en
AD5754-datasheets en de documenten `README.md` en `poly-analog-spec.md`.  
**Conclusie:** de filtertopologie en kanaalmapping zijn coherent en de PCB heeft
geen open netten of clearancefouten onder de vastgelegde 0,15-mm-regels. Ik zou
rev 0.1 echter nog niet bestellen voordat punten 1 tot en met 3 zijn opgelost.
Een kleine validatiebatch is daarna passend; analoge prestaties, tune en
pole-mix-onderdrukking blijven bewust bench-validaties voor deze eerste revisie.

## Bevindingen

### 1. Hoog — de lokale ontkoppeling staat te ver van de IC's

De SSI2140-datasheet vraagt op zowel V+ als V- een lokale 100-nF-condensator,
zo dicht mogelijk bij de behuizing en met een laaginductieve verbinding naar
GND. Op het actuele bord staan C105/C106 tot en met C805/C806 op de B-zijde,
maar hun hartafstand tot U1..U8 is 21,9 tot 25,5 mm. De verbinding loopt dus via
sporen en vias in plaats van een kleine lokale stroomlus.

Hetzelfde probleem bestaat in de DAC-rug: C901/C902/C903 staan 22,6 tot 24,9 mm
van U31. Bij U32 is dat 9,5 tot 16,1 mm; de ADR421-condensatoren C907/C908 staan
14,7 en 20,4 mm van U33. Alleen C909 bij U34 is met 5,7 mm redelijk lokaal.
Bulkcondensatoren elders op het bord vervangen deze HF-ontkoppeling niet.

**Actie:** plaats per SSI2140 één 100 nF direct bij pin 20 en één direct bij pin
11, met een eigen korte GND-via naast de GND-pad. Doe hetzelfde per voedingspin
van U31/U32 en aan in- en uitgang van U33. Houd de 10-uF-condensatoren als bulk.
Controleer na herplaatsing opnieuw routing, GND-vulling en DRC.

### 2. Hoog — MODE, TSEL en TEN hebben geen gedefinieerde opstarttoestand

MODE0..2 en TSEL0..2 gaan rechtstreeks van J1 naar de select-ingangen van de
74HC4051's. TEN gaat rechtstreeks naar de gate van Q1. Er zijn geen lokale
pull-downs. Tijdens power-up, bij een afwezige backbone of zolang de besturende
GPIO's hoogohmig zijn, kunnen de CMOS-ingangen dus zweven. Dat kan een
willekeurige filtermodus, een onrustige tune-selectie, extra schakelruis en een
ongewenst actieve TOUT-driver geven.

Ook CS, CS2 en LDAC vertrouwen volledig op de backbone voor een veilige idle-
toestand. Alleen CLR heeft op de kernkaart een lokale 10-kohm pull-up (R901).
Dit kan een geldig systeemcontract zijn, maar dat contract en de gegarandeerde
power-upvolgorde zijn nergens sluitend vastgelegd.

**Actie:** voeg lokaal zwakke pulls toe: MODE0..2, TSEL0..2 en TEN naar laag;
CS, CS2 en LDAC naar hoog, tenzij de backbone aantoonbaar altijd eerder en
actief opkomt. Kies bijvoorbeeld 47–100 kohm zodat normale busdrivers nauwelijks
worden belast. Leg de veilige toestanden en power-sequencing vast in het
kernslot-contract.

### 3. Hoog — de vrijgavecontrole verbergt zeven losse koperitems

Met KiCad CLI 10.0.4, een tijdelijke kopie van zowel PCB als bijbehorend
projectbestand en opnieuw gevulde zones, zijn er nul unconnected pads en nul
clearancefouten. De volledige DRC rapporteert echter 417 waarschuwingen:

- vijf dangling tracks: IN12, FB7, AOUT2, AIN7 en MN8_7;
- twee dangling MODE0-vias op (198,0739; 137,3619) en
  (198,3922; 127,6151) mm;
- 199 silk-over-copper-, 199 silk-overlap- en 12 silk-edge-meldingen.

De eerdere claim “DRC 0/0” komt voort uit een controle die alleen severity
`error` toont. De zeven koperwaarschuwingen kunnen reststubs zijn en de netlist
is wel volledig verbonden, maar ze horen niet ongemotiveerd in een
productiebestand. De grote hoeveelheid silkscreenmeldingen maakt bovendien een
visuele assemblagecontrole onnodig lastig.

**Actie:** verwijder de vijf stubs en twee ongebruikte vias of motiveer en sluit
ze individueel uit. Reinig ten minste alle silkscreen bij pads, bordrand,
polariteitsmarkeringen en handgesoldeerde SSI2140's. Laat de releasecheck zowel
errors als warnings tellen en bewaar de aantallen bij het fab-pakket.

### 4. Middel — Q bereikt oscillatie met beperkte procesmarge

De DAC128S085 levert maximaal 3,3 V via 13 kohm, nominaal circa 254 uA. Het
SSI2140-datasheet noemt 222 uA typisch voor oscillatie en staat 0–500 uA toe.
De schakeling is dus elektrisch binnen bereik, maar heeft slechts circa 14%
marge boven de typische oscillatiedrempel. Chipspreiding, DAC-full-scale en de
1%-weerstand kunnen maken dat niet alle acht stemmen even overtuigend starten.

**Actie:** meet de oscillatiedrempel van alle acht stemmen bij koud, kamer- en
warm bedrijf. Reserveer voor rev 0.2 een lagere serieweerstand, bijvoorbeeld
12 kohm, wanneer de slechtste stem onvoldoende marge heeft. Begrens het normale
firmwarebereik dan zo dat alleen het bovenste deel voor zelfoscillatie wordt
gebruikt.

### 5. Middel — de vierlagenopbouw is routetechnisch, niet als PDN ontworpen

De stack is F.Cu / In1.Cu / In2.Cu / B.Cu met GND-zones op alle vier lagen. De
gerber-job beschrijft drie gelijke FR4-diëlectrica van 0,48 mm en 35-um-koper.
Dat geeft twee aangrenzende GND-lagen, terwijl buitenlagen relatief ver van hun
referentievlak liggen. Bovendien lopen MOUT7 en AOUT3 als signaal over In1.Cu,
zodat die laag niet overal het in de documentatie genoemde massieve GND-vlak
is.

Voor audio is gecontroleerde impedantie niet nodig en twee GND-lagen geven een
lage DC-impedantie. Toch moeten SPI-retourstromen op F.Cu/B.Cu om de lokale
uitsparingen en In1-signaalroutes heen kunnen. Er is geen vastgelegde
fabrikant-stack-up, PDN-doelimpedantie of controle van retourpadcontinuïteit.

**Actie:** kies en documenteer de werkelijke fab-stack-up. Houd snelle SPI-
sporen boven een ononderbroken GND-referentie, plaats GND-stitchvias naast elke
laagwissel en controleer rond de twee In1-signaalroutes dat geen snelle route
een planesleuf kruist. Een volledige impedantiesimulatie is voor dit
prototype niet vereist; een gerichte geometrische retourpadreview wel.

### 6. Middel — AD5754-initialisatie is een harde firmwarevoorwaarde

Volgens het AD5754-datasheet komen alle registers op nul en staan alle kanalen
na power-on in power-down. De eerste communicatie moet de uitgangsranges
instellen, daarna moeten de kanalen worden ingeschakeld; writes naar een
uitgeschakeld kanaal worden genegeerd. Het datasheet waarschuwt ook dat de
eerste write kan worden gemist als DVCC niet actief was voordat interfacelijnen
werden aangedreven.

De README zegt alleen dat firmware de cutoff-DAC's “centreert met marge”. Dat
is niet voldoende als uitvoerbaar initialisatiecontract en maakt een
power-cyclefout moeilijk te onderscheiden van een analoog filterprobleem.

**Actie:** leg de exacte opstartreeks vast en test cold start, brown-out en een
reset van alleen de Brain. Programmeer ranges, power-control en beginwaarden
expliciet; herhaal of verifieer de eerste write en pulse LDAC pas nadat beide
DAC's geldig zijn geconfigureerd.

### 7. Middel — 1%-pole-mixweerstanden begrenzen notch- en HP-onderdrukking

De gekozen gewichten en waarden zijn onderling consistent: 75 k, 37,4 k,
18,7 k en 12,4 k realiseren de bedoelde positieve gewichten; de afwisselende
tekens komen uit de inverterende filtertrappen. Bij high-pass, band-pass en
notch ontstaat de stopband echter door aftrekking van taps. De relatieve
weerstandsfout en spreiding tussen filtercellen bepalen daarom direct de
resterende doorlaat. Gewone losse 1%-weerstanden zijn geschikt om de functie te
bewijzen, maar niet om diepe en reproduceerbare nullen te garanderen.

**Actie:** specificeer per modus een minimale stopband/notchdiepte en meet die
voor alle stemmen over frequentie en temperatuur. Gebruik bij een strengere
eis 0,1%-weerstanden of matched arrays in de kritieke combinaties.

### 8. Laag — schema- en DRC-validatie zijn niet volledig reproduceerbaar schoon

ERC geeft geen elektrische errors, maar wel 2.892 waarschuwingen: 2.237
off-grid endpoints, 624 library mismatches en 31 meldingen over de ontbrekende
lokale `Custom`-symbol library. Dat bewijst geen fout net, maar maskeert nieuwe
waarschuwingen en maakt review in een schone omgeving zwak. In het project staat
bovendien nog `project_name: MusicBrain DAC8`, wat op gekopieerde
projectmetadata wijst.

**Actie:** maak de Custom-library reproduceerbaar beschikbaar, herstel of
gericht exclude de generatorwaarschuwingen en corrigeer de projectnaam. Laat de
generator daarna ERC, schema-PCB-netcheck en volledige DRC met een niet-nul
exitcode bij nieuwe meldingen draaien.

### 9. Middel — de grote insteekkaart heeft geen tweede mechanische steun

De 110 x 92-mm kaart heeft geen montagegat en de ontwerpdocumenten leggen geen
kaartgeleider, standoff of andere steun vast. Daarmee hangt de dubbelzijdig
bestukte kaart alleen aan de haakse 2x12-header J1, terwijl de twee audiokabels
aan J2/J3 bovenaan extra buigmoment kunnen geven. Insertion, transport en het
lostrekken van een audiokabel belasten zo zowel J1 als de soldeerverbindingen
op de backbone.

**Actie:** voeg een kaartgeleider of minimaal één mechanische bevestiging aan de
bovenrand toe en neem die op in de backbone-mechanica. Verifieer connector- en
componenthoogtes met een volledige sandwichmock-up, inclusief trekontlasting
van J2/J3. Laat de kernslotheader niet als enige draagconstructie fungeren.

### 10. Laag — testbaarheid is krap voor een analoge validatiekaart

Voeding, SPI en TOUT zijn via J1 bereikbaar, maar de vier filtertaps, EXPO,
QCTRL, VREF en de pole-mixknopen hebben geen herkenbare testpunten. Proben op
0603- en SSOP-pads verhoogt kortsluitrisico en belast juist de gevoelige knopen.

**Actie:** voeg minimaal testpads toe voor VREF, FMCVB, VCUT1, VQ1, EXPO1,
OUT1/OUT4 van stem 1 en 8, MOUT1, TIN en TOUT. Eén representatieve stem plus de
twee fysieke bordhoeken geeft al veel diagnosewaarde zonder het bord sterk te
vergroten.

## Positief geverifieerd

- De gecorrigeerde SSI2140-pinmapping komt overeen met datasheet rev. 3.1.1.
- De vier filtercellen zijn coherent gecascadeerd; de Q-VCA sluit de lus rond
  alle vier polen.
- De ingangsdeler is circa /5 en de niet-inverterende uitgangstrap circa x5;
  dit past bij de gedocumenteerde interne niveaukeuze.
- De AD5754-daisychain, externe ADR421-referentie, DAC128S085-kanaalmap en
  tune-muxmapping zijn consistent tussen generator en README.
- CLR heeft een lokale pull-up en TOUT gebruikt de open-collectoruitgang van
  de LM311; TEN schakelt de emitter via Q1.
- De PCB gebruikt vier GND-zones, heeft 0 unconnected pads en voldoet aan de
  vastgelegde 0,15-mm-clearance en 0,15-mm-minimumspoorbreedte.
- De 110 x 92-mm kaart en de drie connectorpinouts komen overeen met het
  kernslot- en jack8-contract.

## Voorgestelde vrijgavepoort

1. Verplaats alle lokale bypasscondensatoren en draai daarna volledige DRC.
2. Definieer veilige pull-states en leg het power-upcontract met de backbone
   vast.
3. Verwijder de zeven dangling koperitems en reinig kritieke silkscreen.
4. Leg een tweede mechanische kaartsteun en kabeltrekontlasting vast.
5. Maak ERC, netcheck en DRC reproduceerbaar met vastgelegde KiCad-versie en
   libraries.
6. Bestel een kleine prototypebatch en meet Q-marge, cutofftracking,
   voedings-/VREF-ruis, SPI-doorbraak, mode-niveaus, notchdiepte en tune.
7. Verwerk meetwaarden en assemblage-ervaring in rev 0.2 voordat een grotere
   batch wordt vrijgegeven.

## Geraadpleegde ontwerpbestanden

- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.kicad_sch`
- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern-io.kicad_sch`
- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern-voice1.kicad_sch`
  tot en met `musicbrain-vcf8kern-voice8.kicad_sch`
- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.kicad_pcb`
- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.kicad_pro`
- `hardware/schematics/musicbrain-vcf8kern/README.md`
- `hardware/schematics/musicbrain-vcf8kern/fab/`
- `hardware/kicad-generators/gen_vcf8kern.py`
- `doc/poly-analog-spec.md`
- `doc/data-sheets/soundsemiconductor.com/ssi2140datasheet.pdf`
- `doc/data-sheets/AD/AD5724R_5734R_5754R.pdf`
