# Vintage EQ's voor MusicBrain

> Aanvulling op [vintage-compressors.md](vintage-compressors.md) (FW-FX-3).
> Opgesteld 2026-09-24. Status: stap 1 (Console EQ, fw 0.5.64,
> `tp_mmb_console_eq`) klaar; stap 2 en 3 zijn plan.

## Aanleiding

Naast de Program EQ (Pultec-stijl) heeft MusicBrain geen toon-EQ; de filters
(VCF, MS-20, ladder, sampler) zijn synth-filters. Aanleiding was de Undertone
Audio UTEQ500: geen verzameling emulaties, maar één flexibel circuit (drie
banden die traploos van bell naar shelf gaan, Q 0,3–10, boost/cut/notch) dat
de *curves* van klassieke EQ's kan benaderen. De kleur van die apparaten zit
in hun circuit (inductors, transformators, versterkertrappen), niet in de
curve.

Namen: op het paneel een eigen naam (CONSOLE EQ, PARA EQ), in de notes en hier
"knipoogt naar …" als beschrijvende verwijzing, zoals bij de compressors.

## Families en wat het karakter maakt

| Familie | Karakter | Hoe na te bootsen |
|---|---|---|
| **Britse console-EQ** (Neve 1073-stijl) | 3 banden op vaste keuzefrequenties: low shelf 35/60/110/220 Hz, inductor-mid 360 Hz–7,2 kHz, high shelf 12 kHz; hoogdoorlaat 50–300 Hz (18 dB/oct); brede shelves met een lichte **bult** bij de knik (de inductor); klasse-A trap en transformators geven een warme kleur | Shelves met slope > 1 (RBJ-S: bult), bell met matige, licht proportionele Q, 3e-orde HP, Color = asymmetrische verzadiging |
| **Amerikaanse console-EQ** (API 550-stijl) | **Proportionele Q**: hoe meer boost, hoe smaller de bell; stappen van 2 dB, reciproque curves (boost en cut spiegelen); heel snel en "punchy" | Bell met Q die meeloopt met |gain|; stappen op de knop |
| **Britse mixer-EQ** (SSL E/G-stijl) | 4 banden: buitenste bell/shelf schakelbaar, twee parametrische middenbanden, HP/LP; strak en schoon | Schone parametrische EQ, geen kleur |
| **Super-parametrisch** (UTEQ-stijl) | Bell↔shelf traploos, Q 0,3–10, notch | Twee biquads per band (bell en shelf), gekruist |
| **Air-band** (Maag-stijl) | Shelf die ver boven het hoorbare begint (10–40 kHz): lucht zonder scherpte | High shelf met hoge knik en zachte slope |
| **Tilt** | Eén knop kantelt het spectrum rond een middenpunt | Low shelf en high shelf tegengesteld |
| **Baxandall** | Zeer brede, zachte bass/treble | Twee shelves met lage slope |

## Opzet

- Gedeelde biquad-bouwstenen in `mmb_dsp/biquad.h` (RBJ: low/high shelf met
  slope, peak, HP/LP), zodat elke EQ dezelfde filters gebruikt.
- Per familie een kern in `mmb_dsp` en een module met het paneel van dat
  apparaat, zelfde patroon als de compressors (firmware + wasm uit één kern,
  Bypass, Output, Color waar kleur bij hoort).
- Versterkingen glijden in ~5 ms (zoals de Program EQ), zodat draaien niet
  ritst.

### Volgorde

| # | Module | Waarom |
|---|---|---|
| 1 | **CONSOLE EQ** (Britse stijl) ✅ `tp_mmb_console_eq` | Het meest verschillend van de Pultec: vaste banden, inductorbult, HP-filter, kleur |
| 2 | **PARA EQ** (SSL/API-stijl), `tp_mmb_para_eq` | 4 banden parametrisch, proportionele Q schakelbaar, bell/shelf op de buitenste; het werkpaard |
| 3 | **AIR / TILT** (4 HP) | Klein, meteen nuttig op een mix |

## Console EQ (stap 1): ontwerp

- **HPF**: uit / 50 / 80 / 160 / 300 Hz, 18 dB/oct (2e orde Butterworth + 1e
  orde).
- **Low**: 35 / 60 / 110 / 220 Hz, ±16 dB, shelf met slope 1,4 (bult).
- **Mid**: 360 / 700 / 1600 / 3200 / 4800 / 7200 Hz, ±18 dB, bell Q 0,9 die
  licht proportioneel meeloopt (Q ≈ 0,7 + 0,25·|gain|/18).
- **High**: 12 kHz vast, ±16 dB, shelf met slope 1,2.
- **Color**: klasse-A/transformator-verzadiging (asymmetrisch, dubbel
  bemonsterd op het residu, zoals de FET), werkpunt −12 dBFS. **Output**,
  **Bypass**.
- Tests: vlak met alles op 0, HP-helling (−18 dB/oct), shelf-niveau en bult,
  bell-niveau en breedte, Color, Bypass, ±1.
