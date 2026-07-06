# Chat: Code review firmware/editor, poly-fixes en telemetrie

- **Datum**: 2026-07-05 (avond)
- **Assistent**: Claude Code (Fable 5)
- **Sessie-ID**: `fe297ea1-e05f-4f60-9b5d-f759e28522ff`
- **Berichten**: ~32 (samengevat; geen letterlijke export)
- **Firmware**: 0.5.15 → 0.5.18 · **Reviewdoc**: `doc/code-review-firmware-editor-2026-07-05.md`

---

## 🧑 User

Wil je de firmware (Teensy C++) en de editor reviewen op OO-gebruik, hergebruik en
architectuur (niet te veel lagen, niet te plat), en checken of de aansluiting
tussen die twee klopt — geen gaten of mismatches?

## 🤖 Assistant

Volledige review uitgevoerd over `firmware/core`, `firmware/app-modular-brain`,
`editor/src/modular-mb` en het mmb-config.v1-protocol. Hoofdbevindingen:

1. **Bug: poly werkt niet op hardware** — `sendConfig()` stript `voiceCount` uit de
   patch-payload terwijl firmware `applyPatchVoiceCount()` dat veld verwacht;
   MidiIn blijft op 1 stem.
2. `attenuation`/`invert` worden verstuurd maar door niets toegepast (fw én sim).
3. `sendWaveform()` (wavetable, FW-AU-6) heeft geen enkele aanroeper — draw-UI ontbreekt.
4. Modules die maar aan één kant bestaan: `tp_mmb_elements_reverb` (alleen fw),
   `tp_mmb_sh`/`noise`/quads (alleen editor; noise klinkt in sim maar niet op hardware).
5. Structureel risico: het typeId/portId/controlId-contract leeft dubbel
   (seedModules.ts + C++ headers) → advies: host-side contract-test.
6. Firmware-OO is sterk (Module-hiërarchie, RTTI-vrije dispatch, Registry);
   hergebruik-kansen: asFloat/asInt-dedup, registerFactory-template, CvToAudioProxy.
7. Editor: AudioEngine.ts is halverwege de Registry-migratie blijven steken;
   monoliet-componenten (RackPanel 1652 r.); seedModules mixt cosmetiek en contract.

## 🧑 User

Leg bug 1 nog eens uit — deed de Teensy al niet polyfoon? En wil je de review
in een document vastleggen?

## 🤖 Assistant

Uitgelegd: het **statische fallback-graph** is 4-stemmig (hard geconfigureerd in
setup) — dat was de poly die je hoorde. Zodra een patch actief wordt, mute dat graph
en neemt de dynamische runtime over, waarvan de MidiIn op 1 stem start; de editor
stuurde het `voiceCount`-veld nooit mee (oversight, geen besluit). Review vastgelegd
in `doc/code-review-firmware-editor-2026-07-05.md` met prioriteitenlijst.

## 🧑 User

Wil je die bug fixen?

## 🤖 Assistant

`voiceCount: p.voiceCount` toegevoegd aan de patches-map in `teensyLink.ts`.
Typecheck bracht twee bestaande fouten aan het licht die ook gefixt zijn:

- `seedModules.ts`: `seedCvBridgePatch` verwees naar een niet-bestaande `mixer`
  (kabels per ongeluk uit `seedPolyVoicePatch` geplakt) — verwijderd.
- `api/deviceApi.ts`: `DeviceConfig` beschreef een verzonnen draadformaat;
  herschreven naar de echte SwitcherProject-subset die de Pico/ESP32 verbatim
  persisteert; `EditorSimulationPanel.tsx` daarop getypeerd (`as any` weg).

## 🧑 User

Heb je app-elements ook bekeken? (Context: bedoeld voor een eigen Teensy,
5-stemmig; op de brain waarschijnlijk alleen monofoon.)

## 🤖 Assistant

Addendum §5 aan het reviewdoc toegevoegd. Kern: app-elements is een bewust
low-level, performance-getunede standalone synth met uitstekende documentatie
(dual-thread rendering, DTCM/OCRAM-analyse, gemeten CPU-budgetten). Bevindingen:
byte-identieke wrapper-kopieën tussen beide apps ("delete this copy"-opruimstap
nooit gedaan → gedeelde lib maken), `tp_mmb_ominous` nergens geregistreerd,
lokale voice-allocator herimplementeert het geteste `mb::VoiceAllocator`,
dubbele `PatchBank`-naam. STK-status: niet gevendored.

## 🧑 User

Kan ik de Teensy flashen en poly testen? Gewoon met de knop de firmware ophalen?

## 🤖 Assistant

Flashen was niet nodig voor de poly-fix (die zit in de editor; firmware-kant stond
klaar). Uitleg: de pc dúwt firmware via Teensy Loader; de knop is alleen fallback.
Testplan: push config → activeer patch → let op logregel
`patch voiceCount=N applied to …`.

## 🧑 User

*(logs van config-push en selectPatch, 4-stemmige seed)*

## 🤖 Assistant

**Poly werkt** — `voiceCount=4 applied`, 46 kabels: AudioGraph wired=14 +
CvGraph routes=32 = 46, dangling=0; alle skip-regels zijn complementair (normaal).
Onderweg gefixt: misleidende log `budget=120` (pool is via `kAudioPoolBlocks` nu
één bron), StkSoundModule scopefout in de no-STK-tak (fw compileerde niet!),
sizeof_probe.cpp actieve compile-error-probe uitgecommentarieerd. FW → 0.5.16.

## 🧑 User

Klinkt goed! Maar velocity lijkt geen effect te hebben (Gain B op CvMath 0 of max
maakt geen verschil). En kun je de poly-seed uitbreiden met een LFO achter het
mod wheel voor vibrato? Pitch bend werkt.

## 🤖 Assistant

Twee oorzaken: (1) CvMath-mult negeerde gains per ontwerp (`out = a×b`) — nu
`out = (a×gain_a)×(b×gain_b)` in fw + sim (gain 0 ⇒ stilte); (2) schermkeyboards
sturen vaste velocity (0.9 / 100) — alleen echte Web-MIDI geeft aanslag door.
Seed uitgebreid: LFO (5.5 Hz sinus) × cv_mod (mod wheel = depth) → ×0.04
(≈ ±½ semitoon) + cv_bend → VCO.tune, fan-out naar alle stemmen. FW → 0.5.17-basis.

## 🧑 User

*(pio-run vragen: waar draai ik het commando; NotPlatformIOProjectError)*

## 🤖 Assistant

Vanuit `firmware/app-modular-brain` (of `pio run -d firmware\app-modular-brain …`);
eerst Disconnect in de editor zodat Teensy Loader kan auto-rebooten.

## 🧑 User

Raar: de filter-ADSR lijkt maar 1 van de 4 stemmen te raken.

## 🤖 Assistant

Gevonden: beide `setControl`-implementaties in PatcherGraphPanel schreven alleen
naar de master. Fix: `polyControlTargets()`-helper; edits op een poly-lid waaieren
nu uit naar álle groepsleden (controlPoke ×N + controlState ×N). Eén slider-beweging
synct daarna alle stemmen weer.

## 🧑 User

De Teensy-link activeert de patch niet meteen na het laden; ik moet eerst naar de
patcher-tab. *(log: selectPatch → "unknown id" ×2, dán config, dán pas werkend)*

## 🤖 Assistant

Diagnose: na re-seed heeft alles nieuwe id's; selectPatch vóór config = unknown id,
en een config-push bouwde bewust geen graph. Dubbele fix: (a) Push-knop stuurt nu
config + selectPatch; (b) firmware activeert zelf de meegeleverde `activePatchId`
(`activatePatchAndBuild()` gedeeld door beide handlers) — elke push is
self-sufficient. FW → 0.5.17. Waarschuwing: `retired=99` zombiemodules; power-cycle
na grote re-seeds.

## 🧑 User

1. De 16-stemmige seed wil niet echt. 2. Kan er processor-info naar de FE
(getStatus o.i.d.)? En werken de physical-modeling-stemmen al?

## 🤖 Assistant

1. **Oorzaak 16-stemmig**: payload (~100 modules, ~200 kabels) > 48 KB-lijnbuffer;
   overflow werd stil gedropt. Fix: buffer → 96 KB, expliciete "line too long"-ack,
   payload geslankt (racks + kabel-ids eruit, >10 KB), `config payload: NN KB` in
   het log, audio-pool 400 → 800 blocks.
2. **Telemetrie**: nieuw protocolpaar `getStatus`/`status` (CPU nu/piek,
   blocks nu/piek/pool, loopHz, modules+retired); modal pollt elke 2 s en toont
   een gekleurde statusstrip. FW → 0.5.18.
3. **Physical modeling**: String (Karplus-Strong) = echt; Elements = echt maar
   zwaar; STK = sinus-stub zolang de lib niet gevendored is.

## 🧑 User

- Kan de patcher de status ook tonen? — Is de retired-modules-fix te doen?
- Staat de review in een document? — Wil je deze chat backuppen zoals mijn
  copilot-exports?

## 🤖 Assistant

- Statuspolling verplaatst naar teensyLink zelf (loopt zolang de poort open is);
  nieuw gedeeld `TeensyStatusBar`-component, gebruikt in de Teensy-modal én de
  patcher-header (compact).
- Retired-fix: te doen maar niet triviaal — `first_update`/`next_update` zijn
  private in de Teensy-core zonder destructor; vereist een bewuste
  private-access-hack of core-patch + strikte teardown-volgorde. Voorstel: aparte
  stap met hardware-test.
- Review: ja — `doc/code-review-firmware-editor-2026-07-05.md` (commit a7139d5),
  inclusief addendum app-elements en prioriteitenlijst met status.
- Deze backup: dit document.

---

## Bestanden geraakt in deze sessie

| Bestand | Wijziging |
|---|---|
| `editor/src/modular-mb/teensyLink.ts` | voiceCount in payload; racks/kabel-ids eruit; payload-log; getStatus + lastStatus; polling |
| `editor/src/modular-mb/seedModules.ts` | mixer-fout weg; vibrato-sectie (LFO+2×CvMath) in poly-seed |
| `editor/src/modular-mb/PatcherGraphPanel.tsx` | poly fan-out van control-edits |
| `editor/src/modular-mb/polyExpand.ts` | `polyControlTargets()` helper |
| `editor/src/modular-mb/TeensyLinkModal.tsx` | Push = config+activate; statusstrip |
| `editor/src/modular-mb/TeensyStatusBar.tsx` | **nieuw** — gedeelde telemetrie-strip |
| `editor/src/modular-mb/PatcherPanel.tsx` | statusstrip in patcher-header |
| `editor/src/modular-mb/sim/AudioEngine.ts` | mult-gains gespiegeld |
| `editor/src/api/deviceApi.ts` + `effect-switcher/EditorSimulationPanel.tsx` | DeviceConfig naar echt draadformaat |
| `firmware/app-modular-brain/src/main.cpp` | kAudioPoolBlocks 800; auto-activate na config; loopHz-meter; onGetStatus |
| `firmware/app-modular-brain/src/TeensyLink.h` | buffer 96 KB; overflow-ack; getStatus-handler |
| `firmware/app-modular-brain/src/ProjectRuntime.h` | `retiredCount()` |
| `firmware/app-modular-brain/src/StkSoundModule.h` | scopefout no-STK-tak |
| `firmware/app-modular-brain/src/sizeof_probe.cpp` | probe inert gemaakt |
| `firmware/core/include/mb/runtime/CvMath.h` | mult respecteert gains |
| `firmware/app-modular-brain/src/FwVersion.h` | 0.5.15 → 0.5.18 |
| `doc/code-review-firmware-editor-2026-07-05.md` | **nieuw** — volledige review + addendum |

---

## Nachtsessie 2026-07-06 (autonoom, Mark sliep)

**Elements-stilte + crashes opgelost — drie gestapelde bugs in de heap-context:**

1. `Voice::Init` initialiseerde `tube_` nooit → wilde pointer-write zodra het
   blow/string-pad draaide (DACCVIOL @0x3DE9BF8C, exact via addr2line herleid).
   Fix: `tube_.Init()` in de vendored `voice.cc`.
2. Daarna bleef de DSP NaN's produceren (res-meter klemde op 1.00, exc = NaN,
   peak 0): méér ongeïnitialiseerde DSP-staat. Structurele fix: `ElementsModule`
   kreeg een class-level `operator new` die het object **nult vóór constructie**
   — de MI-code is geschreven voor BSS (genulde) statics. Plus NaN-vangnet in de
   resample-lus.
3. Ketendiagnose toegevoegd aan het status-bericht + strip:
   `elements ✓ CPU · peak · gate ▮ exc res`.

**STK-crash (StkFrames::resize, mandoline) opgelost:**
- Use-after-free: `selectSound` verving het instrument op de main-thread
  terwijl de audio-ISR in `tick()` zat → nu bouwen buiten en swappen bínnen
  `AudioNoInterrupts()`.
- `StkFrames::resize` schreef na een gefaalde `malloc` door op nullptr
  (upstream-bug; guard zat achter `_STK_DEBUG_`) → OOM degradeert nu naar stilte.

**Autonoom getest via een Python-serial-harnas** (config pushen, MIDI-noten,
status uitlezen — COM4 kwam vrij):
- Elements-only patch: `peak 0.997` per noot, schone decay — **GELUID: JA**.
- STK-stresstest: 10 noten × 5 sound-wissels middenin de noot — **10/10, geen crash**.

**Seeds uitgebreid:** `filterType: 'vcf' | 'ladder' | 'ms20'` (drop-in in de
stemketen, controlState per type afgestemd) + Stress-menu-entries voor
Ladder ×8, MS-20 scream ×8 en STK Bowed ×8 (stk-voiceSource kwam uit de
parallelle sessie). Elements-paneel eerder al naar 20 HP met alle ~20 controls;
firmware kreeg continue bow/blow/strike, coarse/fine en een werkende level.

Firmware: 0.5.23 → **0.5.27** (geflasht en getest). Elfs per versie bewaard
voor addr2line.

---

## Nachtsessie deel 2 — Mutable Instruments ports (Mark: "verras me")

**🎻 Rings geport (tp_mmb_rings, FW-AU-11)** — `firmware/lib/mi-rings`:
Part/Strummer-API, 48 kHz→44.1 kHz, strum via gate, intern 1/2/4-stemmig.
Autonoom getest op hardware: peak 0.81, alle 4 geteste modellen live gewisseld
zonder crash, ~17% CPU. Sleutel-enabler: de gemodificeerde stmlib `DelayLine`
kreeg een **heap-fallback in de no-arg Init()** — daarmee draait upstream-code
ongewijzigd én is de Elements-bugklasse (nullptr-delaylines) structureel dicht.

**🎛️ Plaits geport (tp_mmb_plaits, FW-AU-12)** — `firmware/lib/mi-plaits`:
alle 16 engines. Hobbels onderweg: (1) Teensy's `WAVEFORM_*`-macro's botsten
met plaits' enum → push/undef/pop rond de includes; (2) `user_data.h` wilde
STM32-flash-API → TEST-pad geactiveerd op TEENSYDUINO; (3) **RAM1 liep 94 KB
over** → custom linker-script `teensy41_mmb.ld` dat de MI-lib-code + tabellen
in gecachede QSPI-flash laat (`.text.mmbdsp`-sectie) i.p.v. ITCM/DTCM — 84 KB
RAM1 weer vrij. Autonoom getest: **16/16 engines geven signaal**, 3.8–20.8%
CPU per engine (VA, Waveshape, FM, Grain, Additive, Wavetable, Chord, Speech,
Swarm, Noise, Particle, String, Modal, BassDrum, Snare, HiHat).

Editor: panelen `mmbRings` (14 HP) en `mmbPlaits` (12 HP, engine-knob + LED-
display) toegevoegd; status-telemetrie rings/plaits (ready/cpu/peak).
Firmware 0.5.28 → **0.5.29** (geflasht + getest). Testharnassen:
`scratchpad/rings_test.py`, `plaits_test.py`.

**Vervolgplan:** Clouds = zelfde recept + ~130 KB heap-buffers (32 kHz) —
haalbaar, geheugen-audit eerst. Tides = tides2 (62.5 kHz slope-generator) —
beter als CV-domein-module (CvModule op de 1 kHz-tick voor LFO-snelheden, of
audio-wrapper voor audio-rate). Beide passen in het bewezen patroon:
vendor → zero-init wrapper → resample → peak-telemetrie → autonome serial-test.

---

## Nachtsessie deel 3 (6 jul, slaapsessie): Clouds + Tides geport

**☁️ Clouds geport (tp_mmb_clouds, FW-FX-4)** — `firmware/lib/mi-clouds`:
GranularProcessor met alle 4 playback-modes (granular / pitch-stretch /
looping delay / spectral). Eerste MI-port mét **audio-ingangen**, dus een
dubbele resampler: input-accumulator 44.1k→32k naar 32-frames-blokken,
output-interpolator 32k→44.1k. Werkbuffers 118+64 KB op de heap
(nothrow, stilte bij OOM), `Prepare()` 1× per update. Hobbels: `debug_pin.h`
(STM32) eruit; `stmlib::atan_lut` ontbrak → `stmlib/dsp/atan.cc` mee-gevendord.
Panel: 14 HP met position/size/pitch/density/texture + mix/spread/feedback/
reverb, mode-switch, freeze-toggle, freeze/trig-gates, CV-jacks.

**🌊 Tides geport (tp_mmb_tides, FW-CV-1)** — `firmware/lib/mi-tides`:
tides2 `PolySlopeGenerator`. Bewust **géén AudioStream maar een CvModule**:
1 sample per 1 kHz-tick (`f = hz/1000`), goed tot ~100 Hz — precies het
LFO/envelope-domein. Vier uitgangen met betekenis per output-mode
(gates / amplitude / phase / frequency), exponentiële rate-CV
(±1 = ±1 octaaf), uitgangen ÷8 naar de MMB-CV-conventie. Eerste MI-port in
het CV-domein — bewijst dat het recept ook buiten audio werkt.
Panel: 10 HP in de lfo-categorie, rate/mode/output/shape/slope/smooth/shift.

Beide libs via `teensy41_mmb.ld` naar QSPI-flash; RAM1 hield 48.9 KB vrij
voor de stack. Telemetrie: `cloudsReady/Cpu/Peak` + `tidesOut1`.
Firmware **0.5.31** gebouwd en geflasht; elf bewaard
(`scratchpad/firmware-0.5.31.elf`).

**⏳ Hardware-test pending:** COM4 was de hele nacht bezet (vermoedelijk het
parallelle Gowin/FPGA-venster). Testharnas staat klaar:
`scratchpad/clouds_tides_test.py` (VCO→Clouds→OUT met freeze/trig +
tidesOut1-beweging); een achtergrond-wachter pollt de poort. Handmatig
draaien kan ook: poort vrijgeven en
`C:/Users/User/.platformio/penv/Scripts/python.exe scratchpad/clouds_tides_test.py`.

Commits: `ad20baf` (firmware-port 0.5.31), `631fde4` (editor-panelen).

**Toegift:** status-strip toont nu ook rings/plaits/clouds/tides-telemetrie
(`9d9d4f6`), en er staat een nieuwe demo-seed in het Solo-menu:
**☁️ Clouds ambient (+Tides)** — Plaits (additive) → Clouds (granular), met
Tides in loop+phase-mode als quadratuur-LFO op position/texture en elke
MIDI-noot als korrel-trigger (`a80fab3`).

**✅ Hardware-test geslaagd (0.5.32).** COM4 kwam na ~3,5 uur vrij; de eerste
run onthulde twee dingen: (1) de Teensy draaide nog 0.5.30 — de nachtelijke
flash was niet geland → opnieuw geflasht; (2) **Tides zweeg in
amplitude-mode**: met `shift` op het midden is `channel_index = 0` en zijn
alle vier de gains exact 0 — upstream-gedrag (shift kiest het actieve
kanaal), maar een stille verrassing als default. Default output-mode is nu
**phase (quadratuur)** in firmware én paneel (`f33e7a9`).

Resultaat op de Teensy: **Tides out1 beweegt** (−0.52 → 0.36 bij 3 Hz);
**Clouds maakt geluid** (peak 11838, ~6% CPU — ruim onder de geschatte 26%)
en **freeze werkt**: peak blijft ~10400 zonder input. Buffers: 116+63 KB
heap netjes gealloceerd (`[clouds] init ok`).
