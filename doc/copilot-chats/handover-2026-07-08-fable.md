# Handover — MusicBrain modulebouw (voor een nieuwe Fable-chat)

**Datum:** 8 juli 2026 · **Model:** door Fable uitvoeren (dit is de reden voor de handover).
**Repo:** `d:\Git\Muziek\MusicBrain` · **Doel:** doorgaan met het porten/bouwen
van synth-modules voor de Teensy-firmware + editor, in dezelfde stijl.

Lees eerst je **auto-memory** (`MEMORY.md` + de gelinkte files, met name
`mi-port-recept.md` en `contract-keten.md`) — daar staat het gecomprimeerde
recept en de valkuilen. Dit document is de actuele *werkbon*.

---

## 1. Waar we staan (exacte git-staat)

- **HEAD:** `e9104c4` "DX7 voice-picker (dropdown op naam) + live OUT-VU op het paneel".
- **Firmware-versie in `FwVersion.h`:** `0.5.42` (op de Teensy staat 0.5.42).
- **Laatste getagde versies:** `fw-0.5.38` t/m `fw-0.5.42` (0.5.40 tag ontbreekt,
  onbelangrijk). Tag ná elke geflashte versie: `git tag fw-0.5.XX`.
- **Modulearsenaal:** 42 types. Geporte MI-DSP: Elements, Rings, Plaits, Clouds,
  Tides, Marbles, Warps, Stages, Peaks. Eigen: Morph-WT (v2, mip-levels), DX7
  (msfa/Dexed-kern), Octa-VCO/VCF/VCA, en het hele MMB-basisarsenaal.

### ⚠️ Twee dingen die meteen aandacht vragen

1. **`firmware/app-modular-brain/src/ResonatorModule.h` staat op schijf maar is
   NIET gewired** (untracked, ~9.3 KB). Het is de sympathetic-resonator-bank
   (FW-FX-6, `tp_mmb_resonator`) die ik net schreef. De registratie + versbump
   werden onderbroken door de model-switch. **Eerste taak:** deze afmaken (zie §4).

2. **Er lopen parallelle sessies** (hardware + KiCad, en eerder een
   editor-design-sessie). Er staan **14 door hen gewijzigde bestanden
   uncommitted** in de working tree. **Raak ze niet aan, commit ze niet.**
   Het zijn o.a.:
   `ControlSurfacePanel.tsx`, `surfaceBridge.ts`, `teensyLink.ts`, `types.ts`,
   `polyExpand.ts`, `MidiMap.h`, `ProjectRuntime.h`, `main.cpp`,
   `doc/adr/*`, `doc/plans/control-surface.md`, een `.kicad_pcb`, en
   `.pio/libdeps/.../integrity.dat`.
   **Commit ALTIJD met expliciete `git add <mijn bestanden>`, nooit `git add -A`
   of `git commit -a`.** (Ik heb dat één keer fout gedaan en moest terugdraaien.)

---

## 2. De kritieke workflow-regels (hard geleerd)

- **Flashen = `scratchpad/flash_verify.py <versie>`.** De teensy-gui-uploader
  meldt "SUCCESS" óók als de soft-reboot faalt (open seriële poort). Dit script
  uploadt en pollt dan agressief `hello` tot de doelversie bevestigd is — het wint
  de race van de auto-reconnectende editor. Draai daarna de test.
  Python: `C:/Users/User/.platformio/penv/Scripts/python.exe`.
  PlatformIO: `C:/Users/User/.platformio/penv/Scripts/platformio.exe`.
  Build vanuit `firmware/app-modular-brain/`.
- **COM4 kan bezet zijn** (editor of ander venster). Bij `PermissionError`/
  `FileNotFoundError`: gebruik een wachter-loop (voorbeelden in `scratchpad/`,
  bv. `wait_warps.sh`) die pollt tot de poort vrij is en dan test. Bij
  autonoom werk: start de wachter in de achtergrond.
- **Contract-keten:** na élke firmware-wijziging aan poorten/controls:
  1. `python tools/contract_dump.py` (firmware → `contract/module-types.json`).
  2. In `editor/`: `npx vitest run src/modular-mb/contract.test.ts` — moet groen.
  3. Genummerde cel-poorten/controls (zoals `voct_1..8`, `t1..t6`) die de
     tekst-parser niet ziet: voeg een `OVERRIDES`-regel toe in
     `tools/contract_dump.py`.
- **Elke gevendorde MI-DSP-lib** krijgt een regel in
  `firmware/app-modular-brain/teensy41_mmb.ld`:
  `*libmi-X.a:(.text* .rodata*)` (in de `.text.mmbdsp`-sectie → QSPI-flash),
  anders vult het RAM1. **Eigen module-headers** (zoals ResonatorModule.h) hoeven
  dat NIET — die zitten in `main.cpp.o`, en dat object staat al via de ldscript
  in flash (`*main.cpp.o(.text* .rodata*)`). Dus voor een zelf-gemodelleerde
  module: alleen registreren, geen ldscript-regel.
- **Editor typecheck:** `npx tsc --noEmit` in `editor/` (negeer bestaande
  `Ladder.ts`-warning). Panels/seeds toevoegen: zie `seedModules.ts`.
- **`seedInternals` is een upgrade-pad:** het vervangt bestaande interne types
  in-place. Na een paneel-wijziging: in de editor op **✨ Internals** klikken
  laat het nieuwe front verschijnen (posities/controlState blijven).
- **`controlPoke` op de draad = `{"mod","ctrl","v"}`** (niet moduleId/…).
  **LFO `run`** is een enum: 0=Always, 1=Gated, 2=OneShot (niet `true`!).
  **`outPeak`** is max-sinds-poll → trage LFO's meten met een LFO véél trager
  dan het ~1,5 s pollvenster.

---

## 3. Architectuur in het kort

- **Module-types** wonen in de firmware als headers `src/XxxModule.h`, elk met
  `kTypeId`, port-`Kind`-dispatch (`inputPortKind`/`outputPortKind`),
  `writeCvPort`/`readCvPort`, `setControl`, en `registerFactory()`. Registratie
  in `src/RegisterAllModules.h`.
- **Audio-modules** erven van `AudioModule` en wrappen een `AudioStream`
  (44.1 kHz; resample als de DSP op een andere rate rekent — Clouds 32k, Peaks
  48k). **CV-modules** erven van `CvModule` en implementeren `tick()` (1 kHz).
- **De editor** spiegelt elk type in `editor/src/modular-mb/seedModules.ts`
  als een `mmbXxx()`-paneel (ports/controls/visual). De poort- en control-ids
  moeten 1:1 met de firmware matchen — dat bewaakt de contract-test.
- **Zelfspelende seeds** staan in het "🎹 Solo ▾"-menu in `ModularMbApp.tsx`
  (Generative jam, Warps vocoder, 808 jam, Krell). Poly-seeds in "Poly ▾".
- **Telemetrie:** `main.cpp` → `onGetStatus` vult per-module velden
  (`xxxReady`/`xxxPeak`), plus generiek `outPeak` (master-VU). Editor toont ze
  in `TeensyStatusBar.tsx` en (OUT-VU) in `ModulePanel.tsx`.
- **Bewaar per versie de elf** in `scratchpad/firmware-0.5.XX.elf` voor
  addr2line bij crashes (`arm-none-eabi-addr2line` in de toolchain-bin).

---

## 4. De werkbon (gewenste volgorde, door de user bekrachtigd)

De user vindt alle ideeën goed. Volgorde: **1 → 2 → dan de rest in willekeurige
volgorde** ("doe ze op zich allemaal gewoon"). Committen met versies, elk
onderdeel mag uiteindelijk afvallen. Hardware testen via flash_verify.

### 0. AFMAKEN: sympathetic-resonator-bank (in progress)
`ResonatorModule.h` staat al op schijf (`tp_mmb_resonator`, FW-FX-6). Doen:
- `RegisterAllModules.h`: include + `ResonatorModule::registerFactory();`
  (na de PeaksModule-regel).
- `FwVersion.h`: bump naar `0.5.43`.
- Build; **geen** ldscript-regel nodig (eigen header → main.cpp.o → al in flash).
- Paneel `mmbResonator()` in `seedModules.ts` + in de `seedInternals`-lijst.
  Controls: `root` (semi), `scale` (0..4: Chrom/Maj/Min/5th-Oct/Harm),
  `structure` (0..1), `decay` (0..1), `damping` (0..1), `mix` (0..1),
  `level` (0..1). Ports: in `in` (audio), `voct` (cv), `struct_cv` (cv),
  out `out` + `mix` (beide audio; wrapper geeft dezelfde stream — koppel
  het paneel op `out`). Categorie: `effect`.
- `contract_dump.py` + vitest groen. Flash-verify 0.5.43 + test (excite met
  een VCO/Plaits-pluk, hoor de bank naklinken; `outPeak` beweegt na de aanslag).
- Leuke seed-optie: Plaits/String pluk → Resonator (scale majeur) → OUT; of
  Marbles-geklokte plukjes de bank in.
- Commit (alleen mijn bestanden), tag `fw-0.5.43`.

**Ontwerpnotitie:** 12 Karplus-achtige comb-resonatoren (feedback-delaylijn +
demp-lowpass), gestemd op een schaal rond de grondtoon; het ingangssignaal
excite't ze allemaal → sympathische resonantie. Heap ~75 KB (12×1600 float).
Goedkoop (~enkele % CPU). Rings model 1 doet dit voor één stem al; dit is de
losse bank-als-effect-variant.

### 1. CR-78 (oude Roland) drums — berekend, niet gesampeld
Zelf-gemodelleerd (geen upstream). Zelfde techniek als Peaks: bridged-T-
oscillatoren (gedempte sinus voor bass/bongo/conga), gefilterde ruis
(snare/hat/cymbal/maracas/guiro), envelope-VCA's. Berekend geeft de dynamiek
(velocity→pitch-buiging, accent-circuit) die een sample mist. Module
`tp_mmb_cr78`, `drum`-switch voor de stemmen, gate-getriggerd, tone/decay.
Categorie `drum`. Overweeg een gedeelde "kit"-instantie of één-drum-per-instantie
zoals Peaks (Peaks doet één-per-instantie — consistent aanhouden).

### 2. Overige ideeën (alle akkoord, vrije volgorde)
- **Quantizer/scale-module** (`tp_mmb_quant`, CvModule): CV-in → vastklikken op
  een schaal → CV-uit. Handig achter Marbles/S&H. Scale-keuze + root + glide.
- **Chord-module** (`tp_mmb_chord`, CvModule): één `voct` in → 3-4 gestemde
  CV-uitgangen (akkoordvormen: maj/min/7/sus…), inversie/spread. Voedt Octa-VCO
  of de resonator-bank.
- **Plate/hall-reverb** losse module (`tp_mmb_reverb`, AudioModule): Clouds'
  reverb is nu ingebouwd; een aparte Dattorro-plate/hall mist. (Elements heeft al
  een Dattorro-reverb intern — `ElementsReverbModule` bestaat zelfs al als
  FX-3; check of die als losse reverb bruikbaar/uitbreidbaar is vóór je nieuw
  bouwt.)
- **Grids-achtige drum-sequencer** (`tp_mmb_grids`, CvModule): topologische
  drumpatronen (X/Y map density) → gate-uitgangen voor kick/snare/hat, om
  Peaks/CR-78 aan te sturen. MI Grids is te vendoren (zie eurorack-repo in
  `scratchpad/eurorack/`), of hand-modelleren met de klassieke pattern-tabellen.
- **Wave-teken-canvas (editor, geen firmware!):** de Draw-VCO en Morph-WT
  USER-bank slikken al een getekend single-cycle golfje via de `wavetable`-push
  (`sendWaveform` in teensyLink — **let op: teensyLink.ts is nu door de andere
  sessie in bewerking; wacht tot die gecommit is of raak 'm niet aan**). Bouw
  een `<canvas>`/SVG waar je met de muis een golf tekent (of harmonischen-
  sliders), die live pusht naar de geselecteerde VCO/Morph-slot. Self-contained
  React-component; hang 'm in de patcher-properties of een eigen modal.

---

## 5. Handige bronnen

- **Eurorack-broncode** (voor MI-ports): `scratchpad/eurorack/` (gekloonde
  pichenettes-repo met o.a. `grids/`, `stages/`, `peaks/`, `warps/`,
  `marbles/`, `tides2/`, `plaits/`, `clouds/`, `elements/`, `rings/`).
- **msfa** (DX7): `scratchpad/msfa/`.
- **Testharnassen** en per-versie elfs: `scratchpad/*.py`, `scratchpad/*.sh`,
  `scratchpad/firmware-0.5.XX.elf`.
- **Sessieverslagen:** `doc/copilot-chats/exports/2026-07-06-contract-keten-…md`
  (de hele reeks van deze week staat erin).
- **Backlog:** `doc/BACKLOG.md`. **UML van het Model/View-ontwerp:**
  `doc/architecture/mmb-moduletype-panel.puml` (+ .xmi via `tools/uml_xmi_gen.py`).

## 6. Stijl / omgang (uit de memory + deze week)

- De user is Mark, Nederlandstalig, houdt van "ik laat mij verrassen" / "doe het
  gewoon" — mag autonoom doorbouwen, committen tussendoor, en zelfspelende seeds
  maken als demo. Rapporteer met een korte, leesbare samenvatting per stap.
- Eén onderdeel per commit met een eigen versie, zodat het los kan afvallen.
- Wees eerlijk over wat wel/niet getest is; flash pas na hello-verificatie.
