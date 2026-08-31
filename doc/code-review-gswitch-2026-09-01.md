# Code-review GSwitch schema's en PCB's — 2026-09-01

## Scope en conclusie

Beoordeeld:

- `hardware/schematics/gswitch-brain/`
- `hardware/schematics/gswitch-loop8/`
- `hardware/schematics/gswitch-loop8sh/`
- de drie bijbehorende generators in `hardware/kicad-generators/`
- `doc/guitar-switcher-spec.md`

De basisnetten zijn consistent: met KiCad 10.0.4 halen alle drie de borden
ERC 0, DRC 0/0 na `--refill-zones`, en `cardlib.netcheck()` meldt voor elk
bord `NETCHECK OK`. De relaiscontacten vormen correct true bypass via NC,
de 595/ULN-bitmapping klopt met de documentatie en de 5 V/3,3 V-overgangen
zijn logisch correct.

**Advies: nog niet bestellen.** Eerst de drie hoge bevindingen hieronder
oplossen en daarna de onderdelen/footprints fysiek kwalificeren.

## Hoge bevindingen

### H1 — Brain-reset garandeert geen lage EN

`A_EN` en `B_EN` gaan rechtstreeks van ESP32-GPIO's naar de permanent
ingeschakelde 74HCT541. Op de brain zitten geen pull-downs aan deze twee
bufferinputs. Tijdens reset, boot en voordat firmware de GPIO's configureert,
zijn de ESP32-pinnen hoogohmig. Een zwevende HCT-ingang kan daardoor een hoge
`EN` naar de keten sturen.

Op LOOP8 maakt een lage `EN_A` via de 74HC14 juist veilig `/OE` hoog. Dat
mechanisme werkt bij een losse kabel door R30, maar niet als de brainbuffer
een ongedefinieerd niveau actief uitstuurd. Omdat de 74HC595 bij power-up geen
gedefinieerde registerinhoud heeft, kan dit relais kort of blijvend activeren.
Dat schendt de eis "brain-reset = alles bypass".

Aanpak:

1. Plaats een pull-down (bijvoorbeeld 10 kΩ–47 kΩ) op `A_EN` en `B_EN` aan de
   ingangszijde van U2 op de brain.
2. Overweeg dezelfde default op CLK/DATA/LATCH, zodat de hele bus stil en
   deterministisch opkomt.
3. Test met trage 12 V-opkomst, resetknop, brown-out en firmwarecrash terwijl
   willekeurige bits in de 595 staan.

### H2 — Vereiste ESD-bescherming en RC-filtering ontbreken

De leidende spec eist per externe RJ45-connector 100 Ω serie plus een
PESD5V-klasse TVS op alle signaallijnen, staat hot-plug toe en noemt zware
RC-filtering op `LATCH` en `EN`. De ontwerpen hebben wel 100 Ω serie, maar
geen signaal-TVS-array en geen bedoelde RC-condensatoren. De TVS op LOOP8 is
alleen voor +12 V; op de brain is DATA_RET alleen via 10 kΩ/15 kΩ gedeeld.

Daarmee komen kabel-ESD en hot-plugtransiënten rechtstreeks op 74HC14,
74HCT541 of ESP32 terecht. Ook is de geclaimde storingsonderdrukking op lange
kabels niet gerealiseerd.

Aanpak:

1. Voeg low-capacitance 5 V TVS-arrays bij J10/J11 en bij J1/J2 toe, met een
   korte afvoer naar chassis/connector-shield conform de gekozen EMC-strategie.
2. Dimensioneer echte RC-filters voor `LATCH` en `EN`; controleer daarbij de
   Schmitt-drempels en maximale ketenvertraging.
3. Herbeoordeel of DATA_RET vóór of na de deler wordt geklemd en voorkom dat
   ESD-stroom via de ESP32-clampdiodes loopt.
4. Voer IEC 61000-4-2 pre-compliance en herhaald hot-pluggen uit op een proto.

### H3 — De opgebouwde kast maakt AGND en CTRL-GND indirect weer gekoppeld

Op de PCB zijn AGND en GND netjes gescheiden. In de aanbevolen bestukking is
echter per LOOP8 `JP3 AGND=CHASSIS` dicht, terwijl beide RJ45-schermen direct
aan CHASSIS zitten. De brain verbindt zijn RJ45-schermen direct met GND.

Daardoor ontstaat in het complete systeem het pad:

`AGND -> JP3 -> chassis -> RJ45-scherm -> brain-GND`.

Tussen twee LOOP8-kastjes loopt bovendien zowel de audiojack-sleeve als het
RJ45-scherm. Dat zijn twee parallelle massaverbindingen en dus een lus. De
claim dat de RJ45-keten geen aardlus met de audiojackkabels vormt, geldt
daarom alleen voor de PCB-netnamen, niet voor de opgebouwde installatie.

Aanpak:

1. Kies één systeembrede bondingstrategie en teken ook kast, jackbussen en
   kabelschermen in het aardingsschema.
2. Mogelijke routes zijn shield slechts aan één kabelzijde DC-bonden,
   AGND-chassisbond op één punt voor de hele audioketen, of een expliciet
   hybride bond. Leg niet zonder meting per kastje zowel AGND als shield hard
   aan chassis.
3. Meet brom en common-modegedrag met twee kastjes, aangesloten effecten en
   een buizenversterker voordat de layout wordt vrijgegeven.

## Middelhoge bevindingen

### M1 — De 12 V-envelope heeft weinig gedocumenteerde marge

De voeding naar acht relaisborden loopt door één RJ45-ader voor +12 V en over
een 0,4 mm brede, circa 167 mm lange backbone op elk LOOP8-bord. De brain
gebruikt een 1,1 A-polyfuse voor een gedocumenteerde worst case van ongeveer
0,89 A. De hold current van een polyfuse daalt bij hogere kasttemperatuur.

De huidige spanningsvalberekening telt vooral de Cat5-ader, maar niet de
backbones, connectorcontacten, ULN2803-drop en polyfuse samen. Dit hoeft voor
2–3 kastjes geen probleem te zijn, maar de geclaimde envelope van acht borden
is nog niet aangetoond.

Aanpak: maak een worst-case budget op minimum PSU-spanning, maximale
spoelstroom, warme polyfuse, kabel- en PCB-weerstand. Verbreed waar mogelijk
de 12 V-doorvoer en verifieer de gekozen RJ45/contact-rating. Overweeg een
zekering per chain-uitgang, zodat één kabelkortsluiting de brain en tweede
chain niet uitschakelt.

### M2 — Overspanningsbeveiliging is niet als keten doorgerekend

De brain gebruikt een SMAJ15A vóór een TPS563201 met 17 V aanbevolen maximale
ingangsspanning. De SMAJ15A kan, afhankelijk van pulsduur en stroom, boven die
spanning klemmen. Op LOOP8 staat alleen de generieke waarde `TVS`; type,
stand-off, klemspanning en pulsvermogen zijn niet vastgelegd.

Aanpak: definieer eerst het reële dreigingsprofiel van de geïsoleerde
pedaal-PSU en lange kabel. Kies daarna TVS, bronimpedantie/polyfuse en
regelaar-absolute-maximum als één protectieketen, niet als losse onderdelen.

### M3 — All-severity DRC bevat veel onbehandelde waarschuwingen

Na zone-refill zijn er geen open netten, maar de all-severity baseline is:

| bord | waarschuwingen | opvallend |
|---|---:|---|
| gswitch-brain | 146 | 4 dubbele boorgaten, 4 dangling tracks |
| gswitch-loop8 | 174 | 25 dubbele boorgaten, 2 dangling tracks |
| gswitch-loop8sh | 177 | 20 dubbele boorgaten, 4 hole-to-hole, 2 dangling tracks |

De meeste overige meldingen zijn silkscreen-overlap of lokale
library-mismatches. De dubbele gaten komen onder meer doordat handroutes en
SES dezelfde via plaatsen. Doodlopende tracks zijn routerresten. Dit is geen
netlistfout, maar moet vóór Gerber/Excellon-vrijgave worden opgeschoond of per
melding bewust worden gewaived.

### M4 — Bestelbare onderdelen en mechanica zijn nog niet bevroren

De README's noemen dit al terecht als blokkade. Nog fysiek te bevestigen:

- ACJS-MHD en ACJS-MH: T–TN-pinout op een echt onderdeel;
- gekozen TQ2SA/HFD4/EE2-variant: landpattern, pinout, coil-rating en hoogte;
- RJ45: pinpitch, twee positioneringspennen, shieldpennen en contactrating;
- LOOP8SH-klem: exact bestelnummer, kabelrichting en gereedschapsruimte;
- volledige BOM/LCSC-match, inclusief false-matchcontrole.

Voor LOOP8SH staat C2684447 als relais genoemd, terwijl beide PCB-generators
nog de Kemet EE2-footprint en de samengestelde waarde
`EE2-12NU/TQ2SA-12V` gebruiken. Dat is pas vrijgegeven nadat het C2684447-
datasheet maat voor maat over het daadwerkelijke landpattern is gelegd.

## Lage bevindingen en documentatie

1. `doc/guitar-switcher-spec.md` noemt de KiCad-borden nog "te bouwen", bevat
   oude formaatschattingen en presenteert reeds genomen beslissingen nog als
   open punten.
2. De spec noemt een 78L05; beide LOOP8-varianten gebruiken een AMS1117-5.0.
3. De spec beschrijft een pull-up op `/OE` en 10 kΩ-pulldowns op de
   595/ULN-lijnen. De print realiseert een 100 kΩ-pulldown op `EN_A` vóór een
   inverter en heeft geen externe pulldowns tussen 595 en ULN.
4. De README-status "DRC 0/0" is alleen reproduceerbaar met
   `--refill-zones`. Zonder refill rapporteert KiCad 10 veel open GND/AGND-
   verbindingen uit verouderde zonefills. Zet de exacte opdracht in alle drie
   README's en in CI.

## Positief gecontroleerd

- Relais af: `N(k-1) -> NC2 -> BYP -> NC1 -> N(k)`; true bypass klopt.
- Relais aan: `N(k-1) -> SEND` en `RETURN -> N(k)`; normalling op ACJS-MHD
  is logisch correct onder voorbehoud van de fysieke pinouttest.
- LOOP8SH documenteert correct dat een lege actieve loop zonder draadbrug het
  audiopad onderbreekt.
- 74HCT541 vertaalt de 3,3 V-ESP32-uitgangen correct naar 5 V; DATA_RET wordt
  met 10 kΩ/15 kΩ naar circa 3,0 V gedeeld.
- TERM verbindt op het laatste bord `SER` terug naar DATA_RET; de richting van
  de daisy-chain klopt.
- P-FET-polariteit, center-negatieve barrel en USB-naar-5 V-Schottky zijn
  logisch consistent.
- KiCad 10.0.4: ERC 0 op alle drie projecten.
- KiCad 10.0.4 met `--refill-zones`: DRC 0, 0 unconnected pads op alle drie.
- `cardlib.netcheck()`: `NETCHECK OK` op alle drie.

## Vrijgavecriteria voor de eerste proto

1. H1–H3 opgelost en in schema, generator en README gelijkgetrokken.
2. Verse ERC, pad-voor-pad netcheck en DRC met zone-refill.
3. All-severity DRC opgeschoond of elke resterende melding bewust gewaived.
4. Exacte MPN's plus datasheets vastgelegd; footprints fysiek of met
   1:1-print gecontroleerd.
5. Eerst kale PCB's plus één bestukt brain/LOOP8-paar.
6. Benchtest: reset/brown-out, cable hot-plug/ESD, acht relais tegelijk,
   ketenretour, brom, klik/plop en overspraak naast de beoogde versterker.