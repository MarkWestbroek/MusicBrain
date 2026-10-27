# Plugin: banken, patches en de hele editor

Plan van 2026-10-27, na de eerste ronde met alle 73 losse modules als
AU/VST3 in Logic ([plugin.md](plugin.md)). Status: **plan**, nog niets
gebouwd. De motorvraag (§4) is met MODULES beantwoord: een eigen graaf
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

**Eerst meten.** Vóór de UI komt er een kleine meetstap: een patch van 8×4
wasm2c-instanties (VCO, VCF, VCA, ENV per stem) in een testprogramma, met
het CPU-gebruik per blok bij 48 kHz.

## 5. Stap 3 en 4: de patch-plugin

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

- CPU: hoeveel wasm2c-instanties passen in één plugin? De meetstap in §4
  beslist, vóór de UI.
- Samplerate en bloklengte: zoals `AbiPlugin` nu (blok 128, Lagrange naar
  de DAW-rate). Goed genoeg voor een hele patch, of per patch één keer
  resamplen aan de rand?
- Waar wasm2c op de Mac en Windows vandaan komt (wabt bouwen of een
  release), en of de gegenereerde C in de CMake-build past.
- Licenties per module vóór verkoop (zie plugin.md).
