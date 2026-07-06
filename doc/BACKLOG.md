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
| ED-MI-2 | 1 | ✅ | **Legato echt implementeren.** Firmware-gedrag gebouwd (zie FW-1, iter-5.16): mono note-stack, gate blijft hoog op overlappende noot (geen envelope-retrigger), terugval op vorige noot bij note-off. De `legato`-control schakelt het en wordt grijs bij `voiceCount>1`. Editor-sim legato (Tone.js) staat nog open — apart op te pakken indien gewenst (firmware is leidend). |
| ED-MI-3 | 1 | ✅ | **Voice-stealing strategie kiesbaar.** De `steal`-control (old/low/hi) mapt 1-op-1 op firmware `StealStrategy {Oldest, Lowest, Highest}` en wordt via de config-push doorgegeven (`setControl("steal", index)`). Zie §5 en FW-2. |
| ED-MI-4 | 1 | ✅ | **B1 — Modulatie-CV-outputs uit MIDI-in:** extra poorten `cv_mod` (mod-wheel CC1), `cv_bend` (pitch-bend, V/Oct, bereik via `bendRange`-knop in halve tonen) en `cv_cc1`/`cv_cc2` (vrij kiesbare CC-nummers via `cc1Num`/`cc2Num`-knoppen). Firmware: `MidiInModule::onControlChange`/`onPitchBend` + `setControl` voor cc-nummers/bereik, USB-MIDI handlers in `main.cpp`. Editor: module verbreed naar 12 HP met NOTE- en MOD-secties. Sim negeert de mod-poorten (geen mod-bron in de sim). Unit-tests `midiin_modwheel_and_cc_outputs` + `midiin_pitchbend_output_scales_with_range`. |

### 1.5 Intra-module meervoudigheid (C — groter ontwerp, deels klaar)

| # | Prio | Status | Item |
|---|---|---|---|
| ED-CG-1 | 2 | ⏳ | **CellGroups binnen één module.** Quad-VCO met één poly-kabel (N=4), mixer met per-kanaal pan + gedeelde volume. Scaffolding bestaat al (`CellGroup`-type, `Port.cellGroupId`, `role:'multi'`, voorbeeld `mmbQuadVcoShared`). **aanvulling agent:** *Editor-kant deels af — `ModulePanel` tekent nu per-cel een gestippelde box met `cel/N`-label (`computeCellBoxes`, rekent per-glyph extents zodat de box rond de volledige jacks/knoppen valt i.p.v. erbinnen), en er is een tweede voorbeeld `mmbQuadMixerShared` (per-cel pan + gedeelde volume) dat het per-cel-controls-geval toont naast de shared-controls quad-VCO. Resterend werk staat nu als losse items ED-CG-2 t/m ED-CG-4 + FW-PM-4.* |
| ED-CG-2 | 2 | ✅ | **Cel-expansie in `polyExpand`.** ~~Vandaag flattent `polyExpand.ts` alleen poly-*groepen van losse modules*~~ **Gedaan (iter-5.16):** `polyExpand.ts` resolvet nu elk kabeleind via `resolve()` naar `global` / `module` (heel-module-master) / `cell` (master-celpoort) / `follower`. Een master-kabel naar een celgroep (`kind:'cell'`) waaiert uit naar de genummerde celpoorten (`voct_1..voct_N`, `out_1..out_N`) via `cellPortInfo` (strip `_<n>`-suffix, match tegen `cellGroup.portIds`) + `buildCellGroupMap` (keyed `${moduleId}:${cellGroupId}`). Alle vier de combinaties (global→cel, cel→global genummerd/sum, cel↔cel, cel↔module-groep) werken. **Visueel:** master-celpoorten renderen als vierkante poly-jacks met groep-kleur-ring en de multi-module krijgt een `⊞ ×N cellen`-badge (`cellPolyMap` in `PatcherGraphPanel`). |
| ED-CG-3 | 2 | ⏳ | **Sim-routing voor multi-modules.** De browser-sim (`sim/AudioEngine.ts`) bouwt per module-instance één audio-node. Een `role:'multi'`-module met N cellen heeft N onafhankelijke signaalpaden (N osc's, N mix-cellen…) en moet dus N interne sim-nodes krijgen met de genummerde celpoorten als in/uitgangen, zodat de quad-VCO/quad-mixer hoorbaar werkt in de sim (nu klinkt alleen cel 1, of niets). Hangt samen met ED-CG-2 (zelfde celpoort-nummering). |
| ED-CG-4 | 3 | ⏳ | **Eén vierkante poly-poort per celgroep** i.p.v. N losse ronde poorten in de patcher (architectuur). De N celpoorten worden dan één poly-bus-poort die intern naar `_1.._N` expandeert — sluit aan op ED-CG-2. |

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
| ED-RV-6 | 3 | ✅ | **VCO eigen tune-CV-ingang** (pitch-bend zonder de hoofd-V/Oct te overschrijven). `VcoModule` heeft nu een `tune`-CV-input die bij `voct` wordt opgeteld vóór de Hz-conversie (`recomputeHz()`, `voct_`+`tune_` apart bewaard); editor-VCO heeft een `tune`-poort; de poly-test-patch bedraadt MIDI-IN `cv_bend` → VCO `tune` (globaal → group fan-out, dus elke stem). Octa-osc/quad-osc krijgen dezelfde tune-ingang zodra ze bestaan (FW-PM-1). |
| ED-RV-7 | 2 | ✅ | **AHDSR retrigger-modus (filter-wah-fix).** Diagnose van „wah niet op elke noot”: bij round-robin voice-allocatie wordt een stem hergebruikt terwijl zijn (trage/lange) filter-envelope nog in Release op een hoge waarde staat. `Ahdsr::setGate` retriggert dan vanaf de *huidige* waarde (klik-onderdrukking: `phaseTicks_ = value_*attackTicks_`), dus de attack „vervolgt” hoog i.p.v. omhoog te vegen → geen hoorbare wah. **Gedaan (iter-5.16):** per-envelope `retrig`/`reset`-toggle (`Ahdsr::retrig_`, control-id `retrig`|`reset`). Aan = elke rising edge herstart attack vanaf 0 (consistente sweep, filter-wah); uit = huidig klikvrij gedrag (amp-env). Default uit; de filter-env (`envFlt`) in de poly-seed staat op aan. Editor: `Reset`-toggle op `mmbAhdsr()`. Core-tests `ahdsr_default_retrigger_continues_from_current_value` + `ahdsr_retrigger_mode_restarts_from_zero`. |
| ED-RV-8 | 2 | ✅ | **CC/pitch-bend serial-logging.** `handleControlChange`/`handlePitchChange` in `main.cpp` hadden geen `Serial.printf` (i.t.t. note-on/off), dus de gebruiker zag pitch-bend/mod-wheel/CC níét in de log — terwijl de hele keten (`onControlChange`/`onPitchBend` → `readCvPort` `cv_mod`/`cv_bend`/`cv_cc*` → `tickBridge` elke 1 ms) al bestond. Nu loggen ze `[midi] cc …` resp. `[midi] bend …`. **Let op:** bend/mod hebben pas hoorbaar effect als de patch `cv_bend`/`cv_mod` ook ergens naartoe routet (de poly-seed bedraadt `cv_bend → VCO tune`, ED-RV-6) én de Teensy opnieuw geflasht + de patch opnieuw geseed is. |
| ED-RV-9 | 3 | 🟡 | **Unison/spread + sim voice-allocatie (idee uit brondump #6).** Eén toets → N stemmen met detune-spread (unison) i.p.v. N losse noten; plus een volwaardige polyfone voice-allocatie in de browser-sim (nu speelt alleen de master-stem `in1`, zie SIM-LIMITATION). **Firmware-helft gedaan (iter-5.17):** `MidiInModule` heeft nu `unison_` + `spreadCents_`. Bij `unison` aan stuurt één toets álle stemmen (last-note via de mono note-stack: `onNoteOn` broadcast naar `[0..voiceCount)`, `onNoteOff` valt terug op de stack-top of laat alle gates zakken). `spread` (centen, 0..200) waaiert de stemmen symmetrisch uit rond het midden via `spreadOffsetV(v)` → V/Oct-detune op `voicePitchV`/`pitch`/`pitchK`. Editor: `Uni`-switch + `Sprd`-knop op `mmbMidiIn()` (rij y=66), grijs bij mono (`MIDIIN_MONO_DISABLED`). Core-tests `midiin_unison_drives_all_voices` + `midiin_unison_spread_detunes_symmetrically`. **Nog open:** de browser-sim poly voice-allocatie (echte poly-sim, hangt samen met ED-CG-3). |
| ED-RV-10 | 2 | ✅ | **Mod-wheel (CC) via de editor-MIDI-bridge.** De live bridge (`TeensyLinkModal`) forwardde alleen note-on/off + pitch-bend; control-change (mod-wheel = CC1) viel weg, dus `cv_mod` bewoog niet bij spelen via de editor. Toegevoegd: `sendMidiCC()` (`teensyLink.ts`), `cc`-tak in de bridge-subscribe, `{"type":"cc"}`-frame + `MidiCcHandler`/`onMidiCc_` in `TeensyLink.h`, en `onMidiCc()` in `main.cpp` → bestaande `handleControlChange()` (→ `cv_mod`/`cv_cc*`). `WebMidiSource` emitte de `cc`-events al. fw 0.5.14. |

---

## 2. Firmware (brain-software)

### 2.1 Note-gedrag & polyfonie

| # | Prio | Status | Item |
|---|---|---|---|
| FW-1 | 1 | ✅ | **Legato-gedrag** (mono): nieuwe noot bij nog-ingedrukte vorige → pitch-CV glijdt door zónder de envelope te hertriggeren (gate blijft hoog). **Gedaan (iter-5.16):** `MidiInModule` houdt bij mono+legato een note-stack bij (`monoStack_`, `monoPush`/`monoRemove`). Actief alleen wanneer `voiceCount()==1 && legato_` (`monoLegatoActive()`). Note-on terwijl een noot klinkt: gate blijft hoog (geen rising edge → envelopes hertriggeren niet), alleen `currentNote_[0]` (pitch) verandert. Note-off van de bovenste noot valt terug op de vorige stack-noot (gate hoog) tot de stack leeg is → gate laag. De `legato`-control schakelt dit (`setControl("legato")`, reset bij omschakelen). **Editor:** `legato`-control wordt grijs zodra `voiceCount>1` (`MIDIIN_POLY_DISABLED` in `PatcherGraphPanel`), spiegelbeeld van `steal` dat grijs wordt bij mono. Portamento-glide nog niet (apart, optioneel). Core-tests `midiin_mono_legato_holds_gate_and_falls_back` + `midiin_mono_legato_only_when_mono`. |
| FW-2 | 1 | ✅ | **Steal-strategie via config-push** instelbaar (Oldest/Lowest/Highest), gekoppeld aan de editor-control (ED-MI-3). `MidiInModule::setControl("steal", idx)` zet `VoiceAllocator::setStealStrategy`; index wordt geclamped op 0..2. Unit-test `midiin_steal_control_sets_strategy`. |
| FW-1b | 1 | ✅ | **Portamento / glide** (iter-5.17): echte pitch-glide bovenop legato. `MidiInModule` heeft nu een `tick()` (geen no-op meer; draait elke ~1 ms in de CV-loop, net als Lfo/Ahdsr) die per stem `pitchV_` met constante snelheid naar de doelnoot schuift. `glide`/`portamento`-control = tijd in **ms per octaaf** (0 = uit → directe sprong); werkt mono én poly. Eerste noot per stem snapt (geen sweep vanaf 0 bij power-up, `glidePrimed_`). `voicePitchV`/`pitch`/`pitchK` geven nu de geglede waarde. Editor: `Glide`-knop op `mmbMidiIn()` (rij y=66). Core-tests `midiin_glide_off_is_instant` + `midiin_glide_ramps_toward_target`. |
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
| FW-PM-1 | 2 | ✅ | **Octa-osc VCO** — interne module met 8 detunable oscillatoren (`AudioSynthWaveform`); performance lijkt haalbaar bij poly 8. Firmware `tp_mmb_octa_vco` (`OctaVcoModule.h`): 8 cellen die wave/coarse/fine/level + een symmetrische `detune` (cents-spreiding) delen; per-cel `voct_1..8` in + `out_1..8` audio uit; gedeelde `tune` V/Oct-offset. Editor-seed `mmbOctaVco()` (OCTA-VCO-S, 20 HP, multi-module met CellGroup count 8). fw 0.5.13. |
| FW-PM-2 | 2 | ✅ | **Octa-VCF** — firmware `tp_mmb_octa_vcf` (`OctaVcfModule.h`): 8× SVF met gedeelde cutoff/res/CV-diepte/type; per cel in_N/cv_N/out_N + gedeelde cv-ingang. Paneel OCTA-VCF-S (20HP, CellGroup). fw 0.5.39. |
| FW-PM-3 | 2 | ✅ | **Octa-VCA** — firmware `tp_mmb_octa_vca` (`OctaVcaModule.h`): 8× multiply-VCA, per cel in_N/cv_N/out_N, gedeelde level. Paneel OCTA-VCA-S (16HP, CellGroup). fw 0.5.39. |
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
| FW-AU-1 | 2 | ✅ | **Stereo VCA.** Firmware `tp_mmb_stereo_vca` (`StereoVcaModule.h`): één audio-in waaiert via een `AudioAmplifier` naar twee `AudioAmplifier`s (L/R). `vol`+`pan` als CV; equal-power pan-wet (`gainL=cos θ`, `gainR=sin θ`, `θ=(pan+1)·π/4`), pan-CV 0 = midden, −1 = links, +1 = rechts. Editor-seed `mmbStereoVca()` (ST-VCA, 6 HP). fw 0.5.15. |
| FW-AU-2 | 2 | ✅ | **CV-ingangen op phaser en echo** (rate/depth/delaytime stuurbaar). Echo `tp_mmb_echo` (`EchoModule.h`): `AudioEffectDelay`-feedbacklus (max 500 ms) met CV op `time` (sec), `feedback`, `mix`. Phaser `tp_mmb_phaser` (`PhaserModule.h`): custom 6-traps all-pass `AudioStream` met CV op `rate`/`depth`. Seeds `mmbEcho`/`mmbPhaser` uitgebreid met CV-poorten. fw 0.5.15. |
| FW-AU-3 | 3 | ✅ | **Comb-filter / resonator met CV-ingang.** Firmware `tp_mmb_comb` (`CombModule.h`): getunede `AudioEffectDelay`-feedbacklus (0.2–50 ms), V/Oct-CV stemt de toonhoogte (0V=C4), `coarse` semitone-offset, CV op `feedback`/`mix`. Hoge feedback → gestemde resonator. Editor-seed `mmbComb()` (COMB, 6 HP). fw 0.5.15. |
| FW-AU-4 | 2 | ✅ | **FM-VCO.** Firmware `tp_mmb_fm_vco` (`FmVcoModule.h`): wrapt `AudioSynthWaveformModulated`; audio-FM-in moduleert de carrier-frequentie, `fm_amt` = FM-diepte in octaven. Editor-seed `mmbFmVco()` (FM-VCO, 8 HP). fw 0.5.15. |
| FW-AU-5 | 2 | ✅ | **Wavetable-VCO.** Firmware `tp_mmb_wt_vco` (`WtVcoModule.h`): `AudioSynthWaveform` met `arbitraryWaveform`, 6 additief opgebouwde banks (saw/square/triangle/orgel/25%-pulse/vocaal-formant), `bank` selecteert. Editor-seed `mmbWtVco()` (WT-VCO, 8 HP). fw 0.5.15. |
| FW-AU-6 | 3 | ✅ | **Draw-waveshape VCO.** Firmware `tp_mmb_draw_vco` (`DrawVcoModule.h`): `AudioSynthWaveform` arbitrary-table; editor pusht een single-cycle tabel via het `wavetable`-serieframe (zie FW-LIVE-1), firmware resamplet naar 256 punten via RTTI-vrije `Module::setWaveformData()`. Editor-seed `mmbDrawVco()` (DRAW-VCO, 8 HP; teken-UI nog minimaal). fw 0.5.15. |
| FW-AU-7 | 3 | 🔬 | **Fourier-shaper VCO** — fourier-analyse van bestaand geluid, boventoon-verloop schematisch (Fairlight-achtig, additieve synthese); mogelijk FPGA-sidecar nodig. *Onderzoek: haalbaar op de Teensy zelf — de Audio-lib heeft `AudioAnalyzeFFT1024`/`FFT256`, `analyze_notefreq` en `analyze_tonedetect`. Een bestaand instrument-sample kan dus on-device op harmonische inhoud geanalyseerd worden.* |
| FW-AU-8 | 3 | ✅ | **String-VCO** — Karplus-Strong / string-object uit de audio-lib wrappen. Firmware `tp_mmb_string` (`StringModule.h`) wrapt `AudioSynthKarplusStrong` → `AudioAmplifier`; Gate rising-edge tokkelt op de V/Oct-pitch, `pluck` regelt de aanslag-helderheid, `level` de output. `pluck` en `level` ook als CV-ingang (fw 0.5.15). Editor-seed `mmbString()` (STRING, 6 HP). fw 0.5.13. |
| FW-AU-9 | 3 | 🔬 | **Physical-modeling-VCO** (MI-Elements-achtig); mogelijk te zwaar voor Teensy (geen DSP); MI Elements gebruikt ARM STM32 M7. *Onderzoek: Teensy 4.1 = Cortex-M7 @ 600 MHz mét FPU — krachtiger dan MI Elements' STM32F4 (M4 @ 168 MHz). Karplus-Strong (FW-AU-8) is al een simpel physical model; modale/Elements-achtige synthese is haalbaar voor een beperkt aantal stemmen. De M7 heeft de headroom die hier eerder als ontbrekend werd ingeschat.* |
| FW-LIVE-1 | 2 | ✅ | **Live control-sync.** Knob-/control-wijzigingen in de editor gaan via een `controlPoke`-serieframe (`{type,mod,ctrl,v}`) direct naar de Teensy zonder volledige config-push: `ProjectRuntime::pokeControl()` past de control live toe (via `setControl`) én persist't 'm in de actieve patch (`controlState`), zodat een latere volledige push een no-op is. Hot-path (geen ack). Ook nieuw: `wavetable`-frame + `ProjectRuntime::setWaveform()` voor FW-AU-6. Editor: `sendControlPoke()`/`sendWaveform()` in `teensyLink.ts`, gekoppeld aan beide `setControl`-paden in `PatcherGraphPanel.tsx`. fw 0.5.15. |

### 2.4 Effecten

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- **Stereo echo met CV-aansturing.**
- **Compressor met lichte overdrive** (buizen-emulatie).
- **…** (lijst open).

| # | Prio | Status | Item |
|---|---|---|---|
| FW-FX-1 | 2 | ⏳ | **Stereo echo met CV-aansturing** (delaytime/feedback via CV, tap-tempo). |
| FW-FX-2 | 3 | ✅ | **Compressor met lichte overdrive** (buizen-emulatie); basis `AudioEffectCompressor` + saturatie. *De stock Audio-lib heeft géén compressor*, dus firmware `tp_mmb_comp` (`CompDriveModule.h`) bevat een custom `AudioEffectCompDrive` AudioStream: feed-forward peak-compressor (threshold/ratio/attack/release/makeup) gevolgd door een tanh soft-clip overdrive (`drive`). CV-ingangen op `threshold` en `drive` (fw 0.5.15). Editor-seed `mmbComp()` (COMP, 6 HP). fw 0.5.13. |

### 2.5 Sequencer

Brondump gebruiker (idee), nagenoeg ongewijzigd overgenomen:

- De **sequencer ook bouwen in de firmware**.
- **Nadenken over hoe een sequencer poly werkt.**

| # | Prio | Status | Item |
|---|---|---|---|
| FW-SQ-1 | 2 | ✅ | **Sequencer in firmware** (nu alleen editor/sim). Core-`CvModule` `tp_mmb_seq8` (`Seq16.h`/`Seq16.cpp`, host-testbaar): 16 stappen semitone-offset, root/rate/gate/length/run-modi (Free/Off/Gate), interne 1 kHz-klok óf externe `clock`/`reset`-ingang, V/Oct-`cv` + `gate_out` + `trig` uit, `voct_in` transpose. 8 host-tests in `test_seq16.cpp`. Editor `mmbSeq8()` bestond al en matcht de port-/control-ids. fw 0.5.13. |
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

## 6. Panels & telemetrie (sessie 2026-07-06)

- **ED-P-1 — Panels los exporteren/importeren.** ↓ Exporteer pakt nu het hele
  project; gewenst: één paneel (ModuleType + visual) als los JSON-bestand
  exporteren/importeren, richting een `panels/`-bibliotheek. Panels zijn
  logisch 1→* t.o.v. ModuleType (zie doc/architecture/mmb-moduletype-panel.puml).
- **ED-P-2 — VU/clip-meter op het OUT-paneel.** outPeak staat al in de strip
  (met CLIP-indicatie ≥0.999); een echte meter op het paneel zelf vraagt
  live telemetrie-doorvoer naar de panel-renderer. Meenemen in de
  UI-designsessie (kabels/knoppen-bedienbaarheid).
- **ED-P-3 — `minFirmwareVersion` op Panel.** Waarschuwing bij verbinden als
  het paneel meer belooft dan de aangesloten firmware levert (koppelt aan de
  contract-keten en de fw-X.Y.Z-tags).
