# Bank-store: welke samplebank hoort bij een patch (voorstel, 2026-10-02)

**Status:** voorstel, nog niets gebouwd. Drie besluiten staan open (§7).
**Aanleiding:** Marks vragen van 2 oktober: kan het aantal banken boven de 16, en hoe weet een patch welke bank hij nodig heeft?

## 1. Hoe het nu zit

- Een SAMPLER, TAPE STRIP of ZANG heeft een `bank`-knop van 0 tot 15. Op de Teensy betekent die `/mmb/banks/NN.mmbs` (lyricbanken: `/mmb/lyrics/NN.mmbl`).
- In de patch staat **alleen dat nummer**. Welke bank er op plek NN staat, bepaalt de SD-kaart (Teensy) of de simulator: eerst de naam die de Teensy voor NN meldt, dan de keuze in de bankbalk (per browser), dan `public/banks/index.json`.
- Een bank heeft een naam in de kop (28 tekens), maar geen identiteit. Twee banken die "Grand Piano" heten zijn niet uit elkaar te houden, en een bijgewerkte bank ook niet van de oude.

Gevolg: een patch is alleen te reproduceren op de kaart waarop hij gemaakt is. Deel je hem, of verwissel je twee banken van plek, dan speelt hij stilletjes een andere bank.

## 2. De grens van 16

Die is een keuze, geen beperking. In de firmware: een `uint16_t`-bitmasker, `names_[16][29]`, bij het opstarten zestien vaste bestandsnamen openen, en de checks `bank > 15` in `TeensyLink.h`, `SamplerModule.h`, `TapeStripModule.h` en `ZangModule.h`. In de editor de knopbereiken en `teensyLink.ts`. Ophogen naar 100 (de huidige `NN`-namen blijven geldig) of 128 (een MIDI-programmawissel) kost ~3 KB RAM voor de namen; de kaart lees je dan beter één keer als map in plaats van 100 bestanden te proberen.

Maar met een nummer als enige sleutel maakt meer plekken het verwisselprobleem groter. Daarom eerst §3.

## 3. Twee lagen, zoals je zegt

| Laag | Wat het is | Waar het staat |
|---|---|---|
| **Plaatsing** | welke bank op welke plek staat | de SD-kaart, de simulator (per browser) |
| **Verwijzing** | welke bank (en welke versie) een patch nodig heeft | in de patch |

De patch noemt de bank bij identiteit; het nummer is alleen nog waar hij toevallig staat. Bij het laden zoekt de editor de bank op zijn identiteit en zet de knop op de plek waar hij staat. Staat hij er niet, dan zegt de editor dat, en biedt aan hem uit de store te halen en op een vrije plek te zetten.

Een patchwissel herhaalt dus geen banken; hij controleert alleen of ze er zijn.

## 4. Identiteit: een uuid en een revisie

- **`bankId`**: een uuid, gemaakt bij de eerste import. Blijft gelijk als je de bank bijwerkt: "deze piano".
- **`revision`**: een teller die de editor bij elke opgeslagen wijziging ophoogt: "deze versie van de piano".
- **`sha256`** van het bestand: alleen in de store en de index, als controle dat het bestand heel is. Niet in de kop zelf (een bestand kan zijn eigen hash niet bevatten) en niet op de Teensy (een bank van 50 MB hashen bij het opstarten duurt te lang).

Kop van `.mmbs` versie 3 (en `.mmbl` idem):

```
char     magic[4]   "MMBS"
uint32   version    3
uint32   numSlots
uint32   numZones
char     name[28]
uint8    bankId[16]      // nieuw: uuid
uint32   revision        // nieuw
uint32   reserved[3]     // nieuw: ruimte voor later (licentie-id, vlaggen)
...
```

De firmware leest versie 1 en 2 gewoon verder; een bank zonder uuid heeft identiteit "onbekend" en wordt alleen op naam gematcht, zoals nu.

## 5. In de patch

Naast `requires.moduleTypes` (patch-pool §3) komt `requires.banks`:

```json
"banks": [
  { "module": "mod_ab12", "control": "bank", "kind": "sample",
    "bankId": "2f1c…", "revision": 3, "name": "Grand Piano",
    "sha256": "9e0d…", "slot": 4 }
]
```

`slot` is een hint (waar hij stond toen de patch bewaard werd), geen sleutel. Een patch met drie samplers en een ZANG heeft vier regels.

Bij het laden, per regel:

1. Staat een bank met deze `bankId` en `revision` op de kaart of in de simulator → knop op die plek. Klaar.
2. Zelfde `bankId`, andere `revision` → laden met een melding ("Grand Piano r5 in plaats van r3").
3. Niet aanwezig → melding met een knop: uit de store halen en op een vrije plek zetten (en op de Teensy via `bankPut`, dat bestaat al).

## 6. De store

Een derde contenttype naast `patch` in Imprint (patch-pool §3), op dezelfde manier: item `bank` met `bankId`, revisies als versies van één item, het bestand als asset, `name`, `kind` (sample, lyric, later wavetable/DX7), `size`, `sha256`, **licentie** (de GeneralUser GS-banken hebben hun eigen voorwaarden; dat moet bij het delen meekomen) en `derivedFrom`. `public/banks/index.json` krijgt dezelfde velden en is dan gewoon de lokale spiegel van de store.

Een gedeelde patch heeft daarmee de juiste versie van alle drie: de **modules** (firmwarecontract), de **patch** zelf en de **banken**.

## 7. Open besluiten

1. **Aantal plekken:** 100 (de `NN`-namen blijven) of 128 (gelijk aan een MIDI-programmawissel)? Voorstel: 100.
2. **Bestandsnaam op de kaart:** `NN.mmbs` houden met de uuid in de kop (je kunt nog met de hand bestanden kopiëren; de kaart blijft leesbaar zonder lijstje), of `<uuid>.mmbs` met een apart overzichtsbestand dat de plek bepaalt? Voorstel: `NN.mmbs` houden.
3. **Bestaande banken:** de banken in `public/banks/` en op jouw kaart één keer omzetten naar versie 3 (een script geeft elk een uuid en revisie 1)? Voorstel: ja, met het script; de Teensy-banken via de editor ("bank bijwerken").

## 8. Stappen

1. Kop versie 3 schrijven en lezen (importer, `sample_bank.h`, `lyric_bank.h`), omzetscript voor bestaande banken.
2. Plekken naar 100: firmware leest de map, status meldt per plek naam, uuid en revisie.
3. `requires.banks` bij het bewaren en exporteren; de controle bij het laden (§5, stap 1–2).
4. Store in Imprint en de knop "uit de store halen" (§5, stap 3).
