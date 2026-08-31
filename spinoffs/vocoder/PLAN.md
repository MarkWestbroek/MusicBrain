# Vocoder als MusicBrain-kaart

Kanaalvocoder (het muzikale effect), niet spraakcompressie. Let op bij
literatuuronderzoek: "vocoder" betekent in telecomcontext iets heel
anders (Codec2, AMBE). Die FPGA-implementaties bestaan wel maar helpen
hier niet.

## Waarom dit niet op de Teensy hoort

Niet vanwege rekenkracht. Een Teensy 4.1 trekt 20 banden moeiteloos:
40 biquads op 44,1 kHz is ~18 MOPS, triviaal voor een 600 MHz M7 met
FPU. De Teensy Audio Library heeft er zelfs bouwstenen voor
(`AudioFilterStateVariable`, RMS-analyse, `AudioEffectMultiply`).

Er zijn twee andere redenen:

**Architectuur.** MusicBrains pitch is dat audio analoog blijft en het
brein alleen relais, CV en gate spreekt. Een vocoder op de
brein-Teensy breekt dat. De FPGA-kaart is al een audio-instrument
(FPGA voice 0.3.0: 8-stemmige Karplus-Strong + MS-20-filter als
SPI-instrument aan de CV/gate-bus), dus daar past het wél.

**Latency.** De Audio Library werkt in blokken van 128 samples
(~2,9 ms bij 44,1 kHz) en een vocoderketen stapelt die vertraging op
per trap. Op FPGA doe je alles sample-voor-sample met vaste latency.

## Referentie-implementatie

Open source vocoders op FPGA zijn zeldzaam; de VOXOS-auteur schrijft
zelf dat hij er geen kon vinden.

**VOXOS** (MIT 6.205, 2023) — `github.com/Li357/voxos`, SystemVerilog.
Verreweg de bruikbaarste referentie. Ontwerpkeuzes:

- 24 vierde-orde Butterworth IIR-banden, 50–7000 Hz, logaritmisch
  verdeeld, als gecascadeerde biquads
- envelope-detectie: vierde-orde laagdoorlaat op 100 Hz over het
  gelijkgerichte signaal (20–250 Hz geprobeerd)
- coëfficiënten geschaald met 2²⁰ als 32-bits integers, 64-bits
  tussenresultaten, zo laat mogelijk terugschuiven
- DDS als carrier
- timesharing van biquads: 35 pipelinetrappen per filter

**Belangrijke bevinding uit VOXOS:** een apart ruispad voor sisklanken
gaf géén betere output. Blok- en zaagtandgolven bevatten al genoeg
harmonischen, en de 7 kHz-bovengrens pakt de unvoiced klanken
voldoende mee. **Niet vooraf inbouwen.** Kies een harmonisch rijke
carrier en kijk of je het mist.

**jpcarvao/FPGA_speech_vocoder** — DE1-SoC. Minder gedocumenteerd, maar
de MATLAB-scripts die de Verilog-filterbank genereren zijn herbruikbaar.

## Resourcebudget op Tang Primer 20K

De GW2A-18 heeft **48 18×18-multipliers**. VOXOS gebruikte ~90% van
120 DSP48-slices voor 24 gecascadeerde biquads. Je hebt dus grofweg
40% van hun DSP-budget, en meerdere 18×18's per 32×24-product.

**24 biquads fysiek instantiëren gaat niet lukken. Timesharing is
verplicht.**

Rekensom:

```
24 banden × 2 signalen (modulator + carrier) × 2 biquads =  96
24 envelope-filters (2e orde)                            =  48
                                                     ----------
                                             totaal      ~150 biquad-evals/sample

bij 100 MHz en 48 kHz:  2083 klokcycli per sample
```

Met een goed gepijplijnde core die elke ~10 cycli een evaluatie
oplevert haal je ~200 evaluaties. **2 tot 4 fysieke cores volstaan.**

VOXOS liep tegen 35·N cycli aan, maar dat kwam doordat ze al 24 filters
parallel hadden staan — een ander regime dan waar jij in zit.

## Fixed-point: de grootste tijdvreter

Zie ook `doc/spinoffs/README.md` en het filterfrequentie-stuk hieronder.

De integrator van een TPT/SVF is `state += g * ingang`, met
`g = tan(π·fc/fs)`. Bij lage `fc` wordt `g` klein:

| fc (bij fs=48k) | g |
|---|---|
| 5000 Hz | 0,339 |
| 1000 Hz | 0,0655 |
| 100 Hz | 0,00655 |
| 50 Hz | 0,00327 |

In Q1.15 (LSB ≈ 3,05·10⁻⁵) geldt voor de 100 Hz-band:

- signaal op −40 dBFS: increment ≈ 6,55·10⁻⁵ → 2 LSB. Krap.
- signaal op −60 dBFS: increment ≈ 6,6·10⁻⁶ → **0,2 LSB → nul**.

De integrator beweegt dan niet meer: het filter is doof voor zachte
signalen in de onderste banden. Omdat afkappen altijd dezelfde kant op
gaat krijg je bovendien DC-offset en limit cycles — hoorbaar als een
constant brommetje in de stilte.

**Vuistregel:** elke octaaf omlaag halveert `g` en kost één extra
fractioneel bit. Van 5 kHz naar 100 Hz is ~5,7 octaven, dus je onderste
band heeft ~6 bits meer nodig dan je bovenste.

Bij hoge Q wordt de state veel groter dan het ingangssignaal, dus je
hebt óók extra *integer* bits als headroom. Vandaar VOXOS' 64-bits
tussenresultaten.

**Oplossingen, in volgorde van aanpakken:**

1. **State veel breder dan audio.** 24-bits samples, 48-bits state met
   ~40 fractionele bits. Goedkoop in LUTs, lost het grootste deel op.
2. **Zo laat mogelijk afronden.** State in volle resolutie houden, pas
   terugschuiven bij de uitgang.
3. **Multirate** (alleen als 1 en 2 niet volstaan) — zie hieronder.

## Multirate, als optie

`g` hangt af van de *verhouding* `fc/fs`. Halveer `fs` en `g`
verdubbelt: **elke factor 2 decimatie geeft één bit terug**, precies
wat een octaaf omlaag je kostte.

Decimeren gebeurt **per groep, niet per band**:

| Groep | Banden | Rate | Decimatie |
|---|---|---|---|
| A | 1500–7000 Hz | 48 kHz | — |
| B | 400–1500 Hz | 12 kHz | ÷4 |
| C | 50–400 Hz | 3 kHz | ÷16 |

Voor de 50 Hz-band: g gaat van 0,0033 naar 0,052. Factor 16, vier bits
terugverdiend.

Twee filters die je niet moet verwarren:

- **anti-aliasfilter** — grof, op 48 kHz, zorgt alleen dat er niets
  boven de nieuwe Nyquist zit. Eén per groep.
- **banddefiniërende bandpass** — scherp, smal, op de láge rate. Dit
  zijn de filters met het `g`-probleem.

Bij 3 kHz ligt Nyquist op 1500 Hz terwijl de hoogste band in groep C op
400 Hz zit — bijna twee octaven overgangsgebied, dus een vierde-orde
Butterworth volstaat. **Decimeer bewust minder ver dan je bandgrenzen
toestaan**, anders heb je een brute steile anti-alias nodig.

Aan de synthesekant moet dit gespiegeld: carrier door dezelfde
groepsindeling, op lage rate vermenigvuldigen met de envelope, dan
interpoleren (nullen + laagdoorlaat) voordat je optelt.

**Valkuil:** elke groep heeft een andere doorlooptijd. Zonder
kunstmatige vertraging van de snelle groepen komen de banden uit fase
samen → kamfiltering op de overgangen.

**Goedkope tussenoplossing:** decimeer alleen het **envelope-pad**. Een
envelope heeft ~100 Hz bandbreedte, dus na gelijkrichten en
laagdoorlaten mag die naar 1 kHz. Scheelt 24 filters op volle snelheid
zonder aan de bandpassbank te komen.

## Filterfrequentie over de bus: 16 bits exponentieel

Over 10 octaven: 65536 / (10 × 1200 cent) ≈ **5,5 stappen per cent**.

Voor een gewone cutoff-sweep zouden 12 bits niet hoorbaar slechter
zijn. De reden voor 16 bits is **zelfoscillatie**: een filter met open
Q is een VCO en moet stemmen. Bij 12 bits zit je op 3,5 cent per stap
en dat hoor je in een akkoord.

**Verplicht exponentieel.** Lineair 0–20 kHz over 16 bits geeft 0,3 Hz
per stap; bij 20 Hz cutoff is dat 26 cent. Dan betaal je 16 bits en
krijg je er 12 waar het uitmaakt.

**Gevolg voor `g`:** bij fs=48k en fc=20 Hz is g ≈ 0,001309. Eén cent
verschil → Δg ≈ 7,6·10⁻⁷; een stap van 0,18 cent → Δg ≈ 1,4·10⁻⁷.
Dat vraagt **minstens 23 fractionele bits → Q8.24 voor `g`**. Anders
zijn onderin hele blokken regelwaarden identiek: de knop beweegt, het
filter niet.

**Protocolhygiëne:** stuur de log-frequentiecode, niet `g`. Laat de
kaart zelf `tan()` doen (LUT van 512 punten met lineaire interpolatie
in BRAM). Anders zit je filtertopologie in je busprotocol gebakken en
kun je de SVF nooit vervangen zonder alle firmware aan te raken.

**Interpoleren:** 48 kHz / 1 kHz = 48 samples tussen updates. Een
abrupte `g`-wijziging bij hoge Q verstoort de energie in de
integrators — dat klinkt als een tik. Lineair interpoleren is één
optelling per sample. Gewoon doen.

## Openstaande vragen

- **Audiopad.** Een vocoder heeft twee ingangen (modulator + carrier)
  en één uitgang, maar het slot heeft één I2SDn-lijn. Opties: carrier
  intern genereren op de FPGA (Karplus-Strong of DDS) zodat alleen de
  microfoon van buiten komt via `J17` `I2S_IN`; of TDM over de
  audiohub `J24`.
- Bandaantal: 16 of 24? 16 scheelt een derde van je DSP-budget.
- Wordt dit een aparte kaart of een modus van de bestaande FPGA-voice?
  De filterbank is grotendeels dezelfde hardware als de MS-20-filter.
- Carrier-keuze: eigen DDS zaagtand, of de bestaande Karplus-Strong
  stemmen als carrier (harmonisch rijk, en muzikaal interessant).

## Eerste meting voordat je iets bouwt

Gooi een sinus van 60 Hz op −60 dBFS door één band van je bestaande
TPT-SVF en kijk of er wat uitkomt. Dat vertelt je meteen of je
huidige woordbreedtes volstaan.
