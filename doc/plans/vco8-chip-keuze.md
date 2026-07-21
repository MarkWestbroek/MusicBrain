# VCO8 — kernchip-keuze (beslisnotitie)

**Datum:** 2026-07-21 · **Status:** **BESLOTEN — SSI2131S** (bekrachtigd Mark
2026-07-21, datasheet-geverifieerd Rev 2.0 jan 2021). VCO8 is bord #4 (laatste)
in de bouwvolgorde. Leidend: `doc/poly-analog-spec.md` §VCO8. Dit doc legt de
oscillator-kernchip vast; het schema-werk zelf wacht tot VCF8 de tuning/slave/
kernslot-stack heeft bewezen (zie "Randvoorwaarden").

## Besluit

**SSI2131S** (Sound Semiconductor, 16-lead SOP). Coherent met VCA8 (SSI2164) en
VCF8 (SSI2140) — één leverancier/consignment-kanaal — soldeerbaar SOP-16, €2,09
@50, en (nu datasheet-bevestigd) **on-chip temperatuurcompensatie** + een
expliciet **CPU-kalibreerbare fixed-trim-modus** die naadloos op de trimmerloze
digitale-cal-aanpak (B10) aansluit. De SSI2130 (thru-zero FM, sine, mixer) is
bewaard voor een eventuele v2/west-coast-variant.

## Wat voor dit bord telde (de beoordelingsassen)

1. **Handsolderbaarheid** — synth-chips worden zelf nagesoldeerd (niet bij LCSC);
   QFN lastigst, SOP prima. → SSI2131 = SOP-16 ✅.
2. **Sourcing-coherentie** — VCA8 = SSI2164, VCF8 = SSI2140; nog een Sound
   Semi-chip = één order/consignment. ✅.
3. **On-chip golfvormen** — meer op de chip = minder externe shapers per stem.
4. **Expo-tempco-compensatie** — geen per-stem trimmers (B10); on-chip tempco
   scheelt de externe +3500 ppm-weerstand én stabiliseert de auto-tune.
5. **Thru-zero FM** — complexe/west-coast FM (v2-materiaal).
6. **Referentieschema's** — kant-en-klaar = minder ontwerprisico.
7. **Auto-tune-vriendelijkheid** — schone square/pulse voor comparator→PIO (B10).

## Vergelijkingstabel

| As | V3340M (CoolAudio) | AS3340 (Alfa) | SSI2130Q | **SSI2131S** ✓ |
|---|---|---|---|---|
| Familie | CEM3340-kloon | CEM3340-kloon | Sound Semi (modern) | Sound Semi (modern) |
| Package | SOIC-16 / DIP | SSOP / DIP | QFN-32 ⚠️ | **SOP-16** ✅ |
| Prijs @50 | ~€2 | ~€4–5 | $2,94 | **$2,09** |
| Bron | Cabintech | Alfa | Sound Semi (=VCF/VCA) | **Sound Semi (=VCF/VCA)** |
| On-chip golfvormen | saw, tri, pulse(PWM) | saw, tri, pulse(PWM) | saw, tri, pulse, **sine** + mixer | **saw, tri, pulse(PWM)** |
| Sine op de chip? | nee | nee | **ja** | **nee** |
| Expo-tempco | **externe +3500 ppm-R** | **externe +3500 ppm-R** | on-chip | **on-chip ✅** |
| Thru-zero FM | nee (lin. FM wel) | nee (lin. FM wel) | **ja** | **nee (lin. FM wel)** |
| Hard + soft sync | ja | ja | ja | **ja (beide)** |
| Referentieschema's | veel (ED, Yusynth) | veel (ED-referentie) | Sound Semi app-notes | **datasheet Fig 1 (compleet)** |
| Op-amp per stem? | ja (CV-som/shapers) | ja | nee | **nee (buffered uit, passieve CV-som)** |
| Externe onderdelen/stem | hoog | hoog | laag | **laag** |
| CPU-kalibreerbaar (trimmerloos) | matig (tempco-R vast) | matig | ja | **ja, expliciet in datasheet ✅** |

De SSI2130-kolom is bevestigd via de SSI2131-datasheet zelf: *"see the SSI2130
which adds an integrated five-channel mixer, open-collector square output, sine
wave generator, and through-zero FM/PM capability."*

## SSI2131 — datasheet-geverifieerd (Rev 2.0, jan 2021)

**Kern**: precisie-analoge-multiplier-VCO, 1000:1 (10 octaven) op <1 cent na
kalibratie. Golfvormen (buffered voltage-uitgangen): **triangle, sawtooth
(0V…VREF), pulse met PWM-control**. Geen sine/mixer/TZFM (= SSI2130). "Extremely
Low External Component Count."

**Pinout (16-SOP, package-ID PSL16, JEDEC MS-012-AC):**

| Pin | Naam | Pin | Naam |
|---|---|---|---|
| 1 | SAW OUT | 16 | V+ (+5 V) |
| 2 | PULSE OUT | 15 | BW COMP |
| 3 | PWM CTRL (comparator-in) | 14 | VREF (2,5 V) |
| 4 | TRI OUT | 13 | EXPO SCALE |
| 5 | HF TRACK | 12 | LIN FREQ |
| 6 | EXPO FREQ (CV-som, ground-ref stroom) | 11 | SOFT SYNC |
| 7 | V− (−5…−18 V) | 10 | HARD SYNC |
| 8 | TCAP (timing-cap → GND) | 9 | GND |

**Voeding & referentie**: V+ = **+5 V** (strak, +4,75…+5,25); V− = **−5…−18 V**
(onze −12 prima). VREF = **2,5 V** laag-ruis/laag-impedant → de **ADR421 (2,5 V)
die al op het pitch-DAC-pad zit** is exact goed (één gedeelde ref per kaart).
100 nF lokale ontkoppeling op V+ én V−, dicht op de package.

**Externe onderdelen per stem (Figure 1)** — geen op-amp nodig, CV-som passief:
- 2× 100 nF ontkoppeling (V+/V−);
- 1× **3,9 nF C0G/NP0 of polystyreen** TCAP (lage DA/tempco), → GND;
- EXPO FREQ (pin 6): pitch-CV via serie-R (100 k → 10 µA/oct, of 50 k →
  20 µA/oct). Meerdere CV's = gewoon meer R's op dezelfde stroomsomknoop;
- EXPO SCALE (pin 13): **fixed-trim = 24,3 k vaste R vanaf VREF** (20 µA/oct) —
  geen pot; fijn-cal in de note→code-mapping (B10);
- HF TRACK (pin 5): vast netwerk **4,32 k → GND + 267 k → EXPO FREQ**;
- LIN FREQ (pin 12): ~5 µA via **499 k vanaf VREF** (als geen lineaire FM);
- BW COMP (pin 15): **270 Ω in serie met 10 nF → GND**;
- HARD SYNC (pin 10) → GND indien ongebruikt; SOFT SYNC (pin 11) open indien
  ongebruikt.

**Kalibratie (de kern van de keuze)**: twee trim-assen — **EXPO SCALE** (V/oct)
en **HF TRACK** (hoogfrequent-tracking). Datasheet letterlijk: *"Optional trims
… can be automated by CPU-calibrated systems."* Er is een **fixed-trim-modus met
uitsluitend vaste weerstanden** (24,3 k scale + 4,32 k/267 k HFT) → geen pots op
het bord; de PIO-periodemeting (B10) corrigeert scale/offset per stem in
software. Temperatuur wordt on-chip gecompenseerd → **geen externe tempco-R**
(anders dan de 3340). Het 0 V/oct-nulpunt (bias) komt bij ons uit de absolute
AD5754-pitchspanning, niet uit een handmatige bias-pot.

**Auto-tune-pad**: PULSE OUT (pin 2) is een schone comparator-square
(GND↔VREF) → direct naar de tune-comparator → PIO-periodemeting. Bevestigd
auto-tune-vriendelijk.

**Bestellen**: SSI2131SS-TU (tube, 50) of SSI2131SS-RT (tape&reel, 4000);
Sound Semi rechtstreeks / Mouser / Thonk. Niet bij LCSC → zelf nasolderen
(SOP-16, doenbaar), of consignment bij JLC (zie sourcing-spec).

## Afweging (waarom niet de anderen)

**AS3340 / V3340M** — klassieke Curtis-sound + veel referentieschema's, maar op
dít bord: externe **tempco-weerstand per stem** (tegen de trimmerloze filosofie
in), op-amps voor CV-som/shapers (meer oppervlak), 3340 heeft **geen on-chip
sine**, en (AS3340) 2× de prijs + **gesplitste sourcing** (Alfa naast Sound
Semi). Sound/nostalgie tegen dichtheid + logistiek.

**SSI2130Q** — feature-koning, maar QFN-32 (4×4 mm) → op een kaart waar de
synth-chips NIET door LCSC geplaatst worden (Sound Semi niet bij LCSC, geen
hotplate) is dat handmatig nauwelijks te solderen; alleen haalbaar via
JLC-consignment. Overkill + soldeerprobleem voor v1. Zie de v2-notitie hieronder.

### SSI2130 als v2/morph-optie — datasheet-geverifieerd (Rev 2.4, dec 2020)

Meer dan "2131 + FM". De SSI2130 (32-lead 4×4 QFN) voegt toe: **on-chip
sine-shaper** (temp-stabiel), **open-collector square** (handig voor sync/tune),
**thru-zero FM/PM** (wél externe comparator + op-amp + discretes nodig — niet
gratis), en vooral een **on-chip 5-kanaals VCA-mixer**: triangle/saw/pulse + 2
aux-ingangen worden onder lineaire CV-controle (pins TRI/SAW/PULSE/AUX1/AUX2 MIX)
gesommeerd naar één stroomuitgang (MIX OUT).

**Het inzicht voor v2**: die interne VCA-mixer kan de **saw↔pulse-morph
ON-CHIP** doen — precies wat de spec (§VCO8, "Morph") nu met 2× externe SSI2164
+ 8 CV-kanalen als v2 inplant. Met de 2130 verdwijnen die externe VCA's; de
mix-CV's komen dan uit de DAC128S085-familie die er al is. Kosten: QFN-handwerk
(consignment) + $0,85/stem + meer routing (32 vs 16 pinnen). Zelfde voeding/ref
als de 2131 (V+ = +5, V− tot −18, VREF = 2,5 V). **Conclusie: v1 = SSI2131
(SOP-16). Overweeg SSI2130 pas voor een v2 "morph/west-coast"-variant, en dan
alleen als JLC-consignment de QFN plaatst.**

## Open sub-besluiten (na chipkeuze)

- **Golfvormkeuze per stem**: 1-uit-3 (saw/tri/pulse) via 4052, select uit
  RP2040-GPIO. Sine niet beschikbaar (2131) → als sine gewenst is: externe
  shaper of alsnog 2130. Vooralsnog 3 golfvormen.
- **Morph** (saw↔pulse, 2× extra SSI2164 + 8 CV): bewust v2.
- **VCO8-TFT-front**: inhoud/keuze nog open (VCF8 = 2× SSD1306 beslist).
- **CV-som-scale**: 100 k (10 µA/oct) vs 50 k (20 µA/oct) — kies passend bij de
  AD5754-pitchspanningsrange en de note→code-schaling.
- **Kanaalmap + `ModuleDefinition`**: zodra het eerste VCO-schema er is.

## Randvoorwaarden (waarom het schema nog wacht)

VCO8 hergebruikt en leunt op wat op VCF8 bewezen moet worden:
- **Auto-tune** (square-mux → comparator → PIO-periodemeting, B10) — de spec
  noemt dit "randvoorwaarde vóór dit bord". Een 8-stemmige analoge VCO zonder
  werkende auto-kalibratie is onbruikbaar; de vcf8kern (zelfoscillatie) is de
  proeftuin.
- **RP2040-SPI-slave** (de testavond die nog openstaat, vóór de backbone-order).
- **Kernslot-contract + kabel-slotmodel** (valideert op vcf8kern).

Pitch-CV (2× AD5754 + ADR421, 2,5 V) en PWM-CV (DAC128S085) zijn al besloten en
overgeërfd van de dac8-kern / VCA8. De ADR421 dient nu dubbel: pitch-DAC-ref
én de SSI2131-VREF.

## Referenties

- `doc/data-sheets/soundsemiconductor.com/ssi2131datasheet.pdf` (Rev 2.0, jan
  2021) — pinout, Figure 1-schakeling, expo-setup/trimming.
- `doc/poly-analog-spec.md` §VCO8, §Sourcing, §Bouwvolgorde.
- `hardware/Sourcing/Sound Semiconductor Pricing and Terms 7-2-26.pdf`.
- Verwant: `ssi2140-vcf8kern` (memory) — tuning-mux + trimmerloze cal-aanpak.
- `doc/data-sheets/soundsemiconductor.com/ssi2130datasheet.pdf` (Rev 2.4, dec
  2020) — v2/morph-optie: on-chip 5-kanaals VCA-mixer, sine, TZFM.
