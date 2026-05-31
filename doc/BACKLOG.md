# MusicBrain — Backlog

> Forward-looking werklijst, gegroepeerd per laag. Opgeleverde items staan in
> [RELEASE-LOG.md](RELEASE-LOG.md). Het requirements/ontwerp-document is
> [Requirements.md](Requirements.md).
>
> Prio: **1** = nu/binnenkort · **2** = gepland · **3** = later/onderzoek.
> Status: ⏳ open · 🔬 onderzoek · ✅ gedaan (verwijst naar release-log).

---

## 1. Editor (Modular Music Brain)

### 1.1 Rack-scherm

| # | Prio | Status | Item |
|---|---|---|---|
| ED-RK-1 | — | ✅ | **B3 — Rechtsklik "maak poly-voicegroup ×N van dit moduletype".** Gedaan (iter-5.11): dupliceert de module N-1× in lagere rijen en bundelt master + followers tot een `PolyGroup`. |
| ED-RK-2a | — | ✅ | **B4 (deel 1) — Ingeklapte poly-weergave ("label ×N").** Gedaan (iter-5.11): master toont `label ×N`, followers verborgen, badge + context-menu om in/uit te klappen. |
| ED-RK-2b | 2 | ⏳ | **B4 (deel 2) — Same-type-adjacent autogrow-layout.** Nog open: bij groeien gelijke types automatisch naast elkaar schuiven. |
| ED-RK-3 | 2 | ⏳ | **C4 — Breakout dual-weergave** in intern + extern rack (zelfde fysieke object, twee kanten). Zie ADR 0009. |
| ED-RK-4 | — | ✅ | Poly grid-compact (master rij 0, followers rij 1..N-1) + poly-aware **Compact**-knop. Zie release fw 0.5.7. |

### 1.2 Patcher

| # | Prio | Status | Item |
|---|---|---|---|
| ED-PT-1 | — | ✅ | **B5 — Visuele indicatie single- vs poly-poort.** Gedaan (iter-5.11): poly-poort = vierkant + groep-gekleurde ring + tooltip; single-poort = ronde stip. (Poly-kabel-styling bestond al.) |
| ED-PT-2 | 2 | ⏳ | **C5 — Signaalpad-view (symbolisch):** ingedikte view die alleen actieve modules in logische signaalvolgorde toont, los van fysieke rackpositie. |
| ED-PT-3 | — | ✅ | Patcher **Compact**-knop is verwijderd: hij muteerde het rack (verwarrend). Layout-compactie gebeurt nu alleen via de **Compact**-knop in het Rack-scherm; nieuwe poly-patches worden al als grid geseed zodat er geen gat vóór de mixer ontstaat. |

### 1.3 Simulatie

| # | Prio | Status | Item |
|---|---|---|---|
| ED-SM-1 | 3 | 🔬 | **A4 — Latency toets→geluid.** WebAudio look-ahead ~50-100 ms; onderzoek lagere `Tone.context.lookAhead` + directe `triggerAttack`. |

### 1.4 MIDI-in & note-gedrag

| # | Prio | Status | Item |
|---|---|---|---|
| ED-MI-1 | 1 | ✅ | **Mode-switch opgeschoond.** De dubbelzinnige `mode`-switch (`mono/legato/last`, met index 1 hergebruikt als "poly") is vervangen door drie heldere controls: `priority` (note-priority last/low/high), `steal` (poly voice-stealing old/low/hi) en `legato` (off/on). Voicing volgt automatisch uit `voiceCount`; het oude `mode`-overload in `seedPolyVoicePatch` is weg. |
| ED-MI-2 | 1 | ⏳ | **Legato echt implementeren.** Label/keuze (`legato` off/on) staat nu op de module en wordt meegestuurd, maar het gedrag bestaat nog niet (editor-sim noch firmware). Zie §5 en FW-1. |
| ED-MI-3 | 1 | ✅ | **Voice-stealing strategie kiesbaar.** De `steal`-control (old/low/hi) mapt 1-op-1 op firmware `StealStrategy {Oldest, Lowest, Highest}` en wordt via de config-push doorgegeven (`setControl("steal", index)`). Zie §5 en FW-2. |
| ED-MI-4 | 1 | ✅ | **B1 — Modulatie-CV-outputs uit MIDI-in:** extra poorten `cv_mod` (mod-wheel CC1), `cv_bend` (pitch-bend, V/Oct, bereik via `bendRange`-knop in halve tonen) en `cv_cc1`/`cv_cc2` (vrij kiesbare CC-nummers via `cc1Num`/`cc2Num`-knoppen). Firmware: `MidiInModule::onControlChange`/`onPitchBend` + `setControl` voor cc-nummers/bereik, USB-MIDI handlers in `main.cpp`. Editor: module verbreed naar 12 HP met NOTE- en MOD-secties. Sim negeert de mod-poorten (geen mod-bron in de sim). Unit-tests `midiin_modwheel_and_cc_outputs` + `midiin_pitchbend_output_scales_with_range`. |

### 1.5 Intra-module meervoudigheid (C — groter ontwerp, deels klaar)

| # | Prio | Status | Item |
|---|---|---|---|
| ED-CG-1 | 2 | ⏳ | **CellGroups binnen één module.** Quad-VCO met één poly-kabel (N=4), mixer met per-kanaal pan + gedeelde volume. Scaffolding bestaat al (`CellGroup`-type, `Port.cellGroupId`, `role:'multi'`, voorbeeld `mmbQuadVcoShared`). **aanvulling agent:** *Editor-kant deels af — `ModulePanel` tekent nu per-cel een gestippelde box met `cel/N`-label (`computeCellBoxes`, rekent per-glyph extents zodat de box rond de volledige jacks/knoppen valt i.p.v. erbinnen), en er is een tweede voorbeeld `mmbQuadMixerShared` (per-cel pan + gedeelde volume) dat het per-cel-controls-geval toont naast de shared-controls quad-VCO. Nog te bouwen: (a) cel-expansie in `polyExpand` (`kind:'cell'`-leden), (b) sim-routing voor multi-modules, (c) firmware-kant (FW-PM-4), (d) één vierkante poly-poort per celgroep i.p.v. N losse poorten (architectuur).* |

### 1.6 Persistentie & algemeen

| # | Prio | Status | Item |
|---|---|---|---|
| ED-GN-1 | 3 | ⏳ | **D1 — Centrale opslag:** REST-API (Node/Express) + SQLite op de Plesk-host; GET/PUT project-JSON per gebruiker; JWT-auth. |
| ED-GN-2 | 3 | ⏳ | **D2 — Gebruikersbeheer + sync.** Nodig voor externe Effect-switcher-tester. |
| ED-GN-3 | 2 | ✅ | **Rack-presets.** Nieuw preset-type (`RackPresetData`) bewaart één compleet rack incl. modules + voice-groups (zonder patches/kabels). Eigen tab in `PresetsModal`; laden (`addRackToProject`) voegt het rack met verse module-id's toe aan het project. |

### 1.7 Design-review fixes (UI/inspector — agent-batch)

| # | Prio | Status | Item |
|---|---|---|---|
| ED-RV-1 | 2 | ✅ | **Poly-kabel = centre-stripe i.p.v. stippel.** Poly-bus-kabels zelfde dikte als mono, met een dunne witte streep in de lengte (`BendableEdge` `data.poly`). |
| ED-RV-2 | 2 | ✅ | **MIDI-IN voices-display + steal grijzen.** `voicesDisp`-LED (`bindTo:'voiceCount'`); bij mono (`voiceCount≤1`) wordt `steal` inactief gemaakt via `disabledControlIds` in `ModulePanel`. |
| ED-RV-3 | 2 | ✅ | **Rack-inspector poorten/controls.** Per module klikbare **Poorten**- en **Controls**-lijsten met inline detail (signaal, richting, CV-formaat, event-kind, celgroep, bereik / knob-stap, switch-posities, display-binding). |
| ED-RV-4 | 2 | ✅ | **Per-poort vierkante poly-handle** in de patcher wanneer de poort echt poly is (`eventKind:'voice'` + `voiceCount>1`), anders rond. |
| ED-RV-5 | 2 | ✅ | **`Port.cvFormat`** (`analog`/`dcv12`/`dcv16`) + `CV_FORMAT_LABEL`; getoond in de rack-inspector en als patcher-tooltip-suffix. |
| ED-RV-6 | 3 | ⏳ | **VCO eigen tune-CV-ingang** (voor pitch-bend zonder de hoofd-V/Oct te moduleren). Ontwerp besproken, nog te bouwen. |

---

## 2. Firmware (brain-software)

### 2.1 Note-gedrag & polyfonie

| # | Prio | Status | Item |
|---|---|---|---|
| FW-1 | 1 | ⏳ | **Legato-gedrag** (mono): nieuwe noot bij nog-ingedrukte vorige → pitch-CV glijdt door zónder de envelope te hertriggeren (gate blijft hoog). Vereist note-stack + portamento-tijd. |
| FW-2 | 1 | ✅ | **Steal-strategie via config-push** instelbaar (Oldest/Lowest/Highest), gekoppeld aan de editor-control (ED-MI-3). `MidiInModule::setControl("steal", idx)` zet `VoiceAllocator::setStealStrategy`; index wordt geclamped op 0..2. Unit-test `midiin_steal_control_sets_strategy`. |
| FW-9 | — | ✅ | Mixer16 (`tp_mmb_mixer16`) + N=16. Zie release fw 0.5.7. |

### 2.2 Standaard interne poly-modules (naast voice-groups)

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- Er is al de **quad-osc**. Eigenlijk is ook een **octa-osc** logischer met
  poly 8, die qua performance al wel goed lijkt te werken.
- **Werkt de quad-osc eigenlijk al in de firmware?**
  > **aanvulling agent:** *Nee. De quad-VCO bestaat momenteel alléén als
  > editor-scaffolding (`mmbQuadVcoShared`, `CellGroup`-type, `role:'multi'`).
  > Er is géén firmware-module voor; de firmware kent alleen losse VCO/VCF/VCA.
  > Zie ook ED-CG-1 (CellGroups) — dat is de editor-kant van ditzelfde idee.*
- **Octa-VCF en octa-VCA** zijn dan een logisch vervolg. Het maakt niet echt
  verschil voor de hoeveelheid werk die de Teensy heeft (denk ik), en ook de
  patches moeten worden uitgepakt naar N virtuele kabels tussen alles, maar het
  configureert wat makkelijker. Het komt ook overeen met wat ik in hardware wil
  gaan maken: een hardware-eurorack-module met een dCV-connectie die wél losse
  CV in/uit heeft, maar slechts **1 set globale controllers**.

| # | Prio | Status | Item |
|---|---|---|---|
| FW-PM-1 | 2 | ⏳ | **Octa-osc VCO** — interne module met 8 detunable oscillatoren (`AudioSynthWaveform`); performance lijkt haalbaar bij poly 8. |
| FW-PM-2 | 2 | ⏳ | **Octa-VCF** — 8-voudige VCF-module, 1 set globale controllers, losse CV-in/uit per stem. |
| FW-PM-3 | 2 | ⏳ | **Octa-VCA** — 8-voudige VCA-module, idem. |
| FW-PM-4 | 2 | ⏳ | **aanvulling agent:** *Firmware-kant van CellGroups: één module-instance die intern N cellen draait en de patch-expand naar N virtuele kabels afhandelt (tegenhanger van ED-CG-1). Sluit aan op de hardware-dCV-module met 1 set globale controllers.* |

### 2.3 Audio-modules / geluidsbronnen

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- **Stereo VCA.**
- **Phaser en echo CV-ingangen.**
- **Comb-filter met CV-ingang** (om handmatig een phaser te maken) → indien niet
  bestaat, zelf bouwen. Ook een goed experiment om niet álles via de audio-lib
  te doen.
- **Meer VCO's:**
    - **FM**,
    - **wavetable**,
    - **draw waveshape** (zelf een golfvorm tekenen),
    - **fourier shaper** (analyseer een bestaand geluid met fourier-analyse en
      geef het verloop van de boventonen schematisch weer — ik denk dat de
      Fairlight ongeveer dat deed, o.a.) → een soort additieve synthese → heeft
      misschien de **FPGA-sidecar** nodig,
    - **string** (uit de audio-lib, ken ik niet, leuk om te wrappen),
    - **wat MI Elements ongeveer doet: physical modeling.** Wellicht ook te zwaar
      voor de Teensy, die toch geen DSP heeft? MI Elements gebruikt een ARM
      STM32 M7 meen ik.

| # | Prio | Status | Item |
|---|---|---|---|
| FW-AU-1 | 2 | ⏳ | **Stereo VCA.** |
| FW-AU-2 | 2 | ⏳ | **CV-ingangen op phaser en echo** (rate/depth/delaytime stuurbaar). |
| FW-AU-3 | 3 | ⏳ | **Comb-filter / resonator met CV-ingang** (handmatige phaser); zelf bouwen als de audio-lib het niet heeft — experiment buiten de audio-lib om. |
| FW-AU-4 | 2 | ⏳ | **FM-VCO** (`AudioSynthFM`). |
| FW-AU-5 | 2 | ⏳ | **Wavetable-VCO** (`AudioPlayMemory` / wavetable). |
| FW-AU-6 | 3 | ⏳ | **Draw-waveshape VCO** (zelf golfvorm tekenen in de editor → naar firmware). |
| FW-AU-7 | 3 | 🔬 | **Fourier-shaper VCO** — fourier-analyse van bestaand geluid, boventoon-verloop schematisch (Fairlight-achtig, additieve synthese); mogelijk FPGA-sidecar nodig. |
| FW-AU-8 | 3 | ⏳ | **String-VCO** — Karplus-Strong / string-object uit de audio-lib wrappen. |
| FW-AU-9 | 3 | 🔬 | **Physical-modeling-VCO** (MI-Elements-achtig); mogelijk te zwaar voor Teensy (geen DSP); MI Elements gebruikt ARM STM32 M7. |

### 2.4 Effecten

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- **Stereo echo met CV-aansturing.**
- **Compressor met lichte overdrive** (buizen-emulatie).
- **…** (lijst open).

| # | Prio | Status | Item |
|---|---|---|---|
| FW-FX-1 | 2 | ⏳ | **Stereo echo met CV-aansturing** (delaytime/feedback via CV, tap-tempo). |
| FW-FX-2 | 3 | ⏳ | **Compressor met lichte overdrive** (buizen-emulatie); basis `AudioEffectCompressor` + saturatie. |

### 2.5 Sequencer

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- De **sequencer ook bouwen in de firmware**.
- **Nadenken over hoe een sequencer poly werkt.**

| # | Prio | Status | Item |
|---|---|---|---|
| FW-SQ-1 | 2 | ⏳ | **Sequencer in firmware** (nu alleen editor/sim). |
| FW-SQ-2 | 2 | 🔬 | **Poly-sequencer-ontwerp** — hoe werkt een step-sequencer N-stemmig; integratie met PolyGroup-expand. |

---

## 3. Hardware — brain

| # | Prio | Status | Item |
|---|---|---|---|
| HB-1 | 2 | 🔬 | **Bus-keuze brain ↔ breakouts:** SPI vs CAN vs UTP. Voorlopige voorkeur SPI (snel, één bus); CAN/UTP als alternatief. CV is traag genoeg, latency moet wel strak. |
| HB-2 | 2 | 🔬 | **Reken-platform definitief:** Teensy 4.1 als audio/CV-brain vs RPi/sterker. Teensy bewezen voor N=8 audio; CV-matrix kan apart. |
| HB-3 | 1 | ✅ | **MCU-keuze:** ESP32-S3 **N32R16V** (32 MB flash, 16 MB OPI-PSRAM). Zie release-log. |
| HB-4 | 2 | 🔬 | **Poly CV-out DAC:** DAC8568 (16-bit, 8-kanaals, SPI) — evaluatie afronden, BOOST-eval. |

---

## 4. Hardware — modules

| # | Prio | Status | Item |
|---|---|---|---|
| HM-1 | 1 | ✅ | **Standalone MIDI IN/OUT** — discreet schema (6N138 + 2N3904), BOM bekend. Zie release-log. |
| HM-2 | 2 | ⏳ | **Analoge VCF** (CEM3320 of AS3320) + **VCA-breakout**; firmware-support als externe module-types. |
| HM-3 | 3 | ⏳ | **Analoge octa-osc** breakout (hardware-tegenhanger van FW-PM-1). |
| HM-4 | 2 | ⏳ | **CV-breakout-boards** (DAC8568-based) — meerdere CV/gate-uitgangen per board, via de brain-bus. Sluit aan op de dCV-module met losse CV-in/uit maar 1 set globale controllers (zie 2.2). |

---

## 5. Begripsverheldering (legato / last / voice-stealing)

Gevraagd door de gebruiker; vastgelegd zodat de items hierboven kloppen.

- **Mono** — elke noot zet nieuwe pitch-CV én hertriggert de envelope (nieuwe gate-puls). Eén stem.
- **Legato** — een nieuwe noot terwijl een vorige *nog ingedrukt* is: pitch-CV
  glijdt naar de nieuwe noot **zonder** de envelope te hertriggeren (gate blijft
  hoog). Typisch voor blazers/strijkers. **Status: nog NIET gebouwd** — het label
  staat op de Mode-switch, maar er is geen gedrag in editor-sim of firmware
  (zie ED-MI-2 / FW-1).
- **Last** — *monofone* note-priority: bij meerdere ingedrukte toetsen volgt de
  synth altijd de **laatst aangeslagen** noot (tegenover "low" = laagste of
  "high" = hoogste). Bij loslaten valt hij terug op de nog-ingedrukte noot die
  daarvóór klonk. Gaat dus alléén over mono met meerdere toetsen.
- **Voice-stealing** (polyfonie) — wélke klinkende stem wordt afgepakt als alle
  N stemmen bezet zijn en er een nieuwe noot komt. De firmware-`VoiceAllocator`
  kan al **Oldest / Lowest / Highest** (last-note priority bij release,
  oldest-steal als default), maar dit is in de editor **niet kiesbaar of
  doorpushbaar** (zie ED-MI-3 / FW-2).
