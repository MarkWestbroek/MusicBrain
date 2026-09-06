# Samplebanken (`.mmbs`)

Wat hier staat laadt de simulator rechtstreeks (**🎹 Multisample → ⤒ .mmbs**),
en gaat op de Teensy naar `/mmb/banks/NN.mmbs` op de SD-kaart — de `bank`-
control van de sampler kiest `NN`. Formaat: `firmware/lib/mmb-dsp/mmb_dsp/sample_bank.h`.

## In git

| Bank | Bron |
|---|---|
| `elements.mmbs` | eigen opname van de Elements-module; de **Testbank**-knop in de import haalt deze op |
| `church-organ.mmbs` | eigen synthetische testbank (4 samples) |
| `handdrum *.mmbs`, `small bells *.mmbs` | eigen opnames (Tomek's handpan, klankschalen), geïmporteerd uit `../sample-originals/` |
| `gu-*.mmbs` | 21 presets uit **GeneralUser GS 2.0.3** van S. Christian Collins |

GeneralUser GS is vrij te gebruiken en de licentie staat afgeleide banken toe
met naamsvermelding — vandaar dat deze wél in de repo mogen. Opnieuw maken:

```sh
curl -O https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2
node tools/mmb-wasm/sf2-to-mmbs.mjs GeneralUser-GS.sf2                     # de 287 presets
node tools/mmb-wasm/sf2-to-mmbs.mjs GeneralUser-GS.sf2 11 gu-vibraphone.mmbs --vel-track=24
```

De `--vel-track` per bank loopt van 10 dB (orgel, pads: daar valt de zachte
aanslag anders weg) tot 24 dB (aangeslagen instrumenten). Alle 21 blijven
binnen de firmware-limiet van 64 sloten en 256 zones, samen 8,6 MB.

## Niet in git

Grote of niet-herverdeelbare banken blijven lokaal; `.gitignore` laat alleen de
bovenstaande door. Zo staat de YDP-vleugel (FreePats, CC0) er niet in: 118 MB
is meer dan GitHub per bestand toestaat. Terughalen:

```sh
# YDP Grand Piano, bv. via FreePats; daarna:
node tools/mmb-wasm/sf2-to-mmbs.mjs ydp-grand.sf2 0 ydp-grand-2laags.mmbs --vel-layers=2
```
