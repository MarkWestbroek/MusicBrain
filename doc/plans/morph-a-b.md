# Morph tussen patch A en B — ontwerpdocument

Datum: 2026-09-25. Ticket-prefix: **ED-MORPH-x** (editor) en **FW-MORPH-x**
(firmware). Vervolg op doc/plans/patch-recept.md (A/B-vergelijkset, ED-RC-8b).
Status: ontwerp, niets gebouwd.

## Doel

Zoals op de Melbourne Nina: je kiest patch A, maakt of kiest patch B, en
draait daarna met één knop continu tussen de twee. Het interessante is niet
de knop zelf maar dat de morph **moduleerbaar** is: mod wheel, aftertouch,
pitch bend, een LFO achter de aftertouch. Dan is de morph een klankparameter
en geen presetwissel.

Beperking, bewust: A en B liggen op **hetzelfde rack** (zelfde modules,
zelfde poly-groepen, zelfde stemmental). Op de Teensy blijven dan alle
modules staan en verandert alleen wat erlangs stroomt.

## Begrippen

- **A, B**: twee patches op één rack. **t ∈ [0, 1]**: 0 = A, 1 = B.
- **M(A, B, t)**: de gemorphte patch. Een pure functie; de editor kan hem
  voor elke t uitrekenen en tonen, de firmware rekent hem per cv-tick.
- **Gewicht op een ingang**: de ingang van een module sommeert zijn voeders
  met een gewicht per voeder. Dit is de enige nieuwe bouwsteen. Het is géén
  eigenschap van een kabel als ding: in hardware zou dat een VCA of potmeter
  per kabel zijn en dus onbetaalbaar. In het digitale domein van de brain is
  het één vermenigvuldiging per gewogen voeder; de Teensy-AudioMixer heeft
  er zelfs al een plek voor (gain per mixer-ingang), de CvGraph een multiply.
- **Wat wel en niet meedoet op echte hardware.** CV blijft digitaal tot aan
  de DAC: een gewicht in de CvGraph werkt dus gewoon door via de bus op een
  hardware-module (break-out dCV → aCV). Ook een morph waarbij A en B een
  andere CV naar dezelfde hardware-ingang sturen is haalbaar, en gemorphte
  knopstanden van dCV-gestuurde parameters net zo. Wat buiten bereik blijft
  is **audio tussen echte modules**: daar zit geen mengpunt in de brain, en
  een gewicht zou een VCA of potmeter per kabel betekenen. Audio-morph is
  dus alleen voor interne modules (en audio dat via een ADC de brain in
  komt); CV-morph werkt overal.

## Knopstanden

Per control dat in A en B verschilt:

- **Knoppen en sliders**: interpoleren in het domein van de taper
  (`taper.ts`): lineair voor `lin`, in het logdomein voor `log`/`exp`
  (cutoff 200 → 3200 Hz morpht dan per octaaf, niet per hertz).
- **Schuifschakelaars met een geordende reeks** (Program EQ Low Hz
  20/30/60/100, FET ratio 4:1/8:1/12:1/20:1/All, attack-standen, release-
  standen): dat zijn springende waarden, maar wél op een as. Interpoleer de
  **stand-index** tussen A en B en rond af naar de dichtstbijzijnde stand.
  Van 20 naar 100 loopt de morph dan langs 30 en 60; tussen twee standen
  zitten is oneigenlijk en gebeurt niet. Als de standen numeriek zijn en
  logaritmisch liggen (20/30/60/100 Hz) kan de interpolatie in het
  logdomein van de waarde; het resultaat wordt toch weer een stand.
- **Schakelaars zonder volgorde** (filtertype LP/HP/BP, golfvorm, modus,
  toggles, bypass): tussenstanden zijn betekenisloos, dus snappen bij
  t = 0,5. Welke schakelaar geordend is staat in de typedefinitie
  (`ordinal: true` op het control); zonder die vlag geldt een heuristiek
  (standen die als getal of verhouding te lezen zijn = geordend, anders
  snappen). Beter dan de heuristiek: de vlag zetten bij de paar modules
  die het aangaat.
- **Knoppen met `step`** (CC-nummer, bank, programma): geheel getal,
  interpoleren en afronden zoals een geordende schakelaar; een bank- of
  programmakeuze morpht in de praktijk niet (snappen).
- **Displays/LED's**: niet van toepassing.
- Controls die gelijk zijn in A en B doen niet mee (geen werk op de Teensy).

## Kabels: de divergentieregel

Kabels zijn binair, mengpunten zijn continu. De crossfade hoort op de plek
waar het hoorbare verschil ontstaat, en die ligt zo dicht mogelijk bij de
uitgang. Denkvoorbeeld: A = sampler → tape → out, B = sampler → FET → out.
Het verschil is de eerste kabel, maar attenueren op de ingang van een
compressor verandert wát hij doet, niet hoeveel je ervan hoort. Dus:

1. Neem de **vereniging** van alle kabels van A en B. Kabels die in beide
   liggen blijven vol (gewicht 1).
2. Loop vanaf de sinks (OUT, en elke module-ingang zonder uitgaand pad naar
   OUT telt niet) **terug** door de graaf. Bij de **eerste ingang waar de
   voeders van A en B verschillen** krijgen de A-voeders gewicht 1−t en de
   B-voeders gewicht t. Voeders die in beide voorkomen houden 1.
3. Stroomopwaarts van zo'n gewogen ingang wordt **niets meer gewogen**:
   alles draait vol, ook de modules die alleen in B iets zinnigs doen (ze
   zijn in A onhoorbaar omdat hun bijdrage bij het divergentiepunt op 0
   staat).
4. Seriële toevoegingen vallen er vanzelf onder: zet B een FET ná de tape,
   dan is het divergentiepunt out.l (tape.out in A, fet.out in B) en blijft
   fet.in vol gevoed.
5. **Signaaltypes** bepalen het mengen:
   - audio, cv: crossfade (gewogen som);
   - gate, trigger: snappen bij 0,5 (een halve gate bestaat niet);
   - toonhoogte-CV (`voct`, `tune`): standaard crossfade, dat geeft een
     glijdende detune. Per poort omschakelbaar naar snappen; dat is een
     smaakkeuze, geen principeprobleem.
6. **Niet zinvol, dus uitgesloten of vol**: terugkoppellussen die maar in
   één patch bestaan (vol laten meelopen en waarschuwen); modules die alleen
   in B bestaan (kan niet: zelfde rack); een module wiens uitgang nergens een
   gewogen ingang bereikt (gewoon vol, onhoorbaar in de andere stand).

Twee dingen weet je pas als het draait: of twee divergentiepunten in serie
(twee crossfades achter elkaar) nog natuurlijk klinken, en of de
CvGraph-regel "bij twee kabels op één cv-ingang wint de laatste verandering"
(commit 8bdddbf) zich verdraagt met gewogen sommen. Dat tweede is een echte
ontwerpkeuze aan de firmware-kant: gewogen ingangen sommeren.

## De morph als module

De morph is zelf een module, want hij moet cv-rate gemoduleerd worden en
kabels ontvangen. **MORPH** (intern, `tp_mmb_morph`):

| Onderdeel | Betekenis |
|-----------|-----------|
| knop `t0` | nulstand (0..1): waar de morph staat zonder modulatie |
| knop `depth` | hoeveel de cv-ingang de morph beweegt (−1..1) |
| cv-ingang `cv` | modulatie; unipolair (mod wheel, aftertouch) of bipolair (bend, LFO) |
| uitgang `t` (cv) | de werkelijke morphstand, voor de balk in de UI en om zelf weer te patchen |

t = clamp(t0 + depth · cv, 0, 1). Mod wheel: t0 = 0, depth = 1. Pitch bend
met een mooi midden: t0 = 0,5, depth = 0,5. Aftertouch + LFO: LFO × druk via
CvMath → cv.

**Modulatie komt van buiten de patch.** Anders ontstaat een cirkel: een LFO
in A die de morph stuurt die A zelf mengt. Regel: er mag **geen pad** lopen
van een gewogen ingang of een gemorpht control naar de bron van de
morph-cv. Praktisch: de morph-cv wordt gevoed door
- modules die niet in A of B bekabeld zijn (een eigen LFO, CvMath, …), of
- de globale poorten van MIDI-in (`cv_mod`, `cv_bend`, pressure), die niet
  van de patch afhangen.
De editor controleert dit als graafcheck bij het bouwen van M en weigert
met een duidelijke melding.

## Datamodel

Een morph is een derde patch-soort, geen los object, zodat push, presets,
undo en de Patches-tab er niets bijzonders aan hoeven:

```ts
interface Patch {
  …
  /** Deze patch is een morph tussen twee andere patches op hetzelfde rack. */
  morph?: { a: string; b: string };
}
```

- `connections` en `controlState` van een morph-patch bevatten **alleen**
  de MORPH-module, zijn modulatieketen en de kabels daarnaartoe. Alles wat
  uit A en B komt is **bevroren**: de editor rekent het uit, toont het,
  maar je bewerkt het in A of B.
- De MORPH-module staat in het rack (als elke module); de modulatie-
  modules ook. Dat is de "morph-rack"-hoek: modules die A en B niet kennen.
- Push (`buildConfigPayload`): A, B en de morph-patch gaan alle drie mee;
  de firmware krijgt daarnaast een **morph-descriptor**: de lijst gewogen
  ingangen (sink, voeder, kant A/B/beide) en de lijst gemorphte controls
  (module, control, waarde A, waarde B, taper, snap). De editor rekent die
  descriptor uit met dezelfde functie als de weergave.

## Firmware (FW-MORPH)

De morph is een **eigen concept in de firmware**, geen truc van de editor.
De editor kan M(A, B, t) wel uitrekenen om te tonen, maar op de Teensy
moet t met cv-rate bewegen (LFO, aftertouch) zonder dat er een pc aan
hangt. Dus: de config draagt A, B, de morph-patch én de morph-descriptor,
en de brain doet het mengen zelf. Dezelfde kern (mmb-dsp `Morph`) draait
in de sim, zoals bij elke module; de contractketen (contract_dump.py,
contracttest, fw-tags) krijgt het descriptor-formaat erbij zodat editor en
firmware er niet uit elkaar kunnen lopen.

1. **Gewogen ingangen** (FW-MORPH-1): AudioGraph routeert een gewogen voeder
   via een mixer-ingang met gain; CvGraph vermenigvuldigt. Zonder morph
   staat alles op 1 en verandert er niets.
2. **MorphModule** (FW-MORPH-2): leest zijn cv-ingang per cv-tick (1 kHz),
   rekent t, en zet per tick de gains van de gewogen ingangen en de waarden
   van de gemorphte controls (`setControl`, alleen de controls die
   verschillen). Tientallen controls per tick is niets voor de Teensy; de
   lijst is per patch klein.
3. Snapping en taper-interpolatie gebeuren in de firmware met de descriptor,
   zodat sim en Teensy hetzelfde doen (dezelfde kern in mmb-dsp).

## Simulator

- Gewogen ingangen: een `Tone.Gain` per gewogen voeder; de gain-parameter
  is een audio-rate signaal dat aan de t-uitgang van de MORPH-worklet hangt
  (1−t via een CvMath-achtige inverter of een tweede uitgang `t_inv` op de
  module). Dan is de crossfade sample-nauwkeurig, ook bij LFO-modulatie.
- Gemorphte controls: per audio-blok (128 samples, ~3 ms) `set_control` op
  de wasm-modules vanuit de host; snel genoeg voor mod wheel en aftertouch.

## UI

Drie zichten op één rack in de Patcher: **A**, **B**, **Morph**.

- **A en B** zijn gewone patches: alles bewerkbaar, de bestaande patcher.
  De A/B-slots (ED-RC-8b) zijn de natuurlijke plek om A en B te kiezen;
  "Maak morph" naast de slots maakt de morph-patch aan.
- **Morph** toont de gefuseerde patch M(A, B, t) met de live t:
  - kabels uit A en B zijn zichtbaar maar **bevroren** (niet te slepen,
    niet te verwijderen); op een gewogen ingang staat een klein a/b-label
    met het huidige gewicht;
  - knoppen tonen de geïnterpoleerde waarde en bewegen live mee, maar zijn
    niet te draaien (draaien doe je in A of B; een klik springt naar die
    patch met de module geselecteerd);
  - alleen de MORPH-module, de modulatiemodules en hun kabels zijn
    bewerkbaar. Nieuwe kabels mogen alleen naar/van die modules en de
    globale MIDI-poorten; de circulariteitscheck weigert de rest.
- **Het MORPH-paneel** staat links van de graph, altijd zichtbaar in het
  Morph-zicht: een grote knop (t0), een **verticale balk A ····· B met een
  wijzer** die de werkelijke t volgt (dus inclusief modulatie), de
  cv-jack, en de depth-knop. De balk is een nieuw display-type
  (`display: 'bar'` met labels aan de uiteinden, ook bruikbaar voor andere
  meters later).
- Poly: t is één waarde voor alle stemmen (de MORPH is globaal); per-stem
  morph (aftertouch per toets) is een latere uitbreiding met een MORPH in
  de poly-groep.

## Fasering

| Ticket | Wat | Afhankelijk van |
|--------|-----|-----------------|
| ED-MORPH-1 | `morph(A, B, t)` als pure functie + descriptor; divergentieregel, snapping, taper-lerp, circulariteitscheck; tests op recept-patches | — |
| FW-MORPH-1 | gewogen ingangen in AudioGraph/CvGraph; attenuation uit de config toepassen | — |
| SIM-MORPH-1 | gewogen ingangen in de sim-engine (Gain per voeder) | ED-MORPH-1 |
| ED-MORPH-2 | morph-patch in het datamodel, A/B/Morph-zichten, MORPH-paneel met balk, bevroren weergave | ED-MORPH-1, SIM-MORPH-1 |
| FW-MORPH-2 | MorphModule op cv-rate + descriptor in de config; push | FW-MORPH-1, ED-MORPH-2 |
| later | 2D vector-morph over A/B/C/D (gewichten per hoek), per-stem morph | alles hierboven |

## Open vragen

- Twee crossfades in serie: natuurlijk of niet? Pas hoorbaar met SIM-MORPH-1.
- CV "laatste verandering wint" versus gewogen som op één ingang.
- Toonhoogte-CV: standaard crossfade (glijdend) of snappen?
- Teensy: aantal gemorphte controls per tick bij grote patches (16 stemmen
  × 6 controls = 96 setControls per ms); waarschijnlijk prima, meten.
- Presets/export: een morph-patch verwijst naar A en B op id; bij
  "Bewaar als…" van A of B moet de morph mee (of de verwijzing breken).
