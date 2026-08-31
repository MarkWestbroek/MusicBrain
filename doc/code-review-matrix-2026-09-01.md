# Code-review MusicBrain Matrix — 2026-09-01

## Scope en conclusie

Hoofdscope is `musicbrain-matrix-c` rev 0.3c: dit is volgens `MODULES.md`
de gekozen matrixvariant. `musicbrain-matrix` rev 0.2 is alleen als
elektrisch identiek plaatsingsalternatief meegenomen. Verder beoordeeld:

- `hardware/kicad-generators/gen_matrix.py`;
- schema, PCB, README en fab-pakket van `musicbrain-matrix-c`;
- het MT8816-datasheet in `doc/data-sheets/switch-matrices/`;
- `doc/plans/analog-patch-matrix.md` en `doc/poly-analog-spec.md`;
- de patcherregels in de editor.

De digitale en analoge nettoewijzing klopt. KiCad 10.0.4 geeft ERC 0,
DRC 0/0 en 0 unconnected pads; `cardlib.netcheck()` geeft `NETCHECK OK`.
De per-chip CS-decodering, MT8816-pinout en center-mapping zijn logisch
consistent.

**Advies: status terug van “bestelbaar” naar “niet bestellen”.** Er zijn
drie directe fab-blokkers: twee omgekeerde negatieve elco's, geen
deterministische power-on reset en geen mechanische bordbevestiging.

## Hoge bevindingen

### H1 — C33 en C34 staan omgekeerd over de negatieve rails

C33 is aangesloten met pad 1 (plus) aan `-12V` en pad 2 aan GND. C34 heeft
pad 1 aan `VEE6` (-6 V) en pad 2 aan GND. Beide 10 µF/25 V aluminium-elco's
staan dus continu circa 12 V respectievelijk 6 V in sperrichting.

Dit kan hoge lekstroom, opwarming, gasvorming en uiteindelijk falen geven.
Het fab-pakket bestukt beide als C3343, dus deze fout gaat daadwerkelijk mee
naar assemblage. De edge-variant gebruikt dezelfde generator en heeft
dezelfde fout.

Aanpak:

1. Draai voor C33 en C34 de netmap om: pad 1 naar GND, pad 2 naar de
   negatieve rail.
2. Pas zowel schema als PCB-generator aan en regenereer beide varianten en
   het Matrix-C-fabpakket.
3. Voeg een generatorassertie toe die voor gepolariseerde condensatoren op
   negatieve rails expliciet de pluspad aan het hogere potentiaal controleert.
4. Controleer de JLC-plaatsingspreview op de streepzijde van alle vijf elco's.

### H2 — Crosspoints kunnen ongedefinieerd ingeschakeld opkomen

U9 en U10 hebben `/SRCLR` permanent aan +5 V en `/OE` permanent aan GND.
Een 74AHCT595 definieert zijn opslagregister niet bij power-up. Daardoor
kunnen onder andere `RST`, `STB`, `G0..G2` en `DECEN` willekeurig opkomen.
U14 kan dan een willekeurige MT8816 selecteren en een STROBE-overgang kan
onbedoelde crosspoints schrijven.

Het MT8816-datasheet geeft hiervoor juist een asynchrone, actief-hoge RESET:
een RESET-puls van minimaal 40 ns wist alle 128 crosspoints onafhankelijk van
CS. Het huidige bord heeft geen supervisor, RC-power-on reset, resetheader of
directe resetlijn vanaf de besturing. Firmware kan de matrix achteraf wissen,
maar garandeert niet dat bronnen tijdens opstarten nooit kort aan elkaar of
aan een verkeerde bestemming hangen.

Aanpak:

1. Voeg een echte power-on-reset toe die `/RST` gegarandeerd hoog houdt tot
   +5 V en ±6 V geldig zijn, en die niet door een willekeurige U10-uitgang kan
   worden tegengewerkt.
2. Maak indien mogelijk een hardware-reset vanuit de Brain beschikbaar;
   het slotcontract heeft nu geen gebruikte resetpin.
3. Test cold start, brown-out, snelle herstart en verlies van één voedingsrail
   met meerdere actieve audiobronnen.

### H3 — Het bord heeft geen montagegaten

Matrix-C is 154 × 133 mm en draagt acht DIP-40-sockets plus 24 verticale
1×10-kabelheaders. Toch bevat schema, PCB en NPTH-drillbestand geen enkel
montagegat. De 2×12-busconnector is een kabelconnector en kan het bord niet
mechanisch dragen. In- en uitplugkrachten komen daardoor rechtstreeks op PCB,
soldeerverbindingen en kabels terecht.

Aanpak:

1. Voeg minimaal vier M3-NPTH-gaten met passende courtyard en koperkeepout
   toe, bij voorkeur aangevuld met een middensteun als de kastbodem dat
   toelaat.
2. Leg positie, standoffhoogte en vrije gereedschapsruimte vast in README en
   kasttekening.
3. Controleer bereikbaarheid met alle kabelheaders en DIP-sockets bestukt.

## Middelhoge bevindingen

### M1 — Geen bescherming tegen signalen buiten VEE…VDD

Het MT8816-datasheet staat analoge signalen alleen tussen VEE en VDD toe;
absolute maximum is slechts ongeveer 0,3 V daarbuiten. Matrix-C regelt deze
rails op circa -6 V en +6 V en specificeert ±5 V nominaal. Er is dus ongeveer
1 V nominale marge, zonder serieweerstand, clamp of overspanningsdetectie op
de 192 audiolijnen.

Dat is alleen veilig als elke aangesloten kaart bij normale werking,
opstarten, uitschakelen, zelfoscillatie en fouttoestand binnen deze grenzen
blijft. De systeemspecificatie noemt resonantiepieken expliciet als nog te
schalen punt. Ook kunnen module-uitgangen tijdens rail-sequencing actief zijn
terwijl de lokale ±6 V nog niet geldig is.

Aanpak: maak een systeembreed amplitude- en sequencingbudget. Test minimaal
±5 V sinus, maximale VCF-zelfoscillatie, asymmetrische railstart en een
foutpatch. Voeg waar nodig serieweerstanden/clamps toe of schaal bronnen vóór
de matrix. Houd rekening met capaciteit en vervorming van elke clampkeuze.

### M2 — De binnenlagen zijn geen ononderbroken ground planes

De PCB heeft vier signaallagen en GND-zones op alle vier. De router gebruikt
echter alle lagen voor 0,20 mm-sporen:

| laag | audiosegmenten | control/power |
|---|---:|---:|
| F.Cu | 670 | 329 |
| In1.Cu | 437 | 211 |
| In2.Cu | 535 | 72 |
| B.Cu | 518 | 263 |

De twee binnenlagen bevatten dus 1.255 segmenten, waarvan 972 audio. Hun
GND-vlakken zijn sterk versneden; een spoor op de ene binnenlaag heeft niet
overal een continue nabijgelegen retourlaag. De 4-laagsopbouw vermindert
routingdruk, maar bewijst niet automatisch lage overspraak.

Aanpak: voor een volgende route minstens één binnenlaag als ononderbroken
GND reserveren en audio bij voorkeur boven dat vlak houden. Voor deze proto
crosstalk meten met worst-case lange parallelle netten, control-bus actief,
10 kΩ belasting en maximale nominale amplitude. Het datasheet noemt bij zijn
testopstelling bovendien 30 mVpp control-input-crosstalk als relevante orde.

### M3 — Meerdere bronnen naar één bestemming zijn niet begrensd

De hardware laat elk willekeurig patroon van crosspoints toe. Eén bron naar
meerdere bestemmingen (multing) is bedoeld. Meerdere actieve bronnen naar
dezelfde bestemming verbinden daarentegen de bronuitgangen via twee
MT8816-schakelaars met elkaar. Sommige eigen kaarten hebben 100–220 Ω
serie-uitgangen, maar dit is geen gedefinieerde mixer en niet voor alle
toekomstige bronnen gegarandeerd.

De editor controleert alleen richting en signaaltype; zowel Graph- als
Matrix-weergave kan meerdere bronnen aan dezelfde ingang toevoegen. Er is
geen zichtbaar hardwarecontract dat dit afwijst of als passieve som
kwalificeert.

Aanpak: maak per bestemmingspoort exclusiviteit de standaard in editor,
patchvalidatie en firmware. Alleen expliciete `mixer`-bestemmingen mogen
meerdere bronnen accepteren. Definieer daarnaast minimale bronweerstand en
kortsluitbestendigheid voor iedere matrixbron.

### M4 — Regelaars missen orderbare MPN's en lokaal gedocumenteerde marge

U11 L7806, U12 L7906 en U13 78L05 hebben geen LCSC-nummer in het fab-BOM.
Dat kan bewust handwerk zijn, maar `MODULES.md` noemt het bord bestelbaar en
de README noemt deze uitzondering niet. Exacte fabrikant, pinout, dropout,
uitgangscapaciteit en thermische uitvoering zijn daardoor niet bevroren.

Vooral 78L05 bestaat in meerdere TO-92-pinouts per fabrikant. De huidige
footprint verwacht pin 1=OUT, 2=GND, 3=IN. Kies dus eerst exacte MPN's en
controleer alle drie pin voor pin. Voeg de door de gekozen datasheets vereiste
in-/uitgangsontkoppeling toe; nu zijn er alleen 10 µF bulkcondensatoren en de
verderop geplaatste IC-ontkoppeling.

### M5 — Proto mist railmeetpunten en lokale foutdiagnose

Er zijn geen testpunten voor +12 V, -12 V, VDD6, VEE6, V5, RESET, STROBE of
een representatief CS-signaal. Met acht gesockete oude/aftermarket MT8816's
is snelle diagnose per rail en controlpad juist waardevol.

Aanpak: voeg compacte gelabelde testpads toe. Minimaal GND, VDD6, VEE6, V5,
RST, STB en één decoderuitgang; liefst ook één representatief IN/OUT-paar.

## Lage bevindingen en documentatie

1. `musicbrain-matrix-c/README.md` zegt nog “één van de twee varianten
   bestellen”, terwijl `MODULES.md` Matrix-C definitief als gekozen variant
   noemt.
2. De BOM-regel U1–U8 heet `MT8816AE`, maar C72123 is de DIP-40-socket. Dat
   is technisch bewust, maar noem de BOM-comment `DIP-40 socket for MT8816`
   om een verkeerde inkoopinterpretatie te voorkomen.
3. De resterende tien DRC-waarschuwingen zijn alleen silkscreen-overlap bij
   C11–C14 en U1–U4. Niet elektrisch kritisch, wel eenvoudig op te ruimen.
4. Het fabpakket bevat correct vier koperlagen en is nieuwer dan het huidige
   PCB-bestand, maar moet na H1–H3 volledig opnieuw worden gegenereerd.
5. De center-mapping staat niet in de README zelf. Omdat deze mapping het
   firmwarecontract is, hoort een machineleesbare gegenereerde tabel of hash
   naast het bord en in firmware te staan; generatorstdout alleen is te
   vluchtig.

## Positief gecontroleerd

- MT8816 DIP-40-pinout komt overeen met het lokale datasheet.
- +6 V en -6 V geven 12 V totaal en blijven binnen de aanbevolen 13,2 V.
- 5 V-besturing voldoet ruim aan de MT8816 digitale HIGH-drempel.
- Twee 74AHCT595's vertalen de 3,3 V-SPI-signalen passend naar 5 V-logica.
- 74HC238 is correct als actief-hoge 3-naar-8-CS-decoder aangesloten.
- CS is per stem gescheiden; gedeelde adres/data/STROBE-netten zijn logisch.
- Iedere audionet is precies één MT8816-pad naar één jack8-headerpad.
- Per-chip Hungarian-mapping en center-layout zijn intern consistent.
- 100 nF is per MT8816-rail en per digitaal IC aanwezig.
- Vier koperlagen staan in PCB én Gerberarchive.
- KiCad 10.0.4: ERC 0, DRC 0/0, 0 unconnected pads.
- `cardlib.netcheck()`: `NETCHECK OK`.

## Vrijgavecriteria voor de eerste proto

1. H1–H3 opgelost in generator, schema, PCB, README en fabpakket.
2. Exacte regulator-MPN's en montageplan vastgelegd.
3. Hardware-POR gemeten vóórdat een MT8816 wordt geplaatst.
4. Verse ERC, netcheck en DRC met `--refill-zones` uitgevoerd.
5. JLC-preview gecontroleerd op elcopolariteit, SOIC-rotaties, socketnok en
   headeroriëntatie; 4-laags stack expliciet gekozen.
6. Firmware start altijd met RESET en bouwt daarna de patch gecontroleerd op.
7. Benchtest: rail-sequencing, foutpatch, bronconflict, THD, ruis, control-
   feedthrough en crosstalk bij 1 kHz/10 kHz en 10 kΩ-belasting.