# musicbrain-vca8 — 8× VCA slotkaart (rev 0.1)

Eerste bord van het **poly-analog-spoor** (`doc/poly-analog-spec.md`): 8
exponentiële VCA's met per-stem dCV-level vanuit de Brain = **digitale
envelopes op analoge stemmen**. Gen-2-slotkaart 80×45, busvoeding
(< 50 mA per rail), geen MCU.

**Status: bestelbaar** — ERC 0, netcheck OK, **DRC 0/0**, fab-pakket in
`fab/`. Geroute via de freerouting-pijplijn met **`--route-gnd`**: de dichte
centrale chipband kerft beide GND-vlakken zó weg dat losse GND-pads (chip-
grounds, ontkoppel-C's) de zone-vulling niet bereikten — GND als routeerbaar
net oplossen gaf een volledig verbonden bord in één run (best-of-4). Rot van
DAC128S085/TL074 + SMD-LCSC nog checken vóór PCBA.

## Architectuur

```
bus ──► 1× DAC128S085 (octaal 12-bit, VA=VREF=3V3) ──► RC-slew ──► VC-poorten
J2 IN ──► 20k ──► SSI2164 (2×) ──► TL074 I/V ──► 220R ──► J3 UIT
```

- **DAC128S085CIMTX** (TSSOP-16, LCSC C882851, JLC-bestukbaar):
  octaal 12-bit, één chip voor alle 8 kanalen. VA = VREF1 = VREF2 = **+3V3**
  → output **0…3,3 V** rail-to-rail = precies het VC-regelbereik, geen
  opamp-boost of precisieref nodig. DIN ← MOSI, **DOUT → MISO** (daisy voor
  een latere VCA16), SYNC ← CS, SCLK ← SCLK.
  ⚠️ **Geen hardware-LDAC**: gelijktijdige update loopt via software (WRM
  + update-opdracht). Voor VCA-level niet sample-kritisch (in tegenstelling
  tot pitch); de LDAC-buslijn blijft op deze kaart ongebruikt.
  ⚠️ **POR = 0 V = unity = kort vol volume bij power-up** — de firmware
  schrijft als eerste actie alle kanalen naar −100 dB.
  *(Keuze 2026-07-20: octaal 12-bit i.p.v. 2× DAC80004 à €14 — 16-bit is
  overkill voor VCA-level en driemaal zo duur.)*
- **SSI2164** (SOP-16, Sound Semiconductor, zelf solderen): −33 mV/dB;
  0 V = unity, 3,3 V ≈ −100 dB. MODE open = Class AB. Firmware mapt
  level lineair → dB (hogere code = stiller!).
- **RC-slew** 100R/4µ7 per VC (τ ≈ 0,5 ms): anti-zipper bij 1 kHz-updates.
- Audio per kanaal: 20k in (RIN), 220R+1n2 stabiliteitsnet op de IIN-pin,
  I/V-opamp 20k ∥ 100p, 220R serie-uit. **Fase inverteert** (datasheet
  fig. 1) — per kanaal consistent.

## Contract

- **J1**: gen-2-slot 2×12 (`doc/spi-bus-spec.md`); gebruikt GND/±12V/+3V3,
  SCLK, MOSI, MISO, CS. **LDAC ongebruikt** (de DAC128S085 heeft geen
  hardware-LDAC). IRQ ongebruikt (poly-spec B4: vrij voor CS2 — deze kaart
  heeft hem niet nodig).
- **J2 = AUDIO IN, J3 = AUDIO UIT** (1×10, haaks, bovenrand, harten op
  ±13,6 mm van het kaarthart): **1 = GND, 2–9 = CH1–8, 10 = GND**
  (jack8-contract). Past op jack8-strips of het geplande jack8sw-front;
  kaart-op-kaart doorlussen = één 1×10-kabel.

## Kanaalmap (firmware)

| CH | DAC (U5) | SSI2164 | TL074 |
|---|---|---|---|
| 1–4 | VOUTA/B/C/D | U1 kanaal 1–4 | U3 amp 1–4 |
| 5–8 | VOUTE/F/G/H | U2 kanaal 1–4 | U4 amp 1–4 |

dCV-semantiek: `code = dB_attenuatie / 100 dB × 0xFFFF` (0x0000 = unity,
0xFFFF ≈ −100 dB); de Brain rekent level → dB.

## Bestukken

JLC PCBA voor alles behalve de 2× SSI2164 (SOP-16, tube via Sound Semi /
Mouser — zelf nasolderen) en de THT-headers. Rot-check vóór PCBA:
DAC128S085 (TSSOP-16), TL074 (SOIC-14). BOM-hart ≈ €16 (DAC €6, 2× SSI €5).

## Genereren

```
python hardware/kicad-generators/gen_vca8.py   # sch + pcb (bakt musicbrain-vca8.ses native in)
# fab: bash hardware/kicad-generators/make_fab.sh "vca8"
```

De routing zit in `musicbrain-vca8.ses` (freerouting, `--route-gnd`); de
generator neemt die native over. Opnieuw routen: `.dsn` exporteren (MCP
`export_dsn`), `prep_dsn.py --route-gnd`, freerouting, nieuwe `.ses`.
