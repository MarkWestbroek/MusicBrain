# Analoge drumkaart — 808-lijn

Generieke MusicBrain-functiekaart. Ontstaan uit de rap-machine, maar
expliciet zo opgezet dat hij in elk MusicBrain-systeem past.

## Referentie-keuze

De **TR-808-lijn**, niet de CR-78. Twee fundamenteel verschillende
schakelingen:

- **TR-808** (1980): bridged-T resonatoren die vlak onder
  zelfoscillatie hangen. Lange decay, de hiphop-machine.
- **CR-78** (1978): discreet, transistorbased, zachter en houteriger.
  Blondie, Ultravox, en "In the Air Tonight" (Disco 2-preset, tempo
  omlaag). Zie `doc/spinoffs/drum-cr78/PLAN.md`.

Patenten zijn ruim verlopen; circuittopologie is niet beschermd.
Servicemanuals zelf zijn wel auteursrechtelijk beschermde documenten.
"TR-808" en "Roland" zijn handelsmerken — niet als productnaam
gebruiken.

## De constraint die alles bepaalt

MusicBrains hele productverhaal is **geheugen** — "pedalboards, amp
racks and modular synths have one thing in common: they forget."

Een analoge drumkaart met trimpots vergeet.

**Geen enkele instelknop op de kaart mag mechanisch zijn.** Tune,
decay, snappy: allemaal digitaal gezet en opgeslagen in de patch. Dit
is wat de kaart een MusicBrain-kaart maakt in plaats van zomaar een
drumkaart.

### Hoe je dat realiseert

Digipots lijken voor de hand liggend maar bijten: signaalzwaai buiten
hun 0–5V-venster, en 50–100 Ω wiperweerstand in een resonant netwerk is
hoorbaar.

Twee bruikbare routes:

1. **DAC + OTA** (LM13700) voor continue parameters. Elegant, precies,
   en het is hoe moderne analoge drumvoices het doen.
2. **Analoge schakelaars die vaste weerstanden selecteren** voor tune.
   Gekwantiseerd, maar acht stappen tune is muzikaal ruim genoeg en
   onverwoestbaar.

Twee MCP4728's geven acht DAC-kanalen voor een paar euro. Werkt op 3V3.
Prima startpunt. Voor meer kanalen of hogere resolutie: DAC8568 (SPI,
16-bit, 8 kanalen, eigen LDAC-ingang — zie timing hieronder).

## Welke voices analoog

Ongemakkelijke waarheid vooraf: de 808-bassdrum is qua signaal een van
de **makkelijkste** dingen om digitaal te maken — een sinus met een
toonhoogte- en amplitude-envelope. Wat de echte BD zijn karakter geeft
is de triggerklik en de lichte verzadiging als de resonator bijna
wegloopt. **De niet-lineariteit, niet de sinus.**

Analoog loont dus daar waar chaos zit:

| Voice | Analoog waard? | Waarom |
|---|---|---|
| Clap | **Ja, het meest** | Chaotische pulstrein + echte ruis; digitaal altijd te netjes |
| Snare | **Ja** | Ruis + twee resonatoren, niet-lineair samenspel |
| Bassdrum | Ja, om de klik | Culturele must-have, technisch de zwakste case |
| Rim / cowbell | Ja, goedkoop | Weinig oppervlak, veel karakter |
| Hats / cymbal | **Nee** | Zes oscillatoren = te veel oppervlak voor een statisch geluid |

**Hats digitaal.** Karplus-Strong op de FPGA-kaart is bovendien
uitstekend voor toms en woodblocks.

Vier analoge voices — BD, SD, clap, rim — is precies het palet dat
hiphop nodig heeft.

## Board-oppervlak

Kaartformaat ~45 × 60 mm, dubbelzijdig, 0603.

| Blok | Schatting |
|---|---|
| BD | ~20 × 25 mm |
| SD | ~20 × 25 mm |
| Clap | ~20 × 25 mm |
| Rim/cowbell | ~15 × 15 mm |
| Gedeelde ruisbron | klein |
| DAC's + sommeertrap + ADC | ~25 × 25 mm |

Krap maar haalbaar. Vier voices is realistisch het maximum.

## Voeding

**Opgelost door het busboard.** Slot pin 2 → +12V, pin 4 → −12V, GND
op 1/3/5. Geen boost, geen inverter, geen schakelvoeding naast de
resonatoren.

±12V is minder headroom dan de 808's originele rails, maar het is de
Eurorack-norm en de bassdrum wordt er hooguit een decibel of twee
braver van.

**Let op:** er staat géén +5V op de slots, alleen +3V3, en die komt via
een AMS1117 achter een R-78E5.0-1.0 (1 A) die ook USB-host-VBUS voedt.
Analoge hulpspanningen lokaal uit ±12V halen, niet uit 3V3.

## Timing: LDAC is de drumtrigger

`LDAC` (pin 15) en `CONVST` (pin 19) hebben op elk slot **dezelfde
netnaam, zonder slotsuffix**. Dat zijn broadcast-strobes over alle zes
de slots.

Daarmee is het timingprobleem opgelost met hardware die er al ligt:

1. Het brein schrijft over SPI welke voices moeten klinken en met welke
   velocity. SPI heeft jitter — maakt niet uit, dit is voorbereiding.
2. Op de tel pulseert de Teensy één keer LDAC.
3. Alle voices vuren op diezelfde flank. De FPGA-kaart óók, als die
   meeluistert.

Sample-accurate, cross-card, zonder één extra draadje.

### Er hoeft geen MCU op de kaart

De bus draagt dCV op 1 kHz. Twee ticks geven gratis een keurige 1 ms
triggerpuls:

```
tick n    : bit zetten
tick n+1  : bit wissen
```

1 ms is toevallig precies een goede triggerpulsbreedte voor analoge
drumschakelingen; de 808 zit in dezelfde orde. **Geen monostabiel,
geen timing-logica.**

Dus: een **74HC595 op SPI met LDAC als latch** geeft de triggers, en
een **DAC met eigen LDAC-ingang** geeft de velocity als pulshoogte —
de 808-accentbus, letterlijk. Beide latchen op dezelfde flank.

### Waar de echte timingfout zit

Niet in het 1 kHz-raster (1 ms ligt ver onder de ~10–20 ms
waarneembaarheidsdrempel voor ritme), maar in de **jitter op de
LDAC-flank**.

Genereer je die strobe vanuit een software-timerinterrupt, dan schuift
hij mee met SD-schrijven, USB-host en audio-callbacks. Dat kan
tientallen microseconden tot ver daarboven uitlopen.

**LDAC moet aan een hardware-timer output-compare pin van de IMXRT.**
Dan mag de interrupt gerust 200 µs te laat zijn — de flank niet.

### Gelaagdheid

Twee voices die samen horen (kick + clap) en 1 ms uit elkaar vallen
geven geen timingfout maar een **kamfilter**, met de eerste notch op
500 Hz — precies in het lijf van de snare. Vandaar dat gelijktijdige
voices op dezelfde LDAC-flank moeten vuren.

## Audiopad — openstaande architectuurvraag

**Er is geen analoog audiopad tussen slots.** Pinnen 21–24 zijn MCLK,
BCLK, LRCLK en I2SDn. Digitaal.

De architectuur gaat ervan uit dat een kaart óf digitaal audio
terugstuurt over I2S, óf analoog naar eigen frontjacks gaat. Dat klopte
voor Cortex. Een analoge drumkaart zonder front moet zijn geluid ergens
kwijt.

**Route A — ADC op de kaart.** PCM1808 of vergelijkbaar, terug als I2S
over I2SDn. Ironisch, maar consistent: de drums mixen digitaal met de
FPGA-stemmen en de codec op J17 doet één keer de D/A. ~€2 en een paar
mm².

**Route B — analoge audiopinnen toevoegen aan het slot.**
Architectonisch zuiverder, maar dat is een busboard-revisie, en v3.1
staat net op DRC 0/0 en bestelbaar.

**Aanbeveling: A.** Het karakter zit in de opwekking, niet in het pad
erna.

## Taakverdeling over de bus

| Wat | Waarover | Hoe vaak |
|---|---|---|
| Trigger + velocity | SPI + LDAC | per noot, 1 kHz |
| Tune / decay / snappy | I²C (SDA/SCL op pin 17/18) | per patch |
| Audio terug | I2SDn via ADC | continu |

I²C-adressen botsen als er meerdere identieke kaarten in het systeem
zitten — SPI met geografische CS (74HC154-decoder op het busboard) is
daarvoor veiliger. Afwegen bij het ontwerp.

## Latere uitbreiding, niet nu bouwen

Wil je ooit strakker dan 1 ms — microtiming, flams, swing met sub-ms
placement — stuur dan een offset mee in het bericht en laat een klein
CPLD op de kaart de puls met die vertraging afvuren.

Voor drums is dat niet nodig. Pas bouwen als je het mist.

## Openstaande vragen

- SPI of I²C voor de patch-parameters?
- Mono terug over I2SDn, of stereo met per-voice panning?
- Aparte uitgangen per voice voor opname? Dat vraagt meer I2S-lijnen
  dan het slot heeft.
- Kalibratieprocedure: hoe stel je tune-DAC-waarden af per exemplaar,
  gegeven componenttoleranties in de bridged-T?
