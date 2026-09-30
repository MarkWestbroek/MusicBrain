# Editor UX-aanbevelingen

Datum: 2026-09-30
Status: voorstel ter bespreking; nog niet geimplementeerd.

## Aanleiding en scope

UX-beoordeling van de Modular MB-editor, gebaseerd op de bekeken browserstructuur
van Simulatie, Modules, Patches en Patcher en de door de gebruiker aangeleverde
desktop-screenshots van Patcher en Rack. Geen volledige beoordeling van
Effect-switcher, Amp-switcher of Scope.

De screenshots tonen onder meer een project met 566 modules en 62 patches,
een rack met vier modules en 562 modules buiten dat rack, en een patch met
acht zangcellen. Deze aantallen zijn voorbeelden uit het bekeken project,
geen vaste eigenschappen van de editor.

De browserinspectie gaf op sommige momenten een andere projecttoestand weer.
Waarnemingen uit de screenshots en uit de browser zijn daarom niet behandeld
als een identieke testopstelling.

## Uitgangspunten

- Grote en lange schermen zijn een normaal gebruiksscenario. Alles op een scherm
  laten passen is nadrukkelijk niet het doel.
- Overzicht en bediening moeten behouden blijven tijdens scrollen en zoomen.
- Behoud de herkenbare fysieke modulepanelen en de bestaande modulaire werkwijze.
- Maak veelgebruikte taken eenvoudiger zonder geavanceerde functies weg te nemen.
- Bouw voort op bestaande voorzieningen, waaronder de inspector, Graph/Matrix,
  bewaarstatus en A/B/C/D-vergelijking. Controleer voor implementatie welke delen
  van de aanbevelingen al bestaan; dit document is geen lijst bewezen ontbrekende functies.

## Voorgestelde prioriteiten

Dit is een uitvoeringsvoorstel, nog geen afgesproken planning.

| ID | Volgorde | Aanbeveling | Verwachte winst |
|---|---|---|---|
| UX-01 | Eerst | Modulevoorraad doorzoekbaar en gegroepeerd | Minder zoeken in grote projecten |
| UX-02 | Eerst | Bovenbalk taakgericht groeperen | Belangrijkste acties sneller vinden |
| UX-03 | Eerst | Inspector voor nauwkeurige bediening | Parameters leesbaar en precies wijzigen |
| UX-04 | Daarna | Interfacegrootte los van rackzoom | Overzicht zonder onleesbare bediening |
| UX-05 | Daarna | Verbindingen gericht volgen | Complexe en polyfone patches begrijpen |
| UX-06 | Daarna | Werkcontext zichtbaar houden | Orientatie bij lange schermen |
| UX-07 | Daarna | Technische status compact presenteren | Minder visuele ruis tijdens muziek maken |

## Aanbevelingen en toetscriteria

### UX-01: Modulevoorraad doorzoekbaar maken

Het Rack-scherm toont een lange reeks kaarten onder 'Modules niet in rack'.
Bij honderden modules en herhaalde typen is die voorraad lastig te scannen.

Voorstel: zoeken op naam en type, categoriefilters en groepering per moduletype
met aantallen. Maak onderscheid tussen een bestaande module plaatsen en een
nieuwe instantie maken; dat zijn verschillende handelingen met verschillende
gevolgen voor het project.

Toets: in een project met honderden modules kan een gebruiker een specifieke
bestaande module vinden en plaatsen zonder eerst de hele voorraad door te scrollen.
Gelijke typen blijven als afzonderlijke instanties herkenbaar.

### UX-02: Bovenbalk taakgericht groeperen

Projectacties, klankeditors, hardwarefuncties, voorbeelden en testfuncties staan
nu grotendeels naast elkaar. Het tabblad Modules bevat bovendien beheer van
moduletypen, wat een andere taak is dan een instrument samenstellen.

Voorstel: groepeer acties onder bijvoorbeeld Project, Klanktools, Hardware en
Diagnostiek. Houd veelgebruikte acties direct bereikbaar en plaats specialistisch
typebeheer en testfuncties duidelijk apart van de dagelijkse patchworkflow.
De precieze menu-indeling moet nog worden bepaald.

Toets: project openen/exporteren, een klanktool openen en hardware verbinden
hebben elk een voorspelbare plek. Veelgebruikte handelingen vereisen niet
onnodig meer klikken dan nu.

Klikbaar ontwerp: [Toolbarvergelijking](../../editor/public/toolbar-vergelijking.html).
De proef toont de huidige en voorgestelde indeling boven of naast elkaar en
kan ook alleen het voorstel tonen. Alle bestaande acties zijn opgenomen, maar
de knoppen veranderen bewust geen projectgegevens. Voorgestelde indeling:

- direct bereikbaar: Recept, Presets en rondleiding;
- Project: import/export, panels en nieuw project;
- Klanktools: Wave, Sample, Multisample, Zang en DX7;
- Hardware: Teensy en SysEx;
- Voorbeelden & tests: opbouwseeds en diagnostische seeds.

### UX-03: Inspector voor nauwkeurige bediening

De fysieke modulepanelen ondersteunen herkenning, maar hun labels worden klein
bij een overzichtszoom. Een inspector bestaat al; verbeter die waar nodig in
plaats van een tweede, concurrerende parametereditor te introduceren.

Voorstel: toon voor de geselecteerde module leesbare parameternamen, waarden en
eenheden, met directe numerieke invoer waar passend. Laat geavanceerde
voice-instellingen inklappen. Maak duidelijk of een wijziging geldt voor de
patch, rack-defaults of een voice-override.

Toets: een parameter kan exact worden ingesteld zonder inzoomen op het paneel.
Paneel en inspector tonen dezelfde actuele waarde en dezelfde wijzigingsscope.

### UX-04: Interfacegrootte scheiden van rackzoom

Modulepanelen mogen uitzoomen voor overzicht, maar navigatie, patchnaam en
acties moeten op een comfortabele grootte blijven. Dit is geen voorstel om
grote racks geforceerd binnen de viewport te persen.

Voorstel: bied naast de bestaande passend-maken-functie ook zoom op selectie
en een herkenbare bedieningszoom. Controleer het bestaande zoomgedrag voordat
nieuwe controls worden toegevoegd.

Toets: bij wisselen tussen totaaloverzicht en detail blijven navigatie en
inspector leesbaar. Zowel een breed rack als een rack met veel rijen blijft
bereikbaar zonder de hele interface te verkleinen.

### UX-05: Verbindingen gericht volgen

In de patch met acht zangcellen lopen kabels dicht langs elkaar. Alleen kleur
is bij een grotere patch niet voldoende om een verbinding te volgen.

Voorstel: benadruk bij selectie van een poort of kabel de betrokken verbindingen
en dim overige kabels. Toon bron, bestemming en signaaltype. Bied filters voor
bijvoorbeeld audio, CV en gate, met een duidelijke indicatie van actieve filters.

Toets: een gebruiker kan bron en bestemming van een verbinding aanwijzen in
een drukke polyfone patch. Visueel filteren verandert nooit de werkelijke routing.

### UX-06: Werkcontext zichtbaar houden

Bij lange schermen moet duidelijk blijven welke patch en welk rack actief zijn,
of er wijzigingen zijn en of de simulatie draait.

Voorstel: houd een compacte contextbalk met deze informatie en simulatiebediening
sticky. Laat de uitgebreide projecttoolbar wegscrollen. Houd rekening met
eventuele afzonderlijke scrollgebieden van rack, voorraad en inspector.

Toets: na ver scrollen blijft de actieve werkcontext herkenbaar en bedienbaar,
zonder dat meerdere vaste balken een groot deel van de werkruimte innemen.

### UX-07: Technische status minder dominant maken

De statusregel met firmware, CPU en geheugen is nuttig voor diagnose, maar erg
compact en informatiedicht voor de dagelijkse bediening.

Voorstel: toon standaard verbinding, belasting en relevante waarschuwingen.
Maak volledige diagnostiek op aanvraag beschikbaar. Verberg storingen en
overbelasting niet achter het diagnostiekmenu.

Toets: een probleem blijft direct zichtbaar; gedetailleerde technische waarden
blijven bereikbaar zonder permanent de volledige regel te hoeven lezen.

## Verificatie en beperkingen

- Dit document bevat aanbevelingen, geen afgeronde usabilitytest of code-audit.
- De geintegreerde testbrowser rapporteerde een viewport van 683 pixels breed.
  De poging tot vergroten was daar niet betrouwbaar. Dat is geen basis om de
  desktoplayout als defect te bestempelen.
- De losse toolbarvergelijking is met zelfstandige Playwright gecontroleerd:
  alle 22 acties bleven aanwezig, menu-selectie en Escape werkten, er waren
  geen browserfouten en de drie vergelijkingsstanden gaven geen horizontale
  document-overflow op 1920, 3840 en 390 pixels breed.
- Vervolgvalidatie: gebruik zelfstandige Playwright met gecontroleerde viewport
  en een representatief testproject, inclusief brede racks, veel rackrijen,
  honderden modules en polyfone verbindingen. Verifieer de werkelijk gemeten
  viewport voordat screenshots worden beoordeeld.
- Beoordeel zowel een gangbaar desktopformaat als een breed/groot scherm.
  Een smal venster is een aanvullende controle, niet het primaire ontwerpdoel.
- Deze taak legt alleen het voorstel vast; er zijn geen editorfuncties aangepast.

## Vervolg

Bespreek eerst UX-01, UX-02 en UX-03. Controleer per gekozen onderwerp het
bestaande gedrag, bepaal de kleinste bruikbare verbetering en valideer die
tegen het bijbehorende toetscriterium voordat de volgende wijziging volgt.