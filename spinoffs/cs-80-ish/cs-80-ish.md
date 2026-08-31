# The CS-80 sound

## Cs80 chips
Ik lees https://synthanatomy.com/2026/08/pilve-ig00156ap-is-a-new-yamaha-cs-80-vcf-chip-clone.html

Voor mijn musicbrain project kan dit een interessante chip zijn voor op een bord, echter erg duur.  Je wilt dat natuurlijk polyfoon...

Het hoeft voor mij natuurlijk niet drop in te zijn.

Hoe uniek is de cs80 chip architectuur (intern met name)? Is dat bekend?

### answer Claude
Het interne ontwerp is goed gedocumenteerd — Yamaha zette destijds zelf de equivalente schema's van de IG-chips in de CS-80 servicemanual, en de laatste jaren zijn er ook die-shots en reverse-engineering analyses verschenen (Ando Pilve heeft de chip voor deze kloon zelf volledig gereconstrueerd). Er is dus weinig mysterie.

Architectonisch: de IG00156 is een 12 dB/oct filter opgebouwd rond transconductantiecellen (OTA-achtig, gm-C), met on-chip een lineaire cutoff-CV-ingang plus een aparte exponentiële converter voor keyboard-tracking. Per CS-80-stem zitten er twee in serie: één als resonant highpass, één als resonant lowpass. Dat serieschakelen van resonante HP→LP is eigenlijk het meest karakteristieke — meer dan de chip zelf. De cel is verwant aan wat CEM/SSM later deden; het "CS-80-geluid" komt vooral uit de topologie, de zachte saturatie van Yamaha's specifieke OTA-implementatie, de discrete sinus-shaper/ringmod eromheen, en de dubbele lagen per toets.

Voor MusicBrain betekent dat: je hoeft die $80-chip niet polyfoon in te kopen. Met je bestaande SSI2140-ervaring kun je dezelfde topologie bouwen — 2140 of SSI2164-cellen als resonante 12 dB HP en LP in serie, lineaire FM-ingang erbij, klaar. De Deckard's Dream is hier het bewijsstuk: een 8-stemmige CS-80-kloon volledig met moderne componenten, en de vroege DIY-versie heeft gepubliceerde schema's die je als referentie kunt gebruiken voor hoe dicht je bij het origineel komt zonder de IG-chips. De Pilve-kloon is vooral interessant voor restauratie van echte CS-synths, niet als bouwsteen voor nieuw polyfoon werk.

## Aanvulling technische review (2026-08-31)

### Korte conclusie

De originele CS-80-schema's zijn online te vinden. De nuttigste primaire bron is
de [Yamaha CS-80 Service Manual](https://www.synthxl.com/wp-content/uploads/2020/10/Yamaha-CS-80-Service-Manual.pdf),
via de [CS-80-pagina van SynthXL](https://www.synthxl.com/yamaha-cs-80/). Daarin
staan de systeem-, board- en voice-schema's waarmee de externe toepassing van
de Yamaha-IC's kan worden bestudeerd.

De servicemanual bewijst echter niet zonder nadere paginacontrole dat het
volledige transistorinterieur van de IG00156 is gepubliceerd. De gevonden
nieuwsbron zegt alleen dat de Pilve-kloon is reverse-engineered en noemt een
lineaire cutoffingang plus exponentiële keyboard-following. Claims over
die-shots, een exact equivalent intern schema en de precieze gm-C-cel moeten
daarom voorlopig als **onbevestigd** worden behandeld.

Voor MusicBrain is een CS-80-achtige filterkaart haalbaar, maar niet met de
redenering "één SSI2140, lineaire FM erbij, klaar". De interessante topologie
is twee afzonderlijk regelbare resonante 12 dB-secties in serie, HPF gevolgd
door LPF, en de echte CS-80 heeft bovendien twee synthlagen per gespeelde noot.

### Correcties op het eerdere antwoord

#### Eén laag heeft twee filters; een volledige CS-80-noot heeft er vier

Per synthlaag staat een resonant high-passfilter vóór een resonant
low-passfilter. De CS-80 heeft twee parallelle synthlagen, vaak aangeduid als
channel I en II. Voor één gespeelde noot zijn er dus in totaal:

$$
2\ \text{lagen} \times (1\ \mathrm{HPF} + 1\ \mathrm{LPF})
= 4\ \text{filtersecties}.
$$

Bij achtstemmige polyfonie zijn dat 32 filtersecties. Als iedere sectie één
IG00156 gebruikt, zou een restauratiegetrouwe uitvoering 32 chips vragen. Bij
ongeveer 80 dollar per kloon is dat alleen voor de filters circa 2560 dollar,
exclusief verzending, belastingen en reserveonderdelen. De Pilve-chip is daarom
logisch voor reparatie of een éénstems-referentie, niet voor een nieuw
achtstemmig MusicBrain-bord.

#### De bestaande SSI2140-kaart is geen directe CS-80-topologie

De MusicBrain
[SSI2140-buildspec](../../doc/plans/ssi2140_8voice_buildspec.md) en
[VCF8-generator](../../hardware/kicad-generators/gen_vcf8kern.py) gebruiken per
stem één SSI2140 als vierpolige cascade. De vier gm-cellen delen binnen die chip
één frequentiesturing. Pole-mixing kan daaruit onder andere 2LP en 2HP maken,
maar die modi zijn alternatieve aftapsommen van hetzelfde filter.

Dat is niet hetzelfde als een zelfstandig regelbaar resonant HPF gevolgd door
een zelfstandig regelbaar resonant LPF. Voor een CS-80-achtige laag zijn nodig:

- twee onafhankelijke cutoffregelingen;
- twee onafhankelijke resonantieregelingen;
- voldoende bereik om HPF en LPF over elkaar heen te laten bewegen;
- gecontroleerde gain en saturatie tussen beide secties;
- keyboardtracking, envelope en performance-modulatie per sectie.

Met SSI2140 zou de rechtstreekse route daarom twee chips per laag zijn. Een
volledige dual-layer, achtstemmige uitvoering vraagt dan eveneens 32 chips en
veel meer DAC-kanalen dan de huidige VCF8. SSI2164-cellen kunnen compacter of
goedkoper uitpakken, maar vereisen een nieuw filter-, expo-, Q- en
temperatuurontwerp. Dat is geen kleine variant op VCF8.

#### Het CS-80-karakter zit niet alleen in HPF naar LPF

De seriële filtertopologie is belangrijk, maar een eerlijke proef moet ook
rekening houden met:

- twee onafhankelijk ingestelde synthlagen per noot;
- oscillatorgolfvormen, pulsbreedte en waveshaping;
- afzonderlijke filter- en amplitude-envelopes;
- aanslaggevoeligheid en polyfone aftertouch naar level, brightness en andere
	bestemmingen;
- stemspreiding, kalibratie en analoge niet-lineariteit;
- ringmodulator/suboscillator en de globale uitvoerketen.

Een enkel HPF→LPF-pad kan dus overtuigend "CS-achtig" klinken zonder een
volledige CS-80 te reproduceren. Formuleer dat als het doel; anders wordt de
filterchip verantwoordelijk gemaakt voor eigenschappen die elders ontstaan.

### Welke schema's zijn online beschikbaar?

#### Originele Yamaha-documentatie

- [Yamaha CS-80 Service Manual bij SynthXL](https://www.synthxl.com/wp-content/uploads/2020/10/Yamaha-CS-80-Service-Manual.pdf):
	scan van de originele servicemanual met board- en voiceschema's. Dit is de
	eerste bron voor signaalniveaus, voedingsrails, pinfuncties en de schakeling
	rond de custom IC's.
- [Yamaha CS-80 Instruction Manual bij SynthXL](https://www.synthxl.com/wp-content/uploads/2020/04/Yamaha-CS80-Instruction-Manual.pdf):
	geen circuitbron, maar nuttig om performancebesturing en interacties tussen
	controls te begrijpen.

Deze scans zijn vermoedelijk nog auteursrechtelijk beschermd en SynthXL noemt
gebruik voor hobby, historische studie en onderzoek. Gebruik ze als
referentie; neem geen complete schema-afbeeldingen over in dit repository.

#### Deckard's Dream

Er is een publieke
[Deckard's Dream Rev2-schemareparatie](https://github.com/tumes/ddrm-rev2-schematics-fixup)
met één gecorrigeerde moederbord-PDF. Dit bevestigt dat DIY-schema's in omloop
zijn en is nuttig om een moderne implementatie te vergelijken.

Er staan geen oorspronkelijke CAD-bestanden, BOM of expliciete licentie in die
repository. Publiek leesbaar betekent daarom niet automatisch dat het ontwerp
mag worden gekopieerd of heruitgebracht. Gebruik het als secundaire technische
referentie en ontwerp de MusicBrain-schakeling zelfstandig vanuit
datasheetprincipes en eigen metingen.

#### Pilve IG00156-kloon

Het genoemde
[Synth Anatomy-artikel](https://synthanatomy.com/2026/08/pilve-ig00156ap-is-a-new-yamaha-cs-80-vcf-chip-clone.html)
bevestigt:

- drop-in mechanische en elektrische compatibiliteit volgens de maker;
- een lineaire cutoff-CV-ingang en exponentiële keyboard-following;
- toepassing van de originele IG00156 in meerdere Yamaha CS-instrumenten;
- een verkoopprijs van ongeveer 79,95 dollar op het moment van publicatie.

Het artikel publiceert geen intern schema, meetcurves, datasheet of
reverse-engineeringrapport. Voor nieuw ontwerpwerk ontbreken dus nog
overdrachtsfunctie, regelbereik, ingangsniveaus, ruis, vervorming,
temperatuurgedrag en spreiding.

### Aanbevolen MusicBrain-route

Begin niet met een achtstemmige kaart. Bouw een monofone vergelijkingsopstelling
met dezelfde oscillatorbron en drie filterpaden:

1. één originele of Pilve-IG00156 als LPF-referentie, als de prijs acceptabel
	 is;
2. een zelfstandig 2-pole HPF→2-pole LPF-pad met SSI2140;
3. dezelfde functie met SSI2164-cellen of een andere goed verkrijgbare
	 state-variable/OTA-oplossing.

Meet en beluister vervolgens:

- cutoffbereik en tracking over meerdere octaven;
- resonantie vóór en bij zelfoscillatie;
- interactie wanneer HPF-cutoff boven LPF-cutoff komt;
- envelope- en lineaire modulatiefeedthrough;
- levelverlies en vervorming tussen de secties;
- ruis en temperatuurdrift;
- blind verschil bij gelijkgemaakte cutoff, Q en outputgain.

Kies daarna één van drie productniveaus:

- **CS-80-kleur:** één HPF→LPF-pad per MusicBrain-stem, zonder dubbele laag;
- **CS-80-laag:** volledig onafhankelijk HPF→LPF per stem, met uitgebreide
	performance-CV;
- **CS-80-architectuur:** twee complete lagen per stem. Dit is feitelijk een
	nieuw polyfoon instrument en geen kleine filterkaart.

De eerste optie sluit het beste aan op de bestaande achtstemmige MusicBrain-
architectuur. Een praktische eerste PCB kan twee onafhankelijke 2-pole secties
voor één of twee stemmen bevatten. Daarmee worden klank, DAC-bereik en
kaartoppervlak bewezen voordat 8 of 16 lagen worden vermenigvuldigd.

### Open verificatiepunten

- Welke exacte externe schakeling en pinfuncties toont de servicemanual voor de
	IG00156?
- Bestaat er een primaire, publiek toegankelijke die-shot- of
	transistor-levelanalyse van de IG00156?
- Gebruikt de beoogde MusicBrain-variant één of twee synthlagen?
- Moeten beide resonanties onder patchcontrole, en hoeveel DAC-kanalen kost dat
	per stem?
- Is de bestaande VCF8 bedoeld om te blijven bestaan naast een gespecialiseerde
	CS-achtige kaart, of zou een revisie daarvan voldoende muzikale winst geven?
- Welke delen van het gewenste geluid blijven over in een level-matched blinde
	test zonder ringmodulator, aftertouch en dubbele laag?

Pas wanneer deze vragen beantwoord zijn, is een chipkeuze zinvol. De goedkope
route is waarschijnlijk niet een kloon van de IG00156 zelf, maar een bewust
vereenvoudigde HPF→LPF-architectuur waarvan de muzikale afwijking gemeten en
geaccepteerd is.