# PUMP — compressor met sidechain (plan)

> **Actueel (2026-10-29):** besluiten genomen (§8): een nieuwe module, naam PUMP, met gate en Listen, mono-sidechain. **Gebouwd in fw 0.5.115**: stappen 1–5 klaar (kern, firmware, wasm, tests, paneel, seed "🏠 French pump", contractketen). Open: stap 6 (Teensy-meting en luisteren), stap 7 (sidechain-bus in de plugin, VST-sessie). `sc` op de Bus comp: gebouwd in fw 0.5.116. Geen GR-meter op het paneel: er is nog geen meterwidget; GR staat als CV-uitgang, zoals bij de andere compressors.

*Voorstel 2026-10-29. Aanleiding: Mark wil een compressor met sidechain, in de geest van de Alesis 3630.*

## 1. Waarom

Geen van de huidige compressors (FET, Opto, Bus, Vari-mu, Diode, de eenvoudige COMP) heeft een sidechain-ingang: hun detector luistert altijd naar hun eigen ingang. Daardoor ontbreekt het bekendste effect uit de dansmuziek: de kick die pad, bas of de hele mix laat "pompen". Dat is de Daft Punk-sound van *Homework* en *Discovery*, die de band zelf aan de Alesis 3630 toeschrijft.

Met een AHDSR op een VCA kun je ducking nabootsen, maar dat volgt de kick niet. Een sidechain wel: hij reageert op wat er echt binnenkomt, inclusief swing, ghost notes en fills.

## 2. Het apparaat: Alesis 3630 (1989)

Een goedkope tweekanaals compressor/limiter met gate. Door zijn snelle, ruwe reactie werd hij geliefd in de French house. Gegevens uit de review in Sound On Sound en de specificaties van Alesis (indicatief):

| Onderdeel | Op het apparaat |
|---|---|
| Regelelement | VCA (dbx), feed-forward |
| Threshold | −40 … +20 dB |
| Ratio | 1:1 … ∞:1, traploos |
| Knie | Hard of soft (zacht oplopend; de echte drempel ligt dan wat lager) |
| Detector | **Peak**: attack 0,1–200 ms, release 50 ms–3 s. **RMS**: attack en release volgen het programma, de knoppen doen dan niets |
| Output | −20 … +20 dB |
| Gate | Per kanaal; drempel (helemaal links = uit), Rate (sluiten) 20 ms–2 s. Werkt ook als de compressor in bypass staat |
| Sidechain | Eén insert-jack (zenden/terug) per kanaal: een externe sleutel of een EQ in de detector. Geen eigen filter |
| Link | Stereo gekoppeld: links regelt beide, de detector hoort beide kanalen |
| Meters | In/uit en gain reduction (−1 … −30 dB) |

Karakter: snappy en een beetje vuil, vooral met een snelle release. Dat is de "pomp". In RMS-stand is hij juist rustig. Het pompen komt dus van Peak met een korte release.

## 3. De module

Werknaam **PUMP**, typeId `tp_mmb_pump`, categorie `effect`. Een eigen kern `mmb_dsp/pump_comp.h`, op de manier van de andere compressors (header-only, zonder heap). Dezelfde kern draait in de firmware, de wasm en de plugin.

Poorten:

| Dir | portId | Soort | Betekenis |
|---|---|---|---|
| in | `in_l`, `in_r` | Audio | Signaal; alleen L aangesloten = mono op beide uitgangen (zoals de andere compressors) |
| in | `sc` | Audio | **Sidechain-sleutel.** Aangesloten: de detector luistert hiernaar. Los: naar de eigen ingang |
| in | `thresh_cv` | Cv | Bij de drempel op (±1 = het hele bereik) |
| out | `out_l`, `out_r` | Audio | |
| out | `gr` | Cv | Gain reduction (1 = 20 dB), zoals de andere compressors |
| out | `gate` | Gate | Hoog zolang de gate open is |

Knoppen, met de standen van het apparaat:

- `threshold` −40 … +20 dB (omgerekend naar de audioschaal van MusicBrain; 0 dB = 0 dBFS − 18).
- `ratio` 1 … 20, met ∞ als laatste stand.
- `attack` 0,1–200 ms en `release` 50 ms–3 s, logaritmisch.
- `mode` Peak / RMS. In RMS volgt de detector een gemiddelde over ~30 ms, met een release die meegroeit als het signaal langer luid blijft (zoals de auto-release van de Bus comp).
- `knee` Hard / Soft (een zachte knie van ±6 dB).
- `output` −20 … +20 dB.
- `gate` (drempel, helemaal links = uit) en `gate_rate` 20 ms–2 s.
- `sc_hp` uit / 60 / 100 / 150 Hz. Het apparaat heeft dit niet, maar de review mist het juist. Zonder dit filter pompt de bas van een volle mix mee.
- `listen` uit / aan: hoor de sleutel (na het filter) in plaats van het signaal. Handig bij het afstellen.
- `mix` 0–1 (parallel) en `bypass`, zoals bij de andere compressors. Daarmee valt PUMP in `bypassRoute` onder "eigen knop".

## 4. Hoe je het speelt

- **French house:** kick op `sc`, pad of akkoorden op `in_l`/`in_r`. Ratio 4–10, attack 0,1–1 ms, release 100–250 ms (op het tempo afstemmen: rond een achtste). Dan valt de pad bij elke kick weg en zwelt hij erna weer aan.
- **Ducking:** zang of rap op `sc`, de beat op `in`. De beat zakt zodra er gesproken wordt. Bruikbaar voor de Freestyle-machine (MIC op `sc`).
- **De-esser:** de eigen ingang via een hoogdoorlaatfilter naar `sc`. Daar is een splitsing nodig, en `sc_hp` op 150 Hz is te laag voor sisklanken. Daarom geen doel voor nu.
- **Gate:** een ruisende bron dicht tussen de noten. De gate werkt ook in bypass, zoals op het apparaat.

Een kick-trigger (gate) mag ook op `sc`. Dan pompt hij op het ritme, zonder dat er een echte kick klinkt. Een gate van 0 → 1 V gedraagt zich als een blokgolf. Dat werkt, maar is harder dan een kick, die uitsterft.

## 5. Kern en kosten

- Detector: piek (|x|, met de hoogste van L, R en sc als `link` aan staat) of RMS (eenpolig, ~30 ms). Gain reduction in dB, dan attack/release als eenpolige volgers in het dB-domein. Dat geeft de VCA-curve: release lineair in dB.
- Knie en ratio als bij de Bus comp. Ratio ∞ = begrenzer.
- VCA: geen vervorming in de kern (dbx-VCA's zijn schoon). Het "vuile" komt van de snelle release, die de golfvorm zelf moduleert (bij 50 ms en een bas op 50 Hz: hoorbare vervorming). Dat gaat vanzelf goed.
- Gate na de compressor. Sluiten met `gate_rate`, openen in ~0,5 ms.
- Geen buffers met een vaste lengte: met `MMB_RATE_FLEX` op 96 kHz in de plugin.
- Kosten: een paar `log10`/`exp` per sample, zoals de Bus comp (op de Teensy ~1 %). Na de bouw meten met `getStatus`.

## 6. Plugin (VST3/AU)

Een losse PUMP-plugin heeft een **sidechain-bus** nodig (een tweede stereo-ingang die de DAW kan routeren). JUCE kan dat, en Logic en Ableton ondersteunen het. Volgens `plugin.md` stond de sidechain-bus nog open. PUMP zou de eerste plugin met een sidechain zijn. Dat is werk voor de VST-sessie: de `sc`-poort koppelen aan de aux-bus van de plugin.

## 7. Stappen

1. **Kern** `mmb_dsp/pump_comp.h` en **firmware** `PumpModule.h` (`tp_mmb_pump`), registratie.
2. **Wasm** `pump_wasm.cc` (kernel_host, `MMB_RATE_FLEX`), regel in build.sh.
3. **Tests** (vitest, wasm):
   - statische curve: ratio en threshold (−20 dB in, threshold −30, ratio 4: −27,5 dB uit), hard en soft;
   - attack- en releasetijden (tijd tot 63 %);
   - sidechain: een constante sinus op `in`, kick-pulsen op `sc`. De uitgang dipt bij elke puls; zonder `sc` gebeurt er niets;
   - gate dicht onder de drempel, ook in bypass;
   - `listen`, `mix` en `bypass`;
   - mono in → beide uitgangen.
4. **Paneel en seed**: paneel ~12 HP in de stijl van de andere compressors, met een GR-meter. Seed "🏠 French pump": CLOCK → kick (CR-78) op `sc` en naar de mix, akkoorden (Synthex of een pad) door PUMP.
5. **Contractketen**: `contract_dump.py` → `npm test` → `npm run catalog` → release-log, fw-tag.
6. **Teensy**: flashen (Mark), `getStatus`, luisteren.
7. **Plugin**: sidechain-bus (VST-sessie).

## 8. Open vragen voor Mark

1. **Nieuwe module of sidechain op de bestaande?** Voorstel: een nieuwe module, met het karakter van de 3630, en daarnaast `sc` als extra ingang op de **Bus comp** (de SSL-busstand is de andere klassieke pomp). FET, Opto, Vari-mu en Diode krijgen er geen: op die apparaten is sidechain zeldzaam.
2. **Naam:** PUMP, of iets anders (3630 als knipoog mag niet in de naam: merk)?
3. **Gate erbij?** Het apparaat heeft er een. Voorstel: ja, hij is klein.
4. **`listen`-knop:** handig, maar een extra schakelaar. Voorstel: ja.
5. **Stereo-sidechain:** één `sc`-ingang (mono) of `sc_l`/`sc_r`? Voorstel: mono, de detector telt toch al samen.

**Antwoorden van Mark (2026-10-29):** 1 nieuwe module, en `sc` ook op de Bus comp; 2 PUMP; 3 gate erbij; 4 Listen erbij; 5 mono.

## Bronnen

- [The Dynamic Duo — Sound On Sound-review van de Alesis 3630 (muzines)](https://www.muzines.co.uk/articles/the-dynamic-duo/7478)
- [Alesis 3630 — productpagina](https://www.alesis.com/products/view/3630-compressor)
- [Alesis 3632 review — MusicRadar](https://www.musicradar.com/reviews/tech/alesis-3632-compressor-535091) (Daft Punk en de 3630)
- [Gearnews over de 3630 in de studio](https://www.gearnews.com/alesis-3630-studio/)
