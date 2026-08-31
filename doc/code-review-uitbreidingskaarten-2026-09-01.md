# Ontwerpreview MusicBrain-uitbreidingskaarten

**Datum:** 2026-09-01

**Scope:** ADC8, GATE8, GATEIN8, VCA8, VCF8-kern en testadapter,
pot-/I2C-/generieke risers, encoder-/pot-/jackfronts en de
AD5754R-breakout. Busboard, Axon, DAC8 en GSwitch zijn al afzonderlijk
gereviewd. De beide matrixvarianten vallen uitdrukkelijk buiten deze review.

**Conclusie:** de eenvoudige 2,54-mm-connectorfamilie is elektrisch passend,
goed verkrijgbaar en bruikbaar voor prototypes. Zij is niet gekeyed of
vergrendeld en de 2x12-slotverbinding is op zichzelf niet zijdelings stijf.
De keuze is daarom alleen verdedigbaar in de ontworpen complete stapel, met
de kaart onder in het busboard en boven via frontstrip en bovenplaat
vastgepakt. Ik zou de huidige kaartenset nog niet als productiegereed
vrijgeven: GATE8 en VCA8 hebben geen hardwarematig veilige power-on-toestand,
GATEIN8 heeft een nog onbewezen 3,3-V-ingangsmarge, VCF8 is niet af en
fysieke passing en bring-up ontbreken nog.

## Bevindingen

### 1. Hoog - de connectoren voorkomen geen gevaarlijke foutplaatsing

De gen-2-kaart gebruikt een ongekeyde haakse male 2x12-header en het busboard
een rechte female 2x12-socket. De frontkoppelingen zijn doorgaans eveneens
ongekeyde 1x10-headers en sockets. Geen van deze verbindingen heeft een
shroud, polarisatienok of latch. Silkscreen en de vierkante pin-1-pad helpen
bij assemblage, maar maken omkeren of verkeerd uitlijnen niet mechanisch
onmogelijk.

Dat is niet alleen een diagnoseprobleem. Bij een verkeerd geplaatste
buskaart kunnen voedingsrails op klok- of audiosignalen terechtkomen. Bij de
potfrontkoppeling staan GND en +3V3 aan de uiteinden; omkeren kan die rail dus
verkeerd aanbieden. De README's van potriser, I2C-riser en encoderfront noemen
de eerste pin-1-passing terecht nog als open punt.

**Actie:** maak vóór inschakelen een verplichte mechanische passing en
doorbeltest voor elk uniek paar. Controleer pin 1, de voedingspinnen en
afwezigheid van kortsluiting. Voeg daarna minimaal een niet-elektrische
polarisatie toe, bijvoorbeeld een geblokkeerde positie, geleideprofiel of
mechanische aanslag. Gebruik voor verbindingen die bij onderhoud los kunnen
een keyed/shrouded alternatief. Markeringen blijven een tweede controle.

### 2. Hoog - de connector is alleen stabiel in de complete mechanische stapel

De eigen mechanicaspecificatie zegt expliciet dat de female 2x12-socket goed
elektrisch contact geeft en de kaart vasthoudt, maar weinig zijdelingse
stijfheid biedt. De primaire fixatie ontstaat pas doordat de paneelconnector
boven in de frontstrip valt en pot-, encoder- of jackmoeren die strip aan de
bovenplaat klemmen. De kaart wordt dan onder en boven vastgepakt. Dat is een
redelijk tweepuntsconcept; de busheader alleen is geen kaartgeleider.

De gekozen concrete delen zijn gangbare THT-componenten: HCTL
PZ254-2-12-W-8.5 (`C2894992`) met een 6-mm-mating-pin en Hong Cheng
HC-PM254-8.5H-2x12PZ (`C22373917`). LCSC vermeldde tijdens deze review
respectievelijk 3490 en 1026 stuks op voorraad, 2,54-mm-steek en 3 A per
contact. Dat ondersteunt verkrijgbaarheid en het elektrische gebruik. De
beschikbare fabrikantgegevens geven echter geen retentiekracht, toegestaan
buigmoment, mating-cycle-rating of trillingskwalificatie. Daaruit volgt geen
productieclaim over mechanische levensduur.

**Oordeel:** behoud deze connector voor de eerste prototypes; hij is simpel,
goedkoop en vervangbaar. Sta geen gebruik van een losse kaart toe zonder de
bovenfixatie. Bevestig de productiekeuze pas na een gemonteerde
zijdelingse-bewegingstest, herhaalde insertie, kabel-/bedieningsbelasting en
een transporttest. Reserveer voor zware of hoge kaarten de al voorgestelde
steunlat of bovenhoekfixatie. Een exotische nieuwe busconnector is niet de
eerste stap; keying en het bewijzen van de complete constructie wel.

### 3. Hoog - GATE8 kan tijdens power-on of MCU-reset willekeurige gates geven

Op GATE8 staat `~OE` van de 74HCT595 permanent aan GND en `~SRCLR` permanent
aan +5V. De uitgangen zijn dus altijd enabled en er is geen hardware-reset
van het schuif- of uitgangsregister. `Gate8::begin()` zet alleen CS hoog; het
schrijft geen nulwoord. Tot de eerste expliciete `write(0)` is de toestand na
inschakelen niet als acht lage gates gegarandeerd.

Een ongewenste hoge uitgang kan bij boot een envelop, trigger of downstream
schakeling activeren. Hetzelfde risico bestaat bij een MCU-reset terwijl de
5-V-rail en de 595 actief blijven.

**Actie:** maak de veilige toestand hardwarematig. De voorkeur is `~OE` met
een pulldown/-up en door de host gecontroleerde enable, zodat de outputs pas
na een geldig nulwoord actief worden; gebruik daarnaast `~SRCLR` voor een
gedefinieerde reset. Als rev 2.0 ongewijzigd wordt geprototypet, moet
`begin()` onmiddellijk `write(0)` uitvoeren en moeten power-on, brown-out,
watchdog- en firmware-updateresets met alle acht uitgangen worden gescoped.
Firmware alleen is voor productvrijgave geen volledige fail-safe.

### 4. Hoog - VCA8 start op unity gain en de gedocumenteerde mute bestaat nog niet

De DAC128S085-uitgangen starten op 0 V. Voor de SSI2164 betekent 0 V ongeveer
unity gain; circa 3,3 V geeft juist sterke verzwakking. De kaart-README meldt
dit correct en stelt dat firmware als eerste actie alle kanalen naar ongeveer
-100 dB schrijft. In de huidige firmwareboom is echter geen VCA8-driver of
startupimplementatie gevonden die die belofte uitvoert.

Daarmee kan audio tijdens opstarten, MCU-reset of een firmwarecrash op vol
niveau doorlopen. De RC-slew van ongeveer 0,5 ms voorkomt dit niet; die maakt
alleen een eenmaal gegeven regelstap geleidelijker.

**Actie:** voeg vóór integratie een driver toe die eerst de maximaal gedempte
codes laadt en verifieer de werkelijke DAC-updateprocedure. Test met actieve
audio alle voedings- en resetpaden. Voor een robuuste productrevisie is een
hardwarematige mute/enable gewenst die pas vrijkomt nadat geldige mute-codes
zijn geladen.

### 5. Hoog - VCF8-kern en testadapter zijn nog geen bestelbare ontwerpen

De actuele statusbron noemt VCF8-kern rev 0.1 `routing 99%`, met resterend
handwerk, en de testadapter `in ontwerp`, zonder afgeronde routing en fab. Een
verse KiCad-10.0.4-controle van de huidige VCF8-PCB rapporteerde 443
waarschuwingen en 15 open verbindingen; veel daarvan zijn GND-zone- of
stitchinggerelateerd, maar zij zijn niet stilzwijgend gelijk aan DRC 0/0.

Ook na het sluiten van de routing blijft dit terecht een validatieprototype.
De acht SSI2140-kernen, twee precisie-DAC's, Q-DAC, passieve pole-mixers,
geografische 4051-mapping, tune-comparator en dubbelzijdige assemblage maken
de analoge en productie-onzekerheid groot. De testadapter is juist een goede
manier om die functies zonder de volledige backbone te isoleren, maar moet
eerst zelf worden afgerond.

**Actie:** voltooi eerst de testadapter, sluit alle VCF8-netten en voer een
verse zone-refill, DRC, netcheck en Gerberinspectie uit. Bestel daarna alleen
een kleine kern-/adapterbatch. Meet per stem cutoffbereik en 1-V/oct-tracking,
Q en zelfoscillatie, alle acht modi inclusief notchdiepte, LDAC-gelijktijdigheid,
tune-muxmapping, VREF-ruis, voedingsmarge en temperatuurdrift. Controleer alle
SMD-rotaties en de handgesoldeerde SSI2140's afzonderlijk.

### 6. Middel - GATEIN8 heeft een onbewezen drempel voor lage 3,3-V-gates

Elke GATEIN8-ingang gaat door 100 kohm serie naar een knoop met 100 kohm naar
GND. Binnen het niet-clampende bereik halveert dit het aangeboden niveau. De
74HC165 draait op 3,3 V en heeft een gewone CMOS-ingang, geen expliciete
Schmitt-trigger. Een ingang van 3,3 V levert nominaal ongeveer 1,65 V aan de
HC165. Dat is niet automatisch een gegarandeerde HIGH over voeding,
temperatuur en onderdeelspreiding.

Voor 5-V- en hogere Eurorack-gates is meer marge aanwezig en de BAT54S-clamps
met hoge serieweerstand beperken foutstroom verstandig. Maar compatibiliteit
met alle 3,3-V-bronnen is zonder datasheet-worst-case en meting niet bewezen;
langzame flanken kunnen bovendien rond de CMOS-drempel extra gevoelig zijn.

**Actie:** leg een minimale gegarandeerde externe HIGH vast en meet alle acht
kanalen bij minimum/nominaal/maximum voeding en met snelle én langzame flanken.
Als 3,3-V-compatibiliteit vereist is, gebruik een passende Schmitt-buffer of
comparator en dimensioneer de deler/clamp rond een expliciete drempel.

### 7. Middel - ADC8 SPI-mode, lokale reset en eerste sample zijn bring-up-TODO's

`MbAdc8` gebruikt 8 MHz en SPI mode 2, maar bevat nog expliciet de TODO om de
SPI-mode tijdens bring-up te verifiëren. RESET komt niet meer van de bus: een
lokale 100-kohm/100-nF-koppeling maakt bij power-on een puls met een
tijdconstante van ongeveer 10 ms. De driver wacht op BUSY, maar koppelt de
eerste CONVST niet expliciet aan het einde van die lokale reset en verwerpt
geen eerste sample.

**Actie:** bevestig mode en flankrelaties tegen de exacte AD7606-variant en
scope RESET, CONVST, BUSY, CS, SCLK en DOUT bij cold boot en brown-out. Start
op 2 MHz, lees bekende DC-niveaus en voer pas op naar 4/8 MHz na foutvrije
metingen. Definieer bootwachttijd en zo nodig het weggooien van de eerste
conversie in de driver.

### 8. Middel - GATEIN8-latchtiming is analoog bepaald maar niet gemeten

De CS-neerflank wordt via 220 pF naar `~PL` gekoppeld; 10 kohm trekt de lijn
terug naar 3V3. Firmware wacht 5 us voordat de eerste klok wordt gegeven. Het
principe is coherent: de korte lage puls moet de parallelle inputs laden en
voor SCLK weer verdwenen zijn. Pulsbreedte, flank en marge hangen echter af
van componenttolerantie, parasieten en de werkelijke ingangsdrempel.

**Actie:** scope CS, `~PL` en de eerste SCLK-flank op het verste
temperatuur-/voedingspunt. Accepteer alleen als de minimale `~PL`-puls en de
recovery vóór SCLK aantoonbaar aan de 74HC165-timing voldoen. Leg daarna de
benodigde firmwaredelay als hardwarecontract vast.

### 9. Middel - de vrijgavestatus is niet reproduceerbaar met de actuele CLI

`MODULES.md` definieert `bestelbaar` als ERC 0, netcheck OK, DRC 0/0 en een
ververst fab-pakket. Zonder wijziging of zone-refill rapporteerde KiCad CLI
10.0.4 op de actuele bronnen:

| Kaart | DRC-waarschuwingen | Open verbindingen |
|---|---:|---:|
| ADC8 | 80 | 0 |
| GATE8 | 60 | 24 |
| GATEIN8 | 124 | 41 |
| VCA8 | 322 | 0 |
| VCF8-kern | 443 | 15 |

De waarschuwingen zijn hoofdzakelijk silk-overlap/-edge, co-located holes en
dangling stitching-via's. De open verbindingen op GATE8/GATEIN8/VCF8 zijn in
de steekproef hoofdzakelijk tussen GND-pads, zones, sporen en stitching-via's.
Een tijdelijke refill kan een deel daarvan oplossen, maar de huidige release
legt die stap, ondersteunde KiCad-versie en resterende uitzonderingen niet
reproduceerbaar vast. De tabel is daarom geen bewijs van vijf slechte
netlijsten; hij weerlegt wel een ongekwalificeerde actuele `DRC 0/0`-claim.

**Actie:** definieer één releasecommando met KiCad-versie, librarysetup en
zone-refill op een tijdelijke kopie. Rapporteer errors, waarschuwingen,
exclusions en unconnected items afzonderlijk. Los dangling signaalsporen op en
sluit alleen bewust beoordeelde geometrische meldingen lokaal uit. Ververs
daarna fabpakket en status in dezelfde wijziging.

### 10. Middel - meerdere front-/riser-aannames moeten nog fysiek worden gesloten

- `pot8front` gebruikt een aangenomen `SHAFT_OFFSET` van 4,5 mm die vóór
  paneelfabricage aan de echte RK097N moet worden gemeten.
- `potriser`, `i2criser` en `enc5front` noemen pin-1-passing nog open.
- `jack8` en `jack4` vereisen JP1 dicht voor inputs en open voor outputs. Dit
  is een handmatige variantkeuze zonder elektrische foutpreventie.
- MCP3208, AD7606, AD5754/ADR421 en enkele overige SMD-delen staan nog voor
  rotatiecontrole in de assemblagepreview. Bij `enc5front` is de QFN-rotatie
  wel als gecontroleerd gemarkeerd.
- De I2C-riser vertrouwt op de centrale 2k2-pull-ups; rise time met de echte
  frontkaart en eventuele Qwiic-uitbreiding is nog niet gemeten.

**Actie:** maak één first-article-checklist per keten: mechanische passing,
pin-1-doorbeltest, as-/paneelmaat, connectorvolledige insteek, JLC-preview,
jacknormalling en een functionele test. Meet bij de encoderketen SDA/SCL aan
master en front met de maximaal toegestane busbezetting.

### 11. Laag - 8 MHz is een einddoel, geen veilige standaard voor eerste bring-up

ADC8, GATE8 en GATEIN8 gebruiken in de huidige drivers direct 8 MHz. De
busspecificatie adviseert te starten op 2-4 MHz en pas na validatie op te
voeren. GATE8 is write-only en heeft geen protocolfeedback; incidentele
shiftfouten zijn daar dus niet softwarematig zichtbaar.

**Actie:** maak de bring-upfrequentie configureerbaar en test 2, 4 en 8 MHz
met de maximale kaartbezetting. Scope SCLK en data op het eerste en laatste
slot. Houd 8 MHz alleen als standaard wanneer setup/hold, overshoot en
langdurige foutkans aantoonbaar voldoende marge hebben.

## Status per kaart

| Kaart | Reviewstatus | Eerstvolgende poort |
|---|---|---|
| ADC8 rev 2.0 | Prototypebestelbaar met voorbehoud | SPI/reset/first-sample, AD7606-rotatie en ingangskalibratie |
| GATE8 rev 2.0 | Niet productiegereed | Veilige output-enable/reset en power-on-scope |
| GATEIN8 rev 2.0 | Prototypebestelbaar met voorbehoud | 3,3-V-drempel en RC-latchtiming meten |
| VCA8 rev 0.1 | Niet productiegereed | Hardware/firmware-mute, SSI2164-assemblage en audiobring-up |
| VCF8-kern rev 0.1 | Niet bestelbaar | Routing/DRC sluiten en met testadapter valideren |
| VCF8-testadapter rev 0.1 | Niet bestelbaar | Routing en fabpakket afronden |
| Potriser rev 2.0 | Prototypebestelbaar met voorbehoud | Pin-1-passing, MCP3208-rotatie en achtkanaalstest |
| I2C-riser rev 2.0 | Prototypebestelbaar met voorbehoud | Pin-1-passing en rise-time met echt front |
| Generieke riser rev 2.0 | Alleen dev/prototype | Volledige 2x12-passing en mechanische fixatie |
| Encoderfront rev 2.0 | Prototypebestelbaar met voorbehoud | Passing, IRQ-/draairichtingstest en mechanische belasting |
| Potfront rev 1.1 | Paneelfab nog blokkeren | Werkelijke shaft-offset en passing meten |
| Jack8/jack4 rev 2.0 | Prototypebestelbaar met variantcontrole | JP1-normalling, passing en jackbelasting testen |
| AD5754R-breakout rev 1.0 | Gen-1 prototypeonderdeel | Rotaties, veilige DAC-init en relatie met actuele architectuur bevestigen |

## Positief geverifieerd

- De gen-2-pinout en connectorgeometrie komen centraal uit `bus.py`; kaarten
  gebruiken via `j1_map()` alleen de bedoelde busnetten.
- De bus bevat veel afgewisselde GND-pinnen en een guard vóór de audioklokken.
- De connectorfamilie is standaard, goedkoop, THT, vervangbaar en tijdens de
  review direct uit voorraad leverbaar.
- De bovenplaat/frontstrip vormt een doordacht tweede steunpunt; het ontwerp
  vertrouwt conceptueel dus niet op de bussocket alleen.
- ADC8 heeft simultane conversie, lokale inputserieweerstanden en een
  selecteerbaar bereik; de firmware spiegelt de fysieke kanaalvolgorde terug.
- GATEIN8 heeft serieweerstanden, pulldowns, railclamps en een tri-state
  MISO-buffer. GATE8 heeft 1-kohm-serieweerstanden aan alle uitgangen.
- De frontcontracten zijn consequent: dezelfde jackstrip kan voor ADC-, gate-
  en andere achtkanaalsverbindingen worden gebruikt.
- De VCF8-testadapterstrategie verlaagt de bring-uprisico's door de analoge
  kern los van de volledige backbone te kunnen testen.

## Voorgestelde vrijgavepoort

1. Maak GATE8 en VCA8 aantoonbaar stil/inactief bij alle power- en resetpaden.
2. Sluit GATEIN8-drempel en latchtiming en ADC8-mode/reset met benchmetingen.
3. Voer de volledige connector-/bovenplaatpassing uit, inclusief keyingbesluit,
   insertiecycli, bedieningsbelasting en transportproef.
4. Rond VCF8-testadapter en VCF8-routing af en behandel de eerste VCF8-batch
   uitsluitend als analoog validatieprototype.
5. Maak ERC/netcheck/zone-refill/DRC reproduceerbaar voor de gekozen
   KiCad-versie en ververs fabbestanden en statustabel.
6. Bestel daarna kleine first-article-batches per unieke kaart/frontketen en
   bewaar meetresultaten, assemblagepreview en serienummers bij de release.

## Tooling en beperkingen

De verse PCB-controles zijn uitgevoerd met KiCad CLI 10.0.4 op bronnen in
KiCad-formaat `20240108`, zonder de bronbestanden te wijzigen. Er is in deze
review geen tijdelijke GUI-zone-refill uitgevoerd. Connectorvoorraad is een
momentopname van LCSC op 2026-09-01 en geen second-sourcegarantie. Startup,
drempels, signaalintegriteit en mechanische levensduur zijn afgeleid uit de
ontwerpbronnen maar nog niet op fysieke hardware gemeten; juist daarom staan
zij in de vrijgavepoort.

## Geraadpleegde ontwerpbestanden

- `doc/spi-bus-spec.md`
- `doc/poly-analog-spec.md`
- `hardware/kicad-generators/bus.py`
- `hardware/kicad-generators/jlc_fix.py`
- `hardware/kicad-generators/gen_adc_sch.py`
- `hardware/kicad-generators/gen_gate.py`
- `hardware/kicad-generators/gen_gatein.py`
- `hardware/kicad-generators/gen_vca8.py`
- `hardware/kicad-generators/gen_vcf8kern.py`
- `hardware/schematics/MODULES.md`
- de schema-, PCB-, README- en fabbestanden onder
  `hardware/schematics/musicbrain-{adc8,gate8,gatein8,vca8,vcf8kern}/`
- de README- en fabbestanden van potriser, I2C-riser, generieke riser,
  encoderfront, potfront, jack8, jack4 en AD5754R-breakout
- `firmware/lib/mb-bus-cards/src/MbAdc8.h`
- `firmware/lib/mb-bus-cards/src/MbGate8.h`
- `firmware/lib/mb-bus-cards/src/MbGateIn8.h`