# CR-78 stemmen als MusicBrain-kaart(en)

Losse spinoff naast `doc/spinoffs/drum-808/PLAN.md`. Deelt de hele
kaartarchitectuur met de 808-kaart; verschilt in welke stemmen erop
zitten en waarom.

**Status:** wacht op de schematic-overtrekactie die in een andere chat
loopt. Dit plan legt vast wat er al besloten is en wat er beslist moet
worden zodra de overgetekende stemmen er zijn.

## Waarom een aparte kaart en niet dezelfde

De CR-78 (1978) is een fundamenteel andere schakeling dan de TR-808
(1980):

| | CR-78 | TR-808 |
|---|---|---|
| Opbouw | discreet, transistorbased | bridged-T resonatoren |
| Karakter | zacht, houterig, "organisch" | lange decay, hard, resonant |
| Rol in muziek | new wave, pop, disco | hiphop, house |
| Bekend van | "Heart of Glass", "Vienna", "In the Air Tonight" (Disco 2, tempo omlaag) | te veel om op te noemen |

Voor een rap-machine is de 808 de juiste keuze. De CR-78 is een
**ander instrument**, geen variant — en dat rechtvaardigt een eigen
kaart.

Historische noot: de CR-78 was de eerste Roland-machine waarop je eigen
patronen kon programmeren en opslaan, en dat is precies waar
MusicBrain-patchgeheugen bij aansluit.

## Het probleem: te veel stemmen voor één kaart

De CR-78 heeft aanzienlijk meer stemmen dan de 808-selectie:
bassdrum, snare, rimshot, claves, cowbell, cymbal, hi-hat, bongo,
conga, maracas, tamboerijn, guiro, metallic beat.

Op ~45 × 60 mm passen realistisch vier analoge voices (zie
`drum-808/PLAN.md` voor de oppervlakteschatting). Dat betekent
**minimaal drie kaarten** voor het volledige palet.

Drie strategieën, te kiezen zodra de schematics overgetekend zijn:

**A. Eén "karakterkaart".** Alleen de stemmen die de CR-78 zijn
identiteit geven en die je nergens anders krijgt. Kandidaten: bongo,
conga, guiro, metallic beat. De rest laat je vallen.
→ Eén kaart, meeste karakter per mm².

**B. Splitsen naar functie.** Kaart 1 = kick/snare/rim, kaart 2 =
percussie (bongo/conga/claves/cowbell), kaart 3 = metaal
(hihat/cymbal/tamboerijn/maracas).
→ Modulair, gebruiker kiest. Past bij het MusicBrain-model.

**C. Hybride.** Analoog wat chaotisch is, Karplus-Strong op de
FPGA-kaart voor de getikte houten stemmen (claves, woodblock, conga).
→ Minste hardware, en de FPGA-voice is hier echt goed in.

**Aanbeveling vooraf:** eerst A of C bouwen, B pas als het instrument
zich bewijst.

## Wat ongewijzigd overgenomen wordt van de 808-kaart

Alles wat met de bus te maken heeft is identiek — dat is het punt van
een generieke kaartarchitectuur:

- **Voeding:** ±12V op slot pin 2/4. Geen lokale conversie.
- **Trigger:** 74HC595 op SPI, `LDAC` (pin 15) als broadcast-latch.
  Twee dCV-ticks van 1 kHz geven gratis een 1 ms puls (bit zetten op
  tick n, wissen op tick n+1).
- **Velocity:** DAC met eigen LDAC-ingang, pulshoogte als accent.
- **Geen MCU op de kaart nodig.**
- **Geen trimpots.** Alle parameters digitaal, patchbaar. Zie de
  DAC+OTA versus analoge-schakelaar-afweging in `drum-808/PLAN.md`.
- **Audio terug:** ADC op de kaart → I2SDn. Het busboard heeft geen
  analoog audiopad tussen slots.

Als de 808-kaart eenmaal werkt, is de CR-78-kaart grotendeels
copy-paste met een andere analoge sectie.

## Wat wél anders is

**Discrete transistorschakelingen.** De 808 leunt op op-amps en
bridged-T; de CR-78 gebruikt losse transistoren. Dat betekent:

- Meer gevoeligheid voor transistorkeuze en -spreiding. Originele
  types zijn deels obsoleet; substituten moeten gekarakteriseerd
  worden op hFE en Vbe.
- Bias-punten zijn afgestemd op de originele railspanning. Controleer
  wat de CR-78 intern gebruikte en of ±12V zonder herberekening
  volstaat, of dat bias-netwerken aangepast moeten.
- Minder makkelijk digitaal te besturen dan een op-amp-schakeling.
  Waar je bij de 808 een OTA in de feedback kunt hangen, moet je hier
  per stem uitzoeken wat het regelpunt is.

**Dit is het echte werk van dit project**, en het is niet triviaal.
Reken erop dat de conversie van "trimpot" naar "digitaal instelbaar"
per stem een eigen puzzel is.

## Volgorde

1. Schematics overtekenen (loopt in een andere chat)
2. Per stem het regelpunt identificeren: welke component bepaalt tune,
   welke decay?
3. Transistorsubstituten bepalen en karakteriseren
4. Bias-punten narekenen voor ±12V
5. Kiezen: strategie A, B of C
6. Eén stem breadboarden en meten voordat er een kaart getekend wordt
7. Kaartontwerp — hergebruik van de 808-kaart-infrastructuur

## Openstaande vragen

- Welke railspanning gebruikte de CR-78 intern, en wat betekent dat
  voor bias bij ±12V?
- Welke stemmen zijn realistisch digitaal instelbaar te maken, en
  welke accepteren we met vaste waarden?
- Is de karakteristieke CR-78-klank vooral de stemmen, of het
  ensemble van de presetpatronen? Als het tweede zwaarder weegt, zit
  het echte werk in de patroongenerator en niet in de analoge kaart.
- Verhouding tot Karplus-Strong: welke stemmen zijn digitaal even goed
  of beter?
