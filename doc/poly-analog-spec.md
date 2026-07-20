# Poly-analoge modules op de Cortex SPI-bus — basisontwerp

**Documentversie**: v0.4 (concept) — 2026-07-20
**Status**: basisontwerp ter review; nog geen KiCad-werk gestart
**Bronnen**: schets `doc/sketches/2026-07-20 VCA8 VCO8 VCF8.jpg`,
prijslijst `hardware/Sourcing/Sound Semiconductor Pricing and Terms 7-2-26.pdf`

## Doel

Analoge polyfonie zonder 8× dezelfde eurorack-module te kopen: één module
draagt **8 (uitbreidbaar tot 32) identieke analoge stemmen** (VCO, VCF of
VCA), aangestuurd vanuit de Brain via de SPI-bus (dCV), met **één set
controls** voor alle stemmen — zoals de patcher het digitaal al weergeeft:
N modules, 1 front.

Uitgangspunten uit bestaande documenten:

- Bus gen 2 (2×12), geografische CS, LDAC-buslijn — `doc/spi-bus-spec.md`.
- dCV = u16 offset-binary over het kanaalbereik — ADR 0014.
- Poly-adressering: port-major blokken — ADR 0015.
- Interpolatie hoort bij de breakout-zijde — ADR 0008.

## Kernbesluiten (voorstel)

### B1 — Twee soorten kaarten: dom waar het kan, RP2040 waar het moet

- **VCA8 is dom** (dac8/gate8-patroon): SPI → octale DAC → 2× SSI2164.
  Geen controls, geen display, geen MCU. Blijft een gewone 80×45-slotkaart.
- **VCF8 en VCO8 zijn slimme modules** met een kaart-MCU: zodra display,
  mode-/golfvormkeuze en tuning-meting erbij komen, kan een DAC-only kaart
  het niet meer. Keuze: **RP2040** (~€1, LCSC C2040, JLC-bestukbaar; + flash
  en kristal ≈ €2). Doorslaggevend: PIO = deterministische SPI-slave én
  sub-µs periodemeting voor tuning; 30 GPIO's; toolchain bekend
  (`doc/tech/rp2040.md`).

### B2 — Hybride aansturing: CV's direct, al het trage achter de MCU

Per slimme module twee selects uit hetzelfde slot (zie B4):

- **CS → de DAC-keten, rechtstreeks** (geen MCU ertussen): timing-kritisch
  pad identiek aan dac8 — deterministisch, LDAC-synchroon.
- **CS2 → RP2040** als gedisciplineerde SPI-slave (FPGA-regime, korte
  transacties) voor het trage: mode-/golfvormkeuze, tune-verkeer,
  displaydata, encoder-events. Achter de RP2040: lokale SPI/I2C (RP2040 =
  master) voor de octale 12-bit DAC (res/PWM), muxen en displays.

Valt de MCU uit, dan werkt het CV-pad gewoon. Consolidatie naar "MCU doet
alles, één CS, lokale ADR 0008-interpolatie" is een v2-optie.

**Fallback (design-in, kost alleen 2 sporen)**: mocht de RP2040-PIO-SPI-slave
tegenvallen, dan schakelt de firmware het trage kanaal om naar **UART over
de ongebruikte audiolijnen** van de modulekabel (pins 22/23, BCLK/LRCLK —
analoge modules gebruiken die toch niet; UART-delegates zijn bestaand
beleid in de bus-spec). De backbone routeert beide opties naar de RP2040;
de keuze is firmware, geen respin.

### B3 — CV-klassen per parameter

> **Twee spanningsdomeinen, niet verwarren** (helder na Marks vraag
> 2026-07-20 + `doc/eurorack/`): 
> 1. **Intern (DAC → regelpen chip)** — wat de analoge chip aan zijn
>    stuuringang wil zien; **klein en datasheet-specifiek** (0–2,5 V res,
>    0–2,2 V PWM, −0,75 V/oct pitch-expo, +40…−150 mV AS3350-Q). **Dit
>    bepaalt de DAC-keuze.** Onze DAC stuurt de pen direct.
> 2. **Extern (frontjack → somtrap)** — wat een gebruiker vanuit ándere
>    eurorack-modules in de front-CV-ingangen patcht; **eurorack-conventie**:
>    ±5 V nominaal bipolair, 0–5/0–8 V unipolair, moet ±12 V overleven,
>    attenuverter om te temmen (MI klipt op ±8 V — onze referentie). **Dit
>    bepaalt de front-ingangstrap** (B9), níet de DAC.
>
> De eurorack-±5V-conventie verandert de DAC-keuze dus **niet**: de DAC ziet
> nooit ±5 V, hij maakt de kleine interne stuurspanning zelf. DAC-bijdrage
> (digitaal pad) en externe front-CV (analoog pad) **sommeren op hetzelfde
> stuurknooppunt van de chip** — bij deze chips vaak een stroom-somingang,
> dus via twee weerstanden netjes te mengen.

Tabel hieronder = **domein 1** (intern). Dat bepaalt de DAC-keuze:

| Parameter | Soort | Bereik | Hardware |
|---|---|---|---|
| VCO pitch | precisie, **bipolair/breed** | 0–10 V (of ±) | 2× AD5754 daisy op CS + ADR421 (= dac8-kern) |
| **VCF cutoff** | precisie, **bipolair/breed** | idem | idem — zelfoscillatie = filter wordt oscillator |
| VCA level | **unipolair 0–3V3** | 0…3,3 V | DAC128S085 (octaal 12-bit) direct |
| VCF res, VCO PWM | **unipolair 0–3V3** | 0…3,3 V | DAC128S085 achter de RP2040 |
| mode / golfvormkeuze | 2 bit logica | — | RP2040-GPIO → muxen |

**Sleutelonderscheid** (naar aanleiding van Marks vragen 2026-07-20):

- **Unipolaire regel-CV's** (VCA-level naar de SSI2164-VC, VCF-res, VCO-PWM)
  willen **0…3,3 V ground-referenced** — precies wat een **DAC128S085**
  (octaal 12-bit, VA=VREF=+3V3, rail-to-rail) rechtstreeks levert. Eén chip,
  8 kanalen, TSSOP-16, **~€6 bij LCSC** (C882851), JLC bestukt hem. Dit is
  de standaard mod-CV-DAC. 12-bit = 0,024 dB/stap op de VCA — ruim genoeg.
  Kanttekeningen: **geen hardware-LDAC** (software-sync; niet erg voor
  amplitude) en **POR = 0 V** (VCA start kort op vol volume — firmware mute
  eerst). Daisy via DOUT voor de VCA16.
- **Bipolaire/brede precisie-CV's** (pitch, cutoff) kunnen **niet** van een
  0–3V3-DAC komen: een VCO wil ~0–10 V over 10 octaven en een zelfoscillerend
  filter net zo. Dat is exact waarvoor de **AD5754** in het project zit
  (softwarematige bipolaire ranges ±5/±10 V, 16-bit, ADR 0004/0014) — de
  bewezen dac8-kern. **De DAC128S085 haalt die kaarten dus niet**; VCF8/VCO8
  houden de AD5754 voor het pitch/cutoff-pad, met de DAC128S085 ernaast voor
  res/PWM.

> **Waarom niet gewoon overal een goedkope 12-bitter + opamp-booster?**
> Kan (Alfa's CEM3350-appnote stuurt de freq met ±12 V opamp-trappen), maar
> voor 1 V/oct-pitch en zelfoscillatie telt elke LSB en elke offset/drift —
> een 12-bit-DAC + discrete boost haalt de tracking niet zonder trimmen en
> kalibratie-silicium. De AD5754 dóét de range + 16-bit + on-chip trim al.
> **AD5754 bij LCSC = ~€28** (niet €2!); goedkoper zelf sourcen (Mouser/AD)
> of consignment. Voor de unipolaire massa (level/res/PWM) is de €6-octaal
> juist wél de goedkope route. (DAC128S085 = €8,30 @1, €6 pas @2500 —
> per kanaal ~€1, tegen ~€7/kanaal voor de AD5754.)

#### CV-eisen per parameter — datasheet-geverifieerd (2026-07-20)

⚠️ **Correctie 2026-07-20** (Marks scepsis, terecht): een eerdere versie zette
"+40…−150 mV" als *Q-regelrange* neer. Dat is fout — dat is de **rauwe
ingangsgevoeligheid van de chip-pen**, niet een CV die je opwekt. Zie de
twee interface-stijlen hieronder.

"Brede CV", "bipolair" en "16-bit precisie" zijn **drie losse eisen**;
alleen de frequentiebepalende regelingen hebben ze alle drie. Maar
**analoge synth-chips hebben twee heel verschillende ingangsstijlen**, en dat
bepaalt hóé je de DAC eraan koppelt:

- **Genormaliseerde ingangen** (AS3394-complete-voice, veel moderne chips):
  de CV-schaal is al netjes ingekocht — pitch −0,75 V/oct, filter −0,38 V/oct,
  res 0…2,5 V, PWM 0…2,2 V. Je stuurt deze **vrij direct** (met hooguit een
  gain/offset-opamp).
- **Rauwe expo-ingangen** (AS3350-SVF, 3340-VCO — Curtis-stijl): de regelpen
  is de **kale exponentiële-omzetteringang**. AS3350: frequentie −19,6
  mV/**octaaf** (= de rauwe kT/q-transistorschaal!), Q −65 mV/**decade**;
  beide tempco **+3300 ppm**. Die kleine mV-getallen (+60…+260 mV voor freq,
  +40…−150 mV voor Q) zijn wat er **áán de pen** verschijnt — je genereert ze
  niet. Je zet er een **schaalweerstand + tempco-weerstand** voor, gevoed
  vanuit een grotere spanning. Precies wat de CEM3350-appnote (Fig. 3) doet:
  Q-pot over ±12 V → 51k → pen; freq idem. Voor de tune-stabiliteit die pitch
  en zelfoscillatie nodig hebben, wil je die grotere bronspanning precies en
  driftvrij → **AD5754** + tempco-weerstand.

Zó lees je de tabel: kolom "bron" = wat de DAC/AD5754 opwekt (zijn normale
volle schaal); "pen" = wat na het weerstandsnetwerk aan de chip verschijnt.

| Parameter | Bron (DAC-uitgang) | Pen-schaal (chip) | Koppeling |
|---|---|---|---|
| VCO pitch | AD5754 0–10 V, 16-bit | −19,6 mV/oct (3340: expo) | schaal-R + **tempco-R** |
| VCF cutoff | AD5754 0–10 V, 16-bit | −19,6 mV/oct (AS3350 expo) | schaal-R + **tempco-R** |
| VCF Q (AS3350) | DAC 0–3,3 V, 12-bit | −65 mV/decade, bipolair om biaspunt | opamp (offset) + schaal-R |
| VCF res (AS3394) | DAC 0–3,3 V, 12-bit | 0…2,5 V (genormaliseerd) | direct |
| VCO PWM | DAC 0–3,3 V, 12-bit | 0…2,2 V (genormaliseerd) | direct |
| VCA level (SSI2164) | DAC 0–3,3 V, 12-bit | 0…3,3 V = 0…−100 dB | direct |
| golfvorm-select | — | logic | **mux** (digitaal) |
| mixer/FM-depth | DAC 0–3,3 V, 12-bit | ±2 V | opamp (offset) + schaal-R |

**Conclusie op Marks vraag** (ongewijzigd, nu correct onderbouwd): resonance
en PWM hebben **géén brede of precieze bron-CV** nodig — een 12-bit-DAC
volstaat, en of dat "direct" of "via een schaal/tempco-netwerk" naar de pen
gaat hangt af van de chip-stijl, niet van de resolutie. Alleen **pitch en
cutoff** vragen een **precieze, driftvrije, brede bron** (→ AD5754), want die
wordt via het expo-netwerk pitch-nauwkeurig. De AS3350 is dus per stem méér
analoog werk dan "DAC aan de pen": elke freq- én Q-ingang krijgt een
schaal/tempco-netwerk (Curtis-recept, CEM3350-appnote als sjabloon) plus de
referentiestroom (IREF 400 µA, pin-1). Dat is een expliciet ontwerppunt voor
VCF8 — en een argument om SSI2140 (modernere, genormaliseerde interface)
serieus te wegen tegen de AS3350.

> **Kanttekening bij bereik**: deze chip-schalen zijn de *interne* control-
> ingangen, níet de **eurorack-jack-conventie** (±5 V / 0–8 V aan de patchbus,
> zie `doc/eurorack/` en een modulargrid-inventarisatie). Dat is domein 2
> (B9, inter-module-patchen); dit is domein 1 (DAC → pen). Onze DAC stuurt de
> chip direct via het weerstandsnetwerk, dus we ontwerpen naar deze
> datasheet-schalen, niet naar de jackconventie.

### B4 — CS2 via de IRQ-lijn van het eigen slot (spec-voorstel)

Elk slot heeft al twee geografische lijnen: CS (pin 13) en IRQ (pin 16).
Op slimme modules wordt **de IRQ-lijn van het eigen slot** herbestemd als
CS2 — Teensy-pinnen 28–33 zijn gewone GPIO, per slot firmware-config.
**Eén module = één slot**, ook als hij slim is.

Consequentie: geen interrupts — de Brain **pollt** de RP2040 via CS2.
Poll-frequentie is een firmware-constante: 100 Hz volstaat voor
encoders/tuning (≤ 10 ms latentie); één poll kost ~4–8 µs, dus zelfs 1 kHz
meepollen in de hartslag is ~1% buslast. Vuistregel: interrupt als
microseconden tellen (adc8-BUSY!), pollen als milliseconden mogen — bij de
poly-modules mag alles in milliseconden behalve de dCV, en die heeft zijn
eigen pad.

→ Op te nemen in `spi-bus-spec.md` bij aanvaarding.

### B5 — Kabel-slotmodel: het slot is een aansluitpunt, geen draagpunt

De XXX8-fronten zijn breder dan 4 HP en de elektronica groter dan 80×45 —
het riser-model vervalt voor deze modules. In plaats daarvan: een
**24-aderige IDC-kabel** (volledig 2×12-slotcontract) van slot naar module
brengt SPI, CS, CS2, LDAC, I2C en voeding. Met pollen is dat per module
genoeg: **6 slots = 6 slimme modules** (elk zelf 8–32 stemmen, B6).

Randvoorwaarden:
- Kabels ≤ ~30 cm; SPI op 2–4 MHz starten. De slot-pinout is al
  ribbon-vriendelijk (GND naast elke snelle lijn).
- Bij 4+ kabelmodules wordt het bestaande open punt **gebufferde bus**
  (74LVC244/245) waarschijnlijk realiteit — inplannen, niet afwachten.
- **Voeding over de ribbon alleen tot ~8 stemmen** (VCA8/VCF8 < ~100 mA;
  VCO8 ~150–200 mA = grens). Vanaf ~16 stemmen: eigen eurorack 10-pens
  voedingsheader op de module-backbone; de buskabel doet dan alleen signaal.

### B6 — Uitbreidbaar 8 → 16 → 24 → 32: kernkaarten bijprikken

Een slimme module = **backbone + 1..4 kernkaarten van elk 8 stemmen**,
alles achter één front op één busslot en één CS:

- **De AD5754-daisy rijgt via de backbone door alle kernkaarten** (SDIN →
  SDO → volgende kaart). Eén CS, één LDAC: alle 8–32 cutoffs/pitches
  latchen synchroon. Timing: 32 stemmen = 8× AD5754 in één keten ≈ 200 µs
  per volledige update @ 4 MHz — past in de 1 kHz-hartslag.
- **Lege kernslots sluiten de daisy** met een jumperblok/doorlus-dummy
  (klassieke voice-card-truc).
- **De backbone-RP2040 bedient alle kaarten** (res/PWM-DAC's, muxen,
  tune-muxen) — een uitbreidingskaart heeft geen eigen MCU en geen front,
  alleen stuursignalen.
- **Chain-out is een requirement op elke slimme backbone**: SDO van de
  laatste DAC + SCLK + CS + LDAC + lokale stuurlijnen naar buiten, zodat
  óók module-op-module slaving kan (tweede behuizing) — secundaire route;
  binnen-de-module uitbreiden is primair.
- De Brain ziet gewoon één logische module met `voiceCount` 8/16/24/32
  (ADR 0015-blokken).

VCA16+: tweede domme slotkaart op een eigen slot (slots zijn goedkoop voor
iets zonder front), of dezelfde daisy-truc — vandaar het SDO-criterium (B3).

### B7 — Bouwvorm: sandwich met staande 8-stemmige kernkaarten

```
frontpaneel (3HE; VCF8/VCO8 ~18–20 HP)
   │ encoders/M7- en Thonkiconn-moeren
backbone-bord (parallel aan front): encoders, displays, RP2040,
   │ bus-IDC-entry, voedingsheader, chain-out, 4× kernslot (~20 mm steek)
   ├──┬──┬──┬── 1..4 staande kernkaarten (110 mm hoog × D diep,
   v  v  v  v   haaks op het front), elk 8 stemmen
```

Haalbaarheid (componentoppervlak vs bewezen dichtheden ~17–30%):

| Kernkaart | Componentoppervlak | Kaartmaat | Dichtheid |
|---|---|---|---|
| VCF8-kern (4× AS3350, 2× AD5754, res-DAC, muxen, audio-IDC's) | ≈ 1700–1800 mm² | **110×50–60** | 26–31% — enkelzijdig haalbaar |
| VCO8-kern (8× AS3340, 2× AD5754, PWM-DAC, golfvorm-muxen) | ≈ 2100 mm² | **110×60–70** | 24–32% |
| (110×40) | — | alleen dubbelzijdig bestukt | conflicteert met hand-nasolderen SSI/AS |

Totale modulediepte = kaartdiepte + backbone/paneel-stapel (~15 mm) →
**65–85 mm**: Analogue Systems-klasse, geen skiff maar acceptabel.
RP2040 zit **op de backbone** (alles wat hij aanstuurt woont daar), niet op
een eigen kaartje. Audio (8 in / 8 uit per kernkaart) loopt via
IDC-ribbons op de kernkaarten zelf.

**Kernslot-contract v1** (vastgelegd 2026-07-20; geldt voor álle
kernkaarten, VCF én VCO). Mechanisch = het bewezen slotrecept: verticale
female 2×12 op de backbone, haakse male 2×12 aan de kaartonderrand.
Pins 1–6 spiegelen het busslot:

| Pin | Functie | Pin | Functie |
|----:|---|----:|---|
| 1 | GND | 2 | +12V |
| 3 | GND | 4 | −12V |
| 5 | **FMCV** (v1.1) | 6 | +3V3 |
| 7 | SCLK | 8 | GND |
| 9 | SDIN (AD5754-daisy in) | 10 | SDO (daisy uit → volgend slot) |
| 11 | CS (SYNC) | 12 | LDAC |
| 13 | SCLK2 (RP2040-SPI) | 14 | SDIN2 (DAC128S085-daisy in) |
| 15 | SDO2 (daisy uit) | 16 | CS2 |
| 17 | MODE0 | 18 | MODE1 |
| 19 | MODE2 | 20 | TSEL0 |
| 21 | TSEL1 | 22 | TSEL2 |
| 23 | **TEN** (geografisch per slot) | 24 | TOUT (open-drain, pull-up backbone) |

- **Twee daisy-ketens** rijgen door de slots (snel: AD5754-cutoff 9/10;
  traag: DAC128S085 14/15 — DOUT-daisy, dus één CS2 voor 4 kaarten);
  **lege slots = jumperblok** SDIN→SDO voor beide ketens.
- **Tune**: TSEL gedeeld, TEN geografisch (één kaart tegelijk op de
  gedeelde open-drain-TOUT) — busboard-truc, hergebruikt.
- Audio gaat níet door dit contract (kernkaart-ribbons).
- MODE0..2 gedeeld = globale modekeuze (v1); per-stem-modes later =
  contract-extensie, niet nodig voor het menu-model.
- **v1.1 (2026-07-20): pin 5 = FMCV** — de audio-rate-FM-lijn van de
  front-jack (via attenuverter op de backbone) naar de expo-somknopen van
  alle kernkaarten; ligt tussen de rustige DC-rails −12V/+3V3. GND blijft
  1/3/8. **RES-CV-jack gaat via de RP2040-ADC** op de backbone
  (control-rate volstaat voor resonantie → wordt in de
  DAC128S085-waarden gemengd; geen tweede analoge lijn nodig).

### B8 — Audio-doorlus: jack8-contract + jack8sw-front

Doorlus per 8 stemmen via het jack8-contract (1 = GND, 2–9 = kanaal,
10 = GND) als 1×10-IDC's. Normalling zit op het (optionele) front —
fronttype **jack8sw** (switched jacks, dubbele 1×10):

```
vorige module ──► IN 1×10 ──► 8× switched jack ──► UIT 1×10 ──► deze module in
                               │ geen plug: chain loopt door
                               │ wel plug:  jacksignaal vervangt het
```

Bij 16+ stemmen blijft alle audio op de rear-ribbons; frontjacks zijn een
optionele tap op (meestal) de eerste 8. Kabels: v1 gewone ribbon ≤ 30 cm
(synth-lijnniveau); bij hoorbare overspraak → 2×10 met GND-interleave.

### B9 — Controls via de RP2040; semantiek via de Brain

Encoders en displays van het module-front hangen **aan de backbone-RP2040**;
de Brain leest encoder-events bij de CS2-poll en stuurt displaydata terug.
Semantisch blijven het gewone `ControllerBreakIn`-controls: persisteerbaar,
patcher-integratie, presets. (De i2criser-keten blijft bestaan voor losse
fronten zonder module; scheelt hier een slot per front.) Per-knop
mini-OLED's (SSD1306 achter een I2C-mux) en op de VCO8 een SPI-TFT
(golfvorm). Motor-encoders à la Nina/Roto-Control: premium-optie later.

**Front-CV-ingangen = domein 2 (B3).** De frontjacks (Freq/cutoff, res, FM)
ontvangen gewone eurorack-CV en worden **analoog gesommeerd op alle stemmen**
(audio-rate FM blijft kunnen — dat kan de bus per definitie niet). Elke
ingangstrap volgt de eurorack-conventie:

- **±5 V nominaal** bipolair bruikbaar bereik, muzikaal gekalibreerd
  (MI-stijl: **±8 V kopruimte, daarna klippen**); **±12 V mag nooit schaden**
  → serie-R + clamp-dioden naar de rails (BAT54S) op elke ingang.
- **Attenuverter** (of minstens attenuator) per CV-in om de externe modulatie
  te temmen — anders zwaait bijv. een LFO de hele parameter open.
- De getemde externe CV sommeert via een schaalweerstand op **hetzelfde
  chip-stuurknooppunt** als de DAC-bijdrage; de weerstandsverhouding zet het
  relatieve gewicht (DAC = grofinstelling van de Brain, jack = live-modulatie).
- "Override" van de SPI-waarde is **Brain-beleid** (parameter loslaten zodra
  extern gemoduleerd wordt), géén analoge omschakelhardware in v1.

### B10 — Tuning: lokaal meten, centraal orkestreren

Geen analoge tune-lijn naar het busboard: per kernkaart een 4051-mux
(VCO-square, of de zelfoscillerende filteruitgang) → comparator →
RP2040-PIO-periodemeting (sub-µs). Brain: "tune stem n" via CS2, leest de
periode terug; correcties in AD5754-registers + softwaretabel (ADR 0014
§5). Elke module meet zijn eigen stemmen; de Brain sequencet — schaalt
zonder buswijziging, hoeveel bronnen er ook bijkomen.

**Meetbaarheid ≫ alleen frequentie** (discussie instelpots, 2026-07-20):

1. De PIO meet ook **duty-cycle** → VCO-PWM-range is per stem ijkbaar.
2. **Q ijkt op het oscillatie-startpunt**: Q-DAC opsweepen tot de tune-mux
   oscillatie ziet = één gemeten ankerpunt per stem (precies het muzikaal
   kritische punt); curvevorm uit de datasheet dekt de rest.
3. **Meetbus via de matrix (B12)**: reserveer één UIT-bus als route naar de
   adc8 — de Brain meet dan élke bronbus per stem (DC-/LF-testsignaal →
   VCA-gains, mixdiepten, golfvorm-niveaus). De VCA's zijn DC-gekoppeld.

**Trimmer-beleid**: géén per-stem instelpots (8× identiek afregelen = het
poly-probleem; trimmers driften zelf; een 12-bit-DAC-kanaal ís een digitale
instelpot). Wél: (a) DAC-ranges met **marge** ontwerpen zodat firmware kan
centreren (bv. Q-serie-R op ~300 µA volle schaal, ruim voorbij typ. 222 µA
oscillatie); (b) **één gedeelde range-trim mag** waar een absoluut bereik
door alle stemmen gedeeld wordt (één pot ≠ acht potten); (c) **rev-0.1-
kernkaarten krijgen DNP-trimmer-footprints** als verzekering — verwacht
onbestukt na validatie. Tolerantie-vuistregel: frequentie-paden = 1% is
hoorbaar → meten; niet-frequentie-paden = 1% ≈ 0,1–0,2 dB → sub-hoorbaar.

### B11 — Slotmap-conventie

Per module een **kanaalmap** in de README (DAC/CS2-register → parameter →
stem) en Brain-zijdig een `ModuleDefinition` (ADR 0015: port-major,
globale controls vanaf 48, `voiceCount` 8–32).

### B12 — Relatie met de analoge patchmatrix

Naast de handmatige frontjacks en de chain-doorlus komt er een
**persisteerbare audio-patchmatrix** onderin de kast
(`doc/plans/analog-patch-matrix.md`, MT8816-spoor). Drie consequenties:

1. **Module-flexibiliteit boven matrixverbindingen.** Elke extra
   patchbare in/uit kost kruispunt-silicium (rijen × kolommen). Wat per
   dCV ín de module schakelbaar is (filtermode, 2/4-pole, golfvormkeuze)
   hoeft de matrix nooit te zien → dCV-schakelbare multimode is een
   systeemeis, geen luxe (doorslag in de VCF8-chipkeuze).
2. **Poly-bussen maken de matrix bijna gratis.** Een poly-patchverbinding
   is een bus van 8 draden die altijd sámen schakelen → **8 parallelle
   MT8816-vlakken, identiek geadresseerd** (adres/data/strobe parallel,
   CS's samen, schrijven = broadcast; plane k = stem k van alle modules).
   8× MT8816 (~€5 totaal) = poly-matrix van **8 bronbussen × 16
   bestemmingsbussen** — zelfde chipaantal als de mono-32×32 uit het
   vooronderzoek. Opschalen = extra rijen planes.
3. **Headroom bepaalt de interne audio-standaard.** MT8816: totaal
   ≤ 13,2 V → audio moet binnen ~±6 V. De chain/matrix-audio wordt dus
   expliciet **±5 V nominaal** met buffers rond de matrix; resonantiepieken
   op de kaarten desnoods vóór de matrix schalen. (Vastleggen zodra de
   matrixkaart ontworpen wordt; zelfde kast-onderin-locatie als de
   busexpander in het kabelmodel — combineren ligt voor de hand.)

## De drie modules

### VCA8 — bouw deze eerst (dom, slotkaart) — **in ontwerp**

Schema + plaatsing staan (2026-07-20): `hardware/schematics/musicbrain-vca8/`
(gen_vca8.py; ERC 0, netcheck OK, 0 courtyard-overlappen — routing volgt).

- 2× SSI2164 (Class AB, −33 mV/dB: 0 V = unity, 3V3 ≈ −100 dB) + **1×
  DAC128S085** (octaal 12-bit, VA=VREF=+3V3, DIN←MOSI, DOUT→MISO daisy,
  SYNC←CS); RC-slew 100R/4µ7 per VC. Geen LDAC (software-sync), geen
  precisieref. Audio: 20k in → VCA → TL074-I/V (20k ∥ 100p) → 220R uit;
  fase inverteert.
- Geen controls/display/MCU; alleen IN- en UIT-1×10 (jack8-contract,
  harten ±13,6 mm van het kaarthart). Slotvoeding volstaat (< 50 mA per
  rail). Kaart 80×45 (standaardbreedte).
- ⚠️ POR = 0 V = unity: firmware moet als eerste actie alle kanalen op
  −100 dB zetten (anders kort vol volume bij power-up).
- Meteen bruikbaar: digitale envelopes op de bestaande
  4-stemmen-eurorack-proefopstelling.
- Valideert: DAC128S085 + daisy-contract, jack8sw-front.
- BOM-hart: **≈ €16** (DAC €6, 2× SSI €5, rest catalogus).

### VCF8 (→ 32)

- **Kern per 8 stemmen**: AS3350 (dual SVF) ×4 — LP/BP/HP, mode-keuze =
  uitgangsmux (4053). ⚠️ **Maar de AS3350 is duur in onderdelen** (bevestigd
  uit het blok-/aansluitschema, datasheet p.1, 2026-07-20):
  - Het is **géén compleet filter maar een transconductor-array** (gmF/gmQ +
    eˣ-omzetters intern); de **integrator- én uitgangsopamps staan buiten de
    chip**. Per filtersectie: externe opamps + **2 precisie-integratorcaps
    0,02 µF (C0G/film)** + 22K-feedback + control-netwerk. Voor 8 stemmen:
    ~16 externe opamps (≈4× TL074) + 16 precisiecaps + 8 control-netwerken.
  - **Rauwe Curtis-expo-ingangen** (VCF pin 8/10, VCQ pin 6/11 → eˣ-blokken):
    −19,6 mV/oct, −65 mV/decade, tempco +3300 ppm; gestuurd via
    weerstandsnetwerk (datasheet-app: 10K/200Ω per ingang), niet direct. Voor
    pitch-nauwkeurige zelfoscillatie: tempco-weerstand op de freq-drive.
  - **IREF (pin 1)**: referentiestroom 10–600 µA (typ. 400) per chip.
  - **Pinout**: 1=IREF 2=VIF1 3=VLP1 4=VIV1 5=VBP1 6=VCQ1 7=V− 8=VCF1
    9=GND 10=VCF2 11=VCQ2 12=VIF2 13=VLP2 14=VIV2 15=VBP2 16=V+.
  - **Signaalingangen**: VIF (fixed-gain, uitgang constant bij Q-sweep) en
    VIV (variable-gain, uitgang zakt bij hogere Q) — mengbaar; twee
    gelijktijdige uitgangen per sectie (LP+BP óf BP+HP).
  **→ Chipkeuze-vergelijking (datasheets bestudeerd 2026-07-20):**

  | | AS3350 | SSI2140 | SSI2144 |
  |---|---|---|---|
  | topologie | duale 2-pol SVF | 4-cel config. 1–4 pol multimode | 4-pol ladder LP-only |
  | filters/chip | **2** | 1 | 1 |
  | chips/8 stemmen | **4** | 8 | 8 |
  | package | DIP/SOIC-16 | SSOP-20 | SSOP-16 |
  | leverancier | Alfa (apart) | Sound Semi | Sound Semi |
  | prijs/stem@50 | ~€2,5 | $2,19 | $2,30 |
  | resonantie | exp −65mV/dec, bipolair → **opamp** | **on-chip lineaire Q-VCA** | **on-chip lineair 0–400µA** |
  | freq-tempco | +3300ppm, geen comp | **on-chip tempco-optie** | geen comp |
  | ext. integrator-opamps | **~4/stem** | ja (config) | **nee (zelfstandige ladder)** |
  | ext. caps | 2/sectie C0G | 4 | 8 (ladder) |
  | onderdelen/stem | **zwaar** | middel | **licht** |
  | multimode live-mux | ja (LP+BP/BP+HP) | ja in SVF-config | **nee (LP)** |

  Alle drie hebben ~−19 mV/oct rauwe expo-freq (geen onderscheid; alle drie
  een schaal/tempco-netwerk).

  **BESLOTEN (2026-07-20): VCF8 = SSI2140, multimode via dCV-schakelbare
  tap-mux.** Doorslag = het patchmatrix-argument (B12): flexibiliteit die
  per dCV ín de module zit (mode, 2/4-pole) bespaart matrixverbindingen —
  en die kosten kruispunt-silicium. Plus: on-chip lineaire resonantie,
  on-chip tempco-optie, single-source met de SSI2164's. AS3350 valt af
  (exp-resonantie-conditie, geen tempco, externe opamps, aparte
  leverancier); SSI2144 blijft de budget-terugvaloptie als een LP-only
  variant ooit gewenst is (~110×50-kern i.p.v. ~110×65).

  **Past-het-check** (8-voud + mux): per stem ≈ 250 mm² (chip 51 + 4×
  C0G-cap 27 + ½ TL074 30 + 4051-tapmux 30 + SVF/mix-R's in **0603** 50 +
  expo/Q-drive 35); 8 stemmen + gedeeld (2× AD5754 + ADR421 + DAC128S085 +
  connectoren) ≈ **2500 mm²** → bij 28–32%: **kernkaart 110×65–70,
  enkelzijdig** — binnen de B7-envelop, diepe kant.
  - **2-pole/4-pole schakelen is gratis**: de tap-mux kiest het aftakpunt
    (na sectie 2 of 4, elk LP/BP/HP) — 1× 4051 per stem, 8 modes.
    Selectlijnen gedeeld (globaal, 3 lijnen RP2040) of per stem (3×
    74HC595 aan RP2040-SPI, ~€1).
  - **Continue mode-morph (mengen i.p.v. schakelen, Xpander-stijl) = v2**:
    per stem 4 VCA-kanalen (1× SSI2164/stem!) + 4 DAC-kanalen → +8×
    SSI2164, +4× DAC128S085, +som-opamps ≈ +€35–40 en +~800 mm². Voor
    "vastleggen in de patch" dekt de mux alles; morph is een klankfeature.

  **Buildspec-bevindingen** (`doc/plans/ssi2140_8voice_buildspec.md`,
  losse Opus-sessie; verwerkt 2026-07-20):
  - **Q CTRL = stroomingang** (0–500 µA, zelfosc. ~222 µA): serie-R vanaf de
    0–3,3V-DAC ≈ **13k** (niet 20k — dan haalt 3V3 geen zelfoscillatie);
    niet-lineaire curve → firmware-lookup.
  - **Tempco vervalt**: pin 8 open + 1k pin 7→GND, temperatuurcompensatie
    via periodieke B10-tuningcycles (datasheet-advies voor µC-poly) —
    scheelt de tempco-R per stem. Cutoff-drive: AD5754 → 54,9k in EXPO
    CTRL (−18 mV/oct).
  - **Q-compensatie**: input-gain-variant (Fig. 14, 16,2k + 1k op Q VCA
    IN+) = **2 weerstanden, geen opamp**, constante passband → default.
  - **Interne niveaus laag** (buffers ±1 V, gm-in tientallen mV; 10k/200Ω
    per trap): ±5V-chain → in-attenuatie + uit-versterking, meenemen in
    het noise-budget.
  - **Topologie BESLOTEN (Mark, 2026-07-20): cascade** (Fig. 3) met
    **pole-mixing** (Fig. 20 + AN701) — behoudt het SSM2040-karakter
    (verdeelde soft-clip per trap, resonantie om de hele keten), minste
    opamps (1 som-opamp/stem), modes = vast menu van gewogen
    mix-netwerken, dCV-schakelbaar via de mux. SVF-config afgewezen
    (2 som-opamps/stem, KHN-klank ≠ waarom deze chip gekozen is).
- **CV**: cutoff = **AD5754 als precieze bron** (2× daisy op CS, 16-bit)
  → schaal- + tempco-weerstand → de −19,6 mV/oct-expo-pen (pitch-nauwkeurig
  voor zelfoscillatie). Q per stem = **DAC128S085 (0–3V3, 12-bit) → opamp
  offset/schaal** → de bipolaire Q-pen om zijn biaspunt; 8× ≈ 2 quad-opamps.
  "Q globaal" = 8× dezelfde waarde. De kleine mV-getallen zijn pen-schalen,
  níet DAC-uitgangen (B3-correctie).
- **Tuning** op de zelfoscillerende uitgang (B10).
- **Front: 20 HP** (voorzet 2026-07-20). De backbone vraagt voor 4
  kernslots ~85–90 mm (≥ 18 HP); 20 HP geeft backbone én front de ruimte.
  Indeling: links 2×8 Thonkiconn (IN/UIT, 13 mm steek, jack8sw-functie op
  de backbone); midden grote cutoff-knop (PEC12R + Ø25–28 mm knop,
  firmware-acceleratie, druk = fijnstand) met OLED; res-encoder + OLED;
  mode = **druktoets + 3 LED's** (geen schuifschakelaar: vaste stand liegt
  na preset-load — zelfde argument als encoders i.p.v. pots); onderaan
  FM-jack + depth-pot (analoge som, echte pot is hier oké) en RES-CV-jack.
  **Precies 2 OLED's** (SSD1306, adressen 0x3C/0x3D) — een derde display
  zou een I2C-mux terugbrengen; bewuste grens.
  *Compacte variant* (later, optioneel): ~10 HP zonder frontjacks =
  2 kernslots = max 16 stemmen — frontbreedte bepaalt het uitbreidplafond.
- BOM-hart eerste 8 stemmen: **€90–120**; uitbreidkaart ≈ **€70–90**.

### VCO8 (→ 32)

- **Kern per 8 stemmen**: 3340-familie — V3340M (~€2) budget, AS3340
  (~€4–5, Electric Druid-referentie), SSI2130 ($2.94@50, thru-zero FM,
  QFN). Geen trimmers per stem: kalibratie is digitaal (B10).
- **CV**: pitch = dac8-kern op CS (0–10 V @ 1 V/oct,
  `note = code·120 >> 16`); PWM per stem via DAC128S085 achter de RP2040.
- **Golfvormkeuze**: per stem 1-uit-3/4 via 4052; select uit RP2040-GPIO
  (front biedt globaal, per stem kán). **Morph** (saw↔pulse via 2× extra
  SSI2164, ~$5 + 8 CV-kanalen) = v2, sluit aan op Morph-WT.
- **Tuning**: square-mux (B10); autotune is randvoorwaarde vóór dit bord.
- **Front**: golfvorm-TFT, octaaf/detune/PWM; UIT-1×10 (+ jack8(sw)).
- BOM-hart eerste 8 stemmen: **€90–130**.

### Optioneel later

- **ENV8 analoog** (AS3310) — baseline blijft digitaal (VCA8-route).
- **VOICE8** (AS3394) — maximale dichtheid, niet patchbaar tussen de
  blokken; ander product.

## Sourcing

Sound Semiconductor rechtstreeks (prijslijst 2026-07-02, staffel 50/500):

| Chip | Functie | 50 st | 500 st |
|---|---|---|---|
| SSI2164S | quad VCA | $2.41 | $1.67 |
| SSI2140SS | multimode VCF | $2.19 | $1.52 |
| SSI2144SS | ladder VCF | $2.30 | $1.62 |
| SSI2130Q | VCO (QFN, thru-zero FM) | $2.94 | $2.62 |
| SSI2131S | VCO (SOP-16) | $2.09 | $1.77 |

Bij 8 chips per kernkaart is de 50-staffel bij ~6 kaarten bereikt.
Prototypes: Mouser/Thonk. Alfa (alfatriode.lv): AS3340 ~€4–5, AS3350 ~€5,
AS3310, AS3394. Cabintech: V3340M ~€1,50–2,50. ⚠️ Geen van deze
synth-chips staat bij LCSC.

DAC's (wél bij LCSC, JLC-bestukbaar; prijzen 2026-07-20):

| Chip | Functie | Package | LCSC | €@1 |
|---|---|---|---|---|
| DAC128S085CIMTX | octaal 12-bit (mod-CV) | TSSOP-16 | C882851 | 8,50 (30+: 6,28) |
| DAC124S085CIMM | quad 12-bit (mod-CV) | VSSOP-10 | C529295 | 3,97 |
| AD5754 (div.) | quad 16-bit bipolair (pitch/cutoff) | TSSOP-24-EP | C650230 e.a. | ~28–34 |

⚠️ **Vermeden**: DAC80004 (quad 16-bit) is €14 bij LCSC — te duur én 16-bit
onnodig voor mod-CV's. AD5754 is bij LCSC ~€28; goedkoper zelf sourcen of
consignment, en alleen op het pitch/cutoff-pad (VCF8/VCO8) nodig.

## Bestukken (strategie)

1. **JLC PCBA voor alles uit de LCSC-catalogus**: RP2040 (QFN-56 wil je
   niet met de hand), flash, kristal, opamps, muxen, passives.
2. **Synth-chips (SSI/AS, SOP/SSOP) zelf nasolderen**: flux +
   drag-solderen, één avond oefenen; tube-verpakking bestellen. Dure
   DAC's (AD5754) conform Route B pas op gevalideerde borden.
3. Consignment/lokale bestukker: pas bij serie-aantallen.

Dubbelzijdige bestukking vermijden op kernkaarten (conflicteert met 2).

## Bouwvolgorde

1. **VCA8** — dom, goedkoop, meteen nuttig; valideert DAC-keuze, chain en
   jack8sw.
2. **VCF8** — valideert CS2 (B4), RP2040-slave (B2), kabel-slotmodel (B5),
   sandwich-bouwvorm (B7), tuning (B10), display-keten en mode-mux.
3. **Uitbreidkaart VCF → 16** — valideert B6 (daisy-doorrijg, jumpers,
   voedingsheader).
4. **VCO8** — grootste bord, leunt op alles hierboven.

## Open punten

- [ ] B4 (CS2 via IRQ) en B5 (kabel-slotmodel) bekrachtigen en in
  `spi-bus-spec.md` opnemen; busbuffering (74LVC244/245) concretiseren.
- [x] Mod-CV-DAC: **DAC128S085** (octaal 12-bit, 0–3V3; B3, besloten
  2026-07-20 bij het VCA8-schema — corrigeert de eerdere DAC80004-keuze
  die €14 bleek). Pitch/cutoff blijven op de AD5754.
- [ ] AS3350 vs SSI2140 voor de VCF-kern (mode-mux-eenvoud vs single-source).
- [ ] RP2040-PIO-SPI-slave: één testavond (Pico + Teensy) **vóór de
  PCB-order van de backbone** — het schema- en frontwerk gaat gewoon door
  op de aanname dat het werkt, want de UART-fallback (B2) zit in het
  ontwerp; alleen de bestelling wacht op de test.
- [ ] Bufferfootprints (74LVC244/245, default DNP) op de busexpander
  meenemen als bestukkingsoptie.
- [x] Kernslot-contract v1 vastgelegd (zie B7): 2×12, twee daisy-ketens,
  TEN geografisch, jumperblok op lege slots; audio buiten het contract.
- [ ] Inhoud/keuze VCO8-TFT (VCF8-displays zijn beslist: 2× SSD1306).
- [ ] VCF8-front 20 HP: maatvoering verifiëren bij de echte
  componentplaatsing (grote knop vs kernslot-posities op de backbone).
- [ ] Kanaalmap + `ModuleDefinition` per module zodra het eerste schema er
  is.

## Referenties

- `doc/spi-bus-spec.md` — bus, slots, LDAC, dac8/gate8-patronen,
  FPGA-slaveregime.
- ADR 0004 / 0008 / 0014 / 0015 — resolutieklassen, interpolatie,
  dCV-encoding, poly-slotmap.
- `doc/tech/dac-sh-mux.md` — DAC + S/H-topologie (kostenoptie).
- `doc/tech/rp2040.md` — RP2040-achtergrond.
- `doc/sketches/2026-07-20 VCA8 VCO8 VCF8.jpg` — architectuurschets.
- `hardware/Sourcing/Sound Semiconductor Pricing and Terms 7-2-26.pdf`.
- Electric Druid AS3340 VCO — referentieschema VCO-kern.
- Sound Semiconductor, Alfa (alfatriode.lv), Cabintech (V3340M).
