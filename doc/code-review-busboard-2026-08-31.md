# Ontwerpreview MusicBrain-busboard rev 3.1

**Datum:** 2026-08-31
**Scope:** schema, PCB, fab-BOM/CPL en de documenten `spi-bus-spec.md`,
`busboard-v3-plan.md`, `axon-plan.md` en de bord-README.
**Conclusie:** de functionele opzet en pinmapping zien er consistent uit, maar
ik zou rev 3.1 nog niet zonder voorbehoud als productiebestelbaar markeren. Een
kleine prototypebatch is verdedigbaar nadat punt 1 is doorgerekend; voor een
grotere bestelling moeten punten 1 en 2 aantoonbaar gesloten zijn.

## Bevindingen

### 1. Hoog — het gezamenlijke voedingsbudget is niet sluitend

U2 levert maximaal 1 A op 5 V. Uit dezelfde rail worden de Teensy VIN,
USB-host (tot 500 mA), de AMS1117 voor alle 3V3-logica, de codec-header en
J25 voor Axon gevoed. Axon bevat een ESP32-S3 plus W5500; samen met USB en de
Teensy kan die combinatie de 1 A al benaderen of overschrijden, nog vóór
slotkaarten en codec zijn meegerekend. Ook voor U3 ontbreekt een maximale
3V3-belasting en thermische berekening.

Daarnaast zijn +12 V, -12 V, +5 V en +3V3 in het actuele tweelaags bord
grotendeels als 0,35-mm-sporen gerouteerd. Dat is niet vanzelfsprekend passend
voor een backplane die zes slots, twee hubs, CAN-voeding en lokale regelaars
voedt. DRC controleert afstand, niet spanningsval, temperatuurstijging of
connectorbelasting.

**Actie:** maak een railbudget per verbruiker met continu-, piek- en
inschakelstroom. Leg daarna per rail een toegestane spanningsval en
temperatuurstijging vast en dimensioneer de hoofdspines daarop. Overweeg voor
5 V een regelaar met meer marge of een afzonderlijke, begrensde USB/Axon-rail.
Meet op het prototype 5 V en 3V3 bij gelijktijdige USB-hostbelasting, actieve
WiFi/Ethernet en de zwaarste kaartbezetting.

### 2. Hoog — de audioklokbus is elektrisch nog een onbewezen multidrop-net

MCLK, BCLK en LRCLK lopen van de Teensy/codec-zone naar zes slots en J24. Het
zijn vertakte netten met lange stubs, laagwissels en geen bronterminatie per
klok. MCLK is 12,288 MHz, maar de relevante grootheid is de flanksteilheid van
de driver; daardoor kan deze geometrie ook bij 12 MHz al ringing, dubbele
klokken en overshoot geven. Pin 20 als GND naast het audioblok helpt de
connectorovergang, maar voorkomt reflecties op de backplane niet.

De spec noemt deze SI-review zelf nog open. Daarmee is “bestelbaar” momenteel
sterker dan de onderliggende ontwerpstatus.

**Actie:** kies één fysieke klokbron als standaard, plaats footprints voor
bronserieweerstanden in MCLK/BCLK/LRCLK en leg vast dat alle andere bronnen
hoogohmig blijven. Controleer MCLK en BCLK met een snelle probe aan slot 1,
slot 6 en J24, eerst leeg en daarna met maximale kaartbezetting. Acceptatie:
geen dubbele drempelpassages en overshoot/undershoot binnen de absolute maxima
van alle aangesloten 3V3-ingangen.

### 3. Middel — externe poorten missen fout- en transientbegrenzing

J23 is een passieve USB-host-doorvoer. VBUS heeft geen eigen stroomschakelaar,
polyfuse of foutmelding en D+/D- hebben op het busboard geen ESD-componenten.
J16 voert CAN en onbegrensde +12 V naar een kabel, maar heeft evenmin een
zekering/PTC of TVS-beveiliging. Dit kan bij een intern prototype werken, maar
een paneelconnector is een andere foutomgeving dan een interne header.

**Actie:** plaats USB-ESD bij de paneelconnector en gebruik een current-limited
high-side switch voor VBUS. Beveilig CANH/CANL bij de kabelingang met een
geschikte CAN-TVS en begrens de meegevoerde +12 V afzonderlijk. Als deze
componenten bewust op een paneel-/satellietbord komen, maak dat bord onderdeel
van het elektrische contract en verbied een kale kabel naar buiten.

### 4. Middel — J25 kan bij één omgekeerde stekker Axon beschadigen

J25 is een ongekeyde 1x2-header met +5 V en GND. Het Axon-plan benoemt zelf dat
omkeren de ESP32-sidecar kan beschadigen. Een vierkante pad en silkscreen zijn
goede assemblagehulp, maar geen foutpreventie bij onderhoud in een kast.

**Actie:** gebruik een gepolariseerde connector of voeg op Axon ten minste
ompoolbeveiliging toe. Behandel alleen een tekstuele montage-instructie niet als
voldoende mitigatie voor een voedingsconnector.

### 5. Middel — de vrijgavecontrole is niet reproduceerbaar schoon

Met KiCad CLI 10.0.4 gaf de bron zonder zone-refill 206 DRC-meldingen en één
schijnbaar los GND-item. Na refill op een tijdelijke kopie verdween het losse
item, maar bleven 190 waarschuwingen over: onder andere 23 co-located holes,
13 dangling tracks en veel silkscreen-overlap. De dubbele boorgaten en losse
spoorstubs komen uit de routeringsuitvoer en horen vóór vrijgave opgeschoond of
gemotiveerd uitgesloten te worden.

ERC rapporteert 1123 waarschuwingen, vrijwel geheel `endpoint_off_grid`,
library-mismatch en ontbrekende lokale `Custom`-library. De PCB/schemaparity-
check rapporteerde eerst 29 verschillen; na het opslaan van de tijdelijke
KiCad-10-kopie kon parity niet meer draaien omdat KiCad het schema niet als
volledig geannoteerd herkende. Dit bewijst geen verkeerde netlijst, maar maakt
de claim “ERC 0, DRC 0/0” niet reproduceerbaar in de huidige toolomgeving.

**Actie:** leg de ondersteunde KiCad-versie en library setup vast, draai de
repo-eigen pad-voor-pad-netcheck opnieuw, verwijder dubbele via's en dangling
stubs, en bewaar de ERC/DRC/netcheck-commando's plus samenvatting bij de
release. Tel waarschuwingen niet stilzwijgend als nul; sluit ze gericht uit of
los ze op.

### 6. Laag — documentatie bevat meerdere verouderde bronnen van waarheid

`spi-bus-spec.md` verwijst nog naar `musicbrain-busboard-v2`, toont deels de
gen-1 Teensy-pintoewijzing en noemt vijf montagegaten, terwijl rev 3.1 zes gaten
heeft. `busboard-v3-plan.md` noemt rev 3.0 en een 1x5 J23; het actuele bord is
rev 3.1 met 2x5 doorvoer. De bord-README is op die punten actueler.

**Actie:** actualiseer de leidende spec naar rev 3.1 en splits historische
gen-1-tabellen expliciet af. Laat de status “bestelbaar” verwijzen naar een
gedateerde releasecheck en naar de nog geldende beperkingen.

## Positief geverifieerd

- Alle zes slots gebruiken de gen-2 2x12-pinout; pin 20 is GND en pinnen
  21-24 dragen MCLK, BCLK, LRCLK en een slotspecifieke I2S-datalijn.
- J24 verzamelt de drie klokken, I2SD1-6 en vijf GND-pinnen zoals gepland.
- SCLK en MOSI hebben 33-ohm bronserieweerstanden bij de Teensy.
- CAN-terminatie is selecteerbaar met JP1 en 120 ohm.
- Lokale 100-nF-ontkoppeling is aanwezig bij de digitale IC's; de vier
  voedingsrails hebben elk een 10-uF/100-nF-paar.
- De bordmaat is 203,2 x 128,5 mm en de zes slots staan op 20,32-mm-steek.
- BOM en CPL bevatten de rev-3.1-delta's J22, J23, J24 en J25 en U2 is als
  R-78E5.0-1.0 gespecificeerd.

## Voorgestelde vrijgavepoort

1. Sluit het worst-case railbudget en pas regelaar/spoorbreedtes zo nodig aan.
2. Reinig de DRC-waarschuwingen en maak ERC + netcheck + DRC reproduceerbaar.
3. Bestel een kleine prototypebatch en doe power-, USB-fout- en klokmetingen.
4. Verwerk de meetresultaten en actualiseer spec, README en fab-pakket.
5. Markeer daarna pas een concrete revisie en fab-hash als productiebestelbaar.

## Geraadpleegde ontwerpbestanden

- `hardware/schematics/musicbrain-busboard/musicbrain-busboard.kicad_sch`
- `hardware/schematics/musicbrain-busboard/musicbrain-busboard.kicad_pcb`
- `hardware/schematics/musicbrain-busboard/fab/musicbrain-busboard-bom.csv`
- `hardware/schematics/musicbrain-busboard/fab/musicbrain-busboard-cpl.csv`
- `hardware/schematics/musicbrain-busboard/README.md`
- `doc/spi-bus-spec.md`
- `doc/busboard-v3-plan.md`
- `doc/axon-plan.md`