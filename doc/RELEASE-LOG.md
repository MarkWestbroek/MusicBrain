# MusicBrain — Release log

> Chronologisch overzicht van opgeleverde wijzigingen (nieuwste boven).
> Forward-looking werk staat in [BACKLOG.md](BACKLOG.md).
> De volledige, ongekuiste dev-notities van vóór deze splitsing staan in
> `Requirements.backup-2026-05-31.md`. De hoofd-`Requirements.md` blijft het
> requirements/ontwerp-document.

---

## Firmware

### fw 0.5.10 — AHDSR retrigger + mono-legato + CC/bend-logging (2026-05-31)
- **AHDSR retrigger-modus (ED-RV-7, filter-wah-fix).** `Ahdsr` krijgt een
  `retrig_`-vlag (control-id `retrig`|`reset`). Aan = elke rising edge herstart
  de attack hard vanaf 0 (`phase_=Attack; phaseTicks_=0; value_=0`), zodat de
  filter-sweep op élke noot identiek is (consistente wah). Uit (default) =
  bestaande klik-onderdrukking (`phaseTicks_=value_*attackTicks_`), goed voor
  een amp-env. Lost „wah niet op elke noot” op: round-robin hergebruikte een
  stem waarvan de trage filter-env nog hoog in Release stond, en de
  klik-onderdrukking vervolgde dan hoog i.p.v. omhoog te vegen.
- **Mono-legato (FW-1 / ED-MI-2).** `MidiInModule` houdt bij mono+legato een
  note-stack bij (`monoStack_`, `monoPush`/`monoRemove`); actief alleen wanneer
  `voiceCount()==1 && legato_`. Overlappende note-on houdt de gate hoog (geen
  envelope-retrigger), verandert alleen de pitch; note-off valt terug op de
  vorige stack-noot tot de stack leeg is → dan pas gate laag. `setControl("legato")`
  schakelt het en reset de held notes bij omschakelen.
- **CC/pitch-bend serial-logging (ED-RV-8).** `handleControlChange`/
  `handlePitchChange` in `main.cpp` loggen nu `[midi] cc …` resp. `[midi] bend …`
  (waren stil; de keten zelf bestond al). Bend/mod hebben pas geluid als de
  patch `cv_bend`/`cv_mod` ook routet (poly-seed: `cv_bend → VCO tune`) én er
  opnieuw geflasht + geseed is.
- Core-tests `ahdsr_default_retrigger_continues_from_current_value`,
  `ahdsr_retrigger_mode_restarts_from_zero`,
  `midiin_mono_legato_holds_gate_and_falls_back`,
  `midiin_mono_legato_only_when_mono` (95 core-tests, 0 failed).
  `FwVersion.h` → `0.5.10`.

### fw 0.5.9 — MIDI-in modulatie-outputs (ED-MI-4) (2026-05-31)
- **`MidiInModule`** krijgt vier globale modulatie-CV's: `cv_mod` (mod-wheel
  CC1), `cv_bend` (pitch-bend in V/Oct, ±`bendRange` halve tonen), `cv_cc1`/
  `cv_cc2` (vrij kiesbare CC-nummers via `cc1Num`/`cc2Num`, defaults 74/71).
  Nieuwe sinks `onControlChange()` + `onPitchBend()`; `setControl` accepteert
  `cc1Num`/`cc2Num`/`bendRange`. `outputPortKind` declareert de poorten als Cv.
- **`main.cpp`** wiret `usbMIDI.setHandleControlChange`/`setHandlePitchChange`
  door naar elke runtime-`MidiInModule`.
- Unit-tests `midiin_modwheel_and_cc_outputs` + `midiin_pitchbend_output_scales_with_range`
  (91 core-tests, 0 failed). `FwVersion.h` → `0.5.9`.

### fw 0.5.8 — MIDI-in voice-stealing via config-push (2026-05-31)
- **`MidiInModule::setControl`** accepteert nu `"steal"` (0=oldest/1=lowest/
  2=highest) en zet daarmee `VoiceAllocator::setStealStrategy`; de index wordt
  geclamped op 0..2. `"priority"` en `"legato"` worden geaccepteerd maar nog
  niet uitgevoerd (FW-1). Nieuwe accessor `stealStrategy()` + unit-test
  `midiin_steal_control_sets_strategy` (89 core-tests, 0 failed).
- `FwVersion.h` → `0.5.8`. Sluit ED-MI-1/ED-MI-3 + FW-2.

### fw 0.5.7 — Mixer16 + 16-stemmige stress-test + UX (2026-05-31)
- **`Mixer16Module.h`** — 16-kanaals stereo mixer (`tp_mmb_mixer16`). Vier
  `AudioMixer4`-banken per stereo-kant (A=ch0-3, B=ch4-7, C=ch8-11,
  D=ch12-15) + een finale `AudioMixer4` als sub-mix. Equal-power pan.
- Geregistreerd in `RegisterAllModules.h`; `FwVersion.h` → `0.5.7`.
- Editor: `mmbMixer16()` (24 HP, 4 kolommen van 4), `seedPolyVoicePatch`
  ondersteunt nu N=16, sim-node voor mixer16, poly-dropdown `16-stemmig`.
- Editor UX: test-patch dropdowns (aantal noten 1-16, startnoot C-3..C4,
  tempo 30-240 bpm); poly-aware **Compact**-knop in Rack én Patcher;
  grid-layout in `seedPolyVoicePatch` (master op rij 0, followers in
  rij 1..N-1); MIDI-in Mode-switch leesbaarder (fontSize 1.1 → 1.6).

### fw 0.5.6 — Poly voice-patch + Mixer8 + CvMath (sessie jun 2026)
- `Mixer8Module.h` (8-kanaals stereo mixer), `seedPolyVoicePatch(1/2/4/8)`,
  Poly-dropdown, CvMath-node (velocity × envelope) in de sim.
- Voice-stealing bevestigd werkend op de Teensy bij N=8 (9e noot steelt
  correct). Zie `VoiceAllocator` (last-note priority, oldest-steal, ADR 0011).

### Firmware-kern (eerder)
- `VoiceAllocator` — N-stemmig, `StealStrategy` {Oldest, Lowest, Highest},
  last-note priority, drie-staten lifecycle (idle/held/releasing), ADR 0011.
- `MatrixRouter` — MIDI → voice-alloc → GateSet/CvSet, brief gate-off bij steal.
- Audio-modules: VCO, VCF, VCA, Mixer (4/8/16), Out. CvGraph/AudioGraph split.
- `TeensyLink` config-push, static 4-voice fallback-graph.

---

## Editor (Modular Music Brain)

> Volledige detail-notities per iteratie staan in de backup. Hieronder een
> beknopte samenvatting per release.

| Release | Datum | Kern |
|---|---|---|
| iter-5.16 | 2026-05-31 | **Cel-expansie (ED-CG-2) + AHDSR-reset + legato-grijzen.** (1) `polyExpand.ts` flattent nu óók poly-groepen waarvan de leden *cellen* zijn (`kind:'cell'` op een `role:'multi'`-module): elk kabeleind wordt via `resolve()` herkend als `global`/`module`/`cell`/`follower`, en een master-celkabel waaiert uit naar de genummerde celpoorten (`voct_1..voct_N`, `out_1..out_N`) via `cellPortInfo` + `buildCellGroupMap`. Alle combinaties (global→cel, cel→global genummerd/sum, cel↔cel, cel↔module-groep) werken end-to-end naar de firmware. (2) **Visueel:** master-celpoorten renderen als vierkante poly-jacks met groep-kleur-ring, en de multi-module krijgt een `⊞ ×N cellen`-badge (`cellPolyMap` in `PatcherGraphPanel`). (3) AHDSR `Reset`-toggle op `mmbAhdsr()`; de filter-env in de poly-seed staat op `retrig:true` (consistente wah). (4) MIDI-IN `legato`-control wordt grijs zodra `voiceCount>1` (`MIDIIN_POLY_DISABLED`), spiegelbeeld van `steal` dat grijs wordt bij mono. Firmware-kant in fw 0.5.10. |
| iter-5.15 | 2026-05-31 | **MIDI-in/poly-kabel UI-fixes + rack-presets.** (1) Poly-bus-kabels: zelfde dikte als mono-kabels, met een dunne witte streep *in de lengte* (centre-stripe in `BendableEdge`, `data.poly`) i.p.v. een stippellijn — leest als een speciaal kabeltype. (2) `KnobControl.step` toegevoegd: knoppen met `step:1` (Ch, CC1#, CC2#, Bend) klikken naar gehele getallen, zowel bij slepen als in het Properties-paneel (geen `68,35…` meer). (3) MIDI-IN verbreed 12→14 HP en heringedeeld: CC1#/CC2# hebben nu elk een LED-display dat het gekozen CC-nummer toont; de 7 uitgangen staan in twee groepen (NOTE links: pitch/gate/vel · MOD rechts: mod/bend/cc1/cc2) binnen de paneelmarges i.p.v. over de rand. Bestaande patches houden hun oude MIDI-IN-visual tot ze opnieuw geseed worden. (4) CellGroup-box tekent nu rond de *volledige* cel-glyphs (`computeCellBoxes` rekent per-glyph extents met `JACK_R`/`KNOB_R` i.p.v. alleen centers), zodat de box niet meer binnen de jacks/knoppen valt. (5) MIDI-IN toont een **Voices**-LED-display (`bindTo:'voiceCount'`); bij mono (`voiceCount≤1`) wordt `steal` grijs/inactief gemaakt (`disabledControlIds` in `ModulePanel`). (6) Rack-inspector toont per module klikbare **Poorten**- en **Controls**-lijsten met inline detail (signaal, richting, CV-formaat, event-kind, celgroep, bereik / knob-stap, switch-posities, display-binding). (7) Patcher-poorten: per-poort vierkante poly-handle wanneer de poort echt poly is (`eventKind:'voice'` + `voiceCount>1`), anders rond. (8) `Port.cvFormat` (`analog`/`dcv12`/`dcv16`) toegevoegd met `CV_FORMAT_LABEL`; getoond in de rack-inspector en als tooltip-suffix in de patcher. (9) **Rack-presets**: nieuw preset-type (`RackPresetData` + `saveRackPreset`/`addRackToProject`) dat één rack incl. modules en voice-groups bewaart (zonder patches); eigen tab in `PresetsModal` met opslaan/laden/hernoemen/verwijderen. Laden voegt het rack met verse module-id's toe. (10) **VCO tune-ingang** (pitch-bend optie 2): `VcoModule` krijgt een aparte `tune`-CV-input die bij de hoofd-`voct` wordt opgeteld vóór de Hz-conversie (`recomputeHz`, `voct_`/`tune_` apart) zodat pitch-bend de noot-V/Oct niet overschrijft; editor-VCO heeft een `tune`-poort; de poly-test-patch bedraadt MIDI-IN `cv_bend` → VCO `tune`. *Firmware-versiebump volgt bij de eerstvolgende Teensy-build (host-core-tests raken `VcoModule` niet).* |
| iter-5.14 | 2026-05-31 | **CellGroups editor-rendering (ED-CG-1, deels)** — `ModulePanel` tekent nu per cel van een `role:'multi'`-module een gestippelde, gekleurde box met een `cel/N`-label (`computeCellBoxes`, afgeleid van `cellGroups`); niet-multi modules renderen ongewijzigd. Tweede voorbeeldmodule `mmbQuadMixerShared` (12 HP): 4 mix-cellen met elk een eigen audio-in + PAN-knop (per-cel control) maar één gedeelde VOLUME (shared control) → stereo-out. Demonstreert het per-cel-controls-geval naast de shared-controls quad-VCO. Nog open: cel-expansie in `polyExpand`, sim-routing en firmware-kant. |
| iter-5.13 | 2026-05-31 | **MIDI-in modulatie-outputs (ED-MI-4)** — module verbreed naar 12 HP met een NOTE-sectie (pitch/gate/vel, per stem) en een MOD-sectie (Mod = mod-wheel, Bend = pitch-bend in V/Oct, CC1/CC2 = vrij kiesbare CC's). Nieuwe controls `cc1Num`/`cc2Num` (CC-pickers, defaults 74/71) en `bendRange` (halve tonen). Firmware-kant in fw 0.5.9. De sim negeert de mod-poorten (geen mod-bron in de test-sequence). |
| iter-5.12 | 2026-05-31 | **MIDI-in opgeschoond (ED-MI-1/3)** — de dubbelzinnige `mode`-switch (`mono/legato/last`, met index 1 stiekem als "poly") vervangen door drie heldere controls: `priority` (last/low/high), `steal` (old/low/hi) en `legato` (off/on). Voicing volgt nu automatisch uit `voiceCount`; het `mode`-overload in `seedPolyVoicePatch` is weg. `steal` mapt 1-op-1 op firmware `StealStrategy` en gaat mee in de config-push (zie fw 0.5.8). Sim negeert deze controls (geen regressie). |
| iter-5.11 | 2026-05-31 | **Poly-UX (B3/B4/B5)** — Rack-rechtsklik "Maak poly-voicegroup ×N…" (dupliceert module N-1× in lagere rijen + bundelt tot PolyGroup); ingeklapte poly-weergave in Rack (master toont `label ×N`, followers verborgen, badge/context-menu om in/uit te klappen); Patcher poly- vs single-poort indicatie (poly-poort = klein vierkant + dunne groep-gekleurde ring). Poly-kabels/poorten/labels verfijnd: dunner (stroke 3.2 i.p.v. 5-7), kleinere labels (fontSize 9). Patcher-**Compact**-knop verwijderd (muteerde het rack — verwarrend); layout-compactie nu alleen in het Rack-scherm. |
| iter-5.10 | jun 2026 | **Presets** — patch- en module-presets (localStorage + JSON export/import), factory-presets, `PresetsModal`. |
| iter-5.9 | 2026-06-12 | SEQ Run 3-stand, MIDI-passthrough, selectie-fix, Length-stepper. |
| iter-5.8 | 2026-06-04 | Kabel-polish, properties-paneel (C1), rack-keyboardnav, SEQ-routing/trig (B1/B2/B3). |
| iter-5.7 | 2026 | Multi-bend kabels, undo/redo, SEQ-16 UI-polish. |
| iter-5.6 | 2026 | Bugfixes na 5.5. |
| iter-5.5 | 2026 | Effects (Noise/Phaser/Echo), 16-step SEQ (B4), step-LED's (B5), edge-buiger (A2), rack-drag (A1), live params (A5). |
| iter-5.2 | 2025 | Patcher UX, sequencer-stop, MIDI-In breakout. |
| iter-5.1 | 2026 | Patcher/Sim UX-feedback. |
| iter-5 | 2026 | Connection-following AudioEngine + standaard MMB-modules + Test-patch. |
| v0.3 iter-4 | 2026-05 | Audio-engine + MIDI-bronnen + duidelijker in/out. |
| v0.3 iter-3 | 2026-05 | Multi-rack patches, slider-bug, kabelvorm. |
| v0.3 iter-2 | 2026-05 | Internal-rack UI + CV-range editor. |
| v0.4 | 2026-05-19 | Drie-laags model (Category/Type/Module) + Rack + SVG-panelen. |
| v0.3 | 2026-05-19 | Categorieën uitbreidbaar, interne modules, sequencer-in-brain, simulatie-strategie. |
| v0.3 | 2026-05-18 | JSON export/import + project-metadata. |
| v0.2 | 2026-05-18 | Graph view, cable-types, MVC param-widget. |
| v0.1 | 2026-05-18 | Skeleton. |

---

## Hardware (onderzoek & beslissingen)

- **MIDI IN/OUT** — discreet ontwerp (6N138 opto, 2N3904 driver) vervangt de
  SparkFun-breakout. Schema `Images/schematics/midi-standalone.kicad_sch`. BOM bekend.
- **Brain-MCU** — ESP32-S3 **N32R16V** gekozen boven N16R8 (32 MB flash, 16 MB
  OPI-PSRAM, ~2× bandbreedte) voor de poly-synth CV-matrix.
- **Poly CV-out** — DAC8568 (16-bit, 8-kanaals, SPI) in evaluatie.
