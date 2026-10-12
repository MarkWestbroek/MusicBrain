# Muziek: Omnium-animatie "dienstverlening"

Achtergrondmuziek bij de animatie op de voorpagina van
[omnium.imprint-engine.nl](https://omnium.imprint-engine.nl): één stip met
dezelfde gegevens reist door een Wmo-aanvraag voor een traplift. De muziek is
gemaakt op 2026-10-13 en sinds die dag live, met een 🔈-knop die standaard uit staat.

- **Script:** [tools/mmb-wasm/render-omnium-dienstverlening.mjs](../tools/mmb-wasm/render-omnium-dienstverlening.mjs). Het script is de bron: elke waarde hieronder komt daaruit. Het rendert deterministisch, dus dezelfde code geeft bit voor bit dezelfde audio.
- **Host:** [tools/mmb-wasm/offline-host.mjs](../tools/mmb-wasm/offline-host.mjs).
- **Site-kopie:** bij Imprint in `sites/omnium/public/werkelijkheid/` (mp3 + ogg).
- **Vermelding:** voorlopig "Muziek: MusicBrain."; de licentie is nog niet gekozen.

## Hoe het gemaakt is

Alles is gemaakt met MusicBrain's eigen modules: dezelfde wasm als de editor
(`editor/public/wasm`), gespeeld vanuit een script in plaats van een patch in
de editor. Het script zet per blok de ingangen (voct, gate, level_cv, …), zoals
een sequencer en kabels dat in een patch zouden doen. Er is dus geen
`patch.json`; de "patch" is de tabel hieronder.

- **Klank:** Plaits voor de pad (VA+VCF) en een bijna-sinusbas (FM). Rings modaal voor de pulserende sequencer en de bellen, Rings FM-voice voor de inharmonische plinks, Clouds voor het rommelige stuk, en de eigen plaatreverb.
- **Verloop:** van D-mineur gaat het naar D-groot. Het ontspoort op 30–36 s, wordt helder op 36 en is het volst op 67–75. Er zit geen melodie in die gaat irriteren als hij loopt.
- **Momenten:** de belletjes en tikjes vallen op de momenten die Imprint opgaf (14, 20, 24,5–26, 40/42/43,6/45,2, 48, 51, 55, 61, 77–79, 82–85, 88).
- **Lus:** de muziek klinkt vanaf 90,5 s uit tot stilte op 96,6 s. Hij loopt dus netjes rond, maar is niet naadloos.

## Modules en instellingen

| Laag | Module | Instellingen | Hoe gespeeld |
|---|---|---|---|
| Pad | 10 × `tp_mmb_plaits` (2 banken × 5 stemmen) | engine 0 (VA+VCF), harmonics 0,12, timbre 0,28–0,46 (per deel, zie onder), morph 0,35, decay 0,7, lpg 0,6, fine ±2–8 cent per stem | `level_cv` als VCA (de LPG volgt dan level): attack 1,4 s, release 2,2 s, sinusvormig. De banken wisselen per akkoord, zodat een stem alleen van toon verandert als hij stil is. |
| Bas | 2 × `tp_mmb_plaits` | engine 10 (FM), harmonics 0,25, timbre 0,12, morph 0, decay 0,7, lpg 0,4 | `level_cv`, attack 60 ms, release 350 ms. Van 36 tot 75 s elke seconde opnieuw aangeslagen (gestaag voortgaand). |
| Sequencer | `tp_mmb_rings` | model 0 (modaal), polyphony 4, structure 0,24, brightness 0,38–0,52, damping 0,4–0,6, position 0,3 | Gates van 5 ms op een raster van 0,25 s. Patroon over de akkoordtonen: 0 2 1 3 2 4 3 1, op 67–70 s stijgend. Brightness_cv ±0,04 per noot. |
| Plinks (30–36 s) | `tp_mmb_rings` | model 3 (FM-voice), polyphony 4, structure 0,65, brightness 0,5, damping 0,4, position 0,5 | Willekeurig (vaste seed), ~30 % per puls, ontstemd ±25 cent. |
| Bellen | `tp_mmb_rings` | model 0, polyphony 4, structure 0,68, brightness 0,58, damping 0,62, position 0,18 | Gestrumd, 70 ms tussen de noten, op de momenten uit de animatie. |
| Ontsporen | `tp_mmb_clouds` | position 0,65, size 0,32, density 0,72, texture 0,45, mix 1, spread 0,8, feedback 0,45, reverb 0,25, mode 0 | Krijgt pad, sequencer en plinks binnen. Pitch_cv springt willekeurig (−12 … +12 st) om de 0,3–0,9 s; wet in op 30–35,9 s. |
| Ruimte | `tp_mmb_reverb` | mode 0 (plaat), size 0,78, damp 0,5, predelay 25 ms, mod 0,35, mix 1 | Als send; terug in de mix op 0,55. |

**Mix:** het gemiddelde rms-niveau per laag over de hele render is pad −22,
sequencer −26, bas −27, bellen −33 en plinks −33 dB (vóór de loudness-stap).
Sends naar de reverb: pad 0,45, sequencer 0,5, bellen 0,75, plinks 0,6, bas 0,1.

**Master:** fade-in 50 ms, fade-out 90,5 → 96,6 s. Daarna ffmpeg `loudnorm`
in twee passes op −18 LUFS, true peak −2 dBTP. De mp3 is 160 kbps op
44,1 kHz, de ogg Vorbis q5 op 48 kHz. Gemeten: mp3 −18,4 LUFS / −2,3 dBFS,
ogg −18,0 LUFS / −2,4 dBFS.

## Tijdlijn

| Tijd (s) | Animatie | Muziek | Akkoorden (bas) |
|---|---|---|---|
| 0–17 | werkelijkheid, informeer (6), beslis (12), "Ja, dat doe ik" (14) | Pad zacht en donker, losse sequencertonen als gedachten, bel op 14 | Dm(add9) · B♭maj7(#11) · Gm9 · Asus4 |
| 17–30 | vul in (chips 17,2–19), de stip (20), dien in (24, chips knipperen 24,5–26) | Vier plinks voor de chips, bel op 20, sequencer vol vanaf 20; bel op 24 en hoge tikjes op 24,5–26 | Dm9 · B♭add9 · F/A · Csus2 |
| 30–36 | "zo gaat het nu": losse schema's, mapping | Scheve, ontstemde pulsen, FM-plinks, Clouds-korrels, geen bas; clusterakkoorden; adem op 35,6–36 | (D A♭ C♯ E♭) · (C♯ G B♭ E) |
| 36 | één canoniek model | D-groot, bel van vier noten | D |
| 40–67 | behandel (tikjes 42 / 43,6 / 45,2), beschik (48), nieuwe zaak (51), volg (55), lever (61) | Gestage sequencer en bas op de tel, een bel per station | G(add9) · D/F♯ · Bm7 · Gmaj7 · D · A/C♯ · Em7 · Asus4 |
| 67–75 | de traplift staat er | Stijgende lijn op 67–70, pad en sequencer het volst, bellen op 67 en 72,5 | Gmaj9 · A(add9) · D |
| 75–94 | deel (CAK 77–79), archiveer (82–85), slot (88) | Sequencer dunt uit (om de 2, dan om de 4 pulsen, stop op 88); drie dalende tonen op 77/78/79 en op 82/83,5/85; slotbel op 88 | D(add9) · Gmaj7/B · D |
| 94–97 | stilte | Uitklinken naar stilte | — |

De exacte noten (MIDI) staan in `chords`, `thoughts` en `bells` bovenin het script.

## Opnieuw renderen

```sh
node tools/mmb-wasm/render-omnium-dienstverlening.mjs [map]   # default %TEMP%/mmb-omnium; ffmpeg op PATH
```

Het script schrijft `omnium-dienstverlening-raw.wav` en daarnaast `.wav`, `.mp3`
en `.ogg` op −18 LUFS. Het meldt het rms-niveau per deel en per laag. Een
nieuwe versie moet daarna opnieuw naar Imprint
(`sites/omnium/public/werkelijkheid/`). Duur blijft 97 s: de site koppelt de
muziek seconde voor seconde aan de tijdlijn.
