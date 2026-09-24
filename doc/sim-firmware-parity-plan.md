# Simulator ↔ Teensy: wat verschilt er nog, en in welke volgorde lossen we dat op

Status: levend plan. Aangemaakt 2026-09-20.
Zie ook: [tools/mmb-wasm/README.md](../tools/mmb-wasm/README.md) (het recept),
[doc/uml/11-simulation-wasm.md](uml/11-simulation-wasm.md) (de twee poly-constructen).

## Waarom

De browser-simulator moet klinken als de Teensy, niet *ongeveer* als de Teensy.
Voor vijftien modules is dat al zo: die draaien dezelfde C++ als de firmware,
naar WebAssembly gecompileerd. De rest is Tone.js-benadering (een biquad waar
de hardware een Huovilainen-ladder heeft) of stilte. Dit plan zet op een rij
wat er nog tussen zit en in welke volgorde het weg te werken is.

## Waar we staan

Gemeten met `simSupportOf` over de 52 interne moduletypes (2026-09-20):

| bak | n | modules |
|---|---|---|
| **wasm** — zelfde DSP als de Teensy | 15 | elements, rings, plaits, clouds, tides, marbles, stages, peaks, warps, dx7, sampler, morph_wt, tape_echo, env_follower(+mono) |
| **tone** — benadering | 18 | vco, vcf, ladder, ms20, vca, ahdsr, echo, phaser, noise, fm_vco, lfo, cvmath, mixer(+8/16), seq8, midiin, out |
| **none** — stil in de sim | 19 | comb, comp, cr78, resonator, string, stk_sound, chord, quant, sh, grids, draw_vco, wt_vco, octa_vco/vcf/vca, quad_vco_shared, quad_mixer_shared, stereo_vca, elements_reverb |

**Stand 2026-09-24** (60 types, de vintage-FX erbij):

| bak | n | modules |
|---|---|---|
| **wasm** | 40 | de 15 hierboven, plus vcf, ms20, stk_sound, de vintage-FX, elements_reverb, octa_vca, stereo_vca, resonator, cr78, comp, comb, string, echo, phaser, quant, chord, grids, lfo |
| **tone** | 13 | vco, ladder, vca, ahdsr, noise (bestaat niet in de firmware), fm_vco, cvmath, mixer(+8/16), seq8, midiin, out |
| **none** | 7 | draw_vco, wt_vco, octa_vco, octa_vcf, quad_vco_shared, quad_mixer_shared, sh (bewust: bestaat niet in de firmware) |

Van de "tone"-bak is een deel infrastructuur waar sample-exactheid niet toe
doet (midiin, out, mixer, cvmath, seq8). Het gaat om de klankbepalende
modules: vco, vcf, ladder, ms20, vca, ahdsr, echo, phaser, noise, fm_vco.

## De strategie: kernels naar `mmb-dsp`, niet de Teensy-lib naar de browser

Er lagen drie wegen open.

1. **Firmware-DSP zelf schrijven**, zodat de simulator hem kan compileren.
2. **De Teensy Audio Library naar wasm porten.**
3. **Het middenpad: de kernel uit de Teensy-klasse lichten en in `mmb-dsp`
   zetten, de `AudioStream`-schil in de firmware laten.** ← dit doen we.

Weg 2 valt af: dan shim je `AudioStream`, de blokpool, de update-keten en de
CMSIS-intrinsics, en onderhoud je een vreemde bibliotheek in je eigen build —
voor een handvol klassen die je echt gebruikt.

Weg 1 in de vorm van "opnieuw bedenken" valt ook af: de klank van bestaande
hardware ligt vast in die code. Maar de klassen die we gebruiken zijn MIT en
porteerbaar; de kernel *eruit tillen* kost geen klank en geen risico.

Die lijn loopt al: `VcfModule` ruilde in september Teensy's int16
`AudioFilterStateVariable` in voor `mmb_dsp::Svf`, en `Ms20Module` draait op
`mmb_dsp::Korg35`. Beide kernels zijn puur C++ (`<cmath>`, `<cstdint>`) en
worden al meegecompileerd in `sampler.wasm` — ze staan dus klaar.

Vuistregel voor een module: **zit de DSP in `mmb-dsp` of in een gevendorde
lib, dan is er geen besluit nodig — alleen bouwwerk.** Zit hij in een
Teensy-klasse, til de kernel er dan eerst uit.

## Stappen

### 1. `tp_mmb_vcf` + `tp_mmb_ms20` naar wasm — **klaar** (2026-09-20)

De kernels bestaan al; dit is puur het recept uit de README toepassen.
Semantiek exact overnemen uit de firmware:

- **VCF** (`VcfModule.h`): cutoff = `base · 2^(cv_amt · clamp(cv, −1, 1))`;
  resonantie = `clamp(q + q_cv_amt · q_cv, 0.7, 5.0)`, lineair naar 0…1 via
  `(q − 0.7) / 4.3` (de catalogus draagt nog de oude
  `AudioFilterStateVariable`-eenheid); `type` 0/1/2 = LP/HP/BP, live.
- **MS-20** (`Ms20Module.h`): `cv_amt` 0…7 octaven op de cutoff,
  `q_cv · q_cv_amt` telt op bij de resonantie, `drive_cv · drive_cv_amt`
  schaalt de drive exponentieel (±1 = ×4…÷4), `type` 0/1 = LP 12 dB /
  HP 6 dB.

Poorten en control-ids zijn gelijk aan de moduledefinitie in `seedModules.ts`
— de worklet koppelt op naam.

Gedaan: `tools/mmb-wasm/vcf_wasm.cc` en `ms20_wasm.cc`, blok 32 met de
parameter-smoothing op de Teensy-cadans (`kPrepareEvery`). De Tone-klassen `Vcf` en `Ms20` zijn hun `registry.register` kwijt —
de registry weigert een tweede factory op hetzelfde typeId. Doorgemeten in
`editor/src/modular-mb/sim/wasmFilter.test.ts` (LP/HP/BP, CV in octaven,
resonantie, Q-CV, MS-20-drive) — die test laadt de `.wasm` gewoon in node, dus
dit is zonder oren te controleren. CPU: 0,2 % (VCF) en 0,4 % (MS-20).

### 2. MIDI CC + pitch-bend in het simulatiepaneel — **klaar** (2026-09-20)

`MidiSource` zond `cc` en `pitchBend` al; `SimulationPanel` luisterde alleen
naar noteOn/noteOff, dus mod-wiel en bend deden niets terwijl de kabels in de
patch lagen.

Opgelost door de MOD-uitgangen van MIDI-In (`cv_mod`, `cv_bend`, `cv_cc1`,
`cv_cc2`) echte `Tone.Signal`s te maken. Daarmee neemt alle bestaande
CV-bedrading ze aan zoals die van een LFO, en hoefde alleen de dispatcher
narrow gezet te worden op de NOTE-poorten (pitch/gate/vel). `engine.controlChange`
en `engine.pitchBend` zetten de waarden; bend is V/Oct met `bendRange` als
volle uitslag.

Daarbij bleek `cv → VCO.tune` helemaal niet bedraad te zijn: ook een
LFO-vibrato kwam nooit bij de VCO aan. Nu wel — volt × 1200 op `osc.detune`,
zodat het optelt bij de noot van de dispatcher.

### 3. Bestaande C++ die alleen nog niet gebouwd is — *stk_sound klaar* (2026-09-20)

`stk_sound` was de schone: de DSP zit volledig in de gevendorde STK, dus de
wasm-wrapper compileert dezelfde bron als de firmware — geen
firmware-wijziging, geen licentievraag. Acht van de negen modellen klinken op
hun defaults; zie de README voor Brass (lipspanning omhoog) en BandedWG (CC#2
is daar bowPressure, ook op de Teensy). Doorgemeten in
`editor/src/modular-mb/sim/wasmStkSound.test.ts`: poorten en controls tegen de
catalogus, elk model apart, V/Oct-tracking en de gate-staart.

Onderweg gevonden en in de wrapper rechtgezet: bij Brass zet `setFrequency()`
de lipspanning terug, dus de controls moeten ná de toonhoogte. Stond de
volgorde andersom, dan deed de Timbre-knop niets. **De firmware heeft dezelfde
volgorde-afhankelijkheid** (`writeCvPort("voct")` → `setPitch` zonder daarna
`applyControlChanges()`), dus daar doet Timbre op Brass ook niets zolang er een
V/Oct-kabel in zit. Eén regel om te repareren, maar dat hoort bij een sessie
met oren erbij.

Blijft over: `string`, `comb`, `resonator`, `comp`, `cr78` — DSP zit in de
module-header zelf en moet eerst naar `mmb-dsp`.

### 4. Kernels uit de Teensy-klassen tillen

`vco` (`AudioSynthWaveform`), `ladder` (`AudioFilterLadder`), `ahdsr`
(envelope), `echo` (`AudioEffectDelay`), `string`
(`AudioSynthKarplusStrong`). Kopiëren naar `mmb-dsp`, de `AudioStream`-schil
in de firmware laten, firmware laten draaien op de kernel, daarna het recept.

Een onderzoeksronde op 2026-09-20 (zie *Onderzoek* hieronder) veranderde het
beeld op drie punten:

- **Mag: ja, maar per bestand.** De Teensy Audio Library heeft géén
  repo-brede LICENSE; elk bestand draagt zijn eigen kop. PJRC-bestanden
  (`synth_waveform`, `effect_envelope`, `effect_delay`) zijn MIT **plus** een
  verplichte "development funding notice" — drie notices dus, niet twee.
  `filter_ladder.*` is niet van PJRC maar van Richard van Hoesel (2021), eigen
  MIT-achtige grant, met het informele verzoek de beschrijvende kop te
  bewaren. DaisySP's `ladder.h` laat zien hoe zo'n attributieblok eruitziet.
  (Lezing van bronkoppen, geen juridisch advies — schrijf het blok bewust op
  en pin de upstream-commit waarvan je port.)
- **De int16→float-aanname klopt niet voor de ladder.** Zijn hele kern is al
  float; int16 zit alleen op de acht `audio_block_t`-randen. Het risico zit
  dus in de schaling op die rand, niet in de rekenkunde. Maar het is ook niet
  het kale Huovilainen-paper: het is van Hoesel v1.5 met 4× oversampling,
  `MAX_RESONANCE` 1,8, een eigen Q-polynoom, `fast_tanh`/`fast_exp2f`, en —
  het echte werk — een **36-taps polyfase-FIR uit CMSIS** als standaardpad.
  Daar bestaat in wasm niets voor; dat moet je zelf schrijven, anders val je
  stil terug op het lineaire pad dat hoorbaar anders is. Ook: de cutoff-grens
  is `0,425·Fs`, geen vaste 18,7 kHz.
- **De VCO is geen wavetable maar een BLEP-toestandsmachine**: een 32-slots
  ringbuffer met actieve stappen, een 16-entry int32-uitgangsbuffer, een
  258-entry staptabel. polyBLEP eronder schuiven verandert de transiënt
  meetbaar — dit is overschrijven, niet herschrijven.

**En de keuze die daaruit volgt.** `phase_increment = freq · 2³² /
AUDIO_SAMPLE_RATE_EXACT` is een compile-time macro zonder runtime-setter, en
de macro is `#ifndef`-guarded: een wasm-build die hem vergeet draait stilletjes
44,1-coëfficiënten op 48 kHz. Bit-exact nullen tegen de firmware kán niet
zolang de rates verschillen. Onze architectuur koos al de goede kant — modules
draaien op hun eigen native rate en de worklet resamplet op de rand — maar
daarmee is de kwaliteit van die resampling (stap 3 van het onderzoek) geen
zijpad meer: hij zit in het kritieke pad van pariteit.

Verificatie hoort dan perceptueel te zijn, niet een platte THD/SNR: de
alias-hoorbaarheidsdrempels zijn sterk asymmetrisch rond de grondtoon (onder
f0 volstaat 0–12 dB onderdrukking, erboven is 19–41 dB nodig), en de
aanbevolen maat is de A-gewogen noise-to-mask ratio.

### 5. Stemgedrag van MIDI-In — **deels** (2026-09-20)

Gedaan:

- **STEAL** (old/low/high) stuurt nu beide toewijzers. Het beleid zit in
  `pickVoiceIndex()` in `polySim.ts`; de Tone-toewijzer en de wasm-toewijzer
  roepen hetzelfde aan, zodat ze niet uit elkaar kunnen lopen.
- **voiceCount** knipt de PolyGroups af op het aantal stemmen dat de knop
  aangeeft — de firmware bouwt er ook niet meer dan dat. Eén stem = geen
  groep: de kabels blijven op de master staan.
- **GLIDE** (ms per octaaf) is de glijtijd van de VCO geworden. Daarbij bleek
  dat de MIDI-dispatcher `baseMidi` van een VCO nooit bijwerkte, waardoor de
  Coarse-knop tijdens het spelen naar een oude noot sprong.

**PRIO en LEG erbij (2026-09-20).** Eerst de regels opgezocht in twee
implementaties die precies dit werk doen, in plaats van ze te bedenken:

- **Mutable Yarns** (`yarns/part.cc` met `stmlib/algorithms/note_stack.h`) —
  een MIDI-naar-CV-brain, dus hetzelfde probleem als onze MIDI-In. Het houdt
  een stapel ingedrukte toetsen bij en kijkt bij elke gebeurtenis wie er
  volgens de prioriteit wint: `before = winner(); stack.press(note);
  after = winner(); if (before != after) → stem opnieuw sturen`. Wint de
  nieuwe toets niet, dan gebeurt er letterlijk niets. Bij loslaten hetzelfde,
  met `trigger = (legato_mode == 0)`: de stem zakt glijdend terug naar de
  toets die nog ligt en slaat alleen opnieuw aan als legato uit staat. En bij
  aanslaan `legato = stack.size() > 1`, dus de eerste toets triggert altijd.
- **Surge** (`SurgeSynthesizer::releaseNotePostHoldCheck`) doet het bij
  loslaten net zo: alle ingedrukte toetsen aflopen en de hoogste, laagste of
  laatste kiezen. Twee verfijningen die wij (nog) niet hebben: het maakt
  "envelope opnieuw vanaf nul of doorlopen" een aparte instelling
  (`monoVoiceEnvelopeMode`), en het kent een prioriteitsstand die bij
  aanslaan de laatste volgt maar bij loslaten naar de hoogste terugkeert.

Zo zit het er nu in: `NoteStack` in `polySim.ts` (los van Tone, dus testbaar),
en `AudioEngine.noteOn/noteOff` zijn een dunne laag die die stapel raadpleegt
zodra de patch géén PolyGroup heeft — want PRIO en LEG zijn monofone
begrippen. De `retrigger`-vlag loopt door tot in de wasm-stemmen: bij legato
schuift de stem naar de nieuwe toon zonder de gate aan te raken.

Meegenomen uit Yarns' `voice_allocator.h`: een vrije stem kiezen we nu als de
stem die het **langst stil** is, niet de laagste index. Anders krijgt stem 1
elke noot en kap je telkens dezelfde release-staart af.

**UNI/SPRD erbij, en de firmware rechtgetrokken (2026-09-20).** De
firmware-helft bestond al sinds fw 0.5.12 (backlog ED-RV-9): `MidiInModule`
heeft `unison_` en `spreadCents_`, en `spreadOffsetV()` waaiert de stemmen
symmetrisch uit over ±0,5 × de spreiding. Die formule staat nu ook in
`polySim.ts` als `unisonSpreadVolts()`, met de dispatcher die in unison álle
stemmen aanstuurt in plaats van er één te kiezen — voor Tone-VCO's via de
frequentie, voor wasm-stemmen via een detune op `voct`.

Daarbij bleek de simulator op één punt vóór te lopen op de hardware: PRIO deed
in de firmware niets. De code was daar eerlijk over ("accepted by the editor
but not yet acted on here, see backlog FW-1"). Nu wel: `monoWinner()` in
`MidiIn.cpp` kiest last/low/high, en mono én unison gebruiken hem.

Dat trok meteen een ouder probleem recht. De monofone tak liep via de
VoiceAllocator, en die kent alleen klinkende noten — geen ingedrukte toetsen.
Liet je de bovenste toets los terwijl je een lagere vasthield, dan **viel de
gate** in plaats van terug te zakken. Nu zakt de stem terug naar wat er nog
ligt, zoals Yarns en Surge het doen. Eén bestaande core-test legde het oude
gedrag vast; die is bijgewerkt, met drie nieuwe erbij (110 core-tests groen,
Teensy-build groen).

Nog open, en hoorbaar werk: een **hertrigger-flank**. Zowel de steal-tak als
een nieuwe mono-noot zet de gate laag en meteen weer hoog binnen één aanroep;
de CvGraph bemonstert op 1 kHz en ziet die flank dus nooit. Dat is dezelfde
klasse fout als de gate-collaps die de simulator had. Voor de sim is hij
opgelost (gate laag, aanslag een blok later); de firmware heeft er een
retrigger-puls per stem voor nodig. Dat wil je met je oren erbij doen.

Glide werkt alleen voor Tone-VCO's; een wasm-stem krijgt zijn `voct` als
stapwaarde, dus daar hoort het in de wrapper thuis.

### Onderweg gevonden: de worklet liep vooruit op zijn invoer

`mmb-worklet.js` rendert native samples voor het lopende render-quantum, maar
moest daarvoor invoer hebben die nog niet binnen was. De resampling klemde dan
op de laatst ontvangen sample, waardoor de staart van elk blok bevroor. Dat
gold voor **alle** wasm-modules en klonk als korrel en overstuur; gemeten op
een zuivere toon was er meer vuil dan signaal (SNR 16 dB). De host bouwt nu
eerst één render-quantum voorsprong op — SNR 84 dB, kosten een paar ms
latency. Vastgelegd in `editor/src/modular-mb/sim/wasmWorklet.test.ts`.

Het viel op doordat de nieuwe filters op blok 128 stonden, waar het effect
vier keer zo groot is (SNR −1,5 dB). Vandaar de vuistregel in de README: houd
het blok klein en de smoothing op de Teensy-cadans.

### Onderweg gevonden: de MS-20 klemde niet op de Teensy

`Ms20Module.h` castte zijn uitgang rechtstreeks naar int16. Met de resonantie
op zelf-oscillatie én drive open komt de Korg35-lus boven ±1 uit, en dan wrapt
die cast: harde foldover op de hardware waar de simulator netjes clipt.
Opgelost (2026-09-20) door te klemmen vóór de cast, zoals Elements en de VCF
al deden. Firmware compileert.

Elements is hier juist goed: die klemt al, en de "overdrive" die je bij hoge
`damping` hoort is Mutable's eigen `SoftLimit()` in `part.cc` — de resonator
houdt zijn energie vast en stapelt tot hij tegen die limiter aanloopt. Zelfde
gedrag op de Teensy; geen porteerfout.

## Onderzoek (2026-09-20)

Een deep-research-ronde over drie vragen: kernels uit de Teensy-lib tillen,
MIDI-stemgedrag exact definiëren, en resampling in een AudioWorklet. Negen
bevindingen overleefden de verificatie, **allemaal over de eerste vraag** —
hierboven verwerkt. Vragen 2 en 3 leverden nul overlevende claims op. Dat is
een gat in het onderzoek, geen bewijs dat er niets is; beide verdienen een
eigen ronde.

### Nagelopen wat de verificatie onderuithaalde (2026-09-20)

Twee blokken waren 0-3 weggestemd. **Beide bleken te kloppen**; de verifiers
konden de bronnen simpelweg niet lezen. Dat is een nuttige les over het
onderzoek zelf: een PDF vol formules komt er als tekenbrij uit, en dan stemt
een verifier "niet te bevestigen" als "onwaar".

**`newdigate/teensy-audio-x86-stubs` bestaat.** MIT, Teensy Audio Library naar
Linux/x86 met audio-I/O via libsoundio, "highly experimental work-in-progress",
86 commits. In `src/` staan `filter_ladder.*`, `effect_envelope.*`,
`effect_delay.*` en `effect_delay_ext.*` — géén `synth_waveform`. Daarmee is
het een bruikbare referentie voor stap 4: iemand heeft die bestanden al van
`AudioStream` en de Teensy-hardware losgeweekt.

En er staat een **`Resampler.*` van Alexander Walch** in (MIT, afgeleid van de
Teensy Audio Library): windowed sinc met Kaiser-venster, polyfase, instelbare
halve filterlengte van 20 tot 80 taps naar gelang de gewenste onderdrukking, en
PID-geregelde driftcorrectie voor rate-matching in real time. Dat is precies
het gereedschap waar onderzoeksvraag 3 naar zocht — bestaande C++ uit ons eigen
ecosysteem, te compileren naar wasm. Waard om tegen onze lineaire interpolatie
af te zetten voordat we zelf iets bouwen.

**Het DAFx-2004-paper bevestigt alle drie de claims.** Zelf nagelezen
(`dafx.de/paper-archive/2004/P_061.PDF`):

- *Oversampling verplicht:* "Since there is a non-linearity, oversampling must
  be used and this brings the Euler solution closer to the ideal solution", en
  "Some oversampling is required to avoid aliasing." Het paper rekent met 2×
  (88,2 kHz); de Teensy-ladder doet 4×.
- *Tuning-coëfficiënt:* vergelijking (21) is `g = 1 − e^(−2π·Fc/Fs)`, met in
  (20) `Fs` in de noemer. De coëfficiënt is dus sample-rate-gebonden — precies
  waarom een 44,1-kernel op 48 kHz niet klopt zonder herberekening.
- *Niet-lineariteit:* vergelijking (1) is `tanh((Vt1−Vt2)/(2·Vt))` met `Vt` de
  thermische spanning van de transistor; (6), (7) en (10) gebruiken dezelfde
  vorm. Het paper geeft géén getalswaarde voor `Vt` — dat is een keuze van de
  implementatie, en dus een plek waar twee ports uiteen kunnen lopen.

### Resampling doorgemeten (2026-09-20) — cubic, geen polyfase-FIR

Onderzoeksvraag 3 bleef onbeantwoord in de zoekronde, dus zelf gemeten. De
vraag was of onze lineaire interpolatie de pariteit in de weg zit, nu blijkt
dat we de kernels niet op de contextrate kúnnen draaien.

Fout van een interpolator groeit met de frequentie. Op 44,1 → 48 kHz:

| | 220 Hz | 2 kHz | 5 kHz | 15 kHz | demping 8 kHz | demping 15 kHz |
|---|---|---|---|---|---|---|
| lineair | 89 dB | 50 dB | 34 dB | 11 dB | −0,95 dB | −3,44 dB |
| cubic (4 taps) | 138 dB | 79 dB | 49 dB | — | −0,16 dB | −1,65 dB |
| Kaiser-sinc (65 taps) | — | 82 dB | 74 dB | 61 dB | 0,00 dB | 0,00 dB |

Op een bandbeperkte zaagtand van 220 Hz — realistischer materiaal — haalt
lineair 34 dB en de sinc 49 dB totaal. Maar uitgesplitst per band zit het
meeste vuil bóven 12 kHz; in het gebied waar het oor scherp is (2–12 kHz) zat
lineair op −47…−53 dB, cubic op −58…−69 dB en de sinc op −112…−121 dB. De
gemeten hoorbaarheidsdrempels uit het onderzoek (boven de grondtoon is 19–41 dB
onderdrukking genoeg) liggen dus ruim bóven wat de cubic overlaat.

**Besluit: cubic in de host, geen polyfase-FIR porten.** Vier taps, geen
tabellen, geen extra latency, en het pakt zowel de aliasing als de demping in
het hoorbare gebied. Walch's Kaiser-polyfase resampler blijft in reserve voor
als er ooit een module op 32 kHz bij komt waar de verhouding lelijker uitvalt.
Vastgelegd in `wasmWorklet.test.ts`, dat nu ook op 2 en 5 kHz meet — met de
oude lineaire host faalt die test.

### 6. De noot-dispatcher — *voorstel, jouw beslissing* (2026-09-24)

AHDSR, CvMath en de sequencer zijn pure core-C++ en kunnen via
`tools/mmb-wasm/cvhost.h` letterlijk de firmwareklasse draaien, net als de
LFO nu. Toch heb ik ze laten staan. Ze zitten namelijk niet aan kabels vast
maar aan de **noot-dispatcher** in `AudioEngine.ts`. Die roept
`env.triggerAttack()` aan vanuit toetsenbord, MIDI-In en sequencer. Hij zet
de MIDI-velocity als getal op de `mult`-factor van de CvMath (velocity is daar
geen signaal). En de Tone-stemtoewijzer (`toneAlloc`) kiest per noot één stem
voor Tone-VCO's én Tone-envelopes tegelijk. Verhuis je alleen de AHDSR, dan
wijst een tweede toewijzer (die van wasm) de envelope toe. Een poly-patch
opent dan de envelope van stem 3 terwijl de VCO van stem 2 de noot speelt.

Op de Teensy bestaat die dispatcher niet: MIDI-In (`core/src/runtime/MidiIn.cpp`,
ook pure C++) zet gate, V/Oct en velocity als CV-signalen per stem, en de
CvGraph draagt ze naar wie er aan de kabel hangt. De stap die dit echt
oplost:

1. **MIDI-In als wasm** via `cvhost`, gevoed met noot-events in plaats van
   signalen. Hij levert dan zelf gate/voct/vel per stem, met de stemtoewijzing
   en prioriteit van de firmware in plaats van de TS-kopie in `polySim.ts`.
2. **AHDSR, CvMath en seq8** daarna via `cvhost`: nog maar een paar regels
   elk, want ze krijgen hun gates dan als signaal.
3. De **VCO** (BLEP-kernel, stap 4) sluit het af: dan is er geen Tone-stem meer
   en kan `toneAlloc` weg.

Het is de grootste ingreep in de simulator tot nu toe. Het toetsenbord-zonder-
kabel gedrag (een envelope zonder gate-kabel slaat aan op elke toets) is
sim-only: op de Teensy doet zo'n envelope niets. Blijft dat, als gemak, of
volgt de sim ook daarin de hardware? Dat is de vraag vóór stap 6 begint.

Onderweg gevonden: de CvGraph schrijft een ingang **alleen als de waarde
verandert**, en de AHDSR leunt daarop: elke `writeCvPort("gate", 1)` is voor
hem een opgaande flank. `cvhost.h` schreef elke tick. Voor Quant, Chord,
Grids maakte dat niets uit, maar een AHDSR was elke milliseconde opnieuw
aangeslagen. `cvhost` doet het nu zoals de CvGraph, en geeft controls het type
dat de Teensy uit de JSON leest (toggle → bool, geheel getal → int32). De LFO
leest `bipolar` níét als float: zonder dat typewerk deed de knop niets.

## Wat geen wasm-port oplost

- **CV-domein.** De firmware heeft een aparte `CvGraph` op een 1 kHz
  control-tick; de simulator behandelt CV als audio-rate signaal. Andere
  modulatieresolutie, ander gedrag bij snelle envelopes.
- **Wasm-CV → Tone-modules.** Gates uit een wasm-module triggeren geen
  Tone-envelope en wasm-CV stemt geen Tone-VCO: die worden per JS-aanroep
  aangestuurd, niet per signaal. Lost zichzelf op naarmate stap 3 en 4
  vorderen.
- **Sequencer → poly** blijft in de sim monofoon (stem 1).
- **int16 vs float, 44,1 kHz vs contextrate.** De worklet resamplet, maar
  headroom en clipping verschillen.

## Het recept (uit de README, met de valkuilen erbij)

1. `tools/mmb-wasm/<naam>_wasm.cc` — controls en poorten uit `<X>Module.h`,
   zonder `AudioStream`. Poort- en control-ids **gelijk aan
   `seedModules.ts`**, anders koppelt de worklet ze niet.
2. Eén `build`-regel in `tools/mmb-wasm/build.sh`.
3. typeId toevoegen aan `WasmModule.typeIds`
   (`editor/src/modular-mb/runtime/audio/WasmModule.ts`).
4. Controleren: `node tools/mmb-wasm/test.mjs` (poorten, pieken, flanken,
   CPU) en `npm test` in `editor/` (de simSupport-test telt de bakken).

**Let op:** stap 3 zonder een gebouwde `.wasm` maakt de module *stil* in
plaats van benaderd — de runtime valt niet terug op Tone. typeId dus pas
registreren als het binair er staat, en de `.wasm` meecommitten
(`editor/public/wasm/` staat in git).

### Toolchain

wasi-sdk uit <https://github.com/WebAssembly/wasi-sdk/releases>, uitgepakt in
`~/.wasi-sdk/` of via `$WASI_SDK`. `build.sh` zoekt zelf in `~/.wasi-sdk`;
sinds 2026-09-20 ook naar de linux- en windows-builds, niet alleen macos.
Op Windows draait `build.sh` onder Git Bash.

## Voortgang

- [x] Tone-PolyGroups worden uitgevouwen en polyfoon gespeeld
      (`polySim.ts`, 2026-09-20)
- [x] Stap 1 — vcf + ms20 naar wasm (2026-09-20)
- [x] Stap 2 — MIDI CC + bend in de sim, plus cv → VCO.tune (2026-09-20)
- [~] Stap 3 — stk_sound (2026-09-20); elements_reverb, octa_vca, stereo_vca,
      comb (graaf nagebootst, incl. de blok-vertraging), string (`AudioSynthKarplusStrong`
      in int16 overgeschreven, per Teensy-blok van 128), echo (graaf als de comb;
      de Tone-versie liet 2 s toe en negeerde zijn CV-ingangen) (2026-09-24)
- [~] Stap 4 — resonator, cr78, comp, phaser als `mmb-dsp`-kernel, bit-identiek bewezen
      met `tools/mmb-wasm/bitcheck/` (2026-09-24). Open: vco (BLEP), ladder,
      octa_vcf (die verandert de hardwareklank — oren erbij)
- [x] CV-modules draaien de firmwareklasse zelf via `cvhost.h`: quant, chord,
      grids, lfo (2026-09-24)
- [ ] Stap 6 — noot-dispatcher → signalen (voorstel hierboven; ahdsr, cvmath,
      seq8, midiin wachten hierop)
- [x] Stap 5 — stemgedrag MIDI-In: steal, voiceCount, glide, prio, legato en unison (2026-09-20). Open: hertrigger-flank in de firmware (FW), glide voor wasm-stemmen
