# SID meten: onze emulatie naast echte chips (plan, 2026-10-19)

Mark: "Nu heeft de module geëmuleerde. Ook wel leuk om te horen hoe die het
doen." De SID-kern (`mmb_dsp/sid.h`, [sid.md](sid.md) §2) is clean-room
geschreven; alle modelparameters (filtercurves, combined waveforms,
DC-niveaus, 6581-vervorming) zijn **op het oor** gekozen. Dit plan meet ze
aan echte chips en zet de uitkomst terug in de kern.

> **Besluit (Mark, 2026-10-19):** een USBSID-Pico met een echte 6581 en een
> echte 8580 als meetopstelling. De MIDISID (OLX) niet: daar zit eigen
> firmware tussen (MIDI in plaats van registers), en nieuw heeft hij klonen.

Ter review; niets gebouwd, het bord is nog niet besteld.

## 1. De opstelling

```
pc ──USB──► USBSID-Pico (Pico 2) ──► echte 6581 / 8580 ──audio──► audio-interface ──► pc
 │                                                                                    │
 └──── dezelfde registerreeks ──► mmb_dsp::SidChip (native) ──► wav ──────────► vergelijken
```

- **USBSID-Pico v1.5c** (LouD, open source; voorbestelling bij SmallRun tot
  31-10-2026), met een **Pico 2** (de maker raadt die aan voor timing). De
  v1.5 kiest zelf 9 V/12 V (een 8580 op 12 V is stuk) en heeft schakelaars
  voor de filtercondensatoren.
- **Twee chips**: een geteste MOS **6581** (R3 of R4AR) en een **8580 R5**,
  met foto van de opdruk. Elk 6581-exemplaar klinkt anders (filter); het
  profiel geldt voor die ene chip.
- **Audio-uitgang** van het bord naar de line-in van een audio-interface,
  op 48 kHz. Eén keer de ingang ijken met een bekende sinus (niveau,
  frequentiegang), zodat we de interface niet als chip meten.
- **Registers vanaf de pc**: het bord spreekt een eigen CDC-protocol over
  USB (drivers in C++, JavaScript, Rust: `LouDnl/USBSID-Pico-driver`).
  Nakijken bij aankomst: getimede schrijfacties (cycli tussen writes) en of
  OSC3/ENV3 (`$1B`/`$1C`) terug te lezen zijn. Kan dat, dan meten we de
  combined waveforms **digitaal**, zonder filter en DAC ertussen.

Licentie: de driver is GPL; we gebruiken hem als meetgereedschap, niet in
de kern. Wat we meten zijn onze eigen gegevens, dus de tabellen in de kern
blijven MIT (zoals in sid.md: niets uit reSID).

## 2. De software (`tools/sid-meten/`)

1. **Een reeks** (`*.json`): `{ "rate": 985248, "writes": [[cyclus, reg, waarde], …] }`,
   gegenereerd door een klein script per proef (§3). Elke reeks begint met
   een **synchronisatietik** (volume `$D418` van 0 naar 15: de DAC-klik van
   de 6581, op de 8580 een korte puls via een stem), zodat chip-opname en
   emulatie op het sample uit te lijnen zijn.
2. **Naar de chip**: `play_usbsid` stuurt de reeks met de juiste timing en
   neemt tegelijk de line-in op (Python: `sounddevice` + het CDC-protocol,
   of de C++-driver als dat stabieler timet).
3. **Door de kern**: `render_sid` (native, CMake, zoals de core-tests in de
   scratchpad) speelt dezelfde reeks door `mmb_dsp::SidChip::write` +
   `Process` en schrijft een wav. Zelfde model (6581/8580), zelfde
   klokfrequentie (PAL).
4. **Vergelijken**: `compare.py` lijnt uit op de tik, en meet per proef wat
   §3 vraagt; uitvoer een tabel plus grafieken (overdracht, spectra, envelop)
   in `sounds/sid-metingen/<chip>/` (wav's in git-lfs of buiten git:
   besluit bij aankomst).

## 3. De proeven

| # | Wat | Hoe | Zet in de kern |
|---|---|---|---|
| 1 | Golfvormen per stem | tri/saw/pulse (PW 25/50/75 %)/noise op 4 toonhoogtes, filter uit | spectrum en niveau per golfvorm; DC per stem (`kVoiceDc6581`) |
| 2 | Combined waveforms | alle combinaties van de vier golfvormbits, op 3 toonhoogtes; liefst via OSC3-terugleesactie | het bitlijnmodel (`combinedModel`) of een gemeten tabel per chip |
| 3 | Filter-cutoff | witte ruis van stem 3 door het filter, cutoffregister 0…2047 in 33 stappen, LP/BP/HP | `cutoffHz8580` (lineair?) en de S-curve van de 6581 (`kFcLo6581`, `kFcHi6581`, steilheid, `curve`) |
| 4 | Resonantie | als 3, bij res 0/4/8/12/15 | Q per resonantiestand (`kResOctaves6581`, 8580 tot Q ≈ 4?) |
| 5 | 6581-vervorming | zaagtand door het filter op 4 volumes | ingangsbegrenzing en bandpass-verzadiging (`kDrive6581`, `kStateSat6581`) |
| 6 | Envelopes | ADSR-tijden bij 0/4/8/15, en de ADSR-bug (gate snel aan/uit) | controle van de periodetabel en de rate-teller (nu "cycle-exact uit de documentatie") |
| 7 | Volume-DAC | volume 0…15 zonder stemmen | de DC-klik en het "digi"-niveau (`kMixDc6581`) |
| 8 | Ruis | noise-golfvorm: LFSR-volgorde en uitsterven na combinatie | controle `noise`-klok en terugschrijving |

Elke proef duurt seconden; de hele reeks per chip een paar minuten.

## 4. Hoe het in de kern komt

- Per chip een **profiel** (`mmb_dsp/sid_profiles.h` of JSON): filtercurve,
  resonantie, DC-niveaus, eventueel een combined-tabel. De module krijgt een
  keuze "Chip": 6581 (algemeen) / 8580 (algemeen) / **"Marks 6581"** /
  **"Marks 8580"**.
- Een **regressietest** (`wasmSid.test.ts`): dezelfde reeksen door de wasm,
  en de belangrijkste getallen (cutoff bij 5 registerstanden, Q, DC) binnen
  een marge van de meting. Zo blijft de kern bij de chip als iemand hem
  later aanpast.
- Teensy: cpu meten na de wijziging (sid-spoor: ~6–8 % per spelende chip).
- Het plugin-spoor krijgt het gratis: SID en SID3 zijn ook plugins.

## 5. Stappen

1. **Bestellen** (Mark): USBSID-Pico v1.5c + Pico 2 vóór 31-10; een geteste
   6581 en 8580 met foto van de opdruk.
2. Bij aankomst: bord en chips testen met een SID-speler (VICE/sidplayfp of
   de WebUSB-speler); protocol en terugleesactie nakijken; de line-in ijken.
3. `render_sid` en `play_usbsid` + de synchronisatietik; proef 1 als eerste
   vergelijking.
4. Proeven 2–8, per chip.
5. Profielen en de "Chip"-keuze in de kern; regressietest; release.
6. Luisteren: oude kern, nieuwe kern en de echte chip naast elkaar.

## 6. Open vragen

1. Welke **audio-interface** gaat het worden voor de opname (line-in, 48 kHz)?
2. Wav's van de metingen in git (git-lfs) of erbuiten?
3. Komt de buskaart uit sid.md §3 (spoor B) nog, of is de USBSID-Pico voor
   het meten genoeg en blijft de Brain bij de emulatie?

## 7. Bronnen

- [USBSID-Pico](https://github.com/LouDnl/USBSID-Pico) en
  [USBSID-Pico-driver](https://github.com/LouDnl/USBSID-Pico-driver) (LouD; software GPL-2.0, PCB v1.5 CC BY-NC-ND 4.0).
- [OSHWA-certificering](https://certification.oshwa.org/nl000045).
- [MOS Technology 6581](https://en.wikipedia.org/wiki/MOS_Technology_6581).
