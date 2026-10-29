# Modules als audioplugin

MMB-modules als VST3 (en AU op de Mac) plus een Standalone-programma, met
JUCE, op dezelfde kern als de Teensy en de simulator
(`firmware/lib/mmb-dsp`). De bediening is het editorpaneel (ModulePanel) in
een webview; de parameters komen uit datzelfde paneel. Achtergrond en
metingen: [doc/plans/plugin.md](../../doc/plans/plugin.md).

Modules nu: **75** — de hele bibliotheek behalve CV-modules, mixers,
MIDI-IN, ZANG, DX7 en de trigger-modules. SAMPLER en TAPE STRIP laden een
`.mmbs`: de Bank-knop uit de bankmap, of een eigen bank die in het project
blijft (zie "Banken" hieronder). HALL en SID zijn handgeschreven; de rest genereert
`pluginParams.ts --all`: op de uniforme kern-interface via `KernelPlugin.h`
(eigen instantie per exemplaar), anders via `W2cPlugin.h`: de `.wasm` van de
simulator (`editor/public/wasm`) door wasm2c als C, met een eigen instantie
per exemplaar en bit voor bit dezelfde uitkomst als native. `AbiPlugin.h`
(de gastheer native, één exemplaar per DAW-proces) blijft beschikbaar met
`MMB_PLUGIN_NATIVE=1` bij `build:plugin-ui`; `HostProcessor.h` is voor
beide dezelfde. Noten: `NoteMap.h`;
CV-ingangen zijn parameters.

## wasm2c (wabt)

De gastheer-plugins hebben wasm2c nodig (een keer bouwen):

```sh
git clone --depth 1 --recursive --shallow-submodules https://github.com/WebAssembly/wabt.git ~/src/wabt
cmake -S ~/src/wabt -B ~/src/wabt/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=OFF -DBUILD_LIBWASM=OFF
ninja -C ~/src/wabt/build wasm2c
```

Daarna `-DMMB_WABT_DIR=~/src/wabt` bij de configure. CMake draait per module
`wasm2c/gen_w2c.py` (wasm2c plus `mod_glue.h`: optionele exports en lege
WASI-functies) in de bouwmap; een nieuwe `.wasm` in `editor/public/wasm`
bouwt de plugin vanzelf opnieuw. De plugin is dus zo actueel als de `.wasm`
van de simulator. `MmbPluginCheck ... instances=2` controleert dat twee
exemplaren naast elkaar hetzelfde geven.

## Opbouw

- `src/MmbParamSpec.h`, `src/MmbPluginBase.h`: de romp. Parameters uit een
  gegenereerde `ModuleSpec`, toestand, en de webview-editor met JUCE's relays
  (slider/combo/toggle per paneelknop). Een module levert `applyControl`
  (id → kern), `prepare` en `render`.
- `src/HallPlugin.cpp`, `src/SidPlugin.cpp`: de modules. SID heeft een kleine
  stemverdeler (noot → cel, chips × 3), zoals MIDI-IN in de editor.
- `editor/scripts/pluginParams.ts`: paneel → `generated/<typeId>_params.h`
  (id, naam, soort, bereik, standaard, stap, taper, standen).
- `editor/src/plugin-ui/`: de pagina (React, ModulePanel + `juceBridge.ts`),
  gebundeld naar `web/`. `?type=<typeId>` kiest het paneel.
- `src/PluginCheck.cpp` + `check_ir.py`: controle zonder DAW (hieronder).
- `web/` en `generated/` staan niet in git; JUCE ook niet.

## Bouwen (Windows)

Eén keer JUCE:

```
git clone --depth 1 --branch 8.0.4 https://github.com/juce-framework/JUCE <ergens>/JUCE
```

(Stopt de checkout halverwege op lange paden: `git config core.longpaths
true` en `git reset --hard HEAD` in die map.) Eén keer het WebView2-pakket
(PowerShell; JUCE zoekt het in de NuGet-map van de gebruiker):

```
Register-PackageSource -provider NuGet -name nugetRepository -location https://www.nuget.org/api/v2
Install-Package Microsoft.Web.WebView2 -Scope CurrentUser -RequiredVersion 1.0.1901.177 -Source nugetRepository
```

Dan de parameterlijsten en de bediening (in `editor/`, na `npm install`):

```
MMB_JUCE_DIR=<ergens>/JUCE npm run build:plugin-ui      # → tools/plugin/generated/ en web/
```

en de plugins, vanuit een "x64 Native Tools"-prompt (`vcvars64.bat` van de
Build Tools 2022), met **clang-cl** (LLVM; MSVC struikelt over de
GCC-extensies in de Mutable- en STK-code):

```
cmake -S tools/plugin -B <bouwmap> -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=<ergens>/JUCE -DMMB_WABT_DIR=<ergens>/wabt -DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl
cmake --build <bouwmap>        # alle modules (VST3 + Standalone) en mmb-plugin-check; eerste keer lang
```

Alleen VST3's: de doelen `Mmb<Module>_VST3` (de lijst staat in
`generated/modules.cmake`).

Na een wijziging aan een paneel of aan `plugin-ui/`: opnieuw bundelen én de
plugins opnieuw bouwen (de pagina zit als binary data in elke plugin).

De bouwsels staan in `<bouwmap>/Mmb<Module>_artefacts/Release/` (VST3 en
Standalone) en `<bouwmap>/MmbPluginCheck_artefacts/Release/`. De VST3 hoort
in `%LOCALAPPDATA%\Programs\Common\VST3` (gebruikersmap, geen beheerder
nodig); elke DAW zoekt daar.

## Bouwen (Mac)

Zelfde project; JUCE maakt dan ook een AU (voor Logic). Xcode is niet nodig:
de Command Line Tools volstaan, ook voor de AU, met Ninja als generator.
CMake en Ninja kunnen uit pip komen als Homebrew er niet is. Node is ook
nodig, en de JUCE-clone als hierboven. Er is geen WebView2-stap, want de
webview is WebKit.

```
python3 -m venv ~/src/buildtools && ~/src/buildtools/bin/pip install cmake ninja
export PATH=~/src/buildtools/bin:$PATH
cd editor && MMB_JUCE_DIR=~/src/JUCE npm run build:plugin-ui && cd ..
cmake -S tools/plugin -B build-mac -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=$HOME/src/JUCE -DMMB_WABT_DIR=$HOME/src/wabt -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0 -DCMAKE_OSX_ARCHITECTURES=x86_64
cmake --build build-mac --target MmbHall_All MmbSid_All MmbPluginCheck
```

Let op: na de configure staan er voor alle modules al lege bundelmappen. Een
module is pas gebouwd als `Contents/MacOS/` een bestand bevat. Het
controleprogramma heet hier `build-mac/MmbPluginCheck_artefacts/Release/MmbPluginCheck`
en laadt alleen VST3.

Lokaal gebouwd laadt zonder handtekening (Gatekeeper let op downloads). AU's
horen in `~/Library/Audio/Plug-Ins/Components`, VST3 in
`~/Library/Audio/Plug-Ins/VST3`; Logic ziet alleen AU, Reaper beide. Daarna
`killall -9 AudioComponentRegistrar` en `auval -v aufx Hall Mmbr`.
Uitkomst van de eerste Mac-build: doc/plans/plugin.md §2e.

## Patch-plugins

Een hele patch als één plugin (`PatchEngine.h`, `PatchPlugin.h`): in
`editor/` schrijft `npx tsx scripts/pluginPatches.ts` de bronnen
(`generated/*_patch_plugin.cpp`, `patches.cmake`) voor de seeds in de lijst
`PATCHES`. De parameters zijn de knoppen van het eerste front. Controleren:
`MmbPluginCheck "<plugin>.vst3" uit.wav 4 notes=48,55,60,64 press=127`
(aftertouch) of `cc=1:127` (modwheel).

## Testen

`tools/plugin/test/`:
- `render_all.sh <bouwmap> <uitmap>` rendert elke gastheer-plugin met twee
  exemplaren;
- `compare_wav.py a.wav b.wav` geeft het verschil en de SNR;
- `make_test_wav.py` maakt het testsignaal.

Op Windows is `python3` vaak de WindowsApps-stub: geef de echte python mee
met `-DPython3_EXECUTABLE=<pad naar python.exe>`.

## Banken

SAMPLER en TAPE STRIP spelen uit een `.mmbs`. De Bank-knop (0–15) kiest
zoals op de Teensy een bestand uit de bankmap, via `defaults` in
`index.json`:

- Mac: `~/Library/Application Support/MusicBrain/banks`
- Windows: `%APPDATA%\MusicBrain\banks`

Vullen: de inhoud van `editor/public/banks` (de `.mmbs`-bestanden en
`index.json`) daarheen kopiëren. "Eigen…" in de balk onder het paneel kiest
een losse `.mmbs`; die gaat mee in het project. Controleren zonder DAW:
`MmbPluginCheck <vst3> uit.wav 3 bank=3 notes=48,60` of
`ownbank=<pad naar .mmbs>`.

## Een nieuwe module

Een module met een wasm-gastheer en een regel in `tools/mmb-wasm/build.sh`
is automatisch een plugin (`pluginParams.ts --all`). Op de uniforme
kern-interface (`MMB_KERNEL_HOST`) krijgt hij `KernelPlugin.h`, anders
`AbiPlugin.h`. Uitsluiten of als instrument-zonder-gate markeren: de
lijsten `EXCLUDE` en `SYNTH_OVERRIDE` in `pluginParams.ts`.

Handgeschreven (eigen MIDI- of kernvertaling, zoals HALL en SID):
`src/<Naam>Plugin.cpp` met `applyControl`, `prepare`, `render`; één regel
`mmb_add_module(...)` in `CMakeLists.txt`; het typeId in `MANUAL`.

## Controle zonder DAW

```
mmb-plugin-check "<pad>\MMB HALL.vst3" ir.wav 7 mix=1 early=0 pre=0 decay=3
python tools/plugin/check_ir.py ir.wav
```

Parameters op naam zoals het paneel ze toont, zonder spaties en in kleine
letters (`hidamp`, `pre`, `diff`; `lo` voor "Lo ×"); een keuze met zijn naam
(`"algo=Random"`). De meting hoort overeen te komen met
`editor/src/modular-mb/sim/wasmHall.test.ts`.

Een instrument krijgt noten (de eerste helft aan):

```
mmb-plugin-check "<pad>\MMB SID.vst3" akkoord.wav 3 notes=60,64,67
```

Een eigen opname door een effect (de staart komt erachteraan), om in VLC te
beluisteren:

```
mmb-plugin-check "<pad>\MMB HALL.vst3" uit.wav 4 "in=<opname>.wav" decay=3.2 pre=30 mix=0.4
```

Fabriekspresets: het controleprogramma toont de programma's van een plugin
en kiest er een met `program=<n>` (vóór de losse parameters):

```
mmb-plugin-check "<pad>\MMB HALL.vst3" ir.wav 7 program=3 mix=1 early=0
```

De bediening testen zonder DAW:

```
mmb-plugin-check "<pad>\MMB HALL.vst3" x.wav 1 decay=7 editor=12 poke=decay:20
```

opent het paneel 12 s (zoals een DAW), zet halverwege Decay op 20 vanuit de
gastheer, en print de parameters ervoor en erna. Wat de pagina ontvangt staat
als `[ui] …`-regels in de uitvoer (native functie `mmbLog`). Draai aan een
knop in het paneel en zie de parameter erna veranderd.
