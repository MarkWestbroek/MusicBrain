# HALL: een grote galm in Lexicon-stijl (voorstel 2026-10-14)

Mark: "Is de technologie achter de Lexicon- en Bricasti-reverbs eigenlijk
bekend?" — Lexicon's bouwstenen wel (Griesinger: verspreiding, een
rondgaande tank, gemoduleerde vertragingen, gedecorreleerde aftakkingen),
de precieze algoritmes niet; Bricasti helemaal niet. Dit plan bouwt een
eigen grote galm met die bekende technieken, zonder iets te kopiëren.

> **Besluiten (Mark, 2026-10-14):** alle vier de algoritmes; Freeze erbij;
> een **aparte module** naast REVERB ("deze is zwaarder, dus de keuze is
> belangrijk"); convolutie pas na HALL. Referentie om op het oor mee te
> vergelijken: mogelijk een Lexicon PCM 91.

> **Stand 2026-10-14:** stap 1–4 gebouwd (fw 0.5.113, Teensy 14,4 % cpu,
> sitepagina `sw-hall` live), zie [RELEASE-LOG](../RELEASE-LOG.md). Open:
> luisteren (ook tegen een PCM 91), en daarna CONV.

Eerst de werkwijze, dan de techniek.

## 0. Wat er al is

- **REVERB** (`tp_mmb_reverb`): Plate (de Dattorro-tank, "in de stijl van
  Griesinger") en Spring. Klein en strak; ~15 % cpu op de Teensy.
- **Elements reverb**, **SHIMMER**, en de galm in Clouds en Beads: dezelfde
  familie (plaat/kleine tank).
- **Convolutie**: alleen in de Snaarbank-testpagina
  (`editor/public/snaarbank-worklet.html`, blok "Space": een gegenereerde
  impulsrespons via de ConvolverNode van de browser). Niet in de modulaire
  editor, niet op de Teensy.

Wat ontbreekt is de **grote, ademende ruimte**: een zaal of kerk met een
lange, gladde staart die niet metalig gaat klinken, met vroege reflecties
die de ruimte "vorm" geven, en die beweegt (de Lexicon-chorus in de staart).

## 1. De werkwijze

Een module **HALL**, stereo in en uit, voor op de bus of achter een stem.

- **Algoritme** (schakelaar): *Hall* (groot, lange opbouw), *Room* (klein,
  veel vroege reflecties), *Chamber* (dicht, weinig modulatie), *Random
  Hall* (meer en willekeurigere modulatie: de beweging van de Lexicon 480L).
- **Knoppen**: Size (ruimtegrootte), Decay (galmtijd, 0,2–30 s), Pre-delay
  (0–250 ms), Early (vroege reflecties), Diffusion, Hi damp (hoe snel het
  hoog uitsterft), Lo mult (laag langer of korter dan de rest), Mod (diepte
  en snelheid van de beweging), Width, Mix.
- **Freeze**: de staart blijft oneindig staan (Decay → ∞, ingang dicht).
- CV op Decay, Size en Mix, met optellen bij de knop (zoals sinds FW-MOD-1).

## 2. Techniek

- **Vroege reflecties**: een vertragingslijn met een handvol aftakkingen per
  kant (een gegenereerd patroon dat met Size meeschaalt), links en rechts
  verschillend. Die geven de "vorm" van de ruimte.
- **Verspreiding**: vier all-pass-filters in serie vóór de tank (Schroeder),
  per kant iets anders, zodat de ingang een dichte wolk wordt.
- **De tank**: een **feedback delay network** (FDN) met 8 lijnen en een
  orthogonale menging (Hadamard of Householder; Jot & Chaigne). Lijnlengten
  onderling ondeelbaar, geschaald met Size. Per lijn een
  **frequentieafhankelijke demping** (een shelving-filter), zodat Decay een
  echte galmtijd is en Hi damp / Lo mult de kleur bepalen (Jot's
  absorptiefilters).
- **Modulatie**: de lengte van elke lijn beweegt langzaam (een eigen,
  licht willekeurige LFO per lijn, met interpolatie). Dat haalt de metalige
  resonanties weg en laat de staart leven; *Random Hall* moduleert dieper en
  onregelmatiger.
- **Uitgang**: links en rechts uit verschillende lijnen, met Width als
  menging; de vroege reflecties ervoor.
- **Geheugen**: 8 lijnen tot ~150 ms plus de vroege reflecties en de
  pre-delay: ~200 KB in float, ~100 KB in int16. **Op de heap (RAM2), niet in
  PSRAM**: een tank leest per sample op veel verspreide plekken (zie
  FxMem.h; de Beads-delay op PSRAM is een waarschuwing, FW-BEADS-1).
- **Rekentijd**: schatting 8–15 % op de Teensy; meten met `module_cpu.py`.
- **Eén kern** (`mmb_dsp/hall.h`) voor Teensy en simulator, zoals de andere.

## 3. Hoe we weten dat hij goed is (tests)

- **Galmtijd**: een tik erin, de RT60 meten (de afname per seconde in dB)
  bij laag, midden en hoog; moet bij Decay, Hi damp en Lo mult passen.
- **Dichtheid**: het aantal reflecties per ms groeit snel (geen losse tikken
  na de opbouw).
- **Geen metalig klinken**: het spectrum van de staart vlak genoeg (geen
  pieken van meer dan een paar dB), met en zonder Mod.
- **Stereo**: de correlatie tussen links en rechts laag.
- **Stabiel**: Decay helemaal open en Freeze lopen niet weg.
- En natuurlijk: luisteren. Vergelijken met de Plate van REVERB.

## 4. Stappen

1. Kern `mmb_dsp/hall.h` + simulator + de tests van §3.
2. Paneel, help, front, seed (bijvoorbeeld een strijkersklank of de
   e-piano met HALL op de bus).
3. Teensy, cpu meten.
4. Sitepagina.
5. (Apart, later) **CONV**: een convolutiegalm, zie §5.

## 5. Convolutie, later en apart

Een module die een impulsrespons (IR) inleest en daarmee galmt. Op de Teensy
kan dat met opgedeelde FFT-convolutie (uniforme blokken), maar het is zwaar:
reëel voor een mono-IR van een seconde of twee. De IR's: zelf opgenomen
ruimtes, gegenereerde IR's (zoals de Snaarbank), of vrije bibliotheken met
een duidelijke licentie. Opnames van bekende apparaten (bijvoorbeeld de
Bricasti M7) alleen als de rechten helder zijn. Eerst HALL.

## 6. Bronnen

- M. R. Schroeder, "Natural Sounding Artificial Reverberation", J. Audio
  Eng. Soc. 10(3), 1962.
- J. A. Moorer, "About This Reverberation Business", Computer Music Journal
  3(2), 1979.
- J.-M. Jot, A. Chaigne, "Digital Delay Networks for Designing Artificial
  Reverberators", AES Convention 90, 1991.
- J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters",
  J. Audio Eng. Soc. 45(9), 1997.
- D. Griesinger, publicaties over ruimtelijkheid en decorrelatie (de
  ontwerper van de Lexicon-algoritmes; de algoritmes zelf zijn niet
  gepubliceerd).

## 7. Vragen voor Mark

1. **De vier algoritmes** (Hall, Room, Chamber, Random Hall), of eerst alleen
   Hall?
2. **Freeze** erbij?
3. **Plaats in de familie**: naast REVERB als aparte module (voorstel), of
   als extra stand van REVERB?
4. **Convolutie**: na HALL, of liever eerst?

## 8. Cloud Seed (bekeken 2026-10-14)

Mark: "Cloud Seed is interessant: wil je daar beter naar kijken?"

- **Wat**: de algoritmische galm van Valdemar Erlingsson (Ghost Note Audio),
  bedoeld voor grote, ambient ruimtes. De kern van Cloud Seed 2.0 is open:
  `GhostNoteAudio/CloudSeedCore` (C++14, ~3200 regels, geen afhankelijkheden,
  laatste commit 22-09-2024). De plugin zelf (met de bediening) is betaald.
- **Licentie**: MIT. Voorwaarden in de readme: Ghost Note Audio als
  oorspronkelijke auteur noemen; de naam "Cloud Seed" mag, als duidelijk is
  dat het niet van hen komt (en ze kunnen vragen ermee te stoppen).
- **Opbouw** (per kant een eigen kanaal; links en rechts verschillen via
  "cross seed"): laag- en hoogafsnijding op de ingang → pre-delay →
  multitap (vroege reflecties, met seed) → tot 12 gemoduleerde all-passes in
  serie → tot **12 parallelle lijnen**, elk een eigen terugkoppellus met
  daarin een gemoduleerde vertraging, tot 12 gemoduleerde all-passes, een
  low/high shelf en een laagdoorlaat. Galmtijd per lijn uit de RT60 (zoals
  HALL). Alle lengtes en snelheden komen uit een zaadgetal: dezelfde knoppen
  met een ander zaad is een andere ruimte.
- **Verschil met HALL**: geen menging tussen de lijnen (parallel, geen
  FDN-matrix); de dichtheid komt van de all-passes *in* de lussen. Dat geeft
  de typische, wollige, oneindige wolk. Veel knoppen (ruim 40 parameters):
  meer een galm-instrument dan een "zet hem op Hall"-galm.
- **Teensy**: zoals hij is past hij niet. Elke all-pass reserveert
  100 ms bij 192 kHz (75 KB); bij de maximale instellingen zijn dat er
  ~300, samen tientallen MB, en ook de rekentijd is dan veel te hoog. Een
  port moet de buffers op 44,1 kHz en op de werkelijk gebruikte lengtes
  maken, en het aantal lijnen en trappen begrenzen (bijv. 8 lijnen × 4
  all-passes). Dan is een schatting 20–40 % cpu; meten. In de simulator
  kan hij wel met de grenzen van nu.
- **Advies**: als **referentie** meteen bruikbaar (zelfde impuls door HALL
  en Cloud Seed, staart vergelijken). Als **eigen module** (bijv. "SEED" of
  "CLOUD", met credit) is hij een mooie ambient-galm naast HALL, maar dan
  met een kleine set knoppen op het front en de rest achter Binnenkijken.
  Volgorde ten opzichte van CONV: Marks keuze
  ([conv-reverb.md](conv-reverb.md) vraag 4).
