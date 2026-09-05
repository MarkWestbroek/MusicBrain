# MusicBrain samengestelde Eurorack-visualisatie

`MusicBrainAssembly.FCMacro` bouwt een parametrisch FreeCAD-model van het
samengestelde MusicBrain-systeem:

- het 40 HP hoofdpaneel met display, softknoppen, encoders, MIDI, USB en zes
  functiekaartkolommen;
- het hoofdbusboard met Teensy en zes verticale insteekkaarten;
- front-PCB's, componenthuizen en grove 1×10- en 2×12-connectormodellen aan
  beide uiteinden van de insteekkaarten;
- een los 8 HP audio-I/O-front rechts van het hoofdpaneel, met een getekende
  kabel naar de codec-zone;
- het geplande passieve 32 HP expansiebusboard, zes kaarten en bijbehorende
  fronts, inclusief de besturings- en audiolintkabels;
- boven- en onderrails voor de volledige 80 HP Eurorack-opstelling.

## Gebruiken

Open `MusicBrainAssembly.FCMacro` in FreeCAD en voer de macro uit. Headless kan
hetzelfde vanuit de repository-root:

```sh
'/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd' \
  doc/mechanics/MusicBrainAssembly.FCMacro
```

De macro schrijft `visuals/musicbrain-assembly.FCStd`. Open dit bestand in
FreeCAD en schakel groepen of losse onderdelen in de modelboom aan en uit.

Boven in de macro staan de parameters. De belangrijkste is
`expansion_side`: kies `"right"`, `"left"` of `"none"`. Met `audio_side` kan
het losse audiofront links of rechts van het hoofdpaneel worden geplaatst.

## Maten en aannames

Bevestigd uit het bestaande ontwerp:

- hoofdbusboard: 40 HP, 203,2 × 128,5 mm;
- expansiebusboard: gepland als 32 HP, 162,56 × 128,5 mm;
- zes slots per busboard op 20,32 mm steek;
- kaarten: 45 mm diep vanaf het busboard en 80 mm hoog;
- front-PCB's: 18 × 110 × 1,6 mm, 13 mm achter het paneel;
- totale afstand van paneelvoorzijde tot busboard: circa 59,6 mm in het model;
- Teensy: circa 18 × 61 mm, met de lange zijde in de 3U-hoogterichting;
- hoofdpaneelindeling gebaseerd op `frontpanel-v1.svg`.

Nog conceptueel in deze visualisatie:

- het expansiebusboard heeft nog geen schema of PCB-ontwerp;
- het audio-I/O-front heeft nog geen definitieve breedte of connectorindeling;
  8 HP en 6 ingangen plus 6 uitgangen zijn gekozen om de samengestelde vorm
  te kunnen beoordelen;
- connectoren, kabelbanen en componentdieptes zijn visueel representatief.
  De connectorhuizen en pennen tonen de benodigde bouwruimte, maar zijn geen
  exacte STEP-modellen en zijn niet bedoeld als productiegeschikte mechanische
  verificatie.

Voor een leesbare vooraanblik gebruikt het model afzonderlijke grove vormen:
mini-jacks met een 2,6 mm diepe frontbus, MIDI-DIN met een 2,4 mm diepe flens,
potknoppen van Ø12 × 10 mm, encoderknoppen van Ø14 × 11 mm en vier kleine
softbuttons bij het scherm. De ENC5-kolom volgt de actuele PCB-generator: vijf
encoders op 17,6 mm steek, gevolgd door twee losse drukknoppen onderaan.

De frontplaat bevat vectortekst voor MIDI IN/OUT, CV IN/OUT, GATE IN/OUT, POT,
ENC en AUDIO IN/OUT. De nog niet bepaalde expansiekaarttypen zijn neutraal als
EXP 1–6 aangeduid.

De volledige getoonde opstelling is 80 HP: 40 HP hoofdunit + 8 HP audio-I/O +
32 HP uitbreiding.