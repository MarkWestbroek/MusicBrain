# Product positioning — RingEncoder (werktitel, MusicBrain)

## In één zin
Een open-hardware controllerknop waarbij label, waarde en bediening op dezelfde
plek zitten — een display *ín* de knop — voor de prijs van een gewone encoder
met LED-ring.

## Het probleem
Elke software-synth heeft honderden parameters; elke hardware-controller heeft
anonieme knoppen. De koppeling daartussen leeft in het hoofd van de gebruiker
(mapping onthouden) of in de blikverplaatsing naar een centraal scherm. Beide
zijn cerebraal in plaats van intuïtief. Een piloot hoeft niet op een los papiertje
te kijken welke knop wat doet; een muzikant nu wel.

## Waarom bestaande producten dit niet oplossen
- **Roto Control**: lost het wél op (gemotoriseerd + DAW-sync) maar tegen ~€60/knop
  en gesloten. Prima product, verkeerde prijsklasse voor modulair/eurorack.
- **Electra One**: labels naast de knoppen op één touchscreen — dichtbij, maar
  label en knop zijn nog steeds gescheiden (twee rijen onder het scherm).
- **Faderfox EC4**: alle 16 labels op één centraal LCD — functioneel, maximaal
  cerebraal.
- **M5Dial/Guition knob-modules**: het juiste bouwblok, maar elke knop is een
  complete computer met WiFi en RFID — te duur (€35) en te dik om er zestien
  naast elkaar te zetten.
- **Roendi**: juiste idee, $135/knop.

Niemand levert de kale bouwsteen: dom, dun, goedkoop, per acht aan één bus.

## Wat het anders maakt
1. **Co-locatie**: label + waarde + waardeboog op de knop zelf (auto-industrie-
   principe: Velar/Mercedes-klimaatknop). Nul blikverplaatsing, nul mapping-geheugen.
2. **Dom bij ontwerp**: geen MCU/WiFi/RFID per knop. Display + hall-sensor + lager.
   Acht knoppen delen één goedkope MCU. Daardoor €13–16/knop i.p.v. €35–125.
3. **Open hardware, open maat**: FreeCAD-macro's zijn parametrisch (53/42/34 mm),
   KiCad-ontwerpen en firmware onder MusicBrain-licentie. Iedereen kan het paneel
   maken dat bij zíjn instrument past — eurorack 3U, desktop, pedalboard (Reflex).
4. **Software-LED-ring**: de waardeboog wordt op het display getekend — geen
   SK6812-keten, minder onderdelen, vrij vormgeefbaar (bipolair, stepped, enz.).
5. **Past in het MusicBrain-ecosysteem**: banken hangen aan de bestaande busfilosofie
   (SPI/I2C op de busboard); Cortex-modules krijgen er zelfdocumenterende bediening bij.

## Voor wie
- Eerst: onszelf — bediening voor Cortex/Reflex en een Roto-achtige desktop-
  controller zonder motoren.
- Dan: eurorack-DIY'ers en synth-bouwers die "schermpje in de knop" willen zonder
  Guition-MOQ's of M5Dial-prijzen.
- Later: klein-serie fabrikanten die een open referentieontwerp zoeken (zelfde rol
  die Mutable Instruments' open designs in eurorack speelden).

## Waar het ons en de wereld ;-) helpt
- Verlaagt de drempel voor zelfdocumenterende hardware-interfaces van $135/knop
  naar €15/knop — dat is het verschil tussen "gadget voor één knop" en "16 knoppen
  op een paneel".
- Houdt kennis open: chin-maten, off-axis-kalibratie, lager-tuning — precies het
  soort mechanische detailkennis dat nu in gesloten producten opgesloten zit.
- Minder e-waste dan de alternatieven: geen WiFi-SoC, RFID en batterijcircuit per
  knop die niemand gebruikt.

## Bewust NIET (v1)
- Geen motoren/haptiek (dat is SmartKnob-territorium; eventueel v2).
- Geen DAW-integratie bij launch: eerst generieke klasse-compliant MIDI (evt.
  MCU-compatibiliteitslaag); parameternaam-sync is een softwareproject erna.
- Geen touch op het display (ring + druk is genoeg; capacitief komt later of nooit).
