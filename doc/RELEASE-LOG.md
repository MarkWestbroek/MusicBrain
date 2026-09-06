# MusicBrain — Release log

> Chronologisch overzicht van opgeleverde wijzigingen (nieuwste boven).
> Forward-looking werk staat in [BACKLOG.md](BACKLOG.md).
> De volledige, ongekuiste dev-notities van vóór deze splitsing staan in
> `Requirements.backup-2026-05-31.md`. De hoofd-`Requirements.md` blijft het
> requirements/ontwerp-document.

---

## Firmware

### fw 0.5.15 — AU-modulebatch (stereo-VCA, FM/WT/draw-VCO, echo/phaser/comb) & live control-sync (2026-06-02)
- **FW-LIVE-1 — live control-sync.** Knob-/control-edits in de editor gaan nu via
  een `controlPoke`-serieframe (`{type,mod,ctrl,v}`) direct naar de Teensy zonder
  volledige config-push. `ProjectRuntime::pokeControl()` past de control live toe
  (`setControl`) én persist't 'm in de actieve patch (`controlState`), zodat een
  latere volledige push een no-op is en patch-heractivatie hetzelfde getal
  herstelt. Geen ack (hot-path: een knob-drag spuugt een stroom frames). Editor:
  `sendControlPoke()` in `teensyLink.ts`, gekoppeld aan beide `setControl`-paden
  in `PatcherGraphPanel.tsx` (stuurt alleen scalairen).
- **FW-AU-1 — Stereo VCA (`tp_mmb_stereo_vca`).** Eén audio-in waaiert via een
  `AudioAmplifier` naar twee (L/R). `vol`+`pan` als CV; equal-power pan
  (`gainL=cos θ`, `gainR=sin θ`, `θ=(pan+1)·π/4`), pan-CV 0 = midden, −1 = links,
  +1 = rechts. Seed `mmbStereoVca()` (ST-VCA, 6 HP).
- **FW-AU-2 — CV op echo & phaser.** Echo (`tp_mmb_echo`, `EchoModule.h`):
  `AudioEffectDelay`-feedbacklus (max 500 ms) met CV op `time` (sec), `feedback`,
  `mix`. Phaser (`tp_mmb_phaser`, `PhaserModule.h`): custom 6-traps all-pass
  `AudioStream` met CV op `rate`/`depth`. Seeds `mmbEcho`/`mmbPhaser` met
  CV-poorten uitgebreid.
- **FW-AU-3 — Comb / resonator (`tp_mmb_comb`).** Getunede `AudioEffectDelay`-
  feedbacklus (0.2–50 ms), V/Oct-CV stemt de toonhoogte (0V=C4), `coarse`
  semitone-offset, CV op `feedback`/`mix`. Hoge feedback → gestemde resonator.
  Seed `mmbComb()` (COMB, 6 HP).
- **FW-AU-4 — FM-VCO (`tp_mmb_fm_vco`).** `AudioSynthWaveformModulated`; audio-FM-in
  moduleert de carrier, `fm_amt` = FM-diepte in octaven. Seed `mmbFmVco()`
  (FM-VCO, 8 HP).
- **FW-AU-5 — Wavetable-VCO (`tp_mmb_wt_vco`).** `AudioSynthWaveform` +
  `arbitraryWaveform`, 6 additief opgebouwde banks (saw/square/triangle/orgel/
  25%-pulse/vocaal-formant). Seed `mmbWtVco()` (WT-VCO, 8 HP).
- **FW-AU-6 — Draw-waveshape VCO (`tp_mmb_draw_vco`).** Arbitrary-table-oscillator;
  de editor pusht een single-cycle tabel via een nieuw `wavetable`-serieframe →
  `ProjectRuntime::setWaveform()` → RTTI-vrije `Module::setWaveformData()` (firmware
  resamplet naar 256 punten). Seed `mmbDrawVco()` (DRAW-VCO, 8 HP; teken-UI nog
  minimaal). Editor-helper `sendWaveform()`.
- **String & comp CV.** `tp_mmb_string` kreeg CV op `pluck`/`level`; `tp_mmb_comp`
  CV op `threshold`/`drive`. Seeds bijgewerkt.
- **AudioMemory 120 → 400** om de echo-/comb-delaylijnen te voeden (~1 audioblok
  per 2.9 ms delay). RAM2 ~122 KB in gebruik, ruim binnen budget.

### fw 0.5.14 — AudioModule-rename & mod-wheel-bridge (2026-06-02)
- **Refactor `AudioPortModule` → `AudioModule`.** De audio-basisklasse heet nu
  `mmb_link::AudioModule` (bestand `AudioModule.h`); alle 11 subclasses,
  `AudioGraph`/`CvGraph` en de doc-comments in `core/Module.h`/`CvBreakIn.h` mee
  hernoemd. De naam-clash met de oude, al geschrapte core `mb::runtime::AudioModule`
  was de enige reden dat dit eerder was uitgesteld. UML 07/08 + README's bijgewerkt.
- **Mod-wheel via de editor-bridge (bugfix).** De live MIDI-bridge
  (`TeensyLinkModal`) forwardde alleen note-on/off en pitch-bend; control-change
  (mod-wheel = CC1) viel weg. Toegevoegd: `sendMidiCC()` in `teensyLink.ts`, een
  `cc`-tak in de bridge-subscribe, een `{"type":"cc"}`-frame + `MidiCcHandler` in
  `TeensyLink.h`, en `onMidiCc()` in `main.cpp` dat naar de bestaande
  `handleControlChange()` (→ `cv_mod`/`cv_cc*`) routet. `WebMidiSource` emitte de
  `cc`-events al; alleen de doorgifte ontbrak.

### fw 0.5.13 — octa-osc, string, comp+drive & firmware-sequencer (2026-06-01)
- **Octa-osc VCO (FW-PM-1).** Nieuwe audio-module `tp_mmb_octa_vco`
  (`OctaVcoModule.h`): 8× `AudioSynthWaveform` die één control-set delen
  (wave/coarse/fine/level) plus een symmetrische `detune` (cents-spreiding voor
  dikke supersaw/unison). Per-cel `voct_1..8` in + `out_1..8` audio uit, plus een
  gedeelde `tune` V/Oct-offset. Editor-seed `mmbOctaVco()` (OCTA-VCO-S, 20 HP,
  multi-module met CellGroup count 8).
- **String-VCO (FW-AU-8).** `tp_mmb_string` (`StringModule.h`) wrapt
  `AudioSynthKarplusStrong` → `AudioAmplifier`. Een Gate rising-edge tokkelt de
  snaar op de V/Oct-pitch; `pluck` regelt de aanslag-helderheid, `level` de
  output. Editor-seed `mmbString()` (STRING, 6 HP). Eerste echte
  physical-modeling-stem in de firmware.
- **Compressor + overdrive (FW-FX-2).** De stock Teensy Audio-lib heeft géén
  compressor, dus `tp_mmb_comp` (`CompDriveModule.h`) bevat een custom
  `AudioEffectCompDrive` AudioStream: feed-forward peak-compressor
  (threshold/ratio/attack/release + makeup-gain) gevolgd door een tanh soft-clip
  overdrive (`drive`). Editor-seed `mmbComp()` (COMP, 6 HP).
- **Firmware-sequencer (FW-SQ-1).** Nieuwe host-testbare core-`CvModule`
  `tp_mmb_seq8` (`Seq16.h`/`Seq16.cpp`): 16 stappen semitone-offset, controls
  root/rate/gate/length + 3-standen run-switch (Free = vrije interne klok,
  Off = doorlus V+→CV / Run+→Gate, Gate = interne klok loopt alleen terwijl
  Run+ hoog is). Externe `clock`/`reset`-ingang neemt het stappen over zodra een
  klok-edge binnenkomt (interne rate wordt dan genegeerd). Uitgangen: V/Oct-`cv`,
  `gate_out` (gate-fractie per step) en `trig` (korte puls per step); `voct_in`
  transponeert. 8 nieuwe host-tests in `test_seq16.cpp`. De bestaande editor-
  `mmbSeq8()` matcht de port-/control-ids al.
- **Audio-lib verkenning (3 vragen).** Bevestigd in
  `framework-arduinoteensy/libraries/Audio`: géén los comb-filter (wél met
  `AudioEffectDelay`+feedback of `AudioEffectFlange` te bouwen — FW-AU-3);
  fourier-analyse on-device haalbaar via `AudioAnalyzeFFT1024`/`FFT256` +
  `analyze_notefreq`/`analyze_tonedetect` (FW-AU-7); physical modeling realistisch
  want de Teensy 4.1 (Cortex-M7 @ 600 MHz + FPU) is krachtiger dan MI Elements'
  STM32F4 (FW-AU-9). Notities bijgewerkt in BACKLOG.md.

### fw 0.5.12 — portamento + unison/spread (2026-06-01)
- **Portamento / glide (FW-1b).** `MidiInModule::tick()` is geen no-op meer: hij
  draait nu elke ~1 ms in de CV-loop (net als `Lfo`/`Ahdsr`) en schuift per stem
  `pitchV_` met constante snelheid naar de doelnoot. De `glide`/`portamento`-
  control geeft de tijd in **ms per octaaf** (0 = uit → directe sprong) en werkt
  zowel mono als poly. De eerste noot per stem snapt direct (geen sweep vanaf 0
  bij power-up, via `glidePrimed_`). `voicePitchV`/`pitch`/`pitchK` geven nu de
  geglede waarde. Core-tests `midiin_glide_off_is_instant` +
  `midiin_glide_ramps_toward_target`.
- **Unison + spread (ED-RV-9, firmware-helft).** Nieuwe `unison_`/`spreadCents_`.
  Bij unison aan stuurt één toets álle stemmen (last-note via de mono note-stack:
  `onNoteOn` broadcast naar `[0..voiceCount)`, `onNoteOff` valt terug op de
  stack-top of laat alle gates zakken). `spread` (centen, 0..200) waaiert de
  stemmen symmetrisch uit rond het midden via `spreadOffsetV(v)` → V/Oct-detune.
  Schakelen reset de held notes (zelfde policy als `legato`/`voiceCount`).
  Core-tests `midiin_unison_drives_all_voices` +
  `midiin_unison_spread_detunes_symmetrically`. *Nog open:* de browser-sim poly
  voice-allocatie (ED-RV-9 tweede helft).
- **Editor.** `mmbMidiIn()` krijgt op de vrije rij (y=66) een `Glide`-knop
  (ms/oct), een `Uni`-switch en een `Sprd`-knop (centen). `Uni`/`Sprd` worden
  grijs bij een monofone patch (`MIDIIN_MONO_DISABLED`). 99 core-tests groen.

### fw 0.5.11 — pitch-bend serial-bridge (2026-06-01)
- **Pitch-bend door de editor-bridge.** De serial-MIDI-bridge
  (`{"type":"midi",…}`) droeg alleen note-on/off; KeyStep-pitch-bend kwam dus
  niet door (VMPK wél, want die gaat direct naar de USB-MIDI-poort van de
  Teensy). Nieuw parallel `{"type":"bend"}`-pad: `WebMidiSource` emit nu
  `pitchBend`-events (status `0xe0`), `teensyLink.sendMidiBend` stuurt ze als
  JSON, en `TeensyLink.h` parst `bend` → `onMidiBend` → `handlePitchChange` →
  `midiIn.onPitchBend`.

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

> Leeswijzer bij 0.6.0–0.7.5 (browser-simulatie, sampler, DX7, Snaarbank):
> [browser-instrumenten.md](browser-instrumenten.md).

| Release | Datum | Kern |
|---|---|---|
| editor 0.8.1 / fw | 2026-09-06 | **Filter in de cel, follower per stem, en de kernel-laag als de plek voor recursie.** (1) Twee nieuwe kernels in `mmb-dsp`: `svf.h` (TPT state-variable, LP/HP/BP) en `korg35.h` (de MS-20 uit `Ms20Module.h` losgetrokken: ZDF Sallen-Key, tanh-lus, 2× oversampling). `Ms20Module` en `VcfModule` zijn nu dunne schillen om die kernels — de VCF liep tot nu op Teensy's int16-`AudioFilterStateVariable` en heeft nu een float-filter met live `type`. (2) **Sampler**: per stem-kanaal een filterslot (`filter`: uit / SVF / MS-20 — letterlijk dezelfde klassen als de losse modules), gedeelde `cutoff`/`q`/`fmode`/`drive`/`cv_amt`/`env_rel`, cel-ingang `cutoff_k` en cel-uitgang `env_k` (`EnvFollower`, vóór het filter). De stem verlaat de module niet, dus stereo en quad blijven intact; auto-wah is de multikabel `env_k → cutoff_k`. Seed **Poly ▾ → Sampler ×8 auto-wah**. (3) Engine: `expandPolyForSim` vouwt nu ook cel-kabels uit (cel → cel = stem k → stem k, global → cel fan-out, cel → global genummerd/som), zodat één kabel op de master-cel in de sim alle stemmen bedient — zoals `polyExpand` dat voor de firmware doet. (4) **Firmware bouwt weer, en is gebouwd**: PlatformIO staat op deze Mac (`~/.platformio/penv/bin/pio`), `pio run -e teensy41` slaagt met alle sampler-, filter- en bankwijzigingen. Onderweg gevonden: `extern "C" __brkval` in een anonieme namespace (uit de PSRAM-commit) linkte niet — gehesen. Getest door de worklet: SVF 300 Hz brengt het spectrale zwaartepunt van 951 naar 376 Hz, MS-20 naar 295, `cutoff_1` = 1 opent naar 918 Hz, follower 0,07 → 0,37 → 0,18 over de aanslag. Nog niet op hardware gedraaid. |
| editor 0.8.0 | 2026-09-06 | **Construct C weg: sampler → multi-module (B), DX7-simulatie → ×N (A).** Uitwerking van [uml/11-simulation-wasm.md](uml/11-simulation-wasm.md). (1) **Sampler** is een multi-module: `role: 'multi'`, CellGroup `voice` ×8 met `voct_k`/`gate_k`/`vel_k`, controls gedeeld, gemengde uitgangen. Firmware `SamplerModule.h` en `sampler_wasm.cc` hebben dezelfde portmap; de allocator is eruit — die zit in MIDI-in. Seed **Poly ▾ → Sampler ×8 (cellen)**: één SAMPLER, PolyGroup over zijn cellen. (2) **DX7** is een gewone `WasmModule`: `tools/mmb-wasm/dx7_wasm.cc` (mmb-ABI, één stem, blok 64), gebouwd door `build.sh dx7`; ROMs, USER-bank en edit-patch gaan als blobs (slots 0..7, 8, 9) met control `edit`. `dx7Host.ts` vervangt `Dx7.ts`; de browser-eigen worklet met 16 stemmen (`dx7-worklet.js`, `dx7.wasm`, `bundle-worklet.mjs`) is verwijderd — de JS-port blijft als referentie voor `test-core.mjs` en `compare.mjs`. (3) **Engine**: stem-id's `moduleId` (A) of `moduleId#k` (B); de wasm-stemtoewijzer bedient cel-poorten met suffix; `Dx7Node`, `polyNotes`, `mmb_note_on` en `WasmModule.polyTypeIds` weg. Nieuw generiek in `WasmModule`: `registerAssets()` (lader per type), `broadcastControl()` (control naar alle instanties, ook buiten de catalogus), `count()`. Getest door de worklet: akkoord op cel 1–3 = drie stemmen, gate_1 laag laat 2 en 3 staan, velocity per cel 0,13/0,71; DX7 E.PIANO 1 op 0 cent over drie octaven, edit-patch aan/uit hoorbaar. Firmware niet gebouwd (geen toolchain). |
| docs | 2026-09-06 | **Pas op de plaats — [uml/11-simulation-wasm.md](uml/11-simulation-wasm.md).** Het modulemodel (compositie leeft in de catalogus, firmware en wasm spiegelen op naam), de drie manieren van polyfonie — A: enkelvoudige module ×N via PolyGroup/polyExpand; B: multi-module met cellen (QUAD/OCTA); C: het note-instrument dat de simulator vandaag voor DX7 en sampler kreeg — en het oordeel: C is een sluiproute, de sampler hoort een multi-module met instelbaar N te zijn en de DX7-simulatie hoort ×N te worden zoals de firmware al is. Plus klassediagrammen van de wasm-laag en de tabel `Module` ↔ `mmb_abi`. |
| editor 0.7.10 | 2026-09-06 | **Sampler speelt akkoorden.** De kern had al acht stemmen met een allocator; de *aansluiting* was monofoon, want een gate-flank draagt maar één toonhoogte en note-off liet alle stemmen los (`noteOff(-1)`). De sampler-wasm exporteert nu `mmb_note_on`/`mmb_note_off`/`mmb_all_notes_off`/`mmb_poly_voices`, de generieke worklet geeft `note`-berichten door, en de engine stuurt zo'n module élke noot los — hetzelfde patroon als de DX7. Zodra er één noot via die weg binnenkomt laat de kern de gate-flank met rust, zodat een gate-kabel en een klavier elkaar niet afkappen; een sequencer loopt via dezelfde weg (`wasmNoteOn` routeert poly-modules door). `WasmModule.polyTypeIds` zegt welke modules dit kunnen — Elements en Rings zijn per instantie één stem, daar blijft een PolyGroup het antwoord. Getest door de worklet: akkoord C3-E3-G3 geeft drie klinkende grondtonen, note-off van één noot laat de andere twee staan (de losgelaten zakt 42 dB in de release), en tien noten op acht stemmen stelen netjes. |
| editor 0.7.9 | 2026-09-06 | **SoundFonts als samplebron.** (1) `sf2.ts` leest SF2: INFO/sdta/pdta, preset- en instrument-zones platgevouwen (bereiken snijden, generatoren tellen op), met key- en velocity-range, root, `pitchCorrection` + coarse/fine, `initialAttenuation` → gain, pan, loop-punten en `sampleModes` → loop-modus. In de editor via **⤒ .mmbs / .sf2** met een presetkiezer; op de opdrachtregel via `tools/mmb-wasm/sf2-to-mmbs.mjs`. (2) **Nieuw zone-veld `velTrack`** — velocity-gevoeligheid *binnen* een zone in dB, kwadratische kromme, 0 = uit. Nodig omdat SF2 de dynamiek aan een default modulator overlaat die wij niet nabouwen: zonder dit klonken alle vijf de lagen van een gesampelde vleugel even hard. Het veld zit in het padding-byte van `ZoneRecord`, dus 40 bytes per zone blijft staan en bestaande banken lezen als 0. Gemeten door de keten: 24 dB geeft −25,7 dBFS bij velocity 15 en −2,2 dBFS bij 127. (3) Wasm-sampler verruimd naar 256 sloten en 512 zones (was 32/128) — een geconverteerde SoundFont liep daar stil tegenaan. (4) `parseBank()` kopieert per slot in plaats van eerst het hele datablok; scheelt bij een bank van 113 MB een tussenkopie van dezelfde omvang. (5) `--vel-layers=n` dunt de lagen uit en de tool waarschuwt zodra een bank niet meer in 8 MB PSRAM past. Getest op twee SoundFonts: Vintage Dreams (4 samples, 8 zones, twee gedetuneerde lagen hard L/R gepand — vijf octaven binnen 1 cent) en de YDP-vleugel (121 samples, 150 zones, 5 lagen). De ~15 cent die die vleugel te hoog meet zit in de opname zelf: YIN leest hetzelfde getal rechtstreeks op het sample. |
| editor 0.7.8 | 2026-09-06 | **Velocity zichtbaar én hoorbaar.** (1) **Noot- en velocity-uitlezing** in het Simulatie-paneel: naam, MIDI-nummer, velocity 0–127 en een balkje met de zonegrenzen 42/85 erin, zodat je ziet of een zachte aanslag ook werkelijk zacht binnenkomt. (2) **Bugfix in de Elements-testbank.** De eerste aanslag na een parameterwissel gebruikte nog de vórige `strength` — Elements smoothet zijn CV-ingangen en de mallet vuurt op t=0 voordat de nieuwe waarde er is. Gevolg: de drie lagen van G3 kwamen uit op 0,86 / 0,28 / 0,78 (zacht hárder dan hard), dus tussen midden en hard hoorde je niets. `make-test-bank.mjs` laat de CV's nu 0,25 s inregelen vóór elke aanslag en controleert of de pieken oplopen; de lagen staan nu op −11/−4/0 dB (C3) tot −15/−7/0 dB (C4) en door de keten gemeten is de spreiding 20 dB op alle drie de noten. Voor een echte opname is het dezelfde regel: laat het instrument tot rust komen tussen de aanslagen. |
| editor 0.7.7 | 2026-09-06 | **Sampler speelbaar maken: `.mmbs` terug inlezen + solo-seed.** (1) `parseBank()` in `sampleBank.ts` — de tegenhanger van `buildBank()`, zodat een bewaarde bank (of een bank van de SD) weer in de simulator gaat. Round-trip op de Elements-testbank: byte-identiek, 1 980 964 bytes, 9 samples / 9 zones / 15,5 s stereo. (2) Knoppen **Testbank** (haalt `public/banks/elements.mmbs` en zet 'm rechtstreeks in de simulator, zonder analyse) en **⤒ .mmbs** in de Multisample-import. (3) **Solo ▾ → 🎧 Sampler (multisample)**: er was geen route naar een speelbare SAMPLER-patch; nu MidiIn → SAMPLER → OUT met één klik. Velocity komt via de ongekabelde `vel`-poort binnen, dus de velocity-zones werken meteen. |
| editor 0.7.6 | 2026-09-06 | **DX7-editor op de Roto-Control + routeringsfix.** (1) **`modulationTargets()` was fout**: hij gaf per modulator één bestemming terug, terwijl `FmCore::compute` de bussen sequentieel afloopt — élke latere operator die van die bus leest wordt gemoduleerd, tot iemand de bus overschrijft (schrijven zonder `OUT_BUS_ADD`). In algoritme 22 voedt OP6 dus OP3, OP4 én OP5, niet alleen OP5; in algoritme 16 wordt OP1 gemoduleerd door OP2, OP3 en OP5. Gecontroleerd tegen de algoritmes 1, 4, 5, 16, 22 en 32. `modulatorsOf()` erbij voor de omgekeerde richting. (2) **Niveau in dB naast elke output-level**, geport uit msfa's `Env::scaleoutlevel` (0,75 dB per stap) en tegen de wasm gemeten: level 90 = −6 dB, 50 = −36 dB, 35 = −47 dB, 0 = stil. Dat maakt zichtbaar waarom een operator die je naar 35 draait naast een drager op 99 verdwijnt. (3) **`dx7Roto.ts` — de editor op de Roto-Control.** Zes buttons kiezen de operator, de acht encoders tonen steeds díé operator, in vier pagina's (toon · envelope · globaal · toetsschaling). Elke knob krijgt in het setup-bestand zijn eigen `maxValue`, dus het apparaat stuurt 0–99 voor een level en 0–31 voor het algoritme en het display toont hetzelfde getal als de editor; schakelaars (mode, curve, LFO-golf) krijgen klikjes en standnamen. Kanaal 16, CC 20–51 voor de knoppen en 52–59 voor de buttons, zodat het Surface-paneel op kanaal 1 gewoon door kan draaien. Export als ROTO-SETUP-bestand, en de ringen draaien mee bij een voice- of operatorwissel. (4) `surfaceBridge`: `addCcTap()`/`sendCc()` — een rauwe CC-tap vóór de projectbindings, want 155 patchbytes passen niet in het model van één CC per module-control. Getest onder node: 128/128 CC↔patch round-trips, CC's uniek, labels binnen de acht tekens van het display. |
| editor 0.7.5 | 2026-09-06 | **DX7-patcheditor + documentatie-overzicht.** (1) **Edit-buffer** in beide DX7-kernen: `dx7_edit_ptr()`/`dx7_edit_enable()` in de wasm, `setEditPatch()` in de JS-port, `edit`-bericht in de worklet. Staat de buffer aan, dan overstemt die 156-byte uitgepakte patch de bank — zo hoort elke DX7-module in de patch meteen wat je bewerkt, zonder de bank aan te raken. Onder node getest op beide kernen (bank-voice "BRASS 1" → edit "TESTPATCH", piek 0,100). (2) **`dx7Patch.ts`** — het patchformaat los van UI en audio: packed 128 ↔ unpacked 156 (port van msfa's `patch.cc`), de 32 algoritmes met bus-/feedbackvlaggen, `algorithmRouting()`/`modulationTargets()` voor het diagram, `opRatio()` zoals het DX7-display rekent. Let op `opIndex = 6 - uiOp`: in een bulkdump is patch-index 0 gelijk aan OP6. Roundtrip over alle 256 factory-voices: 251 byte-identiek, de 5 afwijkingen zijn ongebruikte hoge bits in de ROM (osc-sync/curve-bytes) die msfa net zo goed wegmaskeert. (3) **`Dx7EditorModal.tsx`** (knop 🎛 DX7): algoritme, feedback, transpose, per operator level/mode/coarse/fine/detune/ratio + de 4 rates en 4 levels met envelope-schets, LFO-sectie, startpunt kiezen uit de 8 factory-ROMs, naam bewerken, klavier van twee octaven dat via `Dx7.preview()` direct hoorbaar is, en export als 32-voice `.syx` die ook in een echte DX7 laadt. (4) **Bugfix: maar één worklet per context.** Tone 15.1.22 bewaart in `Context.addAudioWorkletModule` één `_workletPromise` per context en negeert de URL, dus voor de tweede module wordt `addModule` nooit aangeroepen terwijl de `await` wél slaagt — wie het eerst kwam won, en de ander faalde met een onbekende processor (in de praktijk: eerst een Elements-patch gespeeld = DX7 stil, en omgekeerd). `runtime/audio/workletLoader.ts` gaat nu rechtstreeks naar `rawContext.audioWorklet` met een eigen cache per (context, URL). Daarbij: de statusregel in het Simulatie-paneel ververst zichzelf (stond anders op "worklet laden…" lang nadat hij klaar was) en toont het aantal actieve DX7-stemmen. (5) **[browser-instrumenten.md](browser-instrumenten.md)** — samenhangende leeswijzer bij het werk van 5 en 6 september: lagen, wat er uit de firmware kwam rollen, sampler, DX7 (incl. hoe de "grunge" meetbaar is), Snaarbank en wat open staat. |
| editor 0.7.4 | 2026-09-06 | **Snaarbank: tape echo, modulatiepad en telefoons als modulatievlak.** (1) **Tape echo** als vierde blok in de keten (`editor/public/snaarbank-worklet.html`): delay met feedback door een zachte verzadiger en laagdoorlaat, wow (0,7 Hz) en flutter (6,3 Hz) op de bandsnelheid, 60 ms–1,2 s exponentieel, CC 33–36. Effecten zijn nu blokken `{input, output, apply}` in een vaste `FX_ORDER`, zodat de keten herschikbaar is zonder patcher. (2) **Modulatiepad** voor trackpad, Wacom en aanraakscherm: vier bronnen (sleep-X, sleep-Y, twee-vinger scroll, pinch) met vrij te kiezen bestemming; scroll werkt bij zweven, dus zonder klikken terwijl de andere hand speelt. Terugveren gaat naar de waarde van vóór het aanraken; relatieve bronnen pakken de stand van hun bestemming op bij elke nieuwe veeg. Een pen wordt herkend en voegt een drukrij toe. (3) **modlink** (`editor/modlink/`, `public/pad-phone.html`, `public/modlink.js`): doorgeefluik als Vite-plugin dat telefoons als modulatievlak koppelt. CC-vormige berichten over websocket, drie aanraakpunten per toestel, meerdere toestellen tegelijk met elk een eigen bereik vanaf CC 40. Het toestel blijft dom; routering staat bij de host, die de bestemmingsnamen terugstuurt zodat het vlak toont wat elke as doet. Zie [ADR 0016](adr/0016-modulation-surfaces-over-cc.md) en [snaarbank-testlab.md](snaarbank-testlab.md). Onderweg gerepareerd: ontbrekende charset-declaratie, `hidden` dat het verloor van de display-regels van `.badge`/`.padrow`, en een verzadigingscurve die kleine signalen versterkte waardoor de echolus bij hoge feedback opliep. |
| editor 0.7.3 | 2026-09-06 | **Sampler-import: noten vooraf opgeven, stemreferentie, en een testopname.** (1) **Verwachte noten**: `parseNoteList()` leest "C1 C2 C3", "36,48,60" of "C1..C5/12"; `applyExpectedNotes()` legt ze per groep aanslagen vast. Bij inharmonisch materiaal (klokken, klankschalen, modale resonatoren) is dat betrouwbaarder dan detectie. (2) **Stemreferentie** A = 380–500 Hz met knoppen voor 432/440; noot-naamgeving en centen rekenen daarmee. Losse vinkjes voor "afwijking wegstemmen" en "naar A440" — uit gelaten behoudt bv. een op 432 gestemde klankschaal zijn eigen stemming. (3) `refinePitchNear()` hermeet met de zoekruimte ±6 halve tonen rond een bekende noot, en `safeTuneCents()` negeert afwijkingen boven een halve toon: die betekenen een verkeerd *gedetecteerde noot*, geen ontstemming. **Bugfix**: zonder die klem werd een octaaffout als −1126 cent stemcorrectie toegepast en speelde C3 op 28 Hz. (4) Bankformaat: magic `MMBS`, extensie **`.mmbs`** — de vierde letter van de extensie is gelijk aan de vierde magic-byte, zodat naam en inhoud niet uiteen kunnen lopen; `.mmbw` (wavetables) en `.mmbd` (DX7) zijn daarmee gereserveerd. (5) `make-test-bank.mjs` rendert met de Elements-wasm een testopname (C3/G3/C4 × 3 aanslagen, stereo) + de bijbehorende bank; knop **Testopname** in de import. Bevinding: bij geometry 0,42 ligt Elements' waargenomen toon 60–95 cent boven de nominale noot (uitgerekte partialen), bij geometry 0,25 exact 0 cent — echt gedrag, geen stemfout, en meteen een validatie van de toonhoogtemeting. Afspelen uit de bank klopt binnen 5 cent. |
| editor 0.7.2 | 2026-09-06 | **Multisampler: keymap, meerkanaals, en import uit één lange opname.** (1) Kern `mmb_dsp/sample_player.h` herschreven: keymap met key- én velocity-zones, 1–4 kanalen interleaved (loop-punten op frame-niveau, dus het stereobeeld springt niet door de naad), vier loop-modes incl. `loop_sustain` (loop tot note-off, daarna de staart), per zone root/tuneCents/gain/pan/decay/release; positie als int+frac zodat lange samples niet in float-precisie weglopen. (2) `.mmbs`-bankformaat (`mmb_dsp/sample_bank.h`): samples + keymap in één bestand, door de firmware zonder parser van SD naar PSRAM te lezen. (3) `SamplerModule.h` herschreven: 8 stemmen met allocator, 4 uitgangen, bank-index 0–15 → `/mmb/banks/NN.mmbs`; de chunked `sample`-serialupload is vervallen (SD is het transport). (4) Editor **🎹 Multisample-import**: één lange take (C1 zacht/midden/hard, C2 idem, …) wordt gesegmenteerd op stilte + onset, per aanslag toonhoogte met YIN, uitsterving in twee fasen (snelle val + trage naklank), velocity-lagen op attack-RMS, key-bereiken tot halverwege de buurnoot, periode-gesynchroniseerde loop-zoeker met nuldoorgang-snap en ingebakken gelijk-vermogen-crossfade, plus octaafcorrectie uit de oplopende speelvolgorde. Golfvorm met segmentmarkeringen, corrigeerbare tabel, → simulator of `.mmbs`. (5) Voorbeeldsamples gerenderd door de wasm-modules zelf. Tests (node): analyse 9/9 noten, lagen en octaafreparatie; end-to-end door de worklet 9/9 op toonhoogte, dynamiek en stereo, transponering exact 1,0595. Firmware niet op hardware gebouwd. |
| editor 0.7.1 | 2026-09-06 | **Poly-allocator voor wasm-PolyGroups + Sampler.** (1) Wasm-PolyGroups spelen polyfoon in de simulator: alle leden krijgen een node, kabels worden uitgevouwen zoals `polyExpand` (fan-out, genummerde mixer-ingangen, stem v → stem v) en een allocator verdeelt noten (zelfde noot → hertrigger, vrije stem, anders oudste stelen); knopstanden van de master waaieren uit. (2) **Sampler** (`tp_mmb_sampler`): kern `mmb_dsp/sample_player.h` (V/Oct via interpolatie, root, start/end, loop, one-shot/gate, attack/release); Teensy `SamplerModule.h` met `SampleBank` in PSRAM (`extmem_malloc`, heap-fallback) en SD-persistentie, serial-frame `sample` (chunks); editor 🎧 Sample-modal (decodeert naar mono 44,1 kHz int16, vult de wasm-sampler in de simulator en stuurt naar de Teensy). Firmware niet op hardware gebouwd. |
| editor 0.7.0 | 2026-09-06 | **Teensy-modules als wasm in de simulator.** (1) Generieke mmb-wasm ABI (`tools/mmb-wasm/mmb_abi.h`): per module een C-wrapper die de control-/poortafhandeling van `<X>Module.h` spiegelt; `build.sh` compileert de gevendorde MI-kernen met wasi-sdk (`-O3 -msimd128`) naar `editor/public/wasm/<typeId>.wasm`. Eén generieke AudioWorklet-host (`mmb-worklet.js`) leest poorten/controls uit de wasm, resamplet (audio lineair, cv/gate zero-order-hold) en mengt kabel- en klavierwaarden. Modules: Elements, Rings, Marbles, Stages, Peaks, Morph-WT, Clouds, Plaits, Tides, Warps. (2) Engine: node-soort `wasm` (`WasmModule.ts`, één Tone.Gain per poort); audio én cv/gate zijn signalen; MIDI-In/sequencer/klavier sturen voct/gate handmatig; wasm→wasm via één render-quantum DelayNode zodat lussen niet gedempt worden; PolyGroups spelen alleen de master. Krell-, 808-jam- en Warps-vocoder-seeds spelen in de browser. (3) **Tape echo** als nieuwe module (`tp_mmb_tape_echo`) op de header-only kern `firmware/lib/mmb-dsp/mmb_dsp/tape_echo.h` — één bron voor Teensy én browser; firmware-wrapper nog niet op hardware gebouwd. (4) Firmware-fix: `StagesModule` deelde de uitgang door 8, maar `SegmentGenerator` levert al 0..1 (Krell-VCA opende maar tot 12,5 %). (5) `voice.cc` (mi-elements): `const_cast` die clang eist. Docs: `tools/mmb-wasm/README.md`, `doc/Simulation.md §9`, backlog ED-SM-2..6, FW-FX-TAPE, FW-AU-SAMP. |
| editor 0.6.0 | 2026-09-05 | **Browser-simulatie: DX7, FM-VCO, Snaarbank.** (1) **DX7 (`tp_mmb_dx7`) in de simulator** met exact de msfa-kern van de Teensy: `tools/dx7-wasm` bouwt `dx7.wasm` (wasi-sdk), met daarnaast een regel-voor-regel JS-port (`dx7-core.js`) als fallback — sample-exact getest tegen de native kern (max verschil 1,5e-8, SNR 148 dB). AudioWorklet met 16-stemmige allocator, de 8 factory-ROMs (`roms.bin`), engine-node `dx7` die élke note-on/off krijgt. (2) **FM-VCO** in de simulator (`FmVco`-runtime, exponentiële FM via `osc.detune`, `fm_amt` in octaven zoals `AudioSynthWaveformModulated`) + FM-testpatch/-preset; een audio-kabel naar een VCO-ingang kwam in de engine voorheen nergens aan. (3) **Snaarbank** (`editor/public/snaarbank-worklet.html`): draagbare Elements-demo zonder Teensy — Karplus-Strong én een port van Elements' modale resonator (stiffness-LUT, q-formule, positie-cosinus, stereo-LFO), bow via banded waveguides + BowTable, particle-mallet, tape-echo, Web MIDI in/uit (Roto-feedback, dezelfde CC-map als app-elements), aftertouch-modulatie. Tag `editor/cortex/v0.6.0`. |
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
