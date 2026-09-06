# Snaarbank — testlab voor modulatie

De snaarbank is een losse pagina in `editor/public/snaarbank-worklet.html`:
een fysisch-model-snaar die volledig in de browser draait, met dezelfde
MIDI-CC-nummers als de Elements-firmware op de Teensy 4.1. Hij begon als
draagbare demo zonder hardware, maar is inmiddels vooral het proeflab waarin
we bedieningsvormen uitproberen voordat ze naar de MusicBrain-editor gaan.

Openen: `cd editor && npm run dev`, dan `/snaarbank-worklet.html`. De pagina
heeft geen bouwstap; hij staat in `public/` en is één bestand.

## De signaalketen

| Blok | Wat | Aansturing |
| --- | --- | --- |
| 1 · Exciter | Bow, blow of strike; particle-mallet | CC 1, 24, 26 |
| 2 · Resonator | Karplus-Strong of Elements' modale resonator | CC 17 t/m 20 |
| 3 · Tape echo | Bandecho met feedback en wow/flutter | CC 33 t/m 36 |
| 4 · Space | Galm via een gegenereerde impulsrespons | CC 31, 32 |

De eerste twee blokken volgen de firmware. Blok 3 en 4 zijn van deze pagina.
De galm zat er al; de tape echo is toegevoegd en zit **niet** in de firmware.

Effecten zijn intern blokken met een `input`, een `output` en een `apply()`.
De volgorde staat in één lijst, `FX_ORDER`. Een blok toevoegen of verplaatsen
raakt alleen die lijst en één fabriekfunctie. Bewust geen patcher.

## Tape echo

Een delay waarvan de terugkoppeling door een zachte verzadiger en een
laagdoorlaat loopt, zodat elke herhaling doffer en voller wordt zoals bij
echte band. Twee oscillatoren moduleren de bandsnelheid.

| Regelaar | CC | Bereik |
| --- | --- | --- |
| Echo mix | 33 | droog/nat |
| Tape time | 34 | 60 ms tot 1,2 s, exponentieel |
| Feedback | 35 | tot 0,92, blijft dus onder zelfoscillatie |
| Wow & flutter | 36 | wow 0,7 Hz, flutter 6,3 Hz |

De delaytijd glijdt traag naar zijn nieuwe waarde. Aan de tijdknop draaien
geeft daardoor de pitch-zwiep van een bandmachine die van snelheid wisselt.

Let op bij het aanpassen: de verzadigingscurve moet versterking 1 rond nul
houden. Een curve die kleine signalen versterkt laat de lus bij hoge feedback
oplopen tot een staande toon.

## Modulatiepad

Een vlak onder het klavier met vier bronnen, elk met een vrij te kiezen
bestemming uit zestien continue parameters.

| Bron | Gebaar | Aard |
| --- | --- | --- |
| Sleep X en Y | vinger of muis op het vlak | absoluut |
| Twee-vinger scroll | zweven boven het vlak, niet klikken | relatief |
| Pinch | knijpen boven het vlak | relatief |
| Pendruk | alleen zichtbaar als er een pen wordt herkend | absoluut |

Twee gedragingen die het speelbaar maken:

- **Terugveren** gaat naar de waarde van vóór het aanraken, niet naar het
  midden van het vlak. Loslaten brengt de klank terug naar de patch. Er is
  een knop om in plaats daarvan vast te houden.
- **Scroll en pinch pakken de stand van hun bestemming op** bij het begin van
  elke veeg, herkend aan een gat van 250 ms. Zonder dat springt de parameter
  bij de eerste aanraking naar de stand van de bron.

Reverb time staat expres niet in de doellijst: die bouwt een impulsrespons
opnieuw op en is te duur om continu te slepen.

Alles loopt via één `setParam()`, zodat de sliders, de engine en de
MIDI-uitgang hetzelfde zien als bij een muisbeweging. CC gaat alleen de deur
uit als de 7-bits waarde verandert; anders overstemt één veeg de uitgang met
honderden identieke berichten.

## Wat een browser van een aanraakvlak ziet

Onderzocht met gesynthetiseerde invoer in Chromium, om te bepalen wat een
bedieningsvlak kan opleveren zonder eigen hardware.

**Trackpad.** Er is geen trackpad, alleen een muisaanwijzer. Wel bruikbaar:

| Invoer | Komt binnen als | Bruikbaar |
| --- | --- | --- |
| Twee-vinger scroll | `wheel`, fractionele pixels | ja, continu |
| Pinch | `wheel` met `ctrlKey` | ja, aparte as |
| Vingerdruk | `pointermove`, pressure blijft 0 | nee in Chrome |
| Losse vingers | niets, `maxTouchPoints` is 0 | nee |

De scrolldeltas komen tot op tienden van een pixel door. Windows-touchpads
gedragen zich hetzelfde; een muiswiel klikt in grove stappen en voelt daardoor
schokkerig. Safari heeft daarnaast gebaar-events met schaal en rotatie plus
echte Force Touch-druk; in Chrome ontbreken beide. Ruwe multitouch van een
ingebouwde trackpad is nergens beschikbaar, ook niet via WebHID: de
systeemdriver bezit het apparaat en browsers blokkeren aanwijs-HID.

**Wacom.** Een pentablet komt binnen als `pointerType: "pen"` en geeft dan wel
druk, kanteling in twee assen, rotatie bij sommige pennen, en absolute
positie. In aanraakstand gedraagt de hand zich als een grote trackpad, dus
daar gelden de regels hierboven. Niet met echte hardware getest; de pagina
toont de drukrij pas zodra er werkelijk een pen wordt herkend.

**Telefoon.** Een aanraakscherm geeft wél meerdere vingers tegelijk. Daarom is
dat de route geworden voor echte multitouch.

## Telefoons als modulatievlak

Zie [`editor/modlink/README.md`](../editor/modlink/README.md) voor het
protocol en [ADR 0016](adr/0016-modulation-surfaces-over-cc.md) voor het
waarom. Kort: een telefoon opent `/pad-phone.html`, de snaarbank meldt zich
als host, en een doorgeefluik in de dev-server brengt ze samen. Meerdere
toestellen tegelijk kan; elk krijgt een eigen CC-bereik vanaf 40.

Gemeten netwerkvertraging op het lokale netwerk, twintig pings naar de router:

```
min 1,25 ms  ·  gemiddeld 1,54 ms  ·  max 2,56 ms  ·  spreiding 0,34 ms
```

Een telefoon voegt een hop toe, dus reken op ongeveer het dubbele. Dat valt
weg tegen de afvlakking van de parameters zelf, die met tijdconstanten van 20
tot 80 ms werkt. Voor het aanslaan van noten zou dat anders liggen: daar hoor
je timingfouten vanaf ongeveer 10 tot 20 ms.

## CC-overzicht

| CC | Parameter | Bron |
| --- | --- | --- |
| 1 | Envelope shape | firmware |
| 16 | Exciter-modus | firmware |
| 17 t/m 20 | Geometry, brightness, damping, position | firmware |
| 24, 26 | Strike timbre, mallet | firmware |
| 28, 29 | Mod freq, mod offset | firmware |
| 31, 32 | Reverb amount, reverb time | firmware |
| 33 t/m 36 | Echo mix, tape time, feedback, wow & flutter | deze pagina |
| 40 en hoger | Bedieningsvlakken op afstand, zes per toestel | deze pagina |

De firmware gebruikt niets boven CC 32, dus 33 en hoger zijn vrij.

## Open punten

- **Wat één, twee en drie vingers doen is niet zelfsprekend.** Op de telefoon
  krijgt elke vinger een eigen assenpaar, maar welke vinger welk paar krijgt
  hangt af van de volgorde waarin je ze neerzet. De legenda toont het wel,
  maar het gedrag verrast bij het spelen. Nog te beslissen of de vingers
  vaste gebieden moeten krijgen in plaats van vrije toewijzing.
- **Het doorgeefluik leeft in de dev-server.** Zonder `npm run dev` werken de
  vlakken op afstand niet. Een echte virtuele MIDI-poort zou dat oplossen en
  meteen andere programma's bedienen, maar vraagt een module met compilatie.
- **Kanteling van de telefoon** als extra as vraagt een beveiligde
  verbinding op iOS, en dus een zelfgemaakt certificaat.
