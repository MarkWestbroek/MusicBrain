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
