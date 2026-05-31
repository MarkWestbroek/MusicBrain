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
| ED-PT-3 | — | ✅ | Patcher **Compact**-knop (vult het gat vóór de mixer na groep-inklapping). |

### 1.3 Simulatie

| # | Prio | Status | Item |
|---|---|---|---|
| ED-SM-1 | 3 | 🔬 | **A4 — Latency toets→geluid.** WebAudio look-ahead ~50-100 ms; onderzoek lagere `Tone.context.lookAhead` + directe `triggerAttack`. |

### 1.4 MIDI-in & note-gedrag

| # | Prio | Status | Item |
|---|---|---|---|
| ED-MI-1 | 1 | ⏳ | **Mode-switch opschonen.** De `mode`-switch toont `mono/legato/last`, maar `seedPolyVoicePatch` (her)gebruikt index 1 als "poly". Dit is dubbelzinnig: splits in een **Voicing**-keuze (mono/poly) én een aparte **note-priority/legato**-keuze. |
| ED-MI-2 | 1 | ⏳ | **Legato echt implementeren.** Zie §5 — nu is het alleen een label, geen gedrag (editor-sim noch firmware). |
| ED-MI-3 | 1 | ⏳ | **Voice-stealing strategie kiesbaar maken.** De firmware heeft `StealStrategy {Oldest, Lowest, Highest}` (`VoiceAllocator`), maar de editor kan die niet instellen of doorpushen. Voeg een control toe + neem op in de config-push. Zie §5. |
| ED-MI-4 | 1 | ⏳ | **B1 — Modulatie-CV-outputs uit MIDI-in:** mod-wheel, pitch-bend en 2 vrij instelbare CC-nummers (CC-picker). Extra poorten `cv_mod`, `cv_pitch`, `cv_cc1`, `cv_cc2` (firmware + editor + sim). |
| ED-MI-5 | 2 | ⏳ | **MIDI-POLY module** (`cv1..cv4` + `gate1..gate4`) als poly-bron i.p.v. de SEQ poly te maken; de SEQ blijft mono. |

### 1.5 Intra-module meervoudigheid (C — groter ontwerp, deels klaar)

| # | Prio | Status | Item |
|---|---|---|---|
| ED-CG-1 | 2 | ⏳ | **CellGroups binnen één module.** Quad-VCO met één poly-kabel (N=4), mixer met per-kanaal pan + gedeelde volume. Scaffolding bestaat al (`CellGroup`-type, `Port.cellGroupId`, `role:'multi'`, voorbeeld `mmbQuadVcoShared`). Nog te bouwen: (a) cel-expansie in `polyExpand`, (b) paneel-inzoom-rendering van cellen, (c) firmware-kant. |

### 1.6 Persistentie & algemeen

| # | Prio | Status | Item |
|---|---|---|---|
| ED-GN-1 | 3 | ⏳ | **D1 — Centrale opslag:** REST-API (Node/Express) + SQLite op de Plesk-host; GET/PUT project-JSON per gebruiker; JWT-auth. |
| ED-GN-2 | 3 | ⏳ | **D2 — Gebruikersbeheer + sync.** Nodig voor externe Effect-switcher-tester. |

---

## 2. Firmware (brain-software)

| # | Prio | Status | Item |
|---|---|---|---|
| FW-1 | 1 | ⏳ | **Legato-gedrag** (mono): nieuwe noot bij nog-ingedrukte vorige → pitch-CV glijdt door zónder de envelope te hertriggeren (gate blijft hoog). Vereist note-stack + portamento-tijd. |
| FW-2 | 1 | ⏳ | **Steal-strategie via config-push** instelbaar maken (Oldest/Lowest/Highest) en koppelen aan de editor-control (ED-MI-3). |
| FW-3 | 2 | ⏳ | **Octa-osc VCO** — interne module met 8 detunable oscillatoren (uni-saw, sync, ring-mod) op `AudioSynthWaveform`. |
| FW-4 | 2 | ⏳ | **FM / wavetable / string VCO** — `AudioSynthFM`, `AudioPlayMemory` (wavetable), Karplus-Strong (string). |
| FW-5 | 2 | ⏳ | **Stereo-effecten met CV** — echo met CV-gestuurde delaytime (tap-tempo), flanger, chorus, ensemble met stuurbare rate/depth. |
| FW-6 | 3 | ⏳ | **Compressor / limiter** — `AudioEffectCompressor`. |
| FW-7 | 3 | ⏳ | **Comb-filter / resonator** — Karplus-Strong of `AudioEffectDelay`. |
| FW-8 | 3 | ⏳ | **Poly-sequencer** — N-stemmige step-sequencer die met PolyGroup-expand integreert. |
| FW-9 | — | ✅ | Mixer16 (`tp_mmb_mixer16`) + N=16. Zie release fw 0.5.7. |

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
| HM-3 | 3 | ⏳ | **Analoge octa-osc** breakout (hardware-tegenhanger van FW-3). |
| HM-4 | 2 | ⏳ | **CV-breakout-boards** (DAC8568-based) — meerdere CV/gate-uitgangen per board, via de brain-bus. |

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
