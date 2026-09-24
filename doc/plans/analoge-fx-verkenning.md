# Analoge versies van de FX-modules — verkenning

> Hardware-spoor. Opgesteld 2026-09-24 na het bouwen van de digitale
> compressors en EQ's (`vintage-compressors.md`, `vintage-eq.md`). Status:
> verkenning; geen besluiten. Bouwt op `doc/spi-bus-spec.md` en
> `doc/poly-analog-spec.md` (B1/B2/B9: dom waar het kan, RP2040 waar het moet).
> Conceptschema's (ERC 0, geen PCB): `hardware/schematics/concept/musicbrain-consoleeq/`
> en `…/musicbrain-compkaart/` (2026-09-24).

## Uitgangspunt

MusicBrain wil analoge apparaten aansturen en modules met *touch*. Van de
digitale FX van deze week is per module de vraag: wat verlies je digitaal,
en wat win je met een echte knop? Drie antwoorden:

1. **Het circuit ís het geluid** (inductor-EQ, diodebrug, passieve EQ,
   buis): analoog bouwen loont.
2. **Het regelelement geeft de kleur, de detector niet** (alle
   compressors): hybride — analoog gain-element, digitale detector.
3. **Schone rekenfilters** (Para EQ): digitaal laten, hooguit een fysieke
   controller ervoor.

Rode draad: het analoge pad blijft **analoog van in tot uit**; de Brain
levert alleen stuur-CV's, precies zoals bij VCA8/VCF8. Dan geldt overal
hetzelfde contract: het pad werkt ook als de MCU zwijgt.

## 1. Console EQ analoog, met dCV-sturing

Ja, dat kan, en de 1073-vorm leent zich er beter voor dan een parametrische
EQ, omdat de **frequenties vast** zijn en alleen de **gains** continu.

**Frequentiekeuze = schakelen.** Elke band heeft 4–6 vaste standen; dat zijn
condensator-/spoelcombinaties die je met analoge schakelaars of kleine relais
kiest. Een 74HC4051/4052 (of DG-serie voor lagere vervorming) per band,
gestuurd door 2–3 GPIO's. Relais (bv. Kemet EA2) klinken het schoonst maar
kosten meer en klikken; voor "vaste standen" is dat acceptabel, want die
schakel je niet in een sweep.

**Gain = een VCA in de boost/cut-lus.** De klassieke actieve toonregeling
(Baxandall / State-variable "boost/cut" rond een opamp) heeft één potmeter
die bepaalt hoeveel van het gefilterde signaal in de terugkoppeling komt.
Vervang die pot door een **VCA-paar** (THAT2181 of SSI2164) of een
**multiplicerende DAC** (AD5443/MDAC in de terugkoppeling): dan is de gain een
CV van −16 … +16 dB. De THAT2181 is exponentieel (dB per volt) — precies wat
een gain-knop wil. Drie VCA's voor drie banden.

**De inductor.** Een echte spoel voor 35–220 Hz is groot (tientallen mH,
kern nodig). Alternatief: een **gyrator** (opamp + 2 R + 1 C die zich als
spoel gedraagt). Klinkt bij normale niveaus hetzelfde; wat je mist is de
kernverzadiging bij hard aansturen. Voor de middenband (360 Hz–7,2 kHz) zijn
echte spoelen wel haalbaar (mH-bereik, ferriet). Voorstel: gyrators voor het
laag, echte spoel voor het midden.

**Kleur:** klasse-A discrete uitgangstrap (2 transistors) of een klein
line-transformatortje (Edcor, ~€15) aan de uitgang. Dat is de duurste
"knop", maar wel het verschil tussen "EQ" en "die EQ".

**Front:** drie gain-potmeters + drie keuzeschakelaars + HPF-schakelaar.
Potmeters lezen via ADC op de kaart-MCU (B9), zodat de editor ze spiegelt en
presets werken; de VCA's krijgen de som van pot en Brain-CV.

Bouwbaarheid: goed. Onderdelen ~€35 (met transformator ~€50), 80×45-kaart,
één RP2040 of dom met DAC-keten (zie §4).

## 2. Diodebrug, digitaal gestuurd

De diodebrug is het meest "MusicBrain-achtige" gain-element: vier diodes in
een brug tussen twee transformatoren (of transformatorloos met een
symmetrische driver), en de **stuurstroom** door de brug bepaalt de
verzwakking. Die stroom levert een V→I-trap uit een DAC-CV. De niet-lineaire
kleur (oneven harmonischen, meegroeiend met de gain reduction) ontstaat
vanzelf: hoe minder stuurstroom, hoe meer het signaal de diodes "ziet".

Wat lastig is: de brug wil een **laag signaalniveau** (tientallen mV) en
moet daarna weer versterkt worden — dus ruis en balans luisteren nauw; de
originelen gebruiken gematchte diodes en een trimpot voor de balans. Op een
kaart: 1N4148-quad of BAT54-brug, trimmer, INA/opamp-versterker erachter.

De detector is dan digitaal (§4). Precies wat het DIODE COMP-kernel nu al
doet, met als enige verschil dat de gain reduction niet naar een `exp()`
maar naar een DAC gaat.

Bouwbaarheid: middel (balansafregeling), onderdelen ~€20.

## 3. Pultec met gyrators

Het passieve netwerk (L, C, potmeters) plus een versterker die het
insertieverlies (~16 dB) goedmaakt. Met gyrators in plaats van spoelen wordt
het klein en goedkoop; wat overblijft van "passief" is de topologie — en
daar zit de Pultec-truc in, niet in de spoel.

Sturing: de boost/atten-knoppen zijn hier **potmeters in het signaalpad**.
Digitaal sturen kan met (a) digitale potmeters (MCP41xx: 5 V-bereik, wat
vervorming; matig), (b) VCA-gestuurde varianten van hetzelfde netwerk (dan is
het geen passief netwerk meer, maar de curve blijft), of (c) **echte potmeters
met een motor** (ALPS RSA0N11M9, ~€25/stuk) — de Roto-gedachte: touch én
recall. Voor een eerste versie: gewone potmeters, alleen *uitgelezen* door
de MCU (presets zijn dan "draai naar…"-aanwijzingen op het display, niet
automatisch). Buisje eventueel als aparte "tube stage"-kaart.

Bouwbaarheid: goed zonder sturing (~€25), matig met echte sturing.

## 4. Hybride compressors: waar zit de detector?

Het analoge pad: **in → [gain-element] → out**, met een CV naar het
gain-element. Alle vijf compressorkarakters verschillen alleen in dat
element en in de detector-tijden:

| Karakter | Gain-element | CV |
|---|---|---|
| VCA-bus | THAT2181 / SSI2164 | dB/V, schoon |
| FET | één JFET als regelbare weerstand (2N5457) + lokale feedback-trim | spanning, niet-lineair — kalibreren |
| Opto | LED + LDR (NSL-32) of Vactrol | stroom; de traagheid komt gratis en echt |
| Diodebrug | §2 | stroom |
| Vari-mu | buis — apart project (hoogspanning) | — |

Eén **"gain-element-kaart"** met een keuze uit VCA / FET / opto (drie
bestukkingsvarianten van dezelfde print, of drie kleine dochterprintjes op
één moederkaart) plus een gedeelde detector geeft drie analoge compressors
voor de prijs van één ontwerp.

### Vier manieren om de detector te doen

**A. Analoge envelope, trage ADC, logica in de Brain.** Gelijkrichter + RC op
de kaart maakt een envelope; de Brain leest die via de 8× ADC-kaart of een
ADC op de kaart (12 bit, ~1 kHz is genoeg voor een envelope), rekent attack/
release/knie/ratio digitaal en stuurt de CV terug via DAC. Busverkeer:
verwaarloosbaar (dit is wat de bus al doet voor CV's). **Nadeel:** de lus
Brain→bus→DAC loopt op CV-tempo (1 kHz, ~1–3 ms). Een FET-attack van 20 µs
of een SSL op 0,1 ms is dan onmogelijk; de opto (10 ms) en de vari-mu wel.

**B. Audio-ADC op de kaart, streamen naar de Brain.** 12 bit op 44,1 kHz is
voor een detector ruim voldoende (je meet niveau, geen audio). Per stereo-
kaart ~1,1 Mbit/s. Dat past **niet** in het SPI-CV-regime (korte transacties,
1 kHz) — het zou de CV-timing blokkeren. Wél mogelijk over de **audiolijnen
van het slot** (I2S-data per slot naar de Brain, spec §Audio-lijnen): dan is
de detector gewoon de bestaande `mmb_dsp`-kernel in de Brain op een
audiostroom, en gaat de CV terug via DAC. Nadeel: de Brain wordt de
flessenhals (elke analoge compressor kost er een audio-ingang en een DSP-
slot), en de lus heeft nog steeds bus-latentie voor de attack.

**C. Lokale sub-brain op de kaart (de gedelegeerde module-engine).** Een
MCU op de kaart met eigen audio-ADC (of alleen een envelope-ADC) draait de
detector zelf en stuurt lokaal de DAC. De Brain stuurt alleen *parameters*
(threshold, ratio, tijden, mode) en leest *status* (GR-meter, knopstanden)
over CS2 — een handvol bytes per poll, precies het B2-patroon. **Dit is de
enige route die de snelle karakters (FET, SSL) haalt**, want de lus blijft op
de kaart: ADC → rekenen → DAC in microseconden.

De DSP is er al: de `mmb_dsp`-kernels zijn header-only C++ zonder heap en
compileren voor elke Cortex-M. Voorwaarde: een **FPU**. De RP2040 (M0+) heeft
er geen — een tanh per sample wordt daar te duur. Kandidaten:
- **RP2350** (Cortex-M33 met FPU, 150 MHz, PIO voor de SPI-slave, ~€1,5;
  Pico-2-toolchain = dezelfde als de RP2040-lijn die al in het plan zit).
- **STM32G431** (M4F, 170 MHz, ingebouwde 12-bit ADC's op 4 MSPS én twee
  12-bit DAC's — geen externe converters nodig; ~€3).
Voor een compressor-kaart is de STM32G4 verleidelijk (ADC+DAC aan boord),
voor bus-compatibiliteit met VCF8/VCO8 de RP2350 (zelfde PIO-SPI-slave).
Een kaart-MCU leest ook de knoppen (B9): touch en recall in één keer.

**D. Volledig analoge detector** (zoals het origineel). Klinkt het echtst,
maar dan verlies je precies wat MusicBrain wil: presets, editor,
gedeelde kernels, de sim die klinkt als de hardware. Alleen als
referentie-experiment.

### Aanbeveling

- **Detector = C**, lokale sub-brain met FPU, `mmb_dsp`-kernel ongewijzigd.
  De Brain praat parameters en status, geen audio. Zo klinken de digitale
  module in de sim, de digitale module op de Teensy en de analoge kaart
  *dezelfde detector* — alleen het gain-element verschilt, en dat is precies
  het deel dat je analoog wilt.
- **Bus:** parameters over CS2 zoals bij VCF8 (B2/B4); audio blijft analoog
  op de jack8-front (B8). Geen audio over de bus.
- **Traag-pad fallback:** dezelfde kaart werkt ook met route A als de MCU
  ontbreekt (alleen de opto-variant klinkt dan nog goed).

## 5. Volgorde en kosten (ruw)

| # | Kaart | Waarom eerst | Onderdelen |
|---|---|---|---|
| 1 | **Console EQ** | Grootste hoorbare winst, goed bouwbaar, past op VCF8-ervaring (gyrators, VCA's, schakelaars) | ~€35–50 |
| 2 | **Compressor-kaart, VCA-variant** met RP2350/STM32G4 | Bewijst het sub-brain-patroon (C) met het simpelste gain-element; daarna FET en opto als bestukkingsvariant | ~€30 + MCU |
| 3 | **FET- en opto-dochterprintjes** | Zelfde moederkaart, ander gain-element | ~€10 per stuk |
| 4 | **Diodebrug** | Zelfde moederkaart; balansafregeling is het werk | ~€15 |
| 5 | **Pultec/gyrator** | Los, passief, eerst zonder sturing | ~€25 |
| — | Vari-mu | Buizen, 200 V: apart project, later | — |

Per stap eerst een breadboard (zoals de RP2040-SPI-slave-testavond) voordat
er een print komt.

## Open vragen

- RP2350 of STM32G4 als sub-brain: PIO-SPI-slave (bus-compatibel) versus
  ADC/DAC aan boord (minder onderdelen). Eén breadboard-avond beslist het.
- Gain-element-CV-schaal per variant (dB/V voor VCA, gekalibreerde curve voor
  FET/LDR): kalibratie in de kaart-MCU (B10-stijl), tabel in flash.
- Front: 80×45-slotkaart met jack8-front, of een breder front met knoppen
  (Console EQ heeft er zeven).
- Motorpotmeters (recall met touch) — premium, later; eerst uitlezen.
