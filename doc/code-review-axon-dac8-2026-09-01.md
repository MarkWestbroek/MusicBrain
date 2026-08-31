# Ontwerpreview MusicBrain Axon rev 0.1 en DAC8 rev 2.0

**Datum:** 2026-09-01
**Scope:** schema, PCB, generator, fab-BOM/CPL, bord-README's en de
bijbehorende firmwaredriver van Axon en DAC8.
**Conclusie:** DAC8 is elektrisch en qua layout het verst gevorderd, maar de
huidige firmware-init kan de uitgangen bij opstarten naar negatieve volle
schaal sturen. Axon heeft daarnaast twee voedingsrisico's en is met de huidige
bordregels niet DRC-schoon. Ik zou daarom geen van beide revisies als
productiegereed vrijgeven. Een kleine bring-upbatch is wel zinvol nadat de
Axon-USB-voedingsroute is begrensd en de DAC8-initvolgorde is hersteld.

## Bevindingen

### 1. Hoog — USB kan via Axon het uitgeschakelde busboard terugvoeden

Op Axon loopt USB-VBUS via D2 (SS34) naar hetzelfde `+5V`-net als J1.1. J1.1
gaat rechtstreeks naar busboard J25.1. D2 voorkomt dat bus-5V terugloopt naar
de USB-host, maar is geen scheiding tussen USB en het busboard. Met USB
aangesloten en de hoofdvoeding uit kan Axon dus niet alleen zichzelf, maar ook
het volledige 5V-net van het busboard voeden.

Dat belast een willekeurige USB-poort met een niet-gedefinieerde systeemlast en
kan andere rails via IC-beveiligingsdiodes gedeeltelijk opbrengen. De tekst
"USB-C alleen dev/flash" voorkomt dit elektrisch niet.

**Actie:** scheid ontwikkel-USB en systeem-5V met een echte power-mux,
load-switch met reverse-current blocking of een jumper die voor normaal
bedrijf open blijft. Definieer daarnaast welk deel USB mag voeden en begrens
die stroom. Test vier toestanden expliciet: alleen busvoeding, alleen USB,
beide voedingen en uitschakelen van de bus terwijl USB aangesloten blijft.

### 2. Hoog — de Axon-3V3-regelaar heeft geen gesloten worst-case budget

U3 zet 5 V lineair om naar 3,3 V voor zowel de ESP32-S3-WROOM-1U als de W5500.
De ESP32-datasheet noemt afhankelijk van radiomodus pieken tot ongeveer
355 mA; daar komen W5500, leds en overige 3V3-belastingen nog bij. Alleen al bij
500 mA dissipeert de AMS1117 ongeveer `(5,0 - 3,3) × 0,5 = 0,85 W`. Voor een
SOT-223 op een compact tweelaags bord is dat een wezenlijke temperatuurstijging,
ook al blijft de stroom onder de nominale 1 A van de regelaar.

Dit raakt ook de busboardreview: Axon deelt de 1A-5V-regelaar daar met Teensy,
USB-host en andere verbruikers. Bij voeding uit USB geldt bovendien het
onbekende stroomcontract uit punt 1.

**Actie:** maak een railbudget met gelijktijdige WiFi-TX, actief Ethernet en
worst-case omgevingstemperatuur. Bereken de junctiontemperatuur met de
werkelijke U3-koperoppervlakte en meet 3V3, U3-temperatuur en resets tijdens
een gecombineerde WiFi/Ethernet-stresstest. Kies bij onvoldoende marge een
kleine buckregelaar of voed W5500 en ESP32 uit een aantoonbaar ruimere 3V3-rail.

### 3. Hoog — Axon voldoet niet aan zijn actuele eigen DRC-regels

Een verse zone-refill en DRC met KiCad CLI 10.0.4 geeft voor de actuele
PCB-bron 153 fouten: 116 clearance-overtredingen en 37 te smalle sporen. De
gemeten afstanden liggen tussen 0,1500 en 0,1989 mm bij een ingestelde minimum-
clearance van 0,2000 mm; de gemelde sporen zijn 0,15 mm bij een boardminimum
van 0,20 mm. Er zijn geen unconnected items.

Dit kan een bewuste 0,15-mm-fabrieksklasse zijn, maar dan zijn de bordregels en
de README-claim `DRC 0/0` niet gelijk aan het ontworpen product. Als 0,20 mm
wel de eis is, is de routering niet vrijgavegereed.

**Actie:** kies en documenteer één fabricageklasse, pas de netclasses of de
routering daarop aan en genereer het fab-pakket opnieuw. Bewaar bij de release
de gebruikte KiCad-versie, zone-refillstatus en DRC-samenvatting. Vrijgave-eis:
nul onverklaarde errors, niet alleen nul unconnected items.

### 4. Hoog — DAC8 initialiseert bereik en uitgangstrappen in de verkeerde volgorde

`Dac8::begin()` schrijft eerst het power-controlregister, wacht 15 µs en zet
pas daarna het bereik op ±10 V. De AD5754-datasheet schrijft het omgekeerde
voor: na power-on staan alle registers op nul, het standaardbereik is 0–5 V,
en de eerste communicatie hoort het bereik te kiezen voordat kanalen worden
ingeschakeld.

Op dit bord is bipolaire offset-binary codering hard ingesteld. Registercode
`0x0000` betekent daarbij negatieve volle schaal. De huidige volgorde kan dus
eerst de kanalen rond 0 V inschakelen in het standaard unipolaire bereik en ze
bij de daaropvolgende bereikswijziging naar ongeveer -10 V brengen. Er wordt
vóór dat moment geen `0x8000`-midscalecode geladen.

**Actie:** schrijf eerst voor beide chips het gewenste bereik, schakel daarna
de kanalen in, wacht minimaal 10 µs en laad vervolgens expliciet een veilige
startcode voor alle acht kanalen vóór de eerste LDAC-strobe. Meet met een
oscilloscoop alle uitgangen bij power-on, MCU-reset, firmware-update en
watchdogreset. Leg vast of de veilige toestand 0 V, hold-last-value of
hoogohmig moet zijn.

### 5. Middel — de vermeende DAC8-NOP is een echt control-registercommando

Bij `Dac8::set()` krijgt de niet-geadresseerde chip geen NOP, maar een write
naar `REG_CONTROL` met data nul. Daarmee worden controlbits telkens opnieuw
naar hun nulwaarden geschreven. Dat is nu mogelijk grotendeels gelijk aan de
resetconfiguratie, maar het maakt toekomstig gebruik van CLR-select, thermal
shutdown of een ander overstroombeleid onbetrouwbaar: een enkele kanaalwrite
kan die configuratie stilzwijgend terugzetten.

**Actie:** gebruik een door de datasheet ondersteund inert daisy-chainwoord,
of vervang enkelkanaalupdates door gekoppelde frames waarin voor de andere chip
een bewust onschadelijke operatie staat. Voeg een SPI-frametest toe die zowel
woordvolgorde als de bytes voor de niet-doelchip controleert.

### 6. Middel — Ethernet-MDI loopt over een onbewezen interne kabelinterface

De W5500 staat op Axon terwijl de magnetics en RJ45 op het paneel zitten. De
analoge TX/RX-paren lopen daardoor via J3 en maximaal 15 cm interne kabel vóór
ze de transformator bereiken. Dat vergroot lusoppervlak, common-modekoppeling,
EMI en impedantievariatie op juist het on-geïsoleerde MDI-deel. De README geeft
terecht aan dat de kabel kort en paarsgewijs moet blijven, maar definieert geen
kabeltype, pin-pairing, afscherming of acceptatietest.

**Actie:** plaats bij voorkeur W5500 en magnetics op hetzelfde bord, met alleen
de geïsoleerde kabelzijde naar het paneel. Als de paneelmagnetics blijven:
definieer getwiste paren en connectorpinout als één gecontroleerde assembly,
houd magnetics en PHY zo dicht mogelijk bij elkaar en voer link-, packet-error-
en emissietests uit met de langste toegestane kabel.

### 7. Middel — Axon-voeding en paneelverbindingen zijn mechanisch foutgevoelig

J1 is een ongekeyde 1x6-header. Bij de huidige tweekabelmontage kan omkeren van
de 2-polige voedingsstekker +5 V en GND verwisselen; omkeren van de UART-kabel
verbindt TX met TX. De toekomstige directe busboardmontage vraagt bovendien
een correcte mechanische spiegeling. J3 brengt gevoelige MDI-signalen naar een
los paneelbord zonder mechanische sleutel die in het elektrische contract is
vastgelegd.

**Actie:** gebruik gepolariseerde, geshroude connectoren of voeg elektrische
ompoolbeveiliging toe. Maak voor de directe 1x6-koppeling een gemonteerde
pin-1-tekening en een verplichte doorbeltest. Behandel markeringen en
bouwinstructies als extra controle, niet als primaire beveiliging.

### 8. Middel — DAC8-foutgedrag wordt niet bewaakt of aantoonbaar begrensd

De AD5754 kan overstroom- en thermal-status terugrapporteren, maar de driver
leest deze niet uit. De 100-ohm-serieweerstanden beperken externe foutstromen
enigszins, maar maken de uitgangen niet bestand tegen elke patchfout of extern
aangelegde spanning. De control-registerinstellingen voor current clamp en
thermal shutdown worden niet bewust als productbeleid geconfigureerd en
kunnen door punt 5 worden overschreven.

**Actie:** leg het gewenste overstroom- en thermal-shutdownbeleid vast,
configureer dat één keer expliciet en lees status tijdens bring-up uit. Test
kortsluiting naar GND en, binnen een vooraf bepaalde veilige testopstelling,
mispatches naar gangbare Eurorack-rails. Controleer herstelgedrag en
chiptemperatuur; noem 100 ohm pas daarna kortsluitbescherming.

## Positief geverifieerd

- DAC8 geeft met KiCad CLI 10.0.4 na zone-refill DRC 0/0 en heeft geen
  unconnected items; ERC rapporteert geen fouten.
- De DAC8-pinout, EP-verbinding naar -12 V, offset-binarykeuze en
  MOSI → U1 → U2-daisy-chain komen overeen met de lokale AD5754-documentatie.
- De 48-bit firmwarevolgorde klopt met de fysieke keten: U2 wordt eerst en U1
  als laatste geklokt. SPI mode 1 en 8 MHz vallen binnen de IC-specificatie.
- ADR421 voedt beide REFIN-pinnen en heeft lokale 100-nF- en 10-uF-ontkoppeling.
- Bus-LDAC staat idle hoog en krijgt een gezamenlijke lage strobe, passend bij
  synchrone updates over meerdere DAC-kaarten.
- Axon ERC rapporteert geen fouten en de PCB heeft nul unconnected items.
- De actuele fab-BOMs van beide borden hebben voor alle regels een ingevuld
  LCSC-nummer; de eerdere melding over veel ongematchte Axon-onderdelen is dus
  niet meer actueel.
- De fab-Gerberarchieven zijn nieuwer dan de PCB-bronnen. Dat is consistent
  met een latere fab-export, maar vervanging blijft nodig na elke ontwerpfix.

## Voorgestelde vrijgavepoort

1. Verwijder Axon-terugvoeding vanuit USB en sluit het 5V/3V3-railbudget.
2. Maak Axon DRC-schoon tegen expliciet gekozen productieregels.
3. Herstel DAC8-init en de niet-doelchipoperatie in de firmwaredriver.
4. Bestel een kleine bring-upbatch en voer power-, startup-, fault- en
   Ethernetkabeltests uit.
5. Controleer in de JLCPCB-preview de rotatie van ESP32, W5500, USB-C,
   AD5754 en ADR421 en verifieer gepolariseerde onderdelen.
6. Ververs daarna README-status, `MODULES.md`, BOM/CPL en Gerbers en leg de
   gevalideerde bron- en fab-hashes vast.

## Tooling en beperkingen van deze review

De ontwerpbronnen zijn door KiCad 8 gegenereerd (`20240108`); de verse
controles zijn uitgevoerd met KiCad CLI 10.0.4. Verschillen door de toolversie
zijn daarom mogelijk, maar verklaren niet vanzelf waarom actuele bordregels
153 concrete Axon-overtredingen melden. De elektrische startup- en
thermische conclusies zijn nog niet op fysieke hardware gemeten; die metingen
zijn onderdeel van de voorgestelde vrijgavepoort.

## Geraadpleegde ontwerpbestanden

- `hardware/schematics/musicbrain-axon/musicbrain-axon.kicad_sch`
- `hardware/schematics/musicbrain-axon/musicbrain-axon.kicad_pcb`
- `hardware/schematics/musicbrain-axon/fab/musicbrain-axon-bom.csv`
- `hardware/schematics/musicbrain-axon/fab/musicbrain-axon-cpl.csv`
- `hardware/schematics/musicbrain-axon/README.md`
- `hardware/kicad-generators/gen_axon.py`
- `hardware/schematics/musicbrain-dac8/musicbrain-dac8.kicad_sch`
- `hardware/schematics/musicbrain-dac8/musicbrain-dac8.kicad_pcb`
- `hardware/schematics/musicbrain-dac8/fab/musicbrain-dac8-bom.csv`
- `hardware/schematics/musicbrain-dac8/fab/musicbrain-dac8-cpl.csv`
- `hardware/schematics/musicbrain-dac8/README.md`
- `hardware/kicad-generators/gen_dac8.py`
- `firmware/lib/mb-bus-cards/src/MbDac8.h`
- `firmware/lib/mb-bus-cards/src/MbBus.h`
- `doc/data-sheets/AD/AD5724R_5734R_5754R.pdf`
- `doc/data-sheets/AD5754BREZ data.md`
- `doc/axon-plan.md`
- `hardware/schematics/MODULES.md`
