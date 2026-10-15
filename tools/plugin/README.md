# Modules als audioplugin

MMB-modules als VST3 (en AU op de Mac) plus een Standalone-programma, met
JUCE, op dezelfde kern als de Teensy en de simulator
(`firmware/lib/mmb-dsp`). De bediening is het editorpaneel (ModulePanel) in
een webview; de parameters komen uit datzelfde paneel. Achtergrond en
metingen: [doc/plans/plugin.md](../../doc/plans/plugin.md).

Modules nu: **HALL** (effect) en **SID** (instrument, MIDI → stemmen).

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
Build Tools 2022):

```
cmake -S tools/plugin -B <bouwmap> -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=<ergens>/JUCE
cmake --build <bouwmap> --target MmbHall_VST3 MmbHall_Standalone MmbSid_VST3 MmbSid_Standalone MmbPluginCheck
```

Na een wijziging aan een paneel of aan `plugin-ui/`: opnieuw bundelen én de
plugins opnieuw bouwen (de pagina zit als binary data in elke plugin).

De bouwsels staan in `<bouwmap>/Mmb<Module>_artefacts/Release/` (VST3 en
Standalone) en `<bouwmap>/MmbPluginCheck_artefacts/Release/`. De VST3 hoort
in `%LOCALAPPDATA%\Programs\Common\VST3` (gebruikersmap, geen beheerder
nodig); elke DAW zoekt daar.

## Bouwen (Mac)

Zelfde project; JUCE maakt dan ook een AU (voor Logic). Nodig: Xcode (of de
Command Line Tools), CMake en Node (`brew install cmake node`), de
JUCE-clone als hierboven; geen WebView2-stap (de webview is WebKit).

```
cd editor && MMB_JUCE_DIR=<ergens>/JUCE npm run build:plugin-ui
cmake -S tools/plugin -B build-mac -G Xcode -DMMB_JUCE_DIR=<ergens>/JUCE
cmake --build build-mac --config Release --target MmbHall_All MmbSid_All MmbPluginCheck
```

Lokaal gebouwd laadt zonder handtekening (Gatekeeper let op downloads). AU's
horen in `~/Library/Audio/Plug-Ins/Components`, VST3 in
`~/Library/Audio/Plug-Ins/VST3`; Logic ziet alleen AU, Reaper beide. Nog
niet gedaan: eerste keer op een Mac proberen (doc/plans/plugin.md).

## Een nieuwe module

1. `editor/package.json`: het typeId toevoegen aan `build:plugin-ui`.
2. `src/<Naam>Plugin.cpp`: een `MmbProcessor` met `applyControl` (de
   vertaling uit de wasm-gastheer `tools/mmb-wasm/<naam>_wasm.cc`),
   `prepare` en `render`; voor een instrument de stemverdeler van SidPlugin.
3. `CMakeLists.txt`: één regel `mmb_add_module(...)`.

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

De bediening testen zonder DAW:

```
mmb-plugin-check "<pad>\MMB HALL.vst3" x.wav 1 decay=7 editor=12 poke=decay:20
```

opent het paneel 12 s (zoals een DAW), zet halverwege Decay op 20 vanuit de
gastheer, en print de parameters ervoor en erna. Wat de pagina ontvangt staat
als `[ui] …`-regels in de uitvoer (native functie `mmbLog`). Draai aan een
knop in het paneel en zie de parameter erna veranderd.
