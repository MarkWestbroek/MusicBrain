# 2026-07-06 — Contract-keten, filter-CV's, OUT-level & UML

Vervolg van [2026-07-05-code-review-poly-fixes-en-telemetrie.md](2026-07-05-code-review-poly-fixes-en-telemetrie.md)
(zelfde Claude-sessie, na de Clouds/Tides-nacht).

## Ochtend: Clouds ambient stil → twee lessen

**Geen geluid uit de ambient-seed.** Strip: `clouds ✗ · heap 16K · +10 retired`.
Diagnose: de nachtelijke testpatch liet een Clouds in de retired-pool achter
(180 KB heap die nooit vrijkomt) → de nieuwe Clouds kreeg zijn werkbuffers
niet en zwijgt bewust (stilte-bij-OOM). **Oplossing: power-cycle.** Bekende
retired-issue, nu met een duidelijk zichtbaar gevolg.

**"Ik hoor Plaits maar de uitgang is nergens verbonden."** De seed maakte
kabels met firmware-aliassen `out_l`/`out_r`; de firmware bedraadde ze
(geluid!), maar het paneel kent alleen `out`/`aux` → de patcher kon de kabels
niet tekenen. Onzichtbaar-maar-werkend. Fix `0d8b230`. Dit werd de aanleiding
voor de contract-discussie.

## Architectuur: ModuleType als contract in het midden

Mark's framing (klopt met as-built `types.ts`): **ModuleType** (ports +
controls + displays) = het Model; **Panel/ModuleVisual** = de View (plaatst
per id, kan niets toevoegen); firmware & simulator = realisaties. De twee
zwakke naden: seeds→ModuleType (losse strings) en ModuleType→firmware
(alleen conventie). Besluit: **firmware is leidend**, ModuleType-data wordt
het canonieke contract, en dat wordt mechanisch bewaakt:

1. **`tools/contract_dump.py`** → parseert de firmware-broncode (headers +
   core-cpp's, OVERRIDES voor genummerde ids en één-control-modules) →
   `firmware/app-modular-brain/contract/module-types.json` (gecommit,
   diffbaar per PR).
2. **`editor/src/modular-mb/contract.test.ts`** (vitest, `npm test`):
   valideert paneel-poorten/controls tegen het contract, alle seed-kabels
   tegen paneel-jacks (de out_l-klasse), en rapporteert firmware-poorten
   zonder jack informatief. **67 tests groen.**

Audit-vondsten onderweg: AHDSR `eoc`-jack bestaat niet in firmware (bekende
gap in test); `vca.gain/resp`, `vco.fm_amt`, `midiin.priority`,
`echo.tempo_sync` zijn accepted-but-ignored (gedocumenteerd in OVERRIDES);
OUT `level` was een no-op → gefixt (zie onder).

UML: `doc/architecture/mmb-moduletype-panel.puml` (bron) +
`.xmi` (XMI 2.1 voor EA-import, gegenereerd door `tools/uml_xmi_gen.py`).

## Firmware 0.5.33 (tags: fw-0.5.32, fw-0.5.33)

- **OUT-level werkt echt**: gedeeld `AudioAmplifier`-paar (master-gain)
  tussen patch/statische mix en usbOut + `AudioAnalyzePeak` →
  **`outPeak`-telemetrie**: hét "hoor ik iets?"-signaal, ook in de strip
  ("uit 0.000"). Getest: 0.8→0.900, 0.1→0.090, 1.0→0.900.
- **Drive-CV op MS-20 én Ladder**: `drive_cv`-poort + `drive_cv_amt`-
  doseerknop; exponentieel (±1 CV bij amt 1 = ×4…÷4). MS-20: gesmoothde
  drive in beide tanh-paden; Ladder: `inputDrive` op de 1 kHz-tick.
- Panelen naar 8 HP met Drv CV-jack + doseerknop; labels verduidelijkt:
  **Res = Q** (knop "Res (Q)", jack "Res CV") — de verwarring "Q CV zonder
  Q-knop" was naamgeving, geen ontbrekende functie.
- MI-panelen tonen nu de al bestaande firmware-CV's: Plaits H+/T+/M+,
  Rings S+/B+/D+/P+, Tides Sh+/Sl+/Sm+/Sf+, Clouds S+ (size).

## Hardware-testen (autonoom, via outPeak)

Alle vijf groen op 0.5.33: OUT-level ✓, ladder q_cv ✓ (50% variatie),
ms20 q_cv ✓ (28%), ms20 drive_cv ✓ (19%), ladder drive_cv ✓ (49%).

**"Q CV werkt niet" bleek tweemaal een meet-/bedieningsartefact:**
1. Mijn eerste testrun: LFO-control `run` is een **enum** (0=Always,
   1=Gated, 2=OneShot); `true` werd Gated-zonder-gate = bevroren LFO.
   Dezelfde valkuil bestaat in de UI — check de run-switch van het
   LFO-paneel als modulatie "dood" lijkt.
2. Mijn tweede run: `outPeak` is max-sinds-vorige-poll; met een 0.5 Hz-LFO
   en een ~1,5 s pollvenster zie je altijd de LFO-top → vlakke meting.
   Testen met 0.12 Hz-LFO toonden de modulatie meteen.

Ook geleerd: `controlPoke` heet op de draad `{"mod","ctrl","v"}` — niet
moduleId/controlId/value. En: een **openstaande seriële verbinding blokkeert
de Teensy-soft-reboot** — daarom landde de flash van 5 juli 's nachts niet
(editor/ander venster hield COM4 vast). Uploaden = eerst poort loslaten.

## Procesbesluiten (voorstel Claude, ter bevestiging)

- **Monorepo houden**: het contract-bestand + de test overspannen firmware
  en editor; splitsen zou precies deze koppeling breken.
- **Versionering via git**: contract-JSON gecommit per wijziging;
  tags `fw-X.Y.Z` per geflashte versie (fw-0.5.32, fw-0.5.33 staan).
  Database niet nodig zolang er geen query-behoefte is.
- **Panel-versionering**: voorstel `minFirmwareVersion` op het paneel;
  poort-verwijderen in firmware = breaking = minor-bump (0.6.0) + de
  contract-test faalt er hard op.

## Testharnassen (scratchpad)

`filters_out_test.py` (OUT-level + 4 CV-modulatietests via outPeak),
`lfo_debug.py` (LFO→VCA-levensteken), `wait_flash_test.sh` (flash+test
zodra COM4 vrijkomt). Elfs: `firmware-0.5.32.elf`, `firmware-0.5.33.elf`.

## Commits van vandaag

`f33e7a9` tides phase-default + hw-test groen · `f67e7e1` verslag ·
`0d8b230` seed out/aux · `9d9d4f6`+`a80fab3` (nacht: strip + ambient-seed) ·
`31de807` OUT-level + drive-CV (0.5.33) · `5140399` panelen ·
`94669e3` contract-keten · tsconfig-fix · UML/docs (deze commit).

---

## Middag: MI Marbles geport (0.5.34, tag fw-0.5.34)

Menu-keuze van Mark: alles (Marbles → DX7/msfa → Warps → Octa-VCF/VCA →
morphing-wavetable). Marbles als eerste gedaan:

**🎲 Marbles (tp_mmb_marbles, FW-CV-2)** — `firmware/lib/mi-marbles`:
TGenerator + XYGenerator als CvModule op de 1 kHz-tick (zelfde truc als
Tides: sr=1000, size=1). t1/t2/tclk random gates + x1..x3/y gekwantiseerde
random-CV's **in volts** — direct patchbaar op voct. Tempo in BPM (rate is
intern semitonen rond 2 Hz = 120 BPM), déjà-vu-loop, 6 preset-schalen
(preset_scales.h losgetrokken uit settings.cc — dat hangt aan STM32-flash),
externe klok. Extra vendor-les: `random_generator.h` heeft
`stmlib/utils/ring_buffer.h` nodig.

Paneel `mmbMarbles` (14 HP, sequencer-categorie) + **zelfspelende seed
"🎲 Generative jam"** in het Solo-menu: Marbles (pentatonisch, 180 BPM) →
Plaits string-engine → Clouds, met Tides-quadratuur op de wolk. Geen MIDI
nodig. Hardware-getest: x1 wandelt door het pentatonische raster, klok
tikt, blips hoorbaar. Contract-tests: 69 groen. Elf bewaard.

Antwoorden onderweg: sympathetic resonance zit al in Rings (model
"Sympath"); wavetable deels aanwezig (WT-VCO/Draw-VCO/Plaits engine 5),
echte morphing-WT-VCO op het menu gezet.

---

## Avond: DX7 op de msfa-engine (0.5.36, tag fw-0.5.36)

**🎹 DX7 (tp_mmb_dx7, FW-AU-13)** — `firmware/lib/msfa`: de kern van
Google's music-synthesizer-for-android (Apache-2.0; dezelfde engine als
Dexed/MicroDexed). Eén 6-op FM-stem per instantie (poly via polyExpand),
native 44.1 kHz (2× msfa-blok N=64 per update), velocity-gevoelig,
fractionele pitch via de interne pitch-mod (bend is intern 3 semitonen
fullscale). Default-voice: ingebouwde E.PIANO 1.

**Banken:** nieuw serial-frame `{"type":"dx7bank","data":[4096]}` laadt een
32-voice bulk-dump in de gedeelde bank van alle DX7-stemmen; `program`
(0–31) kiest de voice (herladen op de volgende note-on). Editor:
🎹 DX7-bank (.syx)-knop in de Teensy-modal (4104 met framing of 4096 kaal).

**Port-hobbels:** Controllers-include ontbrak in dx7note.h; `size_t` in
aligned_buf.h; globale min/max-templates botsen met std op Teensy;
int/int32_t-signatuurmismatches (op ARM is int32_t een long!); de
sin/exp2/tanh/freqlut-tabellen (~32 KB BSS) aten de DTCM-stack op tot
6,6 KB → naar RAM2 via section-attribute (stack terug op 35 KB).

**Hardware-getest:** E.PIANO 1 klinkt (peaks 0.12–0.29), ~2% CPU per
klinkende stem (16-stemmig ≈ 33%), heap 248K vrij; bank-upload
end-to-end bewezen (naam-terugkoppeling "MMB TEST00", program-wissel
hoorbaar). Twee keer geleerd dat een open editor-verbinding de flash
blokkeert — versie altijd via hello verifiëren.

Commits: `f401e51` (firmware), `8812349` (paneel + syx-upload).
Contract: 71 tests groen. Volgende op het menu: Warps → Octa-VCF/VCA →
morphing-wavetable-VCO.

**DX7 poly ×8 hardware-getest** (seed `03719b6`): 8-noots akkoord op de
platte graaf = **9,3% CPU** (piek 10,2), outPeak 0.173, blocks 18, heap
216K, hoorbare release-staart. Zestien stemmen zou dus rond de 20% blijven —
de headroom voor Clouds achter een volle DX7-poly is er ruim.

**Factory-ROMs ingebouwd (0.5.37, tag fw-0.5.37):** de 8 klassieke
Yamaha-banken (ROM1A..4B, 32 KB) zitten nu in de firmware-flash —
Bank-knop (1A..4B + USR) naast Program op het paneel, voice-namen komen
uit de data zelf (dx7BankNames.ts, gegenereerd door tools/dx7_banks_gen.py)
en de firmware logt de naam bij elke wissel. USER-bank blijft de
.syx-upload. DX7 poly ×8 verhuisd naar het Poly-menu. Hardware-getest:
BRASS 1 / PICCOLO / EXPLOSION klinken met correcte namen.

---

## 7 juli: DX7 factory-ROMs, naamdisplay, Warps (0.5.37–0.5.38)

**DX7 afgerond:** 8 factory-ROMs in flash (bank-knop 1A..4B+USR), groen
voice-naamdisplay op het paneel (generieke 2D-lookup-displays + led-green-
stijl), DX7 poly ×8 in het Poly-menu. seedInternals is nu een échte
upgrade (bestaande types in-place vervangen + dedupe) — paneel-wijzigingen
verschijnen voortaan met één klik op ✨ Internals.

**🌀 Warps geport (tp_mmb_warps, FW-FX-5, 0.5.38, tag fw-0.5.38):**
meta-modulator met 2 audio-ins; algorithm morpht xfade→fold→ringmod×2→
XOR→comparator→spectraal→morph→vocoder; interne carrier-osc (shape 1..5)
bespeelbaar via voct. Draait native op 44.1 kHz (Modulator::Init neemt de
sample rate — geen resampler). Hardware: alle algoritmes geven signaal
(peaks 0.62–0.80), ~11.6% CPU incl. twee VCO's. Valkuil voor het recept:
msfa's globale `N`-macro vergiftigt warps' templates → vangen + #undef.

**Flash-verificatie:** teensy-gui zegt SUCCESS ook als de soft-reboot
faalt (open poort). Nieuw: `scratchpad/flash_verify.py` — upload +
agressieve hello-poll tot de doelversie bevestigd is; wint de race van
de auto-reconnectende editor. Voortaan de standaard flash-route.

**Machine-mysterie:** het "overal volgende rondje" bleek zes parallelle
Vite-dev-servers (Bitemporal) + één MusicBrain-Vite — allemaal gestopt;
één per project starten.

---

## Nacht 7→8 juli (slaapsessie): vocoder-seed, Octa's, Morph-WT (0.5.39)

**🗣️ Seed "Warps vocoder"** (Solo-menu): keyboard bespeelt Warps' interne
zaag-carrier (V/Oct), Marbles klokt Plaits (string) als ritmische modulator
door de vocoder. `28596ad`.

**Octa-VCF + Octa-VCA (FW-PM-2/3 ✅, `4c23480`):** het OctaVco-cellenpatroon
toegepast op filter en VCA — 8× SVF resp. 8× multiply met één gedeelde
control-set, per cel in_N/cv_N/out_N. Een 8-stemmige poly is nu drie
modules (Octa-VCO → Octa-VCF → Octa-VCA) + mixer. Hardware: LFO op alle
8 VCA-cellen moduleert (96% variatie) op 6,5% CPU.

**Morph-WT (FW-AU-14, `bc4ef11`):** morphing-wavetable-VCO — 8 frames per
bank, per sample geïnterpoleerd én tussen frames gecrossfaded; morph-knop
+ CV. Banken Analog/Vocal/Harmonics/Digital (additief opgebouwd) + USER,
vulbaar via de bestaande wavetable-push (wslot kiest het frame → de
Draw-VCO-teken-UI werkt ervoor). 1,5% CPU. v1 aliast licht boven ~C6.

**RAM1-crisis + structurele fix:** met alle nieuwe modules zakte de
DTCM-stack naar 2 KB (!). `main.cpp.o` (alle module-code) is naar de
gecachte QSPI-flash verhuisd (zelfde route als de MI-libs) → **172 KB
stack vrij**, en de regressietest (DX7→Warps-vocoderketen, 13,9% CPU)
toont geen merkbare vertraging. Sectie-les: function-local statics met
`.dmabuffers`-attribuut botsen met de AudioMemory-pool in dezelfde TU —
heap gebruiken.

Alle drie hardware-getest via flash_verify (0.5.39, tag fw-0.5.39):
Morph-WT 4 banken klinken; octa-keten leeft; regressie OK.

---

## Nacht 8 juli (2e slaapsessie): Morph-WT v2, Stages, Peaks, editor-features

Zes deelopdrachten, elk eigen versie + commit (kunnen los afvallen):

- **Morph-WT v2 (0.5.40):** per-octaaf mip-levels (≤24/≤8/≤2 harm., int16,
  ~61 KB heap) tegen aliasing; per blok kiest de osc het niveau onder
  Nyquist. Hardware: hoge saw schoon op 1,6% CPU.
- **🎚️ Stages (tp_mmb_stages, FW-CV-3, 0.5.41):** 6-segment envelope/LFO/
  sequencer als CvModule; segment-type R/H/S/A + T/S per segment, Active/
  Loop/L-start/L-end. Loop-LFO op VCA moduleert (88%).
- **🥁 Peaks (tp_mmb_peaks, FW-AU-15, 0.5.42):** 808-drums (kick/snare/hat/
  fm), 1 drum/instantie, gate-getriggerd, 48k→44.1k resample. Alle 4
  klinken. Seed **808 jam** (Marbles klokt 3 drums).
- **Editor (geen flash):** panel-export/import (ED-P-1, `panelIO.ts` +
  Panels-menu, mmb-panel.v1); OUT-VU bargraph in de status-strip (ED-P-2).
  Beide bewust búiten de patcher-renderer gehouden (parallelle design-
  sessie op PatcherGraphPanel).
- **Surprise: seed 🌌 Krell** — Stages triggert via EOC zichzelf + Marbles;
  envelope → Morph-WT-morph + VCA → Clouds. Zelfspelend, oneindig.

**DX7 voice-picker** bewust NIET gebouwd: die hoort in de patcher-control-
UI (design-sessie-terrein). Concept: dropdown die de namen uit
dx7BankNames.ts toont en bank/program poked — de naam staat al groot-groen
op het paneel, de dropdown is de "spring direct naar voice X"-variant.

Tags fw-0.5.40 t/m fw-0.5.42. Tests: 81 groen. Alles via flash_verify.
Modulearsenaal nu 42 types; MI-catalogus: Elements/Rings/Plaits/Clouds/
Tides/Marbles/Warps/Stages/Peaks geport.
