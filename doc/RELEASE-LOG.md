# MusicBrain — Release log

> Chronologisch overzicht van opgeleverde wijzigingen (nieuwste boven).
> Forward-looking werk staat in [BACKLOG.md](BACKLOG.md).
> De volledige, ongekuiste dev-notities van vóór deze splitsing staan in
> `Requirements.backup-2026-05-31.md`. De hoofd-`Requirements.md` blijft het
> requirements/ontwerp-document.

---

## Firmware

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
| iter-5.11 | 2026-05-31 | **Poly-UX (B3/B4/B5)** — Rack-rechtsklik "Maak poly-voicegroup ×N…" (dupliceert module N-1× in lagere rijen + bundelt tot PolyGroup); ingeklapte poly-weergave in Rack (master toont `label ×N`, followers verborgen, badge/context-menu om in/uit te klappen); Patcher poly- vs single-poort indicatie (poly-poort = vierkant + groep-gekleurde ring). |
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
