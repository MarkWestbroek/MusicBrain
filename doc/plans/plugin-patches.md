# Plugin: banken, patches en de hele editor

Plan van 2026-10-27, na de eerste ronde met alle 73 losse modules als
AU/VST3 in Logic ([plugin.md](plugin.md)). Status: **plan**, nog niets
gebouwd, behalve stap 1 voor SAMPLER en TAPE STRIP (§3). De motorvraag (§4) is met MODULES beantwoord: een eigen graaf
met wasm2c-instanties.

## 1. Aanleiding

Na het testen in Logic kwamen vijf vragen (Mark, 2026-10-27):

- **Missen.** Mellotron (TAPE STRIP), DX7 en ZANG ontbreken. Ze staan
  bewust in `EXCLUDE` in `editor/scripts/pluginParams.ts`: ze spelen uit een
  bank die de editor laadt (DX7: fabrieksbanken, licentie open).
- **Alleen.** Een kale VCO is geen instrument. Zonder envelope en VCA klinkt
  hij in een DAW als een orgel dat nooit stopt.
- **Alles.** Kan het hele modulaire concept, met kabels, in één plugin?
- **Patches / front.** Kan een patch één plugin worden, met het front als
  UI? Bijvoorbeeld VCO-VCF-VCA-ENV ×8 als meerstemmige synth.
- **Subeditors.** De CMI (en de DX7) hebben in de editor veel meer UI dan
  het paneel. Kan dat in de plugin?

Kort antwoord: alles kan. Het paneel draait al als onze React-code in de
webview van JUCE 8, dus elke UI van de editor past in een plugin. Het werk
zit in de audio: de plugin moet zelf een patch kunnen draaien en banken
kunnen bewaren.

## 2. Volgorde

Elke stap bouwt op de vorige:

| Stap | Wat | Lost op |
|---|---|---|
| 1 | Banken in de plugin-state | Missen; basis voor Subeditors |
| 2 | Wasm-gastheren als instanties (wasm2c) + CPU-meting 8×4 | één exemplaar per proces (zie plugin.md) |
| 3 | Patch-plugin met het front | Patches / front, Alleen |
| 4 | Patch laden in de patch-plugin | eigen patches zonder herbouw |
| 5 | De hele editor als plugin | Alles |
| 6 | Subeditors als tabblad (CMI, DX7) | Subeditors |

Stap 6 kan na stap 1 al beginnen voor één module; de volledige vorm hoort
bij stap 5.

## 3. Stap 1: banken in de plugin-state

**Stand 2026-10-27:** SAMPLER en TAPE STRIP zijn gebouwd: de Bank-knop
werkt uit de bankmap en een eigen bank gaat mee in het project; zie
[plugin.md](plugin.md), "Banken in de plugin". Nog open: ZANG en DX7 (andere
bankformaten), DRAW-VCO-tekening, CMI-voice.
Ook open: de bankmap (212 MB) moet nu met de hand gevuld worden. Voor
gebruikers hoort daar een installer-stap bij, of een terugval op een map
naast de plugin. Windows is gecontroleerd door MODULES: de banken laden
en de pieken zijn gelijk aan de Mac (Bank 3 met noten 48 en 60: 0,272).

- De plugin krijgt een bank (`.mmbs` voor sampler/TAPE STRIP, de ZANG-bank,
  een DX7-bank) via slepen of een knop in de webview. De bank gaat mee in
  `getStateInformation`, zodat een Logic-project hem bewaart.
- Daarmee komen sampler, TAPE STRIP (Mellotron), ZANG en DX7 uit `EXCLUDE`.
  De DX7 eerst met onze eigen presets; de fabrieksbanken pas als de
  licentie helder is.
- Dezelfde route bewaart later de tekening van DRAW-VCO (stap 2 van de
  Vorm-schakelaar) en een CMI-voice.
- Grootte: een bank van enkele MB in de projectstate is voor Logic en
  Reaper geen probleem; boven de ~50 MB liever een verwijzing naar een
  bestand plus een kopie in de projectmap.

## 4. De patchmotor (stap 2 en 3)

Een patch-plugin moet modules aanmaken en kabels per audioblok doorrekenen,
op de audiothread van de DAW. Er zijn twee routes:

1. **De firmware-runtime compileren voor de desktop.** `AudioGraph`,
   `CvGraph` en de modules hangen aan de Teensy Audio-bibliotheek
   (`AudioStream`, `AudioConnection`, `AudioMixer4`, blokken van 128 int16,
   `AudioNoInterrupts`) en ArduinoJson. Met een desktop-stub van die
   bibliotheek draait dezelfde code in de plugin. Voordeel: één motor, en de
   plugin klinkt als de hardware, inclusief PolyGroup-uitvouwen en
   fan-in-sommering. Risico's: ISR-aannames, geheugensecties
   (`DMAMEM`/`FLASHMEM`, zie de `__APPLE__`-guard in `MandolinData.h`),
   globale pools, een vaste 44,1 kHz en banken op SD/flash.
2. **Een eigen kleine graaf in de plugin** op de mmb_dsp-kernen
   (`KernelPlugin.h`) en de wasm-gastheren, gevoed met de patch-JSON uit de
   editor. De planning bestaat al in TypeScript (`planSimGraph` in
   `editor/src/modular-mb/sim/simGraph.ts`, `polyExpand.ts`), maar de
   simulator zelf laat de kabels via WebAudio lopen, dus de doorrekening
   moet nieuw.

**Besluit (2026-10-27, met MODULES): route 2.** Route 1 bootst een Teensy
na in plaats van de patch te draaien:
- 72 headers hangen aan `Audio.h`, `Arduino.h` of ArduinoJson. Een stub
  zou de int16-kwantisering en de vaste 44,1 kHz meenemen.
- `AudioGraph` wisselt patches via `AudioNoInterrupts`.
- 12 bestanden gebruiken `DMAMEM`, `EXTMEM` of `FLASHMEM` (delaybuffers,
  CMI, de PSRAM-pool `FxMem`).
- Sampler en ZANG streamen van SD.

Route 2 is geen derde implementatie. Elk `*_wasm.cc` compileert de echte
firmwarecode: CV-modules letterlijk via `cvhost.h`, audio via de
mmb_dsp-kernen. De ABI (`mmb_abi.h`) is al de uniforme module-interface.
De simulator klinkt daarmee al als de hardware.

**Hoe de simulator een patch draait** (de referentie): één AudioWorkletNode
per module (`public/wasm/mmb-worklet.js`), met een eigen wasm-instantie;
zie `runtime/audio/WasmModule.ts` en `sim/AudioEngine.ts`. Kabels zijn
WebAudio-verbindingen; de browser mengt en synchroniseert de blokken.
CV-modules draaien op 1 kHz met blok 1. Een JS-graafklasse om te hergebruiken
is er niet. Drie regels moet de plugin-graaf overnemen, anders klinken
modules anders:

1. Een CV-ingang wordt alleen geschreven als de waarde verandert (de AHDSR
   leunt daarop; `cvhost.h`).
2. Controls krijgen hun type uit de JSON: bool, int32 of float.
3. Twee kabels op één CV-ingang: de laatste wint, niet optellen
   (`CvGraph.h`). Audio-ingangen sommeren wel (fan-in in `AudioGraph.h`).

**Instanties: wasm2c** (uit wabt). Dat maakt van elke `.wasm` C-code met
een instance-struct: globals en geheugen per instantie, bijna-native
snelheid, geen interpreter. De `.cc`'s blijven ongewijzigd, en de
browser-build blijft gelijk. wasm3 (interpreter, voor DSP 5–10× trager)
past niet bij een PolyGroup ×8. WAMR-AOT kan ook, maar is zwaarder in te
bouwen. De `.cc`'s zelf naar klassen herschrijven (136 bestanden) alleen
voor modules die naar `KernelPlugin` kunnen. Geheugen per instantie: de
wasm-heap mag tot 32 MB, de sampler tot 2 GB; de sampler krijgt een eigen
route. Dit lost ook de beperking van één exemplaar per proces van de losse
plugins op.

**De graaf in de plugin:**
- (a) native en float, per gastheer blokken van 128 op de DAW-rate (zoals
  `AbiPlugin` nu, met de bestaande Lagrange-interpolatie), CV-ticks op
  1 kHz, en de drie regels hierboven;
- (b) modules zijn wasm2c-instanties van de bestaande `.wasm`, en
  `KernelPlugin` waar dat al kan;
- (c) een PolyGroup is N instanties plus een NoteMap per cel;
- (d) de patch-JSON (hetzelfde formaat als `ProjectRuntime` leest, contract
  in `module-types.json`) en het front komen direct uit de editor. De
  WebAudio-graaf draait in de plugin niet mee.

**Gemeten (2026-10-27, Mac, Intel i9-9880H 2,3 GHz):** de meetopstelling
staat in `tools/plugin/wasm2c/bench.cc`. Per stem draait een keten VCO →
LADDER → VCA, met een AHDSR op de cutoff en de VCA. Het zijn wasm2c-instanties
van de `.wasm`-bestanden uit `editor/public/wasm/`, zonder herbouw. De AHDSR
tikt op 1 kHz, de audio loopt in blokken van 32 op 44,1 kHz. Tijden zijn
voor één kern.

| Stemmen × 4 modules | CPU | Realtime |
|---|---|---|
| 8 | 7,1 % | ×14 |
| 32 | 29 % | ×3 |
| 64 | 61 % | ×2 |

- **Instanties zijn onafhankelijk.** De stemmen liggen precies 5 halve
  tonen uit elkaar (253 → 338 Hz enz.). Elke instantie heeft eigen
  globals en eigen geheugen.
- **wasm2c is even snel als gewoon gecompileerde code.** Dezelfde `.cc`,
  32 instanties, eerst als wasm2c en dan native (`-O3`):

  | Module | wasm2c | native |
  |---|---|---|
  | VCO | 0,53 % | 0,57 % |
  | LADDER | 27,6 % | 24,3 % |

  De kosten zitten in de DSP. De LADDER is het dure deel: ongeveer 0,8 % per
  stem.
- **Geheugencontrole: expliciete bounds checks** (`-DWASM_RT_USE_MMAP=0
  -DWASM_RT_MEMCHECK_BOUNDS_CHECK=1`). De standaard is guard pages, met een
  signal handler en 8 GB virtueel per instantie, en dat wil je niet in een
  DAW. Gemeten verschil: geen (7,35 % tegen 7,32 % bij 8 stemmen).
- **Bouwen:**
  - wabt uit de broncode (`~/src/wabt`, CMake + Ninja, doelen `wasm2c` en
    `wasm-objdump`).
  - De `.wasm` gebruiken SIMD (`-msimd128`), dus de gegenereerde C heeft
    simde nodig (`wabt/third_party/simde`).
  - Een module zonder WASI-imports (VCO, LADDER, VCA) heeft niets extra
    nodig. De AHDSR importeert vier WASI-functies (`fd_write` enz., uit de
    C-bibliotheek); lege stubs volstaan.
  - De C per module is 140–780 kB en compileert zonder waarschuwingen.

**Stand 2026-10-29 (stap 2 klaar):** alle 53 gastheer-plugins draaien via
wasm2c, met een eigen instantie per exemplaar. 35 zijn bit-identiek aan
native, de rest wijkt minstens 82 dB af (eigen libm van de wasm), en twee
exemplaren naast elkaar geven exact hetzelfde. Zie
[plugin.md](plugin.md), "Meerdere exemplaren".

**Conclusie:** route 2 met wasm2c draagt een patch van 8 stemmen ruim, en
32 stemmen in één plugin kan ook. Het grootste risico van het plan is
weg.

## 5. Stap 3 en 4: de patch-plugin

**Stand 2026-10-29:** stap 3 staat. "MMB Poly 8" en "MMB CS-80 Brass" zijn
plugins, met MIDI-IN, aftertouch en modwheel zoals op de Teensy. Zie
[plugin.md](plugin.md), "Patch-plugins". Poly 8 heeft een front; de
CS-80 heeft tabs Spelen en Effecten, en elk effect op een front krijgt een
bypass-parameter (`bypassRoute.ts`, `PatchEngine.h`). Het front is de
bediening, met de fronts als tabs. Nog open: de bypass in editor,
simulator en firmware.

- Een vaste patch (een seed uit `patchCatalog.ts`) wordt één AU/VST3. De
  UI is het front van die patch: dezelfde componenten als de speelmodus.
- DAW-parameters zijn de items van het front, dus automatisering werkt op
  wat de speler ziet. Elke wijziging loopt via dezelfde boodschap als
  `setPatchControl` nu naar de Teensy stuurt; in de plugin gaat die naar
  C++.
- MIDI: noten via MIDI-IN en de stemverdeling van de PolyGroup, zoals op
  de hardware. Daarmee wordt VCO ×8 met envelopes één meerstemmige synth.
- Stap 4: de patch-plugin laadt een patch-JSON (slepen, of uit de editor
  sturen). Dan is één generieke "MMB Patch"-plugin genoeg en hoeft niet
  elke seed een eigen build te hebben.
- Gevolg voor de losse plugins: de kale VCO's (`SYNTH_OVERRIDE`) kunnen uit
  de lijst zodra er een patch-plugin is met een stem eromheen.

## 6. Stap 5: de hele editor

De editor (rack, kabels, panelen, front) in de webview van de plugin, met
de patchmotor uit §4 als geluid. De editor praat dan met de plugin in
plaats van met de Teensy; het transport (`modlinkHost`, de poke van
`setPatchControl`) krijgt een derde bestemming naast simulator en Teensy.
Grootte: de build van de editor is ~260 MB, vooral wasm en banken; voor een
plugin acceptabel, maar banken liever los laden dan inbakken.

Open: wat de editor in een DAW níet moet doen (eigen MIDI-poorten, eigen
recorder, eigen transport). Die horen bij de DAW.

## 7. Stap 6: subeditors

De CMI-pagina's (`CmiPage4`, `CmiPageD`, `cmiBank`, `cmiAnalyse`) en de
DX7-editor (met de Roto-bediening) komen als tabblad achter het paneel,
zoals Binnenkijken in de speelmodus. Ze schrijven een bank (stap 1) en
controls (via dezelfde route als het paneel).

## 8. Open vragen

- Samplerate: zie §9.
- Waar wasm2c op Windows vandaan komt (wabt bouwen of een release), en of
  de gegenereerde C met clang-cl in de CMake-build past.
- Licenties per module vóór verkoop (zie plugin.md).

## 9. Samplerate (48 en 96 kHz in Logic)

Eén pluginversie werkt nu al op elke rate. Het verschil zit in wat er binnen
gebeurt:

- **Kernplugins** (`KernelPlugin.h`, onder meer HALL, SID en de 22 op de
  kern-interface) roepen `Init(sampleRate)` aan met de rate van de DAW. Op
  96 kHz rekenen ze echt op 96 kHz; daar heb je het voordeel van de
  oversampling.
- **Wasm-gastheren** (`AbiPlugin.h`, de meeste modules) rekenen op hun eigen
  `MMB_NATIVE_RATE` (44,1 kHz, zoals de Teensy). Een Lagrange-interpolator
  zet van en naar de DAW-rate. Ze werken op 48 en 96 kHz, maar het geluid
  binnen blijft 44,1 kHz: geen extra bandbreedte, geen minder aliasing.

Om op 96 kHz echt op 96 kHz te rekenen (uitgewerkt met MODULES, die de
ABI-kant bouwt):

- **Per module te kiezen.** `float mmb_set_rate(float r)` komt vóór
  `mmb_init` en geeft de rate terug die de module echt gebruikt. Alleen
  een wrapper met `#define MMB_RATE_FLEX` volgt de vraag; de andere geven
  `MMB_NATIVE_RATE` terug. `mmb_native_rate()` geeft daarna de gekozen rate.
  De gastheer resamplet alleen als er nog verschil is. Na `mmb_init` heeft
  de aanroep geen effect. Een oude `.wasm` zonder de export gaat goed: de
  gastheer slaat de aanroep over.
- **`MMB_NATIVE_RATE` blijft de standaardwaarde.** Daarnaast komt
  `g_mmb_rate` met de lezer `mmb_rate()`, en een flex-wrapper gebruikt die
  in `mmb_setup`. Wrappers zonder de vlag blijven precies hetzelfde.
- **Niet flex:**
  - De Mutable-ports (Clouds en Plaits 32 kHz, Rings, Elements en Peaks
    48 kHz): hun tabellen en coëfficiënten horen bij die rate.
  - De oscillatoren op `teensy_waveform.h` (OCTA-, WT- en DRAW-VCO), die
    integer-fase-incrementen voor 44,1 kHz gebruiken.
- **Valkuil: buffers met een vaste lengte in samples.** Het gaat om delay-
  en galmlijnen in echo, tape, BBD, shimmer, harmonizer, HALL en CMI.
  - Op 96 kHz halveert de maximale tijd, of loopt de schrijfwijzer over.
  - Zo'n module mag pas flex worden als zijn buffers op rate × seconden
    gemaakt zijn.
  - Daarbij het geheugen narekenen: de wasm-heap mag tot 32 MB.
- **Test per flex-module:** renderen op 44,1 en 96 kHz, en dan toonhoogte,
  decay- of delaytijd en piek vergelijken.
- **De browser roept `mmb_set_rate` niet aan.** De simulator moet klinken
  als de Teensy, en de wasm-tests renderen op `MMB_NATIVE_RATE`. Alleen de
  plugin vraagt een andere rate, en geeft hem bij elke herstart van een
  instantie opnieuw mee vóór `mmb_init`.
- **CPU:** op 96 kHz ruim het dubbele van de tabel in §4 (8 stemmen ~15 %).
- CV-modules blijven op 1 kHz: hun gedrag hangt niet aan de audiorate.

Er komen dus geen versies per rate. Hoe dit in het werk past: stap 2 en 3
nemen `mmb_set_rate` mee, omdat de wasm2c-route de `.wasm` toch per
instantie start.
