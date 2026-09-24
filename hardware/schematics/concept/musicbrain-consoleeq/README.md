# musicbrain-consoleeq — analoge 1073-stijl kanaal-EQ met dCV (concept 0.1c)

**Status: concept.** Schema (ERC 0), geen PCB. Plan:
[`doc/plans/analoge-fx-verkenning.md`](../../../../doc/plans/analoge-fx-verkenning.md) §1.
Digitale tegenhanger: `tp_mmb_console_eq` (`mmb_dsp/console_eq.h`).
Generator: `hardware/kicad-generators/gen_consoleeq.py`.

## Idee

Het audiopad is analoog van J2-IN tot J2-UIT. De Brain stuurt alleen:
- **drie gains** als CV (DAC128S085 op CS, kanalen A/B/C = Low/Mid/High),
- **logica** (2× 74HC595 daisy op **CS2 = de IRQ-lijn**, poly-analog-spec B4):
  frequentiekeuze, boost/cut per band, HPF-bypass.

Geen MCU op de kaart ("dom", B1). Front-knoppen lopen via pot8front +
potriser in een eigen slot; de Brain sommeert knop en preset.

```
J2 IN → buffer → HPF (3e orde, 4 freq + bypass) → LOW-cel → MID-cel → HIGH-cel → buffer → J2 UIT
```

**Cel** = inverterende opamp (Rin = Rf = 10k) met een bandfilter dat via een
THAT2181-VCA stroom in het sommeerknooppunt stuurt. Een SPDT (ADG409-helft)
kiest de *bron* van het bandfilter:
- boost: bron = celingang → `out = −(in + a·F(in))`
- cut: bron = celuitgang → `out = −in / (1 + a·F)` — reciproque curves, zoals
  een console.

`a = (Rf/Rb)·g`, g = VCA-gain 0..1 via Ec− (0 V = vol, DAC 3V3 → 0,3 V ≈ uit);
Rb = 2k → tot ±16 dB.

| Band | Filter | Keuze | Waarden |
|---|---|---|---|
| HPF | Sallen-Key 2e orde (Q = 1, K = 2) + RC 1e orde = 18 dB/oct | 3 R's via ADG409 (dual) + ADG409 (half); bypass-SPDT | 50/80/160/300 Hz: 31k8 / 19k9 / 9k95 / 5k3 bij 100n |
| LOW | Sallen-Key LP 2e orde Q = 1 (de "inductorbult") als shelf-bron | 2 R's via ADG409 | 35/60/110/220 Hz: 45k3 / 26k7 / 14k3 / 7k15 bij 100n |
| MID | MFB-bandpass, R vast (R1 10k, R2 16k1, R3 20k → Q 0,9, gain 1) | 2 C's via 2× ADG408 (6 van 8) | 360/700/1600/3200/4800/7200 Hz: 39n / 20n / 9n1 / 4n7 / 3n0 / 2n0 |
| HIGH | 1e-orde HP 12 kHz vast (1n / 13k3) als shelf-bron | — | — |

**SPDT uit een dual 4:1** (ADG409): A-helft schakelt op A1 (S1A = S2A = bron 1,
S3A = S4A = bron 2), B-helft op A0 (S1B = S3B / S2B = S4B). Twee onafhankelijke
SPDT's per chip; U14 = LOW-bc + HIGH-bc, U15 = MID-bc + HPF-bypass.

**Bitmap** 74HC595 #1 (QA..QH): `HPF_A0 HPF_A1 HPF_BYP LOW_A0 LOW_A1 MID_A0
MID_A1 MID_A2`; #2: `LOW_BC MID_BC HI_BC` (1 = cut) + 5 reserve.

## Onderdelen (ruw)

2× TL074, 3× THAT2181, 5× ADG409, 2× ADG408, DAC128S085, 2× 74HC595 + passieven.
Schatting €35; met een uitgangstransformatortje (Color) €50.

## Open punten / te verifiëren vóór een PCB

- **Pinouts ADG408/ADG409/THAT2181** zijn uit het geheugen opgetekend —
  tegen de datasheets leggen (les vcf8kern).
- Logica-niveaus: ADG4xx op ±12 V met 3,3 V-logica (VINH 2,4 V): datasheet
  checken; anders 74HCT595 op 5 V.
- Fase: drie inverterende cellen = netto inversie; buffer of Rf-keuze om
  weer in fase te komen (of accepteren: per kanaal consistent).
- THAT2181 SYM-trim (nu 100k naar GND): voor lage vervorming een trimpot.
- Kleur: klasse-A trap of Edcor-lijntransformator aan de uitgang — niet
  getekend. Het digitale model heeft die "Color"; hier eerst meten wat de
  VCA's zelf doen.
- 2181 Ec− regelt 0..−49 dB: het regelbereik van de gain-knop loopt dus van
  "band uit" tot "+16 dB" — de Brain mapt de knop (zoals de VCA8-level).
- CS2 via IRQ vereist de B4-firmware (tweede select per slot).

## Bestanden

`musicbrain-consoleeq.kicad_sch` / `.kicad_pro`, `erc.rpt` (0), `musicbrain-consoleeq.pdf`,
`consoleeq-preview.png` (render van het schema).
